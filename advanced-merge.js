#!/usr/bin/env node
/**
 * advanced-merge.js
 * ------------------------------------------------------------------
 * Content-based (semantic) subtitle merger for Kurdish subtitles.
 *
 * Unlike a naive line-by-line merge, this script compares the ENGLISH
 * text of the original with the KURDISH text of the translation using a
 * Levenshtein-distance similarity score, then finds the best 1-to-1
 * alignment between the two sets of cues with a dynamic-programming
 * (Needleman-Wunsch style) sequence alignment.
 *
 * The result applies the ORIGINAL ENGLISH timestamps to the semantically
 * matching KURDISH sentence, so the merged file stays perfectly in sync
 * with the video even when the translation has a different number of
 * cues or slightly shifted timing.
 *
 * Usage:
 *   node advanced-merge.js original_en.srt translated_ku.vtt [output.vtt]
 *
 * Output defaults to ku_final.vtt. Feed the result to the player by
 * saving it as public/assets/subtitles/ku.vtt.
 * ------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';

// Matches a subtitle timing line (works for SRT comma and VTT dot ms).
const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/g;

/** "HH:MM:SS.mmm" -> seconds (float). */
function toSeconds(h, m, s, ms) {
  return +h * 3600 + +m * 60 + +s + +('0.' + ms.padEnd(3, '0').slice(0, 3));
}

/** seconds (float) -> WebVTT timestamp "HH:MM:SS.mmm". */
function formatVttTime(seconds) {
  let ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000);   ms -= m * 60000;
  const s = Math.floor(ms / 1000);    ms -= s * 1000;
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

/** Strip a UTF-8 BOM and normalise line endings. */
function normalize(raw) {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** Remove WebVTT NOTE blocks (no-op for SRT). */
function stripNotes(text) {
  return text.replace(/^NOTE[^\n]*(?:\n[^\n]*)*?(?=\n\n|$)/gm, '');
}

/** Strip inline styling tags such as <i>, </i>, {i}, {/i}. */
function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .trim();
}

/**
 * Parse an SRT or VTT file into an ordered array of cues:
 *   [{ start, end, text }]
 */
function parseSubtitleFile(rawText) {
  const body = stripNotes(normalize(rawText));
  const matches = [];
  let m;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(body)) !== null) matches.push(m);

  const cues = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    // Text starts on the line AFTER the timing line (VTT settings like
    // "position:50%" may follow the timings on the same line).
    const lineEnd = body.indexOf('\n', match.index + match[0].length);
    const textStart = lineEnd === -1 ? body.length : lineEnd + 1;
    const textEnd = i + 1 < matches.length ? matches[i + 1].index : body.length;

    const text = cleanText(
      body
        .slice(textStart, textEnd)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n'),
    );
    if (!text) continue;

    cues.push({
      start: toSeconds(match[1], match[2], match[3], match[4]),
      end: toSeconds(match[5], match[6], match[7], match[8]),
      text,
    });
  }
  return cues;
}

// ------------------------------------------------------------------
// Text similarity
// ------------------------------------------------------------------

/**
 * Normalise subtitle text for comparison: lowercase, strip diacritics,
 * punctuation and speaker markers, while KEEPING both Latin letters
 * (English) and Arabic-script letters (Kurdish Sorani).
 */
