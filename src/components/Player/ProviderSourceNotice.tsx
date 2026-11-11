import React from "react";
import { usesProviderTouchControls } from "../../utils/playerControls";

interface ProviderSourceNoticeProps {
  url: string | null | undefined;
}

/** Source guidance only; external verification requirements can change. */
export function ProviderSourceNotice({ url }: ProviderSourceNoticeProps) {
  if (!usesProviderTouchControls(url)) return null;

  return (
    <span
      role="note"
      dir="rtl"
      className="block rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] font-medium leading-6 text-amber-200 kurdish-text"
    >
      ئەم سەرچاوە دەرەکییە هەندێک جار داوای پشتڕاستکردنەوەی مرۆڤ دەکات.
      بۆ پەخشکردن بەبێ هەنگاوی زیادە، لینکی ڕاستەوخۆی MP4/HLS ـی ڕێگەپێدراو
      یان سەرچاوەیەکی تر بەکاربهێنە کە پشتڕاستکردنەوەی پێویست نییە.
    </span>
  );
}

export default ProviderSourceNotice;
