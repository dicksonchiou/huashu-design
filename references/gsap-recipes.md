# GSAP Recipes · 設計語言到 GSAP Timeline 的翻譯層

> 本檔案只做一件事：把 huashu-design 已沉澱的動畫設計語言
> （`animation-best-practices.md` 的五段敘事、easing 體系、運動語言 8 條、場景配方，
> 以及 `cinematic-patterns.md` 的 22 秒 5-scene 模板）翻譯成可直接貼上的
> GSAP timeline 實作配方，跑在 HyperFrames 渲染後端上。
>
> **設計判斷以本 skill 自己的 references 為準，GSAP 只是實作工具。**
> 什麼時候該懸停、該用哪種敘事弧線、什麼算美，去讀 `animation-best-practices.md` §0；
> 本檔案回答的只是「這條規則用 GSAP 怎麼寫」。
> HyperFrames 的合成契約（composition root 屬性、`.clip` 標記、渲染命令、check 審計）
> 見 `references/hyperframes-backend.md`，本文只引用不復述。

---

## 0 · 基礎樣板（每個合成都從這裡開始）

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
  window.__timelines = window.__timelines || {};

  const tl = gsap.timeline({
    paused: true,                                   // 必須。HyperFrames 負責 seek
    defaults: { ease: "expo.out", duration: 0.6 },  // 本 skill 的主 easing（見 §1）
  });

  // ... 所有 tween 都掛在這條 timeline 上 ...

  window.__timelines["main"] = tl;  // key 必須等於合成根的 data-composition-id
</script>
```

硬約束（違反任何一條，渲染結果不確定）：

- timeline 必須 `paused: true`，**永遠不呼叫 `tl.play()`** 做渲染關鍵動畫
- timeline 必須在同步程式碼裡建好，不放進 async / 定時器 / 事件回撥
- 渲染時長來自合成根的 `data-duration`，不是 timeline 長度。不要用空 tween 墊長度
- 禁 `repeat: -1`。迴圈動作用可見時長算出有限的 repeat 次數
- 注意：`defaults: { ease: "expo.out" }` 與 hyperframes-animation 文件裡的
  `power3.out` house default 不同。那是它的品味，本 skill 的既有規則是
  「expoOut 是預設主 easing」，翻譯層遵循自家設計語言

---

## 1 · Easing 對映表 · 自研 Easing → GSAP

`assets/animations.jsx` 裡的自研 Easing 函式，逐個對應到 GSAP 寫法。
前三個是數學上**完全同一條曲線**，不是近似。

| 自研 Easing | 數學定義 | GSAP 寫法 | 關係 | 用途（既有規則） |
|---|---|---|---|---|
| `expoOut` | `1 - 2^(-10t)` | `"expo.out"` | 完全一致 | **預設主 easing**。卡片 rise-in、面板入場、Terminal fade、focus overlay |
| `overshoot` | easeOutBack，c1=1.70158 | `"back.out"`（預設 1.70158）或 `"back.out(1.7)"` | 完全一致 | Toggle 切換、按鈕彈出、強調互動 |
| `spring` | easeOutElastic，週期 2π/3 | `"elastic.out(1, 0.3)"`（即預設 `"elastic.out"`） | 完全一致 | 幾何體歸位、物理落位、UI 抖彈 |
| `easeIn` | `t²` | `"power1.in"` | 完全一致 | 出場、Anticipation 預備段 |
| `easeOut` | `1-(1-t)²` | `"power1.out"` | 完全一致 | 次要元素的輕動作（說明文字 fade 等） |
| `easeInOut` | quad inOut | `"power1.inOut"` | 完全一致 | 持續運動（滑鼠軌跡插值等對稱運動） |
| `linear` | `t` | `"none"` | 完全一致 | 只用於 proxy 驅動 / 相機勻速運動。**禁止用在元素動效上** |
| `anticipation` | 分段曲線，先下探 -0.3 再回升 | 無內建等價，用函式 ease（見下） |  | 帶預備動作的入場 |

### 1.1 anticipation · 函式 ease

GSAP 接受任意 `(p) => number` 作為 ease，把自研定義原樣搬過來即可：

```js
// 與 animations.jsx 的 Easing.anticipation 逐點一致
const anticipation = (t) => {
  if (t < 0.2) return -0.3 * (t / 0.2) * (t / 0.2);   // 前 20%：反向下探
  const a = (t - 0.2) / 0.8;
  return -0.012 + 1.012 * a * a * (3 - 2 * a);         // 後 80%：smoothstep 回升
};

tl.fromTo("#card", { y: 40 }, { y: 0, duration: 0.7, ease: anticipation }, "s2");
```

注意：這條曲線會越過 0（負值區），**只能用在 transform 上**（y / scale / rotation），
不要用在 opacity 或顏色上（會推出合法範圍）。

### 1.2 spring 的另一個選項 · 烤制彈簧（seek-safe 真物理）

`"elastic.out(1, 0.3)"` 是自研 spring 的精確等價，直接用它沒問題。
當你想要**可調阻尼**的真彈簧手感（比如「落位幾乎不過沖、只是尾巴長」），
用 hyperframes-animation 提供的 `springEase` 閉式解（`adapters/gsap-easing-and-stagger.md`
有完整 40 行實作，閉式解是時間的純函式，seek-safe）：

```js
// dampingFraction 1.0 = 無過沖的沉穩落位；0.6-0.7 ≈ 自研 spring 的彈跳感
const settle = springEase({ response: 0.4, dampingFraction: 0.65 });
tl.fromTo("#hero", { scale: 0 }, { scale: 1,
  duration: settle.duration, ease: settle.ease }, "s4");   // duration 必須一起用，它是物理的一部分
