/** Kept outside the filtered media subtree so the family notice stays readable. */
export function SceneBlurNotice({ active }: { active: boolean }) {
  if (!active) return null;
  return <div data-testid="scene-blur-notice" role="status" dir="rtl" lang="ckb"
    className="pointer-events-none absolute inset-0 z-[44] flex items-center justify-center bg-black/95 px-6 py-20 text-center text-white">
    <div className="max-w-xl space-y-3 kurdish-text">
      <span dir="ltr" className="inline-block rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-1 text-sm font-black text-amber-200">+١٨</span>
      <p className="text-sm font-bold leading-7 sm:text-base sm:leading-8">
        ئێمە چاودێری دیمەنی نەشیاو دەکەین بۆ شاردنەوەی لەبەر خێزان و منداڵان.
        تکایە تۆش هاوکار بە؛ هەرکات دیمەنێکی نەشیاوت بینی، لە وەتسئەپەکەمان ئاگادارمان بکەرەوە.
      </p>
    </div>
  </div>;
}
