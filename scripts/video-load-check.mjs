#!/usr/bin/env node

const urls = process.argv.slice(2).filter((value) => /^https?:\/\//i.test(value));
const timeoutMs = Number(process.env.VIDEO_CHECK_TIMEOUT_MS || 15000);
const sampleBytes = Number(process.env.VIDEO_CHECK_BYTES || 1024 * 1024);

const now = () => performance.now();
const fmt = (ms) => `${Math.round(ms)}ms`;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return {
      response,
      elapsedMs: now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readFirstChunk(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return { bytes: 0, elapsedMs: 0 };

  const start = now();
  try {
    const result = await reader.read();
    await reader.cancel().catch(() => {});
    return {
      bytes: result.value?.byteLength || 0,
      elapsedMs: now() - start,
    };
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
}

async function checkVideoUrl(url) {
  console.log(`\nChecking ${url}`);

  let head = null;
  try {
    head = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    console.log(
      `HEAD ${head.response.status} in ${fmt(head.elapsedMs)} | type=${head.response.headers.get("content-type") || "-"} | length=${head.response.headers.get("content-length") || "-"} | ranges=${head.response.headers.get("accept-ranges") || "-"}`,
    );
  } catch (error) {
    console.log(`HEAD failed: ${error?.name === "AbortError" ? "timeout" : error?.message || error}`);
  }

  try {
    const range = await fetchWithTimeout(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Range: `bytes=0-${Math.max(0, sampleBytes - 1)}`,
        Accept: "*/*",
      },
    });
    const firstChunk = await readFirstChunk(range.response);
    const totalToFirstChunk = range.elapsedMs + firstChunk.elapsedMs;
    const rangeHeader = range.response.headers.get("content-range") || "-";

    console.log(
      `RANGE ${range.response.status} in ${fmt(range.elapsedMs)} | firstChunk=${firstChunk.bytes} bytes after ${fmt(totalToFirstChunk)} | content-range=${rangeHeader}`,
    );

    if (![200, 206].includes(range.response.status)) {
      console.log("WARN: video request did not return HTTP 200/206.");
    }
    if (range.response.status !== 206) {
      console.log("WARN: server may not support byte ranges; long videos can buffer poorly without range requests.");
    }
    if (totalToFirstChunk > 3000) {
      console.log("WARN: time-to-first-chunk is slow; users may see a spinner on weak networks.");
    }
  } catch (error) {
    console.log(`RANGE failed: ${error?.name === "AbortError" ? "timeout" : error?.message || error}`);
  }
}

if (urls.length === 0) {
  console.log("Usage: node scripts/video-load-check.mjs <video-url> [video-url...]");
  console.log("Tip: pass the final MP4/WebM/HLS URL, not the public page URL.");
  process.exit(0);
}

for (const url of urls) {
  await checkVideoUrl(url);
}
