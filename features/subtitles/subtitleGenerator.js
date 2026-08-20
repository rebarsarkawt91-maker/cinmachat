/**
 * subtitleGenerator.js — standalone Node.js module that generates .srt subtitles
 * for videos using free local tools:
 *   ffmpeg (extract audio) -> OpenAI Whisper CLI (transcribe) -> Gemini API (optional translate).
 * Uses GEMINI_API_KEY from the environment. Touches nothing else in the project.
 *
 * Every child process runs asynchronously with a hard timeout, so a slow download,
 * a stuck transcription or a hung Gemini call can never block the event loop or
 * hang the HTTP request forever.
 */

"use strict";

const { execFile, execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi"];
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_MAX_SUBTITLE_CHARS = Number(process.env.SUBTITLE_GEMINI_MAX_CHARS) || 30000;

// Per-step timeouts (ms). Tune via env if needed.
const TIMEOUTS = {
  ffmpeg: Number(process.env.SUBTITLE_FFMPEG_TIMEOUT) || 120000,
  whisper: Number(process.env.SUBTITLE_WHISPER_TIMEOUT) || 600000,
  gemini: Number(process.env.SUBTITLE_GEMINI_TIMEOUT) || 60000,
};

const subtitleRuntime = {
  execFile,
  execFileSync,
  spawnSync,
  fs,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  makeTempDirBase: () => path.join(os.tmpdir(), "cinemachat-sub-"),
};

// Simple timestamped progress logger shared by every step.
function log(msg) {
  console.log(`[${new Date().toISOString()}] [subtitle] ${msg}`);
}

// Kill a process AND its whole child tree (taskkill on Windows handles trees).
function killProcessTree(pid) {
  try {
    if (process.platform === "win32") {
      subtitleRuntime.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    /* process may already be gone */
  }
}

// Run a child process asynchronously with a timeout. Resolves with stdout,
// rejects with a clear message that says WHICH command and step timed out.
function execFileAsync(cmd, args, { timeoutMs = 120000, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = subtitleRuntime.execFile(
      cmd,
      args,
      { maxBuffer: 64 * 1024 * 1024, encoding: "utf-8", env: env || process.env },
      (err, stdout, stderr) => {
        if (err) {
          // execFile sets err.killed when the process was terminated (incl. our timeout).
          const reason = err.killed
            ? `timed out after ${Math.round(timeoutMs / 1000)}s`
            : (stderr || err.message || "unknown error").toString().slice(0, 1200);
          reject(new Error(`${cmd} ${reason}`));
        } else {
          resolve(stdout);
        }
      },
    );
    child.stdout?.on("data", (d) => log(`  ${cmd} out: ${String(d).trim().slice(0, 300)}`));
    child.stderr?.on("data", (d) => log(`  ${cmd} err: ${String(d).trim().slice(0, 300)}`));
    if (timeoutMs > 0) {
      const timer = setTimeout(() => {
        killProcessTree(child.pid);
        reject(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      child.on("exit", () => clearTimeout(timer));
    }
  });
}

// Verify that ffmpeg and whisper are installed, so the user gets a clear error.
// Uses "where"/"which" instead of "whisper --help", because printing the help
// text can crash on Windows cp1252 consoles (non-ASCII chars) even when whisper
// is perfectly installed.
function checkTools() {
  try { subtitleRuntime.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); }
  catch { throw new Error("ffmpeg not found on PATH. Install from https://ffmpeg.org/"); }
  const finder = process.platform === "win32" ? "where" : "which";
  try { subtitleRuntime.execFileSync(finder, ["whisper"], { stdio: "ignore" }); }
  catch { throw new Error("whisper CLI not found on PATH. Install with: pip install openai-whisper"); }
}

// Throwaway folder for intermediate files.
function makeTempDir() {
  return subtitleRuntime.fs.mkdtempSync(subtitleRuntime.makeTempDirBase());
}

// Step 1: pull a clean mono 16 kHz WAV out of the video (best format for Whisper).
async function extractAudio(videoFilePath, wavFilePath) {
  log(`step 1/3: extracting audio with ffmpeg (${path.basename(videoFilePath)})`);
  await execFileAsync(
    "ffmpeg",
    ["-y", "-i", videoFilePath, "-vn", "-ac", "1", "-ar", "16000", wavFilePath],
    { timeoutMs: TIMEOUTS.ffmpeg },
  );
  // A tiny WAV usually means the video has no real audio track.
  let size = 0;
  try { size = subtitleRuntime.fs.statSync(wavFilePath).size; } catch { throw new Error(`No audio created for ${videoFilePath}`); }
  if (size < 1024) throw new Error(`Extracted audio is empty for ${videoFilePath}`);
  log(`  audio extracted: ${(size / 1024).toFixed(0)} KB`);
}

// Step 2: run Whisper CLI. It writes one .srt and one .json (with the detected
// language) into outputDir, named "<wavName>.<language>.<ext>". PYTHONUTF8 is
// forced so Python never crashes trying to print non-ASCII text on Windows.
// The model is pinned to "base" (small, fast, free) and can be changed with the
// WHISPER_MODEL environment variable.
async function runWhisper(wavFilePath, outputDir) {
  log(`step 2/3: transcribing with whisper (model=${process.env.WHISPER_MODEL || "base"})`);
  await execFileAsync(
    "whisper",
    ["--model", process.env.WHISPER_MODEL || "base",
      "--output_format", "all", "--output_dir", outputDir,
      "--verbose", "False", wavFilePath],
    {
      timeoutMs: TIMEOUTS.whisper,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    },
  );
  // Find the outputs by scanning the folder rather than guessing the language code.
  const files = subtitleRuntime.fs.readdirSync(outputDir);
  const srtFile = files.find((f) => f.endsWith(".srt"));
  const jsonFile = files.find((f) => f.endsWith(".json"));
  if (!srtFile || !jsonFile) throw new Error("whisper did not produce SRT/JSON output");

  const srtText = subtitleRuntime.fs.readFileSync(path.join(outputDir, srtFile), "utf-8");
  const result = JSON.parse(subtitleRuntime.fs.readFileSync(path.join(outputDir, jsonFile), "utf-8"));
  if (!srtText.trim()) throw new Error("whisper produced empty transcription (no speech found)");
  log(`  transcription done: detected language = ${result.language || "unknown"}, ${srtText.trim().split("\n").length} lines`);
  return { srtText, detectedLanguage: result.language || "unknown" };
}

// Step 3: translate the whole subtitle file at once, telling Gemini to keep the
// file structure (cue numbers, identifiers, timestamps) identical so the
// subtitles never go out of sync. Works for both SRT and WebVTT input, and
// returns the file in the exact same format it was given.
function subtitleTargetLanguageName(targetLang) {
  const code = String(targetLang || "").toLowerCase();
  if (code === "ckb" || code === "ku" || code === "kur" || code === "sorani") {
    return `Kurdish Sorani (Central Kurdish, Arabic script; language code "${targetLang}")`;
  }
  if (code === "en") return `English (language code "${targetLang}")`;
  return `language code "${targetLang}"`;
}

const SUBTITLE_METADATA_LINE_PATTERNS = [
  /\bkurd\s*[-_.]*\s*zhin\b/i,
  /\bkurdzhin\b/i,
  /کورد\s*ژین/i,
  /\b(?:translated|subtitle(?:s)?|caption(?:s)?|sync(?:ed)?|provided|uploaded|encoded|edited)\s+(?:by|from)\b/i,
  /\b(?:telegram|t\.me\/|instagram|facebook|youtube\s+channel|subscribe|follow\s+us)\b/i,
  /^\s*(?:https?:\/\/|www\.)\S+\s*$/i,
  /^\s*[@#][\w.-]{3,}\s*$/i,
];

const SUBTITLE_SYSTEM_INJECTION_PATTERNS = [
  /^```[\w-]*$/i,
  /^(?:here(?:'s| is)|below is|this is)\s+(?:the\s+)?(?:translated\s+)?(?:subtitle|srt|vtt|translation)/i,
  /^(?:translated subtitle|translation|output subtitle|input subtitle file|raw subtitle file)\s*:?\s*$/i,
  /^#+\s*(?:subtitle|translation|output)/i,
];

function subtitleMetadataProbe(rawLine) {
  return String(rawLine || "")
    .replace(/<\d{2}:\d{2}:\d{2}[\.,]\d{3}>/g, "")
    .replace(/<\/?c[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function isSubtitleStructureLine(line) {
  const trimmed = String(line || "").trim();
  return (
    !trimmed ||
    /^WEBVTT$/i.test(trimmed) ||
    /^\d+$/.test(trimmed) ||
    /\d{2}:\d{2}:\d{2}[\.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[\.,]\d{3}/.test(trimmed)
  );
}

function isSubtitleMetadataLine(line) {
  const clean = subtitleMetadataProbe(line);
  if (!clean) return false;
  if (/^(Kind|Language|X-TIMESTAMP-MAP):/i.test(clean)) return true;
  if (/^(NOTE|STYLE|REGION)(?:\s|$)/i.test(clean)) return true;
  return (
    SUBTITLE_SYSTEM_INJECTION_PATTERNS.some((pattern) => pattern.test(clean)) ||
    SUBTITLE_METADATA_LINE_PATTERNS.some((pattern) => pattern.test(clean))
  );
}

function stripSubtitleMetadataFragments(line) {
  if (isSubtitleStructureLine(line)) return line;
  return String(line || "")
    .replace(/\bkurd\s*[-_.]*\s*zhin\b/gi, "")
    .replace(/\bkurdzhin\b/gi, "")
    .replace(/کورد\s*ژین/g, "")
    .replace(/\s*(?:[-–—|•]+)\s*(?:translated|subtitle(?:s)?|caption(?:s)?)\s+(?:by|from)\s+.*$/i, "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*[-–—|•:]+|[-–—|•:]+\s*$/g, "")
    .trim();
}

function sanitizeSubtitleText(rawText) {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const keepTrailingNewline = /\n\s*$/.test(normalized);
  const output = [];
  let skipBlock = false;

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/i.test(trimmed)) {
      skipBlock = true;
      continue;
    }
    if (skipBlock) {
      if (!trimmed) {
        skipBlock = false;
        output.push(line);
      }
      continue;
    }
    const stripped = stripSubtitleMetadataFragments(line);
    if (!isSubtitleStructureLine(line) && isSubtitleMetadataLine(stripped)) continue;
    if (stripped || isSubtitleStructureLine(line)) {
      output.push(stripped);
    }
  }

  const cleaned = output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned && keepTrailingNewline ? `${cleaned}\n` : cleaned;
}

function extractSubtitleTimingLines(text) {
  return String(text || "").match(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}(?:[^\n]*)/g) || [];
}

function validateTranslatedSubtitleStructure(sourceText, translatedText) {
  const sourceTimings = extractSubtitleTimingLines(sourceText);
  if (!sourceTimings.length) return;
  const translatedTimings = extractSubtitleTimingLines(translatedText);
  if (translatedTimings.length !== sourceTimings.length) {
    throw new Error(
      `Gemini returned ${translatedTimings.length} subtitle timings; expected ${sourceTimings.length}`,
    );
  }
  for (let i = 0; i < sourceTimings.length; i += 1) {
    if (translatedTimings[i] !== sourceTimings[i]) {
      throw new Error(`Gemini changed subtitle timing at cue ${i + 1}`);
    }
  }
}

async function translateSrtViaGemini(srtText, targetLang, userApiKey) {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set; cannot translate subtitles");
  const sanitizedSource = sanitizeSubtitleText(srtText);
  if (!sanitizedSource) throw new Error("Subtitle file is empty after metadata cleanup");

  const translateChunk = async (subtitleChunk) => {
    const targetLanguageName = subtitleTargetLanguageName(targetLang);
    const prompt =
      `You are a strict subtitle translation engine. Translate the subtitle file below into ${targetLanguageName}.\n\n` +
      `STRICT RULES - follow exactly:\n` +
      `1. Translate ONLY the dialogue/text content of each cue. Never add words, explanations, notes, speaker labels, guesses, or new meaning.\n` +
      `2. Preserve every cue number, timestamp line, identifier, blank line, and file structure exactly as provided.\n` +
      `3. Keep a 1:1 mapping: each original cue must remain one translated cue in the same order. Do not merge, split, reorder, skip, or summarize cues.\n` +
      `4. Keep the same number of subtitle text lines inside each cue whenever possible. If a cue has two text lines, return two translated text lines.\n` +
      `5. Translate literally and conservatively according to the source text. Preserve names, brands, codes, and unclear words unchanged.\n` +
      `6. Return the complete raw subtitle file only. Do not use markdown fences or commentary.\n\n` +
      `Input subtitle file:\n\n${subtitleChunk}`;

    const headers = { "Content-Type": "application/json" };
    if (process.env.GEMINI_REFERER) headers["Referer"] = process.env.GEMINI_REFERER;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.gemini);
    let response;
    try {
      response = await subtitleRuntime.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }),
          signal: controller.signal,
        },
      );
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error(`Gemini API timed out after ${Math.round(TIMEOUTS.gemini / 1000)}s`);
      }
      throw new Error(`Gemini request failed: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);

    const data = await response.json();
    const translated = sanitizeSubtitleText(data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(""));
    if (!translated || !translated.trim()) throw new Error("Gemini returned an empty translation");
    validateTranslatedSubtitleStructure(subtitleChunk, translated);
    return translated;
  };

  const splitIntoChunks = (subtitleText) => {
    if (subtitleText.length <= GEMINI_MAX_SUBTITLE_CHARS) return [subtitleText];
    const blocks = subtitleText.split(/\n\s*\n/).filter((block) => block.trim());
    const chunks = [];
    let currentChunk = "";
    for (const block of blocks) {
      const candidate = currentChunk ? `${currentChunk}\n\n${block}` : block;
      if (currentChunk && candidate.length > GEMINI_MAX_SUBTITLE_CHARS) {
        chunks.push(currentChunk);
        currentChunk = block;
      } else {
        currentChunk = candidate;
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  };

  const chunks = splitIntoChunks(sanitizedSource);
  if (chunks.length > 1) {
    log(`step 3/3: translating ${sanitizedSource.trim().split("\n").length} lines in ${chunks.length} Gemini chunks to "${targetLang}" (${GEMINI_MODEL})`);
    chunks.forEach((c, i) => log(`  Gemini chunk ${i + 1}/${chunks.length} (${c.length} chars)`));
    const results = await Promise.all(chunks.map((chunk) => translateChunk(chunk)));
    const translatedChunks = results.map((r) => r.replace(/\n+$/g, ""));
    const trailingNewline = /\n$/.test(sanitizedSource) ? "\n" : "";
    return `${translatedChunks.join("\n\n")}${trailingNewline}`;
  }
  log(`step 3/3: translating ${sanitizedSource.trim().split("\n").length} lines to "${targetLang}" with Gemini (${GEMINI_MODEL})`);
  return translateChunk(sanitizedSource);
}

// Transcribe ONE video file and save the final .srt next to it.
async function generateSubtitle(videoFilePath, outputLang = "en") {
  const videoPath = path.resolve(videoFilePath);
  if (!subtitleRuntime.fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  checkTools();
  const tempDir = makeTempDir();
  const started = subtitleRuntime.now();
  try {
    // Step 1: extract a clean WAV.
    const wavPath = path.join(tempDir, "audio.wav");
    await extractAudio(videoPath, wavPath);

    // Step 2: transcribe the WAV to SRT locally with Whisper.
    const { srtText, detectedLanguage } = await runWhisper(wavPath, tempDir);

    // Step 3: translate only when the detected language differs from the target.
    let finalSrt = sanitizeSubtitleText(srtText);
    if (outputLang && detectedLanguage !== outputLang) {
      finalSrt = await translateSrtViaGemini(finalSrt, outputLang);
    } else {
      log("  no translation needed (languages match)");
    }

    // Step 4: save next to the video, using the video's own filename.
    const srtPath = path.join(
      path.dirname(videoPath),
      path.basename(videoPath, path.extname(videoPath)) + ".srt",
    );
    subtitleRuntime.fs.writeFileSync(srtPath, finalSrt, "utf-8");

    log(`done in ${((subtitleRuntime.now() - started) / 1000).toFixed(1)}s -> ${srtPath} (detected: ${detectedLanguage})`);
    return srtPath;
  } finally {
    // Always clean up the temp folder, even when an error is thrown.
    subtitleRuntime.fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Process every video in a folder one by one. Never stops the batch because of
// one bad video, and skips videos that already have a matching .srt file.
async function generateSubtitlesForFolder(folderPath, outputLang = "en") {
  const folder = path.resolve(folderPath);
  if (!subtitleRuntime.fs.existsSync(folder)) throw new Error(`Folder not found: ${folder}`);

  const videos = subtitleRuntime.fs
    .readdirSync(folder)
    .filter((f) => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();

  let failed = 0;
  for (let i = 0; i < videos.length; i++) {
    const fileName = videos[i];
    log(`Processing ${i + 1} of ${videos.length}: ${fileName}`);

    const srtPath = path.join(folder, path.basename(fileName, path.extname(fileName)) + ".srt");
  if (subtitleRuntime.fs.existsSync(srtPath)) { log(`Skipping ${fileName}: .srt already exists`); continue; }

    try {
      await generateSubtitle(path.join(folder, fileName), outputLang);
      log(`Done: ${fileName}`);
    } catch (err) {
      failed++;
      console.error(`Failed ${fileName}: ${err.message}`);
    }
  }

  const succeeded = videos.length - failed;
  log(`Finished: ${succeeded} succeeded, ${failed} failed`);
  return { total: videos.length, succeeded, failed };
}

function __setSubtitleTestHooks(overrides = {}) {
  Object.assign(subtitleRuntime, overrides);
}

function __resetSubtitleTestHooks() {
  subtitleRuntime.execFile = execFile;
  subtitleRuntime.execFileSync = execFileSync;
  subtitleRuntime.spawnSync = spawnSync;
  subtitleRuntime.fs = fs;
  subtitleRuntime.fetch = (...args) => fetch(...args);
  subtitleRuntime.now = () => Date.now();
  subtitleRuntime.makeTempDirBase = () => path.join(os.tmpdir(), "cinemachat-sub-");
}

module.exports = {
  generateSubtitle,
  generateSubtitlesForFolder,
  sanitizeSubtitleText,
  translateSrtViaGemini,
  __setSubtitleTestHooks,
  __resetSubtitleTestHooks,
};

// ---------------------------------------------------------------------------
// Example usage (uncomment to try):
// ---------------------------------------------------------------------------
// const { generateSubtitle, generateSubtitlesForFolder } = require("./subtitleGenerator");
// // Single movie -> English subtitles:
// // generateSubtitle("C:/Movies/Inception.mp4", "en").then((p) => console.log("Subtitle ready:", p)).catch((e) => console.error(e.message));
// // Whole folder -> Kurdish Sorani subtitles, one video at a time:
// // generateSubtitlesForFolder("C:/Movies", "ar").then((s) => console.log("Batch done:", s)).catch((e) => console.error(e.message));
