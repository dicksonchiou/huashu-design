#!/bin/bash
# verify-video.sh — 渲染產物側硬校驗（PASS/FAIL，不靠agent目測）
#
# 檢查項：解析度/fps、時長誤差、audio stream存在性、首尾黑幀、LUFS響度、體積
# 合成側的校驗（lint/layout/motion/contrast）由 hyperframes check 負責，此指令碼只管產物。
#
# Usage:
#   bash verify-video.sh video.mp4 [--duration=10] [--fps=60] [--width=1920] [--height=1080]
#                        [--no-audio]        # 明確無音訊的中間產物，跳過audio+響度檢查
#                        [--allow-black-open] # 片頭刻意黑場開場時跳過片頭黑幀檢查
#
# Exit code: 0 = 全PASS；1 = 有FAIL

set -u
FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: bash verify-video.sh video.mp4 [--duration=N] [--fps=N] [--width=N] [--height=N] [--no-audio] [--allow-black-open]"
  exit 1
fi
shift || true

EXP_DURATION=""; EXP_FPS=""; EXP_W=""; EXP_H=""; NO_AUDIO=0; ALLOW_BLACK_OPEN=0
for a in "$@"; do
  case "$a" in
    --duration=*) EXP_DURATION="${a#*=}" ;;
    --fps=*)      EXP_FPS="${a#*=}" ;;
    --width=*)    EXP_W="${a#*=}" ;;
    --height=*)   EXP_H="${a#*=}" ;;
    --no-audio)   NO_AUDIO=1 ;;
    --allow-black-open) ALLOW_BLACK_OPEN=1 ;;
  esac
done

FAILS=0
pass() { echo "  ✓ PASS  $1"; }
fail() { echo "  ✗ FAIL  $1"; FAILS=$((FAILS+1)); }
warn() { echo "  ⚠ WARN  $1"; }

echo "▸ verify-video: $FILE"

# ---------- 基本流資訊 ----------
INFO=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -show_entries format=duration,size -of default=noprint_wrappers=1 "$FILE" 2>/dev/null)
W=$(echo "$INFO" | grep '^width=' | cut -d= -f2)
H=$(echo "$INFO" | grep '^height=' | cut -d= -f2)
FPS_RAW=$(echo "$INFO" | grep '^avg_frame_rate=' | cut -d= -f2)
DUR=$(echo "$INFO" | grep '^duration=' | cut -d= -f2)
SIZE=$(echo "$INFO" | grep '^size=' | cut -d= -f2)
FPS=$(python3 -c "print(round(eval('${FPS_RAW:-0}' if '${FPS_RAW:-0}'!='0/0' else '0'),2))" 2>/dev/null || echo "?")

[ -z "$W" ] && { fail "無法讀取影片流（檔案損壞或非影片）"; echo "✗ 1項FAIL"; exit 1; }
echo "  info: ${W}x${H} · ${FPS}fps · ${DUR%.*}s · $((SIZE/1024))KB"

# ---------- 解析度 / fps ----------
if [ -n "$EXP_W" ]; then
  [ "$W" = "$EXP_W" ] && [ "$H" = "$EXP_H" ] && pass "解析度 ${W}x${H}" || fail "解析度 ${W}x${H}，期望 ${EXP_W}x${EXP_H}"
fi
if [ -n "$EXP_FPS" ]; then
  python3 -c "exit(0 if abs($FPS-$EXP_FPS)<=0.5 else 1)" 2>/dev/null && pass "幀率 ${FPS}fps" || fail "幀率 ${FPS}fps，期望 ${EXP_FPS}fps"
fi

# ---------- 時長誤差（±2% 或 ±0.2s 取大者）----------
if [ -n "$EXP_DURATION" ]; then
  python3 -c "
d=float('$DUR'); e=float('$EXP_DURATION')
tol=max(e*0.02,0.2)
exit(0 if abs(d-e)<=tol else 1)" 2>/dev/null && pass "時長 ${DUR%.*}s（期望 ${EXP_DURATION}s）" || fail "時長 ${DUR}s，期望 ${EXP_DURATION}s（容差2%）"
fi

# ---------- audio stream ----------
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$FILE" 2>/dev/null | head -1)
if [ "$NO_AUDIO" = "1" ]; then
  [ -z "$HAS_AUDIO" ] && pass "無音軌（--no-audio 中間產物）" || warn "宣告--no-audio但存在音軌"
else
  if [ -n "$HAS_AUDIO" ]; then
    pass "audio stream 存在"
    # ---------- LUFS 響度（成品參考 -14 LUFS ±4）----------
    LUFS=$(ffmpeg -i "$FILE" -af loudnorm=print_format=summary -f null - 2>&1 | grep 'Input Integrated' | grep -oE '\-?[0-9]+\.?[0-9]*')
    if [ -n "$LUFS" ]; then
      python3 -c "exit(0 if -18<=float('$LUFS')<=-10 else 1)" 2>/dev/null \
        && pass "響度 ${LUFS} LUFS（目標區間 -18~-10）" \
        || warn "響度 ${LUFS} LUFS 偏離 -14±4 區間，檢查混音增益"
    fi
  else
    fail "無 audio stream——skill鐵律：動畫預設交付形態是帶SFX+BGM的MP4，無聲=半成品"
  fi
fi

# ---------- 首尾黑幀 ----------
BLACK=$(ffmpeg -i "$FILE" -vf "blackdetect=d=0.1:pix_th=0.10" -an -f null - 2>&1 | grep -oE 'black_start:[0-9.]+ black_end:[0-9.]+' )
if [ -n "$BLACK" ]; then
  HEAD_BLACK=$(echo "$BLACK" | awk -F'[: ]' '$2<0.3{print}' | head -1)
  TOTAL=${DUR%.*}
  TAIL_BLACK=$(echo "$BLACK" | awk -F'[: ]' -v t="$TOTAL" '$4>t-0.3{print}' | head -1)
  if [ -n "$HEAD_BLACK" ] && [ "$ALLOW_BLACK_OPEN" = "0" ]; then
    fail "片頭黑幀（$HEAD_BLACK）——錄製起點偏移的典型症狀；刻意黑場開場用 --allow-black-open"
  else
    [ -n "$HEAD_BLACK" ] && pass "片頭黑場（--allow-black-open 已宣告）"
  fi
  [ -n "$TAIL_BLACK" ] && fail "片尾黑幀（$TAIL_BLACK)——loop回跳或時長超錄的典型症狀"
  [ -z "$HEAD_BLACK" ] && [ -z "$TAIL_BLACK" ] && warn "片中存在黑幀段（如是刻意轉場可忽略）：$(echo "$BLACK" | head -2 | tr '\n' ' ')"
else
  pass "無黑幀"
fi

# ---------- 彙整 ----------
echo ""
if [ "$FAILS" = "0" ]; then
  echo "◇ verify-video: 全部PASS"
  exit 0
else
  echo "✗ verify-video: ${FAILS}項FAIL"
  exit 1
fi
