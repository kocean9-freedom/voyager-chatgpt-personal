import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';
import { removeFolder } from '@/features/folder/model/folderData';

export interface ChatGptConversationRoute {
  id: string;
  url: string;
}

export function parseChatGptConversation(input: string): ChatGptConversationRoute | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    (url.hostname !== 'chatgpt.com' && url.hostname !== 'chat.openai.com') ||
    url.port ||
    url.username ||
    url.password
  )
    return null;
  const match = url.pathname.match(
    /^\/(?:u\/\d+\/)?(?:g\/[A-Za-z0-9_-]+\/)?c\/([A-Za-z0-9_-]+)\/?$/,
  );
  if (!match) return null;
  return { id: match[1], url: `${url.origin}${url.pathname.replace(/\/$/, '')}` };
}

export function emptyFolderData(): FolderData {
  return { folders: [], folderContents: {} };
}

export function createFolder(
  data: FolderData,
  name: string,
  parentId: string | null,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): FolderData {
  const trimmed = name.trim();
  if (!trimmed || !id || data.folders.some((folder) => folder.id === id)) return data;
  if (parentId !== null) {
    const parent = data.folders.find((folder) => folder.id === parentId);
    if (!parent || parent.parentId !== null) return data;
  }
  const folder: Folder = {
    id,
    name: trimmed,
    parentId,
    isExpanded: true,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...data,
    folders: [...data.folders, folder],
    folderContents: { ...data.folderContents, [id]: [] },
  };
}

export function renameFolder(
  data: FolderData,
  id: string,
  name: string,
  now = Date.now(),
): FolderData {
  const trimmed = name.trim();
  if (!trimmed || !data.folders.some((folder) => folder.id === id)) return data;
  return {
    ...data,
    folders: data.folders.map((folder) =>
      folder.id === id ? { ...folder, name: trimmed, updatedAt: now } : folder,
    ),
  };
}

export function removeFolderMetadata(data: FolderData, id: string): FolderData {
  return removeFolder(data, id);
}

export function addConversation(
  data: FolderData,
  folderId: string,
  conversation: { id: string; title: string; url: string },
  now = Date.now(),
): FolderData {
  const route = parseChatGptConversation(conversation.url);
  if (
    !data.folders.some((folder) => folder.id === folderId) ||
    !route ||
    route.id !== conversation.id
  )
    return data;
  const current = data.folderContents[folderId] ?? [];
  const existing = current.find((item) => item.conversationId === route.id);
  const reference: ConversationReference = existing
    ? { ...existing, title: conversation.title.trim() || existing.title, url: route.url }
    : {
        conversationId: route.id,
        title: conversation.title.trim() || 'ChatGPT conversation',
        url: route.url,
        addedAt: now,
      };
  return {
    ...data,
    folderContents: {
      ...data.folderContents,
      [folderId]: existing
        ? current.map((item) => (item.conversationId === route.id ? reference : item))
        : [...current, reference],
    },
  };
}

export function removeConversation(data: FolderData, folderId: string, id: string): FolderData {
  const current = data.folderContents[folderId];
  if (!current?.some((item) => item.conversationId === id)) return data;
  return {
    ...data,
    folderContents: {
      ...data.folderContents,
      [folderId]: current.filter((item) => item.conversationId !== id),
    },
  };
}

export function moveConversation(
  data: FolderData,
  fromId: string,
  toId: string,
  id: string,
): FolderData {
  if (fromId === toId || !data.folders.some((folder) => folder.id === toId)) return data;
  const item = data.folderContents[fromId]?.find((entry) => entry.conversationId === id);
  if (!item) return data;
  const removed = removeConversation(data, fromId, id);
  const target = removed.folderContents[toId] ?? [];
  return {
    ...removed,
    folderContents: {
      ...removed.folderContents,
      [toId]: target.some((entry) => entry.conversationId === id) ? target : [...target, item],
    },
  };
}

export function updateConversation(
  data: FolderData,
  folderId: string,
  id: string,
  update: (item: ConversationReference) => ConversationReference,
): FolderData {
  const current = data.folderContents[folderId];
  if (!current?.some((item) => item.conversationId === id)) return data;
  return {
    ...data,
    folderContents: {
      ...data.folderContents,
      [folderId]: current.map((item) => (item.conversationId === id ? update(item) : item)),
    },
  };
}
