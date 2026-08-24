/* ===========================================================================
 * SubtitleJobStatus
 * ---------------------------------------------------------------------------
 * Live status card for the background Kurdish Sorani (ckb) subtitle pipeline.
 * Replaces the old static "وەردەگێڕدرێت..." pill with real progress feedback:
 *   - Current pipeline stage (locating source -> downloading -> translating)
 *   - Retry-attempt info surfaced from the server job record
 *   - Estimated time remaining until the track is ready
 *   - Slow-network warning (measured poll latency + parent delay detector)
 *   - Rich error state with reason + retry action
 *
 * Data source: GET /api/subtitles/job/:movieId (read-only job inspector).
 * The card polls only while the parent pipeline reports "loading" and the
 * surface is actually visible, then stops automatically.
 * =========================================================================== */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Pause, RefreshCw, SignalHigh, SignalLow } from "lucide-react";

export type SubtitleJobUiStatus = "idle" | "loading" | "ready" | "error";

interface SubtitleJobRecord {
  status?: string;
  attempts?: number;
  lastError?: string | null;
  updatedAt?: string;
}

interface SubtitleJobResponse {
  job?: SubtitleJobRecord | null;
}

export interface SubtitleJobStatusProps {
  /** Mirrors the parent subtitle pipeline state */
  status: SubtitleJobUiStatus;
  /** Pipeline message from the parent (shown verbatim when present) */
  message?: string;
  /** Movie id — enables live job polling when provided */
  movieId?: string;
  /** Only render/poll while the owning player surface is active */
  enabled?: boolean;
  /** Parent-detected slow subtitle load (existing delayed-load heuristic) */
  delayedLoad?: boolean;
  /** Retry handler surfaced on the error card */
  onRetry?: () => void;
}

const POLL_INTERVAL_MS = 4000;
/** Latency above this marks the connection as slow for the user. */
const SLOW_POLL_LATENCY_MS = 1800;
/** Base seconds budget used for the ETA estimate. */
const BASE_ETA_BUDGET_S = 35;
/** Extra seconds added per retry attempt (server backoff is 5s/30s/120s). */
const RETRY_ETA_PENALTY_S = 25;

/** Short human stage labels (Kurdish Sorani) keyed by pipeline phase. */
const STAGE_LOCATING = "بەدواگەڕانی سەرچاوەی ژێرنووس...";
const STAGE_DOWNLOADING = "دابەزاندنی ژێرنووسی ڕەسەن...";
const STAGE_TRANSLATING = "وەرگێڕان بۆ کوردی سۆرانی...";
const STAGE_QUEUED = "لە ڕیزدا چاوەڕوانی نۆرە...";
const SLOW_NETWORK_LINE =
  "ئینتەرنێت خاویە — پەیوەندی هێواشە، ئامادەکردنی ژێرنووس کەمێک دەخایەنێت";

function formatEta(seconds: number): string {
  const clamped = Math.max(3, Math.round(seconds));
  return `نزیکەی ${clamped} چرکەی ماوە تا ئامادەبوون`;
}

/**
 * Picks the friendliest label for a failed attempt. Server errors are often
 * technical English strings; show them as-is (they are short) but fall back
 * to a Kurdish generic line when missing.
 */
function formatErrorLine(message: string | undefined, lastError: string | null | undefined): string {
  return message || lastError?.slice(0, 120) || "دروستکردنی ژێرنووس سەرکەوتوو نەبوو";
}

