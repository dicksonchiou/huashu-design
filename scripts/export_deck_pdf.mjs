#!/usr/bin/env node
/**
 * export_deck_pdf.mjs — 把多檔案 slide deck 匯出為單個向量 PDF
 *
 * 用法：
 *   node export_deck_pdf.mjs --slides <dir> --out <file.pdf> [--width 1920] [--height 1080] [--allow-network]
 *
 * 特點：
 *   - 文字保留向量（可複製、可搜尋）
 *   - 背景/圖形 1:1 保真（Playwright 內嵌 Chromium 渲染）
 *   - 不需要對 HTML 做任何改造
 *   - 視覺損失 = 0（PDF 就是瀏覽器列印出來的）
 *
 * trade-off：
 *   - PDF 不可再編輯文字（要改回到 HTML 改）
 *
 * 依賴：playwright pdf-lib
 *   npm install playwright pdf-lib
 *
 * 會按檔名排序（01-xxx.html → 02-xxx.html → ...）
 */

import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import networkPolicy from './playwright-network-policy.js';

const { configureNetworkPolicy, secureContextOptions } = networkPolicy;

function parseArgs() {
  const args = { width: 1920, height: 1080 };
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
    console.error('用法: node export_deck_pdf.mjs --slides <dir> --out <file.pdf> [--width 1920] [--height 1080] [--allow-network]');
    process.exit(1);
  }
  args.width = parseInt(args.width);
  args.height = parseInt(args.height);
  return args;
}

async function main() {
  const { slides, out, width, height, allowNetwork = false } = parseArgs();
  const slidesDir = path.resolve(slides);
  const outFile = path.resolve(out);

  const files = (await fs.readdir(slidesDir))
    .filter(f => f.endsWith('.html'))
    .sort();
  if (!files.length) {
    console.error(`No .html files found in ${slidesDir}`);
    process.exit(1);
  }
  console.log(`Found ${files.length} slides in ${slidesDir}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext(secureContextOptions(
    { viewport: { width, height } },
    { allowNetwork },
  ));
  await configureNetworkPolicy(ctx, { allowNetwork });

  // 1) Render each HTML to its own PDF buffer
  const pageBuffers = [];
  for (const f of files) {
    const page = await ctx.newPage();
    const url = 'file://' + path.join(slidesDir, f);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));
    await page.waitForTimeout(1200);  // web-font paint
    // emulate "screen" so CSS colors/backgrounds render the same as browser
    await page.emulateMedia({ media: 'screen' });
    const buf = await page.pdf({
      width: `${width}px`,
      height: `${height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });
    pageBuffers.push(buf);
    await page.close();
    console.log(`  [${pageBuffers.length}/${files.length}] ${f}`);
  }

  await browser.close();

  // 2) Merge into a single PDF
  const merged = await PDFDocument.create();
  for (const buf of pageBuffers) {
    const src = await PDFDocument.load(buf);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach(p => merged.addPage(p));
  }
  const bytes = await merged.save();
  await fs.writeFile(outFile, bytes);

  const kb = (bytes.byteLength / 1024).toFixed(0);
  console.log(`\n✓ Wrote ${outFile}  (${kb} KB, ${files.length} pages, vector)`);
}

main().catch(e => { console.error(e); process.exit(1); });
