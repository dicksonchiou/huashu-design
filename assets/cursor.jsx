/**
 * Cursor — 產品 UI 示範游標元件包
 *
 * 配合 browser_window.jsx / macos_window.jsx 使用，配方與引數出處見
 * references/ui-demo-animation.md 八式④（軌跡演算法：animation-best-practices §3.5；
 * ripple 引數：shotcraft·type-and-filter + 解耦配方；seek 安全規則：gsap-recipes §6）。
 *
 * 幀確定性：全檔案禁 Math.random / Date.now，隨機感一律 mulberry32 種子推導。
 * 同一幀無論 seek 多少次，畫面完全一致。
 *
 * ── 用法A · Stage 時鐘（animations.jsx）─────────────────────────
 *
 *   const { Stage, Sprite } = window.Animations;
 *   const { CursorSprite, ClickRipple, HoverHighlight } = window;
 *
 *   <Stage duration={8}>
 *     <Sprite start={1} end={2.2}>   {/* 游標弧線移到按鈕，末段收斂手抖 *\/}
 *       <CursorSprite points={[[220, 480], [860, 300]]} seed={7} clickAt={0.96} />
 *     </Sprite>
 *     <Sprite start={2.1} end={3.0}> {/* 點選漣漪：雙圈解耦 *\/}
 *       <ClickRipple x={860} y={300} color="#D97757" duration={0.9} />
 *     </Sprite>
 *   </Stage>
 *
 *   hover 連動醒目提示（時間驅動命中，非事件驅動）：
 *     const sampler = window.CursorKit.buildCursorSampler(points, { seed: 7 });
 *     const hovered = window.CursorKit.hoverIndexAt(sampler, easedU, [
 *       { id: 'save', rect: { x: 820, y: 270, w: 96, h: 44 } },
 *     ]);
 *     <HoverHighlight rect={{...}} intensity={hovered === 'save' ? 1 : 0} />
 *
 *   拖曳：游標傳入 dragRange={[0.2, 0.8]}（區間內切換為抓取手型並微縮），
 *   被拖曳的元素使用同一個 sampler，扣除抓取點偏移後驅動，游標與元素永遠同步。
 *
 * ── 用法B · GSAP timeline（HyperFrames 渲染）───────────────────
 *
 *   const K = window.CursorKit;
 *   const sampler = K.buildCursorSampler([[220, 480], [860, 300]], { seed: 7 });
 *   K.attachCursorTween(tl, '#cursor', sampler, { duration: 1.1, position: 's1+=0.5' });
 *   K.attachClickTween(tl, '#cursor', { position: '>' });
 *   K.attachRippleTween(tl, '#rip1', '#rip2', { position: '<' });
 *   // 別忘了 gsap-recipes §6.3 的首幀保險：註冊 timeline 後手動補一次初始 set
 *
 * 游標形狀：arrow（macOS 箭頭，預設）/ hand（可點手型）/ grab（拖曳中）/ text（I-beam）
 */

/* ══════════════ 工具層（純函式，兩種驅動共用）══════════════ */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CursorEasing = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inQuad: (t) => t * t,
};

// Catmull-Rom 單段插值（p1→p2，p0/p3 是相鄰控制點）
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

/**
 * buildCursorSampler(points, opts) → sample(u) → {x, y}
 *
 * - points 只有 2 個時自動插一個偏離中點的控制點做弧線
 *   （真人滑鼠不走直線，best-practices §3.5），偏移方向由 seed 決定
 * - ≥3 個點走 Catmull-Rom 平滑（huarec 游標平滑同款插值）
 * - 手抖：兩條不可通約頻率正弦疊加，幅度 ±wobble px，
 *   隨 u→1 收斂到 0（接近目標時人手會穩）
 */