export function SubtitleJobStatus({
  status,
  message,
  movieId,
  enabled = true,
  delayedLoad = false,
  onRetry,
}: SubtitleJobStatusProps) {
  const [job, setJob] = useState<SubtitleJobRecord | null>(null);
  const [pollLatencyMs, setPollLatencyMs] = useState<number | null>(null);
  // Wall-clock seconds since the loading phase started (drives stage + ETA).
  const [elapsedS, setElapsedS] = useState(0);
  const loadingSinceRef = useRef<number | null>(null);

  // Track when the current loading window began so stages/ETA stay honest
  // across language switches (each new "loading" restarts the clock).
  useEffect(() => {
    if (status === "loading") {
      if (loadingSinceRef.current === null) {
        loadingSinceRef.current = Date.now();
        setElapsedS(0);
      }
    } else {
      loadingSinceRef.current = null;
      setElapsedS(0);
      setJob(null);
      setPollLatencyMs(null);
    }
  }, [status]);

  // 1s heartbeat for stage progression + ETA countdown while loading.
  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setInterval(() => {
      if (loadingSinceRef.current !== null) {
        setElapsedS(Math.floor((Date.now() - loadingSinceRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  // Live job polling — only while the pipeline is working and the surface
  // that owns this card is actually mounted/visible.
  useEffect(() => {
    if (status !== "loading" || !enabled || !movieId) return;
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      const startedAt = Date.now();
      try {
        const res = await fetch(`/api/subtitles/job/${encodeURIComponent(movieId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`job poll ${res.status}`);
        const data = (await res.json()) as SubtitleJobResponse;
        if (cancelled) return;
        setJob(data.job || null);
        setPollLatencyMs(Date.now() - startedAt);
      } catch {
        // Network hiccup — record a high latency so the slow-net hint shows,
        // but keep the previous job snapshot instead of clearing progress.
        if (!cancelled) setPollLatencyMs((prev) => prev ?? SLOW_POLL_LATENCY_MS + 1);
      }
    };

    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [status, enabled, movieId]);

  if (!enabled || status === "idle" || status === "ready") return null;

  /* ------------------------------------------------------------------ */
  /* Loading / generating — live progress card                           */
  /* ------------------------------------------------------------------ */
  if (status === "loading") {
    const jobStatus = (job?.status || "").toLowerCase();
    const attempts = job?.attempts && job.attempts > 0 ? job.attempts : 0;

    // Stage inference: prefer explicit server states, otherwise walk forward
    // through typical phase timings (locate ~5s, download ~10s, then translate).
    let stageText = message || STAGE_TRANSLATING;
    if (message) {
      stageText = message;
    } else if (jobStatus === "queued") {
      stageText = STAGE_QUEUED;
    } else if (elapsedS < 6) {
      stageText = STAGE_LOCATING;
    } else if (elapsedS < 16) {
      stageText = STAGE_DOWNLOADING;
    } else {
      stageText = STAGE_TRANSLATING;
    }

    const etaBudget = BASE_ETA_BUDGET_S + attempts * RETRY_ETA_PENALTY_S;
    const slowNetwork = delayedLoad || (pollLatencyMs !== null && pollLatencyMs > SLOW_POLL_LATENCY_MS);

    return (
      <div className="pointer-events-none flex justify-center px-4">
        <div className="flex max-w-full flex-col gap-1 rounded-xl border border-white/10 bg-black/85 px-4 py-2.5 shadow-[0_4px_18px_rgba(0,0,0,0.8)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-primary" />
            <span className="kurdish-text text-[11px] font-bold text-zinc-200" dir="auto">
              {stageText}
            </span>
            {attempts > 1 && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black text-amber-300">
                هەوڵی {attempts}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 pl-6">
            <span className="text-[9px] font-bold tabular-nums text-zinc-500 kurdish-text" dir="auto">
              {formatEta(Math.max(3, etaBudget - elapsedS))}
            </span>
            {slowNetwork ? (
              <>
                <SignalLow className="h-3 w-3 shrink-0 animate-pulse text-amber-400" />
                <span className="kurdish-text truncate text-[9px] font-bold text-amber-300" dir="auto">
                  {delayedLoad ? "ئینتەرنێت خاویە — تکایە ڤیدیۆکە وەستێنە (Pause)" : SLOW_NETWORK_LINE}
                </span>
              </>
            ) : (
              <SignalHigh className="h-3 w-3 shrink-0 text-emerald-500/70" />
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Error — reason + retry                                              */
  /* ------------------------------------------------------------------ */
  return (
    <div className="flex justify-center px-4">
      <div className="flex max-w-full items-center gap-2 rounded-xl border border-red-500/25 bg-red-950/85 px-4 py-2.5 shadow-[0_4px_18px_rgba(0,0,0,0.8)] backdrop-blur-md">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
        <span className="kurdish-text text-[11px] font-bold text-red-200" dir="auto">
          {formatErrorLine(message, job?.lastError)}
        </span>
        {typeof delayedLoad === "boolean" && delayedLoad && (
          <Pause className="h-3 w-3 shrink-0 animate-pulse text-amber-400" />
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 text-[10px] font-black text-red-100 transition-colors hover:bg-red-500/40"
            title="Retry subtitle generation"
          >
            <RefreshCw className="h-3 w-3" />
            <span className="kurdish-text">دووبارە</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default SubtitleJobStatus;
