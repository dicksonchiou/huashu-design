#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.28.0",
# ]
# ///
"""
AI影片評審閉環 —— 渲染出的動畫MP4餵給影片理解模型（seed-2.0-lite），
按固定checklist逐段送審 + 全片低畫質掃一遍，彙整成結構化markdown評審報告。

⚠️ 可選雲能力：會把壓縮後的成片片段傳送到火山方舟官方介面（ark.cn-beijing.volces.com）
做影片理解評審，使用你自己的 ARK_API_KEY。首次呼叫需 --yes 或 HUASHU_CLOUD_OK=1
顯式確認。資料流向宣告見倉庫根 SECURITY.md。本機免費替代：scripts/verify-video.sh 截幀人工看。

Usage:
    uv run ai-review-video.py --video 成片.mp4 --yes
    uv run ai-review-video.py --video 成片.mp4 --context 導演稿.md --yes
    uv run ai-review-video.py --video 成片.mp4 --segment-len 60 --output 報告.md --yes

呼叫鏈路：
    1. ffprobe 探測時長/音軌
    2. 有音軌 → ffmpeg silencedetect 提取音效onset時間表（模型聽不到影片音軌，
       實測2026-07-17：input_video只送畫面。音畫對位檢查=本機onset+模型畫面核對）
    3. 按 --segment-len 切段並壓縮（1280寬/15fps/crf28，扁平動畫約0.5MB/分鐘）
    4. 逐段送審（checklist①-⑧），每段prompt標註原片時間範圍
    5. 全片再壓一版低畫質（960寬/10fps）單獨送審，專查跨段敘事連貫/hero貫穿
    6. 文字彙整call：按checklist逐項合併，產出最終報告；分段原始發現保留在附錄

API key：優先讀環境變數 ARK_API_KEY，其次讀 skill 根目錄 .env（只提取這一個變數），絕不硬編碼。
代理：requests session 關閉 trust_env（不繼承本機代理設定），免疫 ALL_PROXY 之類殘留代理導致的 TLS 報錯。
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from base64 import b64encode
from pathlib import Path

import requests

API_URL = "https://ark.cn-beijing.volces.com/api/v3/responses"
DEFAULT_MODEL = "doubao-seed-2-0-lite-260215"
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"  # skill 根目錄 .env（已 gitignore）
MAX_SEGMENT_MB = 8  # 單段壓縮產物超過這個值就再壓一檔

CHECKLIST = """\
① 黑幀/空窗/渲染殘缺：整幀或大面積黑屏、白屏、元素未渲染出來、明顯破圖
② 文字問題：字卡/標籤被裁切、溢位容器、錯字、亂碼、字疊字
③ 元素重疊遮擋：不該重疊的元素互相遮擋、層級錯誤、穿模
④ 敘事連貫性：場景過渡分三類——硬切（前後幀整頁突變，無任何銜接）、
   交叉淡入淡出（舊場景透明度漸隱）、morph（元素連續變形/位移到新場景）。
   報告時必須寫明你看到的是哪一類，不要把淡入淡出誤報成硬切；
   硬切=⚡，淡入淡出在導演稿要求morph時=💡「過渡偷懶」
⑤ hero/主體貫穿性：如果有貫穿全片的主體元素，它是否在場景切換中斷裂、消失、突變位置
⑥ 節奏死段：見下方「靜止段客觀檢測表」（ffmpeg逐幀檢測，≥3秒完全靜止的區間）。
   你的任務不是找死段，而是對表中每個區間判斷：是刻意hold（字卡閱讀/彈幕停留/收尾定格）
   還是真死段（畫面無資訊可讀還停著）。刻意hold=不報或💡，真死段=⚡
