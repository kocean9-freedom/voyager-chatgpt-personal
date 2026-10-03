import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { activateChatGptFolders } from './index';
import { createFolder, emptyFolderData } from './model';
import { CHATGPT_FOLDER_STORAGE_KEY } from './storage';
import { exportChatGptFolders } from './storage';

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

describe('ChatGPT folders plugin', () => {
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
