import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  auth, 
  authPersistenceReady,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  updateProfile,
  signInWithCustomToken,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from '../../lib/firebase';
import { X, User, Phone, Lock, Sparkles, LogIn, Calendar, Users, MapPin, Globe, Mail, QrCode, Eye, EyeOff, ArrowLeft, KeyRound, AlertTriangle } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';
import jsQR from 'jsqr';
import { hydrateGoogleCinemaChatProfile } from '../../services/socialProfileProvisioning';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "landing" | "login" | "signup";
  /**
   * Called after a SUCCESSFUL sign-in/registration instead of reloading to "/".
   * Used by the CinemaChat flow so the user returns to the Friend→Connect room
   * (which re-evaluates account readiness) instead of losing their place.
   */
  onAuthSuccess?: () => void;
}

const inputBaseClass =
  "peer h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 pt-4 pb-1 text-sm font-bold text-white outline-none transition placeholder:text-transparent focus:border-red-500/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-red-500/15 disabled:opacity-60 sm:h-12 sm:rounded-2xl sm:px-4 sm:pt-5";

const FloatingInput = ({
  id,
  label,
  icon,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
  autoComplete,
  inputMode,
  dir = "rtl",
  className = "",
  trailing,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  dir?: "rtl" | "ltr";
  className?: string;
  trailing?: React.ReactNode;
}) => (
  <label htmlFor={id} className="group relative block">
    <span className="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 text-zinc-500 transition group-focus-within:text-red-400">
      {icon}
    </span>
    <input
      id={id}
      type={type}
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      inputMode={inputMode}
      dir={dir}
      aria-label={label}
      className={`${inputBaseClass} pr-11 ${trailing ? "pl-12" : "pl-4"} ${dir === "ltr" ? "text-left" : "text-right kurdish-text"} ${className}`}
    />
    <span className="pointer-events-none absolute right-11 top-1.5 text-[10px] font-black text-zinc-500 transition group-focus-within:text-red-300 kurdish-text">
      {label}
    </span>
    {trailing && (
      <div className="absolute left-2 top-1/2 -translate-y-1/2">
        {trailing}
      </div>
    )}
  </label>
);

const AuthChoiceButton = ({
  icon,
  label,
  helper,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  helper: string;
  onClick: () => void;
  tone?: "default" | "primary";
}) => (
  <button
    type="button"
    onClick={onClick}
      className={`group flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-right transition-all hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-500/30 sm:min-h-[58px] sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3 ${
      tone === "primary"
        ? "border-red-500/35 bg-red-600 text-white shadow-lg shadow-red-950/30 hover:bg-red-700"
        : "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.07]"
    }`}
    aria-label={label}
  >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/25 text-white/90 sm:h-10 sm:w-10">
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-black kurdish-text">{label}</span>
      <span className="mt-0.5 block truncate text-[10px] font-bold text-white/55 kurdish-text">{helper}</span>
    </span>
    <ArrowLeft className="h-4 w-4 shrink-0 text-white/40 transition group-hover:-translate-x-0.5 group-hover:text-white" />
  </button>
);

const isMobileAuthBrowser = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(max-width: 767px)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

const GOOGLE_AUTH_TIMEOUT_MS = 10000;
const GOOGLE_AUTH_FLAG_KEY = "cinemachat_google_redirect_pending";
const EMAIL_PASSWORD_AUTH_FLAG_KEY = "cinemachat_email_password_signin";

/**
 * Google sign-in state machine.
 *
 *   idle                nothing in flight
 *   opening-popup       popup/redirect request sent, waiting for provider
 *   waiting-provider    provider dialog/redirect open
 *   callback-received   sign-in credential resolved, profile not yet saved
 *   hydrating-profile   canonical CinemaChat profile being created/merged
 *   complete            account + profile ready, flow continues
 *   error               failed (message surfaced, user may retry/cancel)
 *   timeout             exceeded the 10s cap (Retry/Cancel shown)
 */
type GoogleAuthState =
  | "idle"
  | "opening-popup"
  | "waiting-provider"
  | "callback-received"
  | "hydrating-profile"
  | "complete"
  | "error"
  | "timeout";

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error(message);
      (error as any).code = "cinemachat/auth-timeout";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

const cleanupAuthCallbackUrl = () => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const sensitiveKeys = [
    "code",
    "state",
    "oauth_token",
    "oauth_verifier",
    "access_token",
    "id_token",
    "authuser",
    "prompt",
  ];
  let changed = false;
  for (const key of sensitiveKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
};

const navigateToHome = () => {
  if (typeof window === "undefined") return;
  window.location.replace("/");
};

