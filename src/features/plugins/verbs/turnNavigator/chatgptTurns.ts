import { chatgptCollectTurnContainers } from '@/pages/content/export/adapter/chatgpt';

export interface ChatGptTimelineTurn {
  readonly id: string;
  readonly element: HTMLElement;
  readonly summary: string;
}

/** ChatGPT preserves shell IDs and order even after unloading older message bodies. */
export function collectChatGptTimelineTurns(root: ParentNode = document): ChatGptTimelineTurn[] {
  const currentRows = root.querySelectorAll<HTMLElement>('[data-turn-key]');
  if (currentRows.length > 0) {
    const turns: ChatGptTimelineTurn[] = [];
    for (const row of currentRows) {
      const userId = row.getAttribute('data-turn-key')?.trim();
      if (!userId) continue;
      const userBubble = row.querySelector<HTMLElement>('[data-user-message-bubble]');
      turns.push({
        id: `g-${encodeURIComponent(userId)}`,
        element: userBubble ?? row,
        summary: (userBubble?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      });

      const assistant = row.querySelector<HTMLElement>('[data-chatgpt-selection-message-id]');
      const assistantId = assistant?.getAttribute('data-chatgpt-selection-message-id')?.trim();
      if (assistant && assistantId) {
        turns.push({
          id: `g-${encodeURIComponent(assistantId)}`,
          element: assistant,
          summary: (assistant.querySelector('[data-markdown-text-style]')?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
        });
      }
    }
    return turns;
  }

  return chatgptCollectTurnContainers(root).map(({ id, container }) => ({
    id: `g-${encodeURIComponent(id)}`,
    element: container,
    summary: (container.querySelector('[data-message-author-role]')?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

export function chatGptConversationId(input: string): string | null {
  try {
    const url = new URL(input, location.origin);
    const match = /^\/(?:u\/\d+\/)?(?:g\/[^/]+\/)?c\/([^/]+)\/?$/.exec(url.pathname);
    return match ? `chatgpt:conv:${match[1]}` : null;
  } catch {
    return null;
  }
}
