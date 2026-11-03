// The Freesound sample pipeline. Local only: needs ffmpeg and FREESOUND_API_KEY in .env.local; the game and CI only
// use its results (public/audio, src/engine/sfx-manifest.js).
//   node tools/sfx.mjs search [sound...]   find, download, measure and prepare candidates in output/sfx-candidates/
//   node tools/sfx.mjs build               render the picks in tools/sfx-picks.json into the game, with credits
// Only CC0 and CC-BY sounds pass; the licence is checked again against the API at build time.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES, KEEP } from "./sfx-recipes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "output/sfx-candidates");
const PICKS = join(ROOT, "tools/sfx-picks.json");
const AUDIO = join(ROOT, "public/audio");
const MANIFEST = join(ROOT, "src/engine/sfx-manifest.js");
const API = "https://freesound.org/apiv2";
const FIELDS = "id,name,tags,username,license,duration,url,avg_rating,num_ratings,num_downloads,previews";
const MAX_AUDIO_BYTES = 1.5 * 1024 * 1024;
const CANDIDATES = 8;
const RATE = 44100; // for measuring only: high enough to count the energy of bright sounds

// Never: music, speech, recordings of a place, adult sounds, joke sounds.
const BAN = /\b(music|melody|song|chord|guitar|piano|speech|talk|spoken|sentence|narrat|sing|singing|podcast|ambien|field.?recording|soundscape|moan|orgasm|sex|fart|vomit|burp|toilet|kid|child|baby|cartoon|mario|minecraft|zelda)/i;
const VOICE = /\b(voice|vocal|word|counting)\b/i;
const GUN = /\b(gun|rifle|pistol|shotgun|firearm)/i;

function apiKey() {
  const m = readFileSync(join(ROOT, ".env.local"), "utf8").match(/^FREESOUND_API_KEY=(\S+)/m);
  if (!m) throw new Error("FREESOUND_API_KEY missing from .env.local");
  return m[1];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The API allows 60 requests a minute. Answers are cached, so a rerun only asks for what is new.
let lastCall = 0;
async function api(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const cacheFile = join(OUT, "cache", createHash("sha1").update(url.href).digest("hex") + ".json");
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  await sleep(Math.max(0, lastCall + 1100 - Date.now()));
  lastCall = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Token ${apiKey()}` } });
  if (!res.ok) throw new Error(`Freesound ${res.status} on ${path}`);
  const data = await res.json();
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}
const isCC0 = (l) => /publicdomain\/zero/.test(l);
const isBY = (l) => /creativecommons\.org\/licenses\/by\/\d/.test(l);
const licenseName = (l) => (isCC0(l) ? "CC0 1.0" : `CC BY ${l.match(/by\/([\d.]+)/)?.[1] ?? ""}`.trim());

function acceptable(s, r) {
  if (!Number.isInteger(s.id)) return false;
  if (!isCC0(s.license) && !isBY(s.license)) return false;
  const text = `${s.name} ${(s.tags ?? []).join(" ")}`.toLowerCase().replace(/[_-]/g, " ");
  if (!r.must.test(text) || BAN.test(text) || r.ban?.test(text)) return false;
  if (!r.voice && VOICE.test(text)) return false;
  if (!r.gun && GUN.test(text)) return false;
  return s.duration >= r.dur[0] && s.duration <= r.dur[1];
}

async function download(s) {
  const file = join(OUT, "raw", `${s.id}.ogg`);
  if (existsSync(file)) return file;
  const url = new URL(s.previews["preview-hq-ogg"]);
  if (url.protocol !== "https:" || !/(^|\.)freesound\.org$/.test(url.hostname)) throw new Error(`unexpected preview host ${url.hostname}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`preview ${res.status} for ${s.id}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  await sleep(150);
  return file;
}

function ffmpeg(args, opts = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr).slice(0, 300)}`);
  return r.stdout;
}

const db = (x) => 20 * Math.log10(Math.max(x, 1e-7));

