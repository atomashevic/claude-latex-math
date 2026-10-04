#!/usr/bin/env bash
# Encodes build/master.mkv (written by make_demo.py) into the files to post.
# out/latex-math-demo.mp4: 1920x1080, 50 fps, H.264 High, for X and other video players.
# out/latex-math-demo.gif: 1152x648, 20 fps, one palette, under the 15 MB GIF limit of X.
# out/readme.gif: 720x405, 12 fps, under the 5 MiB file limit of the plugin directory, for the README.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out

ffmpeg -v error -y -i build/master.mkv -c:v libx264 -preset slow -crf 16 -tune animation \
  -pix_fmt yuv420p -profile:v high -movflags +faststart -an out/latex-math-demo.mp4

ffmpeg -v error -y -i build/master.mkv -vf \
  "fps=${GIF_FPS:-20},scale=${GIF_WIDTH:-1152}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=${GIF_DITHER:-sierra2_4a}:diff_mode=rectangle" \
  -loop 0 out/latex-math-demo.gif

ffmpeg -v error -y -i build/master.mkv -vf \
  "fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -loop 0 out/readme.gif

ls -la out
