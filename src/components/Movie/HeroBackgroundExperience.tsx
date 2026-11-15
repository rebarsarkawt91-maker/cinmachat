import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { resolveApiUrl } from '../../services/backendConfig';
import {
  DEFAULT_HERO_BACKGROUND, HERO_BACKGROUND_IMAGE_MAX_BYTES, HERO_BACKGROUND_IMAGE_PATH,
  parseHeroBackground, type HeroBackgroundSettings,
} from '../../utils/heroBackground';
import { HeroBackgroundLayer, HERO_BACKGROUND_PRESETS } from './HeroBackgroundLayer';
import '../../styles/heroBackgroundControls.css';

const PREFERENCE_KEY = 'cinemachat.hero.background';
type Media = NonNullable<HeroBackgroundSettings['media']>;

function readPreference(): number | null {
  try {
    const value = Number(localStorage.getItem(PREFERENCE_KEY));
    return parseHeroBackground({ mode: value })?.mode ?? null;
  } catch { return null; }
}

function resolveMediaUrl(url: string) {
  return url.startsWith(HERO_BACKGROUND_IMAGE_PATH) ? resolveApiUrl(url) : url;
}

function VideoBackdrop({ url, onError }: { url: string; onError: () => void }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = typeof IntersectionObserver === 'undefined';
    let disposed = false;
    const update = () => {
      if (!inView || document.hidden || reducedMotion.matches) {
        element.pause();
      } else {
        void element.play().then(() => {
          if (disposed || !inView || document.hidden || reducedMotion.matches) element.pause();
        }).catch(() => {});
      }
    };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      update();
    });
    observer?.observe(element);
    reducedMotion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      disposed = true;
      observer?.disconnect();
      reducedMotion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      element.pause();
    };
  }, [url]);

  return <video ref={video} className="hero-bg-media" src={url} aria-hidden="true"
    muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback
    onTimeUpdate={event => { event.currentTarget.dataset.playing = 'true'; }} onError={onError} />;
}

