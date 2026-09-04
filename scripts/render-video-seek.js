#!/usr/bin/env node
/**
 * HTML animation → MP4 via deterministic frame-by-frame SEEK (Playwright + ffmpeg).
 *
 * 這是 render-video.js（Playwright recordVideo）的逐幀替代渲染器。技術核心借鑑
 * HeyGen HyperFrames（Apache 2.0）的「凍結時鐘 + seek 到時間戳截圖」思路，但不引入
 * 任何第三方包——只用本 skill 已有的 playwright + ffmpeg，runtime 中立。
 *
 * 相比 render-video.js 解決的三個死結（見 references/video-export.md §「seek 渲染」）：
 *   1. 幀率不再被 Chromium headless compositor 鎖死 25fps —— --fps 原生任意幀率
 *   2. 不再需要 convert-formats.sh 的 minterpolate 事後插幀（有 ghosting + macOS
 *      QuickTime 相容 bug，見 animation-pitfalls §14）—— 每幀都是真實 seek 畫面
 *   3. 不錄屏 → 無開頭黑幀 → 不需要 --trim / --fontwait / __ready 偏移那套邏輯
 *   額外：seek 到時間戳截圖，同輸入同輸出 deterministic（recordVideo 是實時錄製非確定性）
 *
 * 前提：動畫必須走 Stage 時鐘（assets/animations.jsx 的 <Stage> 或 narration_stage.jsx
 * 的 <NarrationStage>），它們會響應 window.__seekRender 凍結自驅時鐘、並暴露
 * window.__seek(t)。純 CSS @keyframes / Lottie / 非 Stage 驅動的動畫不吃 __seek，
 * 這類請繼續用 render-video.js。
 *
 * Requires: global playwright (`npm install -g playwright`), ffmpeg on PATH.
 *
 * Usage:
 *   NODE_PATH=$(npm root -g) node render-video-seek.js <html-file> \
 *     [--duration=30] [--fps=60] [--width=1920] [--height=1080] \
 *     [--concurrency=4] [--settle=2] [--keep-chrome] [--allow-network]
 *
 * Output: next to the HTML file, same basename with .mp4 suffix.
 * Network access is blocked by default; --allow-network is an explicit opt-in.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { configureNetworkPolicy, secureContextOptions } = require('./playwright-network-policy');

function arg(name, def) {
  const p = process.argv.find(a => a.startsWith('--' + name + '='));
  return p ? p.slice(name.length + 3) : def;
}
function hasFlag(name) {
  return process.argv.includes('--' + name);
}

const HTML_FILE = process.argv[2];
if (!HTML_FILE || HTML_FILE.startsWith('--')) {
  console.error('Usage: node render-video-seek.js <html-file>');
  console.error('Example: NODE_PATH=$(npm root -g) node render-video-seek.js my-animation.html --fps=60');
  process.exit(1);
}

const DURATION    = parseFloat(arg('duration', '30'));
const FPS         = parseFloat(arg('fps', '60'));      // 原生任意幀率，預設真 60fps
const WIDTH       = parseInt(arg('width', '1920'));
const HEIGHT      = parseInt(arg('height', '1080'));
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '4')));  // 並行 worker 數（每個一個 page）
const SETTLE      = Math.max(1, parseInt(arg('settle', '2')));        // seek 後等幾個 rAF 再截圖
const READY_TIMEOUT = parseFloat(arg('readytimeout', '8'));
const KEEP_CHROME = hasFlag('keep-chrome');
const ALLOW_NETWORK = hasFlag('allow-network');

const HTML_ABS = path.resolve(HTML_FILE);
const BASENAME = path.basename(HTML_FILE, path.extname(HTML_FILE));
const DIR      = path.dirname(HTML_ABS);
const TMP_DIR  = path.join(DIR, '.seek-tmp-' + Date.now() + '-' + process.pid);
const MP4_OUT  = path.join(DIR, BASENAME + '.mp4');

// 與 render-video.js 完全一致的 chrome 隱藏規則（保證兩條鏈路出片外觀一致）
const HIDE_CHROME_CSS = `
  .no-record,
  .progress, .progress-bar,
  .counter, .tCur,
  .phases, .phase-label, .phase,
  .replay, button.replay,
  .masthead, .kicker, .title,
  .footer,
  [data-role="chrome"], [data-record="hidden"] {
    display: none !important;
  }
`;

const TOTAL_FRAMES = Math.round(FPS * DURATION);

console.log(`▸ Seek-rendering: ${HTML_FILE}`);
console.log(`  size: ${WIDTH}x${HEIGHT} · ${FPS}fps · duration: ${DURATION}s · frames: ${TOTAL_FRAMES} · workers: ${CONCURRENCY}`);
console.log(`  output: ${MP4_OUT}`);
console.log(`  network: ${ALLOW_NETWORK ? 'allowed (--allow-network)' : 'blocked (default)'}`);

// 在 page 上下文裡執行：等 SETTLE 個 rAF（讓 React/Babel commit + 佈局穩定後再截圖）
async function waitRaf(page, n) {
  await page.evaluate((count) => new Promise(resolve => {
    let i = 0;
    const step = () => { i++; (i >= count) ? resolve() : requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), n);
}

// 一個 worker：開一個 page，goto，等 __seek 就緒，渲染分配給它的幀
async function renderFrames(context, url, frames) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // Stage / NarrationStage 在 __seekRender 模式下會暴露 window.__seek 並凍結自驅時鐘
  await page.waitForFunction(
    () => window.__ready === true && typeof window.__seek === 'function',
    { timeout: READY_TIMEOUT * 1000 },
  );

  for (const f of frames) {
    const t = f / FPS;
    await page.evaluate((tt) => window.__seek(tt), t);
    await waitRaf(page, SETTLE);
    await page.screenshot({
      path: path.join(TMP_DIR, 'frame-' + String(f).padStart(6, '0') + '.png'),
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
  }
  await page.close();
}

(async () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const browser = await chromium.launch();
  const url = 'file://' + HTML_ABS;

  const context = await browser.newContext(secureContextOptions({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  }, { allowNetwork: ALLOW_NETWORK }));
  await configureNetworkPolicy(context, { allowNetwork: ALLOW_NETWORK });

  // 關鍵訊號：__seekRender 讓 Stage / NarrationStage 凍結 wall-clock rAF，改由外部 __seek 推幀
  // __recording 沿用，讓 Stage 強制 loop=false（複用既有約定）
  await context.addInitScript(() => {
    window.__recording = true;
    window.__seekRender = true;
  });

  if (!KEEP_CHROME) {
    // 與 render-video.js 同款 chrome 隱藏（CSS + 固定欄啟發式）
    await context.addInitScript(css => {
      const HIDE_MARK = 'data-video-hidden';
      function injectStyle() {
        const style = document.createElement('style');
        style.setAttribute('data-inject', 'render-video-chrome-hide');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      }
      function hideChromeBars() {
        const vh = window.innerHeight;
        document.querySelectorAll('div, nav, header, footer, section, aside')
          .forEach(el => {
            if (el.hasAttribute(HIDE_MARK)) return;
            if (el.dataset.recordKeep === 'true') return;
            const s = getComputedStyle(el);
            if (s.position !== 'fixed' && s.position !== 'sticky') return;
            const r = el.getBoundingClientRect();
            if (r.height > vh * 0.25) return;
            const atBottom = r.bottom >= vh - 30;
            const atTop = r.top <= 30 && r.height < 80;
            if (!atBottom && !atTop) return;
            const txt = el.textContent || '';
            const hasBtn = !!el.querySelector('button, [role="button"]');
            const hasCtrls = /[⏸▶⏮⏭↻↺↩↪]|\d+\.\d+\s*s/.test(txt);
            if (hasBtn || hasCtrls) {
              el.style.setProperty('display', 'none', 'important');
              el.setAttribute(HIDE_MARK, '1');
            }
          });
      }
      const start = () => {
        injectStyle();
        hideChromeBars();
        const obs = new MutationObserver(hideChromeBars);
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 6000);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    }, HIDE_CHROME_CSS);
  }

  // 把幀 round-robin 分給 CONCURRENCY 個 worker（每個 page 獨立 window，seek 彼此不受影響）
  const buckets = Array.from({ length: CONCURRENCY }, () => []);
  for (let f = 0; f < TOTAL_FRAMES; f++) buckets[f % CONCURRENCY].push(f);

  console.log(`▸ Capturing ${TOTAL_FRAMES} frames across ${CONCURRENCY} workers…`);
  try {
    await Promise.all(buckets.map(b => b.length ? renderFrames(context, url, b) : Promise.resolve()));
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/__seek|__ready/.test(msg)) {
      console.error('');
      console.error('✗ 動畫沒有暴露 window.__seek（或未就緒）。');
      console.error('  seek 渲染只支援走 Stage 時鐘的動畫（assets/animations.jsx 的 <Stage>');
      console.error('  或 narration_stage.jsx 的 <NarrationStage>）。純 CSS @keyframes / Lottie /');
      console.error('  手寫非 Stage 動畫請改用 render-video.js。');
      console.error('');
    }
    await browser.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    console.error(msg.slice(0, 500));
    process.exit(1);
  }

  await browser.close();

  const pngCount = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.png')).length;
  if (pngCount === 0) {
    console.error('✗ 沒有截到任何幀');
    process.exit(1);
  }
  console.log(`▸ Captured ${pngCount}/${TOTAL_FRAMES} frames. Encoding H.264…`);

  // PNG 序列 → MP4。無 trim（本來就沒黑幀），輸入輸出幀率都設 FPS。
  const ffmpeg = spawnSync('ffmpeg', [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(TMP_DIR, 'frame-%06d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-preset', 'medium',
    '-r', String(FPS),
    '-movflags', '+faststart',
    MP4_OUT,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  if (ffmpeg.status !== 0) {
    console.error('✗ ffmpeg failed:\n' + ffmpeg.stderr.toString().slice(-2000));
    process.exit(1);
  }

  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  const mp4Size = (fs.statSync(MP4_OUT).size / 1024 / 1024).toFixed(1);
  console.log(`✓ Done: ${MP4_OUT} (${mp4Size} MB · ${FPS}fps native)`);
})();