```

**禁止**引入任何即時彈簧庫（react-spring 等積分器）：狀態逐幀累積，無法確定性 seek。

---

## 2 · 五段敘事骨架 · Slow-Fast-Boom-Stop（15/15/40/20/10%）

為什麼：均勻節奏的動畫是技術演示，有節奏的動畫才是敘事（best-practices §1）。

帶 label 的 timeline 骨架模板，改 `D` 即可支援任意總時長：

```js
const D = 15;   // 總時長（秒），與合成根 data-duration 保持一致
const at = (p) => D * p;

const tl = gsap.timeline({
  paused: true,
  defaults: { ease: "expo.out", duration: 0.6 },
});

// ── 五段 label，比例 15 / 15 / 40 / 20 / 10 ──────────────────
tl.addLabel("s1_trigger",  at(0));     // 慢 · 觸發：給人類反應時間，建立真實感
tl.addLabel("s2_generate", at(0.15));  // 中 · 生成：視覺驚豔點出現
tl.addLabel("s3_process",  at(0.30));  // 快 · 過程：展示可控性/密度/細節
tl.addLabel("s4_boom",     at(0.70));  // Boom · 爆發：拉遠/3D pop-out/多面板湧現
tl.addLabel("s5_hold",     at(0.90));  // 靜 · 落幅：Logo 形變 + 戛然而止

// ── S1 觸發（節奏慢：單個動作 + 大量留白）─────────────────────
tl.fromTo("#terminal", { y: 48, autoAlpha: 0 },
  { y: 0, autoAlpha: 1, duration: 0.8 }, "s1_trigger+=0.1");

// ── S2 生成（一個明確的驚豔點，不堆動作）─────────────────────
tl.fromTo("#result-panel", { scale: 0.92, autoAlpha: 0 },
  { scale: 1, autoAlpha: 1, duration: 0.7 }, "s2_generate");

// ── S3 過程（密度最高：stagger、typewriter、focus 切換都在這）──
tl.fromTo(".row", { y: 10, autoAlpha: 0 },
  { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.03 }, "s3_process");

// ── S4 爆發（鏡頭級動作：拉遠 / rotationX / 多元素湧現）───────
tl.to("#stage", { scale: 0.82, rotationX: 8, duration: 1.2,
  ease: "expo.inOut" }, "s4_boom");

// ── S5 落幅（Logo 形變收束，見 §3.6；之後什麼都不發生）────────
// 最後 ~0.5s 是有意的靜止 hold：不加任何 tween，也絕不 fade to black

window.__timelines["main"] = tl;
```

要點：

- **S5 之後留白**：`data-duration` 覆蓋到最後，但 timeline 上沒有 tween，
  畫面 hold 在最終幀。這就是「戛然而止」的實作（禁 fade out 收尾）
- 22 秒 5-scene 模板（cinematic-patterns Pattern B）同構：把比例換成
  Invoke 3-4s / Process 5-6s / Insight 4-5s / Output 3-4s / Hero 4-5s，label 同法
- scene 之間的全螢幕切換用 autoAlpha 交疊 + 位移，不用 display 切換
  （`display` / 裸 `visibility` 是渲染器禁區，show/hide 一律 `autoAlpha`）

---

## 3 · 運動語言 8 條 · 逐條翻譯

### 3.1 底色不用純黑純白

非 timeline 規則：底色是靜態 CSS，帶色溫的中性色，具體色值走品牌 spec。
唯一的 GSAP 關聯：scene 之間要變底色時，tween `backgroundColor`（在允許列表內），
且兩個 scene 的底色應同色系（cinematic-patterns §2 的配色一致約束）：

```js
tl.to("#stage", { backgroundColor: "#F4EFE6", duration: 0.8, ease: "sine.inOut" }, "s4_boom");
```

### 3.2 Easing 絕不是 linear

為什麼：`linear` 讓數字元素像機器，`expoOut` 給物理重量感（best-practices §2）。

實作：timeline `defaults` 寫 `ease: "expo.out"`（見 §0 樣板），
個別 tween 按 §1 對映表覆蓋。`ease: "none"` 只允許出現在兩處：
proxy 驅動 tween（§7）和刻意的機械運動（相機勻速 pan）。

### 3.3 Slow-Fast-Boom-Stop

見 §2 骨架，不重複。

### 3.4 展示「過程」而非「魔法結果」

為什麼：產品是協作者不是魔術師，展示 tweak / 出錯修復 / redline 打擊「一鍵魔法」
的 AI slop（best-practices §3.4）。

兩個最常用的「過程感」配方：

**Chunk Reveal（模擬 token 流式輸出）**。原配方用 `setTimeout + Math.random`，
兩者在 seek 渲染下都非法。翻譯成「預計算時刻表 + proxy 驅動」，雙向 seek 安全：

```js
// 為什麼不用 tl.call()：回撥不可逆，preview 裡往回拖會殘留狀態
const rand = mulberry32(42);                              // 種子隨機，見 §7.4
const text = "為你生成了三個候選方案，第一個最激進。";
const chunks = text.split(/(?=[，。、；])|(?<=[，。、；])/); // 中文按標點切 chunk
const times = []; let acc = 0;
chunks.forEach(() => { acc += 0.04 + rand() * 0.08; times.push(acc); }); // 不規律 40-120ms

