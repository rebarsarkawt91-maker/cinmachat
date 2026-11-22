import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarClock, Check, CirclePause, CirclePlay, Clock3,
  Film, ListVideo, Loader2, Pencil, Plus, RefreshCw, ShieldCheck, Trash2,
} from "lucide-react";
import type { Movie } from "../../types";
import { SOCIAL_CONNECTION_CHANNELS as CHANNELS, SocialConnectionsPanel } from "./SocialConnectionsPanel";
import "./SocialAutomationModule.css";

type PostKind = "news" | "trailer" | "promotion";
type Platform = "instagram" | "facebook" | "youtube" | "telegram";
type Settings = {
  version: number;
  dailyCounts: Record<PostKind, number>;
  topics: { regions: Array<"foreign" | "korean" | "chinese">; categories: string[] };
  platforms: Record<Platform, boolean>;
  schedule: { timezone: "Asia/Baghdad"; startTime: string; endTime: string; paused: boolean };
  weeklyCalendar: {
    dailyTargets: { reels: { min: number; max: number }; feed: { min: number; max: number }; stories: { min: number; max: number }; cinemaChatCards: number };
    days: Record<"monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday", { enabled: boolean; slots: Array<{ id: string; category: string; format: "reels" | "feed" | "stories" | "carousel"; interactive: boolean; count: number; platforms: Platform[]; times: string[] }> }>;
  };
  captions: Record<PostKind, string>;
  design: { template: "cinemachat-cinematic" | "cinemachat-minimal"; includeBranding: boolean };
  updatedAt: string | null;
  updatedBy: string | null;
};
type SocialJob = {
  id: string; contentKind?: PostKind; title?: string; caption: string; description?: string;
  platforms: Platform[]; scheduledAt: string; status: string; createdAt: string;
  approvalStatus?: "pending" | "approved";
  platformStatus?: Partial<Record<Platform, { status: string; errorCode?: string }>>;
  media?: { type: "text" | "image" | "video"; mimeType?: string };
};
type Readiness = { mode: "DRY_RUN" | "LIVE"; livePublishingEnabled: boolean; schedulerEnabled?: boolean; platforms: Record<Platform, { configured: boolean }> };
type DailyRun = { dayKey: string; status: "running" | "partial" | "complete" | "failed"; created: Record<PostKind, number>; skipped: Record<PostKind, number>; errors: string[]; jobIds: string[] };
type Props = { request: (path: string, options?: RequestInit) => Promise<Response>; catalogMovies: Movie[] };
type Editor = { kind: PostKind; title: string; caption: string; localTime: string; platforms: Platform[]; mediaType: "text" | "image" | "video"; mediaUrl: string; rightsConfirmed: boolean; movieId: string };

const DEFAULTS: Settings = {
  version: 0,
  dailyCounts: { news: 2, trailer: 2, promotion: 1 },
  topics: { regions: ["foreign", "korean", "chinese"], categories: ["news", "trailers", "catalog-promotions"] },
  platforms: { instagram: false, facebook: false, youtube: false, telegram: false },
  schedule: { timezone: "Asia/Baghdad", startTime: "09:00", endTime: "21:00", paused: true },
  weeklyCalendar: {
    dailyTargets: { reels: { min: 1, max: 2 }, feed: { min: 1, max: 2 }, stories: { min: 1, max: 2 }, cinemaChatCards: 1 },
    days: {
      monday: { enabled: true, slots: [{ id: "monday-trailers", category: "Movie clips and trailers", format: "reels", interactive: false, count: 2, platforms: [], times: ["13:00", "19:00"] }] },
      tuesday: { enabled: true, slots: [{ id: "tuesday-verified-news", category: "Verified foreign movie news", format: "feed", interactive: false, count: 1, platforms: [], times: ["18:00"] }] },
      wednesday: { enabled: true, slots: [{ id: "wednesday-polls", category: "Polls and questions (official support required)", format: "stories", interactive: true, count: 0, platforms: [], times: [] }] },
      thursday: { enabled: true, slots: [{ id: "thursday-reviews", category: "Movie reviews: Why watch this movie?", format: "feed", interactive: false, count: 1, platforms: [], times: ["18:00"] }] },
      friday: { enabled: true, slots: [{ id: "friday-memes", category: "Movie memes and comedy", format: "reels", interactive: false, count: 1, platforms: [], times: ["16:00"] }, { id: "friday-post", category: "Movie memes and comedy", format: "feed", interactive: false, count: 1, platforms: [], times: ["20:00"] }] },
      saturday: { enabled: true, slots: [{ id: "saturday-top-five", category: "Top 5 movie recommendations", format: "carousel", interactive: false, count: 1, platforms: [], times: ["17:00"] }] },
      sunday: { enabled: true, slots: [{ id: "sunday-nostalgia", category: "Nostalgia and behind-the-scenes", format: "feed", interactive: false, count: 1, platforms: [], times: ["18:00"] }, { id: "sunday-reel", category: "Nostalgia and behind-the-scenes", format: "reels", interactive: false, count: 1, platforms: [], times: ["20:00"] }] },
    },
  },
  captions: { news: "", trailer: "", promotion: "" },
  design: { template: "cinemachat-cinematic", includeBranding: true },
  updatedAt: null, updatedBy: null,
};
const WEEKDAYS = [
  ["monday", "دووشەممە"], ["tuesday", "سێشەممە"], ["wednesday", "چوارشەممە"], ["thursday", "پێنجشەممە"],
  ["friday", "هەینی"], ["saturday", "شەممە"], ["sunday", "یەکشەممە"],
] as const;
const FORMAT_LABEL: Record<"reels" | "feed" | "stories" | "carousel", string> = { reels: "Reels", feed: "پۆستی Feed", stories: "Stories", carousel: "Carousel" };
const KIND_LABEL: Record<PostKind, string> = { news: "هەواڵی فیلم و زنجیرە", trailer: "ترەیلەری ڕێگەپێدراو", promotion: "ناسـاندنی فیلمی CinemaChat" };
const API_ROOT = "/api/admin/social-publishing";
const SETTINGS_URL = "/api/admin/social-automation/settings";
const localBaghdadTime = (iso: string) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const baghdad = new Date(date.getTime() + 3 * 60 * 60_000);
  return new Date(baghdad.getTime() - baghdad.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const baghdadIso = (local: string) => new Date(`${local}:00+03:00`).toISOString();
const messageFrom = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || fallback);
  return payload;
};

