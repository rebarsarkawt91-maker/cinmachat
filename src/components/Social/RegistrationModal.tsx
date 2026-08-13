import React, { useState } from 'react';
import { 
  auth, 
  db,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  updateProfile,
  signInWithCustomToken,
  GoogleAuthProvider,
  signInWithPopup,
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  getDocs, 
  collection, 
  query, 
  where
} from '../../lib/firebase';
import { X, User, Phone, Lock, Sparkles, LogIn, Calendar, Users, MapPin, Globe, Mail, QrCode, Eye, EyeOff, ArrowLeft, KeyRound } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';
import jsQR from 'jsqr';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "landing" | "login" | "signup";
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({ isOpen, onClose, initialMode }) => {
  const [isLogin, setIsLogin] = useState(initialMode !== "signup");
  const [authStep, setAuthStep] = useState<"landing" | "form">(initialMode && initialMode !== "landing" ? "form" : "landing");
  const [authMethod, setAuthMethod] = useState<"email" | "phone">("email");
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
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

  const qrInputRef = React.useRef<HTMLInputElement>(null);

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
        onClose();
        window.location.reload();
      } else {
        setError('ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە');
      }
    } catch (err) {
      console.error("Direct card ID login failed:", err);
      setError('ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە');
    } finally {
      setIsLoading(false);
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

  if (!isOpen) return null;

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
    setSuccessMessage(null);
  };

  const inputBaseClass =
    "peer h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 pt-5 pb-1 text-sm font-bold text-white outline-none transition placeholder:text-transparent focus:border-red-500/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-red-500/15 disabled:opacity-60";

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
      className={`group flex min-h-[58px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-right transition-all hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-500/30 ${
        tone === "primary"
          ? "border-red-500/35 bg-red-600 text-white shadow-lg shadow-red-950/30 hover:bg-red-700"
          : "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.07]"
      }`}
      aria-label={label}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/25 text-white/90">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black kurdish-text">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] font-bold text-white/55 kurdish-text">{helper}</span>
      </span>
      <ArrowLeft className="h-4 w-4 shrink-0 text-white/40 transition group-hover:-translate-x-0.5 group-hover:text-white" />
    </button>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    let targetEmail = "";

    // Rate Limiting Guard
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

    if (!isLogin) {
      attempts.push(now);
      sessionStorage.setItem(rateLimitKey, JSON.stringify(attempts));
    }

    // Input Sanitization
    const sanitizedName = (formData.name || "").replace(/<\/?[^>]+(>|$)/g, "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").trim();

    const isLocalAdminBypass =
      formData.name.trim().toLowerCase() === "admin" &&
      (formData.password === "password123" ||
        formData.password === "RebarSarkawtAdmin2026!");

    try {
      if (isLogin && showAdminBypass) {
        // Offline-safe admin bypass for production cases where API endpoint is unavailable.
        if (isLocalAdminBypass) {
          localStorage.setItem("cinemachat_local_admin_profile", JSON.stringify({
            name: "admin",
            phone: "07701966640",
            uniqueCode: "CC-ADM-001"
          }));
          localStorage.setItem("cinemachat_admin", JSON.stringify({
            username: "admin",
            isSuper: true,
            isOwner: true,
            role: "owner"
          }));
          onClose();
          window.location.reload();
          return;
        }

        // Verify admin secret key from backend when available.
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
              onClose();
              window.location.reload();
              return;
            }
          }
        } catch (apiErr) {
          console.error("Admin secret verification failed:", apiErr);
        }

        setError("کۆدی نهێنی سەرپەرشتیار نادروستە یان سێرڤەر وەڵام نادات.");
        return;
      }

      if (isLogin) {
        const loginIdentifier = formData.phone.trim();
        
        if (loginIdentifier.includes("@")) {
          // Normal email/password login
          await signInWithEmailAndPassword(auth, loginIdentifier, formData.password);
        } else {
          // Try ID login first
          const res = await fetch("/api/auth/login-by-id", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uniqueCode: loginIdentifier })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.customToken) {
              await signInWithCustomToken(auth, data.customToken);
              onClose();
              window.location.reload();
              return;
            }
          }
          
          // Legacy fallback
          if (/^\d+$/.test(loginIdentifier)) {
            targetEmail = `${loginIdentifier}@cinamachat.com`;
          } else {
            const cleanUsername = loginIdentifier.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
            targetEmail = `${cleanUsername}@cinamachat.com`;
          }
          await signInWithEmailAndPassword(auth, targetEmail, formData.password);
        }
      } else {
        // Registration
        targetEmail = formData.email?.trim() || "";
        const uniqueCode = `CC-CC-${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          const res = await fetch("/api/auth/register-by-id", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: sanitizedName,
              email: targetEmail,
              password: formData.password,
              uniqueCode,
              phone: formData.phone,
              age: formData.age,
              gender: formData.gender,
              residence: formData.residence,
              country: formData.country
            })
          });

          const data = await res.json();
          if (data.success && data.customToken) {
            await signInWithCustomToken(auth, data.customToken);
          } else {
            throw new Error(data.error || "هەڵەیەک لە تۆمارکردن ڕوویدا");
          }
        } catch (err: any) {
          throw err;
        }
      }

      onClose();
      window.location.reload();
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
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef).catch(() => null);

      if (userSnap && userSnap.exists()) {
        await updateDoc(userDocRef, { isOnline: true }).catch(() => {});
      } else {
        const uniqueCode = `CC-CC-${Math.floor(1000 + Math.random() * 9000)}`;
        await setDoc(userDocRef, {
          uid: user.uid,
          name: user.displayName || 'Google User',
          phone: user.phoneNumber || 'Google Account',
          email: user.email,
          uniqueCode,
          isOnline: true,
          createdAt: new Date().toISOString(),
          role: 'user',
          provider: 'google',
          authProvider: 'google',
        }, { merge: true });

        await setDoc(doc(db, 'syncGroups', user.uid), {
          id: user.uid,
          name: `ژووری ${user.displayName || 'Google User'}`,
          creatorId: user.uid,
          memberIds: [user.uid],
          playback: { isPlaying: false, currentTime: 0, updatedAt: new Date().toISOString() },
          createdAt: new Date().toISOString()
        }, { merge: true });
      }

      onClose();
      window.location.reload();
    } catch (err: any) {
      console.error("Google auth error:", err);
      setError("چوونەژوورەوە بە گووگڵ سەرکەوتوو نەبوو. تکایە دووبارە هەوڵبدەرەوە.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/95 p-3 backdrop-blur-md sm:p-5">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="my-auto w-full max-w-[min(94vw,430px)] overflow-hidden rounded-3xl border border-white/10 bg-[#08080a] text-right shadow-2xl shadow-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cinemachat-auth-title"
      >
        <div className="relative border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(229,9,20,0.20),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)] px-4 pb-4 pt-5 text-center sm:px-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication"
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
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
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
            {showPasswordRecovery ? <KeyRound className="h-6 w-6" /> : isLogin ? <LogIn className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
          </div>
          <h2 id="cinemachat-auth-title" className="text-xl font-black text-white kurdish-text sm:text-2xl">
            {showPasswordRecovery
              ? "گەڕاندنەوەی وشەی تێپەڕ"
              : authStep === "landing"
                ? "چۆنە ژوورەوە یان خۆتۆمارکردن؟"
                : isLogin
                  ? "چوونەژوورەوە"
                  : "خۆتۆمارکردن"}
          </h2>
          <p className="mx-auto mt-1 max-w-[300px] text-xs leading-6 text-zinc-500 kurdish-text">
            {showPasswordRecovery
              ? "ئیمەیڵ و ژمارەی مۆبایلی تۆمارکراو بنووسە."
              : authStep === "landing"
                ? "ڕێگای گونجاو هەڵبژێرە و بە ئارامی بەردەوام بە."
                : isLogin
                  ? authMethod === "email" ? "بە ئیمەیڵ و وشەی تێپەڕ بچۆ ژوورەوە." : "بە ژمارەی مۆبایل یان CC-ID و وشەی تێپەڕ بچۆ ژوورەوە."
                  : authMethod === "email" ? "ئەکاونت بە ئیمەیڵ دروست بکە." : "ئەکاونت بە ژمارەی مۆبایل دروست بکە."}
          </p>
        </div>

        <div className="max-h-[min(78vh,720px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {authStep === "landing" && !showPasswordRecovery ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
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
                disabled={isLoading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                <Globe className="h-4 w-4" />
                Continue with Google
              </button>
            </div>
          ) : showPasswordRecovery ? (
            <form onSubmit={handlePasswordRecovery} className="space-y-3">
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/10 p-3 text-[11px] font-bold leading-6 text-amber-100/85 kurdish-text">
                هیچ SMS یان OTP نانێردرێت. ئەگەر زانیارییەکان بگونجێن، Firebase ئیمەیڵی فەرمی گەڕاندنەوەی وشەی تێپەڕ دەنێرێت.
              </div>
              <FloatingInput
                id="recovery-email"
                label="ئیمەیڵی تۆمارکراو"
                icon={<Mail className="h-4 w-4" />}
                type="email"
                value={formData.email}
                onChange={(value) => setFormData({ ...formData, email: value })}
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
                onChange={(value) => setFormData({ ...formData, phone: value })}
                placeholder="+9647700000000"
                autoComplete="tel"
                inputMode="tel"
                required
                dir="ltr"
              />
              {successMessage && (
                <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-bold leading-6 text-emerald-300 kurdish-text">
                  {successMessage}
                </p>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text"
              >
                {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : "ناردنی ئیمەیڵی گەڕاندنەوە"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {!showAdminBypass && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => resetAuthView(isLogin, "email")}
                    className={`h-11 rounded-2xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text ${authMethod === "email" ? "border-red-500/50 bg-red-600 text-white" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"}`}
                  >
                    {isLogin ? "Login with Email" : "Register using Email"}
                  </button>
                  <button
                    type="button"
                    onClick={() => resetAuthView(isLogin, "phone")}
                    className={`h-11 rounded-2xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text ${authMethod === "phone" ? "border-red-500/50 bg-red-600 text-white" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"}`}
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
                    onChange={(value) => setFormData({ ...formData, name: value })}
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
                    onChange={(value) => setFormData({ ...formData, password: value })}
                    placeholder="password"
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
                    <FloatingInput
                      id="register-name"
                      label="ناوی بەکارهێنەر"
                      icon={<User className="h-4 w-4" />}
                      value={formData.name}
                      onChange={(value) => setFormData({ ...formData, name: value })}
                      placeholder="CinemaChat"
                      autoComplete="name"
                      required
                    />
                  )}

                  {authMethod === "email" ? (
                    <FloatingInput
                      id={isLogin ? "login-email" : "register-email"}
                      label="ئیمەیڵ"
                      icon={<Mail className="h-4 w-4" />}
                      type="email"
                      value={isLogin ? formData.phone : formData.email}
                      onChange={(value) => setFormData(isLogin ? { ...formData, phone: value } : { ...formData, email: value })}
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
                        onChange={(value) => setFormData({ ...formData, phone: value })}
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
                    onChange={(value) => setFormData({ ...formData, password: value })}
                    placeholder="password"
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
                <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-3 text-center text-[11px] font-bold leading-5 text-zinc-400 kurdish-text">
                  ناسنامەی بەستنەوەی ژوورەکەت <span className="font-mono text-red-400">CC-ID</span> بە ئۆتۆماتیکی دروست دەبێت.
                </div>
              )}

              {error && (
                <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-bold leading-5 text-red-300 kurdish-text">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 kurdish-text"
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
                disabled={isLoading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                <Globe className="h-4 w-4" />
                Continue with Google
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
};