function centroid(x) {
  const N = 4096, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= N; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k), s = Math.sin(a * k), p = i + k, q = p + len / 2;
        const tr = re[q] * c - im[q] * s, ti = re[q] * s + im[q] * c;
        re[q] = re[p] - tr;
        im[q] = im[p] - ti;
        re[p] += tr;
        im[p] += ti;
      }
    }
  }
  let sum = 0, w = 0;
  for (let i = 1; i < N / 2; i++) {
    const m = Math.hypot(re[i], im[i]);
    sum += m * ((i * RATE) / N);
    w += m;
  }
  return w ? sum / w : 0;
}

/** Decode a file and describe it: where it starts and ends, how sharp, how bright, how loud at its loudest. */
function measure(file, trim) {
  // ffmpeg's default mono-to-stereo lowers the level by 3 dB, so a mono file is copied to both channels by hand
  const channels = +spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", file]).stdout.toString().trim();
  const layout = channels === 1 ? ["-af", "pan=stereo|c0=c0|c1=c0"] : ["-ac", "2"];
  const raw = ffmpeg(["-i", file, ...layout, "-ar", String(RATE), "-f", "f32le", "pipe:1"]);
  const n = Math.floor(raw.length / 8);
  if (n < 200) return null;
  const v = new Float32Array(raw.buffer, raw.byteOffset, n * 2);
  const mono = new Float32Array(n);
  let peak = 0, clipped = 0, sumSide = 0, sumMono = 0;
  for (let i = 0; i < n; i++) {
    const l = v[i * 2], r = v[i * 2 + 1], m = (l + r) / 2;
    mono[i] = m;
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    if (a > 0.995) clipped++;
    sumSide += (l * l + r * r) / 2;
    sumMono += m * m;
  }
  if (peak < 0.005) return null;
  // a 5 ms envelope
  const hop = Math.round(RATE * 0.005), env = new Float32Array(Math.ceil(n / hop));
  for (let f = 0; f < env.length; f++) {
    let s = 0, c = 0;
    for (let i = f * hop; i < Math.min(n, (f + 1) * hop); i++, c++) s += mono[i] * mono[i];
    env[f] = c ? Math.sqrt(s / c) : 0;
  }
  const top = env.reduce((a, b) => Math.max(a, b), 0);
  if (!top) return null;
  const startF = env.findIndex((e) => e > top * 0.06);
  const peakF = env.indexOf(top);
  let endF = env.length - 1;
  while (endF > startF && env[endF] < top * 0.01) endF--;
  // separate events: rises back over 45% after falling under 12%
  let events = 1, low = false;
  for (let f = peakF; f < env.length; f++) {
    if (env[f] < top * 0.12) low = true;
    else if (low && env[f] > top * 0.45) {
      events++;
      low = false;
    }
  }
  // the loudest 50 ms inside the part the game will use
  const start = startF * hop, usable = Math.min(n, start + Math.round(trim * RATE));
  const win = Math.round(RATE * 0.05);
  let best = 0, acc = 0, usedPeak = 0;
  for (let i = start; i < usable; i++) {
    acc += mono[i] * mono[i];
    if (i - start >= win) acc -= mono[i - win] * mono[i - win];
    if (acc > best) best = acc;
    if (Math.abs(mono[i]) > usedPeak) usedPeak = Math.abs(mono[i]);
  }
  return {
    start: (startF * hop) / RATE,
    attack: Math.max(0, peakF - startF) * 0.005,
    active: ((endF - startF + 1) * hop) / RATE,
    events,
    clipped: clipped / n,
    phase: sumSide ? sumMono / sumSide : 1, // under ~0.4 the stereo cancels when summed to mono
    centroid: centroid(mono.subarray(start, start + 4096)),
    level: db(Math.sqrt(best / Math.min(win, Math.max(1, usable - start)))),
    peak: db(usedPeak),
  };
}

function rejectReason(m, r) {
  if (!m) return "silent or too short";
  if (m.clipped > 0.01) return "clipped";
  if (m.attack > r.trim * 0.6) return "peak too late for the trim";
  if (m.phase < 0.4 && !r.stereo) return "cancels in mono";
  if (r.transient && (m.attack > 0.035 || m.events > 2)) return "not one sharp event";
  if (!r.transient && m.events > 3) return "several events";
  if (m.active < Math.min(0.05, r.trim / 2)) return "too short";
  return null;
}

