type BatchOptions<T, R> = {
  signal: AbortSignal;
  shouldPause: () => boolean;
  translate: (batch: T[], signal: AbortSignal) => Promise<R[]>;
  onSuccess: (batch: T[], result: R[]) => void;
  onRetry?: (batch: T[], attempt: number) => void;
  onFailure?: (batch: T[], error: unknown) => void;
  shouldRetry?: (error: unknown) => boolean;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Retry failed Gemini batches, then isolate hard cues without losing later batches. */
export async function runResilientStudioBatches<T, R>(items: T[], options: BatchOptions<T, R>) {
  const queue: T[][] = Array.from({ length: Math.ceil(items.length / 20) }, (_, index) =>
    items.slice(index * 20, (index + 1) * 20));
  const failed: T[] = [];
  let completed = 0;

  while (queue.length) {
    if (options.signal.aborted || options.shouldPause()) return { completed, failed, paused: true };
    const batch = queue.shift()!;
    let succeeded = false;
    let lastError: unknown;

    for (let retry = 0; retry <= 3; retry += 1) {
      if (options.signal.aborted || options.shouldPause()) return { completed, failed, paused: true };
      try {
        const result = await options.translate(batch, options.signal);
        if (result.length !== batch.length) throw new Error("Gemini returned an incomplete subtitle batch");
        options.onSuccess(batch, result);
        completed += batch.length;
        succeeded = true;
        break;
      } catch (error) {
        if (options.signal.aborted) return { completed, failed, paused: true };
        if (options.shouldRetry && !options.shouldRetry(error)) throw error;
        lastError = error;
        if (retry < 3 && !options.shouldPause()) {
          options.onRetry?.(batch, retry + 1);
          await (options.wait || waitForRetry)(2000, options.signal);
        }
      }
    }
    if (succeeded) continue;
    if (options.shouldPause()) return { completed, failed, paused: true };

    // 20 -> 10 -> 1: a permanently bad cue must not strand its neighbors.
    if (batch.length > 1) {
      const nextSize = batch.length > 10 ? 10 : 1;
      const pieces = Array.from({ length: Math.ceil(batch.length / nextSize) }, (_, index) =>
        batch.slice(index * nextSize, (index + 1) * nextSize));
      queue.unshift(...pieces);
    } else {
      failed.push(...batch);
      options.onFailure?.(batch, lastError);
    }
  }

  return { completed, failed, paused: false };
}