const tw = { t: 0 };
tl.to(tw, {
  t: acc, duration: acc, ease: "none",
  onUpdate: () => {   // 每幀從 t 重算完整可見文字：純函式，回拖也正確
    let n = 0;
    while (n < times.length && times[n] <= tw.t) n++;
    document.querySelector("#stream").textContent = chunks.slice(0, n).join("");
  },
}, "s2_generate+=0.3");
```

**數字 counter（展示真實資料在漲）**：

```js
// snap 保證整數；innerText 是 HyperFrames 認可的 counter 寫法
tl.fromTo("#metric", { innerText: 0 },
  { innerText: 237, snap: { innerText: 1 }, duration: 1.2, ease: "expo.out" }, "s3_process");
```

帶千分位 / 字尾格式化時改用 proxy + onUpdate（`tw.v` 推導 `toLocaleString`），套路同上。

### 3.5 滑鼠軌跡 · 弧線 + 手抖

為什麼：直線插值的滑鼠有潛意識機器感，真人是「加速、弧線、減速修正」
（best-practices §3.5）。

貝塞爾弧線沒法用普通屬性 tween 表達，用 proxy 驅動。手抖不用 Perlin
（原實作依賴執行時噪聲），用兩條不可通約頻率的正弦疊加，確定性等效：

```js
const mouse = { p: 0 };
const P0 = [100, 100];                       // 起點
const P2 = [tx, ty];                          // 終點（點選目標）
const P1 = [tx - 200, ty + 80];               // 控制點：偏離中點，製造弧線

tl.to(mouse, {
  p: 1, duration: 1.1, ease: "power1.inOut",  // 對稱 easing：起步加速 + 到達減速
  onUpdate: () => {
    const t = mouse.p;
    let x = (1-t)*(1-t)*P0[0] + 2*(1-t)*t*P1[0] + t*t*P2[0];
    let y = (1-t)*(1-t)*P0[1] + 2*(1-t)*t*P1[1] + t*t*P2[1];
    x += Math.sin(t * 47.13) * 2 * (1 - t);   // ±2px 手抖，接近目標時收斂
    y += Math.sin(t * 33.7 + 1.3) * 2 * (1 - t);
    gsap.set("#cursor", { x, y });            // 一切由 p 推導，seek-safe
  },
}, "s1_trigger+=0.5");

// 點選回饋：Anticipation 縮小再回彈
tl.to("#cursor", { scale: 0.85, duration: 0.08, ease: "power1.in" }, ">");
tl.to("#cursor", { scale: 1, duration: 0.25, ease: "back.out" }, ">");
```

### 3.6 Logo 形變收束（Morph）

為什麼：Logo 淡入沒有敘事收束感，要讓前一個視覺元素「坍縮」再「膨脹」成 Logo，
讓敘事在品牌點上坍縮（best-practices §3.6）。

blur 走 CSS 變數（`filter` 是 paint-only、seek-safe，官方 depth-of-field-blur
rule 認可的做法）：

```css
#lastVisual, #logo { --blur: 0px; filter: blur(var(--blur)); will-change: filter; }
```

```js
tl.addLabel("morph", "s5_hold-=0.3");

// 坍縮：前一個視覺元素縮成色塊，motion blur 升起
tl.to("#lastVisual", { scale: 0.1, "--blur": "6px",
  duration: 0.5, ease: "expo.out" }, "morph");

// 膨脹：Logo 從色塊中心彈出，blur 收斂到銳利
tl.fromTo("#logo",
  { scale: 0.1, "--blur": "6px", autoAlpha: 0 },
  { scale: 1, "--blur": "0px", autoAlpha: 1, duration: 0.6, ease: "back.out" },
  "morph+=0.35");                              // 150ms 量級交疊 = 快切

tl.to("#lastVisual", { autoAlpha: 0, duration: 0.15 }, "morph+=0.5");
// 之後：hold，無 tween，戛然而止
```

### 3.7 襯線 + 無襯線雙字型

非 timeline 規則：靜態 CSS，字型選擇走品牌 spec。
HyperFrames 編譯器會自動抓取 Google Fonts 並注入確定性 @font-face
（Phase 0 實測，自研管線的字型時序坑在新後端不存在），CSS 裡正常引入 Google Fonts 即可。

### 3.8 焦點切換 = 背景減弱 + 前景銳化 + Flash 引導

為什麼：只降 opacity 時非焦點元素還是銳利的，必須加 blur 才真的退到後景
（best-practices §3.8）。

filter 三件套全部走 CSS 變數，GSAP tween 變數本身：

```css
.tile {
  --f: 0;   /* focusIntensity 0→1 */
  filter: brightness(calc(1 - 0.5 * var(--f)))
          saturate(calc(1 - 0.3 * var(--f)))
          blur(calc(var(--f) * 4px));          /* ← 關鍵：blur 讓非焦點真的退後 */
  will-change: filter;
}
```

```js
tl.addLabel("focus", "s3_process+=1.5");