/** Cut, fade, level and encode one sound the way the game will play it. */
function render(file, out, m, r, gainDb = 0) {
  const len = Math.min(r.trim, m.active + 0.03);
  const fade = Math.min(len * 0.45, 0.03 + len * 0.25);
  // equal loudness at the loudest moment; the mix gain is set per sound in the manifest
  const gain = Math.min(-14 - m.level, -1 - m.peak) + gainDb;
  const af = [
    `atrim=start=${m.start.toFixed(4)}:duration=${len.toFixed(4)}`,
    "asetpts=PTS-STARTPTS",
    "highpass=f=35",
    "afade=t=in:d=0.002",
    `afade=t=out:st=${(len - fade).toFixed(4)}:d=${fade.toFixed(4)}`,
    `volume=${gain.toFixed(2)}dB`,
    "aresample=44100",
  ].join(",");
  mkdirSync(dirname(out), { recursive: true });
  ffmpeg(["-i", file, "-af", af, "-ac", r.stereo ? "2" : "1", "-c:a", "libmp3lame", "-b:a", r.stereo ? "128k" : "80k", "-map_metadata", "-1", out]);
}

function score(s, order) {
  const conf = Math.min(1, (s.num_ratings ?? 0) / 8);
  return (
    (isCC0(s.license) ? 1.5 : 0) +
    Math.log10(1 + (s.num_downloads ?? 0)) +
    (((s.avg_rating ?? 0) - 3) / 2) * conf * 2 +
    3 / (1 + order * 0.3) // the API's own relevance order
  );
}

async function search(names) {
  mkdirSync(OUT, { recursive: true });
  const indexFile = join(OUT, "index.json");
  const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : { sounds: {} };
  for (const name of names) {
    const r = RECIPES[name];
    if (!r) throw new Error(`no recipe for ${name}`);
    const found = new Map();
    for (const q of r.queries) {
      const data = await api("/search/text/", {
        query: q,
        filter: `license:("Creative Commons 0" OR "Attribution") duration:[${r.dur[0]} TO ${r.dur[1]}]`,
        page_size: 50,
        fields: FIELDS,
      });
      (data.results ?? []).forEach((s, i) => {
        if (!acceptable(s, r)) return;
        const v = score(s, i), old = found.get(s.id);
        if (!old || v > old.score) found.set(s.id, { ...s, score: v });
      });
    }
    const ranked = [...found.values()].sort((a, b) => b.score - a.score);
    const picked = [], perAuthor = {}, seenNames = new Set();
    const rejected = {};
    for (const s of ranked) {
      if (picked.length >= CANDIDATES) break;
      if ((perAuthor[s.username] ?? 0) >= 3) continue;
      const key = s.name.toLowerCase().replace(/[\d\s_.-]+/g, "");
      if (seenNames.has(key + s.username) && (perAuthor[s.username] ?? 0) >= 2) continue;
      let file;
      try {
        file = await download(s);
      } catch (e) {
        rejected[e.message] = (rejected[e.message] ?? 0) + 1;
        continue;
      }
      const m = measure(file, r.trim);
      const why = rejectReason(m, r);
      if (why) {
        rejected[why] = (rejected[why] ?? 0) + 1;
        continue;
      }
      render(file, join(OUT, name, `${s.id}.mp3`), m, r);
      perAuthor[s.username] = (perAuthor[s.username] ?? 0) + 1;
      seenNames.add(key + s.username);
      picked.push({
        id: s.id, name: s.name, username: s.username, license: licenseName(s.license), licenseUrl: s.license, url: s.url,
        duration: s.duration, rating: s.avg_rating, ratings: s.num_ratings, downloads: s.num_downloads, tags: (s.tags ?? []).slice(0, 8),
        attack: +m.attack.toFixed(3), active: +m.active.toFixed(3), events: m.events, centroid: Math.round(m.centroid), phase: +m.phase.toFixed(2),
      });
    }
    index.sounds[name] = { group: r.group, trim: r.trim, stereo: !!r.stereo, candidates: picked };
    writeFileSync(indexFile, JSON.stringify(index, null, 1));
    console.log(`${name.padEnd(8)} ${String(ranked.length).padStart(3)} matches -> ${picked.length} candidates${Object.keys(rejected).length ? "  rejected: " + JSON.stringify(rejected) : ""}`);
  }
  index.keep = KEEP;
  writeFileSync(indexFile, JSON.stringify(index, null, 1));
}

