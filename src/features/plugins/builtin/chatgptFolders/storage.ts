import { StorageKeys } from '@/core/types/common';
import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';
import { normalizeFolderData } from '@/features/folder/model/folderData';

import { emptyFolderData, parseChatGptConversation } from './model';

export const CHATGPT_FOLDER_STORAGE_KEY = StorageKeys.FOLDER_DATA_CHATGPT;
const BACKUP_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFolder(value: unknown): value is Folder {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    !!value.id &&
    value.id !== 'prototype' &&
    !Object.hasOwn(Object.prototype, value.id) &&
    typeof value.name === 'string' &&
    (value.parentId === null || typeof value.parentId === 'string') &&
    typeof value.isExpanded === 'boolean' &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt)
  );
}

function isConversation(value: unknown): value is ConversationReference {
  if (!isRecord(value)) return false;
  const route = typeof value.url === 'string' ? parseChatGptConversation(value.url) : null;
  return (
    !!route &&
    route.id === value.conversationId &&
    typeof value.title === 'string' &&
    typeof value.addedAt === 'number' &&
    Number.isFinite(value.addedAt)
  );
}

export function parseFolderBackup(value: unknown): FolderData | null {
  if (!isRecord(value) || value.version !== BACKUP_VERSION || !isRecord(value.data)) return null;
  const data = value.data;
  if (!Array.isArray(data.folders) || !isRecord(data.folderContents)) return null;
  if (!data.folders.every(isFolder)) return null;
  const ids = new Set<string>();
  for (const folder of data.folders as Folder[]) {
    if (ids.has(folder.id) || folder.id === '__proto__') return null;
    ids.add(folder.id);
  }
  for (const folder of data.folders as Folder[]) {
    if (folder.parentId === null) continue;
    const parent = (data.folders as Folder[]).find((candidate) => candidate.id === folder.parentId);
    if (!parent || parent.parentId !== null) return null;
  }
  for (const [folderId, contents] of Object.entries(data.folderContents)) {
    if (!ids.has(folderId) || !Array.isArray(contents) || !contents.every(isConversation))
      return null;
  }
  return normalizeFolderData(data as unknown as FolderData);
}

export async function loadChatGptFolders(): Promise<FolderData> {
  const result = await chrome.storage.local.get(CHATGPT_FOLDER_STORAGE_KEY);
  return parseFolderBackup(result[CHATGPT_FOLDER_STORAGE_KEY]) ?? emptyFolderData();
}

export async function saveChatGptFolders(data: FolderData): Promise<void> {
  await chrome.storage.local.set({
    [CHATGPT_FOLDER_STORAGE_KEY]: { version: BACKUP_VERSION, data },
  });
}

export function exportChatGptFolders(data: FolderData): string {
  return JSON.stringify({ version: BACKUP_VERSION, data }, null, 2);
}

export function importChatGptFolders(text: string): FolderData | null {
  try {
    return parseFolderBackup(JSON.parse(text));
  } catch {
    return null;
  }
}
