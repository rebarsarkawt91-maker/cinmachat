import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallResult = "installed" | "dismissed" | "ios-help" | "unavailable";

interface PwaContextValue {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  showIosHelp: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  install(): Promise<InstallResult>;
  closeIosHelp(): void;
  requestNotifications(): Promise<NotificationPermission | "unsupported">;
  setSensitiveActivity(active: boolean): void;
}

const PwaContext = createContext<PwaContextValue | null>(null);
const UPDATE_CHECK_MS = 30 * 60 * 1000;
// Debounce window between silent auto-reloads. A fresh deploy produces exactly
// one "need refresh" signal per page; this floor makes a pathological
// byte-different sw.js impossible to turn into an infinite reload loop.
const SILENT_UPDATE_MIN_MS = 60 * 1000;

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [helpPlatform, setHelpPlatform] = useState<"ios" | "android">("android");
  const [linkCopied, setLinkCopied] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(false);
  const [sensitiveActivity, setSensitiveActivityState] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const sensitiveRef = useRef(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastSilentUpdateRef = useRef(0);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|crios|fxios|edgios|opios|android).)*safari/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  const setSensitiveActivity = useCallback((active: boolean) => {
    sensitiveRef.current = active;
    setSensitiveActivityState(active);
  }, []);

  // Silent, safe auto-update: when a newer service worker is installed and
  // waiting, skip the waiting phase and reload — but never while live media is
  // playing or a room/admin workflow holds state. Deferred updates are retried
  // by the effect below the moment sensitive activity clears. No banner, no
  // user interaction, and the debounce window keeps pathological byte-drifting
  // sw.js files from causing reload loops.
  const triggerSilentUpdate = useCallback(() => {
    if (sensitiveRef.current || !updateSWRef.current) return;
    const registration = registrationRef.current;
    if (!registration?.waiting) return;
    const now = Date.now();
    if (now - lastSilentUpdateRef.current < SILENT_UPDATE_MIN_MS) return;
    lastSilentUpdateRef.current = now;
    setPendingUpdate(false);
    void updateSWRef.current(true);
  }, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      updateSWRef.current = registerSW({
        immediate: true,
        onNeedRefresh: () => setPendingUpdate(true),
        onRegisteredSW: (_url, registration) => {
          if (!registration) return;
          registrationRef.current = registration;
          const check = () => { if (navigator.onLine) void registration.update(); };
          check();
          const timer = window.setInterval(check, UPDATE_CHECK_MS);
          const onVisible = () => { if (document.visibilityState === "visible") check(); };
          window.addEventListener("online", check);
          document.addEventListener("visibilitychange", onVisible);
          (registration as ServiceWorkerRegistration & { __cinemaCleanup?: () => void }).__cinemaCleanup = () => {
            clearInterval(timer);
            window.removeEventListener("online", check);
            document.removeEventListener("visibilitychange", onVisible);
          };
        },
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      (registrationRef.current as (ServiceWorkerRegistration & { __cinemaCleanup?: () => void }) | null)?.__cinemaCleanup?.();
    };
  }, []);

  useEffect(() => {
    if (pendingUpdate && !sensitiveActivity) triggerSilentUpdate();
  }, [pendingUpdate, sensitiveActivity, triggerSilentUpdate]);

  const install = useCallback(async (): Promise<InstallResult> => {
    if (isStandalone) return "installed";
    // Android/Chromium must receive the native prompt from this same user
    // gesture. Adding an intermediate platform chooser breaks that contract.
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      return choice.outcome === "accepted" ? "installed" : "dismissed";
    }
    setHelpPlatform(isIos ? "ios" : "android");
    setShowIosHelp(true);
    return isIos ? "ios-help" : "unavailable";
  }, [installPrompt, isIos, isStandalone]);

  const copyCurrentUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      // Clipboard may be denied; the visible URL can still be copied manually.
    }
  }, []);

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported" as const;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  }, []);

  const value = useMemo<PwaContextValue>(() => ({
    canInstall: !isInstalled && (!!installPrompt || isIos),
    isInstalled,
    isIos,
    showIosHelp,
    notificationPermission,
    install,
    closeIosHelp: () => setShowIosHelp(false),
    requestNotifications,
    setSensitiveActivity,
  }), [install, installPrompt, isInstalled, isIos, notificationPermission, requestNotifications, setSensitiveActivity, showIosHelp]);

  return (
    <PwaContext.Provider value={value}>
      {children}
      {showIosHelp && (
        <div className="fixed inset-0 z-[100000] grid place-items-center bg-black/75 p-5" role="dialog" aria-modal="true" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111318] p-6 text-right shadow-2xl">
            <h2 className="text-lg font-black text-white">زیادکردنی CinemaChat بۆ سەر شاشە</h2>
            {helpPlatform === "ios" ? (
              <>
                <p className="mt-3 text-sm leading-7 text-gray-300">
                  {isSafari ? <>Safari ئامادەیە؛ ئەم سێ هەنگاوە جێبەجێ بکە:</> : <>iPhone تەنها لە <b>Safari</b> دامەزراندنی Home Screen بەباشی پشتگیری دەکات. لینکەکە کۆپی بکە و لە Safari بیکەرەوە.</>}
                </p>
                {isSafari && (
                  <ol className="mt-4 space-y-2 text-sm text-gray-200">
                    <li className="rounded-xl bg-white/5 p-3"><b className="text-red-400">١.</b> دوگمەی <b>Share ⬆</b> لە خوارەوە بکە.</li>
                    <li className="rounded-xl bg-white/5 p-3"><b className="text-red-400">٢.</b> <b>Add to Home Screen</b> هەڵبژێرە.</li>
                    <li className="rounded-xl bg-white/5 p-3"><b className="text-red-400">٣.</b> دوگمەی <b>Add</b> بکە.</li>
                  </ol>
                )}
                {!isSafari && <button type="button" onClick={() => void copyCurrentUrl()} className="mt-4 w-full rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm font-black text-sky-300">{linkCopied ? "لینک کۆپی کرا" : "کۆپیکردنی لینک بۆ Safari"}</button>}
              </>
            ) : (
              <p className="mt-3 text-sm leading-7 text-gray-300">لە Chrome دوگمەی <b>Install app</b> یان <b>Add to Home screen</b> لە menu هەڵبژێرە.</p>
            )}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowIosHelp(false)} className="flex-1 rounded-xl bg-[#e50914] px-4 py-3 text-sm font-black text-white">تێگەیشتم</button>
              {notificationPermission === "default" && (
                <button type="button" onClick={() => void requestNotifications()} className="rounded-xl border border-white/15 px-4 py-3 text-xs font-bold text-gray-200">چالاککردنی ئاگادارکردنەوە</button>
              )}
            </div>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}

export function usePwaInstall() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwaInstall must be used inside PwaProvider");
  return value;
}
