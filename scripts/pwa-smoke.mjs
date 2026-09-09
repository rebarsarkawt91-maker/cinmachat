import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
try {
  const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }];
  const counts = [];
  let page;
  for (const viewport of viewports) {
    page = await browser.newPage({ viewport });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('button[aria-label="دابەزاندنی ئەپ"]', { timeout: 30_000 });
    const buttons = await page.locator('button[aria-label="دابەزاندنی ئەپ"]').count();
    if (buttons !== 3) throw new Error(`Expected 3 install entry points at ${viewport.width}px, found ${buttons}`);
    counts.push({ width: viewport.width, buttons });
    if (viewport.width !== 1440) await page.close();
  }
  const manifest = await page.evaluate(async () => fetch("/manifest.webmanifest").then((response) => response.json()));
  if (manifest.lang !== "ckb" || manifest.dir !== "rtl" || manifest.icons.length < 3) {
    throw new Error("Manifest language, direction, or icons are incomplete");
  }
  const registration = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(await navigator.serviceWorker.getRegistration());
  });
  if (!registration) throw new Error("Service worker was not registered");
  console.log(JSON.stringify({ viewports: counts, manifest: true, serviceWorker: true }));
} finally {
  await browser.close();
}
