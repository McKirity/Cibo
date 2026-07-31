/** The malformed-habit routing fallback. Split out of Shell.tsx 2026-07-30 (dedup pass wave 4). */

/** The routing fallback: every template exists (step 6 closed), so reaching
 * this means the habit row carries a kind/sub_type the derived-template rule
 * cannot place — malformed data, not a missing screen. */
export function NotYetDashboard({ habitKey }: { habitKey: string }) {
  return (
    <div className="gsdash">
      <div className="emptybox gen" style={{ maxWidth: 640 }}>
        <div className="eh">{habitKey} — no dashboard template applies</div>
        <div className="es">
          This habit's stored kind/sub_type doesn't match any template (consumption · creation ·
          simple · range), so its dashboard can't be derived. The habit row likely needs repair.
        </div>
      </div>
    </div>
  );
}
