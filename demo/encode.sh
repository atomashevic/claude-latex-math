#!/usr/bin/env bash
# Encodes build/master.mkv (written by make_demo.py) into the files to post.
# out/latex-math-demo.mp4: 1920x1080, 50 fps, H.264 High, for X and other video players.
# out/latex-math-demo.gif: 1280x720, 20 fps, under the 15 MB GIF limit of X.
# out/readme.gif: 720x405, 15 fps, under the 5 MiB file limit of the plugin directory, for the README.
# The GIFs have one palette of 64 colours and no dither: the frame is text on one flat colour, and
# dither would put noise on it and make the files larger.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out

ffmpeg -v error -y -i build/master.mkv -c:v libx264 -preset slow -crf 16 -tune animation \
  -pix_fmt yuv420p -profile:v high -movflags +faststart -an out/latex-math-demo.mp4

gif() {
  local file=$1 fps=$2 width=$3 limit=$4 bytes
  ffmpeg -v error -y -i build/master.mkv -vf \
    "fps=$fps,scale=$width:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    -loop 0 "$file"
  bytes=$(stat -c %s "$file")
  if ((bytes > limit)); then
    echo "$file has $bytes bytes, over the limit of $limit" >&2
    exit 1
  fi
}

gif out/latex-math-demo.gif "${GIF_FPS:-20}" "${GIF_WIDTH:-1280}" 15000000
gif out/readme.gif 15 720 5242880

ls -la out
