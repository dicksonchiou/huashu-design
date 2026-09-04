#!/usr/bin/env python3
"""
從 Wikimedia Commons 抓真實圖片（公共領域 / CC），供 huashu-design「內容型設計取真圖」用（Phase 3.5）。

為什麼有這個指令碼：內容型設計（鸚鵡/咖啡/馬來西亞…）必須用真圖，不能 CSS 色塊糊弄。
每次讓模型現寫抓圖邏輯既慢又容易漏坑（忘清代理→TLS 炸 / 忘合規 UA→429）。這裡固化好，下次只改關鍵詞。

用法：
  python3 scripts/fetch_images.py --query "Petronas Towers" "Langkawi beach" "George Town street" \
      --out 專案/assets/img --count 2 --width 1600

每個 query 取前 count 張、縮放到 width、下載到 out，並列印清單（路徑 | 許可 | 作者 | 來源頁）便於誠實性核對。
全部抓不到 → 退出碼 1，提示走 Phase 3.5 取圖三級兜底（Unsplash/Pexels → 生圖 → 誠實 placeholder）。
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request

# ① 清代理：本機 curl/urllib 走代理會 TLS 炸（見 memory feedback_gemini_proxy）
for _k in ("ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"):
    os.environ.pop(_k, None)

API = "https://commons.wikimedia.org/w/api.php"
# ② 合規 User-Agent 是硬性要求，否則 Wikimedia 返 429
UA = "huashu-design-image-fetcher/1.0 (https://huasheng.ai; skill contact)"


def _api_get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _safe(name):
    return re.sub(r"[^\w\-.]", "_", name)[:60]


def fetch(query, out, count, width):
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": count,
        "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": width,
    }
    try:
        data = _api_get(params)
    except Exception as e:
        print(f"[FAIL search] {query}: {e}", file=sys.stderr)
        return []
    pages = (data.get("query", {}) or {}).get("pages", {})
    got = []
    for p in list(pages.values())[:count]:
        ii = (p.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl") or ii.get("url")
        if not thumb:
            continue
        meta = ii.get("extmetadata", {}) or {}
        lic = (meta.get("LicenseShortName", {}) or {}).get("value", "?")
        artist = re.sub("<[^>]+>", "", (meta.get("Artist", {}) or {}).get("value", "?")).strip()
        ext = os.path.splitext(thumb)[1].split("?")[0] or ".jpg"
        fn = _safe(query) + "_" + _safe(p.get("title", "img").replace("File:", ""))
        fn = os.path.splitext(fn)[0][:55] + ext
        path = os.path.join(out, fn)
        try:
            req = urllib.request.Request(thumb, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                f.write(r.read())
            got.append(path)
            print(f"[OK] {path}  | {lic} | {artist} | {ii.get('descriptionurl','')}")
        except Exception as e:
            print(f"[FAIL dl] {thumb}: {e}", file=sys.stderr)
    if not got:
        print(f"[EMPTY] 「{query}」沒抓到——換關鍵詞，或走 Phase 3.5 兜底", file=sys.stderr)
    return got


def main():
    ap = argparse.ArgumentParser(description="Wikimedia Commons 真圖抓取（huashu-design Phase 3.5）")
    ap.add_argument("--query", nargs="+", required=True, help="一個或多個英文關鍵詞（英文命中率高）")
    ap.add_argument("--out", required=True, help="輸出目錄（建議 專案/assets/img）")
    ap.add_argument("--count", type=int, default=2, help="每個關鍵詞抓幾張（預設 2）")
    ap.add_argument("--width", type=int, default=1600, help="縮放寬度 px（預設 1600）")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    allgot = []
    for q in a.query:
        allgot += fetch(q, a.out, a.count, a.width)
    print(f"\n=== 共下載 {len(allgot)} 張到 {a.out} ===")
    print("⚠️ 誠實性核對：去掉每張圖資訊是否有損？許可是否允許用途？不合適的刪掉。")
    if not allgot:
        print("❌ 全部失敗 → 走 Phase 3.5 取圖三級兜底（Unsplash/Pexels → 生圖 → 誠實 placeholder，不卡流程）", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
