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

// Per-step timeouts (ms). Tune via env if needed.
const TIMEOUTS = {
  ffmpeg: Number(process.env.SUBTITLE_FFMPEG_TIMEOUT) || 120000,
  whisper: Number(process.env.SUBTITLE_WHISPER_TIMEOUT) || 600000,
  gemini: Number(process.env.SUBTITLE_GEMINI_TIMEOUT) || 90000,
};

// Simple timestamped progress logger shared by every step.
function log(msg) {
  console.log(`[${new Date().toISOString()}] [subtitle] ${msg}`);
}

// Kill a process AND its whole child tree (taskkill on Windows handles trees).
function killProcessTree(pid) {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
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
    const child = execFile(
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
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); }
  catch { throw new Error("ffmpeg not found on PATH. Install from https://ffmpeg.org/"); }
  const finder = process.platform === "win32" ? "where" : "which";
  try { execFileSync(finder, ["whisper"], { stdio: "ignore" }); }
  catch { throw new Error("whisper CLI not found on PATH. Install with: pip install openai-whisper"); }
}

// Throwaway folder for intermediate files.
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cinemachat-sub-"));
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
  try { size = fs.statSync(wavFilePath).size; } catch { throw new Error(`No audio created for ${videoFilePath}`); }
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
  const files = fs.readdirSync(outputDir);
  const srtFile = files.find((f) => f.endsWith(".srt"));
  const jsonFile = files.find((f) => f.endsWith(".json"));
  if (!srtFile || !jsonFile) throw new Error("whisper did not produce SRT/JSON output");

  const srtText = fs.readFileSync(path.join(outputDir, srtFile), "utf-8");
  const result = JSON.parse(fs.readFileSync(path.join(outputDir, jsonFile), "utf-8"));
  if (!srtText.trim()) throw new Error("whisper produced empty transcription (no speech found)");
  log(`  transcription done: detected language = ${result.language || "unknown"}, ${srtText.trim().split("\n").length} lines`);
  return { srtText, detectedLanguage: result.language || "unknown" };
}

// Step 3: translate the whole SRT at once, telling Gemini to keep every line
// number and timestamp identical so the subtitles never go out of sync.
async function translateSrtViaGemini(srtText, targetLang) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set; cannot translate subtitles");

  const prompt =
    `Translate ONLY the subtitle cue text lines in the SRT below into the language code ` +
    `"${targetLang}". Keep every line number and timestamp EXACTLY the same. ` +
    `Return the complete SRT.\n\n${srtText}`;

  // Keys that are restricted in the Google AI Studio / Cloud console to a
  // specific site origin (HTTP referrer) get blocked from non-browser callers.
  // When GEMINI_REFERER is set (e.g. to your app's origin), send it so the
  // request is accepted from this backend script as well.
  const headers = { "Content-Type": "application/json" };
  if (process.env.GEMINI_REFERER) headers["Referer"] = process.env.GEMINI_REFERER;

  log(`step 3/3: translating ${srtText.trim().split("\n").length} lines to "${targetLang}" with Gemini (${GEMINI_MODEL})`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.gemini);
  let response;
  try {
    response = await fetch(
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
  const translated = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("")?.trim();
  if (!translated) throw new Error("Gemini returned an empty translation");
  return translated;
}

// Transcribe ONE video file and save the final .srt next to it.
async function generateSubtitle(videoFilePath, outputLang = "en") {
  const videoPath = path.resolve(videoFilePath);
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  checkTools();
  const tempDir = makeTempDir();
  const started = Date.now();
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
    fs.writeFileSync(srtPath, finalSrt, "utf-8");

    log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${srtPath} (detected: ${detectedLanguage})`);
    return srtPath;
  } finally {
    // Always clean up the temp folder, even when an error is thrown.
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Process every video in a folder one by one. Never stops the batch because of
// one bad video, and skips videos that already have a matching .srt file.
async function generateSubtitlesForFolder(folderPath, outputLang = "en") {
  const folder = path.resolve(folderPath);
  if (!fs.existsSync(folder)) throw new Error(`Folder not found: ${folder}`);

  const videos = fs
    .readdirSync(folder)
    .filter((f) => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();

  let failed = 0;
  for (let i = 0; i < videos.length; i++) {
    const fileName = videos[i];
    log(`Processing ${i + 1} of ${videos.length}: ${fileName}`);

    const srtPath = path.join(folder, path.basename(fileName, path.extname(fileName)) + ".srt");
    if (fs.existsSync(srtPath)) { log(`Skipping ${fileName}: .srt already exists`); continue; }

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

module.exports = { generateSubtitle, generateSubtitlesForFolder };

// ---------------------------------------------------------------------------
// Example usage (uncomment to try):
// ---------------------------------------------------------------------------
// const { generateSubtitle, generateSubtitlesForFolder } = require("./subtitleGenerator");
// // Single movie -> English subtitles:
// // generateSubtitle("C:/Movies/Inception.mp4", "en").then((p) => console.log("Subtitle ready:", p)).catch((e) => console.error(e.message));
// // Whole folder -> Arabic subtitles, one video at a time:
// // generateSubtitlesForFolder("C:/Movies", "ar").then((s) => console.log("Batch done:", s)).catch((e) => console.error(e.message));
