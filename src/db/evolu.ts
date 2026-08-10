/**
 * The Evolu instance. Both config arguments are spike-mandated (Spike Findings,
 * 2026-07-09) and wrong by default:
 *  - `name` sets the OPFS store directory that backups locate;
 *  - `transports` is the sync courier. The local-only era (`transports: []`,
 *    Build steps 0–15) ended 2026-08-09 at Phase 2 step 3 Track B: the
 *    transport now follows the per-device sync switch (src/db/sync.ts —
 *    default ON, Evolu's free relay, flips take effect at the next launch).
 *    The switch lives in Settings → Storage.
 *
 * Never set COOP/COEP headers — SAHPool needs no cross-origin isolation, and
 * COEP silently breaks Tauri IPC.
 */
import { createEvolu, SimpleName } from "@evolu/common";
import { evoluReactWebDeps } from "@evolu/react-web";
import { Schema } from "./schema";
import { RELAY_URL, syncActiveThisSession } from "./sync";

export const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("Cibo"),
  transports: syncActiveThisSession ? [{ type: "WebSocket", url: RELAY_URL }] : [],
  // The keystone's starter index set — one per question the app asks constantly.
  indexes: (create) => [
    create("sessions_day").on("sessions").column("day"),
    create("sessions_habit_fk").on("sessions").column("habit_fk"),
    create("sessions_entry_fk").on("sessions").column("entry_fk"),
    create("entries_habit_fk").on("entries").column("habit_fk"),
    create("subunit_values_session_fk").on("subunit_values").column("session_fk"),
    create("vocab_options_definition_fk").on("vocab_options").column("definition_fk"),
  ],
});
