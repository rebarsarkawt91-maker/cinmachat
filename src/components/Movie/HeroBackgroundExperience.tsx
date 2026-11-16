import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { resolveApiUrl } from '../../services/backendConfig';
import {
  DEFAULT_HERO_BACKGROUND, HERO_BACKGROUND_IMAGE_MAX_BYTES, HERO_BACKGROUND_IMAGE_PATH,
  getHeroBackgroundYouTubeId, parseHeroBackground, parseHeroBackgroundMedia,
  type HeroBackgroundMedia, type HeroBackgroundSettings,
  type HeroBackgroundUpdate,
} from '../../utils/heroBackground';
import { HeroBackgroundLayer, HERO_BACKGROUND_PRESETS } from './HeroBackgroundLayer';
import '../../styles/heroBackgroundControls.css';

const PREFERENCE_KEY = 'cinemachat.hero.background';
type Media = HeroBackgroundMedia;
type Preference = { mode: number; revision?: string };

function readPreference(): Preference | null {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCE_KEY) || 'null');
    const mode = typeof value === 'number' ? value : value?.mode;
    const parsed = parseHeroBackground({ mode, revision: value?.revision });
    return parsed && { mode: parsed.mode, revision: parsed.revision };
  } catch { return null; }
}

function resolveMediaUrl(url: string) {
  return (url.startsWith(HERO_BACKGROUND_IMAGE_PATH) || url.startsWith('/uploads/')) ? resolveApiUrl(url) : url;
}

function VideoBackdrop({ url, onError, pageBackground = false }: { url: string; onError: () => void; pageBackground?: boolean }) {
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
        element.muted = true;
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

  return <video ref={video} className={`hero-bg-media${pageBackground ? ' hero-bg-media--page' : ''}`} src={url} aria-hidden="true"
    muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback
    onPlaying={event => { event.currentTarget.dataset.playing = 'true'; }} onError={onError} />;
}

