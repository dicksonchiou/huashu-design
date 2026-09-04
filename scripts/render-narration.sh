#!/usr/bin/env bash
# render-narration.sh · 一條龍：HTML 解說動畫 → 最終 MP4（帶人聲）
#
# 流水線：
#   1. render-video.js  錄無聲 MP4（按 timeline.totalDuration）
#   2. mix-voiceover.sh 混入 voiceover.mp3（可選 BGM）
#   3. 輸出 <basename>-narrated.mp4
#
# Usage:
#   bash render-narration.sh <html> --timeline=<path> [options]
#
# Required:
#   <html>                解說動畫的 HTML（應內嵌 NarrationStage + recording 模式 rAF 自驅）
#   --timeline=<path>     已準備好的 timeline.json（自動讀 totalDuration 和 voiceover.mp3 路徑）
#
# Optional:
#   --bgm-mood=<name>     BGM 預設（educational / tech / tutorial / ...）
#   --bgm=<path>          自訂 BGM 檔案
#   --bgm-volume=<0-1>    BGM 靜態音量，預設 0.18
#   --no-ducking          關 sidechain ducking
#   --keep-silent         保留中間產物（無聲 MP4），便於 debug
#   --seek                用 render-video-seek.js 逐幀 seek 渲染（真 60fps·確定性·無黑幀）
#   --seek-fps=<n>        seek 渲染幀率，預設 60，需配合 --seek
#   --out=<path>          輸出路徑，預設 <html-basename>-narrated.mp4
#   --width=<px>          影片寬度（預設 1920）
#   --height=<px>         影片高度（預設 1080）
#   --allow-network       明確允許 HTML 載入遠端資源（預設阻擋）
#
# Examples:
#   bash render-narration.sh demo.html --timeline=_narration/timeline.json
#   bash render-narration.sh demo.html --timeline=_narration/timeline.json --bgm-mood=educational
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$SCRIPT_DIR/.."

HTML=""
TIMELINE=""
BGM_MOOD=""
BGM=""
BGM_VOLUME="0.18"
NO_DUCKING=""
KEEP_SILENT=""
USE_SEEK=""
SEEK_FPS="60"
OUT=""
WIDTH="1920"
HEIGHT="1080"
ALLOW_NETWORK=""

for arg in "$@"; do
  case "$arg" in
    --timeline=*)    TIMELINE="${arg#*=}" ;;
    --bgm-mood=*)    BGM_MOOD="${arg#*=}" ;;
    --bgm=*)         BGM="${arg#*=}" ;;
    --bgm-volume=*)  BGM_VOLUME="${arg#*=}" ;;
    --no-ducking)    NO_DUCKING="--no-ducking" ;;
    --keep-silent)   KEEP_SILENT="1" ;;
    --seek)          USE_SEEK="1" ;;
    --seek-fps=*)    SEEK_FPS="${arg#*=}" ;;
    --out=*)         OUT="${arg#*=}" ;;
    --width=*)       WIDTH="${arg#*=}" ;;
    --height=*)      HEIGHT="${arg#*=}" ;;
    --allow-network) ALLOW_NETWORK="--allow-network" ;;
    -*)              echo "未知引數：$arg" >&2; exit 1 ;;
    *)               HTML="$arg" ;;
  esac
done

RENDER_NETWORK_ARGS=()
if [ -n "$ALLOW_NETWORK" ]; then
  RENDER_NETWORK_ARGS+=("$ALLOW_NETWORK")
fi

if [ -z "$HTML" ] || [ ! -f "$HTML" ]; then
  echo "Usage: bash render-narration.sh <html> --timeline=<path> [options]" >&2
  exit 1
fi
if [ -z "$TIMELINE" ] || [ ! -f "$TIMELINE" ]; then
  echo "✗ 缺 --timeline=<path>（請先準備旁白音訊與 timeline.json）" >&2
  exit 1
fi

