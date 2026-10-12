# add-to-chat 规格

Claude Code mod，对标 Codex App 的 "Add to chat"：在 fullscreen TUI 里用鼠标选中 transcript 中的一段文字（Claude 的回复或自己之前的 prompt），附上可选的 Comment，作为 Annotation 随下一条 prompt 发给模型。

术语见 `../GLOSSARY.md`（Annotation / Excerpt / Source / Comment / Citation / Annotation Template）。为什么只支持 fullscreen、为什么轮询选区，见 `adr/0001-fullscreen-only-polled-selection.md`。

参考的 Codex 交互：选中文字 → 浮动工具条 "Add to chat" → 可选评论框 "Add an optional comment…" → 原文选区上出现编号气泡 ①② → 输入框上方出现 chip "N annotations" → 发送。

## 开发环境

- Claude Code 2.1.296，mods 默认开启。
- 开工时先加载 `plugin-authoring` skill，它会告诉你本次会话的 mod 目录（`~/.claude/dev-mods/<session>/`）和 API 类型文件 `claude-code.d.ts` 的路径。类型文件路径每个进程都不同，所以下文按**符号名**引用，用 grep 定位。
- mod 名：`add-to-chat`。开发阶段放在 dev-mods 目录里热重载，完成后复制到仓库根目录的 `add-to-chat/`，再加上 `.claude-plugin/marketplace.json`。
- 文件：`.claude-plugin/plugin.json`（含 `"types"` 和 `userConfig`）、`hooks/hooks.json`、`hooks/register.tsx`、`types/index.d.ts`（`PluginState` 契约）、`*.test.ts`。

## 已确认的 API 事实（2.1.296）

| 用途 | 符号 | 要点 |
|---|---|---|
| 读选区 | `$.ui.selection()` → `UiSelection` | `{ text, requestId? }`。fullscreen 关闭、`-p` 或 surface 不支持时返回 `undefined`。`requestId` 是选区所在的 transcript 行；跨多行、在 prompt/pane 里或已滚出渲染范围时没有 |
| 选区的持续性 | 同上，doc comment；实测见 `spikes.md` §3 | 按键或点击会**去掉高亮**，但返回值保持为上一次的选区，直到再次选择，或下一条 prompt/命令执行完。实测：Esc、点空白处、打字都不会清除；prompt 要等它的 **turn 结束**才清除 |
| 轮询 | `$.clock.every(ms, fn)` | 返回 `Timer`（`{ cancel() }`）。热重载时引擎会丢掉旧环境的 timer |
| 输入框上方的 band | `ui.render` + `{ component: 'AbovePrompt' }` | 没有内容时返回 `next(e)`。示例见 skill 的 `examples/band.tsx` |
| 按钮和输入框 | `Button`、`Input`（`InputProps`：`key`、`placeholder`、`autoFocus`、`onSubmit`） | 从 `$.ui.resolve(e)` 取得。Esc 把焦点还给 prompt，不会触发 `onSubmit` |
| 回复行 | `ui.render` + `AssistantMessage`，`props.text` 是 markdown | 改写 `text` 只影响显示，不改存储内容和模型读到的内容 |
| 用户消息行 | `ui.render` + `UserMessage`，`props.text`、`props.isExpanded`、`props.origin` | 自己画紧凑行时，`isExpanded`（ctrl+o）为 true 要返回 `next(e)`。提交后先以 `requestId: "placeholder"` 渲染原文，再换成真正的 uuid 渲染改写后的全文 |
| 改写 / 附加 prompt | `prompt.submit`（`PromptSubmitInput`：`text`、`context?`、`origin`） | `next({ ...e, text })` 会让屏幕上的用户消息跟着变；`next({ ...e, context: [...] })` 只有模型能看到 |
| 代发 prompt | `$.prompt.submit({ text })` | **不使用**。实测：本插件发出的 prompt 不经过本插件的任何 hook，也不触发 `UserMessage` 渲染 |
| 填草稿 | `$.prompt.fill({ text })` | 用于空草稿时的 `[Send]`（第 8 节） |
| 读草稿 | `$.prompt.read()` → `{ text, cursor }` | 判断草稿是否为空 |
| 斜杠命令 | `session.start` 里调 `$.command.register`，`command.run` 中应答 | 示例见 `examples/pane.tsx` |
| toast | `$.ui.toast(text)` | |
| 状态 | `$.state` + `types/index.d.ts` 的 `PluginState` | 不能用模块变量，热重载会清空。render 时读 state 会自动订阅更新；不能在 render 里写 state |
| 用户配置 | manifest 的 `userConfig` → `register(on, options)` 的 `options` | 测试用 `test(name, { options }, body)` 注入 |
| 读模板文件 | `$.fs.read` | |
| 跨会话保存 | `$.store` | JSON，总量 4 MiB |