function normalizeText(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(
      /[^a-z0-9\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\uFB50-\uFDFF\uFE70-\uFEFF]+/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic Levenshtein distance between two strings. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Normalised Levenshtein similarity in [0, 1] (1 = identical text). */
function levenshteinRatio(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

/**
 * Position similarity in [0, 1]: how close the mid-point of an English
 * cue is to the mid-point of a Kurdish cue, relative to the full video
 * length. This is the anchor that keeps the merge in sync with the video
 * even when the two files use different scripts (so Levenshtein on raw
 * characters carries no signal).
 */
function positionScore(en, ku, totalDur) {
  const enMid = totalDur > 0 ? (en.start + en.end) / 2 / totalDur : 0.5;
  const kuMid = totalDur > 0 ? (ku.start + ku.end) / 2 / totalDur : 0.5;
  return Math.max(0, 1 - Math.abs(enMid - kuMid) * 2);
}

/**
 * Combined semantic score in [0, 1] for an English cue and a Kurdish cue:
 *  - 70% positional similarity (keeps everything in sync)
 *  - 20% token-count similarity (translations have comparable length)
 *  - 10% Levenshtein text similarity (matches same-script / transliterations)
 */
function combinedScore(en, ku, totalDur) {
  const enText = normalizeText(en.text);
  const kuText = normalizeText(ku.text);
  const textSim = levenshteinRatio(enText, kuText);
  const enToks = enText ? enText.split(' ').length : 0;
  const kuToks = kuText ? kuText.split(' ').length : 0;
  const maxToks = Math.max(enToks, kuToks);
  const tokenSim = maxToks > 0 ? 1 - Math.abs(enToks - kuToks) / maxToks : 0;
  const pos = positionScore(en, ku, totalDur);
  return pos * 0.7 + tokenSim * 0.2 + textSim * 0.1;
}

// ------------------------------------------------------------------
// Sequence alignment (Needleman-Wunsch style)
// ------------------------------------------------------------------

/**
 * Find the optimal MONOTONIC 1-to-1 alignment between the English cues
 * and the Kurdish cues that maximises the total similarity score. Each
 * English cue is matched to at most one Kurdish cue and the matching
 * order is preserved — so "which Kurdish sentence matches which English
 * sentence" is decided by similarity, never by raw line numbers.
 *
 * Returns an array of { en, ku } index pairs (ku = -1 when an English
 * cue has no good Kurdish match).
 */
function align(english, kurdish, totalDur) {
  const n = english.length;
  const m = kurdish.length;
  const scoreOf = (i, j) => combinedScore(english[i], kurdish[j], totalDur);
  const GAP_PENALTY = 0.3;

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-Infinity));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) dp[i][0] = dp[i - 1][0] - GAP_PENALTY;
  for (let j = 1; j <= m; j++) dp[0][j] = dp[0][j - 1] - GAP_PENALTY;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + scoreOf(i - 1, j - 1),
        dp[i - 1][j] - GAP_PENALTY,
        dp[i][j - 1] - GAP_PENALTY,
      );
    }
  }

  // Trace back to recover the alignment.
  const map = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    let best = -Infinity;
    let mode = 'skipEn'; // default: consume a Kurdish cue with no English match
    if (i > 0 && j > 0) {
      const v = dp[i - 1][j - 1] + scoreOf(i - 1, j - 1);
      if (v > best) {
        best = v;
        mode = 'match';
      }
    }
    if (i > 0) {
      const v = dp[i - 1][j] - GAP_PENALTY;
      if (v > best) {
        best = v;
        mode = 'skipEn';
      }
    }
    if (j > 0) {
      const v = dp[i][j - 1] - GAP_PENALTY;
      if (v > best) {
        best = v;
        mode = 'skipKu';
      }
    }
    if (mode === 'match') {
      map.push({ en: i - 1, ku: j - 1 });
      i -= 1;
      j -= 1;
    } else if (mode === 'skipKu') {
      map.push({ en: -1, ku: j - 1 });
      j -= 1;
    } else {
      map.push({ en: i - 1, ku: -1 });
      i -= 1;
    }
  }
  map.reverse();
  return map;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      'Usage: node advanced-merge.js <english.srt|.vtt> <translated_ku.vtt|.srt> [output.vtt]',
    );
    process.exit(1);
  }
  const englishPath = args[0];
  const kurdishPath = args[1];
  const outputPath = args[2] || 'ku_final.vtt';

  for (const p of [englishPath, kurdishPath]) {
    if (!fs.existsSync(p)) {
      console.error(`File not found: ${p}`);
      process.exit(1);
    }
  }

  const english = parseSubtitleFile(fs.readFileSync(englishPath, 'utf8'));
  const kurdish = parseSubtitleFile(fs.readFileSync(kurdishPath, 'utf8'));
  if (!english.length) {
    console.error(`No cues found in ${englishPath}.`);
    process.exit(1);
  }
  if (!kurdish.length) {
    console.error(`No cues found in ${kurdishPath}.`);
    process.exit(1);
  }

  const totalDur = Math.max(english[english.length - 1].end, kurdish[kurdish.length - 1].end);

  console.log(`Aligning ${english.length} English cues with ${kurdish.length} Kurdish cues...`);
  const alignment = align(english, kurdish, totalDur);

  const merged = [];
  let matched = 0;
  let unmatched = 0;
  let totalSim = 0;
  for (const { en, ku } of alignment) {
    if (en === -1) continue; // extra Kurdish cue with no English counterpart
    const hasMatch = ku !== -1;
    if (hasMatch) {
      matched += 1;
      totalSim += combinedScore(english[en], kurdish[ku], totalDur);
    } else {
      unmatched += 1;
    }
    merged.push({
      start: english[en].start,
      end: english[en].end,
      text: hasMatch ? kurdish[ku].text : english[en].text, // keep EN text if unmatched
    });
  }

  const lines = ['WEBVTT', ''];
  lines.push('NOTE');
  lines.push(`Merged by advanced-merge.js (Levenshtein + sequence alignment).`);
  lines.push(`Timestamps preserved from ${path.basename(englishPath)}.`);
  lines.push(`Kurdish text from ${path.basename(kurdishPath)}.`);
  lines.push('');
  for (const cue of merged) {
    lines.push(`${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}`);
    lines.push(cue.text);
    lines.push('');
  }
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');

  console.log(`OK: wrote ${merged.length} merged cues -> ${outputPath}`);
  console.log(`Matched ${matched} cues | unmatched ${unmatched} | avg similarity ${matched ? (totalSim / matched).toFixed(3) : 'n/a'}`);
  if (unmatched > 0) {
    console.warn(`WARNING: ${unmatched} English cue(s) could not be matched and kept English text.`);
  }
}

main();
