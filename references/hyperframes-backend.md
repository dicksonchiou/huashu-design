# HyperFrames 渲染後端 · 選型邊界與操作手冊

> 2026-07-17 實測驗證通過後引入（工具鏈/中文字型/代理環境/遷移/3D 五項全過，關鍵資料已內嵌本文）。
> HyperFrames 是 HeyGen 開源的 HTML→影片框架（Apache 2.0）：純 HTML + 暫停的 GSAP timeline，headless 瀏覽器逐幀 seek 確定性渲染。

## 選型邊界（先看這張表再開工）

| 場景 | 用哪條渲染路線 |
|---|---|
| 新動畫專案（預設） | **HyperFrames**。審計套件白送、3D/GSAP/Lottie/shader 全解鎖 |
| 需要 3D / 粒子 / 物理慣性 / shader 轉場 | HyperFrames（自研 Stage 做不到） |
| 老 Stage demo 要複用/改版 | 順手遷移（介面卡配方見下，20-30 分鐘/個）；只重渲不改就仍用 render-video-seek.js |
| 弱 runtime（無 npm / 無法裝依賴 / 單檔案交付給使用者雙擊開啟） | 自研 Stage（assets/animations.jsx），老流程不變 |
| 互動演示（使用者要在瀏覽器裡玩，不匯出影片） | 自研 Stage 或普通 HTML，HyperFrames 是渲染管線不是互動框架 |
| 帶解說長影片（Step 9.5，narration_stage 驅動） | **自研 narration 管線**（voiceover-pipeline.md + render-narration.sh），暫不走 HyperFrames——雙時間來源/字幕/旁白 timeline 深度耦合自研 Stage；與「動畫預設 HyperFrames」兩行同時命中時按本行裁決 |
| 批次參數化影片（千人千面/模板換字） | Remotion（見規劃方向5，獨立於本 skill 主流程） |

**設計語言永遠是甲方**：敘事結構、easing 體系、SFX/BGM 雙軌制照舊全部生效（animation-best-practices.md / audio-design-rules.md），HyperFrames 只是實作和渲染工具。GSAP 實作配方見 `references/gsap-recipes.md`。

## 專案腳手架

> ⚠️ 安裝預警：`hyperframes init` 除了生成專案檔案，還會把 **19 個 hyperframes skill 安裝到
> `~/.claude/skills/`**（渲染後端的合成契約文件，純文件無可執行 hook）。介意的話先跑
> `npx hyperframes docs` 看本地文件清單再決定是否 init。

```bash
npx -y hyperframes init 專案名 --example blank   # 非互動必須帶 --example
cd 專案名 && npm install
```

生成 index.html / hyperframes.json / meta.json / package.json（pin 了 CLI 版本）+ 專案級 CLAUDE.md。init 會把 19 個 hyperframes skill 裝到 `~/.claude/skills/`（本機已裝）。合成寫法契約讀 hyperframes-core skill 的 SKILL.md（init 裝到各 runtime 的 skill 目錄，Claude Code 預設 `~/.claude/skills/`；無 skill 機制的 runtime 直接讀 `npx hyperframes docs` 本地文件替代），本地文件 `npx hyperframes docs <topic>`（data-attributes / gsap / rendering / troubleshooting）。

**版本策略**：專案 package.json 會 pin 精確版本（目前實測過的是 0.7.61）。它迭代極快（300+ releases），升級先 `npx hyperframes@latest upgrade --project . --check` 看 delta，跑一遍迴歸 demo 再動。

## 合成契約速查（完整版讀 hyperframes-core）

- 根容器：`data-composition-id` + `data-start` + `data-duration` + `data-width/height`
- 每個計時元素：`class="clip"` + `data-start` + `data-duration` + `data-track-index`
- timeline 必須 paused 並註冊：`window.__timelines["合成id"] = gsap.timeline({paused:true})`
- 影片素材用 `muted`，音軌單獨 `<audio>` 元素
- **只允許確定性邏輯**：禁 `Date.now()` / `Math.random()` / 執行時網路 fetch；隨機用種子函式
- 字型：Google Fonts 會被編譯器自動抓取並注入確定性 @font-face（快取 `~/.cache/hyperframes/fonts/`）；純系統字型（PingFang SC 等）加一行 `@font-face { font-family:"PingFang SC"; src: local("PingFang SC"); }` 過 lint
- Three.js 走 `hf-seek` 事件介面卡（`~/.claude/skills/hyperframes-animation/adapters/three.md`），根容器必須顯式 `data-duration`

