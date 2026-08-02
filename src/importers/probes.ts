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

/** Run the active source's probe with the offline baseline folded in. */
export const threeWayProbe = async (source: ImporterSource): Promise<ProbeVerdict> => {
  // Service probe first — if it passes, the baseline never needs to run.
  const probe = await source.probe();
  if (probe.ok) return { ok: true, message: `${probe.detail} ✓` };
  const net = await baseline();
  if (!net)
    return {
      ok: false,
      message: "Offline — the network itself is unreachable, not just this service.",
    };
  return { ok: false, message: `Network is up; ${probe.detail}` };
};