# ── 從 timeline.json 讀 totalDuration 和 voiceover 路徑 ──
TIMELINE_DIR="$(cd "$(dirname "$TIMELINE")" && pwd)"
TOTAL_DURATION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TIMELINE','utf8')).totalDuration)")
VOICEOVER_REL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TIMELINE','utf8')).voiceover || 'voiceover.mp3')")
VOICEOVER="$TIMELINE_DIR/$VOICEOVER_REL"

if [ ! -f "$VOICEOVER" ]; then
  echo "✗ voiceover.mp3 不存在: $VOICEOVER" >&2
  exit 1
fi

# 錄製時長 = 總時長 + 1s 安全緩衝
RECORD_DURATION=$(node -e "console.log(Math.ceil($TOTAL_DURATION + 1))")

HTML_ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
HTML_DIR="$(dirname "$HTML_ABS")"
HTML_BASE="$(basename "$HTML" .html)"
SILENT_MP4="$HTML_DIR/$HTML_BASE.mp4"

if [ -z "$OUT" ]; then
  OUT="$HTML_DIR/$HTML_BASE-narrated.mp4"
fi

echo "═══ render-narration ═══════════════════"
echo "  HTML:        $HTML_ABS"
echo "  Timeline:    $TIMELINE"
echo "  Voiceover:   $VOICEOVER"
echo "  Total dur:   ${TOTAL_DURATION}s (錄 ${RECORD_DURATION}s)"
echo "  尺寸:        ${WIDTH}×${HEIGHT}"
[ -n "$BGM_MOOD" ] && echo "  BGM mood:    $BGM_MOOD"
[ -n "$BGM" ] && echo "  BGM:         $BGM"
echo "  最終輸出:    $OUT"
echo "════════════════════════════════════════"

# ── Step 1: 錄無聲 MP4 ──────────────────────
echo ""
if [ -n "$USE_SEEK" ]; then
  echo "▸ Step 1/2 · 逐幀 seek 渲染 HTML 動畫 (無聲 · ${SEEK_FPS}fps 確定性)"
  NODE_PATH=$(npm root -g) node "$SCRIPT_DIR/render-video-seek.js" "$HTML_ABS" \
    --duration="$RECORD_DURATION" \
    --fps="$SEEK_FPS" \
    --width="$WIDTH" \
    --height="$HEIGHT" \
    "${RENDER_NETWORK_ARGS[@]}"
else
  echo "▸ Step 1/2 · 錄製 HTML 動畫 (無聲)"
  NODE_PATH=$(npm root -g) node "$SCRIPT_DIR/render-video.js" "$HTML_ABS" \
    --duration="$RECORD_DURATION" \
    --width="$WIDTH" \
    --height="$HEIGHT" \
    "${RENDER_NETWORK_ARGS[@]}"
fi

if [ ! -f "$SILENT_MP4" ]; then
  echo "✗ 無聲 MP4 沒產生: $SILENT_MP4" >&2
  exit 1
fi

# ── Step 2: 混入人聲 ──────────────────────
echo ""
echo "▸ Step 2/2 · 混入人聲"
MIX_ARGS=("$SILENT_MP4" "--voiceover=$VOICEOVER" "--out=$OUT")
[ -n "$BGM_MOOD" ] && MIX_ARGS+=("--bgm-mood=$BGM_MOOD")
[ -n "$BGM" ]      && MIX_ARGS+=("--bgm=$BGM")
[ -n "$BGM_MOOD$BGM" ] && MIX_ARGS+=("--bgm-volume=$BGM_VOLUME")
[ -n "$NO_DUCKING" ] && MIX_ARGS+=("$NO_DUCKING")

bash "$SCRIPT_DIR/mix-voiceover.sh" "${MIX_ARGS[@]}"

# 清理中間產物
if [ -z "$KEEP_SILENT" ]; then
  rm -f "$SILENT_MP4"
fi

echo ""
echo "✓ 完成: $OUT"
[ -n "$KEEP_SILENT" ] && echo "  (中間產物保留: $SILENT_MP4)"