function MediaBackdrop({ media, onMediaFailure }: {
  media: Media;
  onMediaFailure?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fail = () => { setFailed(true); onMediaFailure?.(); };
  if (failed) return null;
  return media.kind === 'image'
    ? <img className="hero-bg-media" data-playing={ready} src={resolveMediaUrl(media.url)}
        alt="" aria-hidden="true" referrerPolicy="no-referrer" decoding="async"
        onLoad={() => setReady(true)} onError={fail} />
    : <VideoBackdrop url={resolveMediaUrl(media.url)} onError={fail} />;
}

function Backdrop({ setting, onMediaFailure }: {
  setting: HeroBackgroundSettings;
  onMediaFailure?: () => void;
}) {
  return <>
    <HeroBackgroundLayer mode={setting.mode} />
    {setting.media && <MediaBackdrop key={`${setting.media.kind}|${setting.media.url}`}
      media={setting.media} onMediaFailure={onMediaFailure} />}
  </>;
}

function Swatches({ mode, onSelect }: { mode?: number; onSelect: (mode: number) => void }) {
  return HERO_BACKGROUND_PRESETS.map(item => (
    <button key={item.id} type="button" className="hero-bg-swatch"
      data-mode={item.id} aria-label={`${item.id}. ${item.label}`} aria-pressed={mode === item.id}
      title={item.label} onClick={() => onSelect(item.id)}
      style={{ '--hero-swatch': item.swatch } as CSSProperties}>
      <span aria-hidden="true" />
    </button>
  ));
}

function BackgroundDialog({ initial, personalMode, canManage, save, select, onDismiss }: {
  initial: HeroBackgroundSettings;
  personalMode: number | null;
  canManage: boolean;
  save: (value: HeroBackgroundSettings) => Promise<void>;
  select: (mode: number | null) => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState(personalMode ?? initial.mode);
  const [kind, setKind] = useState<Media['kind'] | ''>(initial.media?.kind ?? '');
  const [url, setUrl] = useState(initial.media?.url ?? '');
  const [preview, setPreview] = useState<Media | undefined>(personalMode === null ? initial.media : undefined);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState('');
  const [badMedia, setBadMedia] = useState(false);
  const close = () => dialog.current?.close();

  useEffect(() => { dialog.current?.showModal(); }, []);

  function selectMode(value: number) {
    setMode(value);
    setPreview(undefined);
    setBadMedia(false);
  }

  function readDraft() {
    const value = parseHeroBackground(kind ? { mode, media: { kind, url: url.trim() } } : { mode });
    if (!value) setProblem('لینکی ڕاستەوخۆی HTTPS یان وێنەیەکی دروست دابنێ.');
    return value;
  }

  return (
    <dialog ref={dialog} className="hero-bg-dialog kurdish-text" dir="rtl" lang="ckb"
      aria-labelledby="hero-bg-title" onClose={onDismiss} onCancel={event => {
        if (saving) event.preventDefault();
      }}>
      <div className="hero-bg-dialog__heading">
        <h2 id="hero-bg-title">باگراوندی سینەما</h2>
        <button type="button" onClick={close} disabled={saving} className="hero-bg-action" aria-label="داخستن"><X size={18} /></button>
      </div>
      <div className="hero-bg-preview">
        <Backdrop setting={{ mode, media: preview }} onMediaFailure={() => setBadMedia(true)} />
      </div>
      {badMedia && <p role="status" className="hero-bg-error">وێنە یان ڤیدیۆکە بار نەبوو. لینکەکە بپشکنە.</p>}
      <div className="hero-bg-dialog__swatches" dir="ltr" role="group" aria-label="٢٠ مۆدی باگراوند">
        <Swatches mode={mode} onSelect={selectMode} />
      </div>
      <div className="hero-bg-personal">
        <button type="button" className="hero-bg-action hero-bg-action--primary" onClick={() => { select(mode); close(); }} disabled={saving}>بۆ خۆم هەڵیبژێرە</button>
        <button type="button" className="hero-bg-action" onClick={() => { select(null); close(); }} disabled={saving}>باگراوندی سایت</button>
      </div>
      {canManage && <form className="hero-bg-admin" onSubmit={async event => {
        event.preventDefault();
        setProblem('');
        const value = readDraft();
        if (!value || saving || reading) return;
        setSaving(true);
        try { await save(value); close(); }
        catch (error) { setProblem(error instanceof Error ? error.message : 'پاشەکەوتکردن سەرکەوتوو نەبوو.'); }
        finally { setSaving(false); }
      }}>
        <h3>باگراوند بۆ هەموو بینەران</h3>
        <div className="hero-bg-media-options" role="group" aria-label="جۆری باگراوند">
          {([['', 'مۆد'], ['image', 'وێنە'], ['video', 'ڤیدیۆ']] as const).map(([value, label]) => (
            <button type="button" key={label} className="hero-bg-action"
              disabled={saving || reading} aria-pressed={kind === value}
              onClick={() => {
                if (kind === value) return;
                setKind(value); setUrl(''); setPreview(undefined); setProblem(''); setBadMedia(false);
              }}>{label}</button>
          ))}
        </div>
        {kind && <label className="hero-bg-field">
          {kind === 'image' ? 'لینکی وێنە' : 'لینکی ڕاستەوخۆی ڤیدیۆ (MP4 / WebM)'}
          <input type="text" dir="ltr" inputMode="url" autoComplete="off" placeholder="https://…"
            disabled={saving || reading} value={url.startsWith('data:') ? '' : url}
            onChange={event => { setUrl(event.target.value); setProblem(''); }} />
        </label>}
        {kind === 'image' && <label className="hero-bg-field">
          بارکردنی وێنە (PNG، JPG، WebP تا ٥٠٠ KB)
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving || reading}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > HERO_BACKGROUND_IMAGE_MAX_BYTES) { setProblem('وێنەکە دەبێت ٥٠٠ KB یان کەمتر بێت.'); return; }
              setReading(true); setProblem('');
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = parseHeroBackground({ mode, media: { kind: 'image', url: reader.result } });
                setReading(false);
                if (!result?.media) { setProblem('وێنەکە دروست نییە یان نەتوانرا بخوێندرێتەوە.'); return; }
                setUrl(result.media.url); setPreview(result.media); setBadMedia(false);
              };
              reader.readAsDataURL(file);
            }} />
        </label>}
        {problem && <p role="alert" className="hero-bg-error">{problem}</p>}
        <div className="hero-bg-personal">
          {kind && <button type="button" className="hero-bg-action" disabled={saving || reading}
            onClick={() => {
              setProblem('');
              const value = readDraft();
              if (value) { setBadMedia(false); setPreview(value.media); }
            }}>پێشبینین</button>}
          <button type="submit" className="hero-bg-action hero-bg-action--primary"
            disabled={saving || reading}>{saving ? 'پاشەکەوت دەکرێت…' : 'پاشەکەوت بۆ هەمووان'}</button>
        </div>
      </form>}
    </dialog>
  );
}

export function HeroBackgroundExperience({ siteSetting, saveGlobalSetting, children }: {
  siteSetting: unknown;
  saveGlobalSetting?: (value: HeroBackgroundSettings) => Promise<void>;
  children: (layers: { backdrop: ReactNode; controls: ReactNode }) => ReactNode;
}) {
  const global = parseHeroBackground(siteSetting) ?? DEFAULT_HERO_BACKGROUND;
  const [personalMode, setPersonalMode] = useState(readPreference);
  const [open, setOpen] = useState(false);
  const active = personalMode === null ? global : { mode: personalMode };

  function select(mode: number | null) {
    setPersonalMode(mode);
    try {
      if (mode === null) localStorage.removeItem(PREFERENCE_KEY);
      else localStorage.setItem(PREFERENCE_KEY, String(mode));
    } catch { /* The setting remains active for this session. */ }
  }

  return <>
    {children({
      backdrop: open ? null : <Backdrop setting={active} />,
      controls: <>
        <div className="hero-bg-quick" dir="ltr" role="group" aria-label="مۆدەکانی باگراوند">
          <Swatches mode={active.media ? undefined : active.mode} onSelect={select} />
        </div>
        <button type="button" className="hero-bg-trigger kurdish-text" dir="rtl" onClick={() => setOpen(true)}
          aria-label="گۆڕینی باگراوند" aria-haspopup="dialog" title="گۆڕینی باگراوند">
          <ImageIcon size={15} aria-hidden="true" /><span>باگراوند</span>
        </button>
      </>,
    })}
    {open && <BackgroundDialog initial={global} personalMode={personalMode} canManage={Boolean(saveGlobalSetting)}
      save={async value => { await saveGlobalSetting?.(value); select(null); }}
      select={select} onDismiss={() => setOpen(false)} />}
  </>;
}
