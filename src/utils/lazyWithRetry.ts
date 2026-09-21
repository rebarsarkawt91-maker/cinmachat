import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RETRY_PREFIX = "cinemachat:chunk-retry:";

const isChunkLoadError = (error: unknown): boolean => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror|loading chunk .* failed|unable to preload css/i.test(
    message,
  );
};

/**
 * Recovers once from stale, content-hashed deployment assets by reloading the
 * current page. The session marker prevents an unavailable chunk from causing
 * an infinite reload loop; a successful import clears it for future deploys.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importComponent: () => Promise<{ default: T }>,
  chunkName: string,
): LazyExoticComponent<T> {
  const retryKey = `${CHUNK_RETRY_PREFIX}${chunkName}`;

  return lazy(async () => {
    try {
      const module = await importComponent();
      window.sessionStorage.removeItem(retryKey);
      return module;
    } catch (error) {
      let hasRetried = true;
      try {
        hasRetried = window.sessionStorage.getItem(retryKey) === "1";
      } catch {
        // If session storage is unavailable, avoid risking a reload loop.
      }

      if (isChunkLoadError(error) && !hasRetried) {
        console.error(`[LazyLoad] ${chunkName} chunk failed; reloading once.`, error);
        window.sessionStorage.setItem(retryKey, "1");
        window.location.reload();

        // Keep Suspense pending while navigation replaces this document.
        return await new Promise<{ default: T }>(() => undefined);
      }

      console.error(`[LazyLoad] ${chunkName} could not be loaded.`, error);
      throw error;
    }
  });
}
