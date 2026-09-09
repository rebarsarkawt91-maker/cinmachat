/**
 * Unit tests for the iOS/iPadOS Web Push detection helpers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIosUserAgent,
  isStandaloneApp,
  iosPushGuideRequired,
  type NavigatorLike,
} from "../../src/lib/iosCompatibility";

const nav = (overrides: Partial<NavigatorLike> = {}): NavigatorLike => ({
  userAgent: "",
  platform: "",
  maxTouchPoints: 0,
  ...overrides,
});

test("isIosUserAgent matches iPhone, iPod and modern iPad UA", () => {
  assert.equal(isIosUserAgent(nav({ userAgent: "Mozilla iPhone iOS 16.4" })), true);
  assert.equal(isIosUserAgent(nav({ userAgent: "Mozilla iPod iOS" })), true);
  assert.equal(isIosUserAgent(nav({ userAgent: "Mozilla iPad iOS" })), true);
  // Modern iPads report a Macintosh desktop agent; multitouch is the tell.
  assert.equal(isIosUserAgent(nav({ userAgent: "Macintosh Intel Mac OS X", maxTouchPoints: 5 })), true);
  assert.equal(isIosUserAgent(nav({ userAgent: "Macintosh Intel Mac OS X", maxTouchPoints: 0 })), false);
});

test("isIosUserAgent rejects Android and desktop browsers", () => {
  assert.equal(isIosUserAgent(nav({ userAgent: "Android Chrome", platform: "Linux armv81" })), false);
  assert.equal(isIosUserAgent(nav({ userAgent: "Windows NT 10.0", platform: "Win32" })), false);
});

test("isStandaloneApp detects the installed PWA", () => {
  assert.equal(isStandaloneApp(nav(), "standalone"), true);
  assert.equal(isStandaloneApp(nav({ standalone: true }), undefined), true);
  assert.equal(isStandaloneApp(nav(), "browser"), false);
  assert.equal(isStandaloneApp(nav({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 }), "standalone"), true);
});

test("iosPushGuideRequired answers true only inside non-installed iOS Safari", () => {
  const iphone = nav({ userAgent: "Mozilla iPhone" });
  assert.equal(iosPushGuideRequired(iphone, undefined), true);
  assert.equal(iosPushGuideRequired(iphone, "standalone"), false);
  assert.equal(iosPushGuideRequired(nav({ userAgent: "Android" }), undefined), false);
});