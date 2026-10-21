#!/bin/sh
# A 1080×1080 cut for social feeds: the film, letterboxed over a soft, blurred copy of itself.
# Needs ffmpeg. Run after `npm run render:60` (or `npm run render`).
set -e
cd "$(dirname "$0")/.."
in=out/daybloom-promo.mp4
out=out/daybloom-promo-square.mp4
ffmpeg -y -hide_banner -loglevel error -i "$in" -filter_complex \
  "[0:v]scale=-2:1080,crop=1080:1080,boxblur=28:2,eq=brightness=-0.06:saturation=1.1[bg];[0:v]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p[v]" \
  -map "[v]" -map 0:a -c:v libx264 -preset slow -crf 18 -c:a copy -movflags +faststart "$out"
echo "$out"
