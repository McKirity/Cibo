import { createEvolu, id, NonEmptyString1000, SimpleName } from "@evolu/common";
import { evoluReactWebDeps } from "@evolu/react-web";
import { createUseEvolu } from "@evolu/react";

// Placeholder schema — proves the wiring boots. Replaced wholesale by the real
// 8-table schema at Build step 2 (Data Layer).
const PlaceholderId = id("Placeholder");

const Schema = {
  placeholder: {
    id: PlaceholderId,
    title: NonEmptyString1000,
  },
};

export const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("Cibo"), // sets the OPFS store directory
  transports: [], // local-only; without this Evolu syncs to wss://free.evoluhq.com
});

export const useEvolu = createUseEvolu(evolu);
