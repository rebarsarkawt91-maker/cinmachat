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
  gemini: Number(process.env.SUBTITLE_GEMINI_TIMEOUT) || 180000,
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
  if (code === "ckb") return `Kurdish Sorani (Central Kurdish, Arabic script; language code "${targetLang}")`;
  if (code === "ku") return `Kurdish Kurmancî (language code "${targetLang}")`;
  if (code === "ar") return `Arabic (language code "${targetLang}")`;
  if (code === "fa") return `Persian/Farsi (language code "${targetLang}")`;
  if (code === "tr") return `Turkish (language code "${targetLang}")`;
  if (code === "en") return `English (language code "${targetLang}")`;
  if (code === "fr") return `French (language code "${targetLang}")`;
  if (code === "de") return `German (language code "${targetLang}")`;
  if (code === "es") return `Spanish (language code "${targetLang}")`;
  if (code === "pt") return `Portuguese (language code "${targetLang}")`;
  if (code === "it") return `Italian (language code "${targetLang}")`;
  if (code === "ru") return `Russian (language code "${targetLang}")`;
  if (code === "zh") return `Chinese (language code "${targetLang}")`;
  if (code === "ja") return `Japanese (language code "${targetLang}")`;
  if (code === "ko") return `Korean (language code "${targetLang}")`;
  if (code === "hi") return `Hindi in Devanagari script (language code "${targetLang}")`;
  if (code === "ur") return `Urdu in Nastaliq/Arabic script (language code "${targetLang}")`;
  if (code === "bn") return `Bengali/Bangla (language code "${targetLang}")`;
  if (code === "ta") return `Tamil (language code "${targetLang}")`;
  if (code === "te") return `Telugu (language code "${targetLang}")`;
  if (code === "mr") return `Marathi (language code "${targetLang}")`;
  if (code === "ne") return `Nepali (language code "${targetLang}")`;
  if (code === "si") return `Sinhala (language code "${targetLang}")`;
  if (code === "id") return `Indonesian/Bahasa Indonesia (language code "${targetLang}")`;
  if (code === "ms") return `Malay/Bahasa Melayu (language code "${targetLang}")`;
  if (code === "th") return `Thai (language code "${targetLang}")`;
  if (code === "vi") return `Vietnamese (language code "${targetLang}")`;
  if (code === "pl") return `Polish (language code "${targetLang}")`;
  if (code === "nl") return `Dutch (language code "${targetLang}")`;
  if (code === "sv") return `Swedish (language code "${targetLang}")`;
  if (code === "no") return `Norwegian (language code "${targetLang}")`;
  if (code === "da") return `Danish (language code "${targetLang}")`;
  if (code === "fi") return `Finnish (language code "${targetLang}")`;
  if (code === "cs") return `Czech (language code "${targetLang}")`;
  if (code === "sk") return `Slovak (language code "${targetLang}")`;
  if (code === "ro") return `Romanian (language code "${targetLang}")`;
  if (code === "hu") return `Hungarian (language code "${targetLang}")`;
  if (code === "el") return `Greek (language code "${targetLang}")`;
  if (code === "bg") return `Bulgarian (language code "${targetLang}")`;
  if (code === "hr") return `Croatian (language code "${targetLang}")`;
  if (code === "sr") return `Serbian (language code "${targetLang}")`;
  if (code === "sl") return `Slovenian (language code "${targetLang}")`;
  if (code === "uk") return `Ukrainian (language code "${targetLang}")`;
  if (code === "ka") return `Georgian (language code "${targetLang}")`;
  if (code === "hy") return `Armenian (language code "${targetLang}")`;
  if (code === "he") return `Hebrew (language code "${targetLang}")`;
  if (code === "az") return `Azerbaijani (language code "${targetLang}")`;
  if (code === "kk") return `Kazakh (language code "${targetLang}")`;
  if (code === "uz") return `Uzbek (language code "${targetLang}")`;
  if (code === "tg") return `Tajik (language code "${targetLang}")`;
  if (code === "ps") return `Pashto (language code "${targetLang}")`;
  if (code === "sw") return `Swahili (language code "${targetLang}")`;
  if (code === "am") return `Amharic (language code "${targetLang}")`;
  if (code === "ha") return `Hausa (language code "${targetLang}")`;
  if (code === "yo") return `Yoruba (language code "${targetLang}")`;
  if (code === "zu") return `Zulu (language code "${targetLang}")`;
  return `the language "${targetLang}"`;
}

async function translateSrtViaGemini(srtText, targetLang) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set; cannot translate subtitles");

  const translateChunk = async (subtitleChunk) => {
    const targetLanguageName = subtitleTargetLanguageName(targetLang);
    const prompt =
      `Translate ONLY the spoken-dialogue text lines in the subtitle file below into ` +
      `${targetLanguageName}. The file may be SRT or WebVTT. Keep the ` +
      `file's structure and every cue number, cue identifier and timestamp EXACTLY ` +
      `the same. Return the complete file in the exact same format, adding or ` +
      `removing no lines.\n\n${subtitleChunk}`;

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
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }),
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
    const translated = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
    if (!translated || !translated.trim()) throw new Error("Gemini returned an empty translation");
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

  const chunks = splitIntoChunks(srtText);
  if (chunks.length > 1) {
    log(`step 3/3: translating ${srtText.trim().split("\n").length} lines in ${chunks.length} Gemini chunks to "${targetLang}" (${GEMINI_MODEL})`);
    const translatedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      log(`  Gemini chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      translatedChunks.push((await translateChunk(chunks[i])).replace(/\n+$/g, ""));
    }
    const trailingNewline = /\n$/.test(srtText) ? "\n" : "";
    return `${translatedChunks.join("\n\n")}${trailingNewline}`;
  }
  log(`step 3/3: translating ${srtText.trim().split("\n").length} lines to "${targetLang}" with Gemini (${GEMINI_MODEL})`);
  return translateChunk(srtText);
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
    let finalSrt = srtText;
    if (outputLang && detectedLanguage !== outputLang) {
      finalSrt = await translateSrtViaGemini(srtText, outputLang);
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
// // Whole folder -> Arabic subtitles, one video at a time:
// // generateSubtitlesForFolder("C:/Movies", "ar").then((s) => console.log("Batch done:", s)).catch((e) => console.error(e.message));
