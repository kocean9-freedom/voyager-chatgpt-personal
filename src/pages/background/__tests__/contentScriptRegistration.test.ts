import { describe, expect, it, vi } from 'vitest';

import {
  type ContentScriptRegistry,
  reconcileRegisteredContentScripts,
  unregisterRegisteredContentScripts,
} from '../contentScriptRegistration';

const pluginScript: chrome.scripting.RegisteredContentScript = {
  id: 'gv-plugin-content-script',
  js: ['assets/content.js'],
  css: ['contentStyle.css'],
  matches: ['https://chatgpt.com/*'],
  allFrames: false,
  runAt: 'document_idle',
  persistAcrossSessions: true,
};

function fakeManagedRegistry(initial: readonly chrome.scripting.RegisteredContentScript[]) {
  const registered = new Map(initial.map((script) => [script.id, script]));
  const scripting = {
    getRegisteredContentScripts: vi.fn(async () => [...registered.values()]),
    registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
      for (const script of scripts) {
        if (registered.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`);
        registered.set(script.id, script);
      }
    }),
    updateContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
      for (const script of scripts) {
        if (!registered.has(script.id)) throw new Error(`Missing script ID '${script.id}'`);
        registered.set(script.id, script);
      }
    }),
    unregisterContentScripts: vi.fn(async (filter?: { ids?: string[] }) => {
      for (const id of filter?.ids ?? []) registered.delete(id);
    }),
  };
  return { scripting, registered };
}

describe('reconcileRegisteredContentScripts', () => {
  it('keeps an unchanged live registration without a remove-and-register gap', async () => {
    const { scripting, registered } = fakeManagedRegistry([pluginScript]);

    await reconcileRegisteredContentScripts(scripting, [pluginScript], [pluginScript.id]);

    expect(registered.get(pluginScript.id)).toEqual(pluginScript);
    expect(scripting.unregisterContentScripts).not.toHaveBeenCalled();
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
    expect(scripting.updateContentScripts).not.toHaveBeenCalled();
  });

  it('updates a changed registration in place and preserves it when the update fails', async () => {
    const { scripting, registered } = fakeManagedRegistry([pluginScript]);
    const next = { ...pluginScript, js: ['assets/new-content.js'] };
    scripting.updateContentScripts.mockRejectedValueOnce(new Error('validation failed'));

    await expect(
      reconcileRegisteredContentScripts(scripting, [next], [pluginScript.id]),
    ).rejects.toThrow('validation failed');
    expect(registered.get(pluginScript.id)).toEqual(pluginScript);
    expect(scripting.unregisterContentScripts).not.toHaveBeenCalled();

    await reconcileRegisteredContentScripts(scripting, [next], [pluginScript.id]);
    expect(registered.get(pluginScript.id)).toEqual(next);
    expect(scripting.updateContentScripts).toHaveBeenCalledWith([next]);
  });

  it('registers a missing script and removes an obsolete managed script', async () => {
    const oldScript = { ...pluginScript, id: 'gv-plugin-claude-usage-main' };
    const { scripting, registered } = fakeManagedRegistry([oldScript]);

    await reconcileRegisteredContentScripts(
      scripting,
      [pluginScript],
      [pluginScript.id, oldScript.id],
    );

    expect([...registered.keys()]).toEqual([pluginScript.id]);
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([pluginScript]);
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: [oldScript.id] });
  });

  it('keeps an obsolete registration when adding its replacement fails', async () => {
    const oldScript = { ...pluginScript, id: 'gv-plugin-claude-usage-main' };
    const { scripting, registered } = fakeManagedRegistry([oldScript]);
    scripting.registerContentScripts.mockRejectedValueOnce(new Error('registration failed'));

    await expect(
      reconcileRegisteredContentScripts(scripting, [pluginScript], [pluginScript.id, oldScript.id]),
    ).rejects.toThrow('registration failed');

    expect(registered.get(oldScript.id)).toEqual(oldScript);
    expect(scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });
});

/** Mimics Chrome: one unknown id rejects the whole call and removes nothing. */
function fakeRegistry(initial: readonly string[]) {
  const registered = new Set(initial);
  const scripting: ContentScriptRegistry = {
    getRegisteredContentScripts: vi.fn(async () =>
      [...registered].map((id) => ({ id, js: [], matches: [] })),
    ) as unknown as ContentScriptRegistry['getRegisteredContentScripts'],
    unregisterContentScripts: vi.fn(async (filter?: { ids?: string[] }) => {
      const ids = filter?.ids ?? [];
      const missing = ids.find((id) => !registered.has(id));
      if (missing) throw new Error(`Nonexistent script ID '${missing}'`);
      for (const id of ids) registered.delete(id);
    }) as unknown as ContentScriptRegistry['unregisterContentScripts'],
  };
  return { scripting, registered };
}

describe('unregisterRegisteredContentScripts', () => {
  it('drops only the ids that exist so a never-registered companion cannot block the batch', async () => {
    const { scripting, registered } = fakeRegistry(['gv-plugin-content-script', 'gv-other']);

    const removed = await unregisterRegisteredContentScripts(scripting, [
      'gv-plugin-content-script',
      'gv-plugin-embedded-content-script',
      'gv-plugin-claude-usage-main',
    ]);

    expect(removed).toEqual(['gv-plugin-content-script']);
    expect([...registered]).toEqual(['gv-other']);
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: ['gv-plugin-content-script'],
    });
  });

  it('is a no-op when none of the ids are registered', async () => {
    const { scripting } = fakeRegistry(['gv-other']);
    await expect(
      unregisterRegisteredContentScripts(scripting, ['gv-plugin-content-script']),
    ).resolves.toEqual([]);
    expect(scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });

  it('unregisters one id at a time when the registry cannot be listed, so an absent id blocks nothing', async () => {
    const { scripting, registered } = fakeRegistry(['gv-plugin-content-script']);
    (scripting.getRegisteredContentScripts as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );

    await expect(
      unregisterRegisteredContentScripts(scripting, [
        'gv-plugin-content-script',
        'gv-plugin-embedded-content-script',
      ]),
    ).resolves.toEqual(['gv-plugin-content-script']);
    expect(registered.size).toBe(0);
  });
});