function MediaBackdrop({ media, onMediaFailure, pageBackground = false }: {
  media: Media;
  onMediaFailure?: () => void;
  pageBackground?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fail = () => { setFailed(true); onMediaFailure?.(); };
  if (failed) return null;
  if (media.kind === 'video') return <VideoBackdrop url={resolveMediaUrl(media.url)} onError={fail} pageBackground={pageBackground} />;
  const source = media.kind === 'youtube'
    ? `https://img.youtube.com/vi/${getHeroBackgroundYouTubeId(media.url)}/hqdefault.jpg`
    : resolveMediaUrl(media.url);
  return <img className={`hero-bg-media${pageBackground ? ' hero-bg-media--page' : ''}`} data-playing={ready} src={source}
        alt="" aria-hidden="true" referrerPolicy="no-referrer" decoding="async"
        onLoad={() => setReady(true)} onError={fail} />;
}

function Backdrop({ mode, media, onMediaFailure, pageBackground = false }: {
  mode: number;
  media?: Media;
  onMediaFailure?: () => void;
  pageBackground?: boolean;
}) {
  return <>
    <HeroBackgroundLayer mode={mode} pageBackground={pageBackground} />
    {mode !== DEFAULT_HERO_BACKGROUND.mode && media &&
      <MediaBackdrop key={`${media.kind}|${media.url}`} media={media} onMediaFailure={onMediaFailure} pageBackground={pageBackground} />}
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

type FormMedia = Media['kind'] | '';

function describeMedia(kind: FormMedia, value: string): { name: string; type: string } | null {
  const trimmed = value.trim();
  if (!kind || !trimmed) return null;
  if (kind === 'youtube') {
    const id = getHeroBackgroundYouTubeId(trimmed);
    return id ? { name: id, type: 'YouTube' } : null;
  }
  try {
    const parsed = new URL(trimmed);
    const lastSegment = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '').trim();
    const extension = lastSegment.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toUpperCase();
    return {
      name: lastSegment || parsed.hostname,
      type: extension || (kind === 'video' ? 'Direct video' : 'Direct image'),
    };
  } catch {
    return null;
  }
}

function BackgroundDialog({ initial, activeMode, save, select, onDismiss }: {
  initial: HeroBackgroundSettings;
  activeMode: number;
  save?: (value: HeroBackgroundUpdate) => Promise<void>;
  select: (mode: number | null) => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState(activeMode);
  const [kind, setKind] = useState<FormMedia>(initial.slots?.[activeMode]?.kind ?? '');
  const [url, setUrl] = useState(initial.slots?.[activeMode]?.url ?? '');
  const [preview, setPreview] = useState<Media | undefined>(initial.slots?.[activeMode]);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState('');
  const [badMedia, setBadMedia] = useState(false);
  const locked = mode === DEFAULT_HERO_BACKGROUND.mode;
  const busy = saving || reading;
  const mediaDetails = describeMedia(kind, url);
  const close = () => dialog.current?.close();

  useEffect(() => { dialog.current?.showModal(); }, []);

  function pickMode(value: number) {
    if (busy) return;
    if (!save) { select(value); close(); return; }
    const media = initial.slots?.[value];
    setMode(value);
    setKind(media?.kind ?? '');
    setUrl(media?.url ?? '');
    setPreview(media);
    setProblem('');
    setSaved('');
    setBadMedia(false);
  }

  function readDraft(): Media | null | undefined {
    if (!kind) return null;
    const value = parseHeroBackgroundMedia({ kind, url: url.trim() });
    if (!value) {
      setProblem(kind === 'youtube' ? 'لینکی دروستی ڤیدیۆی یوتیوب دابنێ.' : 'لینکی ڕاستەوخۆی HTTPS یان وێنەیەکی دروست دابنێ.');
      return undefined;
    }
    return value;
  }

  function applyDraftMedia(media: Media | null) {
    setKind(media?.kind ?? '');
    setUrl(media?.url ?? '');
    setPreview(media ?? undefined);
    setBadMedia(false);
  }

  async function persist(value: HeroBackgroundUpdate, success: string) {
    if (!save || busy) return false;
    setProblem('');
    setSaved('');
    setSaving(true);
    try {
      await save(value);
      setSaved(success);
      return true;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'پاشەکەوتکردن سەرکەوتوو نەبوو.');
      return false;
    } finally { setSaving(false); }
  }

  return (
    <dialog ref={dialog} className={`hero-bg-dialog kurdish-text${save ? ' hero-bg-dialog--admin' : ''}`} dir="rtl" lang="ckb"
      aria-labelledby="hero-bg-title" onClose={onDismiss} onCancel={event => {
        if (saving) event.preventDefault();
      }}>
      <div className="hero-bg-dialog__heading">
        <h2 id="hero-bg-title">باگراوندی سینەما</h2>
        <button type="button" onClick={close} disabled={saving} className="hero-bg-action" aria-label="داخستن"><X size={18} /></button>
      </div>
      {save && <form className="hero-bg-slot-editor" aria-label="ڕێکخستنی مۆدەکان" onSubmit={async event => {
        event.preventDefault();
        if (locked || busy) return;
        setProblem('');
        const media = readDraft();
        if (media === undefined) return;
        if (await persist({ slot: { mode, media } }, 'باگراوندی ئەم مۆدە پاشەکەوت کرا.')) applyDraftMedia(media);
      }}>
        <label className="hero-bg-field">
          <span>مۆدی باگراوند</span>
          <select value={mode} disabled={busy} onChange={event => pickMode(Number(event.target.value))}>
            {HERO_BACKGROUND_PRESETS.map(item => (
              <option key={item.id} value={item.id}>{item.id}. {item.label}{item.id === initial.mode ? ' • باگراوندی سایت' : ''}</option>
            ))}
          </select>
        </label>
        {!locked && <>
          <label className="hero-bg-field">
            <span>جۆری باگراوند</span>
            <select value={kind} disabled={busy} onChange={event => {
              setKind(event.target.value as FormMedia); setUrl(''); setPreview(undefined);
              setSaved(''); setProblem(''); setBadMedia(false);
            }}>
              <option value="">دیزاینی سەرەکی</option>
              <option value="image">وێنە</option>
              <option value="video">ڤیدیۆی MP4 / WebM</option>
              <option value="youtube">یوتیوب</option>
            </select>
          </label>
          {kind && <label className="hero-bg-field hero-bg-slot-editor__url">
            <span>{kind === 'youtube' ? 'لینکی یوتیوب' : kind === 'video' ? 'لینکی فایلەکەی ڤیدیۆ (MP4/WebM)' : 'لینکی فایلەکەی وێنە'}</span>
            <input type="text" dir="ltr" inputMode="url" autoComplete="off" placeholder="https://…"
              disabled={busy} value={url.startsWith('data:') ? '' : url}
              onChange={event => {
                const link = event.target.value;
                setUrl(link); setSaved(''); setProblem(''); setBadMedia(false);
                if (getHeroBackgroundYouTubeId(link)) setKind('youtube');
              }} />
          </label>}
          {mediaDetails && <div className="hero-bg-media-details" role="status" aria-live="polite">
            <span>ناوی فایل: <b dir="ltr">{mediaDetails.name}</b></span>
            <span>جۆر: <b dir="ltr">{mediaDetails.type}</b></span>
          </div>}
          <button type="submit" className="hero-bg-action hero-bg-action--primary" disabled={busy}>
            {saving ? 'پاشەکەوتکردن لە سێرڤەر…' : 'پاشەکەوتی مۆد'}
          </button>
          {kind === 'image' && <label className="hero-bg-field hero-bg-slot-editor__upload">
            <span>یان وێنە بار بکە (PNG، JPG، WebP تا ٥٠٠ KB)</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setProblem(''); setSaved('');
              if (file.size > HERO_BACKGROUND_IMAGE_MAX_BYTES) { setProblem('وێنەکە دەبێت ٥٠٠ KB یان کەمتر بێت.'); return; }
              setReading(true);
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = parseHeroBackgroundMedia({ kind: 'image', url: reader.result });
                setReading(false);
                if (!result) { setProblem('وێنەکە دروست نییە یان نەتوانرا بخوێندرێتەوە.'); return; }
                setUrl(result.url); setPreview(result); setBadMedia(false);
              };
              reader.readAsDataURL(file);
            }} />
          </label>}
          {kind && <button type="button" className="hero-bg-action" disabled={busy} onClick={() => {
            setProblem(''); setSaved('');
            const media = readDraft();
            if (media) applyDraftMedia(media);
          }}>پێشبینینی لینک</button>}
        </>}
      </form>}
      {save && locked && <p className="hero-bg-slot-note">مۆدی ٢ قوفڵە. پەردەی سووری سەرەکییە.</p>}
      {save && kind === 'youtube' && !locked &&
        <p className="hero-bg-slot-note">وێنەی ڤیدیۆی یوتیوب دەبێتە باگراوند. بۆ باگراوندی جوڵاو، لینکی MP4 یان WebM دابنێ.</p>}
      {(problem || badMedia) && <p role="alert" className="hero-bg-error">{problem || 'ئەم لینکە بار نەبوو. لینکەکە بپشکنە.'}</p>}
      {saved && <p role="status" className="hero-bg-slot-note">{saved}</p>}
      <div className="hero-bg-preview">
        <Backdrop mode={mode} media={preview} onMediaFailure={() => setBadMedia(true)} />
      </div>
      <div className="hero-bg-dialog__swatches" dir="ltr" role="group" aria-label="٢٠ مۆدی باگراوند">
        <Swatches mode={mode} onSelect={pickMode} />
      </div>
      <div className="hero-bg-personal">
        {save && <button type="button" className="hero-bg-action hero-bg-action--primary"
          disabled={busy || mode === initial.mode}
          onClick={() => void persist({ mode }, 'ئەم مۆدە دانرا بۆ هەموو بینەران.')}>دانان بۆ هەمووان</button>}
        {save && <button type="button" className="hero-bg-action" onClick={() => { select(mode); close(); }}
          disabled={busy}>بۆ خۆم هەڵیبژێرە</button>}
        <button type="button" className="hero-bg-action" onClick={() => { select(null); close(); }}
          disabled={busy}>باگراوندی سایت</button>
      </div>
    </dialog>
  );
}

