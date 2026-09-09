/**
 * CinemaChat floating push-notification bell + preferences panel.
 *
 * Rendered as a fixed horizontal sibling of the floating install button and
 * only when the browser actually supports Web Push. It never auto-prompts:
 * the panel explains the state and every subscribe call runs inside the user
 * gesture triggered by the bell itself.
 */

import React, { useId } from "react";
import { Bell, BellRing, Loader2, X } from "lucide-react";
import { usePush } from "../../pwa/PushProvider";
import { PUSH_PREFERENCE_KEYS, type PushPreferences } from "../../lib/webPushShared";

const PREFERENCE_LABELS: Record<keyof PushPreferences, string> = {
  newMovies: "فیلمی نوێ",
  newTrailers: "ترەیلەری نوێ",
  announcements: "ئاگاداری تایبەت",
};

function Switch({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition ${
        value ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/5 bg-white/[0.02]"
      } ${disabled ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
    >
      <span className="text-xs font-black text-white kurdish-text">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          value ? "bg-emerald-500 border-emerald-400" : "bg-white/10 border-white/20"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </button>
    </label>
  );
}

export function PushBellButton() {
  const {
    bell,
    pushSupported,
    panelOpen,
    openPanel,
    closePanel,
    preferences,
    masterEnabled,
    ioSGuideRequired,
    awaitingSignIn,
    permission,
    subscribed,
    updatePreference,
    toggleMaster,
    disablePush,
    handleBellClick,
  } = usePush();
  const panelId = useId();

  if (!pushSupported) return null;

  const isActive = bell === "subscribed";
  const label =
    bell === "denied"
      ? "ڕێگە بە نۆتیفیکەیشن نەدراوە؛ لە ڕێکخستنەکانی وێبگەڕە چالاکی بکە"
      : isActive
        ? "ڕێکخستنەکانی نۆتیفیکەیشن"
        : "چالاککردنی نۆتیفیکەیشن";

  return (
    <>
      <button
        type="button"
        onClick={handleBellClick}
        aria-label={label}
        aria-expanded={panelOpen}
        aria-controls={panelId}
        title={label}
        className={`fixed bottom-[7.9rem] left-[4.5rem] z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-xl shadow-red-950/30 transition hover:bg-opacity-90 ${
          isActive
            ? "border-emerald-500/50 bg-emerald-600 text-white"
            : "border-red-500/45 bg-[#15171c] text-white hover:border-red-400 hover:bg-red-600"
        }`}
      >
        {bell === "busy" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isActive ? (
          <BellRing className="h-5 w-5" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
      </button>

      {panelOpen && (
        <div
          id={panelId}
          dir="rtl"
          className="fixed inset-0 z-[70] flex items-end justify-start p-3 sm:items-center sm:p-6"
        >
          <button
            type="button"
            aria-label="داخستنی پانێڵ"
            className="absolute inset-0 bg-black/60"
            onClick={closePanel}
          />
          <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/10 bg-[#111318] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-black text-white kurdish-text">ئاگادارکردنەوەکان</h2>
              <button
                type="button"
                onClick={closePanel}
                aria-label="داخستن"
                className="rounded-full border border-white/10 p-1.5 text-gray-300 transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {awaitingSignIn && (
                <p className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-7 text-gray-300">
                  بچۆ ژوورەوە بۆ چالاککردنی نۆتیفیکەیشنەکانی
                  <b className="mx-1 text-white">فیلمی نوێ</b>،
                  <b className="mx-1 text-white">ترەیلەری نوێ</b> و
                  <b className="mx-1 text-white">ئاگاداری تایبەت</b>.
                </p>
              )}

              {!awaitingSignIn && ioSGuideRequired && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-7 text-gray-300">
                  <p>نۆتیفیکەیشن لەسەر iPhone/iPad تەنها لە دوای ئەوەی ئەپەکە بۆ Home Screen زیاد بکەیت کاردەکات.</p>
                  <ol className="mt-3 list-decimal space-y-2 pr-4">
                    <li>دوگمەی <b className="text-red-400">Share ⬆</b> لە خوارەوە بکە.</li>
                    <li><b>Add to Home Screen</b> هەڵبژێرە.</li>
                    <li>دواتر بگەڕێوە و ئەم دوگمەیە بکە بۆ چالاککردن.</li>
                  </ol>
                </div>
              )}

              {!awaitingSignIn && !ioSGuideRequired && permission === "denied" && (
                <p className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm leading-7 text-gray-300">
                  ڕێگە بە نۆتیفیکەیشن نەدراوە. بۆ چالاککردنەوە لە
                  <b className="mx-1 text-white">ڕێکخستنەکانی وێبگەڕەکەت</b>
                  ڕێگەپێدانی ئاگادارکردنەوە بدە بەم سایتە، پاشان دوگمەی زەنگەکە بکە.
                </p>
              )}

              {!awaitingSignIn && !ioSGuideRequired && permission !== "denied" && !subscribed && (
                <div className="space-y-3">
                  <p className="text-sm leading-7 text-gray-300">
                    هەر کە فیلم یان ترەیلەری نوێ بڵاو بکرێتەوە یان ئاگاداری تایبەت هەبێت،
                    سایتەکە نۆتیفیکەیشنت بۆ دەنێرێت.
                  </p>
                  <button
                    type="button"
                    onClick={handleBellClick}
                    className="w-full rounded-2xl bg-[#e50914] px-4 py-3 text-sm font-black text-white transition hover:bg-red-600"
                  >
                    چالاککردنی نۆتیفیکەیشن
                  </button>
                </div>
              )}

              {!awaitingSignIn && !ioSGuideRequired && permission !== "denied" && subscribed && (
                <>
                  <Switch
                    label={masterEnabled ? "نۆتیفیکەیشن چالاکە" : "نۆتیفیکەیشن ناچالاکە"}
                    value={masterEnabled}
                    onChange={toggleMaster}
                  />
                  {PUSH_PREFERENCE_KEYS.map((key) => (
                    <Switch
                      key={key}
                      label={PREFERENCE_LABELS[key]}
                      value={preferences[key]}
                      disabled={!masterEnabled}
                      onChange={(next) => updatePreference(key, next)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => void disablePush()}
                    className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-gray-300 transition hover:border-red-500/40 hover:text-red-400"
                  >
                    ناچالاککردنی بۆ ئەم ئامێرە
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}