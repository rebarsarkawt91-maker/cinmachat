/**
 * CinemaChat Web Push — React provider.
 *
 * Owns the full bell state machine, the device push subscription lifecycle and
 * the preferences panel wiring. It deliberately does NOT auto-request
 * permission: every prompt/subscription happens inside a direct user gesture.
 * On logout/account change the device is fully detached (browser subscription
 * removed + server record deleted), then rehydrated on the next sign-in.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSocialAuth } from "../context/SocialAuthContext";
import { pushApi, detectDeviceLabel } from "../services/pushClient";
import {
  urlB64ToUint8Array,
  deriveBellState,
  DEFAULT_PREFERENCES,
  type BellState,
  type PushPreferences,
} from "../lib/webPushShared";
import { isStandaloneApp, iosPushGuideRequired } from "../lib/iosCompatibility";

type PermissionState = NotificationPermission | "unsupported";

interface PushContextValue {
  bell: BellState;
  pushSupported: boolean;
  permission: PermissionState;
  subscribed: boolean;
  panelOpen: boolean;
  preferences: PushPreferences;
  masterEnabled: boolean;
  ioSGuideRequired: boolean;
  awaitingSignIn: boolean;
  toast: string | null;
  handleBellClick: () => void;
  openPanel: () => void;
  closePanel: () => void;
  updatePreference: (key: keyof PushPreferences, value: boolean) => void;
  toggleMaster: (enabled: boolean) => void;
  disablePush: () => void;
}

const PushContext = createContext<PushContextValue | null>(null);

const getPermission = (): PermissionState =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

export function PushProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, loading: authLoading } = useSocialAuth();

  const [permission, setPermission] = useState<PermissionState>(getPermission);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [preferences, setPreferences] = useState<PushPreferences>({ ...DEFAULT_PREFERENCES });
  const [masterEnabled, setMasterEnabledState] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const pushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const displayMode =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(display-mode: standalone)").matches
        ? "standalone"
        : undefined
      : undefined;
  const standalone = isStandaloneApp(navigator, displayMode);
  const ioSGuideRequired = pushSupported && iosPushGuideRequired(navigator, displayMode);

  const vapidKeyRef = useRef<string | null>(null);
  const activeSubRef = useRef<PushSubscription | null>(null);
  const preferencesRef = useRef<PushPreferences>({ ...DEFAULT_PREFERENCES });
  const toastTimerRef = useRef<number | null>(null);
  const userRef = useRef(currentUser);
  userRef.current = currentUser;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  // Preload the VAPID public key early so a later bell click can subscribe
  // without any await between the gesture and PushManager.subscribe().
  useEffect(() => {
    void pushApi.getVapidPublicKey().then((key) => {
      if (key) vapidKeyRef.current = key;
    });
  }, []);

  // Keep the permission state honest across explicit/allowed changes.
  useEffect(() => {
    if (!pushSupported || typeof Notification === "undefined") return;
    const syncPermission = () => setPermission(Notification.permission);
    window.addEventListener("focus", syncPermission);
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((status) => {
        status.onchange = syncPermission;
      })
      .catch(() => {});
    return () => window.removeEventListener("focus", syncPermission);
  }, [pushSupported]);

  // Rehydrate: recover a browser subscription the user already granted and
  // replay its server-side preferences for THIS account only. Called on mount,
  // after sign-in changes, and after every subscribe/disable transition.
  const rehydrate = useCallback(async () => {
    const user = userRef.current;
    if (!user || !pushSupported) return;
    if (user.uid === "admin_local_bypass") return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!existing) {
        activeSubRef.current = null;
        setSubscribed(false);
        return;
      }
      activeSubRef.current = existing;
      let idToken = "";
      try {
        idToken = await user.getIdToken();
      } catch {
        return;
      }
      const records = await pushApi.getSubscriptions(idToken);
      const own = records.find((record) => record.endpoint === existing.endpoint);
      if (own) {
        const prefs = (own.preferences || {}) as Partial<PushPreferences>;
        const merged = { ...DEFAULT_PREFERENCES, ...prefs };
        preferencesRef.current = merged;
        setPreferences(merged);
        setMasterEnabledState(own.enabled !== false);
        setSubscribed(true);
      } else {
        setSubscribed(false);
      }
    } catch {
      // SW not active yet or transient network — the bell simply stays silent.
    }
  }, [pushSupported]);

  useEffect(() => {
    if (!authLoading) void rehydrate();
  }, [authLoading, currentUser?.uid, rehydrate]);

  const subscribeDevice = useCallback(
    async (user: any) => {
      setBusy(true);
      try {
        const applicationServerKey = vapidKeyRef.current;
        if (!applicationServerKey) {
          setBusy(false);
          showToast("نۆتیفیکەیشن لەم کاتەدا بەردەست نییە؛ دواتر هەوڵبدەوە.");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(applicationServerKey),
          }));
        activeSubRef.current = subscription;

        const idToken = await user.getIdToken();
        await pushApi.subscribe(idToken, subscription, DEFAULT_PREFERENCES, detectDeviceLabel());
        const defaults = { ...DEFAULT_PREFERENCES };
        preferencesRef.current = defaults;
        setPreferences(defaults);
        setMasterEnabledState(true);
        setSubscribed(true);
        showToast("نۆتیفیکەیشن بۆ ئەم ئامێرە چالاک کرا");
      } catch (error: unknown) {
        activeSubRef.current = null;
        setSubscribed(false);
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setPermission(Notification.permission);
          showToast("ڕێگەپێدانەکە ڕەتکرایەوە؛ لە ڕێکخستنەکانی وێبگەڕ چالاکی بکە.");
        } else {
          showToast("چالاککردنی نۆتیفیکەیشن سەرکەوتوو نەبوو.");
        }
      } finally {
        setBusy(false);
      }
    },
    [showToast],
  );

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const handleBellClick = useCallback(() => {
    const state = deriveBellState({
      supported: pushSupported,
      permission,
      subscribed,
      busy,
      iOSInstalledPwa: standalone,
    });
    if (state === "busy") return;

    const user = userRef.current;
    if (!user || user.uid === "admin_local_bypass") {
      openPanel();
      return;
    }
    if (ioSGuideRequired || state === "denied" || state === "unsupported" || state === "subscribed") {
      if (state === "subscribed") openPanel();
      else openPanel();
      return;
    }
    // default / granted — subscribe. When permission is still "default" the
    // prompt must fire inside this same user gesture before any await.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      setBusy(true);
      void Notification.requestPermission().then((result) => {
        setPermission(result);
        if (result === "granted") void subscribeDevice(user);
        else {
          setBusy(false);
          showToast("ڕێگەپێدانەکە ڕەتکرایەوە؛ لە ڕێکخستنەکانی وێبگەڕ چالاکی بکە.");
        }
      });
      return;
    }
    void subscribeDevice(user);
  }, [busy, ioSGuideRequired, permission, pushSupported, showToast, standalone, subscribed]);

  const patchPreferences = useCallback(
    async (nextPreferences: PushPreferences) => {
      preferencesRef.current = nextPreferences;
      setPreferences(nextPreferences);
      const user = userRef.current;
      const endpoint = activeSubRef.current?.endpoint;
      if (!user || !endpoint || user.uid === "admin_local_bypass") return;
      try {
        const idToken = await user.getIdToken();
        await pushApi.updatePreferences(idToken, endpoint, nextPreferences);
      } catch {
        showToast("نوێکردنەوەی ڕەنگەکان سەرکەوتوو نەبوو.");
      }
    },
    [showToast],
  );

  const updatePreference = useCallback(
    (key: keyof PushPreferences, value: boolean) => {
      void patchPreferences({ ...preferencesRef.current, [key]: value });
    },
    [patchPreferences],
  );

  const toggleMaster = useCallback(
    (enabled: boolean) => {
      setMasterEnabledState(enabled);
      const user = userRef.current;
      const endpoint = activeSubRef.current?.endpoint;
      if (!user || !endpoint || user.uid === "admin_local_bypass") return;
      void user.getIdToken().then((idToken: string) =>
        pushApi.setMasterEnabled(idToken, endpoint, enabled).catch(() => {
          setMasterEnabledState(!enabled);
          showToast("گۆڕینی دۆخی نۆتیفیکەیشن سەرکەوتوو نەبوو.");
        }),
      );
    },
    [showToast],
  );

  const disablePush = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const user = userRef.current;
    const endpoint = activeSubRef.current?.endpoint;
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      activeSubRef.current = null;
      preferencesRef.current = { ...DEFAULT_PREFERENCES };
      setPreferences({ ...DEFAULT_PREFERENCES });
      setSubscribed(false);
      if (user && endpoint && user.uid !== "admin_local_bypass") {
        const idToken = await user.getIdToken();
        await pushApi.unsubscribe(idToken, endpoint).catch(() => {});
      }
    } catch {
      showToast("ناخستنی نۆتیفیکەیشن سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }, [busy, showToast]);

  // Detach on logout: remove the server record AND the browser subscription so
  // no device data survives an account switch.
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser && activeSubRef.current) void disablePush();
  }, [authLoading, currentUser, disablePush]);

  const bell = deriveBellState({
    supported: pushSupported,
    permission,
    subscribed,
    busy,
    iOSInstalledPwa: standalone,
  });

  const value = useMemo<PushContextValue>(
    () => ({
      bell,
      pushSupported,
      permission,
      subscribed,
      panelOpen,
      preferences,
      masterEnabled,
      ioSGuideRequired,
      awaitingSignIn: !currentUser,
      toast,
      handleBellClick,
      openPanel,
      closePanel,
      updatePreference,
      toggleMaster,
      disablePush,
    }),
    [
      bell,
      pushSupported,
      permission,
      subscribed,
      panelOpen,
      preferences,
      masterEnabled,
      ioSGuideRequired,
      currentUser,
      toast,
      handleBellClick,
      openPanel,
      closePanel,
      updatePreference,
      toggleMaster,
      disablePush,
    ],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush() {
  const context = useContext(PushContext);
  if (!context) throw new Error("usePush must be used inside PushProvider");
  return context;
}