async function build() {
  const picks = JSON.parse(readFileSync(PICKS, "utf8"));
  const levels = JSON.parse(readFileSync(join(ROOT, "tools/sfx-levels.json"), "utf8"));
  const manifest = {}, credits = [];
  mkdirSync(join(AUDIO, "sfx"), { recursive: true });
  const written = new Set();
  for (const [name, pick] of Object.entries(picks)) {
    if (!pick.ids?.length) continue;
    const r = { ...RECIPES[name], ...(pick.trim ? { trim: pick.trim } : {}) };
    if (!r.must) throw new Error(`no recipe for ${name}`);
    const files = [];
    for (const [i, id] of pick.ids.entries()) {
      const s = await api(`/sounds/${id}/`, { fields: FIELDS });
      if (!isCC0(s.license) && !isBY(s.license)) throw new Error(`${id} has licence ${s.license}`);
      const raw = await download(s);
      const m = measure(raw, r.trim);
      if (!m) throw new Error(`${id} does not decode`);
      const file = `${name}-${i + 1}.mp3`;
      render(raw, join(AUDIO, "sfx", file), m, r);
      written.add(file);
      // the gain that lands this file on the level of the synth voice it replaces, plus the pick's own adjustment
      const level = measure(join(AUDIO, "sfx", file), r.trim).level;
      const gain = Math.min(4, Math.max(0.05, 10 ** ((levels[name] + (pick.db ?? 0) - level) / 20)));
      files.push({ file, gain: +gain.toFixed(3) });
      credits.push({ file, id, name: s.name, username: s.username, url: s.url, license: licenseName(s.license), licenseUrl: s.license });
    }
    manifest[name] = { files };
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `// Generated by tools/sfx.mjs from tools/sfx-picks.json; do not edit.\nexport const SFX_SAMPLES = ${JSON.stringify(sorted, null, 2)};\n`);
  const row = (c) => `| \`${c.file}\` | [${c.name.replace(/\|/g, "\\|")}](${c.url}) | ${c.username} | [${c.license}](${c.licenseUrl}) |`;
  writeFileSync(
    join(AUDIO, "CREDITS.md"),
    [
      "# Sound credits",
      "",
      "Sound effects from [Freesound](https://freesound.org). Each file is the Freesound preview of the listed sound,",
      "modified for the game: trimmed, faded, filtered, level-adjusted, usually summed to mono and re-encoded as MP3.",
      "These files keep their own licences and are not covered by the FX Rush licence.",
      "",
      "| File | Sound | Author | Licence |",
      "|---|---|---|---|",
      ...credits.map(row),
      "",
    ].join("\n"),
  );
  let bytes = 0;
  const stale = [];
  for (const f of readdirSync(join(AUDIO, "sfx"))) {
    bytes += statSync(join(AUDIO, "sfx", f)).size;
    if (!written.has(f)) stale.push(f);
  }
  console.log(`${credits.length} files, ${(bytes / 1024).toFixed(0)} KB`);
  if (stale.length) console.log(`no longer used, remove by hand: ${stale.join(", ")}`);
  if (bytes > MAX_AUDIO_BYTES) throw new Error(`public/audio is over the ${MAX_AUDIO_BYTES} byte budget`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "search") await search(rest.length ? rest : Object.keys(RECIPES));
else if (cmd === "build") await build();
else console.log("usage: node tools/sfx.mjs search [sound...] | build");
