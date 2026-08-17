import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Save, X } from "lucide-react";
import { useSocialAuth } from "../../context/SocialAuthContext";
import { AccountReadiness, MissingAccountField } from "../../services/accountReadiness";
import {
  cleanProfilePhone,
  getPublicMemberCode,
  isValidProfilePhone,
  normalizeProfilePhone,
  profileDisplayValue,
} from "../../services/socialProfileProvisioning";

/**
 * Complete-Account modal for CinemaChat.
 *
 * Shown when the account readiness gate reports `authenticated-incomplete`.
 * Pre-fills every editable field from the canonical profile, lists exactly the
 * fields the gate is missing, and saves through the SAME canonical path as the
 * profile menu (updateSocialProfile → server profile-sync → Firestore mirror).
 * On success the shared SocialAuthContext recomputes readiness, the gate flips
 * to READY and the CinemaChat flow continues to FRIEND 1 without a reload.
 */
interface CompleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  readiness: AccountReadiness;
}

const inputClass =
  "peer h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 pt-4 pb-1 text-sm font-bold text-white outline-none transition placeholder:text-transparent focus:border-red-500/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-red-500/15 disabled:opacity-60 sm:h-12 sm:rounded-2xl sm:px-4 sm:pt-5";

const missingFieldLabel = (field: MissingAccountField): string => {
  switch (field) {
    case "displayName":
      return "ناو";
    case "username":
      return "ناوی بەکارهێنەر (Username)";
    case "memberCode":
      return "CC-ID";
    case "identity":
      return "ئیمەیڵ یان ژمارەی مۆبایل";
    default:
      return field;
  }
};

const FloatingField = ({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  dir = "rtl",
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  dir?: "rtl" | "ltr";
  invalid?: boolean;
}) => (
  <label htmlFor={id} className="group relative block">
    <input
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder=" "
      autoComplete={autoComplete}
      dir={dir}
      aria-label={label}
      className={`${inputClass} pl-4 ${dir === "ltr" ? "text-left" : "text-right kurdish-text"} ${
        invalid ? "border-red-500/70 ring-2 ring-red-500/20" : ""
      }`}
    />
    <span className="pointer-events-none absolute right-4 top-1.5 text-[10px] font-black text-zinc-500 transition group-focus-within:text-red-300 kurdish-text">
      {label}
    </span>
  </label>
);

const cleanProfileText = (value?: string, maxLength = 160) =>
  String(value || "")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .trim()
    .slice(0, maxLength);

