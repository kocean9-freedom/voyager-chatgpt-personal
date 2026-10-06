import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StarredMessagesService } from '../StarredMessagesService';
import type { StarredMessage } from '../starredTypes';

const originalRuntimeId = chrome.runtime.id;

const starred: StarredMessage = {
  turnId: 'turn-1',
  content: 'Important answer',
  conversationId: 'chatgpt:conv:chat-1',
  conversationUrl: 'https://chatgpt.com/c/chat-1',
  starredAt: 1,
};

describe('StarredMessagesService after extension reload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(chrome.runtime.sendMessage).mockReset();
    Object.defineProperty(chrome.runtime, 'id', {
      configurable: true,
      value: originalRuntimeId,
    });
    Object.defineProperty(chrome.runtime, 'lastError', {
      configurable: true,
      value: null,
    });
  });

  afterEach(() => {
    Object.defineProperty(chrome.runtime, 'id', {
      configurable: true,
      value: originalRuntimeId,
    });
    Object.defineProperty(chrome.runtime, 'lastError', {
      configurable: true,
      value: null,
    });
    vi.restoreAllMocks();
  });

  it('reads starred messages while the extension context is live', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback: (response: unknown) => void,
    ) => {
      callback({ ok: true, messages: [starred] });
    }) as typeof chrome.runtime.sendMessage);

    await expect(
      StarredMessagesService.getStarredMessagesForConversation(starred.conversationId),
    ).resolves.toEqual([starred]);
  });

  it('quietly returns no messages when Chrome invalidates an in-flight request', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback: (response: unknown) => void,
    ) => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: { message: 'Extension context invalidated.' },
      });
      callback(undefined);
    }) as typeof chrome.runtime.sendMessage);

    await expect(
      StarredMessagesService.getStarredMessagesForConversation(starred.conversationId),
    ).resolves.toEqual([]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('does not call an expired runtime after extension reload', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(chrome.runtime, 'id', { configurable: true, value: undefined });

    await expect(StarredMessagesService.getAllStarredMessages()).resolves.toEqual({ messages: {} });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('still reports unexpected communication errors', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(() => {
      throw new Error('Unexpected failure');
    });

    await expect(
      StarredMessagesService.getStarredMessagesForConversation(starred.conversationId),
    ).resolves.toEqual([]);
    expect(errorLog).toHaveBeenCalledWith(
      '[StarredMessagesService] Failed to get starred messages:',
      expect.objectContaining({ message: 'Unexpected failure' }),
    );
  });
});
