import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Edit3,
  Globe,
  IdCard,
  ImageUp,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Palette,
  Phone,
  Save,
  Settings,
  Shield,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { SocialUser } from "../../types";
import {
  EmailAuthProvider,
  getDownloadURL,
  linkWithCredential,
  reauthenticateWithCredential,
  ref,
  storage,
  updatePassword,
  uploadBytes,
} from "../../lib/firebase";
import {
  cleanProfilePhone,
  getPublicMemberCode,
  isPlaceholderProfileValue,
  isValidProfilePhone,
  profileDisplayValue,
} from "../../services/socialProfileProvisioning";

interface AccountCenterProps {
  socialProfile?: SocialUser | null;
  onLogin: () => void;
  onSignup: () => void;
  onLogout: () => void | Promise<void>;
  onOpenIdentityCard: () => void;
  onOpenMessages: () => void;
  onUpdateProfile?: (updates: Partial<AccountProfileForm>) => Promise<void>;
  currentUser?: any;
  onOpenInviteFriends?: () => void;
}

type AccountProfileForm = {
  displayName: string;
  username: string;
  phoneNumber: string;
  email: string;
  bio: string;
  gender: string;
  birthday: string;
  country: string;
  city: string;
  language: string;
  avatar: string;
  avatarUrl?: string;
  cover: string;
  /** Dedicated location field — stores the user's pinned coordinate object. */
  location: {
    latitude: number;
    longitude: number;
    region?: string;
    address?: string;
  } | null;
};

const getDisplayName = (profile?: SocialUser | null) =>
  profileDisplayValue(profile?.displayName || profile?.name || profile?.username, "CinemaChat");

const getInitials = (profile?: SocialUser | null) => {
  const source = getDisplayName(profile).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

const profileCompletion = (profile?: SocialUser | null) => {
  if (!profile) return 0;
  const fields = [
    profile.avatar || profile.avatarUrl,
    isValidProfilePhone(profile.phone || profile.phoneNumber) ? profile.phone || profile.phoneNumber : "",
    profile.email,
    profile.country || profile.city || profile.residence,
    profile.bio,
    profile.birthday || profile.age,
  ];
  const complete = fields.filter((value) => !isPlaceholderProfileValue(String(value || "").trim())).length;
  return Math.round((complete / fields.length) * 100);
};

const makeProfileForm = (profile?: SocialUser | null): AccountProfileForm => ({
  displayName: profile?.displayName || profile?.name || "",
  username: profile?.username || "",
  phoneNumber: cleanProfilePhone(profile?.phoneNumber || profile?.phone),
  email: profile?.email || "",
  bio: profile?.bio || "",
  gender: profile?.gender || "",
  birthday: profile?.birthday || profile?.age || "",
  country: profile?.country || "",
  city: profile?.city || profile?.residence || "",
  language: profile?.language || "ckb",
  avatar: profile?.avatarUrl || profile?.avatar || "",
  cover: profile?.cover || "",
  location: profile?.location && typeof profile.location === "object"
    ? {
        latitude: profile.location.latitude ?? 0,
        longitude: profile.location.longitude ?? 0,
        region: profile.location.region || undefined,
        address: profile.location.address || undefined,
      }
    : null,
});

const validateProfileForm = (form: AccountProfileForm) => {
  if (!form.displayName.trim()) return "ناوی پیشاندان پێویستە.";
  const normalizedPhone = form.phoneNumber.trim().replace(/[()\-\s]/g, "").replace(/^00/, "+");
  if (normalizedPhone && !/^\+?\d{8,15}$/.test(normalizedPhone)) {
    return "ژمارەی مۆبایل نادروستە. نموونە: +9647700000000";
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "ئیمەیڵەکە نادروستە.";
  }
  if (form.username.trim() && !/^[a-z0-9_.-]{3,32}$/i.test(form.username.trim())) {
    return "Username دەبێت ٣ تا ٣٢ پیت بێت و تەنها a-z، ژمارە، _، .، - بەکاربهێنێت.";
  }
  return "";
};

const resizeAvatarImage = async (file: File): Promise<Blob> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });
    const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
    if (!sourceSize) return file;

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    const sx = ((image.naturalWidth || image.width) - sourceSize) / 2;
    const sy = ((image.naturalHeight || image.height) - sourceSize) / 2;
    ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, 512, 512);

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.86);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const DetailRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) => (
  <div className="grid grid-cols-[minmax(92px,auto)_minmax(0,1fr)] items-center gap-3 border-b border-white/5 py-2.5 last:border-b-0">
    <div className="flex min-w-0 items-center gap-2 text-zinc-500">
      {icon}
      <span className="truncate text-[10px] font-black kurdish-text">{label}</span>
    </div>
    <span className="min-w-0 truncate text-left text-[11px] font-bold text-white/90" dir="auto">
      {profileDisplayValue(value)}
    </span>
  </div>
);