const GoogleAuthLoadingScreen = ({
  timedOut = false,
  onRetry,
  onCancel,
}: {
  timedOut?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
}) => {
  const content = (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black px-6 text-center text-white"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center">
        <div className="text-3xl font-black italic tracking-tight text-white sm:text-5xl">
          CINAMACHAT
        </div>
        <p className="mt-3 text-sm font-black uppercase tracking-[0.22em] text-red-400">
          Signing in...
        </p>
        {timedOut ? (
          <>
            <div className="mt-8 flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <p className="mt-8 text-xl font-black leading-8 text-white kurdish-text" dir="rtl">
              چوونەژوورەوە بە گووگڵ ماوەی تێپەڕاند.
            </p>
            <p className="mt-2 text-sm font-bold text-zinc-400">
              Google sign-in timed out. Try again or cancel.
            </p>
            <div className="mt-8 grid w-full max-w-[280px] grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="h-11 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-xs font-black text-white transition hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="h-11 rounded-xl bg-red-600 px-4 text-xs font-black text-white transition hover:bg-red-700"
              >
                Try again
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-8 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-red-500" />
            <p className="mt-8 text-xl font-black leading-8 text-white kurdish-text" dir="rtl">
              چاوەڕێ بکە... بە هەژمارەکەت دەچیتە ژورەوە.
            </p>
            <p className="mt-2 text-sm font-bold text-zinc-400">
              Please wait... Signing you in.
            </p>
          </>
        )}
      </div>
    </div>
  );
  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
};

const GoogleAuthRecoveryPanel = ({
  message,
  onRetry,
  onCancel,
}: {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}) => (
  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-center sm:rounded-2xl">
    <p className="text-xs font-black leading-5 text-amber-200">
      {message}
    </p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-black text-white transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-red-500/30"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onRetry}
        className="h-10 rounded-xl bg-red-600 px-3 text-xs font-black text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/30"
      >
        Try again
      </button>
    </div>
  </div>
);