function buildCursorSampler(points, opts) {
  const o = Object.assign({ seed: 7, wobble: 2, arc: 0.18 }, opts);
  const rand = mulberry32(o.seed);
  const ph1 = rand() * 6.283, ph2 = rand() * 6.283;
  const side = rand() < 0.5 ? -1 : 1;

  let pts = points.map((p) => [p[0], p[1]]);
  if (pts.length === 2) {
    const [a, b] = pts;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const mid = [a[0] + dx * 0.5 - dy * o.arc * side, a[1] + dy * 0.5 + dx * o.arc * side];
    pts = [a, mid, b];
  }
  // 首尾補虛擬點，讓 Catmull-Rom 覆蓋全程
  const ext = [pts[0], ...pts, pts[pts.length - 1]];
  const segs = pts.length - 1;

  return function sample(u) {
    const uu = Math.max(0, Math.min(1, u));
    const f = uu * segs;
    const i = Math.min(segs - 1, Math.floor(f));
    const lt = f - i;
    const [x0, y0] = catmullRom(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], lt);
    const damp = o.wobble * (1 - uu);            // 接近目標收斂
    return {
      x: x0 + Math.sin(uu * 47.13 + ph1) * damp, // 47.13 / 33.7 不可通約
      y: y0 + Math.sin(uu * 33.7 + ph2) * damp,
    };
  };
}

// hover 命中：時間驅動的確定性 hit test（不是事件監聽）
function hoverIndexAt(sampler, u, targets, pad) {
  const p = sampler(u);
  const m = pad || 0;
  for (const t of targets) {
    const r = t.rect;
    if (p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m) return t.id;
  }
  return null;
}

/**
 * rippleRingState(tSec, opts) → { scale, opacity }
 * 雙圈 ripple 的單圈狀態。擴散與消散解耦（shotcraft 實測配方）：
 *   擴散 out-cubic EXPAND 幀（衝），消散線性 FADE 幀（勻），FADE > EXPAND。
 * 預設 22f/26f@30fps；緊湊場景（type-and-filter）可壓到各 10f。
 */
function rippleRingState(tSec, opts) {
  const o = Object.assign({ delayF: 0, expandF: 22, fadeF: 26, r0: 14, r1: 54, fps: 30 }, opts);
  const t = tSec - o.delayF / o.fps;
  if (t < 0) return { scale: o.r0 / o.r1, opacity: 0 };
  const pe = Math.min(1, t / (o.expandF / o.fps));
  const pf = Math.min(1, t / (o.fadeF / o.fps));
  return {
    scale: (o.r0 + (o.r1 - o.r0) * CursorEasing.outCubic(pe)) / o.r1,
    opacity: 1 - pf,
  };
}

/* ══════════════ 游標形狀（SVG，黑體白描邊，paintOrder 保準確輪廓）══════════════ */

const CURSOR_PATHS = {
  // macOS 箭頭：左緣垂直、斜邊到右翼、帶點選尾。熱點在 (0,0)
  arrow: {
    viewBox: '0 0 17 22',
    d: 'M1.5 1.5 L1.5 18.6 L6.4 13.9 L9.1 20.3 L11.9 19.1 L9.2 12.8 L14.5 12.8 Z',
    hotspot: [1.5, 1.5],
  },
  // 可點手型（簡化食指手）。熱點在指尖
  hand: {
    viewBox: '0 0 22 24',
    d: 'M9.2 1.9 c1 0 1.5 .7 1.5 1.6 v6.1 l1 .1 v-4.4 c0-1.9 2.8-1.9 2.8 0 v4.7 l.9 .1 v-3.2 c0-1.8 2.6-1.8 2.6 0 v3.6 l.9 .2 v-1.6 c0-1.6 2.3-1.6 2.3 0 v5.6 c0 4.3-2.9 7.3-7.3 7.3 h-2.1 c-2.9 0-4.5-1.3-5.9-3.7 L3.1 13.4 c-.7-1.2 .8-2.4 1.9-1.5 l2.7 2.3 V3.5 c0-.9 .6-1.6 1.5-1.6 Z',
    hotspot: [9.9, 1.9],
  },
  // 拖曳中（握拳）：hand 的收指變體
  grab: {
    viewBox: '0 0 22 22',
    d: 'M5.4 7.2 c0-1.7 2.5-1.7 2.5 0 v2.1 l.9 0 v-3.3 c0-1.8 2.7-1.8 2.7 0 v3.3 l.9 0 v-2.9 c0-1.8 2.6-1.8 2.6 0 v3 l.9 .1 v-1.7 c0-1.6 2.3-1.6 2.3 0 v5.1 c0 4.2-2.8 7-7.1 7 h-1.9 c-2.8 0-4.4-1.2-5.7-3.6 L2.5 13.1 c-.6-1.2 .8-2.3 1.8-1.4 l1.1 .9 Z',
    hotspot: [10, 8],
  },
  // 文字 I-beam。熱點在中心
  text: {
    viewBox: '0 0 10 22',
    d: 'M1 1.5 h3 v0 c.4 0 .7 .2 1 .5 c.3-.3 .6-.5 1-.5 h3 v2 h-2.6 c-.2 0-.4 .2-.4 .4 v14.2 c0 .2 .2 .4 .4 .4 H9 v2 H6 c-.4 0-.7-.2-1-.5 c-.3 .3-.6 .5-1 .5 H1 v-2 h2.6 c.2 0 .4-.2 .4-.4 V3.9 c0-.2-.2-.4-.4-.4 H1 Z',
    hotspot: [5, 11],
  },
};

