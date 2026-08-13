import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Edit3,
  Globe,
  IdCard,
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
  UserPlus,
  X,
} from "lucide-react";
import { SocialUser } from "../../types";

interface AccountCenterProps {
  socialProfile?: SocialUser | null;
  onLogin: () => void;
  onSignup: () => void;
  onLogout: () => void | Promise<void>;
  onOpenIdentityCard: () => void;
  onOpenMessages: () => void;
  onUpdateProfile?: (updates: AccountProfileForm) => Promise<void>;
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
  cover: string;
};

const getDisplayName = (profile?: SocialUser | null) =>
  profile?.displayName || profile?.name || profile?.username || "CinemaChat";

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
    profile.phone || profile.phoneNumber,
    profile.email,
    profile.country || profile.city || profile.residence,
    profile.bio,
    profile.birthday || profile.age,
  ];
  const complete = fields.filter((value) => String(value || "").trim()).length;
  return Math.round((complete / fields.length) * 100);
};

const makeProfileForm = (profile?: SocialUser | null): AccountProfileForm => ({
  displayName: profile?.displayName || profile?.name || "",
  username: profile?.username || "",
  phoneNumber: profile?.phoneNumber || profile?.phone || "",
  email: profile?.email || "",
  bio: profile?.bio || "",
  gender: profile?.gender || "",
  birthday: profile?.birthday || profile?.age || "",
  country: profile?.country || "",
  city: profile?.city || profile?.residence || "",
  language: profile?.language || "ckb",
  avatar: profile?.avatarUrl || profile?.avatar || "",
  cover: profile?.cover || "",
});

