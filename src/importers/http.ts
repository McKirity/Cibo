/**
 * The importers' transport tier — Rust-side fetches only (`tauri-plugin-http`;
 * the webview never talks to the network, [[Importer Runtime & External
 * Access]]), with the ruled retry policy baked in at the ONE call site:
 * **one polite backoff retry on 429/5xx, honoring `Retry-After`, nothing
 * more** — no background retry loops. The old plugin had NO 429 handling
 * anywhere (the 2026-07-31 survey); this is genuinely new machinery.
 *
 * Thumbs are fetched through the same path into blob URLs — an `<img>` with a
 * remote src would be the webview talking to the network, which the ruling
 * bars regardless of CSP.
 */

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
/** Fallback backoff when a 429 carries no Retry-After (seconds). */
const DEFAULT_BACKOFF_S = 2;
const MAX_BACKOFF_S = 30;

export class HttpFail extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const rustFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  // Lazy import — the feeds.ts precedent: top-level import crashes outside a
  // Tauri runtime (tests, plain Vite).
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  return tauriFetch(url, { signal: AbortSignal.timeout(15_000), ...init });
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with the ruled one-retry policy. Returns the Response on 2xx; throws
 * `HttpFail` with the final status otherwise (per-item failure collection is
 * the engine's job — one bad item never aborts the batch).
 */
export const importFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  let res: Response;
  try {
    res = await rustFetch(url, init);
  } catch (e) {
    // Transport-level failure (offline, DNS, timeout) — one retry too.
    await sleep(DEFAULT_BACKOFF_S * 1000);
    res = await rustFetch(url, init);
  }
  if (res.ok) return res;
  if (!RETRY_STATUSES.has(res.status)) throw new HttpFail(res.status, `HTTP ${res.status}`);
  const retryAfter = Number(res.headers.get("retry-after"));
  const backoffS = Number.isFinite(retryAfter)
    ? Math.min(Math.max(retryAfter, 1), MAX_BACKOFF_S)
    : DEFAULT_BACKOFF_S;
  await sleep(backoffS * 1000);
  const second = await rustFetch(url, init);
  if (second.ok) return second;
  throw new HttpFail(second.status, `HTTP ${second.status} after one backoff retry`);
};

/** JSON convenience over importFetch. */
export const importJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  const res = await importFetch(url, init);
  return (await res.json()) as unknown;
};

// ── Thumb cache (blob URLs for the results grid) ─────────────────────────────

const thumbCache = new Map<string, Promise<string | null>>();

/**
 * Remote cover → blob URL, cached per URL for the session. Failure resolves
 * null (the capsule lettermark renders) — a thumb is never worth an error.
 * No retry here: thumbs are cosmetic, the polite policy is for data fetches.
 */
export const thumbBlob = (url: string): Promise<string | null> => {
  const hit = thumbCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    try {
      // Calibre thumbs are LOCAL covers riding the calibre: pseudo-URL —
      // bytes over IPC, not a network fetch (lazy import, cycle-free).
      if (url.startsWith("calibre:")) {
        const { calibreCoverBytes } = await import("./calibre");
        const bytes = await calibreCoverBytes(url.slice("calibre:".length));
        return URL.createObjectURL(new Blob([bytes as BlobPart]));
      }
      const res = await rustFetch(url);
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      return URL.createObjectURL(new Blob([bytes]));
    } catch {
      return null;
    }
  })();
  thumbCache.set(url, p);
  return p;
};
