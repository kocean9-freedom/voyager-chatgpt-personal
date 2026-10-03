import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '../../runtime/pluginScope';
import type { SiteAdapter } from '../../types';
import { turnNavigatorPrimitive } from '../turnNavigator';
import { chatGptConversationId } from './chatgptTurns';

const { getStarredMessagesForConversation, addStarredMessage, removeStarredMessage } = vi.hoisted(
  () => ({
    getStarredMessagesForConversation: vi.fn().mockResolvedValue([]),
    addStarredMessage: vi.fn().mockResolvedValue(undefined),
    removeStarredMessage: vi.fn().mockResolvedValue(undefined),
  }),
);
vi.mock('@/utils/i18n', () => ({
  initI18n: vi.fn().mockResolvedValue(undefined),
  getTranslationSync: (key: string) => key,
}));
vi.mock('@/pages/content/timeline/StarredMessagesService', () => ({
  StarredMessagesService: {
    getStarredMessagesForConversation,
    addStarredMessage,
    removeStarredMessage,
  },
}));
vi.mock('@/features/plugins/storage/pluginState', () => ({
  setPluginSetting: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/pages/content/timeline/timelineStyleCoachmark', () => ({
  showTimelineStyleCoachmark: vi.fn().mockResolvedValue(undefined),
}));

const adapter: SiteAdapter = {
  id: 'chatgpt',
  label: 'ChatGPT',
  matches: ['https://chatgpt.com/*'],
  selectors: { userTurn: '[data-message-author-role="user"]' },
  theme: {
    hostSelector: 'html',
    lightSelector: 'html[data-theme="light"]',
    darkSelector: 'html[data-theme="dark"]',
  },
  capabilities: new Set(['chat']),
  conversationIdPattern: '^/c/([^/?#]+)',
};

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function start(scope: PluginScope): void {
  turnNavigatorPrimitive.activate(
    scope,
    {},
    {
      doc: document,
      adapter,
      pluginId: 'voyager.chatgpt-timeline',
      settings: {},
      setTargetCounter: () => {},
    },
  );
}

beforeEach(() => {
  document.body.replaceChildren();
  history.replaceState({}, '', '/g/g-paper/c/chat-1');
  getStarredMessagesForConversation.mockReset().mockResolvedValue([]);
  addStarredMessage.mockClear();
  removeStarredMessage.mockClear();
  window.scrollTo = vi.fn();
});

