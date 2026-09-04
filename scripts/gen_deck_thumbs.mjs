#!/usr/bin/env node
/**
 * gen_deck_thumbs.mjs — 為多檔案 deck 每頁產生縮圖（給 deck_index.html 的「無限畫廊」概覽用）。
 *
 * 背景：deck_index.html 有兩種概覽——
 *   · 網格 grid（預設 60%）：用 iframe 渲染真實子頁面，清晰、所見即所得，無需縮圖。
 *   · 無限畫廊 gallery（40%）：把所有頁無縫無限平鋪 + 緩慢漂移，幾十~上百個瓦片若都用 iframe 會很卡，
 *     所以畫廊改用 <img> 縮圖——同一張圖複用多次瀏覽器只解碼一次，流暢。
 *   本指令碼就是給畫廊準備這批縮圖。grid 模式不需要它。
 *
 * 用法（複製到 deck 專案根目錄，裝依賴後執行）：
 *   npm install playwright sharp
 *   node gen_deck_thumbs.mjs --slides slides --out thumbs [--width 1600] [--quality 86] [--allow-network]
 *
 * 然後在 index.html 的 MANIFEST 給每項加 thumb（與 file 同名 .jpg）：
 *   { file: "slides/01-cover.html", thumb: "thumbs/01-cover.jpg", label: "封面" }
 * deck_index.html 僅在畫廊模式用 thumb；網格模式始終用 file(iframe)。沒有 thumb 時畫廊回退 iframe。
 *
 * 提示：縮圖解析度別太低（預設 1600px），否則畫廊裡卡片 hover 放大後會發虛。
 * 網路預設阻擋；只有可信 slide 確實依賴遠端資源時才加 --allow-network。
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import networkPolicy from './playwright-network-policy.js';

const { configureNetworkPolicy, secureContextOptions } = networkPolicy;

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const slidesDir = arg('slides', 'slides');
const outDir = arg('out', 'thumbs');
const width = parseInt(arg('width', '1600'), 10);
const quality = parseInt(arg('quality', '86'), 10);
const W = parseInt(arg('canvas-w', '1920'), 10);
const H = parseInt(arg('canvas-h', '1080'), 10);
const allowNetwork = process.argv.includes('--allow-network');

if (!fs.existsSync(slidesDir)) { console.error('找不到 slides 目錄: ' + slidesDir); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync(slidesDir).filter(f => f.endsWith('.html')).sort();
if (!files.length) { console.error('slides 目錄裡沒有 .html'); process.exit(1); }

const browser = await chromium.launch();
const context = await browser.newContext(secureContextOptions(
  { viewport: { width: W, height: H }, deviceScaleFactor: 1 },
  { allowNetwork },
));
await configureNetworkPolicy(context, { allowNetwork });
const page = await context.newPage();
let ok = 0;
for (const f of files) {
  const base = f.replace(/\.html$/, '');
  const out = path.join(outDir, base + '.jpg');
  try {
    await page.goto('file://' + path.resolve(slidesDir, f), { waitUntil: 'load' });
    await page.waitForTimeout(2800);                 // 等 webfont / 圖片 paint
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
    await sharp(buf).resize(width).jpeg({ quality }).toFile(out);
    ok++; console.log('[ok] ' + out);
  } catch (e) { console.error('[FAIL] ' + f + ': ' + e.message); }
}
await browser.close();
console.log(`\n=== ${ok}/${files.length} 張縮圖 → ${outDir}/ ===`);
console.log('在 index.html 的 MANIFEST 每項加 thumb: "' + outDir + '/<同名>.jpg"（僅畫廊模式用到）');