export const RegistrationModal: React.FC<RegistrationModalProps> = ({ isOpen, onClose, initialMode, onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(initialMode !== "signup");
  const [authStep, setAuthStep] = useState<"landing" | "form">(initialMode && initialMode !== "landing" ? "form" : "landing");
  const [authMethod, setAuthMethod] = useState<"email" | "phone">("email");
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    phone: '',
    email: '',
    password: '',
    age: '',
    gender: 'نێر',
    residence: '',
    country: 'کوردستان',
  });

  // Update isLogin when initialMode changes and modal opens
  React.useEffect(() => {
    if (isOpen && initialMode) {
      setIsLogin(initialMode !== "signup");
      setAuthStep(initialMode === "landing" ? "landing" : "form");
      setAuthMethod("email");
      setShowPasswordRecovery(false);
      setShowPassword(false);
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialMode]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAdminBypass, setShowAdminBypass] = useState(false);
  const [googleState, setGoogleState] = useState<GoogleAuthState>("idle");
  const [googleRedirectError, setGoogleRedirectError] = useState("");
  const [googleError, setGoogleError] = useState<string | null>(null);

  const qrInputRef = React.useRef<HTMLInputElement>(null);
  const googleAttemptRef = React.useRef(0);
  const redirectResultHandledRef = React.useRef(false);
  const submittingRef = React.useRef(false);
  const focusFieldRef = React.useRef<string | null>(null);

  // Focus the invalid field whenever a validation error is displayed.
  React.useEffect(() => {
    if (!focusFieldRef.current) return;
    const el = document.getElementById(focusFieldRef.current);
    if (el) (el as HTMLInputElement).focus();
    focusFieldRef.current = null;
  }, [error]);

  // Single source of truth for form fields: keeps values on failure and clears
  // the previous error as soon as the user starts typing again.
  const updateForm = React.useCallback(
    (field: keyof typeof formData, value: string) => {
      if (error) setError(null);
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [error],
  );

  const clearGoogleAuthState = React.useCallback(() => {
    googleAttemptRef.current += 1;
    sessionStorage.removeItem(GOOGLE_AUTH_FLAG_KEY);
    cleanupAuthCallbackUrl();
    setGoogleState("idle");
    setGoogleRedirectError("");
    setGoogleError(null);
    setIsLoading(false);
  }, []);

  // After a SUCCESSFUL sign-in/registration the flow either returns to the
  // caller (CinemaChat) via onAuthSuccess or reloads to "/" (default, keeps the
  // auth state re-established on the current page). Never do both.
  const completeAuth = React.useCallback(() => {
    onClose();
    if (onAuthSuccess) onAuthSuccess();
    else navigateToHome();
  }, [onClose, onAuthSuccess]);

  const finalizeGoogleCinemaChatAccount = React.useCallback(async (user: any) => {
    if (!user?.uid) {
      throw new Error("Google sign-in returned no user");
    }

    await withTimeout(
      hydrateGoogleCinemaChatProfile(user),
      GOOGLE_AUTH_TIMEOUT_MS,
      "Google profile setup is taking longer than expected.",
    );
  }, []);

  const googleAuthMessage = (err: any) => {
    const code = String(err?.code || "");
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return "Google sign-in was canceled. You can try again when you are ready.";
    }
    if (code === "auth/popup-blocked") {
      return "The browser blocked the Google sign-in popup. Please allow popups for CinemaChat and try again.";
    }
    if (code === "auth/unauthorized-domain") {
      const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
      return `Google sign-in is not authorized for ${host}. Add this domain in Firebase Authentication Authorized domains.`;
    }
    if (code === "auth/operation-not-supported-in-this-environment") {
      return "Google sign-in is not supported in this browser environment. Please try another browser.";
    }
    if (code === "auth/network-request-failed") {
      return "Network error during Google sign-in. Please check the connection and try again.";
    }
    if (code === "auth/account-exists-with-different-credential") {
      return "An account already exists with this email using another sign-in method.";
    }
    if (code === "cinemachat/auth-timeout") {
      return "Google sign-in is taking longer than expected.";
    }
    return "چوونەژوورەوە بە گووگڵ سەرکەوتوو نەبوو. تکایە دووبارە هەوڵبدەرەوە.";
  };

  const handleDirectIdLogin = async (codeToSubmit: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login-by-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueCode: codeToSubmit })
      });

      if (!res.ok) {
        throw new Error("fail");
      }

      const data = await res.json();
      if (data.success && data.customToken) {
        const { signInWithCustomToken } = await import('firebase/auth');
        await signInWithCustomToken(auth, data.customToken);
        completeAuth();
      } else {
        setError('ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە');
      }
    } catch (err) {
      console.error("Direct card ID login failed:", err);
      setError('ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە');
    } finally {
      setIsLoading(false);
      setGoogleState("idle");
    }
  };

  const handleLoginQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("قەبارەی وێنەی کۆدی QR نابێت لە ٢ مێگابایت گەورەتر بێت!");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          e.target.value = "";
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code && code.data && code.data.trim()) {
            let extractedCode = code.data.trim();
            setFormData(prev => ({ ...prev, phone: extractedCode }));
            handleDirectIdLogin(extractedCode);
          } else {
            setError('ئەم وێنەیە گونجاو نییە، تکایە وێنەی QRـی دروست هەڵبژێرە');
          }
        } catch (err) {
          console.error("Error decoding QR code:", err);
          setError('ئەم وێنەیە گونجاو نییە، تکایە وێنەی QRـی دروست هەڵبژێرە');
        }
        e.target.value = "";
      };
      img.onerror = () => {
        setError('ئەم وێنەیە گونجاو نییە، تکایە وێنەی QRـی دروست هەڵبژێرە');
        e.target.value = "";
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const recoveryMessage = "If the information matches an account, password reset instructions will be sent to the registered email.";

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/auth/password-recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          phone: formData.phone,
        }),
      });
      const data = await response.json().catch(() => ({}));
      setSuccessMessage(data?.message || recoveryMessage);
    } catch {
      setSuccessMessage(recoveryMessage);
    } finally {
      setIsLoading(false);
      setGoogleState("idle");
    }
  };

  const resetAuthView = (nextLogin: boolean, method: "email" | "phone" = "email") => {
    setIsLogin(nextLogin);
    setAuthMethod(method);
    setAuthStep("form");
    setShowPasswordRecovery(false);
    setShowAdminBypass(false);
    setShowPassword(false);
    setError(null);
    setGoogleRedirectError("");
    setGoogleState("idle");
    setSuccessMessage(null);
  };

  const completeEmailPasswordLogin = () => {
    // Email/password sign-in resolves only after Firebase has persisted the
    // credential. Navigate to "/" for a real reload so the auth state is
    // re-established and the current page never keeps stale content.
    setIsLoading(false);
    completeAuth();
  };

  const signInWithEmailPassword = async (email: string) => {
    sessionStorage.setItem(EMAIL_PASSWORD_AUTH_FLAG_KEY, "1");
    try {
      await authPersistenceReady;
      const credential = await signInWithEmailAndPassword(auth, email, formData.password);
      if (!credential?.user) {
        throw new Error("Email sign-in did not return a user.");
      }
      return credential;
    } catch (error) {
      sessionStorage.removeItem(EMAIL_PASSWORD_AUTH_FLAG_KEY);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setIsLoading(true);
    setError(null);

    // Rate Limiting Guard (checked only for fresh registrations, recorded AFTER
    // validation passes so duplicate/typo attempts never consume the window).
    const rateLimitKey = 'cc_reg_attempts';
    const now = Date.now();
    const attemptsStr = sessionStorage.getItem(rateLimitKey) || '[]';
    let attempts: number[] = JSON.parse(attemptsStr);
    attempts = attempts.filter((timestamp: number) => now - timestamp < 60000);
    
    if (!isLogin && attempts.length >= 3) {
      setError("کەمێک چاوەڕوان بە! ناتوانیت زیاتر لە ٣ جار ئەکاونت دروست بکەیت لە یەک خولەکدا.");
      setIsLoading(false);
      return;
    }

    // Input Sanitization
    const sanitizedName = (formData.name || "").replace(/<\/?[^>]+(>|$)/g, "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").trim();

    submittingRef.current = true;

    try {
      if (isLogin && showAdminBypass) {
        // Verify admin secret key from backend only. No privileged password is
        // stored, compared, or exposed in the frontend.
        try {
          const verifyRes = await fetch("/api/admin/verify-secret-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: formData.phone,
              password: formData.password,
              name: formData.name || sanitizedName
            })
          });

          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.isSecret) {
              localStorage.setItem("cinemachat_local_admin_profile", JSON.stringify({
                name: verifyData.displayName || "admin",
                phone: verifyData.phone || "07701966640",
                uniqueCode: "CC-ADM-001"
              }));
              localStorage.setItem("cinemachat_admin", JSON.stringify(verifyData.adminUser));
              completeAuth();
              return;
            }
          }
        } catch (apiErr) {
          console.error("Admin secret verification failed:", apiErr);
        }

        setError("کۆدی نهێنی سەرپەرشتیار نادروستە یان سێرڤەر وەڵام نادات.");
        submittingRef.current = false;
        return;
      }

      if (isLogin) {
        const loginIdentifier = formData.phone.trim();

        if (loginIdentifier.includes("@")) {
          // Normal email/password login
          await signInWithEmailPassword(loginIdentifier);
          completeEmailPasswordLogin();
          return;
        }

        // Try CC-ID login first (covers "CC-CC-####", "CC-####", bare "####")
        const res = await fetch("/api/auth/login-by-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uniqueCode: loginIdentifier })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.customToken) {
            await signInWithCustomToken(auth, data.customToken);
            completeAuth();
            return;
          }
        }

        // Mobile + password login (no email required, no fake-email fallback).
        // The server validates the phone, compares the bcrypt hash of the
        // stored password and mints a custom token for the SAME account UID.
        const mobileRes = await fetch("/api/auth/login-mobile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: loginIdentifier, password: formData.password })
        });
        const mobileData = await mobileRes.json().catch(() => ({}));
        if (!mobileRes.ok || !mobileData.success || !mobileData.customToken) {
          throw new Error(
            (mobileData && typeof mobileData.error === "string" && mobileData.error) ||
              "ژمارە مۆبایل یان پاسۆردەکە دروست نییە.",
          );
        }
        await signInWithCustomToken(auth, mobileData.customToken);
        completeAuth();
        return;
      } else {
        // Registration (email OR mobile): validate locally with readable Kurdish
        // messages and focus the invalid field, then let the server enforce the
        // canonical checks (uniqueness of username/email/phone, CC-ID generation).
        const trimmedName = sanitizedName;
        const trimmedUsername = (formData.username || "").trim().toLowerCase();
        const trimmedEmail = formData.email?.trim().toLowerCase() || "";
        const trimmedPhone = formData.phone?.trim() || "";
        const rawPassword = formData.password || "";

        // Client-side validation failed: release the submit guard and focus the
        // offending field so the user can correct it without retyping anything.
        const failValidation = (message: string, fieldId: string) => {
          submittingRef.current = false;
          setIsLoading(false);
          setError(message);
          focusFieldRef.current = fieldId;
        };

        if (!trimmedName) {
          failValidation("تکایە ناوێک بنووسە.", "register-name");
          return;
        }
        if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(trimmedUsername)) {
          failValidation("ناوی بەکارهێنەرەکە نادروستە؛ دەبێت لە ٣ بۆ ٣٢ پیتی ئینگلیزی، ژمارە، یان (. _ -) پێکهاتبێت.", "register-username");
          return;
        }
        if (authMethod === "email") {
          if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            failValidation("تکایە ئیمەیڵێکی دروست بنووسە.", "register-email");
            return;
          }
        } else {
          // Accept Kurdish/Arabic digits (٠-٩ / ۰-۹) and normalize separators
          // before validating; the server performs the authoritative check.
          const convertedPhone = (trimmedPhone || "")
            .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
            .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
          const cleanPhoneCheck = convertedPhone.replace(/[\s\-()]/g, "").replace(/^00/, "+");
          if (!/^\+?\d{8,15}$/.test(cleanPhoneCheck)) {
            failValidation("تکایە ژمارە مۆبایلەکە بە دروستی بنووسە.", "register-phone");
            return;
          }
        }
        if (rawPassword.length < 6) {
          failValidation("پاسۆردەکە زۆر لاوازە؛ پاسۆردێکی بەهێزتر بەکاربهێنە.", "register-password");
          return;
        }

        // Record the attempt only after validation passed (not on typos/dups).
        attempts.push(now);
        sessionStorage.setItem(rateLimitKey, JSON.stringify(attempts));

        try {
          const isMobileRegistration = authMethod === "phone";
          const res = await fetch(
            isMobileRegistration ? "/api/auth/register-mobile" : "/api/auth/register-by-id",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                isMobileRegistration
                  ? {
                      name: trimmedName,
                      username: trimmedUsername,
                      phone: trimmedPhone,
                      password: rawPassword,
                      age: formData.age,
                      gender: formData.gender,
                      residence: formData.residence,
                      country: formData.country,
                    }
                  : {
                      name: trimmedName,
                      username: trimmedUsername,
                      email: trimmedEmail,
                      phone: "",
                      password: rawPassword,
                      age: formData.age,
                      gender: formData.gender,
                      residence: formData.residence,
                      country: formData.country,
                    },
              ),
            },
          );

          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            // Server-provided readable Kurdish message takes priority; never
            // surface raw stack traces / Firebase internals.
            throw new Error(
              (data && typeof data.error === "string" && data.error) ||
                "خۆتۆمارکردن سەرکەوتوو نەبوو. تکایە دووبارە هەوڵ بدەوە.",
            );
          }
          if (data.customToken) {
            await signInWithCustomToken(auth, data.customToken);
          } else {
            throw new Error("خۆتۆمارکردن سەرکەوتوو نەبوو. تکایە دووبارە هەوڵ بدەوە.");
          }
        } catch (err: any) {
          throw err;
        }
      }

      completeAuth();
    } catch (err: any) {
      console.error("Auth error occurred:", err);
      let errorMsg = "هەڵەیەک ڕوویدا، تکایە دووبارە هەوڵبدەرەوە.";
      const errCode = err.code || "";
      
      if (errCode === 'auth/email-already-in-use' || errCode === 'email-already-in-use' || err.message?.includes('already-in-use')) {
        errorMsg = "ئەم ئیمەیڵە پێشتر بەکارهاتووە، تکایە ئیمەیڵێکی تر بەکاربهێنە.";
      } else if (errCode === 'auth/invalid-email' || err.message?.includes('invalid-email')) {
        errorMsg = "ئیمەیڵەکە نادروستە! تکایە شێوازێکی دروست بنووسە.";
      } else if (errCode === 'auth/weak-password' || err.message?.includes('weak-password')) {
        errorMsg = "وشەی تێپەڕ زۆر لاوازە! تکایە وشەیەکی تێپەڕی بەهێزتر بەکاربهێنە (بەلایەنی کەم ٦ پیت یان ژمارە).";
      } else if (errCode === 'auth/user-not-found' || err.message?.includes('user-not-found')) {
        errorMsg = "ئەم بەکارهێنەرە بوونی نییە! تکایە ئەکاونت دروست بکە.";
      } else if (errCode === 'auth/wrong-password' || errCode === 'auth/invalid-credential' || err.message?.includes('wrong-password') || err.message?.includes('invalid-credential')) {
        errorMsg = "وشەی تێپەڕ یان ناوی بەکارهێنەر نادروستە! تکایە دڵنیاببەوە لە زانیارییەکانت.";
      } else if (err.message) {
        // Prefer the readable server-provided message (already in Kurdish) over
        // any raw Firebase/auth internals that may be attached to the error.
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  // Resume a Google redirect that was in flight when the page (re)loaded.
  // Uses a single attempt-guarded promise chain (bounded by the 10s cap); the
  // only authoritative auth listener lives in SocialAuthContext.
  React.useEffect(() => {
    let cancelled = false;
    if (
      redirectResultHandledRef.current ||
      sessionStorage.getItem(GOOGLE_AUTH_FLAG_KEY) !== "1"
    ) {
      return;
    }
    redirectResultHandledRef.current = true;
    const attemptId = ++googleAttemptRef.current;

    setGoogleState("callback-received");
    setGoogleRedirectError("");
    setError(null);
    withTimeout(
      getRedirectResult(auth),
      GOOGLE_AUTH_TIMEOUT_MS,
      "Google sign-in is taking longer than expected.",
    )
      .then(async (result) => {
        if (cancelled || googleAttemptRef.current !== attemptId) return;
        if (!result?.user) {
          sessionStorage.removeItem(GOOGLE_AUTH_FLAG_KEY);
          cleanupAuthCallbackUrl();
          setGoogleState("idle");
          return;
        }
        sessionStorage.removeItem(GOOGLE_AUTH_FLAG_KEY);
        cleanupAuthCallbackUrl();
        setGoogleState("hydrating-profile");
        await withTimeout(
          finalizeGoogleCinemaChatAccount(result.user),
          GOOGLE_AUTH_TIMEOUT_MS,
          "Google profile setup is taking longer than expected.",
        );
        if (cancelled || googleAttemptRef.current !== attemptId) return;
        setGoogleState("complete");
        completeAuth();
      })
      .catch((err: any) => {
        if (cancelled || googleAttemptRef.current !== attemptId) return;
        sessionStorage.removeItem(GOOGLE_AUTH_FLAG_KEY);
        cleanupAuthCallbackUrl();
        console.error("Google redirect auth error:", err?.code || err?.message || err);
        const message = googleAuthMessage(err);
        const timedOut = err?.code === "cinemachat/auth-timeout";
        setIsLogin(true);
        setAuthStep("landing");
        setGoogleRedirectError(message);
        setGoogleError(message);
        setGoogleState(timedOut ? "timeout" : "error");
        setError(message);
      })
      .finally(() => {
        if (!cancelled && googleAttemptRef.current === attemptId) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [finalizeGoogleCinemaChatAccount, completeAuth]);

  const handleGoogleSignIn = async () => {
    // No second popup while a Google attempt is in flight.
    const inFlight = googleState === "opening-popup" ||
      googleState === "waiting-provider" ||
      googleState === "callback-received" ||
      googleState === "hydrating-profile";
    if (inFlight || isLoading) return;
    const attemptId = ++googleAttemptRef.current;
    setGoogleState("opening-popup");
    setGoogleRedirectError("");
    setGoogleError(null);
    setIsLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await authPersistenceReady;
      setGoogleState("waiting-provider");
      if (isMobileAuthBrowser()) {
        sessionStorage.setItem(GOOGLE_AUTH_FLAG_KEY, "1");
        await withTimeout(
          signInWithRedirect(auth, provider),
          GOOGLE_AUTH_TIMEOUT_MS,
          "Google sign-in is taking longer than expected.",
        );
        const redirectError = new Error("Google sign-in redirect did not complete.");
        (redirectError as any).code = "cinemachat/auth-timeout";
        throw redirectError;
      }
      sessionStorage.removeItem(GOOGLE_AUTH_FLAG_KEY);
      setGoogleState("callback-received");
      const result = await withTimeout(
        signInWithPopup(auth, provider),
        GOOGLE_AUTH_TIMEOUT_MS,
        "Google sign-in is taking longer than expected.",
      );
      if (googleAttemptRef.current !== attemptId) return;
      if (!result?.user) {
        throw new Error("Google sign-in returned no user");
      }
      setGoogleState("hydrating-profile");
      await withTimeout(
        finalizeGoogleCinemaChatAccount(result.user),
        GOOGLE_AUTH_TIMEOUT_MS,
        "Google profile setup is taking longer than expected.",
      );
      if (googleAttemptRef.current !== attemptId) return;
      setGoogleState("complete");
      completeAuth();
    } catch (err: any) {
      sessionStorage.removeItem(GOOGLE_AUTH_FLAG_KEY);
      cleanupAuthCallbackUrl();
      console.error("Google auth error:", err);
      const message = googleAuthMessage(err);
      const timedOut = err?.code === "cinemachat/auth-timeout";
      setIsLogin(true);
      setAuthStep("landing");
      setGoogleRedirectError(message);
      setGoogleError(message);
      setGoogleState(timedOut ? "timeout" : "error");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const googleInFlight =
    googleState === "opening-popup" ||
    googleState === "waiting-provider" ||
    googleState === "callback-received" ||
    googleState === "hydrating-profile";
  const isGoogleAuthLoading = googleInFlight && !googleRedirectError && !googleError;
  const googleTimedOut = googleState === "timeout";
  const shouldShowAuthDialog = isOpen || !!googleRedirectError || googleTimedOut;

  if (isGoogleAuthLoading) {
    return (
      <GoogleAuthLoadingScreen
        timedOut={false}
        onRetry={() => void handleGoogleSignIn()}
        onCancel={() => {
          clearGoogleAuthState();
          setError(null);
          onClose();
        }}
      />
    );
  }

  if (googleTimedOut) {
    return (
      <GoogleAuthLoadingScreen
        timedOut
        onRetry={() => void handleGoogleSignIn()}
        onCancel={() => {
          clearGoogleAuthState();
          setError(null);
          onClose();
        }}
      />
    );
  }

  if (!shouldShowAuthDialog) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/95 px-2 py-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:p-5">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="my-auto flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-[min(94vw,430px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] text-right shadow-2xl shadow-black/60 sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cinemachat-auth-title"
      >
        <div className="relative shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(229,9,20,0.20),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)] px-4 pb-3 pt-4 text-center sm:px-6 sm:pb-4 sm:pt-5">
          <button
            type="button"
            onClick={() => {
              clearGoogleAuthState();
              onClose();
            }}
            aria-label="Close authentication"
              className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 sm:left-4 sm:top-4 sm:h-10 sm:w-10 sm:rounded-2xl"
          >
            <X className="h-4 w-4" />
          </button>

          {(authStep !== "landing" || showPasswordRecovery) && (
            <button
              type="button"
              onClick={() => {
                setAuthStep("landing");
                setShowPasswordRecovery(false);
                setShowAdminBypass(false);
                setError(null);
                setSuccessMessage(null);
              }}
              aria-label="Back"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 sm:right-4 sm:top-4 sm:h-10 sm:w-10 sm:rounded-2xl"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 sm:mb-3 sm:h-12 sm:w-12 sm:rounded-2xl">
            {showPasswordRecovery ? <KeyRound className="h-6 w-6" /> : isLogin ? <LogIn className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
          </div>
          <h2 id="cinemachat-auth-title" className="text-lg font-black text-white kurdish-text sm:text-2xl">
            {showPasswordRecovery
              ? "گەڕاندنەوەی وشەی تێپەڕ"
              : authStep === "landing"
                ? "چۆنە ژوورەوە یان خۆتۆمارکردن؟"
                : isLogin
                  ? "چوونەژوورەوە"
                  : "خۆتۆمارکردن"}
          </h2>
          <p className="mx-auto mt-1 max-w-[300px] text-[11px] leading-5 text-zinc-500 kurdish-text sm:text-xs sm:leading-6">
            {showPasswordRecovery
              ? "ئیمەیڵ و ژمارەی مۆبایلی تۆمارکراو بنووسە."
              : authStep === "landing"
                ? "ڕێگای گونجاو هەڵبژێرە و بە ئارامی بەردەوام بە."
                : isLogin
                  ? authMethod === "email" ? "بە ئیمەیڵ و وشەی تێپەڕ بچۆ ژوورەوە." : "بە ژمارەی مۆبایل یان CC-ID و وشەی تێپەڕ بچۆ ژوورەوە."
                  : authMethod === "email" ? "ئەکاونت بە ئیمەیڵ دروست بکە." : "ئەکاونت بە ژمارەی مۆبایل دروست بکە."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-5">
          {authStep === "landing" && !showPasswordRecovery ? (
            <div className="space-y-3 sm:space-y-4">
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                <AuthChoiceButton
                  icon={<LogIn className="h-5 w-5" />}
                  label="چوونەژوورەوە"
                  helper="ئەکاونتت هەیە"
                  tone="primary"
                  onClick={() => resetAuthView(true, "email")}
                />
                <AuthChoiceButton
                  icon={<User className="h-5 w-5" />}
                  label="خۆتۆمارکردن"
                  helper="ئەکاونتی نوێ"
                  onClick={() => resetAuthView(false, "email")}
                />
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading || googleInFlight}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 sm:h-12 sm:rounded-2xl"
              >
                <Globe className="h-4 w-4" />
                {googleInFlight ? "Connecting..." : "Continue with Google"}
              </button>
              {(googleRedirectError || googleError) ? (
                <GoogleAuthRecoveryPanel
                  message={googleRedirectError || "Google sign-in is taking longer than expected."}
                  onRetry={handleGoogleSignIn}
                  onCancel={() => {
                    clearGoogleAuthState();
                    setError(null);
                    onClose();
                  }}
                />
              ) : error ? (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-bold leading-5 text-red-300 sm:rounded-2xl">
                  {error}
                </p>
              ) : null}
            </div>
          ) : showPasswordRecovery ? (
            <form onSubmit={handlePasswordRecovery} className="space-y-2.5 sm:space-y-3">
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/10 p-2.5 text-[11px] font-bold leading-5 text-amber-100/85 kurdish-text sm:rounded-2xl sm:p-3 sm:leading-6">
                هیچ SMS یان OTP نانێردرێت. ئەگەر زانیارییەکان بگونجێن، Firebase ئیمەیڵی فەرمی گەڕاندنەوەی وشەی تێپەڕ دەنێرێت.
              </div>
              <FloatingInput
                id="recovery-email"
                label="ئیمەیڵی تۆمارکراو"
                icon={<Mail className="h-4 w-4" />}
                type="email"
                value={formData.email}
                onChange={(value) => updateForm("email", value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
                dir="ltr"
              />
              <FloatingInput
                id="recovery-phone"
                label="ژمارەی مۆبایلی تۆمارکراو"
                icon={<Phone className="h-4 w-4" />}
                type="tel"
                value={formData.phone}
                onChange={(value) => updateForm("phone", value)}
                placeholder="+9647700000000"
                autoComplete="tel"
                inputMode="tel"
                required
                dir="ltr"
              />
              {successMessage && (
                <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-bold leading-5 text-emerald-300 kurdish-text sm:rounded-2xl sm:leading-6">
                  {successMessage}
                </p>
              )}
              <button
                type="submit"
                disabled={isLoading || googleInFlight}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text sm:h-12 sm:rounded-2xl"
              >
                {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : "ناردنی ئیمەیڵی گەڕاندنەوە"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3">
              {!showAdminBypass && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => resetAuthView(isLogin, "email")}
                    className={`h-10 rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text sm:h-11 sm:rounded-2xl ${authMethod === "email" ? "border-red-500/50 bg-red-600 text-white" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"}`}
                  >
                    {isLogin ? "Login with Email" : "Register using Email"}
                  </button>
                  <button
                    type="button"
                    onClick={() => resetAuthView(isLogin, "phone")}
                    className={`h-10 rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text sm:h-11 sm:rounded-2xl ${authMethod === "phone" ? "border-red-500/50 bg-red-600 text-white" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"}`}
                  >
                    {isLogin ? "Login with Mobile" : "Register using Mobile"}
                  </button>
                </div>
              )}

              {isLogin && showAdminBypass ? (
                <>
                  <FloatingInput
                    id="admin-bypass-name-input"
                    label="ناوی سەرپەرشتیار"
                    icon={<User className="h-4 w-4" />}
                    value={formData.name}
                    onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                    placeholder="admin"
                    autoComplete="username"
                    required
                  />
                  <FloatingInput
                    id="admin-bypass-secret-input"
                    label="کلیلی نهێنی"
                    icon={<Lock className="h-4 w-4" />}
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(value) => setFormData((prev) => ({ ...prev, password: value }))}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    dir="ltr"
                    trailing={
                      <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Show or hide password" className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 hover:bg-white/10 hover:text-white">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </>
              ) : (
                <>
                  {!isLogin && (
                    <>
                      <FloatingInput
                        id="register-name"
                        label="ناوی تەواو"
                        icon={<User className="h-4 w-4" />}
                        value={formData.name}
                        onChange={(value) => updateForm("name", value)}
                        placeholder="CinemaChat"
                        autoComplete="name"
                        required
                      />
                      <FloatingInput
                        id="register-username"
                        label="ناوی بەکارهێنەر (Username)"
                        icon={<KeyRound className="h-4 w-4" />}
                        value={formData.username}
                        onChange={(value) => updateForm("username", value)}
                        placeholder="my_username123"
                        autoComplete="username"
                        required
                        dir="ltr"
                      />
                    </>
                  )}

                  {authMethod === "email" ? (
                    <FloatingInput
                      id={isLogin ? "login-email" : "register-email"}
                      label="ئیمەیڵ"
                      icon={<Mail className="h-4 w-4" />}
                      type="email"
                      value={isLogin ? formData.phone : formData.email}
                      onChange={(value) => updateForm(isLogin ? "phone" : "email", value)}
                      placeholder="name@example.com"
                      autoComplete="email"
                      required
                      dir="ltr"
                    />
                  ) : (
                    <>
                      {isLogin && (
                        <input
                          type="file"
                          ref={qrInputRef}
                          className="hidden"
                          accept="image/*"
                          onChange={handleLoginQRUpload}
                        />
                      )}
                      <FloatingInput
                        id={isLogin ? "login-phone" : "register-phone"}
                        label={isLogin ? "مۆبایل یان CC-ID" : "ژمارەی مۆبایل"}
                        icon={<Phone className="h-4 w-4" />}
                        type="tel"
                        value={formData.phone}
                        onChange={(value) => updateForm("phone", value)}
                        placeholder={isLogin ? "CC-ADM-001 / 07700000000" : "07700000000"}
                        autoComplete="tel"
                        inputMode="tel"
                        required={isLogin || authMethod === "phone"}
                        dir="ltr"
                        trailing={isLogin ? (
                          <button
                            type="button"
                            onClick={() => qrInputRef.current?.click()}
                            aria-label="Scan QR card"
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 hover:bg-white/10 hover:text-white"
                          >
                            <QrCode className="h-4 w-4" />
                          </button>
                        ) : undefined}
                      />
                    </>
                  )}

                  <FloatingInput
                    id={isLogin ? "login-password" : "register-password"}
                    label="وشەی تێپەڕ"
                    icon={<Lock className="h-4 w-4" />}
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(value) => updateForm("password", value)}
                    placeholder="••••••••"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    required
                    dir="ltr"
                    trailing={
                      <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Show or hide password" className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 hover:bg-white/10 hover:text-white">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </>
              )}

              {isLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminBypass(!showAdminBypass);
                    setError(null);
                    setShowPassword(false);
                    setFormData({
                      name: '',
                      username: '',
                      phone: '',
                      email: '',
                      password: '',
                      age: '',
                      gender: 'نێر',
                      residence: '',
                      country: 'کوردستان',
                    });
                  }}
                  className="mx-auto flex min-h-9 items-center justify-center gap-1 rounded-xl px-3 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text"
                >
                  {showAdminBypass ? "گەڕانەوە بۆ چوونەژوورەوەی ئاسایی" : "چوونەژوورەوەی سەرپەرشتیار"}
                </button>
              )}

              {!isLogin && (
                <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-2.5 text-center text-[11px] font-bold leading-5 text-zinc-400 kurdish-text sm:rounded-2xl sm:p-3">
                  ناسنامەی بەستنەوەی ژوورەکەت <span className="font-mono text-red-400">CC-ID</span> بە ئۆتۆماتیکی دروست دەبێت.
                </div>
              )}

              {(googleRedirectError || googleError) ? (
                <GoogleAuthRecoveryPanel
                  message={googleRedirectError || googleError || "Google sign-in is taking longer than expected."}
                  onRetry={handleGoogleSignIn}
                  onCancel={() => {
                    clearGoogleAuthState();
                    setError(null);
                    onClose();
                  }}
                />
              ) : error && (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-bold leading-5 text-red-300 kurdish-text sm:rounded-2xl">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading || googleInFlight}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text sm:h-12 sm:rounded-2xl"
              >
                {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : isLogin ? "چوونەژوورەوە" : "دروستکردنی ئەکاونت"}
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-black text-zinc-600">OR</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading || googleInFlight}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 sm:h-12 sm:rounded-2xl"
              >
                <Globe className="h-4 w-4" />
                {googleInFlight ? "Connecting..." : "Continue with Google"}
              </button>

              {isLogin && !showAdminBypass && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordRecovery(true);
                    setShowAdminBypass(false);
                    setError(null);
                    setSuccessMessage(null);
                    setFormData((prev) => ({ ...prev, password: '' }));
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-center text-[11px] font-bold text-red-400 transition hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text"
                >
                  وشەی تێپەڕت لەبیر کردووە؟
                </button>
              )}
            </form>
          )}

          {authStep !== "landing" && !showPasswordRecovery && (
            <div className="mt-4 border-t border-white/10 pt-4 text-center">
              <button
                type="button"
                onClick={() => resetAuthView(!isLogin, "email")}
                className="rounded-xl px-3 py-2 text-[11px] font-bold text-zinc-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text"
              >
                {isLogin ? "ئەکاونتت نییە؟ خۆتۆمارکردن" : "پێشتر ئەکاونتت هەیە؟ چوونەژوورەوە"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
