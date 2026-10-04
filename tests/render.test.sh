#!/usr/bin/env bash
# Runs bin/render.sh on real formulas and checks the pictures it writes.
# Needs what the renderer needs: latex, dvipng, ImageMagick, and the LaTeX packages render.sh --check lists.
set -euo pipefail
cd "$(dirname "$0")/.."
cache=$(mktemp -d)
trap 'rm -rf "$cache"' EXIT
failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

size() {
  if command -v magick >/dev/null 2>&1; then magick identify -format '%w %h' "$1"; else identify -format '%w %h' "$1"; fi
}

render() {
  printf '%s' "$1" | bin/render.sh "$cache" "$2" d8d8d8 "${3:-display}" "${4:-1}"
}

missing=$(bin/render.sh --check) || fail "render.sh --check reports missing: $missing"

read -r c r <<<"$(render '\[ e^{i\pi} + 1 = 0 \]' euler)"
[[ $(size "$cache/euler.png") == "$((c * 20)) $((r * 40))" ]] || fail "the display picture does not fill $c x $r cells"
((c >= 8 && c <= 10 && r == 2)) || fail "e^(i pi) + 1 = 0 takes $c x $r cells, not about 9 x 2"

read -r c2 r2 <<<"$(render '\[ e^{i\pi} + 1 = 0 \]' euler-2x display 2)"
((c2 >= 2 * c - 1 && r2 >= r)) || fail "scale 2 gives $c2 x $r2 cells for a formula of $c x $r"

read -r ci ri <<<"$(render '\(\sum_{j} \alpha_{ij} v_j\)' sum inline)"
((ri == 1 && ci >= 3 && ci <= 8)) || fail "an inline sum takes $ci x $ri cells, not 3 to 8 x 1"
[[ $(size "$cache/sum.png") == "$((ci * 20)) 40" ]] || fail "the inline picture is not one row of $ci cells"

read -r cx rx <<<"$(render '\(x\)' x inline)"
((cx == 1 && rx == 1)) || fail "a single letter takes $cx x $rx cells, not 1 x 1"

read -r ch rh <<<"$(printf '%s' '\(x\)' | LATEX_MATH_RESOLUTION=2 bin/render.sh "$cache" x-hires d8d8d8 inline)"
[[ $(size "$cache/x-hires.png") == "$((ch * 40)) $((rh * 80))" ]] || fail "resolution 2 does not double the cell"

touch -t 200001010000 "$cache/euler.png"
touch "$cache/now"
[[ $(render '\[ e^{i\pi} + 1 = 0 \]' euler) == "$c $r" ]] || fail "a cache hit prints another size"
[[ $cache/euler.png -ot $cache/now ]] && fail "a cache hit leaves the picture's time, so the cache would drop it first"

if error=$(render '\[ \frac{1}{ \]' broken 2>&1); then
  fail "an unclosed brace renders"
elif [[ $error != *'!'* ]]; then
  fail "an unclosed brace fails without the TeX error: $error"
fi

if printf '%s' '\(x\)' | bin/render.sh "$cache" bad 'red;rm' inline 2>/dev/null; then
  fail "a colour that is not six hex digits is accepted"
fi

if ((failures)); then
  echo "$failures render tests failed" >&2
  exit 1
fi
echo "render tests passed"