// 非焦點元素：三濾鏡 + dim 一次 tween 完成
tl.to(".tile:not(.focus-target)", {
  "--f": 1, opacity: 0.4, duration: 0.5, ease: "expo.out",
}, "focus");

// Flash highlight 引導視線迴流。
// 注意：原配方用 element.animate()（WAAPI），那走牆鍾，seek 下不確定，必須翻譯成 tween
tl.fromTo("#focusFlash",
  { backgroundColor: "rgba(255,255,255,0.3)" },
  { backgroundColor: "rgba(255,255,255,0)", duration: 0.15, ease: "power1.out" },
  "focus+=0.5");

// 焦點釋放：settle sharp。交給下一個 scene 前必須把 blur 收回 0，
// 停在半虛化狀態會被觀眾讀成「渲染出 bug 了」
tl.to(".tile", { "--f": 0, opacity: 1, duration: 0.5, ease: "power2.inOut" }, "focus+=2.5");
```

效能約束（來自官方 DoF rule）：blur 半徑大面積元素上 ≤24px；優先「dim + 適度 blur」
而不是把 blur 做到極致；`will-change: filter` 只加在真的動 blur 的元素上。

---

## 4 · 具體運動技巧 · §4 程式碼片段的 GSAP 版

### 4.1 FLIP / Shared Element（按鈕膨脹成輸入框）

為什麼：同一個元素在兩種狀態間過渡，不是兩個元素 cross-fade（best-practices §4.1）。

原配方用 Framer Motion layoutId，GSAP 側不引入 Flip 外掛（在 HyperFrames 下未驗證），
直接手算：合成的可視區是固定的（data-width/height），兩個狀態的幾何都是設計稿常數，
用 fromTo 寫死即可。位移縮放全走 transform，元素保持在最終佈局位置：

```css
/* 元素以「終態」佈局，起態由 transform 表達 */
#search-box { width: 560px; height: 56px; }   /* 靜態終態，不 tween 尺寸 */
```

```js
// 起態幾何：按鈕 120x44 在 (400, 300)，終態輸入框 560x56 在 (200, 300)
tl.fromTo("#search-box",
  { x: 200, y: 0, scaleX: 120/560, scaleY: 44/56, transformOrigin: "left top" },
  { x: 0,   y: 0, scaleX: 1, scaleY: 1, duration: 0.6, ease: "expo.out" },
  "s2_generate");
// 內層文字反向補償或延後進場，避免被 scaleX 拉伸（同 §4.2 的處理）
tl.fromTo("#search-box .placeholder", { autoAlpha: 0 },
  { autoAlpha: 1, duration: 0.3 }, "s2_generate+=0.4");
```

### 4.2 呼吸式展開（先展開、再注水）

為什麼：面板不該同時拉 width 和 height，先橫向展開再縱向撐起才像物理世界
（best-practices §4.2）。

原配方直接 tween width/height，這在 HyperFrames 是 reflow 禁區（整數畫素 snap，
慢速段肉眼可見抖動，§7.2）。翻譯成 scaleX/scaleY，時間錯位保持不變：

```js
// L = 展開總時長；前 40% 拉橫、30% 處開始撐縱，兩段交疊
const L = 0.9;
tl.fromTo("#panel",
  { scaleX: 0, scaleY: 0.12, transformOrigin: "left top" },
  { scaleX: 1, duration: 0.4 * L, ease: "expo.out" }, "open");
tl.to("#panel", { scaleY: 1, duration: 0.7 * L, ease: "expo.out" }, "open+=" + 0.3 * L);

// 內容在殼展開完成後才浮現：既符合「先展開再注水」的意象，
// 又讓 scale 過程中的內容拉伸變形不可見
tl.fromTo("#panel .content", { autoAlpha: 0, y: 8 },
  { autoAlpha: 1, y: 0, duration: 0.35 }, "open+=" + 0.75 * L);
```

注意 scale 版不是逐畫素忠實（圓角和邊框會隨比例變形）。展開殼是純色 / 大圓角面板時
不可察覺；如果面板邊框細節重要，改用「殼固定 + 內容 clip-path 揭示」的方案並實測截幀。

### 4.3 Staggered Fade-up（30ms stagger）

為什麼：列表挨個入場比整塊出現更有「物體感」，30ms 是既定間隔（best-practices §4.3）。

```js
tl.fromTo(".row",
  { y: 10, autoAlpha: 0 },
  { y: 0, autoAlpha: 1, duration: 0.4, ease: "expo.out", stagger: 0.03 },
  "s3_process");

// 變體：從中心向兩側湧現（S4 爆發的多面板湧現常用）
tl.fromTo(".panel",
  { y: 24, autoAlpha: 0, scale: 0.96 },
  { y: 0, autoAlpha: 1, scale: 1, duration: 0.5, ease: "expo.out",
    stagger: { each: 0.03, from: "center" } },
  "s4_boom");
