#!/usr/bin/env node
/**
 * export_deck_stage_pdf.mjs — 單檔案 <deck-stage> 架構專用 PDF 匯出
 *
 * 用法：
 *   node export_deck_stage_pdf.mjs --html <deck.html> --out <file.pdf> [--width 1920] [--height 1080] [--allow-network]
 *
 * 什麼時候用這個指令碼？
 *   - 你的 deck 是**單 HTML 檔案**，所有 slide 是 `<section>`，外層用 `<deck-stage>` 包裹
 *   - 此時 `export_deck_pdf.mjs`（多檔案專用）用不上
 *
 * 為什麼不能直接 `page.pdf()`（2026-04-20 踩坑記錄）：
 *   1. deck-stage 的 shadow CSS `::slotted(section) { display: none }` 讓只有 active slide 可見
 *   2. print 媒體下外層 `!important` 壓不住 shadow DOM 規則
 *   3. 結果：PDF 永遠只有 1 頁（active 那張）
 *
 * 解決方案：
 *   開啟 HTML 後，用 page.evaluate 把所有 section 從 deck-stage slot 拔出來，
 *   掛到 body 下一個普通 div，內聯 style 強制 position:relative + 固定尺寸，
 *   每個 section 加 page-break-after: always，最後一個改 auto 避免尾部空白頁。
 *
 * 依賴：playwright
 *   npm install playwright
 *
 * 輸出特點：
 *   - 文字保留向量（可複製、可搜尋）
 *   - 視覺 1:1 保真
 *   - 字型必須能被 Chromium 載入（本機字型或 Google Fonts）
 */

import { chromium } from 'playwright';
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
  if (!args.html || !args.out) {
    console.error('用法: node export_deck_stage_pdf.mjs --html <deck.html> --out <file.pdf> [--width 1920] [--height 1080] [--allow-network]');
    process.exit(1);
  }
  args.width = parseInt(args.width);
  args.height = parseInt(args.height);
  return args;
}

async function main() {
  const { html, out, width, height, allowNetwork = false } = parseArgs();
  const htmlAbs = path.resolve(html);
  const outFile = path.resolve(out);

  await fs.access(htmlAbs).catch(() => {
    console.error(`HTML file not found: ${htmlAbs}`);
    process.exit(1);
  });

  console.log(`Rendering ${path.basename(htmlAbs)} → ${path.basename(outFile)}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext(secureContextOptions(
    { viewport: { width, height } },
    { allowNetwork },
  ));
  await configureNetworkPolicy(ctx, { allowNetwork });
  const page = await ctx.newPage();

  await page.goto('file://' + htmlAbs, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);  // 等 Google Fonts + deck-stage init

  // 核心修復：把 section 從 shadow DOM slot 拔出來攤平
  const sectionCount = await page.evaluate(({ W, H }) => {
    const stage = document.querySelector('deck-stage');
    if (!stage) throw new Error('<deck-stage> not found — 這個指令碼只適用於單檔案 deck-stage 架構');
    const sections = Array.from(stage.querySelectorAll(':scope > section'));
    if (!sections.length) throw new Error('No <section> found inside <deck-stage>');

    // 注入列印樣式
    const style = document.createElement('style');
    style.textContent = `
      @page { size: ${W}px ${H}px; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff; }
      deck-stage { display: none !important; }
    `;
    document.head.appendChild(style);

    // 攤平到 body 下
    const container = document.createElement('div');
    container.id = 'print-container';
    sections.forEach(s => {
      // 內聯 style 拿到最高優先順序；確保 position:relative 讓 absolute 子元素正確約束
      s.style.cssText = `
        width: ${W}px !important;
        height: ${H}px !important;
        display: block !important;
        position: relative !important;
        overflow: hidden !important;
        page-break-after: always !important;
        break-after: page !important;
        margin: 0 !important;
        padding: 0 !important;
      `;
      container.appendChild(s);
    });
    // 最後一頁不分頁，避免尾部空白頁
    const last = sections[sections.length - 1];
    last.style.pageBreakAfter = 'auto';
    last.style.breakAfter = 'auto';
    document.body.appendChild(container);
    return sections.length;
  }, { W: width, H: height });

  await page.waitForTimeout(800);

  await page.pdf({
    path: outFile,
    width: `${width}px`,
    height: `${height}px`,
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();

  const stat = await fs.stat(outFile);
  const kb = (stat.size / 1024).toFixed(0);
  console.log(`\n✓ Wrote ${outFile}  (${kb} KB, ${sectionCount} pages, vector)`);
  console.log(`  驗證頁數：mdimport "${outFile}" && pdfinfo "${outFile}" | grep Pages`);
}

main().catch(e => { console.error(e); process.exit(1); });
