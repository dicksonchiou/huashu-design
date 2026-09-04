#!/usr/bin/env node
/**
 * tts-doubao.mjs · 豆包語音 TTS（火山引擎 openspeech）
 *
 * ⚠️ 可選雲能力：本指令碼會把待配音文字傳送到位元組跳動官方 TTS 介面（openspeech.bytedance.com），
 * 使用你自己的 key，endpoint 強制校驗域名白名單。首次呼叫需 --yes 或 HUASHU_CLOUD_OK=1
 * 顯式確認。資料流向宣告見倉庫根 SECURITY.md。
 *
 * 用法：
 *   node scripts/cloud/tts-doubao.mjs --text "你好" --out demo.mp3 --yes
 *   node scripts/cloud/tts-doubao.mjs --text-file script.txt --out out.mp3 --speed 1.0 --yes
 *   node scripts/cloud/tts-doubao.mjs --text "你好" --out demo.mp3 --timestamps --yes   # 附帶字級時間戳
 *
 * 輸出：
 *   - mp3 檔案寫到 --out 路徑
 *   - stdout 列印一行 JSON: {"path":"...","duration":12.34,"bytes":54321}
 *   - 帶 --timestamps 時額外含 words: [{text,start,end,confidence}]（秒，相對本段音訊開頭）
 *     注意：時間戳文字是 TN 後文字（如 "2025" 會變成 "二零二五"），標點附在前一個字上；
 *     需要 2.0 資源（seed-tts-2.0 / seed-icl-2.0），僅中英文。
 *
 * 依賴：Node 18+（自帶 fetch/crypto）、ffprobe（測時長，brew install ffmpeg）
 *
 * env（自動從 skill 根目錄 .env 讀取，也可走 process.env 覆蓋）：
 *   DOUBAO_TTS_API_KEY     可選（新版 API Key 鑑權）
 *   DOUBAO_APP_ID          可選（控制檯 App ID，與 DOUBAO_ACCESS_KEY 搭配）
 *   DOUBAO_ACCESS_KEY      可選（控制檯 Access Token，與 DOUBAO_APP_ID 搭配）
 *   DOUBAO_TTS_VOICE_ID    必填（音色 id）
 *   DOUBAO_TTS_RESOURCE_ID 可選（預設按音色自動推斷）
 *   DOUBAO_TTS_ENDPOINT    預設 https://openspeech.bytedance.com/api/v3/tts/unidirectional
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { TTS_FETCH_POLICY, validateTtsEndpoint } from './endpoint-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..', '..');

function loadEnv() {
  const envPath = path.join(SKILL_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

function parseArgs(argv) {
  const args = { speed: '1.0', encoding: 'mp3' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--text') args.text = argv[++i];
    else if (a === '--text-file') args.textFile = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--speed') args.speed = argv[++i];
    else if (a === '--voice') args.voice = argv[++i];
    else if (a === '--encoding') args.encoding = argv[++i];
    else if (a === '--timestamps') args.timestamps = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.error(`
tts-doubao.mjs · 豆包語音 TTS

  --text <str>          要合成的文字
  --text-file <path>    從檔案讀取文字（與 --text 二選一）
  --out <path>          輸出 mp3 路徑（必填）
  --speed <float>       語速倍率，預設 1.0（0.5-2.0）
  --voice <voice_id>    覆蓋 .env 裡的音色 id
  --encoding <ext>      mp3 / wav / pcm，預設 mp3
  --timestamps          請求字級時間戳（enable_subtitle），結果 JSON 多一個 words 陣列
  --yes                 確認將文字傳送到豆包 TTS 官方介面（或設 HUASHU_CLOUD_OK=1）
`.trim());
  process.exit(1);
}

function getDuration(filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf8' });
    return parseFloat(out.trim());
  } catch (e) {
    return null;
  }
}

function inferResourceId(voiceId) {
  // 復刻音色預設走 2.0：本帳號僅開通了 seed-icl-2.0（1.0 會 403 resource not granted），
  // 且字級時間戳（enable_subtitle）只有 2.0 資源支援。
  if (voiceId.startsWith('S_')) return 'seed-icl-2.0';
  if (voiceId.includes('uranus')) return 'seed-tts-2.0';
  return 'seed-tts-1.0';
}

function speedToSpeechRate(speed) {
  const ratio = parseFloat(speed);
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(-50, Math.min(100, Math.round((ratio - 1) * 100)));
}

function buildAuthHeaders({ requestId, resourceId }) {
  const apiKey = process.env.DOUBAO_TTS_API_KEY;
  const appId = process.env.DOUBAO_APP_ID;
  const accessKey = process.env.DOUBAO_ACCESS_KEY;
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': requestId,
  };

  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
    return headers;
  }

  if (!appId) throw new Error('缺 DOUBAO_TTS_API_KEY 或 DOUBAO_APP_ID（檢查 .env）');
  if (!accessKey) throw new Error('缺 DOUBAO_ACCESS_KEY（檢查 .env）');

  headers['X-Api-App-Id'] = appId;
  headers['X-Api-Access-Key'] = accessKey;
  return headers;
}

async function readV3Audio(res) {
  const text = await res.text();
  const chunks = [];
  const words = []; // 字級時間戳（enable_subtitle 開啟時伺服器端依句回傳 sentence.words）
  let finalCode = null;
  let finalMessage = '';

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let json;
    try {
      json = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`API 響應行不是 JSON：${trimmed.slice(0, 200)}`);
    }

    const code = json.code ?? 0;
    if (code === 20000000) {
      finalCode = code;
      finalMessage = json.message || '';
      break;
    }
    if (code !== 0) {
      throw new Error(`API 回傳錯誤 code=${code} msg=${json.message || JSON.stringify(json)}`);
    }
    if (json.data) chunks.push(Buffer.from(json.data, 'base64'));
    if (json.sentence && Array.isArray(json.sentence.words)) {
      for (const w of json.sentence.words) {
        words.push({
          text: w.word,
          start: w.startTime,
          end: w.endTime,
          confidence: w.confidence,
        });
      }
    }
  }

  if (!chunks.length) {
    const detail = finalCode ? `結束碼 ${finalCode} ${finalMessage}` : text.slice(0, 500);
    throw new Error(`API 響應無音訊資料：${detail}`);
  }
  return { audio: Buffer.concat(chunks), words };
}

async function tts({ text, voice, speed, encoding, timestamps }) {
  const endpoint = validateTtsEndpoint(
    process.env.DOUBAO_TTS_ENDPOINT || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
  ).href;
  const voiceId = voice || process.env.DOUBAO_TTS_VOICE_ID || process.env.DOUBAO_SPEAKER;
  const resourceId = process.env.DOUBAO_TTS_RESOURCE_ID || inferResourceId(voiceId || '');
  const requestId = randomUUID();

  if (!voiceId) throw new Error('缺 DOUBAO_TTS_VOICE_ID（檢查 .env 或用 --voice 傳）');

  const body = {
    user: { uid: 'huashu-design' },
    req_params: {
      text,
      speaker: voiceId,
      audio_params: {
        format: encoding,
        sample_rate: 24000,
        speech_rate: speedToSpeechRate(speed),
        // 字級時間戳：僅 2.0 資源（seed-tts-2.0 / seed-icl-2.0）支援，中英文 only
        ...(timestamps ? { enable_subtitle: true } : {}),
      },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: buildAuthHeaders({ requestId, resourceId }),
    body: JSON.stringify(body),
    ...TTS_FETCH_POLICY,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  return readV3Audio(res);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) usage();

  let text = args.text;
  if (!text && args.textFile) {
    text = fs.readFileSync(args.textFile, 'utf8').trim();
  }
  if (!text) {
    console.error('錯：缺 --text 或 --text-file');
    usage();
  }
  if (!args.out) {
    console.error('錯：缺 --out');
    usage();
  }

  if (!args.yes && process.env.HUASHU_CLOUD_OK !== '1') {
    const host = validateTtsEndpoint(
      process.env.DOUBAO_TTS_ENDPOINT || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    ).hostname;
    console.error(
      `[雲能力確認] 本次將把約${text.length}字文字傳送到 ${host}（豆包TTS官方介面，使用你自己的key合成語音）。\n` +
      `確認無誤請重跑並加 --yes，或設定環境變數 HUASHU_CLOUD_OK=1。資料流向宣告見 SECURITY.md。`,
    );
    process.exit(2);
  }

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const { audio, words } = await tts({
    text,
    voice: args.voice,
    speed: args.speed,
    encoding: args.encoding,
    timestamps: args.timestamps,
  });

  fs.writeFileSync(outPath, audio);
  const duration = getDuration(outPath);
  const result = {
    path: outPath,
    bytes: audio.length,
    duration,
    text_chars: text.length,
  };
  if (args.timestamps) result.words = words;
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(`TTS 失敗：${err.message}`);
  process.exit(1);
});
