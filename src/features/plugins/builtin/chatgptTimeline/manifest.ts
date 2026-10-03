import type { PluginManifest } from '../../types';

/** Builtin so remote catalog refreshes cannot remove this personal-use feature. */
export const CHATGPT_TIMELINE_MANIFEST: PluginManifest = {
  id: 'voyager.chatgpt-timeline',
  name: 'ChatGPT · Timeline',
  version: '1.0.0',
  description: 'Jump between ChatGPT messages, star important turns, and search mounted text.',
  i18n: {
    zh: {
      name: 'ChatGPT · 时间线',
      description: '跳转聊天消息、星标重要回合，并搜索已加载的文本。',
      settings: { compactView: { label: '使用紧凑索引' } },
    },
    zh_TW: {
      name: 'ChatGPT · 時間線',
      description: '跳轉聊天訊息、標記重要回合，並搜尋已載入的文字。',
      settings: { compactView: { label: '使用精簡索引' } },
    },
    ja: {
      name: 'ChatGPT · タイムライン',
      description:
        '会話内のメッセージに移動し、重要なやり取りにスターを付け、読み込まれたテキストを検索します。',
      settings: { compactView: { label: 'コンパクト表示を使う' } },
    },
    ko: {
      name: 'ChatGPT · 타임라인',
      description: '메시지로 이동하고 중요한 대화를 별표로 표시하며 로드된 텍스트를 검색합니다.',
      settings: { compactView: { label: '컴팩트 타임라인 사용' } },
    },
    fr: {
      name: 'ChatGPT · Timeline',
      description:
        'Parcourez les messages, marquez les échanges importants et recherchez le texte chargé.',
      settings: { compactView: { label: 'Utiliser la chronologie compacte' } },
    },
    es: {
      name: 'ChatGPT · Línea de tiempo',
      description:
        'Salta entre mensajes, destaca los turnos importantes y busca en el texto cargado.',
      settings: { compactView: { label: 'Usar cronología compacta' } },
    },
    pt: {
      name: 'ChatGPT · Linha do tempo',
      description:
        'Navegue entre mensagens, marque trechos importantes e pesquise o texto carregado.',
      settings: { compactView: { label: 'Usar linha do tempo compacta' } },
    },
    ru: {
      name: 'ChatGPT · Таймлайн',
      description:
        'Переходите между сообщениями, отмечайте важные реплики и ищите загруженный текст.',
      settings: { compactView: { label: 'Использовать компактную шкалу' } },
    },
    ar: {
      name: 'ChatGPT · المخطط الزمني',
      description: 'انتقل بين الرسائل وميّز الردود المهمة وابحث في النص المحمّل.',
      settings: { compactView: { label: 'استخدام المخطط الزمني المضغوط' } },
    },
  },
  author: 'personal-build',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.4.0',
  tier: 'declarative',
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  requires: { handlers: ['turnNavigator'] },
  contributes: {
    settings: { compactView: { type: 'boolean', label: 'Use compact timeline', default: false } },
    domOps: [
      {
        op: 'native',
        handler: 'turnNavigator',
        params: { turn: '[data-turn-id-container], [data-turn-key]' },
      },
    ],
  },
};
