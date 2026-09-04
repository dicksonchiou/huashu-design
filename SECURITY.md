# Security & Data-Flow Statement

This document exhaustively declares every network destination, credential touchpoint, subprocess, and deletion this skill can perform, so that users and automated security reviewers can verify the claims against the code.

**TL;DR: the core pipeline (HTML design → render → MP4/PDF/PPTX export) runs locally with zero API keys. Playwright renderers block HTTP(S), WebSocket, and service workers by default; `--allow-network` is an explicit opt-in for HTML that intentionally uses remote fonts or scripts. All cloud-touching code is isolated in `scripts/cloud/`, is strictly optional, uses only keys you supply, sends data only to the corresponding vendor's official API, and refuses to run without explicit consent (`--yes` flag or `HUASHU_CLOUD_OK=1`). There is no telemetry. No data is ever sent to any server controlled by the skill author.**

## Complete list of network destinations

| Host | Where | What is sent | When |
|---|---|---|---|
| `ark.cn-beijing.volces.com` (Volcengine Ark, ByteDance official API) | `scripts/cloud/ai-review-video.py` | Compressed segments of **your own rendered video**, for AI quality review, authenticated with **your own** `ARK_API_KEY` | Only when you run it, and only after the consent gate |
| `openspeech.bytedance.com` (ByteDance official TTS API) | `scripts/cloud/tts-doubao.mjs` (also invoked by `scripts/narrate-pipeline.mjs`) | The narration text you want synthesized, with **your own** key. The endpoint requires HTTPS, the exact official hostname and standard HTTPS port; credential-bearing requests refuse redirects | Only when you run it, and only after the consent gate |
| `commons.wikimedia.org`, `upload.wikimedia.org` (official Wikimedia API and media host) | `scripts/fetch_images.py` | Image search keywords; downloads CC/public-domain images with license info printed for review | Only when the agent fetches stock imagery for a content design |
| Brand official websites, `simpleicons.org`, Google favicon service | `references/brand-asset-protocol.md` (instructions, no script) | Plain GET requests to download publicly served logos/brand assets | Only when you ask for a brand-specific design |
| `fonts.googleapis.com`, `unpkg.com` and similar CDNs | Static `<link>`/`<script>` tags inside demo/output HTML | Standard browser font/library fetches | When you open HTML in a normal browser, or explicitly pass `--allow-network` to a renderer |

That is the entire list. `grep -rn "https://" --include="*.py" --include="*.mjs" --include="*.js" --include="*.sh" scripts/` to verify.

## HTML renderer network policy

All Playwright-based renderers and `scripts/verify.py` deny HTTP(S), WebSocket, and service workers by default. This prevents an input HTML file from silently loading mutable CDN code or making web requests during export. If a trusted design intentionally depends on remote fonts or scripts, pass `--allow-network`; doing so executes those remote resources inside the browser page and makes the output dependent on them. Prefer vendored, version-pinned local assets for reproducible production output.

## API keys

- No key is hardcoded anywhere; the repo ships only `.env.example` placeholders (`.env` is gitignored).
- Keys are read from the **skill's own root `.env`** or process environment — never from files elsewhere on your machine. `ai-review-video.py` extracts only the single `ARK_API_KEY` variable; it does not load the rest of the file into the environment.
- Keys are transmitted exclusively to the corresponding vendor's official endpoint listed above, over HTTPS, as auth headers.
- `references/react-setup.md` option B (pasting an Anthropic key into a demo page input) is explicitly marked local-demo-only and not recommended; the default options require no key at all.

## Explicit consent gate

Both cloud scripts print exactly what will be sent to which host and exit before any network call unless you pass `--yes` or set `HUASHU_CLOUD_OK=1`. Local renderers do not need the cloud consent gate. Their separate `--allow-network` flag only opts a trusted HTML document into loading its declared web resources; it does not grant access to cloud credentials.

## Subprocesses

All subprocess calls invoke local media tools only: `ffmpeg`, `ffprobe`, `ffplay`, Playwright/Chromium for HTML rendering and screenshots. No shell-to-network combinations, no curl-pipe-sh patterns.

## File deletion

Recursive deletion is limited to temp directories the scripts themselves create with unique timestamp+PID names (`.video-tmp-*`, `.seek-tmp-*`, `_narration/.tmp`, Python `tempfile.TemporaryDirectory`). No script ever deletes user data or anything outside its own scratch space.

## Dependencies

Mainstream registry packages only (`playwright@1.62.1`, `sharp@0.35.4`, `pdf-lib@1.17.1`, `requests`), installed via standard `npm`/`pip`/`uv` — no binary downloads from arbitrary URLs. `pptxgenjs@4.0.1` is an optional peer dependency because it still brings `image-size@1.2.1`, for which upstream has not published a fix for the ICNS, HEIF, and JXL parser denial-of-service advisories. When the optional PPTX exporter is used, it validates image sources in `scripts/image-source-guard.js` and rejects those formats plus remote/custom-scheme sources before PptxGenJS parses them. The guard includes the advisory's truncated zero-size JXL box signature. Do not bypass that guard for untrusted input; update `pptxgenjs`/`image-size` when an upstream fix becomes available.

One documented exception to be aware of: `npx hyperframes init` (optional animation backend, see `references/hyperframes-backend.md`) installs 19 hyperframes documentation skills into `~/.claude/skills/`. This is called out with a warning in the docs before the command.

## Hooks

`scripts/design-gate-hook.sh` is **never installed automatically** — nothing in this skill writes to `settings.json`. If you manually opt in, its entire behavior is: block long-video render commands (exit 2) until a design-approval file exists. It makes no network calls, writes nothing, deletes nothing.

## Proxy handling note

`fetch_images.py` and `ai-review-video.py` disable inheriting proxy environment variables (`trust_env = False` / clearing `ALL_PROXY` etc.) for their own requests. This exists to survive stale local proxy configurations that break TLS — not to evade monitoring. If you need these requests to go through your proxy, set it explicitly in the script invocation.

## Reporting

Found something that contradicts this document? Please open an issue — a mismatch between this file and the code is treated as a bug.