```

用 `fromTo` 不用 `from`：sub-composition 會被反覆 re-seek，`from` 在註冊時刻
快照起始狀態，回拖後可能錯位；`fromTo` 兩端顯式宣告，永遠一致。

### 4.4 關鍵結果前懸停 0.5s

為什麼：機器執行快且連貫，但人腦需要反應時間，關鍵結果前停 0.5 秒是禮讓觀眾
（best-practices §4.4，§0.2 核心信念第 3 條）。

GSAP 裡「懸停」就是 position 參數上的一段空檔，用 label 把停頓寫成顯式設計決策：

```js
// 生成完成的時刻
tl.addLabel("generated", "s2_generate+=1.2");
// loading 態停住 0.5s：這 0.5s 內沒有任何 tween，觀眾盯著載入狀態
tl.addLabel("reveal", "generated+=0.5");

tl.fromTo("#result", { scale: 0.94, autoAlpha: 0 },
  { scale: 1, autoAlpha: 1, duration: 0.7, ease: "expo.out" }, "reveal");
```

### 4.5 Anticipation → Action → Follow-through

為什麼：只有 Action 的動畫是 PowerPoint 動畫，Disney 三段給動作生命感
（best-practices §4.6）。

三段順序 tween，easing 按 §1 對映（預備 power1.in、主動 expo.out、回彈 elastic）：

```js
tl.addLabel("pop", "s2_generate+=0.2");
tl.to("#card", { scale: 0.95, duration: 0.12, ease: "power1.in"  }, "pop");        // 預備
tl.to("#card", { scale: 1.05, duration: 0.30, ease: "expo.out"   }, ">");          // 主動
tl.to("#card", { scale: 1.00, duration: 0.35, ease: "elastic.out(1, 0.3)" }, ">"); // 回彈
```

單 tween 版：`ease: anticipation`（§1.1）一步完成「預備 + 主動」，回彈再補一段。

### 4.6 3D Perspective + translateZ 分層

為什麼：rotateX 8° / rotateY -4° 模擬鏡頭在桌面左上角俯視的 natural angle
（best-practices §4.7）。

透視和分層是靜態 CSS（照抄原配方，perspective / translateZ 不需要動）；
動的部分（入場時立起來、S4 拉遠）用 GSAP 的 3D transform 別名：

```css
.stage-wrap { perspective: 2400px; perspective-origin: 50% 30%; }
.card-grid  { transform-style: preserve-3d; }
.card:nth-child(3n) { transform: translateZ(30px); }
.card:nth-child(5n) { transform: translateZ(-20px); }
.card:nth-child(7n) { transform: translateZ(60px); }
```

```js
// 入場：從正視緩慢立到黃金角
tl.fromTo("#card-grid", { rotationX: 0, rotationY: 0 },
  { rotationX: 8, rotationY: -4, duration: 1.4, ease: "expo.out" }, "s2_generate");
```

### 4.7 斜向 Pan · 同時動 XY，頻率不同

為什麼：X 和 Y 用不同頻率避免 Lissajous 迴圈規則化，模擬手持鏡頭的斜向漂移
（best-practices §4.8）。

原配方是 `Math.sin(flowT * ...)` 逐幀算，GSAP 版用兩條不同 duration 的
yoyo tween 疊加（GSAP 對 x / y 獨立追蹤，兩條 tween 不打架）。repeat 必須有限：

```js
// 週期不同（4.6s vs 2.9s）= 頻率不同，路徑不閉合
// repeat 數從可見時長算出：Math.ceil(D / dur) 保證覆蓋全片
tl.to("#stage", { x: 40, duration: 4.6, ease: "sine.inOut",
  yoyo: true, repeat: Math.ceil(D / 4.6) }, 0);
tl.to("#stage", { y: 30, duration: 2.9, ease: "sine.inOut",
  yoyo: true, repeat: Math.ceil(D / 2.9) }, 0);
