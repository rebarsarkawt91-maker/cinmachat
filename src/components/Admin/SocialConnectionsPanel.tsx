import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Facebook, Instagram, Link2, RefreshCw, Send, Unlink2, Youtube } from "lucide-react";
import type { OAuthPlatform, SocialConnectionErrorCode, SocialConnectionOverview } from "../../../features/social-publishing/connectionTypes";
import type { SocialPlatform } from "../../../features/social-publishing/types";

const CONNECTIONS_URL = "/api/admin/social-connections";
export const SOCIAL_CONNECTION_CHANNELS = [
  { id: "instagram", name: "Instagram", Icon: Instagram },
  { id: "facebook", name: "Facebook Page", Icon: Facebook },
  { id: "youtube", name: "YouTube", Icon: Youtube },
  { id: "telegram", name: "Telegram", Icon: Send },
] as const;
const ERROR_TEXT: Record<SocialConnectionErrorCode, string> = {
  owner_required: "بۆ بەڕێوەبردنی پەیوەندییەکان بە هەژماری خاوەنی سایت بچۆ ژوورەوە.",
  same_origin_required: "بەم ناونیشانە ناتوانرێت ئەکاونت ببەسترێتەوە. بەشی ٢٣ لە ناونیشانی فەرمی سایت بکەرەوە.",
  connection_unavailable: "ڕێکخستنی پەیوەستکردن یان هەڵگرتنی داتا لە سێرڤەر بەردەست نییە.",
  invalid_input: "زانیارییە داخڵکراوەکان بپشکنە و دووبارە هەوڵ بدەوە.",
  flow_expired: "کاتی هەڵبژاردنی ئەکاونت تەواو بوو. لە نوێوە مۆڵەت بدە.",
  consent_denied: "مۆڵەت نەدرا. ئەگەر دەتەوێت پەیوەستی بکەیت، دووبارە هەوڵ بدەوە.",
  missing_permissions: "مۆڵەتی پێویست نەدراوە. لە پەڕەی پلاتفۆرمەکە مۆڵەتە داواکراوەکان پەسەند بکە.",
  no_eligible_account: "ئەکاونت یان کەناڵێکی ڕێگەپێدراو نەدۆزرایەوە. هەژمار و مۆڵەتەکان بپشکنە.",
  select_youtube_channel: "لە پەڕەی مۆڵەتدانی Google تەنها کەناڵی YouTube ـی مەبەست هەڵبژێرە.",
  grant_unavailable: "مۆڵەتەکە ناکارایە یان بەسەرچووە. دووبارە ئەکاونتەکە ببەستەوە.",
  telegram_post_permission: "بۆتەکە لە کەناڵی Telegram بکە بە ئەدمین و مۆڵەتی Post Messages ـی پێ بدە.",
  account_changed: "پەیوەندییەکە لە دانیشتنێکی تر گۆڕاوە. نوێی بکەرەوە و دووبارە هەوڵ بدەوە.",
  provider_unavailable: "پلاتفۆرمەکە ئێستا وەڵام نادات. کەمێک دواتر دووبارە هەوڵ بدەوە.",
};

function errorText(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(ERROR_TEXT, code)
    ? ERROR_TEXT[code as SocialConnectionErrorCode]
    : ERROR_TEXT.connection_unavailable;
}

async function readResponse<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(errorText(result?.errorCode));
  return result as T;
}

function authorizationLink(platform: OAuthPlatform, value: string): string {
  const url = new URL(value);
  const host = platform === "youtube" ? "accounts.google.com" : "www.facebook.com";
  if (url.protocol !== "https:" || url.host !== host || url.username || url.password) {
    throw new Error(ERROR_TEXT.connection_unavailable);
  }
  return url.toString();
}

const verificationTime = new Intl.DateTimeFormat("ckb-IQ", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Baghdad",
});

interface SocialConnectionsPanelProps {
  request: (path: string, options?: RequestInit) => Promise<Response>;
  platforms: Record<SocialPlatform, boolean>;
  onQueueChange: (platform: SocialPlatform, enabled: boolean) => void;
}

