#!/usr/bin/env bash
# Renders one LaTeX math body (stdin) to a transparent PNG sized to whole terminal cells.
# usage: render.sh <cache-dir> <stem> <foreground-rrggbb> [display|inline] [scale]
#        render.sh --check
#        render.sh --preamble
# stdout: "<columns> <rows>"; the PNG is <cache-dir>/<stem>.png. A failure prints the TeX error and exits 1.
# A display formula takes the rows it needs, at scale times the default size (0.5 to 2). An inline
# formula takes one row, with its baseline on the text's.
# --check prints the tools and LaTeX packages that are missing, and exits 1 when any are.
# --preamble prints the LaTeX preamble of every formula, for tools/commands.py.
#
# The formula is not checked here. LaTeX can read any file the user can, so the caller must pass only
# formulas made of known math commands: hooks/guard.ts does that for the mod.
# LATEX_MATH_RESOLUTION multiplies the pixels in a cell (default 1); the demo renders at 2.4.
set -euo pipefail

# hooks/guard.ts checks a formula against these packages only: it reads backslash commands and ^^.
# A package that makes another character active or a superscript would need a check there too.
preamble() {
  printf '%s\n' '\documentclass[10pt,fleqn]{article}' \
    '\usepackage{amsmath,amssymb,mathtools,bm}' \
    '\setlength{\mathindent}{0pt}\pagestyle{empty}' \
    '\makeatletter\renewcommand{\tagform@}[1]{}\makeatother'
}

if [[ ${1-} == --preamble ]]; then
  preamble
  exit 0
fi

if [[ ${1-} == --check ]]; then
  missing=''
  command -v latex >/dev/null 2>&1 || missing="$missing latex"
  command -v dvipng >/dev/null 2>&1 || missing="$missing dvipng"
  command -v kpsewhich >/dev/null 2>&1 || missing="$missing kpsewhich"
  if ! command -v magick >/dev/null 2>&1 &&
    ! { command -v convert >/dev/null 2>&1 && command -v identify >/dev/null 2>&1; }; then
    missing="$missing magick"
  fi
  if command -v kpsewhich >/dev/null 2>&1; then
    for package in amsmath amssymb mathtools bm preview; do
      [[ -n $(kpsewhich "$package.sty") ]] || missing="$missing $package.sty"
    done
  fi
  echo "${missing# }"
  [[ -z $missing ]] && exit 0
  exit 1
fi

cache=$1 stem=$2 fg=$3 mode=${4:-display} scale=${5:-1}
[[ $fg =~ ^[0-9a-fA-F]{6}$ ]] || { echo "not a colour: $fg" >&2; exit 2; }
[[ $scale =~ ^[0-9]+([.][0-9]+)?$ ]] || scale=1
res=${LATEX_MATH_RESOLUTION:-1}
[[ $res =~ ^[0-9]+([.][0-9]+)?$ ]] || res=1
png=$cache/$stem.png cells=$cache/$stem.cells

if [[ -s $png && -s $cells ]]; then
  # The cache drops the least recently used pictures first, so a hit counts as a use.
  touch "$png" "$cells" 2>/dev/null || true
  cat "$cells"
  exit 0
fi

# ImageMagick 7 is one command, magick. ImageMagick 6, as Debian and Ubuntu ship it, is convert and identify.
if command -v magick >/dev/null 2>&1; then
  convert() { magick "$@"; }
  identify() { magick identify "$@"; }
fi

# One cell is CELL_W x CELL_H pixels of the picture; the terminal scales that to its real cell.
# 262 dpi makes 11pt of TeX one row tall, so 10pt math has the x-height of the terminal's text.
# BASELINE is where a monospace font puts its baseline in the cell, in pixels from the top.
# SQUEEZE is how many pixels over whole cells an inline formula is pressed into them.
read -r CELL_W CELL_H DPI PAD_Y BASELINE SQUEEZE < <(LC_ALL=C awk -v r="$res" -v s="$scale" -v m="$mode" 'BEGIN {
  z = (m == "display") ? s : 1; if (z < 0.5) z = 0.5; if (z > 2) z = 2
  printf "%d %d %d %d %d %d\n", 20 * r + 0.5, 40 * r + 0.5, 262 * r * z + 0.5, 4 * r + 0.5, 31 * r + 0.5, 4 * r + 0.5
}')

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$cache"

