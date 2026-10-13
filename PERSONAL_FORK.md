# Voyager ChatGPT 个人修改版

## 来源与署名

本仓库是 [voyager-crew/voyager](https://github.com/voyager-crew/voyager) 的个人分叉，修改起点为上游提交 [`534d4ce`](https://github.com/voyager-crew/voyager/commit/534d4ced774a34e348fcea6f160142fc97bdb718)，对应 Voyager 1.9.0。原项目的作者、贡献者、提交历史、[GPL-3.0 许可证](./LICENSE)和[第三方声明](./THIRD_PARTY_NOTICES.md)均保留。原有功能和大部分代码来自 Voyager 原项目；下述功能是 2026 年 10 月的个人修改。本修改版未经 Voyager 项目维护者认可或发布。

## 个人修改范围

- 为 ChatGPT 对话新增时间线：列出页面已加载的回合、搜索、星标和点击节点跳转。
- 为 ChatGPT 对话新增本地文件夹：按两级目录保存对话链接与分类，支持 JSON 导入导出；不改变 ChatGPT 原生项目。
- 适配 ChatGPT 当前的回合标记、倒序滚动及顶部按钮布局。
- 为这些改动增加了相应测试。完整差异可通过本分支与上述上游提交比较。

新增或修改的主要源码位于 `src/features/plugins/builtin/chatgptFolders/`、`src/features/plugins/builtin/chatgptTimeline/`、`src/features/plugins/verbs/turnNavigator/`、`src/pages/content/export/`，以及相应的注册、存储和测试文件。修改日期和每个文件的具体差异也记录在本分支 Git 提交中。

## 安装与限制

请使用本仓库个人修改版的 Chrome 安装包或从此分支构建；上游官方扩展不包含这里新增的 ChatGPT 时间线和本地文件夹。详细步骤见发布页随附的 `install-guide-zh.md`。两个新增功能默认关闭，需在扩展弹窗中启用并授权 `chatgpt.com` 站点。文件夹数据保存在浏览器本地；没有账号系统或云同步。ChatGPT 页面结构变化可能使时间线需要再次适配。

本修改版继续按上游的 GPL-3.0 许可证分发。安装包同时附有 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`；完整对应源码在本仓库。

另有独立的 [Voyager Codex Personal](https://github.com/kocean9-freedom/voyager-codex-personal) 仓库。它受 Voyager 的交互目标启发，但不属于此浏览器扩展分叉，也不具备桌面应用原生聊天时间线。

## 2026-10-13 安全依赖检查

本次修复覆盖了 shell-quote 的命令注入、文档工具间接使用旧 Vite、旧 KaTeX 和旧 UUID。
锁文件统一使用 shell-quote 1.11.0、Vite 7.3.5、KaTeX 0.18.11 和 UUID 11.1.1。
Vue 构建插件同步更新到兼容 Vite 7 的版本。升级后须执行 `bun run verify:pr`。

以下依赖仍有未修复公告。它们位于开发和文档工具的依赖树中。
仅凭这个位置不能认定漏洞没有影响。安全工作流继续报告并阻止定时检查通过。

| 依赖             | 级别 | 来源                                       | 公告                                                                      |
| ---------------- | ---- | ------------------------------------------ | ------------------------------------------------------------------------- |
| braces 3.0.3     | 高危 | CRXJS、文档更新日志工具和 nodemon          | [递归栈耗尽](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)           |
| node-forge 1.4.0 | 高危 | web-ext 与 web-ext-run 的 Android 调试依赖 | [签名验证缺陷](https://github.com/advisories/GHSA-86w9-cpqp-85rv)         |
| sprintf-js 1.0.3 | 中危 | 文档更新日志工具的 YAML 解析依赖           | [精度参数导致拒绝服务](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) |

截至检查时，上述公告没有可用修复版本。完整清除这些项需要验证替代工具或维护补丁。
本次没有删除现有工具，也没有关闭或豁免安全检查。