function CursorIcon({ variant = 'arrow', size = 22 }) {
  const s = CURSOR_PATHS[variant] || CURSOR_PATHS.arrow;
  return (
    <svg width={size} height={size * 1.25} viewBox={s.viewBox}
      style={{ display: 'block', overflow: 'visible' }}>
      <path d={s.d} fill="#111" stroke="#fff" strokeWidth="1.4"
        strokeLinejoin="round" style={{ paintOrder: 'stroke' }} />
    </svg>
  );
}

/* ══════════════ Stage 時鐘元件（配合 animations.jsx）══════════════ */

/**
 * CursorSprite — 放在 <Sprite> 內，沿路徑移動的游標
 *
 * props:
 *   points     [[x,y],...] 路徑點（舞臺座標）。2 個點自動成弧
 *   seed       隨機種子（換 seed = 換一版弧線和手抖）
 *   wobble     手抖幅度 px（預設 2，best-practices §3.5 的 ±2px）
 *   ease       進度緩動，預設 inOutQuad（起步加速+到達減速的對稱人手感）
 *   clickAt    0-1，此進度處做點選下壓（scale 0.85 dip + 回彈，Anticipation）
 *   dragRange  [u0,u1]，區間內切 grab 手型 + scale 0.94
 *   variant    基礎形狀，預設 'arrow'
 *   size       游標寬 px，預設 22
 */
function CursorSprite({
  points, seed = 7, wobble = 2, ease = CursorEasing.inOutQuad,
  clickAt = null, dragRange = null, variant = 'arrow', size = 22, style,
}) {
  const { useSprite } = window.Animations;
  const { t } = useSprite();
  const sampler = React.useMemo(
    () => buildCursorSampler(points, { seed, wobble }),
    [JSON.stringify(points), seed, wobble]
  );
  const u = ease(t);
  const p = sampler(u);

  let scale = 1;
  let shape = variant;
  if (dragRange && u >= dragRange[0] && u <= dragRange[1]) {
    shape = 'grab';
    scale = 0.94;
  }
  if (clickAt !== null) {
    const d = (u - clickAt) / 0.05;              // 點選視窗 ±5% 進度
    if (d >= 0 && d < 1) scale *= 0.85 + 0.15 * CursorEasing.outCubic(d);      // 回彈
    else if (d >= -0.6 && d < 0) scale *= 1 - 0.15 * CursorEasing.inQuad(1 + d / 0.6); // 下壓
  }

  const hs = (CURSOR_PATHS[shape] || CURSOR_PATHS.arrow).hotspot;
  const k = size / 17;                            // 視覺尺寸正規化
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, zIndex: 999, pointerEvents: 'none',
      transform: `translate(${p.x - hs[0] * k}px, ${p.y - hs[1] * k}px) scale(${scale})`,
      transformOrigin: `${hs[0] * k}px ${hs[1] * k}px`,
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
      ...style,
    }}>
      <CursorIcon variant={shape} size={size} />
    </div>
  );
}

/**
 * ClickRipple — 雙圈同心漣漪（放在獨立 <Sprite> 裡，從點選幀開始）
 * 雙圈起點差 3f；半徑 14→54 / 14→78；擴散 out-cubic 22f、消散線性 26f 解耦。
 * duration = 所在 Sprite 的時長（秒），用於把本地進度換算回秒。
 */
