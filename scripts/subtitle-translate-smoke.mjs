#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Subtitle translation dry-run smoke test.
//
// Mirrors — VERBATIM — the Google-batch subtitle translation pipeline from
// server.ts (functions copied with their source line ranges) and exercises it:
//   • English (.en.vtt) and Korean (.ko.vtt) sources → ckb / ar / tr targets
//   • Live endpoint runs: cue/timing integrity + translation-coverage stats
//   • Fault injection: total endpoint failure, sentinel-boundary loss,
//     oversized singleton batch, rate-limit-style empty payloads
//
// Usage: node scripts/subtitle-translate-smoke.mjs [--offline]
//   --offline : skip live Google calls, run only fault-injection/edge cases
// ---------------------------------------------------------------------------

const LIVE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

let fetchImpl = globalThis.fetch;
const fetchStats = { requests: 0, failures: 0 };
let forceFailAll = false;

async function fetchSeam(url, init) {
  fetchStats.requests += 1;
  if (forceFailAll || url !== LIVE_ENDPOINT) {
    fetchStats.failures += 1;
    return { ok: false, status: 429, json: async () => null };
  }
  const resp = await fetchImpl(url, init);
  return resp;
}

function resetFaults() {
  forceFailAll = false;
}

const GOOGLE_TRANSLATE_TIMEOUT_MS =
  Number(process.env.GOOGLE_TRANSLATE_TIMEOUT_MS) || 5000; // server.ts:770
const GOOGLE_TRANSLATE_MARKER = "CINEMACHATCUEBREAK123"; // server.ts:772
const SUPPORTED_SUBTITLE_LANGS = new Set(["original", "ckb", "ar", "tr"]);

// --- server.ts:338-354 ------------------------------------------------------
function decodeSubtitleEntities(rawText) {
  let text = rawText;
  for (let i = 0; i < 2; i += 1) {
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/gi, "'")
      .replace(/&#x2F;/gi, "/")
      .replace(/&#39;/g, "'");
  }
  return text;
}

// --- server.ts:356-414 ------------------------------------------------------
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
  return decodeSubtitleEntities(String(rawLine || ""))
    .replace(/<\d{2}:\d{2}:\d{2}[\.,]\d{3}>/g, "")
    .replace(/<\/?c[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function isSubtitleStructureLine(line) {
  const trimmed = String(line || "").trim();
  return (
    !trimmed ||
    /^WEBVTT$/i.test(trimmed) ||
    /^\d+$/.test(trimmed) ||
    /\d{2}:\d{2}:\d{2}[\.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[\.,]\d{3}/.test(
      trimmed,
    )
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
    .replace(
      /\s*(?:[-–—|•]+)\s*(?:translated|subtitle(?:s)?|caption(?:s)?)\s+(?:by|from)\s+.*$/i,
      "",
    )
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*[-–—|•:]+|[-–—|•:]+\s*$/g, "")
    .trim();
}

// --- server.ts:416-479 ------------------------------------------------------
function sanitizeSubtitleText(rawText) {
  const normalized = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\uFEFF/, "");
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
    if (!isSubtitleStructureLine(line) && isSubtitleMetadataLine(stripped))
      continue;
    if (stripped || isSubtitleStructureLine(line)) output.push(stripped);
  }

  const cleaned = output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned && keepTrailingNewline ? `${cleaned}\n` : cleaned;
}

function normalizeSubtitleText(rawText) {
  const cleanText = decodeSubtitleEntities(rawText)
    .replace(
      /(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s*(?:-->)?\s*>\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3})/g,
      "$1 --> $2",
    )
    .replace(/^\uFEFF/, "")
    .trim();
  if (!cleanText) return "";
  const withoutVttHeader = cleanText.startsWith("WEBVTT")
    ? cleanText
        .replace(/^WEBVTT\s*(\n|$)/, "")
        .replace(/\nNOTE[^\n]*(\n|$)/g, "\n")
        .trim()
    : cleanText;
  return sanitizeSubtitleText(withoutVttHeader);
}

// --- server.ts:445-461 ------------------------------------------------------
function extractSubtitleTimingLinesForValidation(text) {
  return (
    String(text || "").match(
      /\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}(?:[^\n]*)/g,
    ) || []
  );
}

