# AI看片評審閉環（scripts/cloud/ai-review-video.py）

> 終渲MP4餵給影片理解模型（seed-2.0-lite），按固定checklist出結構化評審報告。
> 定位：**終渲後、交付前**的最後一道質檢，替代人工全片重看。不替代逐幀verify-video.sh。
> ⚠️ 可選雲端能力：壓縮後的影片段會傳送到火山方舟官方介面（ark.cn-beijing.volces.com），
> 使用你自己的ARK_API_KEY，需`--yes`或`HUASHU_CLOUD_OK=1`顯式確認。見倉庫根`SECURITY.md`。
> 不想用雲：`scripts/verify-video.sh`截幀人工看，全程本地。

## 何時用

- 終渲60fps成片出來後、交付/混音前，跑一遍
- SFX混音版出來後再跑一遍（onset核對只在有音軌時生效）
- 改完大問題重渲後複檢
- 不要在試渲30fps階段跑（解析度/節奏未定，浪費呼叫）

## 怎麼用

```bash
cd 專案目錄 && unset ALL_PROXY   # 指令碼內已免疫代理，unset是雙保險
uv run ~/.claude/skills/huashu-design/scripts/cloud/ai-review-video.py \
  --video 成片.mp4 \
  --context 導演稿.md \      # 強烈建議帶上：模型靠它區分「設計意圖」和「bug」
  --yes                      # 確認影片段傳送火山方舟（或 HUASHU_CLOUD_OK=1）
```

- ARK_API_KEY 配在 skill 根目錄 `.env`（已 gitignore）或環境變數，指令碼只提取這一個變數

- 報告儲存：影片同目錄 `<影片名>-AI評審.md`（`--output`可改）
- `--segment-len` 預設60秒一段；`--model` 預設 doubao-seed-2-0-lite-260215
- 210秒片實測：6次API呼叫，6-10分鐘，tokens約18萬in/2萬out（lite檔，費用分錢級）

## 呼叫鏈路（三層混合，不是純模型）

1. **ffmpeg客觀偵測**（確定性，不會漏）：
   - `silencedetect` → 音效onset時間表（模型**聽不到**影片音軌，2026-07-17實測）
   - `freezedetect` → ≥3秒完全靜止段清單
2. **模型分段看片**：60s/段壓縮後送審（1280寬/15fps/crf28，扁平動畫約0.5MB/分鐘），
   每段prompt含checklist+導演稿+該段的onset/靜止段資料，時間點換算成原片時間
3. **模型全片低清pass**：960寬/10fps全片單獨送審，專查跨段敘事連貫/hero貫穿/整體節奏
4. 文字彙總call按①-⑧合併；分段原始記錄+客觀偵測資料全部保留在報告附錄

## checklist與嚴重度

①黑幀/渲染殘缺 ②文字裁切/錯字 ③元素重疊遮擋 ④敘事連貫（過渡按 camera-language.md §7 三層詞彙識別：六式[流白/穿暗場/虛焦接力/黑場字卡/whip-pan/mask-wipe]、hidden-cut、travel[共享元素歸位/字腔穿越]；裸切=未包裝的硬切，記⚡）
⑤hero貫穿性 ⑥節奏死段（客觀清單+模型判斷刻意hold還是真死段）⑦音效打點（onset+畫面事件核對）
⑧構圖失衡/空白

⚠️致命=交付前必修 | ⚡重要=觀感明顯受損 | 💡建議=錦上添花

## 侷限（用報告前必讀）

- **模型聽不到聲音**：⑦是「音軌onset時刻畫面有沒有事件」的單向核對，
  判斷不了音效選得對不對、音量對不對、BGM情緒對不對
- **看不到幀級細節**：1-2幀的閃爍、細微抖動、精確色值偏差、亞畫素對齊抓不到，
  這些仍靠 verify-video.sh 截幀人工看
- **過渡型別判斷偏嚴**：壓縮到15fps後，快速交叉淡出可能被報成「硬切」，
  分段與全片pass矛盾時彙總會標「存疑」——存疑項自己抽幀確認再改
- **「刻意hold vs 死段」是模型意見**：b-roll墊口播的長定格常被放行，成片獨立觀看時要自己再判
- 呼叫失敗（網路/key/額度）會如實寫進報告頭，絕不編造評審結果；失敗段的時間範圍會標出

## 實測基準

首跑物件：B00-前三分鐘主線-SFX.mp4（210s）。模型自主發現幕間過渡問題和hero斷點方向正確
但把fade誤報硬切；純模型抓死段只中3/14，串接freezedetect後全覆蓋。結論：客觀偵測層是
這個閉環的下限保證，模型負責語義判斷。