## 行为

### 1. 前提：fullscreen
`$.ui.selection()` 返回 `undefined` 时，轮询不做任何事。用户执行 `/add-to-chat` 时弹 toast，提示需要 fullscreen。

### 2. 收录（Add to chat）
- `session.start` 时启动 `$.clock.every(250, …)` 轮询选区。热重载会再次触发 `session.start`，要防止重复启动或者先取消旧的。
- 拿到非空选区，并且它的 `text + requestId` 和"最近一次已收录或已忽略"的不同时，band 显示 `[Add to chat] "<Excerpt 预览，截断>" [×]`。`[×]` 表示忽略这个选区。选区本身不会消失（见上表），没有这个按钮的话，按钮会一直挂到下一个 turn 结束。
- 选区回到 `undefined`，或者和已收录/已忽略的相同时，按钮消失。"最近一次已收录或已忽略"**跨提交保留**：从提交到 turn 结束这段时间里，选区还会返回刚收录的那段。**同一选区不能重复收录**，这是可以接受的。
- Excerpt 存储前先去掉第 5、9 节的标记字符（`⁽⁾⁰-⁹`、`①-⑳`），因为它们会被一起选进来。
- `/add-to-chat` 做的事和点按钮相同，作为键盘方式的入口。结果用 toast 告知，命令不输出文本（命令输出会进入模型上下文）。
- 点击后**立即**创建 Annotation（Comment 为空），编号为当前待发送数 + 1。

### 3. Comment
收录后，band 显示 `Input`（`autoFocus`，placeholder 为 "Add an optional comment… (click here to type)"）。Enter 写入 Comment（空字符串表示不写）。Esc 让焦点回到 prompt，Annotation 保留，Comment 为空。
- 实测（`spikes.md` §5）：用鼠标点击 Button 不会让 band 拿到键盘，`autoFocus` 和 `$.ui.focus` 都移不动焦点，键盘仍在 prompt 上。所以 Add 之后仍调用 `$.ui.focus`（band 通过 ctrl+x tab 获得焦点时有效），鼠标用户则点击输入框输入，placeholder 里有提示。
- Esc 不会触发任何事件。所以评论框打开后，如果 prompt 草稿发生了变化（用户回去写 prompt，或点了 `[Send]`），就关闭评论框；打开时的草稿作为比较基准，以免把 `/add-to-chat` 命令本身清空草稿当成离开。

### 4. Source
- `requestId` 对应的行是 `AssistantMessage` → `claude`；是 `UserMessage`（composer 来源）→ `you`；其他情况或没有 `requestId` → `transcript`。
- 实现方式：render hook 在绘制这两类行时，把 `requestId → role` 记进**模块级缓存**（render 里不能写 state）。这是派生缓存，不是绘制状态：热重载后所有可见行都会重新渲染，缓存随即重建；已滚出渲染范围的行，其选区本来就没有 `requestId`。忽略 `requestId === "placeholder"`。
- 每条记录 `{ index, text, source, rowId?, comment? }`。**不附带**上下文。

