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

/**
 * **The ruled policy is "one polite backoff retry on 429/5xx", so this asks
 * whether the status IS 5xx** — it used to enumerate `[429, 500, 502, 503,
 * 504]`, four codes standing in for a whole class (`http-1`, 2026-08-08).
 *
 * AO3 sits behind Cloudflare, which answers origin trouble with its own
 * **520–527** range; a live **525** (TLS handshake to the origin failed)
 * therefore fell outside the list and was reported instantly with no retry —
 * exactly the transient case the ruling exists for. *An implementation that
 * enumerates members of a class the ruling names is narrower than the ruling,
 * and the gap only shows when a real service picks a code nobody listed.*
 *
 * 501 and 505 are permanent and will not improve on a retry; they cost one
 * wasted request each, which is the ruled cost and cheaper than maintaining a
 * list that the next unlisted code breaks again.
 */
const shouldRetryStatus = (status: number): boolean =>
  status === 429 || (status >= 500 && status <= 599);

/** Fallback backoff when a 429 carries no Retry-After (seconds). */
const DEFAULT_BACKOFF_S = 2;
const MAX_BACKOFF_S = 30;

/**
 * A status, said in words. `engine.ts` surfaces `err.message` straight onto the
 * item's row, so this text IS the failure the user reads — and a bare
 * "HTTP 525" tells them nothing about what broke, whose side it is on, or
 * whether waiting helps (`http-2`, 2026-08-08: the user had to ask).
 */
const describeStatus = (status: number): string => {
  // Cloudflare's origin-error range: the CDN answered, the site behind it did
  // not. Naming that is the difference between "this app is broken" and "the
  // service is having trouble" — and it is the second reading that is true.
  if (status >= 520 && status <= 527)
    return `HTTP ${status} — the site's own server did not answer its front-end. That is trouble on their side, not this app's; it usually clears on its own, so try again later.`;
  if (status === 429)
    return `HTTP 429 — the service is rate-limiting this address. Wait a while before importing again.`;
  if (status >= 500)
    return `HTTP ${status} — the service is having trouble on its side. Try again later.`;
  if (status === 404) return `HTTP 404 — not found. The item may have been deleted or made private.`;
  if (status === 401 || status === 403)
    return `HTTP ${status} — the service refused the request. The item may be private, or it is turning this app away.`;
  return `HTTP ${status}`;
};

export class HttpFail extends Error {
  constructor(
    public status: number,
    message: string = describeStatus(status),
  ) {
    super(message);
  }
}

/**
 * THE IDENTIFYING USER-AGENT (added 2026-08-03, at the health home's first
 * live probe run).
 *
 * `tauri-plugin-http` is reqwest underneath, and **reqwest sends no
 * User-Agent at all** — unlike curl or a browser, which always do. **AO3
 * answers a UA-less request with a flat 403**, so every AO3 fetch this app
 * made was refused: the probe reported "unreachable" while the site was open
 * in a browser on the same machine, which is what surfaced it. Verified both
 * ways from this machine — no UA → 403, identifying UA → 200.
 *
 * It is set for EVERY importer request, not just AO3's: identifying yourself
 * is the polite convention for anything scraping or calling an API, AO3's own
 * guidance asks for it, and a header the other seven sources ignore costs
 * nothing. Honest rather than a browser impersonation — a spoofed Chrome
 * string would be a lie told to the service that would then be unmaintainable
 * (it dates, and it hides who is actually calling).
 */
const USER_AGENT = `Cibo/${__APP_VERSION__} (personal habit tracker; +https://github.com/McKirity/Cibo)`;

/**
 * The per-request budget. **It covers the WHOLE request, headers AND body** —
 * `AbortSignal.timeout` starts when the request does, and the plugin wires the
 * signal to the body stream as well as the fetch.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The plugin's cancellation string, matched rather than guessed: on abort it
 * calls `controller.error('Request cancelled')` on the BODY stream. That is
 * what a timed-out download surfaces as, and reporting it verbatim is what made
 * a 15-second timeout read as something the user had done (`ao3-1`).
 */
const PLUGIN_CANCELLED = "Request cancelled";

/** Was this failure our own timeout firing, in either phase? */
const isTimeout = (e: unknown): boolean => {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError"))
    return true;
  return String(e).includes(PLUGIN_CANCELLED);
};

/** A timeout, said honestly — with the budget it actually waited. */
export class HttpTimeout extends Error {
  constructor(public readonly ms: number) {
    super(`timed out after ${Math.round(ms / 1000)}s`);
  }
}

