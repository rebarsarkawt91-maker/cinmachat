import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Loader2,
  Save,
  User,
  X,
} from "lucide-react";
import { db, collection, getDocs, query, orderBy, limit } from "../../lib/firebase";
import { useSocialAuth } from "../../context/SocialAuthContext";
import { AccountReadiness, MissingAccountField } from "../../services/accountReadiness";
import {
  cleanProfilePhone,
  getPublicMemberCode,
  isValidProfilePhone,
  normalizeProfilePhone,
  profileDisplayValue,
} from "../../services/socialProfileProvisioning";
import { FALLBACK_POSTER } from "../Movie/MovieCard";

/**
 * Complete-Account modal for CinemaChat — 4-step onboarding wizard.
 *
 *   STEP 1  PROFILE     — required fields (name, username, phone, email)
 *   STEP 2  DETAILS     — recommended fields (age, address)
 *   STEP 3  MOVIE       — browse & select a movie / watch-party preference
 *   STEP 4  SUMMARY     — review all choices and save
 *
 * Shown when the account readiness gate reports `authenticated-incomplete`.
 * On success the shared SocialAuthContext recomputes readiness, the gate flips
 * to READY and the CinemaChat flow continues without a reload.
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

const STEPS = [
  { n: 1, label: "Profile", labelKu: "پرۆفایل" },
  { n: 2, label: "Details", labelKu: "وردەکاری" },
  { n: 3, label: "Movie", labelKu: "فیلم" },
  { n: 4, label: "Summary", labelKu: "کورتە" },
] as const;

/** Minimal movie shape fetched from Firestore for the selection grid. */
interface MovieOption {
  id: string;
  title: string;
  image: string;
  rating?: string;
  tags?: string[];
}

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