export function SocialAutomationModule({ request, catalogMovies }: Props) {
  const requestRef = useRef(request);
  requestRef.current = request;
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [dailyRun, setDailyRun] = useState<DailyRun | null>(null);
  const [providersReady, setProvidersReady] = useState({ officialNews: false, licensedTrailers: false, cinemaChatCatalog: false });
  const [jobs, setJobs] = useState<SocialJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SocialJob | null>(null);
  const [editorError, setEditorError] = useState("");
  const [editor, setEditor] = useState<Editor>({ kind: "news", title: "", caption: "", localTime: "", platforms: [], mediaType: "text", mediaUrl: "", rightsConfirmed: false, movieId: "" });

  const updateWeeklySlot = (weekday: keyof Settings["weeklyCalendar"]["days"], slotId: string, update: (slot: Settings["weeklyCalendar"]["days"][typeof weekday]["slots"][number]) => Settings["weeklyCalendar"]["days"][typeof weekday]["slots"][number]) => {
    setSettings(value => ({ ...value, weeklyCalendar: { ...value.weeklyCalendar, days: { ...value.weeklyCalendar.days, [weekday]: { ...value.weeklyCalendar.days[weekday], slots: value.weeklyCalendar.days[weekday].slots.map(item => item.id === slotId ? update(item) : item) } } } }));
  };

  const addWeeklySlot = (weekday: keyof Settings["weeklyCalendar"]["days"]) => {
    const id = `${weekday}-${Date.now().toString(36)}`;
    setSettings(value => ({ ...value, weeklyCalendar: { ...value.weeklyCalendar, days: { ...value.weeklyCalendar.days, [weekday]: { ...value.weeklyCalendar.days[weekday], slots: [...value.weeklyCalendar.days[weekday].slots, { id, category: "ناوەڕۆکی نوێ", format: "feed", interactive: false, count: 1, platforms: [], times: ["18:00"] }] } } } }));
  };

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [settingResponse, statusResponse, queueResponse, historyResponse, dailyRunResponse] = await Promise.all([
        requestRef.current(SETTINGS_URL), requestRef.current(`${API_ROOT}/status`), requestRef.current(`${API_ROOT}/queue?limit=100`), requestRef.current(`${API_ROOT}/history?limit=100`), requestRef.current("/api/admin/social-automation/daily-run"),
      ]);
      const [settingResult, statusResult, queueResult, historyResult, dailyRunResult] = await Promise.all([
        messageFrom(settingResponse, "ڕێکخستنەکان نەهاتوون."), messageFrom(statusResponse, "دۆخی پلاتفۆرمەکان بەردەست نییە."),
        messageFrom(queueResponse, "ڕیزی پۆستەکان بەردەست نییە."), messageFrom(historyResponse, "مێژووی پۆستەکان بەردەست نییە."), messageFrom(dailyRunResponse, "دۆخی ئۆتۆماتیکی ڕۆژانە بەردەست نییە."),
      ]);
      setSettings({ ...DEFAULTS, ...settingResult.settings, weeklyCalendar: settingResult.settings.weeklyCalendar || DEFAULTS.weeklyCalendar });
      setReadiness(statusResult.readiness);
      setDailyRun(dailyRunResult.run || null);
      setProvidersReady(dailyRunResult.providers || { officialNews: false, licensedTrailers: false, cinemaChatCatalog: false });
      const combined: SocialJob[] = [...(queueResult.jobs || []), ...(historyResult.jobs || [])];
      setJobs([...new Map(combined.map(job => [job.id, job])).values()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "پەیوەندی بە خزمەتگوزاریی ئۆتۆماتیکەوە نەکرا.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const queued = useMemo(() => jobs.filter(job => ["queued", "retrying", "processing"].includes(job.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [jobs]);
  const history = useMemo(() => jobs.filter(job => !["queued", "retrying", "processing"].includes(job.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12), [jobs]);
  const dailyTotal = useMemo(() => Object.values(settings.dailyCounts).reduce((sum, value) => sum + value, 0), [settings.dailyCounts]);

  const saveSettings = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await request(SETTINGS_URL, { method: "PUT", body: JSON.stringify(settings) });
      const payload = await messageFrom(response, "ڕێکخستنەکان پاشەکەوت نەکران.");
      setSettings(payload.settings);
      const reconciliation = payload.reconciliation;
      setNotice(reconciliation?.error
        ? "ڕێکخستنەکان پاشەکەوت کران؛ بەڵام ڕیزی پۆستە چاوەڕوانەکان نوێ نەکرایەوە. تکایە نوێکردنەوە بکە."
        : reconciliation && typeof reconciliation.created === "number"
          ? `ڕێکخستنەکان پاشەکەوت کران؛ ${reconciliation.created} پۆستی نوێی شایستە خراوەتە ڕیز، ${reconciliation.skipped} دانە بەهۆی نەبوونی ناوەڕۆکی پشتڕاستکراو تێپەڕێنرا. DRY_RUN؛ بڵاوکردنەوەی ڕاستەقینە ناچالاکە.`
          : "ڕێکخستنەکان بە سەرکەوتوویی لە سێرڤەر پاشەکەوت کران.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "پاشەکەوتکردن سەرکەوتوو نەبوو."); }
    finally { setSaving(false); }
  };

  const openNew = (kind: PostKind = "news") => {
    const movie = kind === "promotion" ? catalogMovies.find(item => item.id) : undefined;
    setEditing(null); setEditorError("");
    setEditor({ kind, title: movie?.title || "", caption: settings.captions[kind], localTime: localBaghdadTime(new Date(Date.now() + 60 * 60_000).toISOString()), platforms: Object.entries(settings.platforms).filter(([, enabled]) => enabled).map(([id]) => id as Platform), mediaType: "text", mediaUrl: "", rightsConfirmed: false, movieId: movie?.id || "" });
    setEditorOpen(true);
  };
  const openEdit = (job: SocialJob) => {
    setEditing(job); setEditorError("");
    setEditor({ kind: job.contentKind || "news", title: job.title || "", caption: job.caption, localTime: localBaghdadTime(job.scheduledAt), platforms: job.platforms, mediaType: "text", mediaUrl: "", rightsConfirmed: false, movieId: "" });
    setEditorOpen(true);
  };
  const submitPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusyId("editor"); setEditorError("");
    try {
      const selectedPlatforms = editor.platforms.filter(platform => settings.platforms[platform]);
      if (!selectedPlatforms.length) throw new Error("لانیکەم یەک پلاتفۆرمی چالاک دیاری بکە.");
      const selectedMovie = editor.kind === "promotion" ? catalogMovies.find(movie => movie.id === editor.movieId) : undefined;
      if (editor.kind === "promotion" && !selectedMovie) throw new Error("فیلمێک لە کاڵۆگی ڕاستەقینەی CinemaChat هەڵبژێرە.");
      if (editor.mediaType !== "text" && (!editor.mediaUrl.trim() || !editor.rightsConfirmed)) throw new Error("بەستەری HTTPS و پشتڕاستکردنەوەی مافی بڵاوکردنەوە پێویستە.");
      const body: Record<string, unknown> = {
        contentKind: editor.kind,
        platforms: selectedPlatforms,
        title: selectedMovie ? selectedMovie.title : editor.title.trim(),
        caption: editor.caption.trim(),
        scheduledAt: baghdadIso(editor.localTime),
        ...(editor.kind === "promotion" && selectedMovie ? { description: selectedMovie.description } : {}),
        ...(!editing && editor.mediaType !== "text" ? { media: { type: editor.mediaType, url: editor.mediaUrl.trim(), rightsConfirmed: true } } : {}),
      };
      if (editing) {
        await messageFrom(await request(`${API_ROOT}/queue/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: JSON.stringify(body) }), "پۆستی ڕیزکراو دەستکاری نەکرا.");
      } else {
        await messageFrom(await request(`${API_ROOT}/queue`, { method: "POST", body: JSON.stringify(body) }), "پۆستەکە نەخراوەتە ڕیز.");
      }
      setEditorOpen(false); setNotice("بابەتەکە بە شێوەی پۆستی ڕیزکراو تۆمار کرا؛ لێرەوە بڵاوناکرێتەوە.");
      await refresh(true);
    } catch (caught) { setEditorError(caught instanceof Error ? caught.message : "پاشەکەوتکردن سەرکەوتوو نەبوو."); }
    finally { setBusyId(""); }
  };
  const approveJob = async (job: SocialJob) => {
    setBusyId(job.id); setError("");
    try {
      await messageFrom(await request(`${API_ROOT}/queue/${encodeURIComponent(job.id)}/approve`, { method: "POST" }), "پەسەندکردنی پۆست سەرکەوتوو نەبوو.");
      await refresh(true); setNotice("پۆستەکە بە شێوەی دەستی پەسەند کرا؛ تەنها لە DRY_RUN دەتوانرێت تاقی بکرێتەوە.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "پەسەندکردن سەرکەوتوو نەبوو."); }
    finally { setBusyId(""); }
  };
  const cancelJob = async (job: SocialJob) => {
    if (!window.confirm("پۆستە ڕیزکراوەکە هەڵبوەشێنمەوە؟")) return;
    setBusyId(job.id); setError("");
    try {
      await messageFrom(await request(`${API_ROOT}/queue/${encodeURIComponent(job.id)}`, { method: "DELETE" }), "پۆستەکە هەڵوەشێنرایەوە.");
      await refresh(true); setNotice("پۆستی ڕیزکراو هەڵوەشێندرایەوە.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "هەڵوەشاندنەوە سەرکەوتوو نەبوو."); }
    finally { setBusyId(""); }
  };

  return (
    <main className="social23" dir="rtl" aria-labelledby="social23-title">
      <header className="social23__header">
        <div><p className="social23__eyebrow">CINEMACHAT · ADMIN 23</p><h1 id="social23-title">Social Publishing &amp; Automation</h1><p className="social23__intro">سۆشیال ئۆتۆماتیک — ڕێکخستن و بەڕێوەبردنی ڕیزی ناوەڕۆک؛ پەخشکردنی ڕاستەقینە ناچالاکە.</p></div>
        <div className="social23__mode" role="status"><ShieldCheck size={18} /><span><strong>{readiness?.mode || "DRY_RUN"}</strong><small>پەخشکردنی ڕاستەقینە ناچالاکە</small></span></div>
      </header>

      {error && <p className="social23__error" role="alert"><AlertTriangle size={16} />{error}</p>}
      {notice && <p className="social23__notice" role="status">{notice}</p>}

      <SocialConnectionsPanel
        request={request}
        platforms={settings.platforms}
        onQueueChange={(platform, enabled) => setSettings(value => ({ ...value, platforms: { ...value.platforms, [platform]: enabled } }))}
      />

      <section className="social23__panel social23__daily-status" aria-live="polite">
        <div className="social23__section-heading"><div><span className="social23__section-icon"><CalendarClock size={18} /></span><div><h2>ئەنجامی ئۆتۆماتیکی ئەم ڕۆژە</h2><p>{dailyRun?.dayKey || "هێشتا هیچ خشتەیەک نەکراوە"} · Asia/Baghdad · {readiness?.mode || "DRY_RUN"}</p></div></div><span className={`social23__preview-tag social23__run-status--${dailyRun?.status || "idle"}`}>{dailyRun?.status || "چاوەڕوان"}</span></div>
        <div className="social23__daily-counts">{(Object.keys(KIND_LABEL) as PostKind[]).map(kind => <span key={kind}>{KIND_LABEL[kind]}: {dailyRun?.created[kind] || 0}/{settings.dailyCounts[kind]} · نەکرا: {dailyRun?.skipped[kind] || 0}</span>)}</div>
        <div className="social23__provider-note"><span>هەواڵی فەرمی: {providersReady.officialNews ? "بەردەست" : "provider نییە"}</span><span>تریلەری مۆڵەتپێدراو: {providersReady.licensedTrailers ? "بەردەست" : "پێڕستی مۆڵەتپێدراو نییە"}</span><span>کاڵۆگی CinemaChat: {providersReady.cinemaChatCatalog ? "بەردەست" : "بەردەست نییە"}</span></div>
        {dailyRun?.errors.length ? <p className="social23__error">هەڵەی worker: {dailyRun.errors.join("، ")}</p> : null}
      </section>

      <section className="social23__panel social23__weekly" aria-label="تەقویمی هەفتانە">
        <div className="social23__section-heading"><div><span className="social23__section-icon"><CalendarClock size={18} /></span><div><h2>تەقویمی ناوەڕۆکی هەفتانە</h2><p>ڕۆژ، بابەت، ژمارە، پلاتفۆرم و کات بە Asia/Baghdad پاشەکەوت دەکرێن.</p></div></div><span className="social23__preview-tag">تەنها DRY_RUN</span></div>
        <div className="social23__weekly-targets">
          {(["reels", "feed", "stories"] as const).map(format => <div className="social23__weekly-target" key={format}><strong>{FORMAT_LABEL[format]} ـی ڕۆژانە</strong><label>کەمترین<input type="number" min={0} max={20} value={settings.weeklyCalendar.dailyTargets[format].min} onChange={event => setSettings(value => ({ ...value, weeklyCalendar: { ...value.weeklyCalendar, dailyTargets: { ...value.weeklyCalendar.dailyTargets, [format]: { ...value.weeklyCalendar.dailyTargets[format], min: Math.min(Number(event.target.value) || 0, value.weeklyCalendar.dailyTargets[format].max) } } } }))} /></label><label>زۆرترین<input type="number" min={0} max={20} value={settings.weeklyCalendar.dailyTargets[format].max} onChange={event => setSettings(value => ({ ...value, weeklyCalendar: { ...value.weeklyCalendar, dailyTargets: { ...value.weeklyCalendar.dailyTargets, [format]: { ...value.weeklyCalendar.dailyTargets[format], max: Math.max(Number(event.target.value) || 0, value.weeklyCalendar.dailyTargets[format].min) } } } }))} /></label></div>)}
          <div className="social23__weekly-target"><strong>کارتی CinemaChat لە ژمارەی Feed ـدایە</strong><label>ژمارەی ڕۆژانە<input type="number" min={0} max={20} value={settings.weeklyCalendar.dailyTargets.cinemaChatCards} onChange={event => setSettings(value => ({ ...value, weeklyCalendar: { ...value.weeklyCalendar, dailyTargets: { ...value.weeklyCalendar.dailyTargets, cinemaChatCards: Math.max(0, Math.min(20, Number(event.target.value) || 0)) } } }))} /></label></div>
        </div>
        <div className="social23__week-grid">
          {WEEKDAYS.map(([weekday, label]) => {
            const config = settings.weeklyCalendar.days[weekday];
            return <article className="social23__week-day" key={weekday}>
              <header><strong>{label}</strong><label className="social23__check"><input type="checkbox" checked={config.enabled} onChange={event => setSettings(value => ({ ...value, weeklyCalendar: { ...value.weeklyCalendar, days: { ...value.weeklyCalendar.days, [weekday]: { ...value.weeklyCalendar.days[weekday], enabled: event.target.checked } } } }))} /><span>چالاک</span></label></header>
              {config.slots.map(slot => <div className="social23__week-slot" key={slot.id}>
                <label>بابەت<input maxLength={100} value={slot.category} onChange={event => updateWeeklySlot(weekday, slot.id, item => ({ ...item, category: event.target.value }))} /></label>
                <div className="social23__week-row"><label>فۆرمات<select value={slot.format} onChange={event => updateWeeklySlot(weekday, slot.id, item => ({ ...item, format: event.target.value as typeof item.format }))}>{Object.entries(FORMAT_LABEL).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><label>ژمارە<input type="number" min={0} max={8} value={slot.count} onChange={event => { const count = Math.max(0, Math.min(8, Number(event.target.value) || 0)); updateWeeklySlot(weekday, slot.id, item => ({ ...item, count, times: Array.from({ length: count }, (_, index) => item.times[index] || "18:00") })); }} /></label></div>
                <label>کاتەکان بە کۆما جیا بکەرەوە<input dir="ltr" placeholder="13:00, 19:00" value={slot.times.join(", ")} onChange={event => { const times = event.target.value.split(",").map(value => value.trim()).filter(Boolean).slice(0, 8); updateWeeklySlot(weekday, slot.id, item => ({ ...item, count: times.length, times })); }} /></label>
                <label>پلاتفۆرمەکان</label><div className="social23__week-platforms">{CHANNELS.map(({ id, name }) => <label className="social23__check" key={id}><input type="checkbox" checked={slot.platforms.includes(id)} onChange={event => updateWeeklySlot(weekday, slot.id, item => ({ ...item, platforms: event.target.checked ? [...new Set([...item.platforms, id])] : item.platforms.filter(platform => platform !== id) }))} /><span>{name}</span></label>)}</div>
                {slot.format === "stories" && <label className="social23__check"><input type="checkbox" checked={slot.interactive} onChange={event => updateWeeklySlot(weekday, slot.id, item => ({ ...item, interactive: event.target.checked }))} /><span>ناوەڕۆکی کارلێک‌هەڵگر (وەک Poll)</span></label>}
                <button type="button" className="social23__week-remove" onClick={() => setSettings(value => ({ ...value, weeklyCalendar: { ...value.weeklyCalendar, days: { ...value.weeklyCalendar.days, [weekday]: { ...value.weeklyCalendar.days[weekday], slots: value.weeklyCalendar.days[weekday].slots.filter(item => item.id !== slot.id) } } } }))}>لابردنی ئەم پلانه</button>
              </div>)}
              <button type="button" className="social23__button social23__button--outline" onClick={() => addWeeklySlot(weekday)} disabled={config.slots.length >= 8}><Plus size={14} /> زیادکردنی پلانی ئەم ڕۆژە</button>
            </article>;
          })}
        </div>
        <p className="social23__safety-note"><AlertTriangle size={17} /><span>شێوازە فەرمییەکان هەموویان لەلایەن adapter ـی ئێمەوە جێبەجێ نەکراون: ئێستا Instagram تەنها Feed/Reels، Facebook Page تەنها Feed، Telegram تەنها نامەی Feed، و YouTube تەنها upload ـی ڤیدیۆییە. Story، Pollی کارلێک‌هەڵگر و Carousel تا adapter و مۆڵەتی پێویستیان ئامادە نەبێت queue ناکرێن. هەر ناوەڕۆکێک بێ سەرچاوەی پشتڕاستکراو یان مافی میدیا skip دەکرێت؛ گۆڕانکارییەکان بە پاشەکەوتی گشتی لە Firestore دەنووسرێن.</span></p>
      </section>

      <div className="social23__grid social23__settings-row">
        <section className="social23__panel social23__settings">
          <div className="social23__section-heading"><div><span className="social23__section-icon"><Film size={18} /></span><div><h2>پلانی ناوەڕۆکی ڕۆژانە</h2><p>ڕێکخستنەکان لە Firestore پاشەکەوت دەکرێن.</p></div></div><span className="social23__total">{dailyTotal} بابەت / ڕۆژ</span></div>
          <div className="social23__count-list">{(Object.keys(KIND_LABEL) as PostKind[]).map(kind => <label className="social23__count-row" key={kind}><span>{KIND_LABEL[kind]}</span><input type="number" min={0} max={20} value={settings.dailyCounts[kind]} aria-label={`ژمارەی ڕۆژانە: ${KIND_LABEL[kind]}`} onChange={event => setSettings(value => ({ ...value, dailyCounts: { ...value.dailyCounts, [kind]: Math.max(0, Math.min(20, Number(event.target.value) || 0)) } }))} /></label>)}</div>
          <fieldset className="social23__topics"><legend>جۆری بازاڕ</legend>{([ ["foreign", "بیانی"], ["korean", "کۆری"], ["chinese", "چینی"] ] as const).map(([key, label]) => <label key={key} className="social23__check"><input type="checkbox" checked={settings.topics.regions.includes(key)} onChange={event => setSettings(value => ({ ...value, topics: { ...value.topics, regions: event.target.checked ? [...value.topics.regions, key] : value.topics.regions.filter(item => item !== key) } }))} /><span>{label}</span></label>)}</fieldset>
          <div className="social23__caption-settings"><h3>قاڵبی دەقی کوردی</h3>{(Object.keys(KIND_LABEL) as PostKind[]).map(kind => <label key={kind}>{KIND_LABEL[kind]}<textarea rows={2} maxLength={500} value={settings.captions[kind]} onChange={event => setSettings(value => ({ ...value, captions: { ...value.captions, [kind]: event.target.value } }))} placeholder="قاڵبی دەقی پۆست…" /></label>)}</div>
          <label className="social23__timezone">شێوازی وێنە/هەویت<select value={settings.design.template} onChange={event => setSettings(value => ({ ...value, design: { ...value.design, template: event.target.value as Settings["design"]["template"] } }))}><option value="cinemachat-cinematic">CinemaChat · سینەماتیکی</option><option value="cinemachat-minimal">CinemaChat · سادە</option></select></label>
          <label className="social23__check social23__brand-check"><input type="checkbox" checked={settings.design.includeBranding} onChange={event => setSettings(value => ({ ...value, design: { ...value.design, includeBranding: event.target.checked } }))} /><span>نیشانی CinemaChat لە دیزاینەکەدا هەبێت</span></label>
          <button className="social23__button social23__button--gold" type="button" disabled={saving || loading} onClick={() => void saveSettings()}>{saving ? <Loader2 className="social23__spin" size={16} /> : <Check size={16} />}پاشەکەوتی ڕێکخستنەکان</button>
        </section>

        <section className="social23__panel social23__controls">
          <div className="social23__section-heading"><div><span className="social23__section-icon"><CalendarClock size={18} /></span><div><h2>خشتە و وەستان</h2><p>ناوچەی کاتی Asia/Baghdad</p></div></div></div>
          <div className="social23__pause-card"><div className={`social23__pause-indicator ${settings.schedule.paused ? "is-paused" : "is-preview"}`} /><div><strong>{settings.schedule.paused ? "خشتە وەستاوە" : "خشتە چالاکە"}</strong><small>هێڵی خشتە تا چالاککردنی worker ـی سێرڤەر پەخش ناکات.</small></div><button className="social23__button social23__button--outline" type="button" onClick={() => setSettings(value => ({ ...value, schedule: { ...value.schedule, paused: !value.schedule.paused } }))}>{settings.schedule.paused ? <CirclePlay size={17} /> : <CirclePause size={17} />}{settings.schedule.paused ? "خشتە چالاک بکە" : "خشتە بوەستێنە"}</button></div>
          <div className="social23__safety-note"><AlertTriangle size={17} /><span>{readiness?.schedulerEnabled ? "Worker ـی خشتە بە config ـی سێرڤەر چالاکە؛ settings ـەکە هێشتا paused ـە." : "Worker ـی خشتە لە سێرڤەر ناچالاکە؛ پەخشکردنی ڕاستەقینەش قفڵکراوە."} پەخشکردنی ڕاستەقینە لەم build ـەدا ناچالاکە.</span></div>
          <div className="social23__schedule-inputs"><label>کاتی دەستپێک<input type="time" value={settings.schedule.startTime} onChange={event => setSettings(value => ({ ...value, schedule: { ...value.schedule, startTime: event.target.value } }))} /></label><label>کۆتایی خشتە<input type="time" value={settings.schedule.endTime} onChange={event => setSettings(value => ({ ...value, schedule: { ...value.schedule, endTime: event.target.value } }))} /></label></div>
          <div className="social23__provider-note"><strong>سەرچاوەی هەواڵ</strong><span>هیچ provider ـێکی پشتڕاستکراو لە config ـدا نییە؛ خۆکارانە هەواڵ دروست ناکرێت.</span><button className="social23__button social23__button--outline" type="button" disabled>سەرچاوەی فەرمی بەردەست نییە</button></div>
          <button className="social23__button social23__button--outline" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> نوێکردنەوەی دۆخ</button>
        </section>
      </div>

      <section className="social23__panel social23__queue">
        <div className="social23__section-heading social23__queue-heading"><div><span className="social23__section-icon"><ListVideo size={18} /></span><div><h2>ڕیزی پۆستەکان</h2><p>پۆست تەنها خراوەتە ڕیز؛ هیچ publish/worker ـێک لێرەوە دەست پێناکات.</p></div></div><div className="social23__queue-actions"><button className="social23__button social23__button--outline" type="button" onClick={() => openNew("news")}><Plus size={16} />هەواڵ</button><button className="social23__button social23__button--outline" type="button" onClick={() => openNew("trailer")}><Plus size={16} />ترەیلەر</button><button className="social23__button social23__button--gold" type="button" onClick={() => openNew("promotion")}><Plus size={16} />ناسـاندنی کاڵۆگ</button></div></div>
         {loading ? <div className="social23__empty"><Loader2 className="social23__spin" size={20} />بارکردنی ڕیز…</div> : queued.length ? <div className="social23__queue-list">{queued.map(job => <article className="social23__queue-item" key={job.id}><time>{localBaghdadTime(job.scheduledAt).slice(11) || "--:--"}</time><div className="social23__queue-main"><span className={`social23__kind social23__kind--${job.contentKind || "news"}`}>{KIND_LABEL[job.contentKind || "news"]}</span><h3>{job.title || "بێ ناونیشان"}</h3><p>{job.caption}</p><small>{job.platforms.join(" · ")} · {job.status} · {job.approvalStatus === "approved" ? "پەسەندکراو" : "چاوەڕوانی پەسەندکردنی دەستی"} · Asia/Baghdad</small></div><span className="social23__preview-tag">{readiness?.mode || "DRY_RUN"}</span><div className="social23__item-actions">{job.approvalStatus !== "approved" && <button className="social23__approve-button" type="button" aria-label={`پەسەندکردنی ${job.title || "پۆست"}`} onClick={() => void approveJob(job)} disabled={busyId === job.id}><Check size={14} />پەسەندکردن</button>}<button type="button" aria-label={`دەستکاری ${job.title || "پۆست"}`} onClick={() => openEdit(job)}><Pencil size={16} /></button><button type="button" aria-label={`هەڵوەشاندنەوەی ${job.title || "پۆست"}`} onClick={() => void cancelJob(job)} disabled={busyId === job.id}><Trash2 size={16} /></button></div></article>)}</div> : <div className="social23__empty">هیچ پۆستێک لە ڕیزدا نییە.</div>}
      </section>

      <section className="social23__grid social23__bottom-row"><article className="social23__panel social23__history"><div className="social23__section-heading"><div><span className="social23__section-icon"><Clock3 size={18} /></span><div><h2>مێژوو و دۆخی گەیاندن</h2><p>تەنها ئەو دۆخانەی backend تۆماری کردوونی.</p></div></div></div>{history.length ? <div className="social23__history-list">{history.map(job => <div key={job.id}><strong>{job.title || job.id.slice(0, 10)}</strong><span>{job.status} · {new Date(job.createdAt).toLocaleString("ckb-IQ")}</span>{Object.entries(job.platformStatus || {}).map(([platform, value]) => <small key={platform}>{platform}: {value?.status || "-"}{value?.errorCode ? ` · ${value.errorCode}` : ""}</small>)}</div>)}</div> : <div className="social23__empty social23__empty--small">مێژووی گەیاندن هێشتا بەتاڵە.</div>}</article><article className="social23__panel social23__history"><div className="social23__section-heading"><div><span className="social23__section-icon"><AlertTriangle size={18} /></span><div><h2>سەرچاوە و مافەکان</h2><p>پێویستە پێش ناردنی ناوەڕۆک دڵنیابکرێتەوە.</p></div></div></div><div className="social23__empty social23__empty--small">هەواڵی خۆکار ناچالاکە تا provider ـێکی پشتڕاستکراو دابنرێت. ڤیدیۆ و وێنە دەبێت بە مافی بڵاوکردنەوە بن.</div></article></section>

      {editorOpen && <div className="social23__modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditorOpen(false); }}><form className="social23__editor" dir="rtl" onSubmit={submitPost} aria-labelledby="social23-editor-title"><div className="social23__section-heading"><div><span className="social23__section-icon"><Pencil size={18} /></span><div><h2 id="social23-editor-title">{editing ? "دەستکاری پۆستی ڕیزکراو" : "پۆستی نوێ زیاد بکە"}</h2><p>کاتی Asia/Baghdad · پەخشکردن ناچالاکە.</p></div></div><button type="button" className="social23__close" onClick={() => setEditorOpen(false)} aria-label="داخستن">×</button></div>
        <label>جۆری ناوەڕۆک<select value={editor.kind} disabled={Boolean(editing)} onChange={event => setEditor(value => ({ ...value, kind: event.target.value as PostKind }))}>{Object.entries(KIND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {editor.kind === "promotion" && !editing ? <label>فیلم/زنجیرەی بەردەست لە کاڵۆگ<select value={editor.movieId} onChange={event => { const movie = catalogMovies.find(item => item.id === event.target.value); setEditor(value => ({ ...value, movieId: event.target.value, title: movie?.title || "" })); }} required><option value="">هەڵبژێرە…</option>{catalogMovies.filter(movie => movie.id && movie.title).map(movie => <option key={movie.id} value={movie.id}>{movie.title}{movie.year ? ` (${movie.year})` : ""}</option>)}</select></label> : <label>ناونیشان<input value={editor.title} onChange={event => setEditor(value => ({ ...value, title: event.target.value }))} maxLength={200} required /></label>}
        <label>دەقی کوردی<textarea value={editor.caption} onChange={event => setEditor(value => ({ ...value, caption: event.target.value }))} maxLength={5000} rows={4} required /></label>
        {!editing && <><label>پلاتفۆرمە چالاکەکان<div className="social23__editor-platforms">{CHANNELS.map(({ id, name }) => <label className="social23__check" key={id}><input type="checkbox" checked={editor.platforms.includes(id)} disabled={!settings.platforms[id]} onChange={event => setEditor(value => ({ ...value, platforms: event.target.checked ? [...new Set([...value.platforms, id])] : value.platforms.filter(item => item !== id) }))} /><span>{name}{settings.platforms[id] ? "" : " · ناچالاک"}</span></label>)}</div></label><label>میدیا<select value={editor.mediaType} onChange={event => setEditor(value => ({ ...value, mediaType: event.target.value as Editor["mediaType"] }))}><option value="text">تەنها دەق</option><option value="image">وێنەی هاوبەشکراو</option><option value="video">ڤیدیۆی هاوبەشکراو</option></select></label>{editor.mediaType !== "text" && <><label>بەستەری میدیای HTTPS<input type="url" value={editor.mediaUrl} onChange={event => setEditor(value => ({ ...value, mediaUrl: event.target.value }))} placeholder="https://…" required /></label><label className="social23__check"><input type="checkbox" checked={editor.rightsConfirmed} onChange={event => setEditor(value => ({ ...value, rightsConfirmed: event.target.checked }))} /><span>مافی بڵاوکردنەوەی ئەم میدیایەم هەیە</span></label></>}</>}
        <label>کاتی پۆستکردن · Asia/Baghdad<input type="datetime-local" value={editor.localTime} onChange={event => setEditor(value => ({ ...value, localTime: event.target.value }))} required /></label>{editorError && <p className="social23__error" role="alert">{editorError}</p>}<div className="social23__editor-actions"><button className="social23__button social23__button--outline" type="button" onClick={() => setEditorOpen(false)}>پاشگەزبوونەوە</button><button className="social23__button social23__button--gold" type="submit" disabled={busyId === "editor" || !editor.localTime}>{busyId === "editor" ? <Loader2 className="social23__spin" size={16} /> : <Check size={16} />}{editing ? "پاشەکەوتی دەستکاری" : "خستنە ڕیزی پۆست"}</button></div>
      </form></div>}
    </main>
  );
}