export function SocialConnectionsPanel({ request, platforms, onQueueChange }: SocialConnectionsPanelProps) {
  const requestRef = useRef(request);
  requestRef.current = request;
  const [overview, setOverview] = useState<SocialConnectionOverview | null>(null);
  const [checking, setChecking] = useState(true);
  const [active, setActive] = useState<SocialPlatform | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [chosenId, setChosenId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const info = await readResponse<{ connections: SocialConnectionOverview }>(await requestRef.current(CONNECTIONS_URL));
    setOverview(info.connections);
  }, []);

  useEffect(() => {
    void load().catch(() => setError(ERROR_TEXT.connection_unavailable)).finally(() => setChecking(false));
  }, [load]);

  async function perform(action: () => Promise<void>, successText = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successText);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ERROR_TEXT.connection_unavailable);
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function openPanel(platform: SocialPlatform | null) {
    setActive(platform);
    setChosenId("");
    setAuthorizationUrl("");
    setNotice("");
    setError("");
  }

  async function start(platform: OAuthPlatform) {
    setAuthorizationUrl("");
    setChosenId("");
    const result = await readResponse<{ authorizationUrl: string }>(await requestRef.current(`${CONNECTIONS_URL}/oauth/${platform}/start`, { method: "POST" }));
    setAuthorizationUrl(authorizationLink(platform, result.authorizationUrl));
    await load();
  }

  async function select(platform: OAuthPlatform, flowId: string, accountId: string) {
    await readResponse(await requestRef.current(`${CONNECTIONS_URL}/oauth/${platform}/select`, {
      method: "POST", body: JSON.stringify({ flowId, accountId }),
    }));
    openPanel(null);
    await load();
  }

  function connectTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = JSON.stringify({ botToken: fields.get("botToken"), channel: fields.get("channel") });
    const tokenInput = form.elements.namedItem("botToken");
    if (tokenInput instanceof HTMLInputElement) tokenInput.value = "";
    void perform(async () => {
      await readResponse(await requestRef.current(`${CONNECTIONS_URL}/telegram`, { method: "POST", body: payload }));
      openPanel(null);
      await load();
    }, "کەناڵی Telegram پەیوەست کرا.");
  }

  const canManage = overview?.canManage === true && typeof window !== "undefined" && window.location.origin === overview.origin;
  const activeChannel = SOCIAL_CONNECTION_CHANNELS.find(channel => channel.id === active);
  const flow = active ? overview?.platforms[active].flow : undefined;
  const choices = flow?.phase === "choose" ? flow.choices || [] : [];
  const selected = choices.find(choice => choice.id === chosenId)?.id || (choices.length === 1 ? choices[0].id : "");

  return <>
    {error && <p className="social23__error" role="alert">{error}</p>}
    {notice && <p className="social23__notice" role="status">{notice}</p>}
    {!error && overview?.canManage && !canManage && <p className="social23__connection-hint">{ERROR_TEXT.same_origin_required}</p>}
    {!overview && !checking && <button className="social23__button social23__button--outline" type="button" disabled={busy} onClick={() => void perform(load)}>نوێکردنەوەی ئەکاونتەکان</button>}
    <section className="social23__grid social23__channels" aria-label="دۆخی پلاتفۆرمەکان">
      {SOCIAL_CONNECTION_CHANNELS.map(({ id, name, Icon }) => {
        const status = overview?.platforms[id];
        const account = status?.account;
        const available = status?.available === true;
        const pending = status?.flow?.phase === "choose";
        const label = checking ? "دۆخ دەخوێندرێتەوە…"
          : account?.needsReconnect ? "پێویستی بە پەیوەستکردنەوە هەیە"
          : account ? "پەیوەستە"
          : available ? "پەیوەست نەکراوە" : "ڕێکخستنی سێرڤەر پێویستە";
        return <article className="social23__panel social23__channel social23__connection-card" key={id}>
          <div className="social23__connection-card-head">
            <div className="social23__channel-icon"><Icon size={21} /></div>
            <div className="social23__channel-copy">
              <h2>{name}</h2>
              <p><span className={`social23__status-dot ${account ? account.needsReconnect ? "is-configured" : "is-linked" : ""}`} />{label}</p>
            </div>
          </div>
          {account && <div className="social23__linked-account">
            <strong><bdi>{account.name}</bdi></strong>
            {account.handle && account.handle !== account.name && <small><bdi>{account.handle}</bdi></small>}
            <small>دوایین پشکنین <time dateTime={account.verifiedAt}>{verificationTime.format(new Date(account.verifiedAt))}</time></small>
          </div>}
          <label className="social23__check social23__platform-switch">
            <input type="checkbox" checked={platforms[id]} onChange={event => onQueueChange(id, event.target.checked)} />
            <span>چالاک بۆ ڕیز</span>
          </label>
          {canManage && (available || account) && <div className="social23__connection-actions">
            {available && <button type="button" className="social23__button social23__button--outline" disabled={busy} aria-controls="social23-connection-editor" aria-expanded={active === id} onClick={() => openPanel(id)}>
              <Link2 size={15} />{pending ? "هەڵبژاردنی ئەکاونت" : account ? "گۆڕینی ئەکاونت" : "پەیوەستکردن"}
            </button>}
            {account && available && <button type="button" className="social23__button social23__button--outline" disabled={busy} onClick={() => void perform(async () => {
              await readResponse(await requestRef.current(`${CONNECTIONS_URL}/${id}/verify`, { method: "POST" }));
              await load();
            }, "پەیوەندییەکە پشتڕاست کرایەوە.")}><RefreshCw size={15} />پشکنینەوە</button>}
            {account && <button type="button" className="social23__button social23__button--outline social23__disconnect" disabled={busy} onClick={() => {
              if (!window.confirm(`پەیوەندیی ${name} لە CinamaChat لاببرێت؟`)) return;
              void perform(async () => {
                await readResponse(await requestRef.current(`${CONNECTIONS_URL}/${id}`, { method: "DELETE" }));
                if (active === id) openPanel(null);
                await load();
              }, "پەیوەندییەکە لە CinamaChat لابرا.");
            }}><Unlink2 size={15} />لابردنی پەیوەندی</button>}
          </div>}
        </article>;
      })}
    </section>

    {active && activeChannel && canManage && <section id="social23-connection-editor" className="social23__panel social23__connection-editor" aria-labelledby="social23-connection-title">
      <div className="social23__section-heading">
        <h2 id="social23-connection-title">پەیوەستکردنی {activeChannel.name}</h2>
        <button type="button" className="social23__close" aria-label="داخستنی پەیوەستکردن" disabled={busy} onClick={() => openPanel(null)}>×</button>
      </div>
      {active === "telegram" ? <form className="social23__telegram-form" key={active} onSubmit={connectTelegram}>
        <p>بۆتەکە لە کەناڵ بکە بە ئەدمین و مۆڵەتی Post Messages ـی پێ بدە.</p>
        <label>ناوی کەناڵ یان ناسنامەی کەناڵ
          <input name="channel" dir="ltr" placeholder="@YourChannel" autoComplete="off" minLength={6} maxLength={40} required disabled={busy} />
        </label>
        <label>Bot Token لە BotFather
          <input name="botToken" type="password" dir="ltr" autoComplete="new-password" minLength={26} maxLength={160} required disabled={busy} />
        </label>
        <button className="social23__button social23__button--gold" type="submit" disabled={busy}>پشکنین و پەیوەستکردن</button>
      </form> : choices.length && flow ? <form className="social23__oauth-actions" onSubmit={event => {
        event.preventDefault();
        if (selected) void perform(() => select(active, flow.id, selected), "ئەکاونتەکە پەیوەست کرا.");
      }}>
        <label>ئەکاونتی پەیوەستکراو هەڵبژێرە
          <select value={selected} onChange={event => setChosenId(event.target.value)} disabled={busy} required>
            <option value="" disabled>ئەکاونت هەڵبژێرە</option>
            {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name} ({choice.id})</option>)}
          </select>
        </label>
        <button className="social23__button social23__button--gold" type="submit" disabled={!selected || busy}>جێگیرکردنی پەیوەندی</button>
      </form> : <div className="social23__oauth-actions">
        {flow?.phase === "denied" && <p className="social23__error" role="alert">{errorText(flow.errorCode)}</p>}
        <p>مۆڵەت لە تابی فەرمی پلاتفۆرمەکە بدە. پاشان بگەڕێوە بۆ ئەم تابە و لیستی ئەکاونتەکان نوێ بکەرەوە.</p>
        {authorizationUrl && flow?.phase === "waiting" ? <a className="social23__button social23__button--gold" href={authorizationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />کردنەوەی پەڕەی مۆڵەتدان</a>
          : <button className="social23__button social23__button--gold" type="button" disabled={busy} onClick={() => void perform(() => start(active))}>{flow ? "دەستپێکردنەوەی مۆڵەتدان" : "ئامادەکردنی مۆڵەتدان"}</button>}
        {flow && <button className="social23__button social23__button--outline" type="button" disabled={busy} onClick={() => void perform(load)}><RefreshCw size={15} />نوێکردنەوەی ئەکاونتەکان</button>}
      </div>}
      {busy && <p className="social23__connection-hint" role="status">تکایە چاوەڕێ بکە…</p>}
    </section>}
  </>;
}