const ActionButton = ({
  icon,
  label,
  onClick,
  tone = "default",
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger" | "primary";
  disabled?: boolean;
}) => {
  const toneClass =
    tone === "primary"
      ? "bg-brand-primary text-white border-brand-primary/40 hover:bg-red-700"
      : tone === "danger"
        ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15"
        : "bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-black kurdish-text transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 ${toneClass}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
};

const ProfileInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-black text-zinc-500 kurdish-text">
      {label}
    </span>
    {multiline ? (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-right text-xs font-bold text-white outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-right text-xs font-bold text-white outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
      />
    )}
  </label>
);

export const AccountCenter: React.FC<AccountCenterProps> = ({
  socialProfile,
  onLogin,
  onSignup,
  onLogout,
  onOpenIdentityCard,
  onOpenMessages,
  onUpdateProfile,
  currentUser,
  onOpenInviteFriends,
}) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"profile" | "edit" | "settings">("profile");
  const [form, setForm] = useState<AccountProfileForm>(() => makeProfileForm(socialProfile));
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [securityForm, setSecurityForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try { return localStorage.getItem("user_gemini_api_key") || ""; } catch { return ""; }
  });
  const [geminiKeySaved, setGeminiKeySaved] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const pageScrollYRef = useRef(0);
  const completion = useMemo(() => profileCompletion(socialProfile), [socialProfile]);
  const avatar = !avatarBroken
    ? socialProfile?.avatarUrl || socialProfile?.avatar || ""
    : "";
  const displayName = getDisplayName(socialProfile);
  const initials = getInitials(socialProfile);
  const publicMemberCode = getPublicMemberCode(socialProfile, currentUser?.uid);
  const displayPhone = profileDisplayValue(cleanProfilePhone(socialProfile?.phoneNumber || socialProfile?.phone));
  const displayLocation = profileDisplayValue(
    [socialProfile?.country, socialProfile?.city || socialProfile?.residence]
      .filter((value) => !isPlaceholderProfileValue(String(value || "").trim()))
      .join(" / "),
  );
  const providerIds = currentUser?.providerData?.map((item: any) => item.providerId) || [];
  const hasPasswordProvider = providerIds.includes("password");
  const securityMode = hasPasswordProvider ? "change" : "add";
  const hasUnsavedProfileEdits = useMemo(() => {
    if (!socialProfile || view !== "edit") return false;
    return JSON.stringify(form) !== JSON.stringify(makeProfileForm(socialProfile));
  }, [form, socialProfile, view]);
  const closeProfilePanel = React.useCallback(() => {
    if (hasUnsavedProfileEdits && !window.confirm("Discard unsaved profile changes?")) {
      return false;
    }
    setOpen(false);
    window.setTimeout(() => avatarButtonRef.current?.focus(), 0);
    return true;
  }, [hasUnsavedProfileEdits]);

  const handleLogout = React.useCallback(async () => {
    if (logoutBusy) return;
    if (hasUnsavedProfileEdits && !window.confirm("Discard unsaved profile changes?")) {
      return;
    }

    setLogoutBusy(true);
    setOpen(false);
    setView("profile");
    try {
      await onLogout();
    } finally {
      setLogoutBusy(false);
    }
  }, [hasUnsavedProfileEdits, logoutBusy, onLogout]);

  React.useEffect(() => {
    if (open && socialProfile) {
      setForm(makeProfileForm(socialProfile));
      setFormError("");
      setFormSuccess("");
      setAvatarBroken(false);
    }
  }, [open, socialProfile]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeProfilePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeProfilePanel, open]);

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    pageScrollYRef.current = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const previousBody = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      touchAction: body.style.touchAction,
    };
    const previousHtmlOverscroll = html.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${pageScrollYRef.current}px`;
    body.style.width = "100%";
    body.style.touchAction = "none";
    html.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBody.overflow;
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.width = previousBody.width;
      body.style.touchAction = previousBody.touchAction;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      window.scrollTo(0, pageScrollYRef.current);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) return;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraActive(false);
  }, [open]);

  const updateForm = (key: keyof AccountProfileForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFormError("");
    setFormSuccess("");
  };

  const handleSaveProfile = async () => {
    if (savingRef.current) return;
    const error = validateProfileForm(form);
    if (error) {
      setFormError(error);
      return;
    }
    if (!onUpdateProfile) return;

    savingRef.current = true;
    setSaving(true);
    setFormError("");
    setFormSuccess("");
    try {
      await onUpdateProfile(form);
      setFormSuccess("پرۆفایلەکەت بە سەرکەوتوویی نوێکرایەوە.");
      setView("profile");
    } catch (error: any) {
      setFormError(error?.message || "نوێکردنەوەی پرۆفایل سەرکەوتوو نەبوو.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUpdateProfile || !currentUser) return;
    if (!file.type.startsWith("image/")) {
      setFormError("تەنها وێنەی profile ڕێگەپێدراوە.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setFormError("قەبارەی وێنە نابێت لە 3MB زیاتر بێت.");
      return;
    }

    setPhotoBusy(true);
    setFormError("");
    setFormSuccess("");
    try {
      const resized = await resizeAvatarImage(file);
      const storageRef = ref(storage, `avatars/${currentUser.uid}/avatar-${Date.now()}.jpg`);
      await uploadBytes(storageRef, resized, { contentType: "image/jpeg" });
      const url = await getDownloadURL(storageRef);
      await onUpdateProfile({ avatar: url, avatarUrl: url });
      setForm((prev) => ({ ...prev, avatar: url }));
      setAvatarBroken(false);
      setFormSuccess("وێنەی profile نوێکرایەوە.");
    } catch (error: any) {
      setFormError(error?.message || "بارکردنی وێنە سەرکەوتوو نەبوو.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const startSelfie = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("کامێرا لەم وێبگەڕەدا پشتگیری ناکرێت.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
    } catch {
      setCameraError("ڕێگە بە کامێرا نەدرا. Upload Photo هێشتا بەردەستە.");
    }
  };

  const stopSelfie = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraActive(false);
  };

  const captureSelfie = async () => {
    if (!videoRef.current || !onUpdateProfile || !currentUser) return;
    const video = videoRef.current;
    const size = Math.min(video.videoWidth || 720, video.videoHeight || 720);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = ((video.videoWidth || size) - size) / 2;
    const sy = ((video.videoHeight || size) - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 512, 512);
    setPhotoBusy(true);
    setCameraError("");
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.86),
      );
      if (!blob) throw new Error("Could not capture selfie.");
      const storageRef = ref(storage, `avatars/${currentUser.uid}/selfie-${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(storageRef);
      await onUpdateProfile({ avatar: url, avatarUrl: url });
      setForm((prev) => ({ ...prev, avatar: url }));
      setAvatarBroken(false);
      setFormSuccess("Selfie ـەکە وەک وێنەی profile دانرا.");
      stopSelfie();
    } catch (error: any) {
      setCameraError(error?.message || "گرتنی selfie سەرکەوتوو نەبوو.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeCustomPhoto = async () => {
    if (!onUpdateProfile) return;
    setPhotoBusy(true);
    setFormError("");
    try {
      await onUpdateProfile({ avatar: "", avatarUrl: "" });
      setForm((prev) => ({ ...prev, avatar: "" }));
      setAvatarBroken(false);
      setFormSuccess("وێنەی profile لابرا.");
    } catch (error: any) {
      setFormError(error?.message || "لابردنی وێنە سەرکەوتوو نەبوو.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePasswordAction = async () => {
    if (!currentUser?.email) {
      setSecurityError("ئیمەیڵی ئەکاونت نەدۆزرایەوە.");
      return;
    }
    if (securityForm.newPassword.length < 8) {
      setSecurityError("وشەی تێپەڕ دەبێت لانیکەم 8 پیت بێت.");
      return;
    }
    if (securityForm.newPassword !== securityForm.confirmPassword) {
      setSecurityError("وشەی تێپەڕ و دووپاتکردنەوە وەک یەک نین.");
      return;
    }
    if (hasPasswordProvider && !securityForm.currentPassword) {
      setSecurityError("وشەی تێپەڕی ئێستا پێویستە.");
      return;
    }

    setSecurityBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      if (hasPasswordProvider) {
        const credential = EmailAuthProvider.credential(currentUser.email, securityForm.currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, securityForm.newPassword);
        setSecurityMessage("وشەی تێپەڕ نوێکرایەوە.");
      } else {
        const credential = EmailAuthProvider.credential(currentUser.email, securityForm.newPassword);
        await linkWithCredential(currentUser, credential);
        setSecurityMessage("وشەی تێپەڕ زیادکرا. ئێستا دەتوانیت بە ئیمەیڵ/وشەی تێپەڕ بچیتە ژوورەوە.");
      }
      setSecurityForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code.includes("credential-already-in-use") || code.includes("email-already-in-use")) {
        setSecurityError("ئەم ئیمەیڵە لە ئەکاونتێکی تر بەکارهاتووە؛ merge بە شێوەی خۆکار ناکرێت.");
      } else if (code.includes("wrong-password") || code.includes("invalid-credential")) {
        setSecurityError("وشەی تێپەڕی ئێستا نادروستە.");
      } else if (code.includes("requires-recent-login")) {
        setSecurityError("بۆ ئەم کردارە پێویستە جارێکی تر بە وشەی تێپەڕ خۆت بسەلمێنیت.");
      } else {
        setSecurityError(error?.message || "کرداری وشەی تێپەڕ سەرکەوتوو نەبوو.");
      }
    } finally {
      setSecurityBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={avatarButtonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            closeProfilePanel();
          } else {
            setOpen(true);
          }
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white shadow-lg shadow-black/20 transition-all hover:bg-white/10 active:scale-95"
        aria-label="Account center"
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-full w-full rounded-xl object-cover"
            referrerPolicy="no-referrer"
            onError={() => setAvatarBroken(true)}
          />
        ) : (
          <span className="text-sm font-black tracking-widest text-brand-primary">
            {initials}
          </span>
        )}
        {socialProfile?.isOnline && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-black bg-emerald-400" />
        )}
        <ChevronDown className="absolute -left-1 -bottom-1 h-4 w-4 rounded-full bg-zinc-900 p-0.5 text-zinc-400" />
      </button>

      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close account center"
              className="fixed inset-0 z-[120000] cursor-default bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(event) => {
                event.stopPropagation();
                closeProfilePanel();
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="fixed left-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[120010] flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[min(330px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-right shadow-2xl shadow-black/80 ring-1 ring-red-500/10 sm:left-4 sm:right-auto sm:top-4"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Close profile"
                onClick={(event) => {
                  event.stopPropagation();
                  closeProfilePanel();
                }}
                className="absolute right-3 top-3 z-[120020] flex h-9 w-9 items-center justify-center rounded-full border border-red-500/30 bg-black/85 text-red-200 shadow-xl shadow-black/40 transition hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/40"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="h-16 shrink-0 bg-[radial-gradient(circle_at_20%_20%,rgba(229,9,20,0.45),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />

              {!socialProfile ? (
                <div className="-mt-7 min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-primary/30 bg-black text-brand-primary shadow-xl shadow-red-950/30">
                    <UserPlus className="h-7 w-7" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-black text-white kurdish-text">
                      چۆنە ژوورەوە یان خۆتۆمارکردن؟
                    </h3>
                    <p className="mt-1 text-xs leading-6 text-zinc-500 kurdish-text">
                      یەک شوێنی ڕوون بۆ چوونەژوورەوە، دروستکردنی ئەکاونت، گووگڵ و گەڕاندنەوەی وشەی تێپەڕ.
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ActionButton
                      icon={<LogIn className="h-4 w-4" />}
                      label="چوونەژوورەوە"
                      tone="primary"
                      onClick={() => {
                        if (closeProfilePanel()) onLogin();
                      }}
                    />
                    <ActionButton
                      icon={<UserPlus className="h-4 w-4" />}
                      label="تۆمارکردن"
                      onClick={() => {
                        if (closeProfilePanel()) onSignup();
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (closeProfilePanel()) onLogin();
                    }}
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] font-black text-zinc-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  >
                    <Globe className="h-4 w-4" />
                    چوونەژوورەوە بۆ ئەکاونتی خۆت
                  </button>
                </div>
              ) : (
                <div className="-mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                  <div className="flex flex-col items-center gap-2.5 text-center sm:flex-row sm:items-end sm:text-right">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black shadow-xl">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={() => setAvatarBroken(true)}
                          />
                        ) : (
                          <span className="text-xl font-black text-brand-primary">
                            {initials}
                          </span>
                        )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-center pb-1 sm:items-start">
                        <div className="flex items-center justify-center gap-1.5 sm:justify-start">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                            Online
                          </span>
                        </div>
                        <h3 className="mt-1 max-w-full truncate text-base font-black text-white kurdish-text">
                          {displayName}
                        </h3>
                        <p className="max-w-full truncate text-[10px] font-mono text-zinc-500">
                          {publicMemberCode || "Member code loading..."}
                        </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                    <button
                      type="button"
                      onClick={() => setView("profile")}
                      className={`min-w-0 rounded-lg px-1 py-1.5 text-[9px] font-black kurdish-text transition ${
                        view === "profile" ? "bg-white/10 text-white" : "text-zinc-500"
                      }`}
                    >
                      پرۆفایل
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("edit")}
                      className={`min-w-0 rounded-lg px-1 py-1.5 text-[9px] font-black kurdish-text transition ${
                        view === "edit" ? "bg-white/10 text-white" : "text-zinc-500"
                      }`}
                    >
                      دەستکاری
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("settings")}
                      className={`min-w-0 rounded-lg px-1 py-1.5 text-[9px] font-black kurdish-text transition ${
                        view === "settings" ? "bg-white/10 text-white" : "text-zinc-500"
                      }`}
                    >
                      ڕێکخستنەکان
                    </button>
                  </div>

                  {view === "profile" ? (
                    <>
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-black text-zinc-400 kurdish-text">
                            تەواوبوونی پرۆفایل
                          </span>
                          <span className="text-xs font-black text-brand-primary">
                            {completion}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-brand-primary transition-all"
                            style={{ width: `${completion}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-2.5 rounded-xl border border-white/10 bg-black/30 px-3">
                        <DetailRow
                          icon={<IdCard className="h-3.5 w-3.5" />}
                          label="Member ID"
                          value={publicMemberCode}
                        />
                        <DetailRow
                          icon={<Phone className="h-3.5 w-3.5" />}
                          label="مۆبایل"
                          value={displayPhone}
                        />
                        <DetailRow
                          icon={<Mail className="h-3.5 w-3.5" />}
                          label="ئیمەیڵ"
                          value={socialProfile.email}
                        />
                        <DetailRow
                          icon={<Globe className="h-3.5 w-3.5" />}
                          label="شوێن"
                          value={displayLocation}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <ActionButton
                          icon={<Edit3 className="h-4 w-4" />}
                          label="دەستکاری"
                          onClick={() => setView("edit")}
                        />
                        <ActionButton
                          icon={<MessageSquare className="h-4 w-4" />}
                          label="نامەکان"
                          onClick={() => {
                            if (closeProfilePanel()) onOpenMessages();
                          }}
                        />
                      </div>
                      <div className="mt-2">
                        <ActionButton
                          icon={<IdCard className="h-4 w-4" />}
                          label="کارتی ئەندامێتی من"
                          onClick={() => {
                            if (closeProfilePanel()) onOpenIdentityCard();
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (closeProfilePanel()) (onOpenInviteFriends || onOpenIdentityCard)();
                        }}
                        className="mt-2.5 flex min-h-[62px] w-full items-center gap-2.5 rounded-xl border border-brand-primary/25 bg-brand-primary/10 p-2.5 text-right transition hover:bg-brand-primary/15 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white shadow-lg shadow-red-950/30">
                          <Share2 className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-black text-white">
                            INVITE YOUR FRIENDS
                          </span>
                          <span className="mt-0.5 block text-[9px] font-bold leading-4 text-zinc-400 kurdish-text">
                            کۆدی ئەندامێتی یان QR ـەکەت بە هاوڕێکانت بنێرە.
                          </span>
                        </span>
                      </button>
                    </>
                  ) : view === "edit" ? (
                    <div className="mt-3 max-h-[min(54vh,400px)] overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 gap-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={handleAvatarFile}
                        />
                        <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black text-zinc-400 kurdish-text">
                              وێنەی profile
                            </span>
                            {photoBusy && (
                              <span className="text-[10px] font-bold text-amber-300">
                                Uploading...
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={photoBusy}
                              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-black text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
                            >
                              <ImageUp className="h-4 w-4" />
                              Upload Photo
                            </button>
                            <button
                              type="button"
                              onClick={startSelfie}
                              disabled={photoBusy || cameraActive}
                              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-black text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
                            >
                              <Camera className="h-4 w-4" />
                              Take Selfie
                            </button>
                            <button
                              type="button"
                              onClick={removeCustomPhoto}
                              disabled={photoBusy}
                              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-[10px] font-black text-red-300 transition hover:bg-red-500/15 disabled:opacity-50 sm:col-span-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remove Custom Photo / Restore Default
                            </button>
                          </div>
                          {cameraActive && (
                            <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 p-2">
                              <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                className="aspect-square w-full rounded-xl object-cover"
                              />
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={captureSelfie}
                                  disabled={photoBusy}
                                  className="min-h-10 rounded-xl bg-brand-primary px-3 text-[10px] font-black text-white disabled:opacity-50"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={stopSelfie}
                                  className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-black text-zinc-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          {cameraError && (
                            <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-200 kurdish-text">
                              {cameraError}
                            </p>
                          )}
                        </div>
                        <ProfileInput
                          label="ناوی پیشاندان"
                          value={form.displayName}
                          onChange={(value) => updateForm("displayName", value)}
                          placeholder="ناوت بنووسە"
                        />
                        <ProfileInput
                          label="Username"
                          value={form.username}
                          onChange={(value) => updateForm("username", value)}
                          placeholder="cinemachat_user"
                        />
                        <ProfileInput
                          label="ژمارەی مۆبایل"
                          value={form.phoneNumber}
                          onChange={(value) => updateForm("phoneNumber", value)}
                          placeholder="+9647700000000"
                          type="tel"
                        />
                        <ProfileInput
                          label="ئیمەیڵ"
                          value={form.email}
                          onChange={(value) => updateForm("email", value)}
                          placeholder="name@example.com"
                          type="email"
                        />
                        <ProfileInput
                          label="Bio"
                          value={form.bio}
                          onChange={(value) => updateForm("bio", value)}
                          placeholder="چەند وشەیەک دەربارەی خۆت..."
                          multiline
                        />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <ProfileInput
                            label="ڕەگەز"
                            value={form.gender}
                            onChange={(value) => updateForm("gender", value)}
                            placeholder="نێر / مێ / تر"
                          />
                          <ProfileInput
                            label="لەدایکبوون"
                            value={form.birthday}
                            onChange={(value) => updateForm("birthday", value)}
                            type="date"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <ProfileInput
                            label="وڵات"
                            value={form.country}
                            onChange={(value) => updateForm("country", value)}
                            placeholder="Kurdistan"
                          />
                          <ProfileInput
                            label="شار"
                            value={form.city}
                            onChange={(value) => updateForm("city", value)}
                            placeholder="Hawler"
                          />
                        </div>
                        <ProfileInput
                          label="زمان"
                          value={form.language}
                          onChange={(value) => updateForm("language", value)}
                          placeholder="ckb"
                        />
                        <ProfileInput
                          label="لینکی وێنەی پرۆفایل"
                          value={form.avatar}
                          onChange={(value) => updateForm("avatar", value)}
                          placeholder="https://..."
                        />
                        <ProfileInput
                          label="لینکی cover photo"
                          value={form.cover}
                          onChange={(value) => updateForm("cover", value)}
                          placeholder="https://..."
                        />

                        <button
                          type="button"
                          onClick={() => {
                            if (!navigator.geolocation) {
                              setFormError("ئەم وێبگەڕە current location پشتگیری ناکات.");
                              return;
                            }
                            setFormError("");
                            setFormSuccess("شوێن دەگیرێت...");
                            navigator.geolocation.getCurrentPosition(
                              (position) => {
                                const { latitude, longitude } = position.coords;
                                setForm((prev) => ({
                                  ...prev,
                                  location: {
                                    latitude,
                                    longitude,
                                    region: prev.location?.region,
                                    address: prev.location?.address,
                                  },
                                }));
                                setFormSuccess(`شوێن وەرگیرا: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                              },
                              () => setFormError("ڕێگەدان بە location نەدرا؛ دەتوانیت بە دەستی بنووسیت."),
                              { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true },
                            );
                          }}
                          className="flex h-9 items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 text-[10px] font-black text-amber-300 transition hover:bg-amber-500/15"
                        >
                          <MapPin className="h-4 w-4" />
                          {form.location ? "شوێن داخرا ✓" : "Current Location"}
                        </button>

                        {formError && (
                          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300 kurdish-text">
                            {formError}
                          </div>
                        )}
                        {formSuccess && (
                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-300 kurdish-text">
                            {formSuccess}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pb-1">
                          <ActionButton
                            icon={saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <Save className="h-4 w-4" />}
                            label={saving ? "پاشەکەوت دەکرێت..." : "پاشەکەوت"}
                            tone="primary"
                            disabled={saving}
                            onClick={handleSaveProfile}
                          />
                          <ActionButton
                            icon={<X className="h-4 w-4" />}
                            label="هەڵوەشاندنەوە"
                            onClick={() => {
                              setForm(makeProfileForm(socialProfile));
                              setFormError("");
                              setFormSuccess("");
                              setView("profile");
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-xs font-black text-white">
                            <Shield className="h-4 w-4 text-brand-primary" />
                            {securityMode === "add" ? "ADD PASSWORD" : "CHANGE PASSWORD"}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-500">
                            Password account
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {hasPasswordProvider && (
                            <input
                              type="password"
                              value={securityForm.currentPassword}
                              onChange={(event) =>
                                setSecurityForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                              }
                              placeholder="Current password"
                              autoComplete="current-password"
                              className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-left text-xs font-bold text-white outline-none focus:border-brand-primary"
                            />
                          )}
                          <input
                            type="password"
                            value={securityForm.newPassword}
                            onChange={(event) =>
                              setSecurityForm((prev) => ({ ...prev, newPassword: event.target.value }))
                            }
                            placeholder="New password"
                            autoComplete="new-password"
                            className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-left text-xs font-bold text-white outline-none focus:border-brand-primary"
                          />
                          <input
                            type="password"
                            value={securityForm.confirmPassword}
                            onChange={(event) =>
                              setSecurityForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                            }
                            placeholder="Confirm new password"
                            autoComplete="new-password"
                            className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-left text-xs font-bold text-white outline-none focus:border-brand-primary"
                          />
                          {securityError && (
                            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300 kurdish-text">
                              {securityError}
                            </p>
                          )}
                          {securityMessage && (
                            <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-300 kurdish-text">
                              {securityMessage}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={handlePasswordAction}
                            disabled={securityBusy || !currentUser}
                            className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-primary px-3 text-[10px] font-black text-white transition hover:bg-red-700 disabled:opacity-50"
                          >
                            {securityBusy ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                            ) : (
                              <KeyRound className="h-4 w-4" />
                            )}
                            {securityMode === "add" ? "ADD PASSWORD" : "CHANGE PASSWORD"}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-xs font-black text-white">
                            <Sparkles className="h-4 w-4 text-amber-400" />
                            کلیل وەرگێڕانی جیمینی بۆ ژێرنووس
                          </span>
                          <span className="text-[10px] font-bold text-zinc-500">
                            Gemini API Key
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <input
                            type="password"
                            value={geminiApiKey}
                            onChange={(e) => { setGeminiApiKey(e.target.value); setGeminiKeySaved(false); }}
                            placeholder="AIza..."
                            autoComplete="off"
                            spellCheck={false}
                            className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-left text-xs font-bold text-white outline-none focus:border-amber-400 font-mono"
                          />
                          {geminiKeySaved && (
                            <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-300 kurdish-text">
                              کلیلی جیمینی پاشەکەوتکرا ✓
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const trimmed = geminiApiKey.trim();
                                if (trimmed) {
                                  localStorage.setItem("user_gemini_api_key", trimmed);
                                } else {
                                  localStorage.removeItem("user_gemini_api_key");
                                }
                                setGeminiKeySaved(true);
                              } catch { /* */ }
                            }}
                            className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 text-[10px] font-black text-amber-300 transition hover:bg-amber-500/30"
                          >
                            <Save className="h-4 w-4" />
                            پاشەکەوتکردن
                          </button>
                        </div>
                        <div className="mt-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                          <p className="mb-1.5 text-[9px] font-black text-zinc-400 uppercase tracking-widest">ڕێنمایی</p>
                          <ol className="space-y-1 text-[10px] leading-relaxed text-zinc-500 kurdish-text list-decimal list-inside">
                            <li>بۆ وەرگرتنی کلیل، سەردانی <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">Google AI Studio</a> بکە.</li>
                            <li>کلیلی خۆت دروست بکە (Create API Key) و کۆپی بکە.</li>
                            <li>لێرەدا پەیستی بکە و پاشەکەوتی بکە تاوەکو وەرگێڕانی کوردی بۆ ژێرنووسەکانت لەسەر ئەکاونتی خۆت کار بکات.</li>
                          </ol>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          { label: "Account", icon: <Edit3 className="h-4 w-4" /> },
                          { label: "Appearance", icon: <Palette className="h-4 w-4" /> },
                          { label: "Notifications", icon: <Bell className="h-4 w-4" /> },
                          { label: "Connected Accounts", icon: <Globe className="h-4 w-4" /> },
                          { label: "Privacy", icon: <CheckCircle2 className="h-4 w-4" /> },
                          { label: "Language", icon: <CreditCard className="h-4 w-4" /> },
                        ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-center text-[9px] font-black text-zinc-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                        >
                          {item.icon}
                          {item.label}
                        </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ActionButton
                      icon={<Settings className="h-4 w-4" />}
                      label="ڕێکخستن"
                      onClick={() => setView("settings")}
                    />
                    <ActionButton
                      icon={<LogOut className="h-4 w-4" />}
                      label="چوونەدەرەوە"
                      tone="danger"
                      onClick={handleLogout}
                      disabled={logoutBusy}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
};
