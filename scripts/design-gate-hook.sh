#!/bin/bash
# design-gate-hook.sh — PreToolUse(Bash) hook：長片渲染前檢查設計流程gate檔案
#
# 鐵律背景（2026-07-17花叔立）：huashu-design做設計前必須①資產協議(brand-spec.md)
# ②三方向真實視覺給使用者選(direction-approved.md記錄選擇或豁免理由)。
# B00(210s)實測：跳過方向確認直接渲全片→整片返工。此hook把教訓變成機器約束：
# **時長≥45秒的合成，缺direction-approved.md就不許渲**——長片返工的代價遠大於停一下。
#
# 放行條件（任一）：
#   - 合成時長<45s或無法判定（短片/實驗低摩擦，靠SKILL.md gate協議約束）
#   - 專案目錄（或上兩級）存在 direction-approved.md
#   - 命令裡顯式帶 SKIP_DESIGN_GATE=1（花叔明說跳過時用，可審計）
#
# 安全宣告：本hook**不會被skill自動安裝**——SKILL.md/README沒有任何寫入settings.json的
# 指令，只有你手動把它配進settings.json後才生效。行為上限：對匹配的長片渲染命令exit 2
# 阻止執行並列印原因，無網路請求、無檔案寫入、無刪除。見倉庫根SECURITY.md。
#
# settings.json設定：PreToolUse / matcher "Bash" / command指向本指令碼

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# 談論命令的命令（echo/grep等）直接放行，防純文字誤傷（QA Bug1）
FIRST=$(echo "$CMD" | sed -E 's/^[[:space:]]*//' | cut -d' ' -f1)
case "$FIRST" in echo|printf|grep|cat|ls|head|tail|wc|sed|awk) exit 0;; esac
# 只管渲染命令（含npm run render與解說長片渲染）
echo "$CMD" | grep -qE "hyperframes(@[0-9.]+)? +render|render-video(-seek)?\.js|render-narration\.sh|npm +run +render\b" || exit 0
# 顯式跳過（可審計的逃生門）
echo "$CMD" | grep -q "SKIP_DESIGN_GATE=1" && exit 0

# 定位專案目錄：命令中cd的目標 > hook cwd
DIR="$CWD"
CDDIR=$(echo "$CMD" | grep -oE 'cd +"[^"]+"|cd +[^ &;]+' | head -1 | sed -E 's/^cd +//; s/"//g')
[ -n "$CDDIR" ] && [ -d "$CDDIR" ] && DIR="$CDDIR"

# 取合成時長：hyperframes專案讀index.html的data-duration；render-video-seek讀--duration引數
DUR=""
D_ARG=$(echo "$CMD" | grep -oE '\-\-duration=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$D_ARG" ] && DUR="$D_ARG"
if [ -z "$DUR" ] && [ -f "$DIR/index.html" ]; then
  DUR=$(grep -oE 'data-duration="[0-9.]+"' "$DIR/index.html" | head -1 | grep -oE '[0-9.]+' | cut -d. -f1)
fi
# 判不出時長或短片 → 放行
[ -z "$DUR" ] && exit 0
[ "$DUR" -lt 45 ] 2>/dev/null && exit 0

# 長片：查gate檔案（專案目錄及上兩級）
for d in "$DIR" "$DIR/.." "$DIR/../.."; do
  [ -f "$d/direction-approved.md" ] && exit 0
done

cat >&2 << EOF
🛑 設計流程gate：該合成時長${DUR}s（≥45s長片），但專案內未找到 direction-approved.md。
huashu-design鐵律：長片渲染前必須完成「三方向真實視覺給使用者選擇」（或使用者明示豁免），並把選擇/豁免記錄寫入專案目錄的 direction-approved.md（含：展示了哪幾版、截圖路徑、使用者的選擇原話）。
補齊後重渲；使用者當面明說跳過時，在命令前加 SKIP_DESIGN_GATE=1 顯式放行。
（依據：2026-07-17 B00實測，跳過方向確認渲210s全片→整片視覺返工）
EOF
exit 2
