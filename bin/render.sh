#!/usr/bin/env bash
# Renders one LaTeX math body (stdin) to a transparent PNG sized to whole terminal cells.
# usage: render.sh <cache-dir> <key> <foreground-rrggbb> [display|inline]
# stdout: "<columns> <rows>"; the PNG is <cache-dir>/<key>.png. A failure prints the TeX error and exits 1.
# A display formula takes the rows it needs. An inline formula takes one row, with its baseline on the text's.
set -euo pipefail

cache=$1 key=$2 fg=$3 mode=${4:-display}
png=$cache/$key.png cells=$cache/$key.cells

if [[ -s $png && -s $cells ]]; then
  cat "$cells"
  exit 0
fi

# One cell is CELL_W x CELL_H pixels of the picture; the terminal scales that to its real cell.
# 262 dpi makes 11pt of TeX one row tall, so 10pt math has the x-height of the terminal's text.
# BASELINE is where a monospace font puts its baseline in the cell, in pixels from the top.
CELL_W=20 CELL_H=40 DPI=262 PAD_Y=4 BASELINE=31

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$cache"

{
  printf '%s\n' '\documentclass[10pt,fleqn]{article}' \
    '\usepackage{amsmath,amssymb,mathtools,bm}' \
    '\setlength{\mathindent}{0pt}\pagestyle{empty}' \
    '\makeatletter\renewcommand{\tagform@}[1]{}\makeatother'
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

# macOS has no timeout unless coreutils is installed, and then it is gtimeout.
limit=$(command -v timeout || command -v gtimeout || true)
if ! (cd "$work" && openin_any=p openout_any=p ${limit:+"$limit" 20} \
  latex -no-shell-escape -interaction=nonstopmode -halt-on-error f.tex >/dev/null 2>&1); then
  { grep -m1 -A1 '^!' "$work/f.log" 2>/dev/null || echo 'latex did not run'; } | tr '\n' ' ' >&2
  exit 1
fi

color=$(LC_ALL=C awk -v r=$((16#${fg:0:2})) -v g=$((16#${fg:2:2})) -v b=$((16#${fg:4:2})) \
  'BEGIN { printf "rgb %.3f %.3f %.3f", r / 255, g / 255, b / 255 }')
if ! dvipng -D "$DPI" -T tight --depth --height --truecolor -bg Transparent -fg "$color" \
  -o "$work/f.png" "$work/f.dvi" >"$work/dvipng.log" 2>&1; then
  head -c 300 "$work/dvipng.log" >&2
  exit 1
fi

read -r w h < <(magick identify -format '%w %h\n' "$work/f.png")
if [[ $mode == inline ]]; then
  [[ $(<"$work/dvipng.log") =~ depth=([0-9]+)\ height=([0-9]+) ]] || { echo 'dvipng reported no baseline' >&2; exit 1; }
  depth=${BASH_REMATCH[1]} height=${BASH_REMATCH[2]}
  # A formula taller than the row is scaled to fit it. The baseline moves off the text's only when
  # the part above or below it needs more room than the font leaves there. A width up to 4 pixels
  # over whole cells is squeezed into them, so a single letter takes one cell and not two.
  read -r percent columns x y < <(LC_ALL=C awk -v w="$w" -v h="$height" -v d="$depth" \
    -v cw=$CELL_W -v ch=$CELL_H -v base=$BASELINE 'BEGIN {
      s = (h + d > ch) ? ch / (h + d) : 1
      hs = h * s; ds = d * s; ws = int(w * s + 0.5); if (ws < 1) ws = 1
      b = base; if (b > ch - ds) b = ch - ds; if (b < hs) b = hs
      c = int((ws + cw - 1 - 4) / cw); if (c < 1) c = 1
      if (ws > c * cw) { s = s * c * cw / ws; hs = h * s; ws = c * cw }
      printf "%.2f %d %d %d\n", s * 100, c, int((c * cw - ws) / 2), int(b - hs + 0.5)
    }')
  rows=1
  magick "$work/f.png" -resize "$percent%" -background none -gravity northwest \
    -extent "$((columns * CELL_W))x${CELL_H}-${x}-${y}" "PNG32:$work/padded.png"
else
  columns=$(((w + CELL_W - 1) / CELL_W))
  rows=$(((h + 2 * PAD_Y + CELL_H - 1) / CELL_H))
  magick "$work/f.png" -background none -gravity west \
    -extent "$((columns * CELL_W))x$((rows * CELL_H))" "PNG32:$work/padded.png"
fi

# Both files land by rename, so a reader never sees half of one.
echo "$columns $rows" >"$work/f.cells"
mv "$work/padded.png" "$png"
mv "$work/f.cells" "$cells"
echo "$columns $rows"
