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
  updateReady: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  install(): Promise<InstallResult>;
  closeIosHelp(): void;
  requestNotifications(): Promise<NotificationPermission | "unsupported">;
  applyUpdate(): Promise<void>;
  setSensitiveActivity(active: boolean): void;
}

const PwaContext = createContext<PwaContextValue | null>(null);
const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [sensitiveActivity, setSensitiveActivityState] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const sensitiveRef = useRef(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  const setSensitiveActivity = useCallback((active: boolean) => {
    sensitiveRef.current = active;
    setSensitiveActivityState(active);
  }, []);

  const applyUpdate = useCallback(async () => {
    if (sensitiveRef.current || !updateSWRef.current) return;
    const version = registrationRef.current?.waiting?.scriptURL || "waiting";
    if (sessionStorage.getItem("cinemachat:pwa-update") === version) return;
    sessionStorage.setItem("cinemachat:pwa-update", version);
    await updateSWRef.current(true);
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
        onNeedRefresh: () => setUpdateReady(true),
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
    if (updateReady && !sensitiveActivity) void applyUpdate();
  }, [applyUpdate, sensitiveActivity, updateReady]);

  const install = useCallback(async (): Promise<InstallResult> => {
    if (isStandalone) return "installed";
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      return choice.outcome === "accepted" ? "installed" : "dismissed";
    }
    setShowIosHelp(true);
    if (isIos) return "ios-help";
    return "unavailable";
  }, [installPrompt, isIos, isStandalone]);

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
    updateReady,
    notificationPermission,
    install,
    closeIosHelp: () => setShowIosHelp(false),
    requestNotifications,
    applyUpdate,
    setSensitiveActivity,
  }), [applyUpdate, install, installPrompt, isInstalled, isIos, notificationPermission, requestNotifications, setSensitiveActivity, showIosHelp, updateReady]);

  return (
    <PwaContext.Provider value={value}>
      {children}
      {showIosHelp && (
        <div className="fixed inset-0 z-[100000] grid place-items-center bg-black/75 p-5" role="dialog" aria-modal="true" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111318] p-6 text-right shadow-2xl">
            <h2 className="text-lg font-black text-white">زیادکردنی CinemaChat بۆ سەر شاشە</h2>
            <p className="mt-3 text-sm leading-7 text-gray-300">
              {isIos ? <>لە Safari دوگمەی Share بکەوە، پاشان <b>Add to Home Screen</b> هەڵبژێرە.</> : <>لە menu ـی براوزەر <b>Install app</b> یان <b>Add to Home screen</b> هەڵبژێرە.</>}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowIosHelp(false)} className="flex-1 rounded-xl bg-[#e50914] px-4 py-3 text-sm font-black text-white">تێگەیشتم</button>
              {notificationPermission === "default" && (
                <button type="button" onClick={() => void requestNotifications()} className="rounded-xl border border-white/15 px-4 py-3 text-xs font-bold text-gray-200">چالاککردنی ئاگادارکردنەوە</button>
              )}
            </div>
          </div>
        </div>
      )}
      {updateReady && sensitiveActivity && (
        <div className="fixed bottom-5 right-5 z-[100000] max-w-sm rounded-2xl border border-red-500/30 bg-[#111318] p-4 shadow-2xl" dir="rtl" role="status">
          <p className="text-sm font-black text-white">وەشانی نوێ ئامادەیە</p>
          <p className="mt-1 text-xs leading-6 text-gray-400">دوای داخستنی ڤیدۆ یان ژوورەکە نوێکردنەوە جێبەجێ دەبێت.</p>
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
