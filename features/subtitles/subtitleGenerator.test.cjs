"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const {
  generateSubtitle,
  __setSubtitleTestHooks,
  __resetSubtitleTestHooks,
} = require("./subtitleGenerator.js");

const ENGLISH_SRT = [
  "1",
  "00:00:01,000 --> 00:00:03,000",
  "Welcome to CinemaChat.",
  "",
  "2",
  "00:00:03,500 --> 00:00:05,500",
  "Enjoy the movie tonight.",
  "",
].join("\n");

const SORANI_SRT = [
  "1",
  "00:00:01,000 --> 00:00:03,000",
  "بەخێربێیت بۆ CinemaChat.",
  "",
  "2",
  "00:00:03,500 --> 00:00:05,500",
  "شەوەکە چێژ لە فیلمەکە وەرگرە.",
  "",
].join("\n");

function createFakeChild(onComplete) {
  const child = new EventEmitter();
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.nextTick(() => {
    onComplete();
    child.emit("exit", 0);
  });
  return child;
}

function installSubtitleMocks({ detectedLanguage, translatedSrt, onGeminiRequest }) {
  __setSubtitleTestHooks({
    execFileSync: () => Buffer.from("ok"),
    execFile: (cmd, args, options, callback) => {
      return createFakeChild(() => {
        try {
          if (cmd === "ffmpeg") {
            const wavPath = args.at(-1);
            fs.writeFileSync(wavPath, Buffer.alloc(2048, 1));
          } else if (cmd === "whisper") {
            const outputDir = args[args.indexOf("--output_dir") + 1];
            fs.writeFileSync(path.join(outputDir, "audio.en.srt"), ENGLISH_SRT, "utf-8");
            fs.writeFileSync(
              path.join(outputDir, "audio.en.json"),
              JSON.stringify({ language: detectedLanguage }),
              "utf-8",
            );
          } else {
            throw new Error(`Unexpected command: ${cmd}`);
          }
          callback(null, "", "");
        } catch (error) {
          callback(error, "", error.message);
        }
      });
    },
    fetch: async (_url, request) => {
      onGeminiRequest?.(request);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: translatedSrt }],
              },
            },
          ],
        }),
      };
    },
  });
}

test.afterEach(() => {
  __resetSubtitleTestHooks();
  delete process.env.GEMINI_API_KEY;
});

test("keeps English subtitles unchanged when Whisper already detects English", async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cinemachat-subtitle-test-"));
  const videoPath = path.join(workDir, "sample.mp4");
  fs.writeFileSync(videoPath, "fake-video", "utf-8");

  let geminiCalls = 0;
  installSubtitleMocks({
    detectedLanguage: "en",
    translatedSrt: SORANI_SRT,
    onGeminiRequest: () => { geminiCalls += 1; },
  });

  try {
    const resultPath = await generateSubtitle(videoPath, "en");
    const writtenSrt = fs.readFileSync(resultPath, "utf-8");

    assert.equal(geminiCalls, 0);
    assert.equal(writtenSrt, ENGLISH_SRT);
    assert.equal(path.basename(resultPath), "sample.srt");
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("translates English subtitles to Kurdish Sorani through Gemini while preserving SRT timing", async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cinemachat-subtitle-test-"));
  const videoPath = path.join(workDir, "sample.mp4");
  fs.writeFileSync(videoPath, "fake-video", "utf-8");
  process.env.GEMINI_API_KEY = "test-key";

  let geminiPrompt = "";
  installSubtitleMocks({
    detectedLanguage: "en",
    translatedSrt: SORANI_SRT,
    onGeminiRequest: (request) => {
      const payload = JSON.parse(String(request.body || "{}"));
      geminiPrompt = payload?.contents?.[0]?.parts?.[0]?.text || "";
    },
  });

  try {
    const resultPath = await generateSubtitle(videoPath, "ku");
    const writtenSrt = fs.readFileSync(resultPath, "utf-8");

    assert.equal(writtenSrt, SORANI_SRT);
  assert.match(geminiPrompt, /language code "ku"/);
  assert.match(geminiPrompt, /00:00:01,000 --> 00:00:03,000/);
  assert.match(geminiPrompt, /Welcome to CinemaChat\./);

    const sourceTimings = ENGLISH_SRT.match(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/g);
    const translatedTimings = writtenSrt.match(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/g);
    assert.deepEqual(translatedTimings, sourceTimings);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});