/// <reference types="vite/client" />

/**
 * The pinned lucide version, injected by vite.config.ts's `define` from this
 * repo's own package.json dependency entry (see there for why the pin, not
 * lucide's own package.json, is the source). Read by Settings → Habits → Icons.
 */
declare const __LUCIDE_VERSION__: string;
