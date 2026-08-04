/// <reference types="vite/client" />

/**
 * The pinned lucide version, injected by vite.config.ts's `define` from this
 * repo's own package.json dependency entry (see there for why the pin, not
 * lucide's own package.json, is the source). Read by Settings → Habits → Icons.
 */
declare const __LUCIDE_VERSION__: string;

/** The app's own version, from package.json — Health's identity row + About. */
declare const __APP_VERSION__: string;

/** The date this bundle was built — About's version line. */
declare const __BUILD_DATE__: string;
