import { useId, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { BANNER_IMAGE_MAX_BYTES, validBannerImage } from '../../utils/bannerImage';

/** Isolated banner-only editor. Cancel/preview never writes site configuration. */
export function BannerImageEditModal({ image, onSave, onClose }: {
  image: string; onSave: (image: string) => Promise<void>; onClose: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(image);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  return <div className="fixed inset-0 z-[100200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby={id}>
    <form dir="rtl" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-red-500/30 bg-[#101014] p-5 text-white kurdish-text"
      onSubmit={async event => {
        event.preventDefault();
        if (saving || reading) return;
        const image = draft.trim();
        if (!validBannerImage(image)) { setError('لینکی HTTPS یان وێنەی PNG/JPEG/WEBP تا ٥٠٠ KB دابنێ.'); return; }
        setSaving(true); setError('');
        try { await onSave(image); onClose(); }
        catch (error) { setError(error instanceof Error ? error.message : 'پاشەکەوتکردن سەرکەوتوو نەبوو'); }
        finally { setSaving(false); }
      }}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={id} className="font-black">گۆڕینی وێنەی بانەر</h2>
        <button type="button" onClick={onClose} disabled={saving} aria-label="داخستن" className="rounded-lg border border-white/20 p-2 disabled:opacity-50"><X className="h-4 w-4" /></button>
      </div>
      <label className="block text-sm font-bold">لینکی وێنە (HTTPS)
        <input value={draft.startsWith('data:') ? '' : draft} disabled={saving || reading} dir="ltr" type="text" inputMode="url" placeholder="https://..."
          onChange={event => { setDraft(event.target.value); setError(''); }} className="mt-2 w-full rounded-lg border border-white/20 bg-black p-3 text-sm" />
      </label>
      <label className="mt-4 block text-sm font-bold">یان وێنەیەک هەڵبژێرە (تا ٥٠٠ KB)
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving || reading} className="mt-2 block w-full text-xs"
          onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (file.size > BANNER_IMAGE_MAX_BYTES) { setError('وێنەکە دەبێت لە ٥٠٠ KB بچووکتر بێت.'); return; }
            setReading(true); setError('');
            try {
              const value = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('نەتوانرا وێنەکە بخوێندرێتەوە')); reader.readAsDataURL(file); });
              if (!validBannerImage(value)) throw new Error('تەنها وێنەی PNG، JPEG یان WEBP ڕێگەپێدراوە.');
              setDraft(value);
            } catch (error) { setError(error instanceof Error ? error.message : 'نەتوانرا وێنەکە بخوێندرێتەوە'); }
            finally { setReading(false); }
          }} />
      </label>
      {validBannerImage(draft.trim()) && <img src={draft.trim()} alt="پێشبینینی وێنەی بانەر" className="mt-4 max-h-48 w-full rounded-lg object-contain" />}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-white/20 px-4 py-2">پاشگەزبوونەوە</button>
        <button type="submit" disabled={saving || reading || !validBannerImage(draft.trim())} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-bold disabled:opacity-50">
          {saving || reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} پاشەکەوتکردن
        </button>
      </div>
    </form>
  </div>;
}