// ---------------------------------------------------------------------------
// Step indicator footer — shared between all 4 steps
// ---------------------------------------------------------------------------
const StepIndicator: React.FC<{ currentStep: number }> = ({ currentStep }) => (
  <div className="shrink-0 border-t border-white/10 bg-black/30 px-4 py-2.5 sm:px-5 sm:py-3">
    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
      {STEPS.map((step) => {
        const active = step.n === currentStep;
        const done = step.n < currentStep;
        return (
          <div
            key={step.n}
            className={`h-8 rounded-lg border flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider transition-all sm:h-9 sm:rounded-xl sm:gap-2 sm:text-[10px] ${
              active
                ? "bg-brand-primary text-white border-brand-primary"
                : done
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                  : "bg-white/5 text-gray-500 border-white/10"
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-black/25 flex items-center justify-center text-[9px] sm:w-5 sm:h-5 sm:text-[10px]">
              {done ? <CheckCircle2 className="w-3 h-3" /> : step.n}
            </span>
            <span className="hidden sm:inline">{step.label}</span>
          </div>
        );
      })}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const CompleteAccountModal: React.FC<CompleteAccountModalProps> = ({
  open,
  onClose,
  readiness,
}) => {
  const { currentUser, socialProfile, updateSocialProfile } = useSocialAuth();

  // ---- wizard state ----
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);

  // ---- profile fields (Step 1) ----
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // ---- recommended fields (Step 2) ----
  const [age, setAge] = useState("");
  const [address, setAddress] = useState("");

  // ---- movie selection (Step 3) ----
  const [movieOptions, setMovieOptions] = useState<MovieOption[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<string>("");

  const profile = socialProfile;
  const missing = useMemo(() => new Set(readiness.missingFields), [readiness]);
  const recommended = useMemo(
    () => new Set(readiness.recommendedMissingFields),
    [readiness],
  );

  // ---- pre-fill on open ----
  useEffect(() => {
    if (!open) return;
    setCurrentStep(1);
    setError(null);
    setDisplayName(profileDisplayValue(profile?.displayName || profile?.name, ""));
    setUsername(cleanProfileText(profile?.username, 32));
    setPhone(cleanProfilePhone(profile?.phoneNumber || profile?.phone));
    setEmail(cleanProfileText(profile?.email, 120));
    setAge(cleanProfileText(String(profile?.age ?? ""), 3));
    setAddress(cleanProfileText(profile?.address, 200));
    setSelectedMovie(cleanProfileText(profile?.moviePreference, 200));
  }, [open, profile]);

  // ---- fetch movies when reaching step 3 ----
  useEffect(() => {
    if (currentStep !== 3 || movieOptions.length > 0) return;
    let cancelled = false;
    (async () => {
      setMoviesLoading(true);
      try {
        const q = query(
          collection(db, "movies"),
          orderBy("date", "desc"),
          limit(24),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const list: MovieOption[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as any;
          list.push({
            id: doc.id,
            title: d.title || "Untitled",
            image: d.image || FALLBACK_POSTER,
            rating: d.rating,
            tags: d.tags,
          });
        });
        setMovieOptions(list);
      } catch {
        // Movies fetch is best-effort; grid stays empty.
      } finally {
        if (!cancelled) setMoviesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStep, movieOptions.length]);

  useEffect(() => {
    if (!focusRef.current) return;
    const el = document.getElementById(focusRef.current);
    if (el) (el as HTMLInputElement).focus();
    focusRef.current = null;
  }, [error, currentStep]);

  if (!open) return null;

  // ---- step validation ----
  const validateStep1 = (): string | null => {
    const trimmedName = cleanProfileText(displayName, 60);
    const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    const normalizedPhone = normalizeProfilePhone(phone);
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) return "تکایە ناوێک بنووسە.";
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(trimmedUsername))
      return "ناوی بەکارهێنەرەکە نادروستە؛ دەبێت لە ٣ بۆ ٣٢ پیتی ئینگلیزی، ژمارە، یان (. _ -) پێکهاتبێت.";
    const hasPhone = !!normalizedPhone;
    const hasEmail = !!trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!hasPhone && !hasEmail)
      return "تکایە ئیمەیڵێک یان ژمارەی مۆبایلێکی دروست بنووسە بۆ ناسینەوە.";
    return null;
  };

  const validateStep2 = (): string | null => {
    const trimmedAge = age.trim();
    if (trimmedAge && !/^\d{1,3}$/.test(trimmedAge))
      return "تەمەن دەبێت ژمارەیەک بێت.";
    const ageNumber = trimmedAge ? Number(trimmedAge) : 0;
    if (trimmedAge && (ageNumber < 13 || ageNumber > 120))
      return "تەمەن دەبێت لە نێوان ١٣ و ١٢٠ بێت.";
    return null;
  };

  const goNext = () => {
    setError(null);
    if (currentStep === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (currentStep === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    setCurrentStep((s) => Math.min(s + 1, 4));
  };

  const goBack = () => {
    setError(null);
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  // ---- save (called from step 4) ----
  const doSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    const trimmedName = cleanProfileText(displayName, 60);
    const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    const normalizedPhone = normalizeProfilePhone(phone);
    const trimmedEmail = email.trim().toLowerCase();

    const hasPhone = !!normalizedPhone;
    const hasEmail = !!trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

    const trimmedAge = age.trim();
    const trimmedAddress = cleanProfileText(address, 200);
    const ageNumber = trimmedAge ? Number(trimmedAge) : 0;

    try {
      await updateSocialProfile({
        displayName: trimmedName,
        username: trimmedUsername,
        ...(hasPhone ? { phoneNumber: normalizedPhone } : {}),
        ...(hasEmail ? { email: trimmedEmail } : {}),
        ...(trimmedAge ? { age: String(ageNumber) } : {}),
        ...(trimmedAddress ? { address: trimmedAddress } : {}),
        ...(selectedMovie ? { moviePreference: selectedMovie } : {}),
      });
      onClose();
    } catch (err: any) {
      const msg = err?.message || "پاشەکەوتکردن سەرکەوتوو نەبوو؛ دووبارە هەوڵبدەرەوە.";
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  };

  // ---- step content renderers ----
  const renderStep1 = () => (
    <div className="space-y-2.5 sm:space-y-3">
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
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-2.5 sm:space-y-3">
      <div className="rounded-xl border border-sky-500/15 bg-sky-500/5 px-3 py-2 text-[10px] leading-5 text-sky-300/90 kurdish-text sm:rounded-2xl sm:text-[11px]">
        <p className="font-black">زانیاری پێشنیارکراو (بەدڵی خۆت):</p>
        <p>
          ئەم خانانە پێویست نین، بەڵام پڕکردنەوەیان وێنەی بەکارهێنەر و
          پەیوەندییەکانت زیاتر تەواو دەکات — تەمەن و ناونیشان.
        </p>
      </div>
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
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-400 kurdish-text leading-relaxed sm:text-xs">
        فیلمێک یان بوارێک هەلبژێرە بۆ دانیشتنی یەکەم جار — دەتوانیت دووبارە بگۆڕیتەوە.
      </p>

      {moviesLoading && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />
          <p className="text-[10px] text-zinc-500 kurdish-text">لێرەدانی فیلمەکان...</p>
        </div>
      )}

      {!moviesLoading && movieOptions.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Film className="w-8 h-8 text-zinc-600" />
          <p className="text-[11px] text-zinc-500 kurdish-text">
            فیلمێک نەدۆزرایەوە — دەتوانیت بەردەوام بیت بەبێ هەڵبژاردن.
          </p>
        </div>
      )}

      {!moviesLoading && movieOptions.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5">
          {movieOptions.map((movie) => {
            const isSelected = selectedMovie === movie.title;
            return (
              <button
                key={movie.id}
                type="button"
                onClick={() => setSelectedMovie(isSelected ? "" : movie.title)}
                className={`group relative overflow-hidden rounded-xl border transition-all sm:rounded-2xl ${
                  isSelected
                    ? "border-brand-primary ring-2 ring-brand-primary/40 scale-[1.03]"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <div className="aspect-[2/3] w-full overflow-hidden bg-white/5">
                  <img
                    src={movie.image || FALLBACK_POSTER}
                    alt={movie.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <CheckCircle2 className="w-6 h-6 text-brand-primary drop-shadow-lg" />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4">
                  <p className="text-[8px] font-black text-white truncate leading-tight sm:text-[9px]">
                    {movie.title}
                  </p>
                  {movie.rating && (
                    <p className="text-[7px] text-amber-300 font-bold sm:text-[8px]">
                      ★ {movie.rating}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedMovie && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-primary/25 bg-brand-primary/5 px-3 py-2">
          <Clapperboard className="w-4 h-4 text-brand-primary shrink-0" />
          <p className="text-[11px] font-bold text-white kurdish-text truncate">
            هەڵبژاردن: <span className="text-brand-primary">{selectedMovie}</span>
          </p>
          <button
            type="button"
            onClick={() => setSelectedMovie("")}
            className="ml-auto shrink-0 text-zinc-500 hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!selectedMovie && !moviesLoading && movieOptions.length > 0 && (
        <p className="text-center text-[10px] text-zinc-600 kurdish-text">
          هەڵبژاردن ئیختیارییە — دەتوانیت بەردەوام بیت.
        </p>
      )}
    </div>
  );

  const renderStep4 = () => {
    const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    const normalizedPhone = normalizeProfilePhone(phone);
    const trimmedEmail = email.trim().toLowerCase();
    const memberCode = getPublicMemberCode(profile, currentUser?.uid);

    const summaryItems: Array<{ label: string; value: string; highlight?: boolean }> = [
      { label: "ناو", value: cleanProfileText(displayName, 60) || "—" },
      { label: "Username", value: trimmedUsername || "—" },
    ];
    if (normalizedPhone) summaryItems.push({ label: "مۆبایل", value: normalizedPhone });
    if (trimmedEmail) summaryItems.push({ label: "ئیمەیڵ", value: trimmedEmail });
    if (age.trim()) summaryItems.push({ label: "تەمەن", value: age.trim() });
    if (cleanProfileText(address, 200)) summaryItems.push({ label: "ناونیشان", value: cleanProfileText(address, 200) });
    if (selectedMovie) summaryItems.push({ label: "فیلم", value: selectedMovie, highlight: true });

    return (
      <div className="space-y-3">
        <p className="text-[11px] text-zinc-400 kurdish-text leading-relaxed sm:text-xs">
          پێشوو پڕکردنەوەی زانیارییەکانت بڵێ — پاشەکەوت بکە بۆ بەردەوامبوون.
        </p>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          {summaryItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[10px] font-bold text-zinc-500 kurdish-text sm:text-[11px]">
                {item.label}
              </span>
              <span
                className={`text-[11px] font-bold text-right truncate max-w-[60%] ${
                  item.highlight ? "text-brand-primary" : "text-white"
                }`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {memberCode && (
          <p className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-2.5 text-center text-[11px] font-bold leading-5 text-emerald-300 kurdish-text sm:rounded-2xl">
            <CheckCircle2 className="mb-0.5 inline h-3.5 w-3.5" /> CC-ID:{" "}
            <span className="font-mono">{memberCode}</span>
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-bold leading-5 text-red-300 kurdish-text sm:rounded-2xl">
            {error}
          </p>
        )}
      </div>
    );
  };

  const stepTitles: Record<number, { en: string; ku: string }> = {
    1: { en: "Profile", ku: "پرۆفایل" },
    2: { en: "Details", ku: "وردەکاری" },
    3: { en: "Movie", ku: "هەڵبژاردنی فیلم" },
    4: { en: "Summary", ku: "کورتە و پاشەکەوت" },
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/90 px-2 py-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-account-title"
        className="my-auto flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-[min(94vw,430px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] text-right shadow-2xl shadow-black/60 sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-3xl"
      >
        {/* ---- header ---- */}
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
            {stepTitles[currentStep].ku}
          </p>
          {currentStep === 1 && missing.size > 0 && (
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

        {/* ---- step body ---- */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-5">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>

        {/* ---- navigation buttons ---- */}
        <div className="shrink-0 border-t border-white/10 bg-black/20 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={goBack}
                disabled={saving}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50 sm:h-12 sm:rounded-2xl"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="kurdish-text">باڕگەڕان</span>
              </button>
            )}

            <div className="flex-1" />

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 sm:h-12 sm:rounded-2xl"
              >
                <span className="kurdish-text">بەردەوامبوون</span>
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={doSave}
                disabled={saving}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 sm:h-12 sm:rounded-2xl"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="kurdish-text">پاشەکەوتکردن و بەردەوامی</span>
              </button>
            )}
          </div>
        </div>

        {/* ---- step indicator footer ---- */}
        <StepIndicator currentStep={currentStep} />
      </div>
    </div>,
    document.body,
  );
};

export default CompleteAccountModal;
