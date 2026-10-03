import type { FolderData } from '@/core/types/folder';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { mountFloatingFab, unmountFloatingFab } from '@/pages/content/folder/floatingModeFab';
import { type FloatingPanelHandle, mountFloatingPanel } from '@/pages/content/folder/floatingPanel';
import { watchRouteChanges } from '@/pages/content/utils/routeWatcher';
import { getCurrentLanguage } from '@/utils/i18n';

import { getChatGptFolderCopy } from './i18n';
import {
  addConversation,
  createFolder,
  moveConversation,
  parseChatGptConversation,
  removeConversation,
  removeFolderMetadata,
  renameFolder,
  updateConversation,
} from './model';
import {
  CHATGPT_FOLDER_STORAGE_KEY,
  exportChatGptFolders,
  importChatGptFolders,
  loadChatGptFolders,
  parseFolderBackup,
  saveChatGptFolders,
} from './storage';
import { CHATGPT_FOLDERS_CSS } from './styles';

const CONTROL_CLASS = 'gv-chatgpt-folders';

function currentTitle(): string {
  const heading = document.querySelector<HTMLElement>(
    'main h1, [data-testid="conversation-title"]',
  );
  return (
    heading?.textContent?.trim() ||
    document.title.replace(/\s*[-|]\s*ChatGPT\s*$/, '').trim() ||
    'ChatGPT conversation'
  );
}

function navigateToConversation(url: string): void {
  const route = parseChatGptConversation(url);
  if (!route) return;
  const existing = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find(
    (anchor) => anchor.href === route.url,
  );
  if (existing) {
    existing.click();
    return;
  }
  // The saved chat may have scrolled out of the native sidebar. A new tab
  // keeps the current app state intact; a synthetic link would force a reload.
  window.open(route.url, '_blank', 'noopener');
}