## 老 demo 遷移 · 介面卡配方（實測 20-30 分鐘/個）

自研 Stage/純 render(t) 動畫不用重寫，四步：

1. **包容器**：外套 `#root` 帶合成 data 屬性；整個 `.stage` 作為唯一 clip 最省事（`class="stage clip"` + data-start/duration/track-index）；`.stage` 從 fixed 居中改 absolute inset:0，html/body 定死 1920×1080
2. **刪自驅**：rAF tick 迴圈、fitStage/resize 監聽、replay 按鈕、`__ready/__setTime/__seek` 協議全刪（渲染器不需要）
3. **掛代理 tween**（核心 12 行）：
   ```js
   const proxy = { t: 0 };
   const tl = gsap.timeline({ paused: true });
   tl.to(proxy, { t: DURATION, duration: DURATION, ease: "none",
     onUpdate: () => render(proxy.t) }, 0);
   window.__timelines = window.__timelines || {};
   window.__timelines["main"] = tl;
   render(0);   // 必須：timeline 停在 t=0 時 onUpdate 不觸發，不補這句首幀可能未初始化
   ```
4. **掃 transition**：全文搜 `transition:` 宣告。CSS transition + class 切換走牆鍾，逐幀 seek 下不確定，必須改成 render(t) 裡對 t 的純函式（lerp）

## 校驗與渲染

```bash
npm run check                        # lint+runtime+layout+motion+contrast 五門審計
npx hyperframes check --no-contrast  # 暗色電影風專用（見下）
npx -y hyperframes@<pin版本> render --fps 60   # 終渲；預設 30fps
```

- **check 必須 0 error 才渲染**（contrast 門除外）。lint 能攔 letterSpacing 抖動、字型缺失、非確定性等一整類「無報警視覺 bug」
- **contrast 門取捨**：它按 WCAG 4.5:1 檢查，和暗色電影風的低對比水印/裝飾文字（16-40% 透明度）根本衝突，且無逐元素豁免。暗色 cinematic 產出統一 `--no-contrast`，其餘四門仍必須 0 error。亮底資訊型產出不要跳，contrast 出錯通常是真問題
- **兩級渲染**：先預設 30fps 快速出片，肉眼+截幀檢查通過後再 `--fps 60` 終渲。60fps 600 幀 1080p 實測約 20 秒
- 渲染產物側校驗（audio stream / 黑幀 / 響度 / 時長）用 `scripts/verify-video.sh`（見 verification.md）

## 透明通道（overlay花字/貼片直接疊剪輯軌）

`npx hyperframes render --format mov` 輸出 ProRes 4444（yuva444p12le，帶alpha，2026-07-17實測疊色底連軟陰影都正確半透）；`--format webm` 同樣帶透明、體積小；`--format png-sequence` 出RGBA幀序列給AE/達芬奇。合成側要點：html/body背景設 `transparent`、不鋪底色。花字/角標/lower-third這類overlay素材從此直接進剪輯軌，不用摳像。注意MOV體積大（ProRes無損級，4秒15MB量級），交付剪輯用；網路傳輸用webm。

## 音訊

HyperFrames 合成裡 `<audio>` 元素可直接進時間軸（BGM/解說隨片渲染）。目前音訊流程不變：SFX/BGM 雙軌制照 audio-design-rules.md，用 add-music.sh / mix-voiceover.sh 後製混音也可以。哪條路更好在實戰中定，先不強制。SFX打點用 `scripts/sfx-cues.sh <影片> <cue表.tsv> <輸出>`（cue表=秒數/sfx路徑/音量dB三列，B00實戰沉澱，改表重跑10秒出片）。

## pitfalls 增量（相對自研管線）

自研管線 pitfalls（animation-pitfalls.md §7/10/12/13 錄製協議類、§6 字型時序、§15/17 網路類）在 HyperFrames 後端上**不適用**：錄製協議由框架內部處理，字型編譯期抓取，CDN 實測代理下可通。新增的坑共四條，已錄入 animation-pitfalls.md §18-21：CSS transition 非確定性、代理 tween 首幀、contrast 門衝突、fromTo immediateRender 幻影。
