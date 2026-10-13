import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderData } from '@/core/types/folder';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { activateChatGptFolders } from './index';
import { createFolder, emptyFolderData } from './model';
import { CHATGPT_FOLDER_STORAGE_KEY, exportChatGptFolders } from './storage';

vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
  getCurrentLanguage: async () => 'en',
}));
vi.mock('@/core/utils/browser', () => ({ isSafari: () => false }));

let scope: PluginScope;

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  vi.mocked(chrome.storage.local.set).mockResolvedValue();
  history.replaceState({}, '', '/c/chat-one');
  vi.stubGlobal('location', { href: 'https://chatgpt.com/c/chat-one' });
  document.body.innerHTML = '<nav data-testid="native-projects">Projects</nav>';
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  document.body.innerHTML = '';
  history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function savedBackup(index: number): { version: number; data: FolderData } {
  const [raw] = vi.mocked(chrome.storage.local.set).mock.calls.at(index)!;
  return (raw as Record<string, unknown>)[CHATGPT_FOLDER_STORAGE_KEY] as {
    version: number;
    data: FolderData;
  };
}

describe('ChatGPT folders plugin', () => {
  it('rejects a queued addition when an import removes its selected folder', async () => {
    const existing = createFolder(emptyFolderData(), 'Existing', null, 1, 'existing');
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      [CHATGPT_FOLDER_STORAGE_KEY]: JSON.parse(exportChatGptFolders(existing)),
    });
    let releaseSave!: () => void;
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const select = document.querySelector<HTMLSelectElement>('.gv-chatgpt-folders__select')!;
    select.value = 'existing';
    select.dispatchEvent(new Event('change'));
    const input = document.querySelector<HTMLInputElement>(
      '.gv-chatgpt-folders__controls input[type=file]',
    )!;
    const imported = createFolder(emptyFolderData(), 'Imported', null, 2, 'imported');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: async () => exportChatGptFolders(imported) }],
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    document.querySelector<HTMLButtonElement>('.gv-chatgpt-folders__add')!.click();
    releaseSave();
    await vi.waitFor(() =>
      expect(document.querySelector('.gv-chatgpt-folders__status')?.textContent).toContain(
        'Save failed',
      ),
    );
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(savedBackup(0).data).toMatchObject(imported);
  });

  it('serializes edits against the last saved data when the first write is pending', async () => {
    let releaseSave!: () => void;
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const create = (name: string) => {
      document
        .querySelector<HTMLButtonElement>('.gv-floating-folder-panel__icon-button--create')!
        .click();
      document.querySelector<HTMLInputElement>('.gv-floating-folder-panel__inline-input')!.value =
        name;
      document
        .querySelector<HTMLButtonElement>('.gv-floating-folder-panel__icon-button--save')!
        .click();
    };
    create('First');
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    create('Second');
    releaseSave();
    await vi.waitFor(() => {
      const select = document.querySelector<HTMLSelectElement>('.gv-chatgpt-folders__select')!;
      expect([...select.options].map((option) => option.text)).toEqual([
        'Choose folder',
        'First',
        'Second',
      ]);
    });
    const saved = savedBackup(-1);
    expect(saved.data.folders.map((folder: { name: string }) => folder.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('does not publish a pending import over a newer external restore', async () => {
    let releaseSave!: () => void;
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const input = document.querySelector<HTMLInputElement>(
      '.gv-chatgpt-folders__controls input[type=file]',
    )!;
    const imported = createFolder(emptyFolderData(), 'Imported', null, 1, 'imported');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: async () => exportChatGptFolders(imported) }],
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    const changed = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)![0];
    changed(
      { [CHATGPT_FOLDER_STORAGE_KEY]: { newValue: JSON.parse(exportChatGptFolders(imported)) } },
      'local',
    );
    const restored = createFolder(emptyFolderData(), 'Restored', null, 2, 'restored');
    changed(
      { [CHATGPT_FOLDER_STORAGE_KEY]: { newValue: JSON.parse(exportChatGptFolders(restored)) } },
      'local',
    );
    releaseSave();
    await flush();
    const select = document.querySelector<HTMLSelectElement>('.gv-chatgpt-folders__select')!;
    expect([...select.options].map((option) => option.text)).toEqual(['Choose folder', 'Restored']);
    expect(document.querySelector('.gv-chatgpt-folders__status')?.textContent).not.toBe(
      'Import complete',
    );
  });

  it('mounts an opt-in launcher and saves the current chat through the floating panel', async () => {
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const panel = document.querySelector('.gv-floating-folder-panel');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('.gv-chatgpt-folders__controls')).not.toBeNull();
    expect(panel?.querySelector('.gv-floating-folder-panel__icon-button--cloud-upload')).toBeNull();
    expect(document.querySelector('[data-testid="native-projects"]')?.textContent).toBe('Projects');
    const create = panel?.querySelector<HTMLButtonElement>(
      '.gv-floating-folder-panel__icon-button--create',
    );
    create?.click();
    const input = panel?.querySelector<HTMLInputElement>('.gv-floating-folder-panel__inline-input');
    expect(input).not.toBeNull();
    input!.value = 'Research';
    panel
      ?.querySelector<HTMLButtonElement>('.gv-floating-folder-panel__icon-button--save')
      ?.click();
    await flush();
    const select = panel?.querySelector<HTMLSelectElement>('.gv-chatgpt-folders__select');
    expect(select?.options.length).toBe(2);
    select!.selectedIndex = 1;
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    panel?.querySelector<HTMLButtonElement>('.gv-chatgpt-folders__add')?.click();
    await vi.waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenLastCalledWith(
        expect.objectContaining({
          [CHATGPT_FOLDER_STORAGE_KEY]: expect.objectContaining({
            data: expect.objectContaining({
              folderContents: expect.objectContaining({
                [select!.value]: [expect.objectContaining({ conversationId: 'chat-one' })],
              }),
            }),
          }),
        }),
      ),
    );
  });

  it('does not revive the UI when disabled during storage load', async () => {
    let resolveLoad!: (value: Record<string, unknown>) => void;
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const activation = activateChatGptFolders(scope);
    await scope.dispose();
    resolveLoad({});
    await activation;
    expect(document.querySelector('.gv-floating-fab')).toBeNull();
    expect(document.querySelector('.gv-floating-folder-panel')).toBeNull();
  });

  it('rejects adding a new-chat page after SPA navigation and tears down cleanly', async () => {
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    history.replaceState({}, '', '/');
    vi.stubGlobal('location', { href: 'https://chatgpt.com/' });
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(document.querySelector<HTMLButtonElement>('.gv-chatgpt-folders__add')?.disabled).toBe(
      true,
    );
    await scope.dispose();
    expect(document.querySelector('.gv-floating-fab')).toBeNull();
    expect(document.querySelector('.gv-floating-folder-panel')).toBeNull();
    expect(document.querySelector('[data-testid="native-projects"]')?.textContent).toBe('Projects');
  });

  it('updates the open panel from another tab without writing stale data back', async () => {
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const changed = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)?.[0];
    const data = createFolder(emptyFolderData(), 'Other tab', null, 1, 'remote');
    changed?.(
      { [CHATGPT_FOLDER_STORAGE_KEY]: { newValue: JSON.parse(exportChatGptFolders(data)) } },
      'local',
    );
    expect(document.querySelector('.gv-floating-folder-panel')?.textContent).toContain('Other tab');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('applies an external restore after consuming each local write echo', async () => {
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const changed = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)![0];
    const create = (name: string) => {
      document
        .querySelector<HTMLButtonElement>('.gv-floating-folder-panel__icon-button--create')!
        .click();
      const input = document.querySelector<HTMLInputElement>(
        '.gv-floating-folder-panel__inline-input',
      )!;
      input.value = name;
      document
        .querySelector<HTMLButtonElement>('.gv-floating-folder-panel__icon-button--save')!
        .click();
    };
    create('First');
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    const first = savedBackup(0);
    changed({ [CHATGPT_FOLDER_STORAGE_KEY]: { newValue: first } }, 'local');
    create('Second');
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(2));
    const second = savedBackup(1);
    changed({ [CHATGPT_FOLDER_STORAGE_KEY]: { newValue: second } }, 'local');

    changed({ [CHATGPT_FOLDER_STORAGE_KEY]: { newValue: first } }, 'local');

    const select = document.querySelector<HTMLSelectElement>('.gv-chatgpt-folders__select')!;
    expect([...select.options].map((option) => option.text)).toEqual(['Choose folder', 'First']);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);
  });

  it('reports import success only after the storage write completes', async () => {
    let releaseSave!: () => void;
    vi.mocked(chrome.storage.local.set).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const input = document.querySelector<HTMLInputElement>(
      '.gv-chatgpt-folders__controls input[type=file]',
    )!;
    const backup = createFolder(emptyFolderData(), 'Imported', null, 1, 'imported');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: async () => exportChatGptFolders(backup) }],
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    const pendingStatus = document.querySelector('.gv-chatgpt-folders__status')?.textContent;
    expect(document.querySelector('.gv-floating-folder-panel')?.textContent).not.toContain(
      'Imported',
    );
    releaseSave();
    await flush();
    expect(pendingStatus).not.toBe('Import complete');
    await vi.waitFor(() =>
      expect(document.querySelector('.gv-chatgpt-folders__status')?.textContent).toBe(
        'Import complete',
      ),
    );
  });

  it('keeps saved folders when an import write fails and permits a retry', async () => {
    const existing = createFolder(emptyFolderData(), 'Existing', null, 1, 'existing');
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      [CHATGPT_FOLDER_STORAGE_KEY]: JSON.parse(exportChatGptFolders(existing)),
    });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const input = document.querySelector<HTMLInputElement>(
      '.gv-chatgpt-folders__controls input[type=file]',
    )!;
    const backup = createFolder(emptyFolderData(), 'Imported', null, 2, 'imported');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: async () => exportChatGptFolders(backup) }],
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.querySelector('.gv-chatgpt-folders__status')?.textContent).toContain(
        'Save failed',
      ),
    );
    const select = document.querySelector<HTMLSelectElement>('.gv-chatgpt-folders__select')!;
    expect([...select.options].map((option) => option.text)).toEqual(['Choose folder', 'Existing']);
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.querySelector('.gv-chatgpt-folders__status')?.textContent).toBe(
        'Import complete',
      ),
    );
    expect([...select.options].map((option) => option.text)).toEqual(['Choose folder', 'Imported']);
  });

  it('reports a file read failure without changing saved folders', async () => {
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const input = document.querySelector<HTMLInputElement>(
      '.gv-chatgpt-folders__controls input[type=file]',
    )!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [
        {
          text: async () => {
            throw new Error('unreadable file');
          },
        },
      ],
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.querySelector('.gv-chatgpt-folders__status')?.textContent).toContain(
        'Import failed',
      ),
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('keeps existing folders when an imported JSON file is malformed', async () => {
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const input = document.querySelector<HTMLInputElement>(
      '.gv-chatgpt-folders__controls input[type=file]',
    )!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: async () => '{bad' }],
    });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(document.querySelector('.gv-chatgpt-folders__status')?.textContent).toContain('invalid');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('opens a saved route in a new tab if ChatGPT has no native link for it', async () => {
    const folder = createFolder(emptyFolderData(), 'Saved', null, 1, 'saved');
    folder.folderContents.saved = [
      {
        conversationId: 'old-chat',
        title: 'Old chat',
        url: 'https://chatgpt.com/c/old-chat',
        addedAt: 2,
      },
    ];
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      [CHATGPT_FOLDER_STORAGE_KEY]: JSON.parse(exportChatGptFolders(folder)),
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await activateChatGptFolders(scope);
    document
      .querySelector<HTMLButtonElement>('.gv-floating-fab')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.querySelector<HTMLButtonElement>('.gv-floating-folder-panel__conv-title')?.click();
    expect(open).toHaveBeenCalledWith('https://chatgpt.com/c/old-chat', '_blank', 'noopener');
  });
});
