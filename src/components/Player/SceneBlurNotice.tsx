/** Kept outside the filtered media subtree so the family notice stays readable. */
export function SceneBlurNotice({ active }: { active: boolean }) {
  if (!active) return null;
  return <div data-testid="scene-blur-notice" role="status" dir="rtl" lang="ckb"
    className="pointer-events-none absolute inset-0 z-[44] flex items-center justify-center bg-black/35 px-6 py-20 text-center text-white backdrop-blur-[48px]">
    <div className="max-w-xl space-y-3 kurdish-text">
      <span dir="ltr" className="inline-block rounded-3xl border border-red-500/40 bg-red-950/30 px-6 py-3 text-5xl font-black leading-none text-red-500 sm:text-7xl">+١٨</span>
      <p className="text-sm font-bold leading-7 sm:text-base sm:leading-8">
        ئێمە چاودێری دیمەنی نەشیاو دەکەین بۆ شاردنەوەی لەبەر خێزان و منداڵان.
        تکایە تۆش هاوکار بە؛ هەرکات دیمەنێکی نەشیاوت بینی، لە وەتسئەپەکەمان ئاگادارمان بکەرەوە.
      </p>
    </div>
  </div>;
}
