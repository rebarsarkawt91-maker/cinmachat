/**
 * iOS / iPadOS Web Push compatibility — pure helpers.
 *
 * Apple only supports the Web Push API inside the installed Home Screen PWA on
 * iOS/iPadOS 16.4+. These helpers never claim a bypass; they only detect the
 * platform and decide whether the in-page iOS guide must be shown.
 */

export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}

/** Matches iPhones, iPods and every iPad user agent (including modern ones). */
export function isIosUserAgent(navigatorInfo: NavigatorLike): boolean {
  const ua = (navigatorInfo.userAgent || "").toLowerCase();
  const platform = (navigatorInfo.platform || "").toLowerCase();
  const isIpadAgent = ua.includes("ipad") || platform.includes("ipad");
  // iPads on iPadOS 13+ report a Macintosh desktop agent; only true iPads have
  // multi-touch — the same heuristic the rest of the app already uses.
  const isMacWithTouch = ua.includes("macintosh") && (navigatorInfo.maxTouchPoints || 0) > 1;
  return ua.includes("iphone") || ua.includes("ipod") || isIpadAgent || isMacWithTouch;
}

/** Whether the app is running as an installed PWA (display-mode: standalone). */
export function isStandaloneApp(navigatorInfo: NavigatorLike, displayMode?: string): boolean {
  return displayMode === "standalone" || navigatorInfo.standalone === true;
}

/**
 * iOS installed PWA eligibility: Web Push needs the Home Screen install. Inside
 * ordinary Safari or a non-installed browser the user only gets the guide.
 */
export function iosPushGuideRequired(navigatorInfo: NavigatorLike, displayMode?: string): boolean {
  return isIosUserAgent(navigatorInfo) && !isStandaloneApp(navigatorInfo, displayMode);
}