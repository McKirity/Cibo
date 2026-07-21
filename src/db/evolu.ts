/**
 * The Evolu instance. Both config arguments are spike-mandated (Spike Findings,
 * 2026-07-09) and wrong by default:
 *  - `name` sets the OPFS store directory that backups locate;
 *  - `transports: []` keeps the instance local-only — sync is ON by default
 *    (wss://free.evoluhq.com) without it. Stays this way until the Mac joins
 *    (Phase 2).
 *
 * Never set COOP/COEP headers — SAHPool needs no cross-origin isolation, and
 * COEP silently breaks Tauri IPC.
 */
import { createEvolu, SimpleName } from "@evolu/common";
import { evoluReactWebDeps } from "@evolu/react-web";
import { createUseEvolu } from "@evolu/react";
import { Schema } from "./schema";

export const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("Cibo"),
  transports: [],
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

export const useEvolu = createUseEvolu(evolu);