export const CompleteAccountModal: React.FC<CompleteAccountModalProps> = ({
  open,
  onClose,
  readiness,
}) => {
  const { currentUser, socialProfile, updateSocialProfile } = useSocialAuth();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);

  const profile = socialProfile;
  const missing = useMemo(() => new Set(readiness.missingFields), [readiness]);
  const recommended = useMemo(
    () => new Set(readiness.recommendedMissingFields),
    [readiness],
  );

  // Pre-fill from the canonical profile every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setDisplayName(profileDisplayValue(profile?.displayName || profile?.name, ""));
    setUsername(cleanProfileText(profile?.username, 32));
    setPhone(cleanProfilePhone(profile?.phoneNumber || profile?.phone));
    setEmail(cleanProfileText(profile?.email, 120));
    setAge(cleanProfileText(String(profile?.age ?? ""), 3));
    setAddress(cleanProfileText(profile?.address, 200));
    setError(null);
  }, [open, profile]);

  useEffect(() => {
    if (!focusRef.current) return;
    const el = document.getElementById(focusRef.current);
    if (el) (el as HTMLInputElement).focus();
    focusRef.current = null;
  }, [error]);

  if (!open) return null;

  const doSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    const trimmedName = cleanProfileText(displayName, 60);
    const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    const normalizedPhone = normalizeProfilePhone(phone);
    const trimmedEmail = email.trim().toLowerCase();

    const failValidation = (message: string, fieldId: string) => {
      setSaving(false);
      setError(message);
      focusRef.current = fieldId;
    };

    if (!trimmedName) {
      failValidation("تکایە ناوێک بنووسە.", "complete-name");
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(trimmedUsername)) {
      failValidation(
        "ناوی بەکارهێنەرەکە نادروستە؛ دەبێت لە ٣ بۆ ٣٢ پیتی ئینگلیزی، ژمارە، یان (. _ -) پێکهاتبێت.",
        "complete-username",
      );
      return;
    }
    const hasPhone = !!normalizedPhone;
    const hasEmail = !!trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!hasPhone && !hasEmail) {
      failValidation(
        "تکایە ئیمەیڵێک یان ژمارەی مۆبایلێکی دروست بنووسە بۆ ناسینەوە.",
        "complete-phone",
      );
      return;
    }

    // Age is optional/recommended; when provided it must be a sane number.
    const trimmedAge = age.trim();
    const trimmedAddress = cleanProfileText(address, 200);
    if (trimmedAge && !/^\d{1,3}$/.test(trimmedAge)) {
      failValidation("تەمەن دەبێت ژمارەیەک بێت.", "complete-age");
      return;
    }
    const ageNumber = trimmedAge ? Number(trimmedAge) : 0;
    if (trimmedAge && (ageNumber < 13 || ageNumber > 120)) {
      failValidation("تەمەن دەبێت لە نێوان ١٣ و ١٢٠ بێت.", "complete-age");
      return;
    }

    try {
      await updateSocialProfile({
        displayName: trimmedName,
        username: trimmedUsername,
        ...(hasPhone ? { phoneNumber: normalizedPhone } : {}),
        ...(hasEmail ? { email: trimmedEmail } : {}),
        ...(trimmedAge ? { age: ageNumber } : {}),
        ...(trimmedAddress ? { address: trimmedAddress } : {}),
      });
      onClose();
    } catch (err: any) {
      const msg = err?.message || "پاشەکەوتکردن سەرکەوتوو نەبوو؛ دووبارە هەوڵبدەرەوە.";
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/90 px-2 py-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-account-title"
        className="my-auto flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-[min(94vw,430px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] text-right shadow-2xl shadow-black/60 sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-3xl"
      >
        <div className="relative shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(229,9,20,0.20),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)] px-4 pb-3 pt-4 text-center sm:px-6 sm:pb-4 sm:pt-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="داخستن"
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white sm:left-4 sm:top-4 sm:h-10 sm:w-10 sm:rounded-2xl"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 sm:mb-3 sm:h-12 sm:w-12 sm:rounded-2xl">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 id="complete-account-title" className="text-lg font-black text-white kurdish-text sm:text-2xl">
            تەواوکردنی ئەکاونت
          </h2>
          <p className="mx-auto mt-1 max-w-[300px] text-[11px] leading-5 text-zinc-500 kurdish-text sm:text-xs sm:leading-6">
            هەژمارەکەت تەواو نییە. تکایە خانە پێویستەکان پڕ بکەرەوە بۆ بەکارهێنانی CinemaChat.
          </p>
          {missing.size > 0 && (
            <div className="mx-auto mt-2 flex max-w-[300px] flex-wrap items-center justify-center gap-1.5">
              {readiness.missingFields.map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-black text-amber-300 kurdish-text"
                >
                  {missingFieldLabel(field)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-5">
          <form onSubmit={doSave} className="space-y-2.5 sm:space-y-3">
            <FloatingField
              id="complete-name"
              label="ناوی تەواو"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="name"
              invalid={missing.has("displayName")}
            />
            <FloatingField
              id="complete-username"
              label="ناوی بەکارهێنەر (Username)"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              dir="ltr"
              invalid={missing.has("username")}
            />
            <FloatingField
              id="complete-phone"
              label="ژمارەی مۆبایل"
              value={phone}
              onChange={setPhone}
              type="tel"
              autoComplete="tel"
              dir="ltr"
              invalid={missing.has("identity")}
            />
            <FloatingField
              id="complete-email"
              label="ئیمەیڵ"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              dir="ltr"
              invalid={missing.has("identity")}
            />

            {recommended.size > 0 && (
              <div className="rounded-xl border border-sky-500/15 bg-sky-500/5 px-3 py-2 text-[10px] leading-5 text-sky-300/90 kurdish-text sm:rounded-2xl sm:text-[11px]">
                <p className="font-black">زانیاری پێشنیارکراو (بەدڵی خۆت):</p>
                <p>
                  ئەم خانانە پێویست نین، بەڵام پڕکردنەوەیان وێنەی بەکارهێنەر و
                  پەیوەندییەکانت زیاتر تەواو دەکات — تەمەن و ناونیشان.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <FloatingField
                id="complete-age"
                label="تەمەن (پێشنیارکراو)"
                value={age}
                onChange={setAge}
                type="number"
                autoComplete="age"
                dir="ltr"
                invalid={recommended.has("age")}
              />
              <FloatingField
                id="complete-address"
                label="ناونیشان (پێشنیارکراو)"
                value={address}
                onChange={setAddress}
                type="text"
                autoComplete="street-address"
                invalid={recommended.has("address")}
              />
            </div>

            {getPublicMemberCode(profile, currentUser?.uid) && (
              <p className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-2.5 text-center text-[11px] font-bold leading-5 text-emerald-300 kurdish-text sm:rounded-2xl sm:p-3">
                <CheckCircle2 className="mb-0.5 inline h-3.5 w-3.5" /> CC-ID:{" "}
                <span className="font-mono">{getPublicMemberCode(profile, currentUser?.uid)}</span>
              </p>
            )}

            {error && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-bold leading-5 text-red-300 kurdish-text sm:rounded-2xl">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 kurdish-text sm:h-12 sm:rounded-2xl"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              پاشەکەوتکردن و بەردەوامی
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CompleteAccountModal;
