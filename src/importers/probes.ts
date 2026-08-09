/**
 * The probe surface — the ruled THREE-WAY DIAGNOSIS ([[Importer Runtime &
 * External Access]] § the test probe; [[App Health & Diagnostics]] owns the
 * eventual health-home surface, these are the mechanics):
 *
 *   baseline fails too            → OFFLINE (the network itself)
 *   baseline ok, probe fails      → the service or our config (the probe's
 *                                    own detail says which — bad key, bad
 *                                    path, 5xx)
 *   both pass                     → all clear
 *
 * The neutral baseline is one `generate_204`-style GET (the design note left
 * the exact target to Build: `www.gstatic.com/generate_204` — Google's
 * standard connectivity endpoint, 204, no body, no cookies). On-demand only,
 * never background polling; the import-failure state offers this one-click.
 */
import { importFetch } from "./http";
import type { ImporterSource } from "./types";

const BASELINE_URL = "https://www.gstatic.com/generate_204";

/**
 * **Ten seconds PER PHASE, so twenty in total** (user-ruled 2026-08-08).
 *
 * A first pass gave the whole diagnosis one shared 20 s budget, which is worse
 * for the reason the user named: a slow service probe eats the pot and leaves
 * the baseline a sliver — and **the baseline is the phase that distinguishes
 * "you are offline" from "their server is down"**. A diagnosis that cannot say
 * which of the two it is has lost most of its value, so the phase that carries
 * the distinction gets a guaranteed slice rather than the remainder.
 *
 * Why any ceiling at all: offline, each request is two attempts with a backoff
 * between them, and an attempt burns its full timeout when the network
 * SWALLOWS connections rather than refusing them. Unbounded, service + baseline
 * could legitimately sit silent for about a minute. A probe is a question the
 * user asked and is waiting on; it owes an answer on a human timescale, and
 * "no answer in 10s" IS an answer.
 */
const PHASE_BUDGET_MS = 10_000;

/** Resolve to `fallback` if `p` has not settled in time. Never rejects. */
const within = async <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const baseline = async (): Promise<boolean> => {
  try {
    const res = await importFetch(BASELINE_URL);
    return res.status === 204 || res.ok;
  } catch {
    return false;
  }
};

export interface ProbeVerdict {
  ok: boolean;
  /** One legible sentence for the failbox / probe line. */
  message: string;
}

/**
 * Run the active source's probe with the offline baseline folded in.
 *
 * **THIS FUNCTION NEVER REJECTS AND NEVER RUNS LONG** — both guarantees live
 * here rather than at the call sites, because one call site had them and the
 * other did not (2026-08-08). Settings wrapped it in try/catch/finally; the
 * import modal wrote `.then(...)` with no `.catch`, so a rejection left the
 * word "probing…" on screen permanently, with nothing able to clear it. Same
 * function, two callers, one guarded. *A guarantee every caller needs belongs
 * to the callee.*
 *
 * A source's own `probe()` is contracted to return a verdict rather than throw,
 * and they all catch — but two of them (`tmdb`, `youtube`) read an API key
 * OUTSIDE their try, which is exactly the kind of edge that makes "it can't
 * reject" a claim rather than a fact. It is now a fact.
 */
export const threeWayProbe = async (source: ImporterSource): Promise<ProbeVerdict> => {
  const timedOut: ProbeVerdict = {
    ok: false,
    message: `No answer within ${Math.round(PHASE_BUDGET_MS / 1000)}s — the network is not refusing the connection, it is swallowing it. That usually means no route out at all.`,
  };
  // Service probe first — if it passes, the baseline never needs to run, so the
  // common (online) case costs one phase, not two.
  const probe = await within(source.probe(), PHASE_BUDGET_MS, {
    ok: false,
    detail: timedOut.message,
  });
  if (probe.ok) return { ok: true, message: `${probe.detail} ✓` };
  // Its own full slice, never the leftovers — see PHASE_BUDGET_MS.
  const net = await within(baseline(), PHASE_BUDGET_MS, false);
  if (!net)
    return {
      ok: false,
      message: "Offline — the network itself is unreachable, not just this service.",
    };
  return { ok: false, message: `Network is up; ${probe.detail}` };
};
