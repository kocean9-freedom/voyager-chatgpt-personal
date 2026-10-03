import { describe, expect, it } from 'vitest';

import {
  addConversation,
  createFolder,
  emptyFolderData,
  moveConversation,
  parseChatGptConversation,
  removeConversation,
  removeFolderMetadata,
} from './model';

describe('ChatGPT folder model', () => {
  it('accepts only stable same-site conversation routes', () => {
    expect(parseChatGptConversation('https://chatgpt.com/c/abc-123')?.id).toBe('abc-123');
    expect(parseChatGptConversation('https://chatgpt.com/g/my-gpt/c/abc-123')?.id).toBe('abc-123');
    expect(parseChatGptConversation('https://chatgpt.com/u/2/g/my-gpt/c/abc-123')?.id).toBe(
      'abc-123',
    );
    expect(parseChatGptConversation('https://chatgpt.com/u/2/c/abc-123?foo=bar')?.url).toBe(
      'https://chatgpt.com/u/2/c/abc-123',
    );
    expect(parseChatGptConversation('https://evil.example/c/abc-123')).toBeNull();
    expect(parseChatGptConversation('https://chatgpt.com/c/abc-123/more')).toBeNull();
    expect(parseChatGptConversation('https://chatgpt.com/')).toBeNull();
    expect(parseChatGptConversation('https://chatgpt.com/c/%2e%2e')).toBeNull();
  });

  it('limits folders to two levels and stores references without changing native data', () => {
    const root = createFolder(emptyFolderData(), 'Research', null, 1, 'root');
    const nested = createFolder(root, 'Papers', 'root', 2, 'nested');
    expect(createFolder(nested, 'Too deep', 'nested', 3, 'deep')).toBe(nested);
    const withChat = addConversation(
      nested,
      'nested',
      {
        id: 'abc',
        title: 'My chat',
        url: 'https://chatgpt.com/c/abc',
      },
      4,
    );
    expect(withChat.folderContents.nested[0].conversationId).toBe('abc');
    expect(removeFolderMetadata(withChat, 'root').folders).toEqual([]);
    expect(withChat.folderContents.nested[0].url).toBe('https://chatgpt.com/c/abc');
  });

  it('moves and removes only folder references', () => {
    let data = createFolder(emptyFolderData(), 'One', null, 1, 'one');
    data = createFolder(data, 'Two', null, 2, 'two');
    data = addConversation(
      data,
      'one',
      { id: 'abc', title: 'Chat', url: 'https://chatgpt.com/c/abc' },
      3,
    );
    data = {
      ...data,
      folderContents: {
        ...data.folderContents,
        one: [{ ...data.folderContents.one[0], starred: true, customTitle: true }],
      },
    };
    data = moveConversation(data, 'one', 'two', 'abc');
    expect(data.folderContents.one).toEqual([]);
    expect(data.folderContents.two[0].title).toBe('Chat');
    expect(data.folderContents.two[0].starred).toBe(true);
    expect(data.folderContents.two[0].customTitle).toBe(true);
    expect(removeConversation(data, 'two', 'abc').folderContents.two).toEqual([]);
  });
});