function downloadBackup(data: FolderData, scope: PluginScope): void {
  const blob = new Blob([exportChatGptFolders(data)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `voyager-chatgpt-folders-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  const release = scope.effect(
    () => () => URL.revokeObjectURL(objectUrl),
    'chatgpt-folders backup URL',
  );
  scope.timer(() => {
    void release();
  }, 60_000);
}

/** Opt-in ChatGPT-only local folders. All page effects belong to the plugin scope. */
export async function activateChatGptFolders(scope: PluginScope): Promise<void> {
  const [language, data] = await Promise.all([getCurrentLanguage(), loadChatGptFolders()]);
  if (scope.signal.aborted) return;
  const copy = getChatGptFolderCopy(language);

  let currentData = data;
  let panel: FloatingPanelHandle | null = null;
  let select: HTMLSelectElement | null = null;
  let addButton: HTMLButtonElement | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  let saveGeneration = 0;
  const ownWrites = new Set<string>();

  const updateControls = () => {
    if (!select || !addButton) return;
    const chosen = select.value;
    select.replaceChildren(new Option(copy.choose, ''));
    for (const folder of currentData.folders) {
      const parent = currentData.folders.find((candidate) => candidate.id === folder.parentId);
      select.add(new Option(`${parent ? `${parent.name} / ` : ''}${folder.name}`, folder.id));
    }
    select.value = currentData.folders.some((folder) => folder.id === chosen) ? chosen : '';
    addButton.disabled = !parseChatGptConversation(location.href) || !select.value;
  };

  const apply = (next: FolderData) => {
    if (next === currentData || scope.signal.aborted) return;
    currentData = next;
    panel?.update(next);
    updateControls();
    const generation = saveGeneration;
    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
        if (generation !== saveGeneration || scope.signal.aborted) return;
        const signature = JSON.stringify(JSON.parse(exportChatGptFolders(next)));
        ownWrites.add(signature);
        if (ownWrites.size > 10) ownWrites.delete(ownWrites.values().next().value!);
        await saveChatGptFolders(next);
      });
  };

  const openPanel = () => {
    if (panel || scope.signal.aborted) return;
    panel = mountFloatingPanel({
      data: currentData,
      onClose: () => {
        panel = null;
        select = null;
        addButton = null;
      },
      onNavigate: (item) => navigateToConversation(item.url),
      onCreateFolder: (name, parentId) => apply(createFolder(currentData, name, parentId)),
      onRenameFolder: (id, name) => apply(renameFolder(currentData, id, name)),
      onDeleteFolder: (id) => apply(removeFolderMetadata(currentData, id)),
      onRemoveConversation: (id, conversationId) =>
        apply(removeConversation(currentData, id, conversationId)),
      onMoveConversation: (conversationId, fromId, toId) =>
        apply(moveConversation(currentData, fromId, toId, conversationId)),
      onToggleStar: (id, conversationId) =>
        apply(
          updateConversation(currentData, id, conversationId, (item) => ({
            ...item,
            starred: !item.starred,
          })),
        ),
      onToggleFolderPinned: (id) =>
        apply({
          ...currentData,
          folders: currentData.folders.map((item) =>
            item.id === id ? { ...item, pinned: !item.pinned } : item,
          ),
        }),
      onSetFolderColor: (id, color) =>
        apply({
          ...currentData,
          folders: currentData.folders.map((item) => (item.id === id ? { ...item, color } : item)),
        }),
    });
    panel.element.classList.add(CONTROL_CLASS);
    panel.element
      .querySelectorAll(
        '.gv-floating-folder-panel__icon-button--cloud-upload, .gv-floating-folder-panel__icon-button--cloud-sync',
      )
      .forEach((button) => button.remove());
    const controls = document.createElement('div');
    controls.className = `${CONTROL_CLASS}__controls`;
    select = document.createElement('select');
    select.className = `${CONTROL_CLASS}__select`;
    select.setAttribute('aria-label', copy.choose);
    addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = `${CONTROL_CLASS}__add`;
    addButton.textContent = copy.add;
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = copy.export;
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.textContent = copy.import;
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.hidden = true;
    const status = document.createElement('span');
    status.className = `${CONTROL_CLASS}__status`;
    status.setAttribute('role', 'status');
    controls.append(select, addButton, exportButton, importButton, importInput, status);
    panel.element.insertBefore(
      controls,
      panel.element.querySelector(`.gv-floating-folder-panel__body`),
    );

    select.addEventListener('change', updateControls);
    addButton.addEventListener('click', () => {
      const route = parseChatGptConversation(location.href);
      if (!route || !select?.value) return;
      apply(addConversation(currentData, select.value, { ...route, title: currentTitle() }));
      status.textContent = copy.added;
    });
    exportButton.addEventListener('click', () => downloadBackup(currentData, scope));
    importButton.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file || scope.signal.aborted) return;
      const parsed = importChatGptFolders(await file.text());
      if (scope.signal.aborted) return;
      if (!parsed) {
        status.textContent = copy.importFailed;
      } else {
        apply(parsed);
        status.textContent = copy.imported;
      }
      importInput.value = '';
    });
    updateControls();
  };

  scope.style(CHATGPT_FOLDERS_CSS);
  scope.effect(() => {
    mountFloatingFab({ onClick: openPanel });
    return () => unmountFloatingFab();
  }, 'chatgpt-folders launcher');
  scope.effect(() => watchRouteChanges(updateControls), 'chatgpt-folders route watcher');
  scope.effect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !changes[CHATGPT_FOLDER_STORAGE_KEY]) return;
      const raw = changes[CHATGPT_FOLDER_STORAGE_KEY].newValue;
      if (ownWrites.has(JSON.stringify(raw))) return;
      const next = parseFolderBackup(raw);
      if (!next || scope.signal.aborted) return;
      saveGeneration++;
      currentData = next;
      panel?.update(next);
      updateControls();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, 'chatgpt-folders storage listener');
  scope.effect(
    () => () => {
      panel?.destroy();
      panel = null;
      select = null;
      addButton = null;
    },
    'chatgpt-folders panel',
  );
}
