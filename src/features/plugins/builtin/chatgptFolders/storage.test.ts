import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyFolderData } from './model';
import {
  CHATGPT_FOLDER_STORAGE_KEY,
  exportChatGptFolders,
  importChatGptFolders,
  loadChatGptFolders,
  saveChatGptFolders,
} from './storage';

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  vi.mocked(chrome.storage.local.set).mockResolvedValue();
});

describe('ChatGPT folder storage', () => {
  it('uses an independent versioned key and preserves valid metadata', async () => {
    const data = emptyFolderData();
    await saveChatGptFolders(data);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [CHATGPT_FOLDER_STORAGE_KEY]: { version: 1, data },
    });
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      [CHATGPT_FOLDER_STORAGE_KEY]: { version: 1, data },
    });
    expect(await loadChatGptFolders()).toEqual(data);
  });

  it('rejects malformed backup without overwriting existing storage', async () => {
    expect(
      importChatGptFolders(
        '{"version":1,"data":{"folders":[],"folderContents":{"x":[{"url":"https://evil.example/c/x"}]}}}',
      ),
    ).toBeNull();
    expect(importChatGptFolders('{bad')).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(importChatGptFolders(exportChatGptFolders(emptyFolderData()))).toEqual(
      emptyFolderData(),
    );
  });

  it.each(['constructor', 'prototype', '__proto__'])(
    'rejects reserved folder id %s before normalization',
    (id) => {
      const backup = {
        version: 1,
        data: {
          folders: [
            { id, name: 'Bad', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
          ],
          folderContents: {},
        },
      };
      expect(importChatGptFolders(JSON.stringify(backup))).toBeNull();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    },
  );
});