```

### 4.8 戛然而止收尾

為什麼：fade out 沒有決定感，最後一幀要清晰、肯定（best-practices §0.3 留白）。

實作上是「不寫程式碼」：S5 的 Logo 落位後，timeline 上不再有任何 tween，
`data-duration` 比最後一個 tween 的結束時刻長 0.5-1s，畫面 hold 在終態。
如果有 BGM，用 volume tween 在尾部收音（volume 在允許列表內）：

```js
tl.to("#bgm", { volume: 0, duration: 0.4 }, "s5_hold+=0.8");  // 音訊截停，畫面不動
```

---

## 5 · 場景配方 A/B/C · timeline 結構要點

設計判斷（選哪種、SFX 密度、BGM 風格）見 best-practices §5，這裡只給 timeline 側的差異。

### 配方 A · Apple Keynote 戲劇式

- 骨架：§2 五段結構原樣，S4 的 Boom 做足
- defaults：`ease: "expo.out"`，強調互動處覆蓋 `"back.out"`
- S4 標誌動作：鏡頭急拉遠 + drop。`tl.to("#stage", { scale: 0.78, y: -40, duration: 1.1, ease: "expo.inOut" }, "s4_boom")`
- S5：Logo Morph（§3.6）+ 空靈單音 + hold

### 配方 B · 一鏡到底工具式

- 骨架：**不用**五段峰值結構，一條持續 flow。label 按 BGM 小節打：
  `tl.addLabel("bar1", 0); tl.addLabel("bar2", 60/88*4);`（88 BPM，一小節 ≈ 2.73s）
- 關鍵 UI 動作的 position 參數直接寫在 kick/snare 時刻上，音樂律動即互動音效
- easing：`springEase`（§1.2）+ `"expo.out"`，落位感多於爆發感
- 沒有 S4 式 Boom，收尾同樣戛然而止

### 配方 C · 辦公效率敘事式

- 骨架：多 scene 硬切。每個 scene 一個 label，scene 間 autoAlpha 快切（0.15s）
  而不是長交疊；配合 Dolly In/Out：
  `tl.fromTo("#scene2", { scale: 1.06 }, { scale: 1, duration: 1.2, ease: "expo.out" }, "sc2")`
- toggle 類互動一律 `"back.out"`，面板一律 `"expo.out"`
- 全片必有一處高光：3D pop-out（§4.6 的 rotationX + translateZ 元素浮起），
  只做一次，到處炫技是廉價訊號（§0.3 克制）

---

## 6 · seek 安全規則（Phase 0 實測，全部踩過）

HyperFrames 渲染是逐幀 seek + 截圖。任何不是「時間的純函式」的狀態都會在
渲染裡出現不確定結果，而且**preview 裡看起來往往是好的**，只有渲染產物才暴露。

### 6.1 禁 CSS transition + class 切換 · 一律用 tween 表達

CSS transition 走瀏覽器牆鍾，不走時間軸。逐幀 seek 時每幀都是一次「狀態突變」，
transition 要麼不觸發、要麼起點錯亂，Phase 0 遷移 c3 時實測中招。

```css
/* ✗ 舊寫法：JS 裡 classList.add('lit')，靠 transition 過渡 */
.capsule { transition: transform 0.3s ease; }
.capsule.lit { transform: scale(1.06); }
```

```js
// ✓ 新寫法：狀態變化本身是 timeline 上的一段 tween
tl.to("#capsule", { scale: 1.06, duration: 0.3, ease: "expo.out" }, "lit_at");
tl.to("#capsule", { scale: 1.0,  duration: 0.3, ease: "expo.out" }, "lit_at+=1.2");
```

同類禁區：`element.animate()`（WAAPI，同樣走牆鍾，§3.8 的 Flash 已給翻譯）、
CSS `@keyframes` animation 用於渲染關鍵動畫。
交付前掃一遍：`grep -n "transition:\|animation:\|\.animate(" index.html`，
命中的每一處要麼刪掉、要麼翻譯成 tween。

### 6.2 禁 animate 觸發 reflow 的屬性 · 用 transform 代替

layout 屬性在瀏覽器 layout 階段 snap 到整數裝置畫素。快速 tween 看不出來；
慢速 ease-out 尾巴上每幀移動不足 1px，就會「憋幾幀、跳 1px」，肉眼可見的抖動。
Phase 0 的 lint 當場抓到 letterSpacing 逐幀抖動，正是這類無報警視覺 bug。

| ✗ 禁 tween | ✓ 忠實替代 |
|---|---|
| `width` / `height` | `scaleX` / `scaleY` + `transformOrigin`（內容處理見 §4.2） |
| `top` / `left` / `right` / `bottom` | 元素停在 CSS 終態位，tween `x` / `y` 偏移量 |
| `fontSize` | `scale`（視覺等價，sub-pixel 平滑） |
| `letterSpacing` / `wordSpacing` | 逐字 split 後 tween 每個字元的 `x`（uniform scale 不是同一個效果，它縮放字形而不是字距） |
| `margin*` / `padding*` | 佈局寫死，動 `x` / `y` |

修復原則：**重現同一個視覺，只去掉抖動**。過 lint 不是標準，和原動畫逐幀對比才是。

### 6.3 t=0 時 onUpdate 不觸發 · 代理 tween 必須手動補首幀

timeline seek 到 0 時 proxy tween 的 `onUpdate` 可能不觸發，首幀就是白畫面 / 初始 DOM。
所有 proxy 驅動的場景（§3.4 chunk reveal、§3.5 滑鼠、§7 老 demo 介面卡），
註冊完 timeline 後手動調一次：

```js
window.__timelines["main"] = tl;
render(0);   // 首幀保險：把 t=0 的畫面顯式畫出來
```

### 6.4 禁 Math.random / Date.now · 隨機用種子函式

同一幀每次 seek 必須得到同一畫面。執行時隨機 = 每次渲染不同 = 無法逐幀渲染。
需要「隨機感」（粒子、抖動、不規律間隔）時用 mulberry32，**建 timeline 前**
一次性生成所有隨機值（Phase 0 的 3D 粒子 demo 實測寫法）：

```js
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260717);   // 種子寫死，改種子 = 換一版隨機

// 用法：預生成，不在 onUpdate 裡現抽
const offsets = Array.from({ length: 40 }, () => (rand() - 0.5) * 24);
```

同理停用：`Date.now()`、`performance.now()`、任何事件驅動狀態（渲染模式沒有輸入事件）。

---

## 7 · 老 demo 介面卡配方 · render(t) 掛進 GSAP

21 個自研引擎老 demo 的動畫核心都是 `render(t)` 純函式。遷移不重寫動畫邏輯，
用一個代理 tween 把 render(t) 掛到 GSAP timeline 上（Phase 0 實測：單個 demo
20-30 分鐘，動畫程式碼一行不改，c3 電影級 demo 1134 行驗證透過）。

### 7.1 代理 tween 模板（12 行，c3 實測原版）

```js
// =============== HyperFrames adapter ===============
// 代理 tween 驅動原 render(t)。每一幀都是時間軸時間的純函式：
// 無 rAF、無時鐘、無輸入狀態。
window.__timelines = window.__timelines || {};
const proxy = { t: 0 };
const tl = gsap.timeline({ paused: true });
tl.to(proxy, {
  t: T.DURATION,            // 老 demo 的總時長常數
  duration: T.DURATION,
  ease: "none",             // 時間必須勻速對映，easing 在 render(t) 內部
  onUpdate: () => render(proxy.t),
}, 0);
window.__timelines["main"] = tl;

