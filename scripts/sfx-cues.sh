#!/bin/bash
# sfx-cues.sh — 按cue表給無聲影片打SFX點（B00階躍b-roll實戰沉澱，2026-07-17）
#
# 用法：bash sfx-cues.sh <無聲影片.mp4> <cue表.tsv> <輸出.mp4> [--dur=秒]
#
# cue表格式（TSV，#開頭為註釋）：
#   秒數<TAB>sfx相對路徑（相對assets/sfx/）<TAB>音量dB
#   例：63.0	impact/brand-stamp.mp3	-13
#
# 音量基準（輕SFX墊口播下）：whoosh類-16 / tick類-15 / impact類-12；純動畫成品可整體+4dB
# cue密度參考 audio-design-rules.md 配方（b-roll墊底≈1個/9s，只打結構性節點）

set -e
SFX_DIR="$(cd "$(dirname "$0")/../assets/sfx" && pwd)"
IN="${1:?用法: bash sfx-cues.sh in.mp4 cues.tsv out.mp4 [--dur=210]}"
TABLE="${2:?缺cue表}"
OUT="${3:?缺輸出路徑}"
DUR=""
for a in "$@"; do case "$a" in --dur=*) DUR="${a#*=}";; esac; done
[ -z "$DUR" ] && DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN" | cut -d. -f1)
[[ "$DUR" =~ ^([0-9]+([.][0-9]*)?|[.][0-9]+)$ ]] || { echo "✗ --dur 必須是非負數字: $DUR" >&2; exit 1; }

INPUTS=(-i "$IN")
FILTER=""; MIX=""; i=1; line_no=0
while IFS=$'\t' read -r t f db; do
  line_no=$((line_no+1))
  db="${db%$'\r'}"
  [ -z "$t" ] && continue
  case "$t" in \#*) continue;; esac
  [[ "$t" =~ ^([0-9]+([.][0-9]*)?|[.][0-9]+)$ ]] || { echo "✗ cue 表第 ${line_no} 行時間必須是非負數字" >&2; exit 1; }
  [[ "$db" =~ ^-?([0-9]+([.][0-9]*)?|[.][0-9]+)$ ]] || { echo "✗ cue 表第 ${line_no} 行音量必須是數字" >&2; exit 1; }
  sfx_path=$(python3 -c 'import os, sys
base = os.path.realpath(sys.argv[1])
candidate = os.path.realpath(os.path.join(base, sys.argv[2]))
if os.path.commonpath((base, candidate)) != base:
    raise SystemExit(2)
print(candidate)' "$SFX_DIR" "$f") || { echo "✗ cue 表第 ${line_no} 行 SFX 路徑越界: $f" >&2; exit 1; }
  [ ! -f "$sfx_path" ] && { echo "✗ SFX不存在: $f" >&2; exit 1; }
  INPUTS+=(-i "$sfx_path")
  ms=$(python3 -c 'import sys; print(int(float(sys.argv[1]) * 1000))' "$t")
  FILTER+="[$i:a]adelay=${ms}:all=1,volume=${db}dB[s$i];"
  MIX+="[s$i]"
  i=$((i+1))
done < "$TABLE"
N=$((i-1))
[ "$N" = "0" ] && { echo "✗ cue表為空"; exit 1; }

ffmpeg -y -loglevel error "${INPUTS[@]}" \
  -filter_complex "${FILTER}${MIX}amix=inputs=${N}:normalize=0,apad=whole_dur=${DUR}[aout]" \
  -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo "✓ ${N}個cue → $OUT"