export function HeroBackgroundExperience({ siteSetting, saveGlobalSetting, children }: {
  siteSetting: unknown;
  saveGlobalSetting?: (value: HeroBackgroundUpdate) => Promise<void>;
  children: (layers: { backdrop: ReactNode; controls: ReactNode }) => ReactNode;
}) {
  const global = useMemo(() => parseHeroBackground(siteSetting) ?? DEFAULT_HERO_BACKGROUND, [siteSetting]);
  const [personal, setPersonal] = useState(readPreference);
  const [open, setOpen] = useState(false);
  // A newly published site default supersedes choices made under older defaults.
  const mode = personal && personal.revision === global.revision ? personal.mode : global.mode;
  const media = mode === DEFAULT_HERO_BACKGROUND.mode ? undefined : global.slots?.[mode];

  // Let the page-level background pass through the few legacy full-width
  // sections that still carry an opaque cinema-black surface. Cards and modal
  // panels keep their own contrast; only the site canvas is relaxed.
  useEffect(() => {
    const root = document.documentElement;
    if (mode >= 3) root.dataset.heroPageBackground = 'true';
    else delete root.dataset.heroPageBackground;
    return () => { delete root.dataset.heroPageBackground; };
  }, [mode]);

  function select(value: number | null) {
    const preference = value === null ? null : { mode: value, revision: global.revision };
    setPersonal(preference);
    try {
      if (preference === null) localStorage.removeItem(PREFERENCE_KEY);
      else localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preference));
    } catch { /* The setting remains active for this session. */ }
  }

  return <>
    {children({
      backdrop: open ? null : <Backdrop mode={mode} media={media} pageBackground={mode >= 3} />,
      controls: <>
        <div className="hero-bg-quick" dir="ltr" role="group" aria-label="مۆدەکانی باگراوند">
          <Swatches mode={mode} onSelect={select} />
        </div>
        <div className="hero-bg-buttons" dir="rtl">
          <button type="button" className="hero-bg-trigger kurdish-text" onClick={() => setOpen(true)}
            aria-label="گۆڕینی باگراوند" aria-haspopup="dialog" title="گۆڕینی باگراوند">
            <ImageIcon size={15} aria-hidden="true" /><span>باگراوند</span>
          </button>
        </div>
      </>,
    })}
    {open && <BackgroundDialog initial={global} activeMode={mode}
      save={saveGlobalSetting ? async value => {
        await saveGlobalSetting(value);
        if (value.mode !== undefined) select(null);
      } : undefined}
      select={select} onDismiss={() => setOpen(false)} />}
  </>;
}
