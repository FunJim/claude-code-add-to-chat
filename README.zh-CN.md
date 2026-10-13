# add-to-chat

[English](README.md) · [简体中文](README.zh-CN.md)

把 Codex 的 "Add to chat" 搬到 Claude Code。在 fullscreen 终端里，用鼠标选中 transcript 里的任意文字（Claude 回复里的一句话、你之前发过的 prompt、工具的输出），可以附上一句评论，它会作为带编号的 annotation 随下一条 prompt 一起发出。Claude 会逐条回应，并在回复里用 ①② 标出引用的是哪一条。

```
⏺ The quick brown fox⁽¹⁾ jumps over the   │                                          ✕
  lazy dog.                                │[ ✚ Add to chat ] “capital of France” ✕ ignore
                                           │────────────────────────────────────────────
  Paris is the capital of France.          │1: Claude ✕
                                           │
                                           │① from Claude's reply
                                           │╭──────────────────────────────────────────╮
                                           ││ quick brown fox                          │
                                           │╰──────────────────────────────────────────╯
                                           │Comment: which animal is this?
                                           │────────────────────────────────────────────
                                           │They go with your next prompt ↵
───────────────────────────────────────────────────────────────────────────────────────────
❯ for each annotation, answer its comment or say what it refers to
```

发送后，你的消息行只显示你输入的内容，Claude 的回复会逐条引用：

```
❯ for each annotation, answer its comment or say what it refers to
  📎 2 annotations

⏺ The "quick brown fox" is a fox, a small wild canine. ①

  The "capital of France" refers to Paris, the country's capital city. ②
```

## 环境要求

- Claude Code 2.1.296 或更新版本，需要支持 mods。
- **fullscreen 模式**：`CLAUDE_CODE_NO_FLICKER=1`。非 fullscreen 时鼠标选区由终端管理，插件读不到（[原因](docs/adr/0001-fullscreen-only-polled-selection.md)）。

## 安装

在 Claude Code 终端会话的输入框里输入：

```
/plugin install add-to-chat --marketplace FunJim/claude-code-add-to-chat
```

提示是否添加 marketplace 时回答 `y`，再选择安装范围。启动 Claude Code 时带上 `CLAUDE_CODE_NO_FLICKER=1`，或者在 settings 的 `env` 里设置它。

## 使用

transcript 旁边有一个面板，会话开始时自动打开（终端窄于 144 列时需要执行一次 `/add-to-chat` 打开；窄于 110 列时面板显示在输入框上方）。面板第一行显示 `Select text in the transcript to add it.`。

1. **选中**：用鼠标在 transcript 里选中一段文字，面板第一行会变成 `[ ✚ Add to chat ] "…" ✕ ignore`。点按钮，或者执行 `/add-to-chat`。
2. 每条 annotation 会有一个 **tab**（`1: Claude ✕   2: You ✕`），按对应的数字键可以切换。当前 tab 显示完整的原文、来源和一个 **Comment** 输入框：点击后输入，按 Enter 保存。也可以留空。
3. 可以重复多次。每段被收录的文字在 transcript 里会带上 `⁽¹⁾` 这样的标记。点 tab 上的 `✕` 会删除这条 annotation。状态栏会显示 `📎 N annotations`。
4. **发送**：像平常一样发送 prompt。transcript 里你的消息显示为你输入的内容加一行 `📎 N annotations`，按 ctrl+o 可以看到模型实际收到的完整内容。如果没有要输入的内容，点 `[ Send ]` 会在输入框里填上 `(see annotations)`，再按 Enter 发送即可。

Claude 回复里的 `:annotation{index="1"}` 会显示为 ①。

面板在选中任何文字之前就已经打开，而且第一行始终只占一行，所以拖选时鼠标下方的内容不会移动。用面板上的 `✕` 关闭后，它会保持关闭，直到你再执行 `/add-to-chat`。

## Annotation Template（注释模板）

默认会把 prompt 改写成 Codex 的格式：先是 annotation 的 JSON 数组，再是 `## My request:` 和你输入的内容。想换成自己的措辞，可以把 `templatePath` 选项指向一个模板文件。在 `/plugin` → add-to-chat → configure 里设置，或者写进 settings：

```json
{ "pluginConfigs": { "add-to-chat": { "options": { "templatePath": "~/.claude/add-to-chat.tmpl" } } } }
```

每条 annotation 的来源（JSON 里的 `role`、模板里的 `{{source}}`）取值为：`assistant`（Claude 的回复）、`user`（你的 prompt）、`tool`（工具调用或结果）、`system`（Claude Code 自己的行：通知、命令输出、轮次耗时）、`transcript`（不在某一行上）。

模板语法是 Mustache 的一个子集，标签说明和示例见[英文 README](README.md#the-annotation-template)。要点：

- 模板里**有** `{{request}}` 时，渲染结果替换你的 prompt。
- 模板里**没有** `{{request}}` 时，你的 prompt 原样发出，渲染结果作为隐藏的上下文附在旁边。
- ①② 只有在模板要求 Claude 写 `:annotation{index="N"}` 时才会出现，默认模板会这样要求。

## 限制

- 只支持 fullscreen 模式。
- 同一行里同样的文字不能重复收录。
- 标记加在 Excerpt 在该行里第一次出现的位置。代码块里的文字和跨表格单元格的选区，标记加在行首。
- 跨多行的选区没法归到某一行上，来源记为 `transcript`。

## 文档

文档以英文为准：

- [docs/design.md](docs/design.md)：工作原理和设计取舍
- [docs/](docs/)：术语表、依赖的 Claude Code 行为、决策记录
- [CHANGELOG.md](CHANGELOG.md)

## 参与贡献

欢迎提 issue 和 PR，开发说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。`npm run e2e` 会在真实的 Claude Code 会话里运行端到端演示（[e2e/README.md](e2e/README.md)）。

## 许可证

[MIT](LICENSE)
