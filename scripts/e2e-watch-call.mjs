/**
 * Watch Together E2E test using two isolated browser contexts.
 *
 * Password mode:
 *   node scripts/e2e-watch-call.mjs <phoneA> <passA> <phoneB> <passB> [base]
 *
 * Admin-token mode (local verification, no passwords and no account writes):
 *   node scripts/e2e-watch-call.mjs --admin-credentials <json> [phoneA] [phoneB] [base]
 */
import fs from "node:fs";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const adminIndex = argv.indexOf("--admin-credentials");
const adminCredentialPath = adminIndex >= 0 ? argv[adminIndex + 1] : "";
const positional = adminIndex >= 0
  ? argv.filter((_, index) => index !== adminIndex && index !== adminIndex + 1)
  : argv;

const PHONE_A = positional[0] || "07719703424";
const PASS_A = adminCredentialPath ? "" : (positional[1] || "");
const PHONE_B = adminCredentialPath ? (positional[1] || "07701966644") : (positional[2] || "07701966644");
const PASS_B = adminCredentialPath ? "" : (positional[3] || "");
const BASE = adminCredentialPath ? (positional[2] || "http://127.0.0.1:3004") : (positional[4] || "http://127.0.0.1:3004");

const results = [];
const log = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const benignConsoleError = (text) => [
  /autoplay|user gesture|play\(\)|interrupted/i,
  /favicon|youtube|googlevideo|proxy\.garageband/i,
  /Failed to load resource|net::ERR_|AbortError/i,
  /Download the React DevTools/i,
].some((pattern) => pattern.test(text));

const dialog = (page) => page.getByRole("dialog", { name: /گفتوگۆی تایبەت/ });

async function createAdminTokens() {
  if (!adminCredentialPath) return null;
  const [{ initializeApp, cert, deleteApp }, { getAuth }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
  ]);
  const credential = JSON.parse(fs.readFileSync(adminCredentialPath, "utf8"));
  const app = initializeApp({ credential: cert(credential), projectId: credential.project_id }, `watch-e2e-${Date.now()}`);
  const auth = getAuth(app);
  const canonical = (phone) => {
    const digits = String(phone).replace(/\D/g, "");
    if (/^07\d{9}$/.test(digits)) return `+964${digits.slice(1)}`;
    if (/^9647\d{9}$/.test(digits)) return `+${digits}`;
    return String(phone).startsWith("+") ? String(phone) : `+${digits}`;
  };
  try {
    const [userA, userB] = await Promise.all([
      auth.getUserByPhoneNumber(canonical(PHONE_A)),
      auth.getUserByPhoneNumber(canonical(PHONE_B)),
    ]);
    const [tokenA, tokenB] = await Promise.all([
      auth.createCustomToken(userA.uid, { e2e: true }),
      auth.createCustomToken(userB.uid, { e2e: true }),
    ]);
    return { tokenA, tokenB };
  } finally {
    await deleteApp(app);
  }
}

async function signInWithToken(page, token, label) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (customToken) => {
    const firebase = await import("/src/lib/firebase.ts");
    await firebase.authPersistenceReady;
    await firebase.signInWithCustomToken(firebase.auth, customToken);
  }, token);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Account center").waitFor({ timeout: 30_000 });
  log(`${label}: authenticated`, true);
}

async function signInWithPassword(page, phone, password, label) {
  if (!password) throw new Error("Password mode requires both passwords");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Account center").waitFor({ timeout: 30_000 });
  await page.getByLabel("Account center").click();
  await page.getByRole("button", { name: "چوونەژوورەوە" }).first().click();
  if (!(await page.locator("#login-phone").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "چوونەژوورەوە" }).first().click();
  }
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill(password);
  await page.locator('button[type="submit"]', { hasText: "چوونەژوورەوە" }).click();
  await page.locator("#login-phone").waitFor({ state: "detached", timeout: 30_000 });
  log(`${label}: authenticated`, true);
}