describe('ChatGPT timeline', () => {
  it('indexes messages in current data-turn-key conversation rows', async () => {
    document.body.innerHTML = `
      <div data-turn-key="user-1">
        <div data-chatgpt-search-message-ids="user-1">
          <div data-user-message-bubble="true">First question</div>
        </div>
        <div data-chatgpt-selection-message-id="assistant-1">
          <div data-markdown-text-style="assistant-message">First answer</div>
        </div>
      </div>`;
    const scope = new PluginScope();
    start(scope);
    await flush();
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('.timeline-dot')].map((dot) =>
        dot.getAttribute('aria-label'),
      ),
    ).toEqual(['First question', 'First answer']);
    await scope.dispose();
  });

  it('adds timeline markers when a current-format turn arrives later', async () => {
    document.body.innerHTML =
      '<div data-turn-key="user-1"><div data-user-message-bubble="true">First question</div></div>';
    const scope = new PluginScope();
    start(scope);
    await flush();
    expect(document.querySelectorAll('.timeline-dot')).toHaveLength(1);

    const next = document.createElement('div');
    next.setAttribute('data-turn-key', 'user-2');
    next.innerHTML = '<div data-user-message-bubble="true">Second question</div>';
    document.body.appendChild(next);
    await vi.waitFor(() => expect(document.querySelectorAll('.timeline-dot')).toHaveLength(2), {
      timeout: 1200,
    });
    await scope.dispose();
  });

  it('parses stable conversation routes and rejects non-conversation pages', () => {
    expect(chatGptConversationId('https://chatgpt.com/c/one')).toBe('chatgpt:conv:one');
    expect(chatGptConversationId('https://chatgpt.com/g/g-paper/c/one')).toBe('chatgpt:conv:one');
    expect(chatGptConversationId('https://chatgpt.com/u/1/g/g-paper/c/one')).toBe(
      'chatgpt:conv:one',
    );
    expect(chatGptConversationId('https://chatgpt.com/library')).toBeNull();
    expect(chatGptConversationId('https://chatgpt.com/?temporary-chat=true')).toBeNull();
  });

  it('indexes retained shells once, including older unmounted messages', async () => {
    document.body.innerHTML = `
      <div data-turn-id-container="client-created-root"></div>
      <div data-turn-id-container="paginated-root:chat-1"></div>
      <div data-turn-id-container="user-1"></div>
      <div data-turn-id-container="user-1"><div data-message-author-role="user">Repeated</div></div>
      <div data-turn-id-container="assistant-1"><div data-message-author-role="assistant">Answer</div></div>
      <div data-turn-id-container="user-2"><div data-message-author-role="user">Repeated</div></div>`;
    const scope = new PluginScope();
    start(scope);
    await flush();
    expect(document.querySelectorAll('.timeline-dot')).toHaveLength(3);
    expect(document.querySelectorAll('[data-gv-turn-id]')).toHaveLength(3);
    expect(getStarredMessagesForConversation).toHaveBeenCalledWith('chatgpt:conv:chat-1');
    await scope.dispose();
  });

  it('keeps equal-text stars independent through storage reload', async () => {
    document.body.innerHTML = `
      <div data-turn-id-container="user-1"><div data-message-author-role="user">Same</div></div>
      <div data-turn-id-container="user-2"><div data-message-author-role="user">Same</div></div>`;
    const scope = new PluginScope();
    start(scope);
    await flush();
    const dots = [...document.querySelectorAll<HTMLButtonElement>('.timeline-dot')];
    expect(dots[0].dataset.targetTurnId).not.toBe(dots[1].dataset.targetTurnId);
    dots[0].dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flush();
    expect(addStarredMessage).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: dots[0].dataset.targetTurnId }),
    );
    expect(dots[0].getAttribute('aria-pressed')).toBe('true');
    expect(dots[1].getAttribute('aria-pressed')).toBe('false');
    await scope.dispose();
    const starred = addStarredMessage.mock.calls[0][0];
    getStarredMessagesForConversation.mockResolvedValue([starred]);
    const nextScope = new PluginScope();
    start(nextScope);
    await flush();
    const reloaded = [...document.querySelectorAll<HTMLButtonElement>('.timeline-dot')];
    expect(reloaded.map((dot) => dot.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    await nextScope.dispose();
  });

  it('hides the rail on a non-chat route even while stale shells remain', async () => {
    document.body.innerHTML =
      '<div data-turn-id-container="user-1"><div data-message-author-role="user">Old</div></div>';
    const scope = new PluginScope();
    start(scope);
    await flush();
    expect(document.querySelector('.timeline-dot')).not.toBeNull();
    history.pushState({}, '', '/library');
    await vi.waitFor(() => expect(document.querySelectorAll('.timeline-dot')).toHaveLength(0), {
      timeout: 1200,
    });
    expect(document.querySelector<HTMLElement>('[data-gv-turn-navigator="chatgpt"]')?.hidden).toBe(
      true,
    );
    await scope.dispose();
  });

  it('re-aims at an older shell after its message body mounts', async () => {
    document.body.innerHTML = '<div data-turn-id-container="user-1"></div>';
    const shell = document.querySelector<HTMLElement>('[data-turn-id-container="user-1"]')!;
    let top = 1400;
    shell.getBoundingClientRect = () => ({
      top,
      bottom: top + 50,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    const scope = new PluginScope();
    start(scope);
    await flush();
    document.querySelector<HTMLButtonElement>('.timeline-dot')!.click();
    top = 500;
    shell.innerHTML = '<div data-message-author-role="user">Loaded old prompt</div>';
    await vi.waitFor(
      () => expect(vi.mocked(window.scrollTo).mock.calls.length).toBeGreaterThan(1),
      { timeout: 1200 },
    );
    await vi.waitFor(() =>
      expect(document.querySelector('.timeline-dot')?.getAttribute('aria-label')).toBe(
        'Loaded old prompt',
      ),
    );
    await scope.dispose();
  });

  it('treats a rendered turn frame without a conventional role as materialized', async () => {
    document.body.innerHTML =
      '<div data-turn-id-container="assistant-image"><section data-turn="assistant"><div class="group/imagegen-image">Picture</div></section></div>';
    const scope = new PluginScope();
    start(scope);
    await flush();
    document.querySelector<HTMLButtonElement>('.timeline-dot')!.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(vi.mocked(window.scrollTo).mock.calls).toHaveLength(1);
    await scope.dispose();
  });
});
