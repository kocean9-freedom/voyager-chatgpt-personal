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
  let status: HTMLSpanElement | null = null;
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

  const apply = (update: (data: FolderData) => FolderData): Promise<boolean> => {
    const generation = saveGeneration;
    const result = saveQueue.then(async () => {
      if (generation !== saveGeneration || scope.signal.aborted) return false;
      const next = update(currentData);
      if (next === currentData) {
        if (status) status.textContent = copy.saveFailed;
        return false;
      }
      const signature = JSON.stringify(JSON.parse(exportChatGptFolders(next)));
      if (signature === JSON.stringify(JSON.parse(exportChatGptFolders(currentData)))) return true;
      ownWrites.add(signature);
      if (ownWrites.size > 10) ownWrites.delete(ownWrites.values().next().value!);
      try {
        await saveChatGptFolders(next);
      } catch {
        ownWrites.delete(signature);
        if (generation === saveGeneration && !scope.signal.aborted && status) {
          status.textContent = copy.saveFailed;
        }
        return false;
      }
      if (generation !== saveGeneration || scope.signal.aborted) return false;
      currentData = next;
      panel?.update(next);
      updateControls();
      return true;
    });
    saveQueue = result.then(() => {});
    return result;
  };

  const openPanel = () => {
    if (panel || scope.signal.aborted) return;
    panel = mountFloatingPanel({
      data: currentData,
      onClose: () => {
        panel = null;
        select = null;
        addButton = null;
        status = null;
      },
      onNavigate: (item) => navigateToConversation(item.url),
      onCreateFolder: (name, parentId) => void apply((data) => createFolder(data, name, parentId)),
      onRenameFolder: (id, name) => void apply((data) => renameFolder(data, id, name)),
      onDeleteFolder: (id) => void apply((data) => removeFolderMetadata(data, id)),
      onRemoveConversation: (id, conversationId) =>
        void apply((data) => removeConversation(data, id, conversationId)),
      onMoveConversation: (conversationId, fromId, toId) =>
        void apply((data) => moveConversation(data, fromId, toId, conversationId)),
      onToggleStar: (id, conversationId) =>
        void apply((data) =>
          updateConversation(data, id, conversationId, (item) => ({
            ...item,
            starred: !item.starred,
          })),
        ),
      onToggleFolderPinned: (id) =>
        void apply((data) => ({
          ...data,
          folders: data.folders.map((item) =>
            item.id === id ? { ...item, pinned: !item.pinned } : item,
          ),
        })),
      onSetFolderColor: (id, color) =>
        void apply((data) => ({
          ...data,
          folders: data.folders.map((item) => (item.id === id ? { ...item, color } : item)),
        })),
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
    const panelStatus = document.createElement('span');
    panelStatus.className = `${CONTROL_CLASS}__status`;
    panelStatus.setAttribute('role', 'status');
    status = panelStatus;
    controls.append(select, addButton, exportButton, importButton, importInput, panelStatus);
    panel.element.insertBefore(
      controls,
      panel.element.querySelector(`.gv-floating-folder-panel__body`),
    );

    select.addEventListener('change', updateControls);
    addButton.addEventListener('click', async () => {
      const route = parseChatGptConversation(location.href);
      if (!route || !select?.value) return;
      const folderId = select.value;
      const title = currentTitle();
      panelStatus.textContent = '';
      const saved = await apply((data) => addConversation(data, folderId, { ...route, title }));
      if (saved && !scope.signal.aborted) panelStatus.textContent = copy.added;
    });
    exportButton.addEventListener('click', () => downloadBackup(currentData, scope));
    importButton.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file || scope.signal.aborted) return;
      panelStatus.textContent = '';
      try {
        const parsed = importChatGptFolders(await file.text());
        if (scope.signal.aborted) return;
        if (!parsed) {
          panelStatus.textContent = copy.importFailed;
        } else if (await apply(() => parsed)) {
          if (!scope.signal.aborted) panelStatus.textContent = copy.imported;
        }
      } catch {
        if (!scope.signal.aborted) panelStatus.textContent = copy.importFailed;
      } finally {
        importInput.value = '';
      }
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
      if (ownWrites.delete(JSON.stringify(raw))) return;
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
      status = null;
    },
    'chatgpt-folders panel',
  );
}
