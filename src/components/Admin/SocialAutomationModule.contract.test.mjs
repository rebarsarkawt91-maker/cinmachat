import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const moduleSource = await readFile(join(here, "SocialAutomationModule.tsx"), "utf8");
const appSource = await readFile(join(here, "../../App.tsx"), "utf8");

test("Section 23 is integrated as a guarded entry while sections 1–22 remain", () => {
  assert.match(appSource, /label="٢٢\. ڕیکلامەکانی ناو پلەیەر"/);
  assert.match(appSource, /canAccessSocialAutomation\s*&&\s*\(\s*<SidebarItem/);
  assert.match(appSource, /label="٢٣\. Social Publishing & Automation"/);
  assert.match(appSource, /adminTab === "social-automation" && !canAccessSocialAutomation/);
  assert.match(appSource, /adminTab === "social-automation" && canAccessSocialAutomation/);
  const accessGate = appSource.match(/const canAccessSocialAutomation = Boolean\(([\s\S]*?)\n  \);/)?.[1] || "";
  assert.match(accessGate, /currentUser\?\.role/);
  assert.doesNotMatch(accessGate, /socialProfile|username.*admin|dekan@123/);
  assert.match(appSource, /<SocialAutomationModule\s+catalogMovies=\{movies\}/);
});

test("Section 23 UI title matches the requested dashboard name", () => {
  assert.match(moduleSource, /<h1 id="social23-title">Social Publishing &amp; Automation<\/h1>/);
});

test("dashboard uses authenticated backend routes and never stores credentials in the browser", () => {
  for (const route of [
    "/api/admin/social-automation/settings",
  ]) assert.ok(moduleSource.includes(route), `${route} should be used`);
  assert.match(moduleSource, /const API_ROOT = "\/api\/admin\/social-publishing"/);
  for (const endpoint of ["status", "queue", "history"]) {
    assert.ok(moduleSource.includes(`/${endpoint}`), `${endpoint} endpoint should be used`);
  }
  assert.ok(moduleSource.includes("/approve"), "queue approval uses an authenticated backend action");
  assert.ok(moduleSource.includes("پەسەندکردنی دەستی"), "pending posts show their manual approval state");
  assert.match(moduleSource, /Asia\/Baghdad/);
  assert.match(moduleSource, /DRY_RUN/);
  assert.match(moduleSource, /rightsConfirmed: true/);
  assert.match(moduleSource, /catalogMovies\.find/);
  assert.doesNotMatch(moduleSource, /\blocalStorage\b|\bsessionStorage\b|from ["'][^"']*firebase/i);
  assert.doesNotMatch(moduleSource, /\bfetch\s*\(|window\.open\s*\(/);
});