// 首幀保險（timeline 停在 t=0 時 onUpdate 不觸發，§6.3）
render(0);
```

### 7.2 遷移四步

1. **包 root / clip**：給最外層容器加合成根屬性
   （`data-composition-id="main"` + `data-duration` + 尺寸），
   舞臺元素加 `.clip` 及 `data-start` / `data-duration` / `data-track-index`。
   完整契約見 `hyperframes-backend.md`
2. **刪自驅**：刪掉 rAF 迴圈、`setInterval`、自動 play 邏輯、
   `performance.now()` 起點。`render(t)` 只吃參數 t，不再自己找時間
3. **掛 proxy**：粘 §7.1 模板，`T.DURATION` 對上 `data-duration`，末尾 `render(0)`
4. **掃 transition**：`grep -n "transition:\|animation:\|\.animate(\|Math.random\|Date.now\|performance.now"`
   逐條清零。class 切換類效果按 §6.1 改成 t 的純函式（老 demo 最常見的殘留
   就是「classList.add + transition」組合）

遷完跑一次 `npx hyperframes check`（暗色 cinematic 用 `--no-contrast`，
其餘四門必須 0 error），再抽 3-4 個關鍵時刻截幀和老版對比。

### 7.3 什麼時候不用介面卡

介面卡是**存量遷移**方案。新寫的動畫直接用本檔案 §0-§5 的原生 timeline 寫法：
label 可讀、stagger 宣告式、GSAP inspector 能逐 tween 檢查，
proxy 大黑盒裡的動畫對審計工具是不透明的。

---

## 8 · 交付前自檢（GSAP 側，補充 best-practices §7 清單)

- [ ] timeline `paused: true`，註冊 key 等於 `data-composition-id`？
- [ ] defaults 是 `expo.out`，沒有裸 `linear` / `ease` 出現在元素動效上？
- [ ] 五段 label 齊全，S5 之後有 hold 留白（沒有 fade out）？
- [ ] `grep "transition:\|\.animate(\|Math.random\|Date.now"` 結果為 0？
- [ ] 沒有 tween width / height / top / left / letterSpacing / fontSize？
- [ ] 所有 `repeat` 是有限數？
- [ ] proxy 場景末尾補了 `render(0)`？
- [ ] blur / filter 全部走 CSS 變數，動過 blur 的元素有 `will-change: filter`？
- [ ] sub-composition 裡入場全用 `fromTo` 不用 `from`？
- [ ] `npx hyperframes check` 透過（暗色片 `--no-contrast`，其餘 0 error）？

---

## 9 · Camera Rig 配方 · 鏡頭運動的實作層

為什麼：鏡頭運動和元素動畫搶同一個 transform 是運鏡混亂的技術根源
（camera-language.md §3）。所有鏡頭級 tween 收口到專職 rig 容器，
相機狀態用一個 proxy 物件承載，每幀由它推匯出全部相機 DOM 狀態，seek-safe。

### 9.1 rig 容器結構（靜態骨架）

```html
<div id="viewport">                <!-- 固定可視區 -->
  <div id="camera">                <!-- 鏡頭層：只有相機 transform -->
    <div id="world">...</div>      <!-- 世界層：元素動畫只發生在這裡面 -->
  </div>
  <div id="hud">...</div>          <!-- 字幕/角標：#camera 的兄弟，天然靜止 -->
</div>
```

```css
#viewport { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
#camera   { position: absolute; inset: 0; perspective-origin: 960px 540px; }
#world    { position: absolute; transform-origin: 0 0; will-change: transform; }
/* pan 露邊保險：#world 尺寸 ≥ 可視區 + 最大 pan 振幅 + 8% 邊距（camera-language §3.3） */
```

### 9.2 相機 proxy + PageCam 關鍵幀翻譯

相機是一個普通物件，GSAP tween 它的欄位，`onUpdate` 裡把狀態寫進 DOM。
一切由 cam 推導，回拖也正確（同 §3.4 chunk reveal 的 proxy 思路）：

```js
const cam = { cx: 960, cy: 540, zoom: 1, rotX: 0, rotY: 0, rotZ: 0, persp: 1200 };
const camEl = document.querySelector("#camera");
const world = document.querySelector("#world");

// ── 平面模式（純 zoom + pan，無旋轉）──────────────────────────
function applyCam() {
  world.style.transform =
    `translate(${960 - cam.cx * cam.zoom}px, ${540 - cam.cy * cam.zoom}px) scale(${cam.zoom})`;
  applyCounter();
}

