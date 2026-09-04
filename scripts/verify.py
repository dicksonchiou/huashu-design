#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "playwright>=1.48,<2",
# ]
# ///
"""
verify.py — Playwright封裝，用於驗證claude-design產出的HTML

Usage:
    python verify.py path/to/design.html                    # 基礎：開啟+截圖+抓控制檯錯誤
    python verify.py design.html --viewports 1920x1080,375x667  # 多viewport
    python verify.py deck.html --slides 10                  # 投影片逐頁截（前10張）
    python verify.py design.html --output ./screenshots/   # 輸出目錄
    python verify.py design.html --show                    # 非headless，開啟真實瀏覽器
    python verify.py design.html --allow-network           # 可信 HTML 明確允許遠端資源

依賴：
    pip install playwright
    playwright install chromium
"""

import argparse
import sys
import os
import re
import time
from pathlib import Path


def parse_viewport(s):
    w, h = s.split('x')
    return {'width': int(w), 'height': int(h)}


def verify_html(html_path, viewports=None, slides=0, output_dir=None, show=False,
                wait=2000, allow_network=False):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright未安裝。")
        print("執行: pip install playwright && playwright install chromium")
        sys.exit(1)

    html_path = Path(html_path).resolve()
    if not html_path.exists():
        print(f"ERROR: 檔案不存在: {html_path}")
        sys.exit(1)

    if output_dir is None:
        output_dir = html_path.parent / 'screenshots'
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    file_url = html_path.as_uri()
    stem = html_path.stem

    if viewports is None:
        viewports = [{'width': 1440, 'height': 900}]

    console_errors = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not show)

        for viewport in viewports:
            context = browser.new_context(
                viewport=viewport,
                device_scale_factor=2,
                service_workers="allow" if allow_network else "block",
            )
            if not allow_network:
                context.route(re.compile(r"^https?://", re.IGNORECASE),
                              lambda route: route.abort("blockedbyclient"))
                if not hasattr(context, "route_web_socket"):
                    raise RuntimeError(
                        "目前的 Python Playwright 版本不支援 WebSocket 路由阻擋；"
                        "請升級 Playwright 後再執行驗證。"
                    )
                context.route_web_socket(
                    re.compile(r"^wss?://", re.IGNORECASE),
                    lambda websocket: websocket.close(),
                )
            page = context.new_page()

            page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            print(f"\n→ 開啟 {file_url} @ {viewport['width']}x{viewport['height']}")
            page.goto(file_url, wait_until='networkidle')
            page.wait_for_timeout(wait)

            if slides > 0:
                for i in range(slides):
                    screenshot_path = output_dir / f"{stem}-slide-{str(i + 1).zfill(2)}.png"
                    page.screenshot(path=str(screenshot_path), full_page=False)
                    print(f"  ✓ slide {i+1} → {screenshot_path.name}")

                    if i < slides - 1:
                        page.keyboard.press('ArrowRight')
                        page.wait_for_timeout(500)
            else:
                suffix = f"-{viewport['width']}x{viewport['height']}" if len(viewports) > 1 else ""
                screenshot_path = output_dir / f"{stem}{suffix}.png"
                page.screenshot(path=str(screenshot_path), full_page=False)
                print(f"  ✓ 截圖 → {screenshot_path.name}")

                full_path = output_dir / f"{stem}{suffix}-full.png"
                page.screenshot(path=str(full_path), full_page=True)
                print(f"  ✓ 完整頁 → {full_path.name}")

            if show:
                print("  (瀏覽器視窗保持開啟，按Enter關閉...)")
                input()

            context.close()

        browser.close()

    print("\n" + "=" * 50)
    print("驗證報告")
    print("=" * 50)

    if page_errors:
        print(f"\n❌ Page Errors ({len(page_errors)}):")
        for e in page_errors:
            print(f"  - {e}")
    else:
        print("\n✅ 無JavaScript錯誤")

    if console_errors:
        print(f"\n⚠️  Console Errors/Warnings ({len(console_errors)}):")
        for e in console_errors[:20]:
            print(f"  - {e}")
        if len(console_errors) > 20:
            print(f"  ... 還有{len(console_errors) - 20}條")
    else:
        print("✅ Console乾淨")

    print(f"\n📸 截圖儲存至: {output_dir}")

    return 0 if not page_errors else 1


def main():
    parser = argparse.ArgumentParser(
        description="Verify HTML design outputs with Playwright",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("html_path", help="HTML file path")
    parser.add_argument("--viewports", default="1440x900",
                        help="逗號分隔的viewport列表，格式 WxH（預設 1440x900）")
    parser.add_argument("--slides", type=int, default=0,
                        help="投影片模式：擷取前N張（需要HTML支援ArrowRight翻頁）")
    parser.add_argument("--output", default=None,
                        help="輸出目錄（預設HTML所在目錄的screenshots/）")
    parser.add_argument("--show", action="store_true",
                        help="非headless，開啟真實瀏覽器視窗")
    parser.add_argument("--wait", type=int, default=2000,
                        help="開啟頁面後等待的毫秒數（預設2000）")
    parser.add_argument("--allow-network", action="store_true",
                        help="明確允許 HTML 載入遠端 HTTP(S)/WebSocket 資源（預設阻擋）")

    args = parser.parse_args()

    viewports = [parse_viewport(v) for v in args.viewports.split(",")]

    return verify_html(
        html_path=args.html_path,
        viewports=viewports,
        slides=args.slides,
        output_dir=args.output,
        show=args.show,
        wait=args.wait,
        allow_network=args.allow_network,
    )


if __name__ == "__main__":
    sys.exit(main())
