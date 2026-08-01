/**
 * Environment variable back-compat shim.
 *
 * The project was renamed from `agent-web-interface` to `@drisp/browser-mcp`
 * (see docs/adr/0004). Configuration env vars moved from the `AWI_` prefix to
 * `DRISP_BROWSER_`. To avoid breaking existing installs, every config read goes
 * through {@link readEnv}: it prefers the new `DRISP_BROWSER_*` variable and
 * falls back to the legacy `AWI_*` variable, emitting a one-time deprecation
 * warning per legacy key so users know to migrate.
 *
 * @module shared/env-compat
 */

import { getLogger } from './services/logging.service.js';

const warnedLegacyKeys = new Set<string>();

/**
 * Read a configuration env var with legacy-name fallback.
 *
 * Precedence: the new `DRISP_BROWSER_*` key wins if set (even to an empty
 * string). Only when it is entirely unset do we fall back to the legacy `AWI_*`
 * key, warning once per legacy key that it is deprecated.
 *
 * @param newKey    The canonical `DRISP_BROWSER_*` variable name.
 * @param legacyKey The deprecated `AWI_*` variable name it replaces.
 * @returns The resolved value, or undefined when neither is set.
 */
export function readEnv(newKey: string, legacyKey: string): string | undefined {
  const current = process.env[newKey];
  if (current !== undefined) return current;

  const legacy = process.env[legacyKey];
  if (legacy !== undefined) {
    if (!warnedLegacyKeys.has(legacyKey)) {
      warnedLegacyKeys.add(legacyKey);
      getLogger().warning(
        `Environment variable ${legacyKey} is deprecated; use ${newKey} instead. ` +
          `The AWI_ prefix will be removed in a future release.`
      );
    }
    return legacy;
  }

  return undefined;
}