async function openRoom(page) {
  if (await dialog(page).isVisible().catch(() => false)) return;
  try {
    await page.getByRole("button", { name: "OPEN WATCH-TOGETHER" }).click({ timeout: 8_000 });
  } catch (err) {
    // The CALLEE's room can auto-open (watch-call accepted) right as this runs,
    // covering the page's OPEN WATCH-TOGETHER CTA under the room's fixed z-[110]
    // backdrop (plus a lingering z-[1100] ring toast). That race is expected
    // product behavior for two entry points — the dialog itself is the source
    // of truth, so recover by waiting for it. Never force-click the overlay.
    const message = String(err?.message || "");
    if (!message.toLowerCase().includes("intercepts pointer")) throw err;
  }
  await dialog(page).waitFor({ state: "visible", timeout: 20_000 });
}

async function clearExistingSession(page) {
  await page.evaluate(async () => {
    const firebase = await import("/src/lib/firebase.ts");
    const token = await firebase.auth.currentUser?.getIdToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const activeResponse = await fetch("/api/friend-connect/active-session", { headers });
    const active = await activeResponse.json().catch(() => null);
    const connectionId = active?.session?.connection?.connectionId;
    if (connectionId) {
      await fetch("/api/friend-connect/watch-call/end", {
        method: "POST",
        headers: { ...headers, "Content-Type": "text/plain" },
        body: JSON.stringify({ connectionId }),
      });
    }
    const callsResponse = await fetch("/api/friend-connect/watch-calls", { headers });
    const calls = await callsResponse.json().catch(() => null);
    for (const call of calls?.incoming || []) {
      if (call.status === "calling" || call.status === "ringing") {
        await fetch("/api/friend-connect/watch-call/respond", {
          method: "POST", headers: { ...headers, "Content-Type": "text/plain" },
          body: JSON.stringify({ callId: call.callId || call.id, status: "declined" }),
        });
      }
    }
    for (const call of calls?.outgoing || []) {
      if (call.status === "calling" || call.status === "ringing") {
        await fetch("/api/friend-connect/watch-call/cancel", {
          method: "POST", headers: { ...headers, "Content-Type": "text/plain" },
          body: JSON.stringify({ callId: call.callId || call.id }),
        });
      }
    }
  });
}