// ── 3D 模式（有 rotX/rotY/rotZ）· 放大走 CSS zoom 屬性，不走 scale ──
// 佈局級縮放讓 Chromium 按放大後尺寸柵格化，根治 3D 下文字發糊
// （camera-language §3.4，全庫最貴知識）。zoom 改變座標系，translate 要除以 zoom。
function applyCam3d() {
  camEl.style.perspective = `${cam.persp * cam.zoom}px`;
  world.style.zoom = cam.zoom;
  world.style.transformOrigin = `${cam.cx}px ${cam.cy}px`;
  world.style.transform =
    `translate(${960 / cam.zoom - cam.cx}px, ${540 / cam.zoom - cam.cy}px)` +
    ` rotateY(${cam.rotY}deg) rotateX(${cam.rotX}deg) rotateZ(${cam.rotZ}deg)`;
  applyCounter();
}
```

注意：CSS `zoom` 每幀觸發 re-layout，是 §6.2 reflow 禁令的**唯一合法例外**，
只允許用在 `#world` 相機層。HyperFrames / Playwright 離線逐幀渲染下單幀耗時不影響產物；
即時 preview 掉幀屬正常，以渲染產物為準。

### 9.3 對數時長 helper（固定 duration 是業餘感的來源）

```js
// camera-language §4.2：1→2x 正好 0.55s，任何幅度的 zoom 視覺速度一致
function zoomDur(z1, z2) {
  return gsap.utils.clamp(0.30, 0.94,
    0.55 * Math.abs(Math.log(z2 / z1)) / Math.LN2);
}
```

### 9.4 鏡頭段落寫法（推近 → hold → 平移 → 謝幕拉出）

鏡頭 tween 全部驅動 cam，easing 按 camera-language §4.1：
主動推拉 `power3.inOut`，跟隨式 `cubic-bezier(0.33,0,0.15,1)`（自訂 ease 見下）。

```js
const followEase = gsap.parseEase("0.33,0,0.15,1");   // shotcraft 相機預設

// 定場微推：開機即 1.06x，3s 緩出回全景（片長 >14s 且首鏡 >7s 時才加）
tl.fromTo(cam, { zoom: 1.06 },
  { zoom: 1, duration: 3.0, ease: "power2.out", onUpdate: applyCam }, 0);

// 推近特寫：目標點 (1240, 430)，1 → 1.8x，時長由公式給
tl.to(cam, { cx: 1240, cy: 430, zoom: 1.8,
  duration: zoomDur(1, 1.8), ease: "power3.inOut", onUpdate: applyCam },
  "s2_generate");
// 鏡頭到位後 hold ≥1.2s 再走（不寫 tween 就是 hold）

// 中距焦點轉移：不回 1x，直接平移過去（鏡間語法：0.22-0.45 改平移）
tl.to(cam, { cx: 880, cy: 620,
  duration: 0.7, ease: followEase, onUpdate: applyCam }, "s3_process+=1.5");

// 謝幕：0.55s 拉出 + ≥0.8s 全景停頓，data-duration 覆蓋到停頓末尾
tl.to(cam, { cx: 960, cy: 540, zoom: 1,
  duration: 0.55, ease: "power3.inOut", onUpdate: applyCam }, "s5_hold");

window.__timelines["main"] = tl;
applyCam();   // 首幀保險：timeline 停在 t=0 時 onUpdate 不觸發（§6.3）
```

鏡頭預算不寫在程式碼裡，寫在排鏡時：相鄰鏡頭 tween 起點間隔 ≥2.6s、
15s 視窗 ≤4-5 個、<1.25x 的 zoom 不排（camera-language §0/§4.4）。

### 9.5 counter-transform · 跟隨字幕/標註保持字號恆定

字幕和 chrome 首選放 `#hud`（不跟鏡頭，零成本）。必須掛在 world 內、
跟著元素走但字號要恆定的標註，反向抵消鏡頭縮放：

```js
const counters = gsap.utils.toArray(".cam-counter");   // 需要恆定字號的標註
function applyCounter() {
  const inv = 1 / cam.zoom;
  counters.forEach((el) => { el.style.transform = `scale(${inv})`; });
}
```

`.cam-counter` 自身的入場動畫寫在其**子元素**上，避免和 counter scale 搶 transform。

### 9.6 多層 parallax · 全部由 cam 推導

每層不給獨立 tween，速度係數乘同一個相機位移（層間係數比 ≥2 倍、≤4 層，
camera-language §8.1），天然同步、天然 seek-safe：

```js
const LAYERS = [
  { el: document.querySelector("#bg"),  k: 0.35 },
  { el: document.querySelector("#mid"), k: 0.7  },
  { el: document.querySelector("#fg"),  k: 1.4  },
];
function applyParallax() {
  const dx = 960 - cam.cx, dy = 540 - cam.cy;    // 相機位移
  LAYERS.forEach(({ el, k }) => {
    el.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  });
}
// 把 applyParallax() 追加進 applyCam() 末尾即可
```

### 9.7 Camera Rig 自檢（追加到 §8 清單）

- [ ] 鏡頭 tween 只動 cam proxy，`#world` 內元素沒有被相機 tween 碰過？
- [ ] 註冊 timeline 後補了 `applyCam()` 首幀？
- [ ] 3D 文字特寫用了 CSS `zoom`，沒有 `scale()` 放大發糊？
- [ ] `zoom` 屬性只出現在 `#world` 上（reflow 例外不擴散）？
- [ ] 推拉時長全部來自 `zoomDur()`，沒有手寫常數？
- [ ] 謝幕拉出後有 ≥0.8s 無 tween 的全景 hold？