const validateProfileForm = (form: AccountProfileForm) => {
  if (!form.displayName.trim()) return "ناوی پیشاندان پێویستە.";
  const normalizedPhone = form.phoneNumber.trim().replace(/[()\-\s]/g, "").replace(/^00/, "+");
  if (!/^\+?\d{8,15}$/.test(normalizedPhone)) {
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
      {value && value.trim() ? value : "---"}
    </span>
  </div>
);

const ActionButton = ({
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger" | "primary";
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
    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-[11px] font-black kurdish-text transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 ${toneClass}`}
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
}) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"profile" | "edit" | "settings">("profile");
  const [form, setForm] = useState<AccountProfileForm>(() => makeProfileForm(socialProfile));
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const completion = useMemo(() => profileCompletion(socialProfile), [socialProfile]);
  const avatar = socialProfile?.avatarUrl || socialProfile?.avatar || "";
  const displayName = getDisplayName(socialProfile);
  const initials = getInitials(socialProfile);

  React.useEffect(() => {
    if (open && socialProfile) {
      setForm(makeProfileForm(socialProfile));
      setFormError("");
      setFormSuccess("");
    }
  }, [open, socialProfile]);

  const updateForm = (key: keyof AccountProfileForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFormError("");
    setFormSuccess("");
  };

  const handleSaveProfile = async () => {
    const error = validateProfileForm(form);
    if (error) {
      setFormError(error);
      return;
    }
    if (!onUpdateProfile) return;

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
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white shadow-lg shadow-black/20 transition-all hover:bg-white/10 active:scale-95"
        aria-label="Account center"
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-full w-full rounded-2xl object-cover"
            referrerPolicy="no-referrer"
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

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close account center"
              className="fixed inset-0 z-[120] cursor-default bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="fixed left-3 top-16 z-[130] max-h-[calc(100vh-5rem)] w-[min(calc(100vw-1.5rem),380px)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 text-right shadow-2xl shadow-black/50 backdrop-blur-2xl sm:left-4 sm:right-auto sm:top-24 lg:left-4"
            >
              <div className="h-20 bg-[radial-gradient(circle_at_20%_20%,rgba(229,9,20,0.45),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />

              {!socialProfile ? (
                <div className="-mt-7 max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
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
                        setOpen(false);
                        onLogin();
                      }}
                    />
                    <ActionButton
                      icon={<UserPlus className="h-4 w-4" />}
                      label="تۆمارکردن"
                      onClick={() => {
                        setOpen(false);
                        onSignup();
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onLogin();
                    }}
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] font-black text-zinc-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  >
                    <Globe className="h-4 w-4" />
                    Continue with Google / Email / Mobile
                  </button>
                </div>
              ) : (
                <div className="-mt-8 max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
                  <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:text-right">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-2xl font-black text-brand-primary">
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
                        <h3 className="mt-1 max-w-full truncate text-lg font-black text-white kurdish-text">
                          {displayName}
                        </h3>
                        <p className="max-w-full truncate text-[10px] font-mono text-zinc-500">
                          {socialProfile.uniqueCode || socialProfile.uid}
                        </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                    <button
                      type="button"
                      onClick={() => setView("profile")}
                      className={`min-w-0 rounded-lg px-1 py-2 text-[10px] font-black kurdish-text transition ${
                        view === "profile" ? "bg-white/10 text-white" : "text-zinc-500"
                      }`}
                    >
                      پرۆفایل
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("edit")}
                      className={`min-w-0 rounded-lg px-1 py-2 text-[10px] font-black kurdish-text transition ${
                        view === "edit" ? "bg-white/10 text-white" : "text-zinc-500"
                      }`}
                    >
                      دەستکاری
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("settings")}
                      className={`min-w-0 rounded-lg px-1 py-2 text-[10px] font-black kurdish-text transition ${
                        view === "settings" ? "bg-white/10 text-white" : "text-zinc-500"
                      }`}
                    >
                      ڕێکخستنەکان
                    </button>
                  </div>

                  {view === "profile" ? (
                    <>
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
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

                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 px-3">
                        <DetailRow
                          icon={<IdCard className="h-3.5 w-3.5" />}
                          label="Member ID"
                          value={socialProfile.uniqueCode}
                        />
                        <DetailRow
                          icon={<Phone className="h-3.5 w-3.5" />}
                          label="مۆبایل"
                          value={socialProfile.phone || socialProfile.phoneNumber}
                        />
                        <DetailRow
                          icon={<Mail className="h-3.5 w-3.5" />}
                          label="ئیمەیڵ"
                          value={socialProfile.email}
                        />
                        <DetailRow
                          icon={<Globe className="h-3.5 w-3.5" />}
                          label="شوێن"
                          value={[socialProfile.country, socialProfile.city || socialProfile.residence].filter(Boolean).join(" / ")}
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
                            setOpen(false);
                            onOpenMessages();
                          }}
                        />
                      </div>
                      <div className="mt-2">
                        <ActionButton
                          icon={<IdCard className="h-4 w-4" />}
                          label="کارتی ئەندامێتی من"
                          onClick={() => {
                            setOpen(false);
                            onOpenIdentityCard();
                          }}
                        />
                      </div>
                    </>
                  ) : view === "edit" ? (
                    <div className="mt-4 max-h-[min(56vh,430px)] overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 gap-3">
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
                            navigator.geolocation.getCurrentPosition(
                              (position) => {
                                setFormSuccess(`شوێن وەرگیرا: ${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`);
                              },
                              () => setFormError("ڕێگەدان بە location نەدرا؛ دەتوانیت بە دەستی بنووسیت."),
                              { timeout: 8000, maximumAge: 60000 },
                            );
                          }}
                          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 text-[11px] font-black text-amber-300 transition hover:bg-amber-500/15"
                        >
                          <MapPin className="h-4 w-4" />
                          Current Location
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
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[
                        { label: "Account", icon: <Edit3 className="h-4 w-4" /> },
                        { label: "Security", icon: <Shield className="h-4 w-4" /> },
                        { label: "Appearance", icon: <Palette className="h-4 w-4" /> },
                        { label: "Notifications", icon: <Bell className="h-4 w-4" /> },
                        { label: "Connected Accounts", icon: <Globe className="h-4 w-4" /> },
                        { label: "Privacy", icon: <CheckCircle2 className="h-4 w-4" /> },
                        { label: "Language", icon: <CreditCard className="h-4 w-4" /> },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-center text-[10px] font-black text-zinc-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <ActionButton
                      icon={<Settings className="h-4 w-4" />}
                      label="ڕێکخستن"
                      onClick={() => setView("settings")}
                    />
                    <ActionButton
                      icon={<LogOut className="h-4 w-4" />}
                      label="چوونەدەرەوە"
                      tone="danger"
                      onClick={() => {
                        setOpen(false);
                        void onLogout();
                      }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