{
  preamble
  if [[ $mode == inline ]]; then
    # preview's tight page is what lets dvipng report the formula's height and depth.
    printf '%s\n' '\usepackage[active,tightpage]{preview}\setlength{\PreviewBorder}{0pt}' \
      '\begin{document}\begin{preview}'
    cat
    printf '%s\n' '\end{preview}\end{document}'
  else
    printf '%s\n' '\begin{document}'
    cat
    printf '\n%s\n' '\end{document}'
  fi
} >"$work/f.tex"

# A formula that never ends is stopped after 20 seconds. macOS has no timeout unless coreutils is
# installed, and then it is gtimeout.
if command -v timeout >/dev/null 2>&1; then
  run_latex() { timeout 20 latex "$@"; }
  run_dvipng() { timeout 20 dvipng "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then
  run_latex() { gtimeout 20 latex "$@"; }
  run_dvipng() { gtimeout 20 dvipng "$@"; }
else
  run_latex() { latex "$@"; }
  run_dvipng() { dvipng "$@"; }
fi

# No shell escape, and writes only in the work folder. openin_any limits reads only before
# TeX Live 2026, where it became a no-op.
if ! (cd "$work" && export openin_any=p openout_any=p &&
  run_latex -no-shell-escape -interaction=nonstopmode -halt-on-error f.tex >/dev/null 2>&1); then
  { grep -m1 -A1 '^!' "$work/f.log" 2>/dev/null || echo 'latex did not run'; } | tr '\n' ' ' >&2
  exit 1
fi

color=$(LC_ALL=C awk -v r=$((16#${fg:0:2})) -v g=$((16#${fg:2:2})) -v b=$((16#${fg:4:2})) \
  'BEGIN { printf "rgb %.3f %.3f %.3f", r / 255, g / 255, b / 255 }')
if ! run_dvipng -D "$DPI" -T tight --depth --height --truecolor --nogs -bg Transparent -fg "$color" \
  -o "$work/f.png" "$work/f.dvi" >"$work/dvipng.log" 2>&1; then
  head -c 300 "$work/dvipng.log" >&2
  exit 1
fi

read -r w h < <(identify -format '%w %h\n' "$work/f.png")
# 255 cells is the most the terminal draws in either direction.
if ((w > 255 * CELL_W || h > 255 * CELL_H)); then
  echo "the formula is too large: $w x $h pixels" >&2
  exit 1
fi
if [[ $mode == inline ]]; then
  [[ $(<"$work/dvipng.log") =~ depth=([0-9]+)\ height=([0-9]+) ]] || { echo 'dvipng reported no baseline' >&2; exit 1; }
  depth=${BASH_REMATCH[1]} height=${BASH_REMATCH[2]}
  # A formula taller than the row is scaled to fit it. The baseline moves off the text's only when
  # the part above or below it needs more room than the font leaves there. A width up to SQUEEZE
  # pixels over whole cells is pressed into them, so a single letter takes one cell and not two.
  read -r percent columns x y < <(LC_ALL=C awk -v w="$w" -v h="$height" -v d="$depth" \
    -v cw="$CELL_W" -v ch="$CELL_H" -v base="$BASELINE" -v squeeze="$SQUEEZE" 'BEGIN {
      s = (h + d > ch) ? ch / (h + d) : 1
      hs = h * s; ds = d * s; ws = int(w * s + 0.5); if (ws < 1) ws = 1
      b = base; if (b > ch - ds) b = ch - ds; if (b < hs) b = hs
      c = int((ws + cw - 1 - squeeze) / cw); if (c < 1) c = 1
      if (ws > c * cw) { s = s * c * cw / ws; hs = h * s; ws = c * cw }
      printf "%.2f %d %d %d\n", s * 100, c, int((c * cw - ws) / 2), int(b - hs + 0.5)
    }')
  rows=1
  convert "$work/f.png" -resize "$percent%" -background none -gravity northwest \
    -extent "$((columns * CELL_W))x${CELL_H}-${x}-${y}" "PNG32:$work/padded.png"
else
  columns=$(((w + CELL_W - 1) / CELL_W))
  rows=$(((h + 2 * PAD_Y + CELL_H - 1) / CELL_H))
  convert "$work/f.png" -background none -gravity west \
    -extent "$((columns * CELL_W))x$((rows * CELL_H))" "PNG32:$work/padded.png"
fi

# Both files land by rename, so a reader never sees half of one.
echo "$columns $rows" >"$work/f.cells"
mv "$work/padded.png" "$png"
mv "$work/f.cells" "$cells"
echo "$columns $rows"