function ClickRipple({ x, y, color = '#D97757', r1 = 54, r2 = 78, duration = 0.9, fps = 30 }) {
  const { useSprite } = window.Animations;
  const { t } = useSprite();
  const tSec = t * duration;
  const rings = [
    { rMax: r1, st: rippleRingState(tSec, { delayF: 0, r1, fps }) },
    { rMax: r2, st: rippleRingState(tSec, { delayF: 3, r1: r2, fps }) },
  ];
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 998, pointerEvents: 'none' }}>
      {rings.map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: -r.rMax, top: -r.rMax, width: r.rMax * 2, height: r.rMax * 2,
          borderRadius: '50%',
          border: `3px solid ${color}`,
          boxShadow: `0 0 40px ${color}55`,
          transform: `scale(${r.st.scale})`,      // 固定尺寸 + scale，不 tween 寬高
          opacity: r.st.opacity,
        }} />
      ))}
    </div>
  );
}

/**
 * HoverHighlight — 游標 hover 目標的連動醒目提示
 * intensity 0→1 由呼叫方從時間推導（配 hoverIndexAt），本元件只負責渲染：
 * hairline 描邊浮現 + 輕微提亮，游標離開即撤。
 */
function HoverHighlight({ rect, intensity = 0, color = '#D97757', radius = 8 }) {
  if (intensity <= 0) return null;
  return (
    <div style={{
      position: 'absolute', left: rect.x - 3, top: rect.y - 3,
      width: rect.w + 6, height: rect.h + 6,
      borderRadius: radius, pointerEvents: 'none',
      border: `1.5px solid ${color}`,
      boxShadow: `0 0 0 3px ${color}22`,
      opacity: intensity,
      backdropFilter: `brightness(${1 + 0.06 * intensity})`,
    }} />
  );
}

/* ══════════════ GSAP 驅動層（HyperFrames 渲染管線）══════════════ */

/**
 * attachCursorTween — proxy tween 驅動游標 DOM 元素沿 sampler 路徑移動
 * （gsap-recipes §3.5 的元件化封裝；一切由 proxy.u 推導，seek-safe）
 */
function attachCursorTween(tl, target, sampler, opts) {
  const o = Object.assign({ duration: 1.1, ease: 'power1.inOut', position: '>' }, opts);
  const proxy = { u: 0 };
  tl.to(proxy, {
    u: 1, duration: o.duration, ease: o.ease,
    onUpdate: () => {
      const p = sampler(proxy.u);
      gsap.set(target, { x: p.x, y: p.y });
    },
  }, o.position);
  return proxy;
}

/** attachClickTween — 點選 Anticipation：下壓 0.85 再 back.out 回彈 */
function attachClickTween(tl, target, opts) {
  const o = Object.assign({ position: '>' }, opts);
  tl.to(target, { scale: 0.85, duration: 0.08, ease: 'power1.in' }, o.position);
  tl.to(target, { scale: 1, duration: 0.25, ease: 'back.out' }, '>');
}

/**
 * attachRippleTween — 雙圈 ripple。ring1/ring2 是兩個固定尺寸的圓環元素
 * （直徑 = 2×終態半徑，初始 scale = r0/r1），只 tween scale 和 opacity。
 */
function attachRippleTween(tl, ring1, ring2, opts) {
  const o = Object.assign({ r0: 14, r1: 54, r2: 78, fps: 30, position: '>' }, opts);
  const F = (n) => n / o.fps;
  [[ring1, o.r1, 0], [ring2, o.r2, 3]].forEach(([el, rMax, delayF]) => {
    const at = delayF === 0 ? o.position : '<+=' + F(delayF);
    tl.fromTo(el, { scale: o.r0 / rMax, autoAlpha: 1 },
      { scale: 1, duration: F(22), ease: 'power3.out' }, at);          // 擴散：衝
    tl.to(el, { autoAlpha: 0, duration: F(26), ease: 'none' }, '<');   // 消散：勻，解耦
  });
}

/* ══════════════ 匯出 ══════════════ */

if (typeof window !== 'undefined') {
  window.CursorIcon = CursorIcon;
  window.CursorSprite = CursorSprite;
  window.ClickRipple = ClickRipple;
  window.HoverHighlight = HoverHighlight;
  window.CursorKit = {
    mulberry32,
    CursorEasing,
    buildCursorSampler,
    hoverIndexAt,
    rippleRingState,
    attachCursorTween,
    attachClickTween,
    attachRippleTween,
    CURSOR_PATHS,
  };
}
