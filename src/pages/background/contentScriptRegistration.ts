/**
 * Dynamic content-script registration helpers for the background worker.
 *
 * Chrome rejects the whole `unregisterContentScripts` call when any id in it
 * is unknown ("Nonexistent script ID"), and the `registerContentScripts` that
 * follows then fails on the duplicate id. Batching a never-registered
 * companion script (the Claude usage bridge, the embedded-frame script) into
 * one unregister call therefore froze the plugin registration on its first
 * result: enabling a plugin for a new site later changed nothing until the
 * extension restarted.
 */

export interface ManagedContentScriptRegistry {
  getRegisteredContentScripts(filter?: {
    ids?: string[];
  }): Promise<chrome.scripting.RegisteredContentScript[]>;
  registerContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>;
  updateContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>;
  unregisterContentScripts(filter?: { ids?: string[] }): Promise<void>;
}

export type ContentScriptRegistry = Pick<
  ManagedContentScriptRegistry,
  'getRegisteredContentScripts' | 'unregisterContentScripts'
>;

function sameStringList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function sameRegistration(
  current: chrome.scripting.RegisteredContentScript,
  desired: chrome.scripting.RegisteredContentScript,
): boolean {
  return (
    sameStringList([...(current.matches ?? [])].sort(), [...(desired.matches ?? [])].sort()) &&
    sameStringList(current.js, desired.js) &&
    sameStringList(current.css, desired.css) &&
    sameStringList(current.excludeMatches, desired.excludeMatches) &&
    (current.allFrames ?? false) === (desired.allFrames ?? false) &&
    (current.matchOriginAsFallback ?? false) === (desired.matchOriginAsFallback ?? false) &&
    (current.runAt ?? 'document_idle') === (desired.runAt ?? 'document_idle') &&
    (current.world ?? 'ISOLATED') === (desired.world ?? 'ISOLATED') &&
    (current.persistAcrossSessions ?? true) === (desired.persistAcrossSessions ?? true)
  );
}

/**
 * Keep a live registration in place when it already matches the desired one.
 * Register and update before removing obsolete ids, so a failed replacement
 * cannot leave an enabled site without any content script.
 */
export async function reconcileRegisteredContentScripts(
  scripting: ManagedContentScriptRegistry,
  desired: readonly chrome.scripting.RegisteredContentScript[],
  managedIds: readonly string[],
): Promise<void> {
  const managed = new Set(managedIds);
  if (desired.some((script) => !managed.has(script.id))) {
    throw new Error('Content script registration contains an unmanaged id');
  }

  const current = (await scripting.getRegisteredContentScripts({ ids: [...managed] })).filter(
    (script) => managed.has(script.id),
  );
  const currentById = new Map(current.map((script) => [script.id, script]));
  const desiredIds = new Set(desired.map((script) => script.id));
  const additions = desired.filter((script) => !currentById.has(script.id));
  const updates = desired.filter((script) => {
    const existing = currentById.get(script.id);
    return existing && !sameRegistration(existing, script);
  });
  const obsoleteIds = current
    .filter((script) => !desiredIds.has(script.id))
    .map((script) => script.id);

  if (additions.length) await scripting.registerContentScripts([...additions]);
  if (updates.length) await scripting.updateContentScripts([...updates]);
  if (obsoleteIds.length) await unregisterRegisteredContentScripts(scripting, obsoleteIds);
}

/**
 * Unregister only the ids that are actually registered. Returns the ids that
 * were removed; a missing id is not an error.
 */
export async function unregisterRegisteredContentScripts(
  scripting: ContentScriptRegistry | undefined,
  ids: readonly string[],
): Promise<string[]> {
  if (!scripting?.unregisterContentScripts) return [];
  let registered: string[];
  try {
    const wanted = new Set(ids);
    registered = (await scripting.getRegisteredContentScripts())
      .map((script) => script.id)
      .filter((id) => wanted.has(id));
  } catch {
    // Listing failed: unregister one id at a time, so an absent id can only
    // fail its own call instead of the whole batch.
    const removed: string[] = [];
    for (const id of ids) {
      try {
        await scripting.unregisterContentScripts({ ids: [id] });
        removed.push(id);
      } catch {
        // Not registered.
      }
    }
    return removed;
  }
  if (!registered.length) return [];
  try {
    await scripting.unregisterContentScripts({ ids: registered });
    return registered;
  } catch (error) {
    console.warn('[Background] Failed to unregister content scripts', registered, error);
    return [];
  }
}
