export const CHATGPT_FOLDERS_CSS = `
.gv-chatgpt-folders .gv-floating-folder-panel__icon-button--cloud-upload,
.gv-chatgpt-folders .gv-floating-folder-panel__icon-button--cloud-sync,
.gv-chatgpt-folders .gv-floating-folder-panel__hint-stack { display: none; }
.gv-chatgpt-folders__controls { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 10px; border-bottom: 1px solid currentColor; }
.gv-chatgpt-folders__select { min-width: 0; }
.gv-chatgpt-folders__select, .gv-chatgpt-folders__controls button { border: 1px solid rgba(128,128,128,.45); border-radius: 6px; background: transparent; color: inherit; padding: 6px; font: inherit; }
.gv-chatgpt-folders__controls button { cursor: pointer; }
.gv-chatgpt-folders__controls button:disabled { cursor: default; opacity: .5; }
.gv-chatgpt-folders__controls button:focus-visible, .gv-chatgpt-folders__select:focus-visible { outline: 2px solid #60a5fa; }
.gv-chatgpt-folders__status { grid-column: 1 / -1; font-size: 11px; min-height: 1em; }
html[data-gv-scheme='light'] .gv-chatgpt-folders__select { color: #202124; background: white; }
@media (prefers-color-scheme: light) { html:not([data-gv-scheme]) .gv-chatgpt-folders__select { color: #202124; background: white; } }
`;
