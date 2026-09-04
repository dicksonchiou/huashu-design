#!/usr/bin/env node
/**
 * export_deck_pptx.mjs — 把多檔案 slide deck 匯出為可編輯 PPTX
 *
 * 用法：
 *   node export_deck_pptx.mjs --slides <dir> --out <file.pptx> [--allow-network]
 *
 * 行為：
 *   - 呼叫 scripts/html2pptx.js 把 HTML DOM 逐元素翻譯成 PowerPoint 原生物件
 *   - 文字是真文字框，PPT 裡直接雙擊能編輯
 *   - body 尺寸 960pt × 540pt（LAYOUT_WIDE，13.333″ × 7.5″）
 *
 * ⚠️ HTML 必須符合 4 條硬約束（見 references/editable-pptx.md）：
 *   1. 文字包在 <p>/<h1>-<h6> 裡（div 不能直接放文字）
 *   2. 不用 CSS 漸變
 *   3. <p>/<h*> 不能有 background/border/shadow（放外層 div）
 *   4. div 不能 background-image（用 <img>）
 *
 * 視覺驅動的 HTML 幾乎無法 pass —— 必須從寫 HTML 的第一行就按約束寫。
 * 視覺自由度優先的場景（動畫、web component、CSS 漸變、複雜 SVG）
 * 應改用 export_deck_pdf.mjs / export_deck_stage_pdf.mjs 匯出 PDF。
 *
 * 依賴：npm install playwright pptxgenjs sharp
 *
 * 按檔名排序（01-xxx.html → 02-xxx.html → ...）。
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--allow-network') {
      args.allowNetwork = true;
      continue;
    }
    const k = a[i].replace(/^--/, '');
    args[k] = a[++i];
  }
  if (!args.slides || !args.out) {
    console.error('用法: node export_deck_pptx.mjs --slides <dir> --out <file.pptx> [--allow-network]');
    console.error('');
    console.error('⚠️ HTML 必須符合 4 條硬約束（見 references/editable-pptx.md）。');
    console.error('   視覺自由度優先的場景請改用 export_deck_pdf.mjs 匯出 PDF。');
    process.exit(1);
  }
  return args;
}

async function main() {
  const { slides, out, allowNetwork = false } = parseArgs();
  const slidesDir = path.resolve(slides);
  const outFile = path.resolve(out);

  const files = (await fs.readdir(slidesDir))
    .filter(f => f.endsWith('.html'))
    .sort();
  if (!files.length) {
    console.error(`No .html files found in ${slidesDir}`);
    process.exit(1);
  }

  console.log(`Converting ${files.length} slides via html2pptx...`);

  let PptxGenJS;
  try {
    const module = await import('pptxgenjs');
    PptxGenJS = module.default ?? module;
  } catch (e) {
    console.error(`✗ 缺少可選依賴 pptxgenjs：${e.message}`);
    console.error('  僅在需要可編輯 PPTX 匯出時安裝：npm install --no-save pptxgenjs@4.0.1');
    process.exit(1);
  }

  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  let html2pptx;
  try {
    html2pptx = require(path.join(__dirname, 'html2pptx.js'));
  } catch (e) {
    console.error(`✗ 載入 html2pptx.js 失敗：${e.message}`);
    console.error(`  依賴缺失時請跑：npm install playwright sharp`);
    process.exit(1);
  }

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';  // 13.333 × 7.5 inch，對應 HTML body 960 × 540 pt

  const errors = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fullPath = path.join(slidesDir, f);
    try {
      await html2pptx(fullPath, pres, { allowNetwork });
      console.log(`  [${i + 1}/${files.length}] ${f} ✓`);
    } catch (e) {
      console.error(`  [${i + 1}/${files.length}] ${f} ✗  ${e.message}`);
      errors.push({ file: f, error: e.message });
    }
  }

  if (errors.length) {
    console.error(`\n⚠️ ${errors.length} 張 slide 轉換失敗。常見原因：HTML 不符合 4 條硬約束。`);
    console.error(`  詳見 references/editable-pptx.md 的「常見錯誤速查」。`);
    if (errors.length === files.length) {
      console.error(`✗ 全部失敗，不產生 PPTX。`);
      process.exit(1);
    }
  }

  await pres.writeFile({ fileName: outFile });
  console.log(`\n✓ Wrote ${outFile}  (${files.length - errors.length}/${files.length} slides, 可編輯 PPTX)`);
}

main().catch(e => { console.error(e); process.exit(1); });
