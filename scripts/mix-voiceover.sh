#!/usr/bin/env bash
# mix-voiceover.sh · Mix voiceover (人聲主軌) + optional BGM into an MP4
#
# Usage:
#   bash mix-voiceover.sh <video.mp4> --voiceover=<voice.mp3> [options]
#
# Required:
#   --voiceover=<path>    Path to voiceover mp3 (人聲主軌, 來自 narrate-pipeline.mjs)
#
# Optional:
#   --bgm=<path>          BGM mp3 path (overrides --bgm-mood)
#   --bgm-mood=<name>     Pick a preset BGM from assets/ (educational / tech / tutorial / ...)
#   --bgm-volume=<0-1>    BGM 靜態音量, 預設 0.18 (相對人聲)
#   --no-ducking          關閉 sidechain ducking（預設開啟：人聲響時 BGM 自動讓路）
#   --voice-volume=<0-2>  人聲音量倍率, 預設 1.0
#   --out=<path>          輸出路徑, 預設 <input>-voiced.mp4
#
# Behavior:
#   - 影片流 stream copy（不重編碼，快）
#   - 人聲始終是主軌，必帶；BGM 可選
#   - 預設開 ducking：人聲響時 BGM 壓到約 -10dB，人聲停時回升
#   - 輸出長度 = 影片長度（人聲/BGM 較短就尾靜音；較長就截斷）
#
# Examples:
#   bash mix-voiceover.sh anim.mp4 --voiceover=narration/voiceover.mp3
#   bash mix-voiceover.sh anim.mp4 --voiceover=v.mp3 --bgm-mood=educational
#   bash mix-voiceover.sh anim.mp4 --voiceover=v.mp3 --bgm=~/Music/song.mp3 --bgm-volume=0.12
#   bash mix-voiceover.sh anim.mp4 --voiceover=v.mp3 --bgm-mood=tech --no-ducking
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets"

INPUT=""
VOICEOVER=""
BGM=""
BGM_MOOD=""
BGM_VOLUME="0.18"
VOICE_VOLUME="1.0"
DUCKING="1"
OUTPUT=""

for arg in "$@"; do
  case "$arg" in
    --voiceover=*)    VOICEOVER="${arg#*=}" ;;
    --bgm=*)          BGM="${arg#*=}" ;;
    --bgm-mood=*)     BGM_MOOD="${arg#*=}" ;;
    --bgm-volume=*)   BGM_VOLUME="${arg#*=}" ;;
    --voice-volume=*) VOICE_VOLUME="${arg#*=}" ;;
    --no-ducking)     DUCKING="0" ;;
    --out=*)          OUTPUT="${arg#*=}" ;;
    -*)               echo "未知引數：$arg" >&2; exit 1 ;;
    *)                INPUT="$arg" ;;
  esac
done

if [ -z "$INPUT" ] || [ ! -f "$INPUT" ]; then
  echo "Usage: bash mix-voiceover.sh <video.mp4> --voiceover=<v.mp3> [--bgm=<b.mp3> | --bgm-mood=<name>]" >&2
  exit 1
fi
if [ -z "$VOICEOVER" ] || [ ! -f "$VOICEOVER" ]; then
  echo "✗ 缺 --voiceover=<path>" >&2
  exit 1
fi

# 解析 BGM 來源
if [ -z "$BGM" ] && [ -n "$BGM_MOOD" ]; then
  BGM="$ASSETS_DIR/bgm-${BGM_MOOD}.mp3"
fi
if [ -n "$BGM" ] && [ ! -f "$BGM" ]; then
  echo "✗ BGM 檔案不存在: $BGM" >&2
  echo "  可用 mood: $(ls "$ASSETS_DIR" 2>/dev/null | grep -E '^bgm-.*\.mp3$' | sed 's/^bgm-//;s/\.mp3$//' | tr '\n' ' ')" >&2
  exit 1
fi

# 輸出路徑
if [ -z "$OUTPUT" ]; then
  base="${INPUT%.*}"
  OUTPUT="${base}-voiced.mp4"
fi

echo "─ mix-voiceover ──────────────"
echo "  影片:     $INPUT"
echo "  人聲:     $VOICEOVER (vol=$VOICE_VOLUME)"
if [ -n "$BGM" ]; then
  echo "  BGM:      $BGM (vol=$BGM_VOLUME, ducking=$DUCKING)"
else
  echo "  BGM:      （無）"
fi
echo "  輸出:     $OUTPUT"
echo "──────────────────────────────"

# ── ffmpeg filter graph ─────────────────────────────────────
if [ -z "$BGM" ]; then
  # 僅人聲
  ffmpeg -y -i "$INPUT" -i "$VOICEOVER" \
    -filter_complex "[1:a]volume=${VOICE_VOLUME}[a]" \
    -map 0:v -map "[a]" \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$OUTPUT"
elif [ "$DUCKING" = "1" ]; then
  # 人聲 + BGM + sidechain ducking
  ffmpeg -y -i "$INPUT" -i "$VOICEOVER" -i "$BGM" \
    -filter_complex "
      [1:a]volume=${VOICE_VOLUME}[voice];
      [2:a]volume=${BGM_VOLUME},aloop=loop=-1:size=2e9[bgm_lo];
      [bgm_lo][voice]sidechaincompress=threshold=0.04:ratio=8:attack=5:release=300:makeup=1[bgm_ducked];
      [voice][bgm_ducked]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=0:d=0.5:curve=tri[a]
    " \
    -map 0:v -map "[a]" \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$OUTPUT"
else
  # 人聲 + BGM 靜態混合
  ffmpeg -y -i "$INPUT" -i "$VOICEOVER" -i "$BGM" \
    -filter_complex "
      [1:a]volume=${VOICE_VOLUME}[voice];
      [2:a]volume=${BGM_VOLUME},aloop=loop=-1:size=2e9[bgm];
      [voice][bgm]amix=inputs=2:duration=first:dropout_transition=0[a]
    " \
    -map 0:v -map "[a]" \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$OUTPUT"
fi

echo "✓ 完成：$OUTPUT"