const rustFetch = async (
  url: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> => {
  // Lazy import — the feeds.ts precedent: top-level import crashes outside a
  // Tauri runtime (tests, plain Vite).
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  // Merge rather than overwrite: AniList's POST sets its own content-type, and
  // a caller that names a UA explicitly keeps it.
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", USER_AGENT);
  // ⚠ `signal` is set AFTER the `...init` spread, deliberately. It used to sit
  // before it, which meant any caller passing its own `init.signal` — even an
  // explicit `undefined` — silently discarded the timeout and got a request
  // that could hang forever. No caller does today; it was a trap, not a live
  // bug, and it is closed by ordering rather than left to be discovered.
  return tauriFetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with the ruled one-retry policy. Returns the Response on 2xx; throws
 * `HttpFail` with the final status otherwise (per-item failure collection is
 * the engine's job — one bad item never aborts the batch).
 */
export const importFetch = async (
  url: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> => {
  let res: Response;
  try {
    res = await rustFetch(url, init, timeoutMs);
  } catch (e) {
    // Transport-level failure (offline, DNS, timeout) — one retry too.
    // Implementation, user-accepted 2026-08-06 (Phase-2 completion audit):
    // this retry class is DISTINCT from the ruled one-backoff-retry on
    // 429/5xx below — transport failure is not the rate-limit case that
    // ruling guarded. Composite worst case (transport retry → 429 → backoff)
    // is three requests, accepted as recorded. The record lives in
    // [[Importer Runtime & External Access]] § Error / rate-limit policy.
    await sleep(DEFAULT_BACKOFF_S * 1000);
    try {
      res = await rustFetch(url, init, timeoutMs);
    } catch (e2) {
      // Say TIMEOUT when it was one. Reporting the plugin's raw wording made a
      // budget we chose read as an action the user took (`ao3-1`).
      if (isTimeout(e2)) throw new HttpTimeout(timeoutMs);
      throw e2;
    }
  }
  if (res.ok) return res;
  if (!shouldRetryStatus(res.status)) throw new HttpFail(res.status);
  const retryAfter = Number(res.headers.get("retry-after"));
  const backoffS = Number.isFinite(retryAfter)
    ? Math.min(Math.max(retryAfter, 1), MAX_BACKOFF_S)
    : DEFAULT_BACKOFF_S;
  await sleep(backoffS * 1000);
  const second = await rustFetch(url, init, timeoutMs);
  if (second.ok) return second;
  // "after one backoff retry" matters to the reader: it says the app already
  // waited and tried again, so this is not a first blip to shrug off.
  throw new HttpFail(
    second.status,
    `${describeStatus(second.status)} (already retried once)`,
  );
};

/**
 * Fetch **and read the body** under one protected call — the shape every data
 * fetch should use (`ao3-1`, 2026-08-08).
 *
 * The bug this exists to end: `importFetch` returns as soon as the HEADERS
 * arrive, and callers then did `await res.text()` / `res.json()` outside it. But
 * the timeout covers the whole request, and the plugin wires the abort signal to
 * the **body stream** — so a slow download aborted mid-flight threw from the
 * caller's `.text()`, *outside the try/catch that owns retries*. The retry
 * therefore covered only the fast half of a request, and the slow half — the
 * half that actually fails — had no protection at all. On an AO3 work page that
 * is a ~15 s wait ending in the word "cancelled".
 *
 * Reading inside the protected region also means a body-phase failure now gets
 * the same one polite retry a header-phase failure has always had.
 */
export interface ReadResult<T> {
  /** The body, or null when `stopIf` stopped us before reading it. */
  value: T | null;
  /** The response's FINAL url, after redirects. */
  url: string;
  stopped: boolean;
}

const importRead = async <T,>(
  url: string,
  read: (res: Response) => Promise<T>,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  /**
   * Inspect the response BEFORE its body is read, and stop if it is not worth
   * reading. Runs after headers (so `res.url` is final, redirects followed) and
   * before a single byte of body is pulled.
   *
   * AO3 is the tenant: a restricted work answers with a redirect to the login
   * page, and the app used to download that whole page only to throw it away
   * once it checked the url. Detecting at the header is what makes "cancel the
   * import as soon as it detects" true rather than approximately true.
   */
  stopIf?: (res: Response) => boolean,
): Promise<ReadResult<T>> => {
  const once = async (): Promise<ReadResult<T>> => {
    const res = await importFetch(url, init, timeoutMs);
    if (stopIf?.(res) === true) {
      // Release the stream we are declining to read, rather than leaving the
      // Rust side holding a body nobody will consume.
      void res.body?.cancel().catch(() => {});
      return { value: null, url: res.url, stopped: true };
    }
    return { value: await read(res), url: res.url, stopped: false };
  };
  try {
    return await once();
  } catch (e) {
    // An HTTP status failure has already spent its own retry inside
    // `importFetch`; only re-run for transport/body failures.
    if (e instanceof HttpFail) throw e;
    if (!isTimeout(e)) throw e;
    await sleep(DEFAULT_BACKOFF_S * 1000);
    try {
      return await once();
    } catch (e2) {
      if (isTimeout(e2)) throw new HttpTimeout(timeoutMs);
      throw e2;
    }
  }
};

/**
 * Body-as-text, with the response's FINAL url (after redirects) — AO3 needs
 * both, and reading them separately is what let the body read escape the retry.
 */
export const importText = (
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
  stopIf?: (res: Response) => boolean,
): Promise<ReadResult<string>> => importRead(url, (r) => r.text(), init, timeoutMs, stopIf);

/** JSON convenience — body read inside the protected call, as above. */
export const importJson = async (
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<unknown> => (await importRead(url, (r) => r.json() as Promise<unknown>, init, timeoutMs)).value;

/**
 * Body-as-bytes, same protection. Cover downloads are the other real payload
 * the app pulls — a stalled image read had exactly the same escape hatch as
 * AO3's text read, and `covers.ts` is the WRITE half of the image pipeline, so
 * a half-read cover is a file on disk.
 */
export const importBytes = async (
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Uint8Array> => {
  // No `stopIf` here, so `value` is always present; the null is the stopped
  // case, which only the AO3 caller can produce.
  const read = await importRead(url, (r) => r.arrayBuffer(), init, timeoutMs);
  return new Uint8Array(read.value ?? new ArrayBuffer(0));
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