⑦ 音效打點（見下方onset時間表）：核對每個音效時間點畫面是否有對應事件
⑧ 構圖：明顯失衡、大片無意義空白、重要元素貼邊或被擠到角落"""

SEVERITY_RULE = """\
嚴重度分三級：
- ⚠️致命：交付前必須修（黑幀、錯字、文字被裁、元素疊死、明顯破圖）
- ⚡重要：觀感明顯受損（硬切感、hero斷裂、超3秒死段、構圖明顯失衡）
- 💡建議：錦上添花的改進點"""


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def load_api_key():
    key = os.getenv("ARK_API_KEY")
    if not key and ENV_PATH.exists():
        # 只提取 ARK_API_KEY 一個變數，不把 .env 整檔案灌進環境
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("ARK_API_KEY") and "=" in line:
                key = line.split("=", 1)[1].strip().strip("'\"")
                break
    if not key or key.startswith("your_"):
        sys.exit("Error: ARK_API_KEY 未設定（skill 根目錄 .env 或環境變數），拒絕繼續。不編造評審結果。")
    return key


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"命令失敗: {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r


def probe(video: Path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-show_entries", "stream=codec_type", "-of", "json", str(video)])
    info = json.loads(r.stdout)
    duration = float(info["format"]["duration"])
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    return duration, has_audio


def detect_audio_onsets(video: Path, noise_db=-45, min_silence=0.3):
    """silencedetect反推音效onset。回傳原片秒數清單。"""
    r = subprocess.run(
        ["ffmpeg", "-i", str(video), "-af",
         f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True)
    onsets = [round(float(m), 1) for m in
              re.findall(r"silence_end:\s*([\d.]+)", r.stderr)]
    # 片頭非靜音（開場即有聲）時補0
    starts = re.findall(r"silence_start:\s*([\d.-]+)", r.stderr)
    if starts and float(starts[0]) > min_silence:
        onsets.insert(0, 0.0)
    return onsets


def detect_static_segments(video: Path, noise=0.001, min_dur=3.0):
    """freezedetect找≥min_dur秒完全靜止的區間。回傳[(start,end)]原片秒。"""
    r = subprocess.run(
        ["ffmpeg", "-i", str(video), "-vf",
         f"freezedetect=n={noise}:d={min_dur}", "-f", "null", "-"],
        capture_output=True, text=True)
    starts = re.findall(r"freeze_start:\s*([\d.]+)", r.stderr)
    durs = re.findall(r"freeze_duration:\s*([\d.]+)", r.stderr)
    return [(round(float(s), 1), round(float(s) + float(d), 1))
            for s, d in zip(starts, durs)]


def compress(src: Path, dst: Path, ss=None, t=None, width=1280, fps=15, crf=28):
    cmd = ["ffmpeg", "-y", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    if t is not None:
        cmd += ["-t", str(t)]
    cmd += ["-i", str(src), "-vf", f"scale={width}:-2,fps={fps}",
            "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast",
            "-pix_fmt", "yuv420p", "-an", str(dst)]
    run(cmd)


def fmt_ts(sec: float) -> str:
    return f"{int(sec) // 60}:{int(sec) % 60:02d}"


def ask_model(session, api_key, model, prompt, video_path: Path | None = None, retries=1):
    content = []
    if video_path is not None:
        b64 = b64encode(video_path.read_bytes()).decode()
        content.append({"type": "input_video", "video_url": f"data:video/mp4;base64,{b64}"})
    content.append({"type": "input_text", "text": prompt})
    payload = {"model": model, "input": [{"role": "user", "content": content}]}
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = session.post(
                API_URL, json=payload, timeout=600,
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json"})
            if resp.status_code != 200:
                last_err = f"API {resp.status_code}: {resp.text[:500]}"
                continue
            data = resp.json()
            usage = data.get("usage", {})
            text = ""
            out = data.get("output")
            if isinstance(out, list):
                for item in out:
                    if isinstance(item, dict) and item.get("type") == "message":
                        for c in item.get("content", []):
                            if isinstance(c, dict) and c.get("type") == "output_text":
                                text += c.get("text", "")
            elif isinstance(out, str):
                text = out
            if not text:
                choices = data.get("choices", [])
                if choices:
                    text = choices[0].get("message", {}).get("content", "")
            if text:
                return text, usage
            last_err = f"響應無文字: {json.dumps(data, ensure_ascii=False)[:500]}"
        except requests.RequestException as e:
            last_err = f"網路錯誤: {e}"
        if attempt < retries:
            log(f"  重試（{last_err[:120]}）...")
            time.sleep(3)
    raise RuntimeError(last_err)


def segment_prompt(seg_start, seg_end, duration, context_text, onsets_in_seg,
                   statics_in_seg):
    p = [f"你是動畫成片質檢員，任務是嚴格挑毛病，不誇片子。",
         f"這段影片是一部總長{fmt_ts(duration)}的動畫成片的一個片段，"
         f"對應原片 {fmt_ts(seg_start)}–{fmt_ts(seg_end)}。"
         f"片段內第t秒 = 原片第{fmt_ts(seg_start)}+t秒，報告裡一律用原片時間（分:秒）。"]
    if context_text:
        p.append("以下是全片導演稿（評審上下文，用來判斷敘事意圖和該出現什麼）：\n"
                 "<導演稿>\n" + context_text + "\n</導演稿>")
    p.append("逐項檢查以下checklist，只報本片段內的發現：\n" + CHECKLIST)
    if statics_in_seg:
        ts = "、".join(f"{fmt_ts(a)}–{fmt_ts(b)}（{b - a:.1f}s）" for a, b in statics_in_seg)
        p.append(f"⑥的靜止段客觀檢測表（本段內，原片時間）：{ts}。逐個判斷刻意hold還是真死段。")
    else:
        p.append("本片段內無≥3秒靜止段，⑥直接寫「未發現」。")
    if onsets_in_seg:
        ts = "、".join(f"{fmt_ts(t)}({t}s)" for t in onsets_in_seg)
        p.append(f"⑦的onset時間表（本段內音效實際出現的原片時間）：{ts}。"
                 f"你聽不到聲音，只需核對這些時間點畫面上是否有值得配音效的事件"
                 f"（轉場/字卡落定/撞擊/元素出現），沒有對應事件的時間點=音效打空，要報。")
    else:
        p.append("本片段內沒有檢測到音效onset，⑦跳過；但如果本段有強烈畫面事件"
                 "（撞擊/字卡/轉場）卻無音效覆蓋，可在⑦下用💡提出。")
    p.append(SEVERITY_RULE)
    p.append("輸出格式：markdown。按①-⑧逐項，每項下用列表：\n"
             "- [原片分:秒] 嚴重度emoji 具體描述\n"
             "該項無問題就寫「未發現」。只報你真正看到的，不確定的標「存疑」，不編造。")
    return "\n\n".join(p)


def global_prompt(duration, context_text):
    p = ["你是動畫成片質檢員。這是一部動畫成片的全片低畫質版（評審用壓縮，畫質低是正常的，"
         "不要報畫質/清晰度問題），總長" + fmt_ts(duration) + "。"]
    if context_text:
        p.append("導演稿：\n<導演稿>\n" + context_text + "\n</導演稿>")
    p.append("只做三件事（細節問題已有分段評審負責，你不用管）：\n"
             "A. 敘事連貫性：從頭到尾看，哪些時間點是PowerPoint式硬切（整頁突變無過渡）？\n"
             "B. hero/主體貫穿性：貫穿全片的主體元素在哪些切換處斷裂、消失或突變？\n"
             "C. 整體節奏：哪些區間拖（長時間無新資訊）、哪些區間趕？\n\n"
             + SEVERITY_RULE +
             "\n\n輸出markdown，A/B/C三節，發現帶[分:秒]時間點。無問題寫「未發現」。不編造。")
    return "\n\n".join(p)


def synthesis_prompt(duration, seg_reports, global_report):
    parts = ["你是評審報告主編。下面是同一部" + fmt_ts(duration) +
             "動畫成片的分段評審 + 全片評審原始記錄，把它們合併成一份最終報告正文。",
             "要求：\n"
             "1. 按checklist①-⑧逐項組織，每項下按時間順序列發現：- [分:秒] 嚴重度 描述\n"
             "2. 同一問題被多段重複報的合併成一條；分段與全片評審矛盾時兩說並存標「存疑」\n"
             "3. 保留每條發現的時間點和嚴重度emoji（⚠️/⚡/💡），不新增原始記錄裡沒有的發現\n"
             "4. 開頭給一個「問題總數：⚠️x ⚡y 💡z」的統計行和三句話以內的總評\n"
             "5. 只輸出報告正文markdown，不要客套話",
             "<全片評審>\n" + global_report + "\n</全片評審>"]
    for (s, e, text) in seg_reports:
        parts.append(f"<分段評審 原片{fmt_ts(s)}–{fmt_ts(e)}>\n{text}\n</分段評審>")
    return "\n\n".join(parts)


def main():
    ap = argparse.ArgumentParser(description="AI影片評審：動畫MP4 → checklist結構化評審報告")
    ap.add_argument("--video", required=True, help="成片路徑（mp4）")
    ap.add_argument("--context", help="導演稿/分幕說明md路徑（可選，作為評審上下文）")
    ap.add_argument("--segment-len", type=int, default=60, help="分段長度秒（預設60）")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"模型（預設{DEFAULT_MODEL}）")
    ap.add_argument("--output", "-o", help="報告路徑（預設影片同目錄<影片名>-AI評審.md）")
    ap.add_argument("--yes", action="store_true",
                    help="確認將壓縮後的影片段傳送到火山方舟官方介面（或設 HUASHU_CLOUD_OK=1）")
    args = ap.parse_args()

    video = Path(args.video).resolve()
    if not video.exists():
        sys.exit(f"Error: 影片不存在 {video}")

    if not args.yes and os.getenv("HUASHU_CLOUD_OK") != "1":
        sys.exit(
            f"[雲能力確認] 本次將把 {video.name} 壓縮後分段傳送到 ark.cn-beijing.volces.com"
            "（火山方舟官方介面，使用你自己的 ARK_API_KEY 做影片理解評審）。\n"
            "確認無誤請重跑並加 --yes，或設定環境變數 HUASHU_CLOUD_OK=1。"
            "資料流向宣告見 SECURITY.md；本機免費替代：scripts/verify-video.sh。")
    out_path = Path(args.output) if args.output else video.parent / f"{video.stem}-AI評審.md"

    context_text = ""
    if args.context:
        ctx = Path(args.context)
        if not ctx.exists():
            sys.exit(f"Error: 指定的檔案不存在 {ctx}")
        context_text = ctx.read_text(encoding="utf-8")[:12000]

    api_key = load_api_key()
    session = requests.Session()
    session.trust_env = False  # 免疫 ALL_PROXY 等代理坑

    duration, has_audio = probe(video)
    log(f"影片 {fmt_ts(duration)}，音軌={'有' if has_audio else '無'}")

    onsets = detect_audio_onsets(video) if has_audio else []
    if has_audio:
        log(f"音效onset檢測：{len(onsets)}個 → {['%.1f' % t for t in onsets]}")

    # 靜止段客觀檢測（相鄰區間合併）
    raw_statics = detect_static_segments(video)
    statics = []
    for a, b in raw_statics:
        if statics and a - statics[-1][1] < 0.2:
            statics[-1] = (statics[-1][0], b)
        else:
            statics.append((a, b))
    log(f"靜止段檢測（≥3s）：{len(statics)}個 → "
        f"{[f'{a:.0f}-{b:.0f}s' for a, b in statics]}")

    total_usage = {"input_tokens": 0, "output_tokens": 0}

    def add_usage(u):
        for k in total_usage:
            total_usage[k] += u.get(k, 0) or 0

    seg_reports, failures = [], []
    with tempfile.TemporaryDirectory(prefix="ai-review-") as tmp:
        tmp = Path(tmp)
        # 分段
        bounds = []
        t0 = 0.0
        while t0 < duration - 1:
            bounds.append((t0, min(t0 + args.segment_len, duration)))
            t0 += args.segment_len
        log(f"分段：{len(bounds)}段 × ≤{args.segment_len}s")

        for i, (s, e) in enumerate(bounds, 1):
            seg = tmp / f"seg{i}.mp4"
            compress(video, seg, ss=s, t=e - s)
            if seg.stat().st_size > MAX_SEGMENT_MB * 1024 * 1024:
                compress(video, seg, ss=s, t=e - s, width=960, fps=10, crf=32)
            mb = seg.stat().st_size / 1048576
            onsets_in = [t for t in onsets if s <= t < e]
            statics_in = [(a, b) for a, b in statics if a < e and b > s]
            log(f"段{i} {fmt_ts(s)}–{fmt_ts(e)}（{mb:.1f}MB，onset×{len(onsets_in)}，"
                f"靜止段×{len(statics_in)}）送審...")
            try:
                text, usage = ask_model(session, api_key, args.model,
                                        segment_prompt(s, e, duration, context_text,
                                                       onsets_in, statics_in),
                                        seg)
                add_usage(usage)
                seg_reports.append((s, e, text))
            except RuntimeError as err:
                log(f"  段{i}送審失敗：{err}")
                failures.append((s, e, str(err)))

        # 全片低畫質pass
        log("全片低畫質版送審（敘事/hero/節奏）...")
        full = tmp / "full.mp4"
        compress(video, full, width=960, fps=10, crf=30)
        global_report, global_fail = "", None
        try:
            global_report, usage = ask_model(session, api_key, args.model,
                                             global_prompt(duration, context_text), full)
            add_usage(usage)
        except RuntimeError as err:
            global_fail = str(err)
            log(f"  全片pass失敗：{err}")

    if not seg_reports and not global_report:
        sys.exit("Error: 所有送審呼叫均失敗，無法產出報告。不編造評審結果。\n" +
                 "\n".join(f"{fmt_ts(s)}–{fmt_ts(e)}: {m}" for s, e, m in failures))

    # 彙整
    log("彙整最終報告...")
    try:
        body, usage = ask_model(session, api_key, args.model,
                                synthesis_prompt(duration, seg_reports,
                                                 global_report or "（全片pass呼叫失敗，無記錄）"))
        add_usage(usage)
    except RuntimeError as err:
        log(f"彙整call失敗（{err}），退化為原始記錄拼接")
        body = "> 彙整call失敗，以下為各pass原始記錄直接拼接。\n\n" + \
               (global_report or "") + "\n\n" + \
               "\n\n".join(f"## 分段 {fmt_ts(s)}–{fmt_ts(e)}\n{t}" for s, e, t in seg_reports)

    lines = [f"# {video.name} · AI評審報告",
             "",
             f"> 模型：{args.model} | 評審時間：{time.strftime('%Y-%m-%d %H:%M')} | "
             f"片長：{fmt_ts(duration)} | 分段：{len(seg_reports)}成功/{len(failures)}失敗 | "
             f"音效onset：{len(onsets)}個 / 靜止段≥3s：{len(statics)}個"
             f"（均為本機ffmpeg客觀檢測；模型不聞聲，音畫對位=onset+畫面核對） | "
             f"tokens：in {total_usage['input_tokens']} / out {total_usage['output_tokens']}",
             ""]
    if failures:
        lines.append("> ⚠️ 以下時間段送審失敗，未被評審覆蓋：" +
                     "；".join(f"{fmt_ts(s)}–{fmt_ts(e)}（{m[:100]}）" for s, e, m in failures))
        lines.append("")
    if global_fail:
        lines.append(f"> ⚠️ 全片連貫性pass呼叫失敗：{global_fail[:200]}")
        lines.append("")
    lines.append(body)
    lines.append("\n\n---\n\n## 附錄 · 客觀檢測資料（ffmpeg，非模型判斷）\n")
    lines.append("靜止段≥3s：" + ("、".join(
        f"{fmt_ts(a)}–{fmt_ts(b)}（{b - a:.1f}s）" for a, b in statics) or "無"))
    lines.append("\n音效onset：" + ("、".join(fmt_ts(t) for t in onsets) or "無/無音軌"))
    lines.append("\n## 附錄 · 各段原始評審記錄\n")
    if global_report:
        lines.append("### 全片pass（敘事/hero/節奏）\n\n" + global_report + "\n")
    for s, e, t in seg_reports:
        lines.append(f"### 分段 原片{fmt_ts(s)}–{fmt_ts(e)}\n\n{t}\n")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    log(f"報告已寫入: {out_path}")
    print(out_path)


if __name__ == "__main__":
    main()