async function waitForChat(page, label) {
  await openRoom(page);
  await dialog(page).locator('input[placeholder="پەیامێک بنووسە..."]').waitFor({ timeout: 30_000 });
  await dialog(page).getByRole("button", { name: "ناردن", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  await dialog(page).getByText("سەرهێڵ", { exact: true }).waitFor({ timeout: 30_000 });
  log(`${label}: entered the shared chat`, true);
}

async function run() {
  const tokens = await createAdminTokens();
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errorsA = [];
  const errorsB = [];
  for (const [page, bucket] of [[pageA, errorsA], [pageB, errorsB]]) {
    page.on("console", (message) => {
      if (message.type() === "error" && !benignConsoleError(message.text())) bucket.push(message.text());
    });
    page.on("pageerror", (error) => {
      if (!benignConsoleError(String(error))) bucket.push(String(error));
    });
  }

  try {
    if (tokens) {
      await signInWithToken(pageA, tokens.tokenA, "A");
      await signInWithToken(pageB, tokens.tokenB, "B");
    } else {
      await signInWithPassword(pageA, PHONE_A, PASS_A, "A");
      await signInWithPassword(pageB, PHONE_B, PASS_B, "B");
    }
    await clearExistingSession(pageA);
    await clearExistingSession(pageB);
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await pageB.reload({ waitUntil: "domcontentloaded" });

    await openRoom(pageA);
    const boxA = dialog(pageA);
    await boxA.locator('input[placeholder^="بۆ نموونە:"]').fill(PHONE_B);
    await boxA.getByRole("button", { name: "گەڕان", exact: true }).click();
    await boxA.getByRole("button", { name: "Call Invitation" }).waitFor({ timeout: 30_000 });
    log("A: found B by phone", true);

    const ringStart = Date.now();
    await boxA.getByRole("button", { name: "Call Invitation" }).click();
    await boxA.getByText(/Ringing/).waitFor({ timeout: 15_000 });
    log("A: call is ringing", true);
    await pageB.getByText("بانگهێشتی پەیوەندی", { exact: true }).first().waitFor({ timeout: 10_000 });
    log("B: received incoming call without refresh", true, `${Date.now() - ringStart}ms`);

    await pageB.getByRole("button", { name: /وەرگرتن/ }).first().click();
    await Promise.all([waitForChat(pageA, "A"), waitForChat(pageB, "B")]);

    const inputA = dialog(pageA).locator('input[placeholder="پەیامێک بنووسە..."]');
    const inputB = dialog(pageB).locator('input[placeholder="پەیامێک بنووسە..."]');
    const sendA = dialog(pageA).getByRole("button", { name: "ناردن", exact: true });
    const sendB = dialog(pageB).getByRole("button", { name: "ناردن", exact: true });
    await inputA.fill("سڵاو نازیار، تاقیکردنەوەی A");
    await sendA.click({ timeout: 20_000 });
    await dialog(pageB).getByText("سڵاو نازیار، تاقیکردنەوەی A", { exact: true }).waitFor({ timeout: 15_000 });
    log("chat A → B", true);
    await inputB.fill("سڵاو دێکان، تاقیکردنەوەی B");
    await sendB.click({ timeout: 20_000 });
    await dialog(pageA).getByText("سڵاو دێکان، تاقیکردنەوەی B", { exact: true }).waitFor({ timeout: 15_000 });
    log("chat B → A", true);

    await dialog(pageA).getByRole("button", { name: "پەیوەندی دەنگی" }).click();
    await Promise.all([
      dialog(pageA).locator('button[title="پەیوەندی دەنگی چالاکە"]').waitFor({ timeout: 20_000 }),
      dialog(pageB).locator('button[title="پەیوەندی دەنگی چالاکە"]').waitFor({ timeout: 20_000 }),
    ]);
    log("voice WebRTC connected on both accounts", true);

    await pageB.reload({ waitUntil: "domcontentloaded" });
    await waitForChat(pageB, "B after refresh");
    log("accepted session restored after refresh", true);

    await dialog(pageA).getByRole("button", { name: "فیلمێک هەڵبژێرە" }).click();
    // Two direct-video fixtures share the "E2E Sync Film" prefix in the picker —
    // anchor the regex so selecting movie 1 can never grab "E2E Sync Film B".
    await dialog(pageA).locator("button").filter({ hasText: /^E2E Sync Film$/ }).first().click();
    await Promise.all([
      dialog(pageA).getByText("E2E Sync Film", { exact: true }).first().waitFor({ timeout: 15_000 }),
      dialog(pageB).getByText("E2E Sync Film", { exact: true }).first().waitFor({ timeout: 15_000 }),
    ]);
    log("movie selection A → B", true);

    // Picking a movie only drops an invite bubble; the shared player mounts and
    // syncs once ONE participant taps the bubble's play button. Click it on A —
    // the receiving side (B) must then mount its <video> from the relayed state.
    await dialog(pageA).locator('button[title="کردنەوەی فیلم"]').first().click();
    const videoPlayingOn = (page, version) => page.waitForFunction(() => {
      const video = document.querySelector('div[role="dialog"] video');
      return !!video && Number.isFinite(video.duration) && video.duration > 40 && !video.paused;
    }, null, { timeout: 20_000 }).then(() => log(`movie ${version} mounted and playing`, true),
      (err) => { log(`movie ${version} mounted and playing`, false, String(err?.message || err).split("\n")[0]); throw err; });
    await Promise.all([videoPlayingOn(pageA, "A"), videoPlayingOn(pageB, "B")]);

    const videoA = dialog(pageA).locator("video");
    const videoB = dialog(pageB).locator("video");
    await Promise.all([videoA.waitFor({ timeout: 15_000 }), videoB.waitFor({ timeout: 15_000 })]);
    await pageA.waitForFunction(() => {
      const video = document.querySelector('div[role="dialog"] video');
      return video && Number.isFinite(video.duration) && video.duration > 0;
    }, null, { timeout: 20_000 });
    await dialog(pageB).locator('button[title="ڕاگرتن"]').first().click();
    await pageA.waitForFunction(() => document.querySelector('div[role="dialog"] video')?.paused === true, null, { timeout: 15_000 });
    log("pause B → A", true);
    await dialog(pageA).locator('button[title="کردنەوە"]').first().click();
    await pageB.waitForFunction(() => document.querySelector('div[role="dialog"] video')?.paused === false, null, { timeout: 15_000 });
    log("play A → B", true);

    // Use the same +10 control a real viewer taps. Programmatic assignment to
    // a controlled React range can update the DOM value without invoking its
    // synthetic onChange handler, creating a false E2E failure.
    const forwardB = dialog(pageB).locator('button[title="+10 چرکە"]').first();
    await forwardB.click();
    await forwardB.click();
    await forwardB.click();
    await pageA.waitForFunction(() => {
      const time = document.querySelector('div[role="dialog"] video')?.currentTime || 0;
      return time >= 25 && time <= 40;
    }, null, { timeout: 40_000 });
    log("seek B → A", true);

    // Regression: A reconnects (page reload → socket re-join → seq counter
    // restarts), B kept a high "last seen" seq from A's earlier pulses. The
    // server's replayed movieState must re-mount A's player, and a movie CHANGE
    // from A must still reach B even with A restarting its sequence at 1 — the
    // old code silently dropped it and left B on the previous movie/black frame.
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await waitForChat(pageA, "A after reload");
    await pageA.waitForFunction(() => {
      const video = document.querySelector('div[role="dialog"] video');
      return !!video && Number.isFinite(video.duration) && video.duration > 0 && !video.paused;
    }, null, { timeout: 25_000 });
    log("relaunch A: server replay re-mounted the playing movie", true);

    // A now has a movie mounted, so the picker is opened from the control bar
    // ("فیلمێکی تر") instead of the empty-state ("فیلمێک هەڵبژێرە") button.
    const onChangePicker = dialog(pageA).locator('button[title="فیلمێکی تر"]');
    if (await onChangePicker.isVisible().catch(() => false)) await onChangePicker.click();
    else await dialog(pageA).getByRole("button", { name: "فیلمێک هەڵبژێرە" }).click();
    await dialog(pageA).locator("button").filter({ hasText: /^E2E Sync Film B$/ }).first().click();
    await Promise.all([
      dialog(pageA).getByText("E2E Sync Film B", { exact: true }).first().waitFor({ timeout: 15_000 }),
      dialog(pageB).getByText("E2E Sync Film B", { exact: true }).first().waitFor({ timeout: 15_000 }),
    ]);
    await dialog(pageA).locator('button[title="کردنەوەی فیلم"]').first().click();
    await Promise.all([
      pageA.waitForFunction(() => {
        const video = document.querySelector('div[role="dialog"] video');
        return !!video && video.currentSrc?.includes("e2e-test-video2.mp4") &&
          Number.isFinite(video.duration) && video.duration > 40 && !video.paused;
      }, null, { timeout: 25_000 }),
      pageB.waitForFunction(() => {
        const video = document.querySelector('div[role="dialog"] video');
        return !!video && video.currentSrc?.includes("e2e-test-video2.mp4") &&
          Number.isFinite(video.duration) && video.duration > 40 && !video.paused;
      }, null, { timeout: 25_000 }),
    ]);
    log("movie change A → B (fresh seq after A reconnect)", true);

    log("no unexpected console errors on A", errorsA.length === 0, errorsA.slice(0, 2).join(" | "));
    log("no unexpected console errors on B", errorsB.length === 0, errorsB.slice(0, 2).join(" | "));
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`SUMMARY total=${results.length} passed=${results.length - failed.length} failed=${failed.length}`);
  process.exitCode = failed.length ? 1 : 0;
}

run().catch((error) => {
  console.error(`E2E crashed: ${error?.message || error}`);
  process.exitCode = 2;
});