### 5. 原文中的编号标记
- `AssistantMessage` / `UserMessage` 的 render hook：如果该行 `requestId` 上有待发送的 Annotation，就在 `props.text`（markdown）里找 Excerpt，在**第一次出现**的位置后面插入 `⁽ⁿ⁾`。找不到时，在行首加 `ⁿ`（①②…）。
- 匹配算法（依据见 `spikes.md` §2）：把 markdown 投影成渲染后的纯文本，同时保留每个字符到原文的偏移映射，再用空白不敏感的方式搜索 Excerpt。投影规则按行类型区分：`AssistantMessage` 去掉 `` ` `` `*` `~`、单词边界上的 `_`，`[text](url)` → `text`；`UserMessage` 只去掉 `` ` `` `*` `~`。插入点放在匹配结尾之后，并越过紧跟着的闭合标记（`` ` ``、`**`、`](url)`），这样不会插进行内代码或链接内部；如果落在代码块里，退回到行首。
- 标记用行内代码包起来（`` `⁽ⁿ⁾` ``），借终端给行内代码上的颜色实现"彩色"。
- prompt 发出后，所有标记清除，编号从 1 重新开始。

### 6. 管理
band 上的 chip 显示 `N annotation(s)`，点击展开列表，每行是 `① You: "…" — comment [×]`，`[×]` 删除该条。删除后剩余条目重新编号。不支持编辑。

### 7. 发送：Annotation Template
- `userConfig.templatePath`（可选字符串）指定模板文件，用 `$.fs.read` 读取；不配置时使用内置默认模板。
- 语法是 Mustache 子集：
  - 全局：`{{request}}`、`{{count}}`、`{{annotations_json}}`（JSON 数组，每项 `{ text, source: { role, rowId }, comment? }`，和 Codex 的结构对应）
  - 循环 `{{#annotations}}…{{/annotations}}`，内部可用 `{{index}}`（从 1 开始）、`{{text}}`、`{{source}}`、`{{rowId}}`、`{{comment}}`，以及条件块 `{{#comment}}…{{/comment}}`
- `prompt.submit` 时如果有待发送的 Annotation：
  - 模板**含** `{{request}}`：`next({ ...e, text: 渲染结果 })`。transcript 中这条用户消息的 `UserMessage` 行重绘为 `原文` 加一行 `📎 N annotations`；`isExpanded` 时返回 `next(e)` 显示完整文本。
  - 原文映射表：key 是改写后的全文（`UserMessage` 的 `props.text` 和它逐字节相同，实测见 `spikes.md` §4），value 是 `{ text: 原文, count }`。写进 `$.store` 以支持 `--resume`，`session.start` 时读进 state 供 render 读取；只保留最近 200 条。
  - 模板**不含** `{{request}}`：`next({ ...e, context: [...(e.context ?? []), 渲染结果] })`。
  - 只处理 `origin` 为用户自己输入（composer）的 prompt。
  - 提交后清空待发送列表，同时清除第 5 节的标记。

默认模板（改写自 Codex 的格式，使其能指向用户自己的 prompt，并把指令名改为 `:annotation`）：

```markdown
# Response annotations:
Each item contains text selected from earlier in this conversation (Claude's replies or the user's own prompts) and may include a user comment. Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every comment. For every annotation you address, include its inline directive `:annotation{index="N"}`, where N is its one-based array position (for example, `:annotation{index="1"}`). Do not use unstructured annotation labels.
<response-annotations>
{{annotations_json}}
</response-annotations>

## My request:
{{request}}
```

另一种 XML 风格，用于测试第 6 条，也作为 README 中的示例：

```
The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.
{{#annotations}}
<annotation n="{{index}}" source="{{source}}">
<excerpt>{{text}}</excerpt>
{{#comment}}<comment>{{comment}}</comment>{{/comment}}
</annotation>
{{/annotations}}
```
（这个模板不含 `{{request}}`，所以输出放进 context。）

### 8. 空草稿
实测：空草稿（包括只有空格的草稿）按 Enter **不会**触发 `prompt.submit`；`$.prompt.submit` 也不能用（见上表）。
- 轮询顺带读取 `$.prompt.read().text`，把"草稿是否为空"写进 state（只在变化时写）。
- 有 Annotation 且草稿为空时，band 显示 `[Send]`。点击后调用 `$.prompt.fill({ text: "(see annotations)" })`，用户再按 Enter，走正常的 composer 路径，第 7 节照常处理。

### 9. Citation
`AssistantMessage` render hook 把回复里的 `:annotation{index="N"}` 替换成彩色的 `ⁿ`（①②…），原始指令不显示。Citation 标记**永久保留**，和第 5 节的清除无关。编号只在对应的那条 prompt 内有效。

## 测试清单（`claude plugin test`）

1. 模拟一个选区，点击 Add to chat 后生成一条 Annotation，Source 正确
2. 写入 Comment 后，band 显示 `1 annotation`
3. 提交 prompt：按模板拼装（text 或 context），之后待发送列表清空
4. `selection()` 为 `undefined` 时执行 `/add-to-chat`，弹出 toast
5. markdown 中找不到 Excerpt 时，标记退回到行首
6. 模板渲染：默认（Codex 风格，改写 text）和 XML 风格（写入 context）各一条
7. `AssistantMessage` 中的 `:annotation{index="2"}` 被渲染为编号，原始指令不显示

UI 测试同时覆盖 `['terminal', 'desktop']`。行内标记的视觉效果需要在真实 fullscreen 会话里人工确认。

## 实测

原"待实测"四项已在 2.1.296 上测完，结论和方法见 `spikes.md`，已并入上文。