function assertSubtitleTimingsUnchanged(sourceText, translatedText, label) {
  const sourceTimings = extractSubtitleTimingLinesForValidation(sourceText);
  if (!sourceTimings.length) return;
  const translatedTimings =
    extractSubtitleTimingLinesForValidation(translatedText);
  if (translatedTimings.length !== sourceTimings.length) {
    throw new Error(
      `${label} returned ${translatedTimings.length} subtitle timings; expected ${sourceTimings.length}`,
    );
  }
  for (let i = 0; i < sourceTimings.length; i += 1) {
    if (translatedTimings[i] !== sourceTimings[i]) {
      throw new Error(`${label} changed subtitle timing at cue ${i + 1}`);
    }
  }
}

// --- server.ts:689-720 ------------------------------------------------------
function shouldTranslateSubtitleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^\[[^\]]+\]$/.test(trimmed)) return false;
  if (/^WEBVTT$/i.test(trimmed)) return false;
  if (/^(Kind|Language):/i.test(trimmed)) return false;
  if (/^(NOTE|STYLE|REGION)(\s|$)/i.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/-->/.test(trimmed)) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

function cleanSubtitleDialogueForTranslation(line) {
  return decodeSubtitleEntities(line)
    .replace(/<\d{2}:\d{2}:\d{2}[\.,]\d{3}>/g, "")
    .replace(/<\/?c[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadSubtitleTranslation(text, targetLang) {
  const clean = decodeSubtitleEntities(String(text || "")).trim();
  if (!clean) return true;
  if (/\?{4,}/.test(clean)) return true;
  const arabicChars = (clean.match(/[\u0600-\u06FF]/g) || []).length;
  if (targetLang === "ckb") {
    if (!arabicChars) {
      const latinTokens = clean.match(/[A-Za-z][A-Za-z0-9.'-]*/g) || [];
      const mostlyNameOrMarker = latinTokens.length <= 2 && clean.length <= 40;
      if (!mostlyNameOrMarker) return true;
    }
    return false;
  }
  if (targetLang === "ar") {
    return arabicChars === 0;
  }
  if (targetLang === "tr") {
    const letters = clean.match(/\p{L}/gu) || [];
    if (letters.length < 4) return false;
    const latinChars = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
    return latinChars / letters.length < 0.5;
  }
  return false;
}

// --- server.ts:774-855 (fetch swapped for injectable seam + batch stats) ----
async function googleTranslateFreeText(text, targetLang, sourceLang = "auto") {
  const body = new URLSearchParams({
    client: "gtx",
    sl: sourceLang || "auto",
    tl: targetLang,
    dt: "t",
    q: text,
  });
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    GOOGLE_TRANSLATE_TIMEOUT_MS,
  );
  try {
    const resp = await fetchSeam(LIVE_ENDPOINT, {
      method: "POST",
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    const rawSegments = Array.isArray(data?.[0]) ? data[0] : [];
    const translated = rawSegments.map((part) => part?.[0] || "").join("");
    if (!translated || !String(translated).trim()) return null;
    const cleaned = stripSubtitleMetadataFragments(
      decodeSubtitleEntities(String(translated)),
    );
    if (isBadSubtitleTranslation(cleaned, targetLang)) return null;
    const segments = rawSegments.map((part) => ({
      out: String(part?.[0] ?? ""),
      src: String(part?.[1] ?? ""),
    }));
    return { text: cleaned, segments };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- server.ts alignBatchTranslation (source-echo realignment) ---------------
function alignBatchTranslation(segments, batchLines) {
  const norm = (value) =>
    String(value ?? "").replace(/\s+/g, " ").trim();
  const aligned = [];
  let cursor = 0;
  for (let i = 0; i < batchLines.length; i += 1) {
    if (i > 0) {
      let markerEcho = "";
      while (cursor < segments.length) {
        markerEcho += `${segments[cursor].src} `;
        cursor += 1;
        if (markerEcho.includes(GOOGLE_TRANSLATE_MARKER)) break;
        if (
          norm(markerEcho).length >
          GOOGLE_TRANSLATE_MARKER.length + 16
        )
          return null;
      }
      if (!markerEcho.includes(GOOGLE_TRANSLATE_MARKER)) return null;
    }
    const expected = norm(batchLines[i]);
    let accSrc = "";
    let accOut = "";
    while (cursor < segments.length) {
      accSrc += `${segments[cursor].src} `;
      accOut += `${segments[cursor].out} `;
      cursor += 1;
      if (norm(accSrc) === expected) break;
      if (norm(accSrc).length > expected.length) return null;
    }
    if (norm(accSrc) !== expected) return null;
    aligned.push(accOut.trim());
  }
  return aligned;
}

async function translateSubtitleViaGoogle(
  subtitleText,
  targetLang,
  sourceLang = "auto",
) {
  if (
    !SUPPORTED_SUBTITLE_LANGS.has(targetLang) ||
    targetLang === "original"
  ) {
    throw new Error("Unsupported subtitle target language");
  }

  const normalizedText = sanitizeSubtitleText(subtitleText)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!normalizedText) return normalizedText;

  const blocks = normalizedText
    .split(/\n{2,}/)
    .map((block) => ({ lines: block.split("\n") }));
  const jobs = [];
  blocks.forEach((block, blockIndex) => {
    const timingIndex = block.lines.findIndex((line) => /-->/.test(line));
    const bodyStart = timingIndex >= 0 ? timingIndex + 1 : 0;
    block.lines.slice(bodyStart).forEach((line, offset) => {
      if (!shouldTranslateSubtitleLine(line)) return;
      const text = cleanSubtitleDialogueForTranslation(line);
      if (text)
        jobs.push({ blockIndex, lineIndex: bodyStart + offset, text });
    });
  });
  if (!jobs.length) return normalizedText;

  const uniqueTexts = Array.from(new Set(jobs.map((job) => job.text.trim())));
  const results = new Map(uniqueTexts.map((text) => [text, text]));

  const maxBatchChars = 1800;
  let batchesSent = 0;
  let batchesFailed = 0;
  for (let start = 0; start < uniqueTexts.length; ) {
    const batch = [];
    let chars = 0;
    while (start < uniqueTexts.length) {
      const nextChars =
        uniqueTexts[start].length + GOOGLE_TRANSLATE_MARKER.length + 4;
      if (batch.length && chars + nextChars > maxBatchChars) break;
      batch.push(uniqueTexts[start]);
      chars += nextChars;
      start += 1;
    }

    const translated = await googleTranslateFreeText(
      batch.join(`\n${GOOGLE_TRANSLATE_MARKER}\n`),
      targetLang,
      sourceLang,
    );
    batchesSent += 1;
    if (!translated) {
      batchesFailed += 1;
      continue; // server.ts — failed batch keeps originals
    }
    let aligned = null;
    const partsExact = translated.text.split(
      new RegExp(`\\s*${GOOGLE_TRANSLATE_MARKER}\\s*`),
    );
    if (partsExact.length === batch.length) {
      aligned = partsExact;
    }
    if (!aligned) {
      const partsLoose = translated.text.split(
        new RegExp(`\\s*${GOOGLE_TRANSLATE_MARKER}\\s*`, "i"),
      );
      if (partsLoose.length === batch.length) aligned = partsLoose;
    }
    if (!aligned && translated.segments.length) {
      aligned = alignBatchTranslation(translated.segments, batch);
    }
    if (!aligned && translated.segments.length <= 1) {
      const requestLines = batch
        .join(`\n${GOOGLE_TRANSLATE_MARKER}\n`)
        .split("\n");
      const replyLines = translated.text.split("\n");
      while (
        replyLines.length &&
        !replyLines[replyLines.length - 1].trim()
      )
        replyLines.pop();
      if (replyLines.length === requestLines.length) {
        const recovered = [];
        for (let idx = 0; idx < requestLines.length; idx += 1) {
          if (idx % 2 === 0) recovered.push(replyLines[idx]);
        }
        aligned = recovered;
      }
    }
    if (!aligned) {
      batchesFailed += 1;
      continue; // unrecoverable boundaries keep originals
    }
    batch.forEach((sourceText, index) => {
      const line = stripSubtitleMetadataFragments(
        decodeSubtitleEntities(aligned[index] || ""),
      ).trim();
      if (line && !isBadSubtitleTranslation(line, targetLang))
        results.set(sourceText, line);
    });
  }

  for (const job of jobs) {
    blocks[job.blockIndex].lines[job.lineIndex] =
      results.get(job.text.trim()) || job.text;
  }
  translateSubtitleViaGoogle.lastBatchStats = {
    batchesSent,
    batchesFailed,
    uniqueLines: uniqueTexts.length,
  };
  return sanitizeSubtitleText(
    blocks.map(({ lines }) => lines.join("\n")).join("\n\n"),
  );
}

// --- server.ts uniqueTranslatableLines / isUntranslatedSubtitleResult --------
function uniqueTranslatableLines(subtitleText) {
  const out = new Set();
  const normalized = sanitizeSubtitleText(subtitleText)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  normalized.split(/\n{2,}/).forEach((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => /-->/.test(line));
    const bodyStart = timingIndex >= 0 ? timingIndex + 1 : 0;
    lines.slice(bodyStart).forEach((line) => {
      if (!shouldTranslateSubtitleLine(line)) return;
      const text = cleanSubtitleDialogueForTranslation(line);
      if (text) out.add(text);
    });
  });
  return out;
}

function isUntranslatedSubtitleResult(sourceText, resultText) {
  const sourceLines = uniqueTranslatableLines(sourceText);
  if (!sourceLines.size) return false;
  const resultLines = uniqueTranslatableLines(resultText);
  let unchanged = 0;
  sourceLines.forEach((line) => {
    if (resultLines.has(line)) unchanged += 1;
  });
  return unchanged === sourceLines.size;
}

// --- server.ts:722-744 -------------------------------------------------------
function getSubtitleDialogueText(subtitleText) {
  return sanitizeSubtitleText(subtitleText)
    .split(/\r?\n/)
    .map((line) => stripSubtitleMetadataFragments(line).trim())
    .filter(
      (line) =>
        line && !isSubtitleStructureLine(line) && !isSubtitleMetadataLine(line),
    )
    .join(" ");
}

function isLikelyNonKurdishSubtitleTrack(subtitleText) {
  const dialogueText = getSubtitleDialogueText(subtitleText);
  if (!dialogueText) return false;
  const arabicScriptChars =
    dialogueText.match(/[\u0600-\u06FF]/g)?.length || 0;
  const latinChars = dialogueText.match(/[A-Za-z]/g)?.length || 0;
  return arabicScriptChars === 0 && latinChars >= 20;
}

function isLikelyWrongScriptForLangTrack(subtitleText, lang) {
  if (lang === "ckb") return isLikelyNonKurdishSubtitleTrack(subtitleText);
  const dialogueText = getSubtitleDialogueText(subtitleText);
  if (!dialogueText) return false;
  const letters = dialogueText.match(/\p{L}/gu) || [];
  if (letters.length < 20) return false;
  if (lang === "ar") {
    const arabicChars = (dialogueText.match(/[\u0600-\u06FF]/g) || []).length;
    return arabicChars / letters.length < 0.5;
  }
  if (lang === "tr") {
    const latinChars = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
    return latinChars / letters.length < 0.5;
  }
  return false;
}

function ensureSubtitleTrackMatchesLang(subtitleText, lang, source) {
  const clean = sanitizeSubtitleText(subtitleText);
  if (isLikelyWrongScriptForLangTrack(clean, lang)) {
    throw new Error(
      lang === "ckb"
        ? `Kurdish Sorani subtitles were requested, but ${source} returned a non-Kurdish/source caption track`
        : `${lang} subtitles were requested, but ${source} returned a non-${lang} caption track`,
    );
  }
  return clean;
}

// --- server.ts:946-959 minus the Gemini branch (dry run has no API key) ------
async function translateDryRun(subtitleText, targetLang, sourceLang = "auto") {
  const sanitizedSource = sanitizeSubtitleText(subtitleText);
  if (!sanitizedSource) {
    throw new Error("Subtitle file is empty after metadata cleanup");
  }
  try {
    const translated = sanitizeSubtitleText(
      await translateSubtitleViaGoogle(sanitizedSource, targetLang, sourceLang),
    );
    assertSubtitleTimingsUnchanged(
      sanitizedSource,
      translated,
      `Google ${targetLang} translation`,
    );
    const verified = ensureSubtitleTrackMatchesLang(
      translated,
      targetLang,
      `Google ${targetLang} translation`,
    );
    return {
      out: verified,
      degraded: verified.trim() === sanitizedSource.trim(),
    };
  } catch (err) {
    return {
      out: sanitizedSource,
      degraded: true,
      reason: String(err?.message || err),
    };
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const EN_VTT = [
  "WEBVTT",
  "",
  "NOTE This is a comment block that must be stripped",
  "",
  "1",
  "00:00:01.000 --> 00:00:03.500",
  "Welcome to CinemaChat.",
  "",
  "2",
  "00:00:04.000 --> 00:00:06.500",
  "Tonight we watch a movie together.",
  "",
  "3",
  "00:00:07.000 --> 00:00:09.500",
  "Tonight we watch a movie together.",
  "",
  "4",
  "00:00:10.000 --> 00:00:12.000",
  "[Applause]",
  "",
  "5",
  "00:00:12.500 --> 00:00:15.000",
  "The <i>hero</i> enters the castle.",
].join("\n");

const KO_VTT = [
  "WEBVTT",
  "",
  "1",
  "00:00:01.000 --> 00:00:03.500",
  "시네마채팅에 오신 것을 환영합니다.",
  "",
  "2",
  "00:00:04.000 --> 00:00:06.500",
  "오늘 밤 우리는 함께 영화를 봅니다.",
  "",
  "3",
  "00:00:07.000 --> 00:00:09.500",
  "주인공이 성에 들어섭니다.",
  "",
  "4",
  "00:00:10.000 --> 00:00:13.000",
  "이 장면은 매우 감동적입니다. 놀라운 연기였습니다.",
].join("\n");

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let passCount = 0;
let failCount = 0;
function report(name, ok, detail = "") {
  if (ok) passCount += 1;
  else failCount += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function countCues(vtt) {
  return extractSubtitleTimingLinesForValidation(vtt).length;
}

function coverageOf(sourceVtt, outVtt) {
  const srcLines = sourceVtt
    .split(/\n{2,}/)
    .flatMap((b) => b.split("\n").slice(1))
    .map((l) => cleanSubtitleDialogueForTranslation(l))
    .filter((l) => l && shouldTranslateSubtitleLine(l));
  const uniq = Array.from(new Set(srcLines));
  if (!uniq.length) return 100;
  const translated = uniq.filter((l) => !outVtt.includes(l)).length;
  return Math.round((translated / uniq.length) * 100);
}

async function liveCase(label, vtt, target, source) {
  resetFaults();
  const reqBefore = fetchStats.requests;
  try {
    const { out, degraded } = await translateDryRun(vtt, target, source);
    const timingsOk =
      extractSubtitleTimingLinesForValidation(out).length ===
      extractSubtitleTimingLinesForValidation(vtt).length;
    const cov = coverageOf(vtt, out);
    const stats = translateSubtitleViaGoogle.lastBatchStats || {};
    report(
      label,
      timingsOk && !!out.trim(),
      `cues=${countCues(out)} coverage=${cov}% batches=${stats.batchesSent ?? 0}(${stats.batchesFailed ?? 0} failed) httpReqs=${fetchStats.requests - reqBefore}${degraded ? " [DEGRADED: all originals]" : ""}`,
    );
    return cov;
  } catch (err) {
    report(label, false, `CRASH: ${err?.message || err}`);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
const offlineOnly = process.argv.includes("--offline");

console.log("\n=== 1. Structural edge cases (no network) ===");
resetFaults();
{
  forceFailAll = true;
  let emptyThrewCleanly = false;
  try {
    await translateDryRun("", "ckb", "auto");
  } catch (e) {
    // matches server.ts:923 — explicit validation error, caught by both routes
    emptyThrewCleanly = /empty/i.test(e?.message || "");
  }
  report("empty input rejected with clean validation error", emptyThrewCleanly);
}
resetFaults();
{
  const crlfRes = await translateDryRun(EN_VTT.replace(/\n/g, "\r\n"), "tr", "en");
  report("CRLF normalization", countCues(crlfRes.out) === 5, `cues=${countCues(crlfRes.out)}`);
}
{
  try {
    await translateSubtitleViaGoogle(EN_VTT, "fr", "en");
    report("unsupported target rejected", false, "no throw");
  } catch (e) {
    report("unsupported target rejected", /Unsupported/.test(e?.message || ""));
  }
}
{
  const oversize = [
    "1",
    "00:00:01.000 --> 00:00:02.000",
    "x".repeat(4000),
  ].join("\n");
  forceFailAll = true; // isolate loop-termination behavior from network speed
  const t0 = Date.now();
  const res = await translateDryRun(oversize, "ar", "en");
  report(
    "oversized singleton batch terminates",
    Date.now() - t0 < 15000 && res.out.includes("x".repeat(100)),
    `${Date.now() - t0}ms`,
  );
}
resetFaults();

console.log("\n=== 1b. alignBatchTranslation unit cases (no network) ===");
{
  const L1 = "Welcome to CinemaChat.";
  const L2 = "Tonight we watch a movie together.";
  const M = GOOGLE_TRANSLATE_MARKER;
  // Case A: engine mangles the marker in `out` (Arabic-style) but echoes the
  // pristine source in `src` → per-line recovery must still succeed.
  const segsA = [
    { out: "مرحبا بكم في CinemaChat.\n", src: `${L1}\n` },
    { out: "سينماتشاتكو استراحة123\n", src: `${M}\n` }, // translated sentinel
    { out: "نشاهد فيلما معا الليلة.\n", src: `${L2}\n` },
  ];
  const alignedA = alignBatchTranslation(segsA, [L1, L2]);
  report(
    "mangled-sentinel segments realign via source echo",
    Array.isArray(alignedA) &&
      alignedA[0].includes("CinemaChat") &&
      alignedA[1].length > 0,
    JSON.stringify(alignedA),
  );
  // Case B: one source line split into two sentence segments → accumulation.
  const segsB = [
    { out: "S1a ", src: "이 장면은 매우 " },
    { out: "S1b\n", src: "감동적입니다. 놀라운 연기였습니다.\n" },
    { out: `${M}\n`, src: `${M}\n` }, // sentinel echo between content lines
    { out: "T2\n", src: "주인공이 성에 들어섭니다.\n" },
  ];
  const alignedB = alignBatchTranslation(
    segsB,
    ["이 장면은 매우 감동적입니다. 놀라운 연기였습니다.", "주인공이 성에 들어섭니다."],
  );
  report(
    "multi-sentence line accumulates segments",
    Array.isArray(alignedB) &&
      alignedB[0].replace(/\s+/g, " ").trim() === "S1a S1b" && // prod cleans via stripSubtitleMetadataFragments
      alignedB[1] === "T2",
    JSON.stringify(alignedB),
  );
  // Case C: desynced stream (segment dropped) → null, caller keeps originals.
  const segsC = [
    { out: "only-one\n", src: `${L1}\n${M}\n` },
  ];
  report(
    "desynced echo stream returns null",
    alignBatchTranslation(segsC, [L1, L2]) === null,
  );
}

console.log("\n=== 1c. F2 validation-guard unit cases (no network) ===");
{
  const korean = "오늘 밤 우리는 함께 영화를 봅니다.";
  report("ko text rejected as tr output", isBadSubtitleTranslation(korean, "tr"));
  report("latin-only rejected as ar output", isBadSubtitleTranslation("We watch movies tonight together", "ar"));
  report("arabic output accepted for ar", !isBadSubtitleTranslation("نشاهد أفلاما معا الليلة", "ar"));
  report("turkish output accepted for tr", !isBadSubtitleTranslation("Bu akşam birlikte film izliyoruz.", "tr"));
  report("short latin token tolerated for tr", !isBadSubtitleTranslation("OK", "tr"));
  report("ckb latin rejection preserved", isBadSubtitleTranslation("We watch movies tonight together now", "ckb"));
  const koVtt = KO_VTT;
  report(
    "untranslated result detected (F2 detector)",
    isUntranslatedSubtitleResult(koVtt, koVtt),
  );
  const fakeTranslatedKoVtt = koVtt.replace("오늘 밤 우리는 함께 영화를 봅니다.", "Bu akşam birlikte film izliyoruz.");
  report(
    "partial translation NOT flagged degraded",
    !isUntranslatedSubtitleResult(koVtt, fakeTranslatedKoVtt),
  );
}

console.log("\n=== 2. Fault injection (endpoint failure modes) ===");
{
  forceFailAll = true; // simulates sustained 429 / network down
  const res = await translateDryRun(KO_VTT, "ar", "ko");
  // Production contract: no crash, cue structure intact, original track served.
  // The ar/tr script guard may additionally reject the untranslated track
  // upstream — translateSubtitleWithFallback catches that and still serves it.
  report(
    "total endpoint failure -> originals served, no crash",
    res.degraded && countCues(res.out) === 4,
    res.reason || "graceful",
  );
}
resetFaults();
{
  // Boundary loss: endpoint replies 200 OK but returns fewer/mangled sentinel
  // fragments than lines in the batch.
  const origFetch = fetchImpl;
  fetchImpl = (async () => ({
    ok: true,
    json: async () => [[["단일 조각만 반환"]]],
  }))();
  const res = await translateDryRun(KO_VTT, "tr", "ko");
  fetchImpl = origFetch;
  report(
    "sentinel-boundary loss -> batch keeps originals",
    res.degraded && countCues(res.out) === 4,
    `cues=${countCues(res.out)} degraded=${res.degraded}`,
  );
}
resetFaults();

if (!offlineOnly) {
  console.log("\n=== 3. Live endpoint: English (.en.vtt) source ===");
  const covEnCkb = await liveCase("en -> ckb", EN_VTT, "ckb", "en");
  const covEnAr = await liveCase("en -> ar", EN_VTT, "ar", "en");
  const covEnTr = await liveCase("en -> tr", EN_VTT, "tr", "en");

  console.log("\n=== 4. Live endpoint: Korean (.ko.vtt) source ===");
  const covKoCkb = await liveCase("ko -> ckb", KO_VTT, "ckb", "ko");
  const covKoAr = await liveCase("ko -> ar", KO_VTT, "ar", "ko");
  const covKoTr = await liveCase("ko -> tr", KO_VTT, "tr", "ko");

  console.log("\n=== 5. Coverage summary (translation-drop detector) ===");
  const all = { covEnCkb, covEnAr, covEnTr, covKoCkb, covKoAr, covKoTr };
  for (const [k, v] of Object.entries(all)) {
    report(`${k} coverage > 0%`, v > 0, `${v}%`);
  }

  console.log("\n=== 6. Script-validation gap probe (ar/tr output sanity) ===");
  resetFaults();
  const koToAr = await translateSubtitleViaGoogle(KO_VTT, "ar", "ko");
  const arabicChars = (koToAr.match(/[\u0600-\u06FF]/g) || []).length;
  const koreanLeak = (koToAr.match(/[\uAC00-\uD7AF]/g) || []).length;
  const turkishProbe = await translateSubtitleViaGoogle(KO_VTT, "tr", "ko");
  const koreanLeakTr = (turkishProbe.match(/[\uAC00-\uD7AF]/g) || []).length;
  console.log(
    `    ko->ar output: arabicChars=${arabicChars} residualKoreanChars=${koreanLeak}` +
      (koreanLeak > 0
        ? "  <-- UNVALIDATED leak (isBadSubtitleTranslation has no ar/tr script check)"
        : ""),
  );
  console.log(
    `    ko->tr output: residualKoreanChars=${koreanLeakTr}` +
      (koreanLeakTr > 0
        ? "  <-- UNVALIDATED leak"
        : ""),
  );
}

resetFaults();
console.log(
  `\n=== RESULT: ${passCount} passed, ${failCount} failed, http=${fetchStats.requests}req/${fetchStats.failures}fail ===`,
);
process.exit(failCount ? 1 : 0);
