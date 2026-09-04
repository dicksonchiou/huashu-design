<sub>🌐 <b>中文</b> · <a href="README.en.md">English</a></sub>

<div align="center">

# Huashu Design

> *「打字。回車。一份能交付的設計。」*
> *"Type. Hit enter. A finished design lands in your lap."*

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Agent-Agnostic](https://img.shields.io/badge/Agent-Agnostic-blueviolet)](https://skills.sh)
[![Skills](https://img.shields.io/badge/skills.sh-Compatible-green)](https://skills.sh)

<br>

**在你的 agent 裡打一句話，拿回一份能交付的設計。**

<br>

3 到 30 分鐘，你能 ship 一段**產品釋出動畫**、一個能點選的 App 原型、一套能編輯的簡報、一份印刷級的資訊圖。

不是「AI 做得還可以」那種水準——是看起來像大廠設計團隊做的。給 skill 你的品牌資產（logo、色板、UI 截圖），它會讀懂你的品牌氣質；什麼都不給，**三套邏輯顧問 + 60 種 HTML 原生風格庫**也能作為備援，避免產生 AI slop。

**你看到這篇 README 裡的每一個動畫，都是 huashu-design 自己做的。** 不是 Figma，不是 AE，就是一句話 prompt + skill 跑通。下次產品釋出要做宣傳片？現在你也能做。

從 GitHub 下載 ZIP，解壓縮後放入 agent 的 skills 目錄即可。

跨 agent 通用——Claude Code、Cursor、Codex、OpenClaw、Hermes 都能裝。

> 📣 **已改為 MIT 授權條款。** 自 2026-05-14 起本 skill 完全開源（[MIT License](LICENSE)），個人與**商業用途皆免費**，無需事先授權。原「個人使用免費、企業商用需授權」的條款已作廢。([檢視變更](#license))

[看效果](#demo-畫廊) · [安裝](#裝上就能用) · [能做什麼](#能做什麼) · [核心機制](#核心機制) · [和 Claude Design 的關係](#和-claude-design-的關係)

</div>

---

<p align="center">
  <img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/hero-animation-v10-en.gif" alt="huashu-design Hero · 打字 → 選方向 → 畫廊展開 → 聚焦 → 品牌顯形" width="100%">
</p>

<p align="center"><sub>
  ▲ 25 秒 · Terminal → 4 方向 → Gallery ripple → 4 次 Focus → Brand reveal<br>
  👉 <a href="https://www.huasheng.ai/huashu-design-hero/">造訪帶音效的 HTML 互動版</a> ·
  <a href="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/hero-animation-v10-en.mp4">下載 MP4（含 BGM+SFX · 10MB）</a>
</sub></p>

---

## 📺 新手教學（花叔親錄）

不知道怎麼用？來看花叔錄的 huashu-design 入門教學：

<p align="center">
  <a href="https://www.youtube.com/watch?v=m-_BlUdcIvw"><img src="https://img.youtube.com/vi/m-_BlUdcIvw/maxresdefault.jpg" alt="huashu-design 使用教學" width="70%"></a>
</p>

<p align="center"><sub>👉 <a href="https://www.youtube.com/watch?v=m-_BlUdcIvw">在 YouTube 觀看完整教學</a></sub></p>

---

## 裝上就能用

### 安裝步驟

1. 前往 [huashu-design GitHub repository](https://github.com/dicksonchiou/huashu-design)，點選 `Code` → `Download ZIP` 下載 ZIP 檔案。
2. 解壓縮 ZIP，將解壓縮後的 `huashu-design` 資料夾移到下列任一個 skills 目錄。請保留完整資料夾結構，確認 `SKILL.md` 位於 `.../huashu-design/SKILL.md`。

#### 專案層級（Project Level）

Linux、macOS 或 Windows：

```text
<專案根目錄>/.agents/skills/huashu-design/
```

Windows 也可以使用反斜線表示：

```text
<專案根目錄>\.agents\skills\huashu-design\
```

#### 全域層級（Global Level）

依照使用的 agent，將 `huashu-design` 資料夾放入對應路徑。

Linux 或 macOS：

| Agent | 安裝路徑 |
| --- | --- |
| Gemini CLI | `~/.gemini/config/skills/huashu-design/` |
| Codex | `~/.codex/config/skills/huashu-design/` |
| Claude Code | `~/.claude/skills/huashu-design/` |

Windows：

| Agent | 安裝路徑 |
| --- | --- |
| Gemini CLI | `%USERPROFILE%\.gemini\config\skills\huashu-design\` |
| Codex | `%USERPROFILE%\.codex\config\skills\huashu-design\` |
| Claude Code | `%USERPROFILE%\.claude\skills\huashu-design\` |

`%USERPROFILE%` 代表目前 Windows 使用者的家目錄，例如 `C:\Users\<使用者名稱>`。

> **裝完先自我檢查**：這個 skill 不只是 `SKILL.md` 一個檔案，`references/`、`assets/`、`scripts/`、`demos/` 四個子目錄裡有被引用的配方、指令碼與素材，缺一不可。請確認安裝後的目錄包含這些子目錄，而不是只有 `SKILL.md`。

然後在 Claude Code / Codex / Cursor 等任意支援 skills 的 agent 裡直接說話：

```
「做一份 AI 心理學的演講 PPT，推薦 3 個風格方向讓我選」
「做個 AI 番茄鐘 iOS 原型，4 個核心螢幕要真能點選」
「把這段邏輯做成 60 秒動畫，匯出 MP4 和 GIF」
「幫我對這個設計做一個 5 維度評審」
```

沒有按鈕、沒有面板、沒有 Figma 外掛。

---

## Star 趨勢

<p align="center">
  <a href="https://star-history.com/#alchaincyf/huashu-design&Date">
    <img src="https://api.star-history.com/svg?repos=alchaincyf/huashu-design&type=Date" alt="huashu-design Star History" width="80%">
  </a>
</p>

---

## 能做什麼

| 能力 | 交付成果 | 典型耗時 |
|------|--------|----------|
| 互動原型（App / Web） | 單檔案 HTML · 真 iPhone bezel · 可點選 · Playwright 驗證 | 10–15 min |
| 演講簡報 | HTML deck（瀏覽器簡報）+ 可編輯 PPTX（文字框保留） | 15–25 min |
| 時間軸動畫 | MP4（25fps / 60fps 插幀）+ GIF（palette 最佳化）+ BGM | 8–12 min |
| 設計變體 | 3+ 並排對比 · Tweaks 即時調參 · 跨維度探索 | 10 min |
| 資訊圖 / 視覺化 | 印刷級排版 · 可匯出 PDF/PNG/SVG | 10 min |
| 設計方向顧問 | **三套邏輯並行**（秒數輪盤 + 現實參照獲獎站 + 最佳設計師）· 直接出 3 版真實視覺 | 5 min |
| 5 維度專家評審 | 雷達圖 + Keep/Fix/Quick Wins · 可執行的修正清單 | 3 min |

---

## Demo 畫廊

### 設計方向顧問

模糊需求時的 fallback：**三套互補邏輯並行**——秒數輪盤（20 選 1 打破慣性）+ 現實參照（世界級獲獎網站遷移）+ 最佳設計師（頂級工作室哲學），直接出 3 版**真實視覺**讓你看著選，不讓你在文字裡盲選風格。背後是 **60 種 HTML 原生風格庫**（網頁 20 + PPT 20 + 資訊圖 20，純 CSS 無需生圖）。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/w3-fallback-advisor.gif" width="100%"></p>

### iOS App 原型

iPhone 15 Pro 精確機身（靈動島 / 狀態列 / Home Indicator）· 狀態驅動多屏切換 · 真圖從 Wikimedia/Met/Unsplash 取 · Playwright 自動點選測試。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/c1-ios-prototype.gif" width="100%"></p>

### Motion Design 引擎

Stage + Sprite 時間片段模型 · `useTime` / `useSprite` / `interpolate` / `Easing` 四 API 覆蓋所有動畫需求 · 一個指令匯出 MP4 / GIF / 60fps 插幀 / 帶 BGM 的完成影片。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/c3-motion-design.gif" width="100%"></p>

### HTML Slides → 可編輯 PPTX

HTML deck 以瀏覽器播放 · `html2pptx.js` 讀 DOM 的 computedStyle 逐元素翻譯成 PowerPoint 物件 · 匯出的是**真文字框**，PPT 裡雙擊即可編輯。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/c2-slides-pptx.gif" width="100%"></p>

### Tweaks · 即時變體切換

配色 / 字型 / 資訊密度等參數化 · 側邊面板切換 · 純前端 + `localStorage` 持久化 · 重新整理不丟。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/c4-tweaks.gif" width="100%"></p>

### 資訊圖 / 資料視覺化

雜誌級排版 · CSS Grid 精準分欄 · `text-wrap: pretty` 排印細節 · 由真實資料驅動 · 可匯出 PDF 向量圖 / PNG 300dpi / SVG。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/c5-infographic.gif" width="100%"></p>

### 5 維度專家評審

哲學一致性 · 視覺層級 · 細節執行 · 功能性 · 創新性 各 0–10 分 · 雷達圖視覺化 · 輸出 Keep / Fix / Quick Wins 清單。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/c6-expert-review.gif" width="100%"></p>

### Junior Designer 工作流程

不悶著頭做大招：先寫 assumptions + placeholders + reasoning，儘早 show 給你，再迭代。理解錯了，早改比晚改便宜 100 倍。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/w2-junior-designer.gif" width="100%"></p>

### 品牌資產協議 5 步硬流程

涉及具體品牌時強制執行：問 → 搜尋 → 下載（三種備援方式）→ grep 色碼 → 寫 `brand-spec.md`。

<p align="center"><img src="https://github.com/alchaincyf/huashu-design/releases/download/v2.0/w1-brand-protocol.gif" width="100%"></p>

---

## Showcase · 真實案例

### 鸚鵡進化史網站 · 設計方向顧問三套邏輯實戰（2.0）

> **Live demo · [https://www.huasheng.ai/parrots/](https://www.huasheng.ai/parrots/)**

一句「做個介紹鸚鵡進化史的網站」、零額外要求，skill 自動跑完整 2.0 顧問流程：先判斷圖片是內容所需 → 抓公共領域博物學插畫（Edward Lear / John Gould 的鸚鵡圖錄）→ **三套邏輯並行**（秒數輪盤 + 現實參照獲獎站 + 原研哉「白」哲學）各出一版真實視覺。**素材齊了再設計，不是邊設計邊用色塊佔位。**

### 「聊聊 skill」 · PM after-party 演講 deck

> **Live demo · [https://skill-huasheng.vercel.app](https://skill-huasheng.vercel.app)**

13 頁 HTML deck，**全部用 huashu-design 完成**：

- 黑底極簡襯線視覺系統（cover / about / hook / what / why / closing）
- 2 個帶 BGM + SFX 的 22 秒 cinematic demo（Nuwa skill workflow + Darwin skill workflow），各採用**完全獨立的視覺語言**：
  - **Nuwa**：3D 知識 orbit + Pentagon 提煉 + SKILL.md typewriter + 「21 分鐘」hero reveal
  - **Darwin**：autoresearch loop spin + v1/v5 並列 diff + Hill-Climb 全螢幕曲線 + Ratchet gear lock
- 每個 cinematic 預設顯示**完整靜態 workflow dashboard**（觀眾隨時能看清 skill 怎麼跑），點 ▶ 才觸發動畫，跑完自動 fade 回 dashboard
- 嵌入 huasheng.ai 的 25 秒 hero 動畫（iframe 本機備援）
- 真實資料：14,495 stargazers 真實曲線（gh API 拉取）+ DeepSeek V4 真實 specs（WebSearch 驗證）
- 真實 AI 素材：用 `huashu-gpt-image` 跑 4×2 grid 大圖，`extract_grid.py` 摳出 8 張獨立透明 PNG，做 3D orbit 漂浮

**適合參考的頁面**：
- `/slides/slide-04b-nuwa-flow.html` · 靜態 dashboard + cinematic overlay 雙層架構
- `/slides/slide-06b-darwin-flow.html` · 完全獨立視覺語言的對照案例
- `/slides/slide-03b-deepseek-cover.html` · AI slop vs 真實設計師視角的對比頁

詳細 cinematic patterns 見 `references/cinematic-patterns.md`。

---

## 核心機制

### 品牌資產協議

skill 裡最硬的一段規則。涉及具體品牌（Stripe、Linear、Anthropic、自家公司等）時強制執行 5 步：

| 步驟 | 動作 | 目的 |
|------|------|------|
| 1 · 問 | 使用者有 brand guidelines 嗎？ | 尊重已有資源 |
| 2 · 搜尋官方品牌頁 | `<brand>.com/brand` · `brand.<brand>.com` · `<brand>.com/press` | 抓權威色碼 |
| 3 · 下載資產 | SVG 檔案 → 官網 HTML 全文 → 產品截圖取色 | 三種備援方式，前一種失敗立刻改用下一種 |
| 4 · grep 擷取色碼 | 從資產裡抓所有 `#xxxxxx`，依頻率排序，過濾黑白灰 | **絕不從記憶猜品牌色** |
| 5 · 固定 spec | 寫 `brand-spec.md` + CSS 變數，所有 HTML 引用 `var(--brand-*)` | 不固定下來就會忘記 |

A/B 測試（v1 vs v2，各跑 6 agent）：**v2 的穩定性變異數比 v1 低 5 倍**。穩定性的穩定性，這是 skill 真正的護城河。

### 設計方向顧問（Fallback）

當使用者需求模糊到無法著手時觸發（2.0 重做）：

- 先對話澄清 + 主動索要參考（名字 / logo / 品牌色 / 喜歡的參考站）
- 取齊內容必需的真圖（公共領域 / 免版權，指令碼一鍵抓），再開工
- **三套互補邏輯並行 subagent**，各出一版**真實視覺**：① 秒數輪盤（`date +%S` 取秒，20 選 1，打破模型偷選極簡的慣性）② 現實參照（世界級獲獎網站 / PPT / iOS 原型遷移）③ 最佳設計師（預算無上限時最適合的工作室哲學）
- **絕不讓你在沒看到視覺時盲選風格**——三版擺出來，看著選
- 選定後進入主幹 Junior Designer 流程
- 底層是 **60 種 HTML 原生風格庫**（網頁 20 + PPT 20 + 資訊圖 20，依大膽 / 中性 / 安靜分級，純 CSS 無需生圖）作彈藥，不是教條

### Junior Designer 工作流程

預設工作模式，貫穿所有任務：

- 開工前一次將問題清單發給使用者，等批次答完再動手
- HTML 裡先寫 assumptions + placeholders + reasoning comments
- 儘早 show 給使用者（即使只是灰色方塊）
- 填入實際內容 → variations → Tweaks，這三步分別再 show 一次
- 交付前用 Playwright 在瀏覽器中目視檢查一次

### 反 AI slop 規則

避免一眼 AI 的視覺最大公約數（紫漸變 / emoji 圖示 / 圓角+左 border accent / SVG 畫人臉 / Inter 做 display）。用 `text-wrap: pretty` + CSS Grid + 精心選擇的 serif display 和 oklch 色彩。

---

## 和 Claude Design 的關係

我大方承認：品牌資產協議的哲學是從 Claude Design 流傳出來的提示詞裡偷師的。那份提示詞反覆強調**好的高保真設計不是從白紙開始，而是從已有的設計上下文長出來**。這個原則是 65 分作品和 90 分作品的分水嶺。

定位差異：

| | Claude Design | huashu-design |
|---|---|---|
| 形態 | 網頁產品（瀏覽器裡用） | skill（Claude Code 裡用） |
| 配額 | 訂閱 quota | API 用量 · 並行跑 agent 不受 quota 限制 |
| 交付成果 | 畫布內 + 可匯出至 Figma | HTML / MP4 / GIF / 可編輯 PPTX / PDF |
| 操作方式 | GUI（點、拖、改） | 對話（說話、等 agent 做完） |
| 複雜動畫 | 有限 | Stage + Sprite 時間軸 · 60fps 匯出 |
| 跨 agent | 專屬 Claude.ai | 任意 skill 相容 agent |

Claude Design 是**更好的圖形工具**，huashu-design 是**讓圖形工具這層消失**。兩條路，不同受眾。

---

## 安全與資料流

核心流程（設計→渲染→MP4/PDF/PPTX 匯出）**100% 本機執行，不需要第三方 AI 或 TTS API key，Playwright 匯出器預設阻擋網路**。只有可信 HTML 確實需要遠端字型或 script 時，才明確加 `--allow-network`。需要旁白時，使用外部準備好的音訊檔案，再交給本機混音與渲染工具處理。無 telemetry，沒有任何資料傳送至作者伺服器。完整出站網域與刪除邊界請見 [SECURITY.md](SECURITY.md)。

---

## Limitations

- **不支援圖層級可編輯的 PPTX 到 Figma**。產出 HTML，可截圖、錄製畫面、匯出圖片，但不能拖進 Keynote 改文字位置。
- **不支援 Framer Motion 等級的複雜動畫**。3D、物理模擬、粒子系統超出 skill 邊界。
- **完全空白的品牌從零設計品質會掉到 60–65 分**。憑空畫 hi-fi 本來就是 last resort。

這是一個 80 分的 skill，不是 100 分的產品。對不願意開啟圖形介面的人，80 分的 skill 比 100 分的產品好用。

---

## 儲存庫結構

```
huashu-design/
├── SKILL.md                 # 主文件（給 agent 讀）
├── README.md                # 中文 README（預設，本檔案）
├── README.en.md             # 英文 README
├── assets/                  # Starter Components
│   ├── animations.jsx       # Stage + Sprite + Easing + interpolate
│   ├── ios_frame.jsx        # iPhone 15 Pro bezel
│   ├── android_frame.jsx
│   ├── macos_window.jsx
│   ├── browser_window.jsx
│   ├── deck_stage.js        # HTML 投影片引擎
│   ├── deck_index.html      # 多檔案 deck 組合器
│   ├── design_canvas.jsx    # 並排變體展示
│   ├── showcases/           # 24 個預先製作的範例（8 場景 × 3 風格）
│   └── bgm-*.mp3            # 6 首場景化背景音樂
├── references/              # 按任務深入讀的子文件
│   ├── animation-pitfalls.md
│   ├── design-styles.md     # 60 種 HTML 原生風格庫（網頁 20 + PPT 20 + 資訊圖 20）
│   ├── slide-decks.md
│   ├── editable-pptx.md
│   ├── critique-guide.md
│   ├── video-export.md
│   └── ...
├── scripts/                 # 匯出工具鏈
│   ├── render-video.js      # HTML → MP4
│   ├── convert-formats.sh   # MP4 → 60fps + GIF
│   ├── add-music.sh         # MP4 + BGM
│   ├── export_deck_pdf.mjs
│   ├── export_deck_pptx.mjs
│   ├── html2pptx.js
│   └── verify.py
└── demos/                   # 9 個功能示範 (c*/w*)，中英文雙版本 GIF/MP4/HTML + hero v10
```

---

## 起源

Anthropic 釋出 Claude Design 那天我玩到凌晨四點。幾天之後發現自己再也沒點開過它，不是它不好——它是這個領域目前最成熟的產品——是我寧願讓 agent 在終端裡幫我處理工作，也不願意開啟任何圖形介面。

於是讓 agent 拆解 Claude Design 本身（包括社群流傳的系統提示詞、品牌資產協議、元件機制），蒸餾成結構化 spec，再寫成 skill 裝進自己的 Claude Code。

感謝 Anthropic 把 Claude Design 的提示詞寫得清晰。這種基於其他產品靈感的二次創作，是開源文化在 AI 時代的新形態。

---

## 用 huashu-design 做的產品

**[FanBox · Coding Agent 的駕駛艙](https://github.com/alchaincyf/fanbox)** 的三套介面主題，就是用 huashu-design 設計的。指揮 Claude Code / Codex 執行工作，看清它碰過的每個檔案、每一行改動。

[![FanBox · Coding Agent 的駕駛艙](https://raw.githubusercontent.com/alchaincyf/fanbox/master/assets/promo-banner.jpg)](https://github.com/alchaincyf/fanbox)

---

## 社群翻譯版本

社群維護的翻譯版本。翻譯品質與各版本 license 條款由對應維護者負責，使用前請先確認。

| 語言 | 維護者 | 儲存庫 |
|---|---|---|
| English | [@namandhakad712](https://github.com/namandhakad712) | [namandhakad712/huashu-design-en](https://github.com/namandhakad712/huashu-design-en) |
| 한국어（韓語） | [@ktkarchive](https://github.com/ktkarchive) | [ktkarchive/ktk-design](https://github.com/ktkarchive/ktk-design) |
| Tiếng Việt（越南語） | [@letrquan](https://github.com/letrquan) | [letrquan/huashu-design](https://github.com/letrquan/huashu-design) |

想加入你的語言？fork 儲存庫、翻譯 `SKILL.md` + `README.md`，然後在這裡開一個 issue，我會把連結加進來。

---

## License

**2026-05-14 起改為 MIT 授權條款。** 先前版本採用「個人使用免費、企業商用需授權」的 Personal Use License，對商用做了限制——現在這層限制完全解除。

依據 [MIT License](LICENSE)，你可以**自由使用、修改、分發**本 skill，**包括商業用途**——公司內部使用、客戶商業案件交付、做成付費產品對外販售，都沒問題。無需事先授權、無需付費、無需打招呼。註明出處非強制，但歡迎。

---

## Connect · 花生（花叔）

花生是 AI Native Coder、獨立開發者、AI 自媒體創作者。代表作：小貓補光燈（AppStore 付費榜 Top 1）、《一本書玩轉 DeepSeek》、女媧 .skill（GitHub 12000+ star）。自媒體全平台 30 萬+ 粉絲。

| 平台 | 帳號 | 連結 |
|---|---|---|
| X / Twitter | @AlchainHust | https://x.com/AlchainHust |
| 微信官方帳號 | 花叔 | 在微信搜尋「花叔」 |
| B 站 | 花叔 | https://space.bilibili.com/14097567 |
| YouTube | 花叔 | https://www.youtube.com/@Alchain |
| 小紅書 | 花叔 | https://www.xiaohongshu.com/user/profile/5abc6f17e8ac2b109179dfdf |
| 官網 | huasheng.ai | https://www.huasheng.ai/ |
| 開發者首頁 | bookai.top | https://bookai.top |

合作諮詢、自媒體約稿 → 以上任一平台私訊花生即可。
