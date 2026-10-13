# 实测记录（2.1.296，2026-10-12）

对应 `spec.md` 的"待实测"。方法：`spikes/probe/` 是一次性的 probe mod，在 tmux 里用 `CLAUDE_CODE_NO_FLICKER=1 claude --plugin-dir spikes/probe` 启动 fullscreen 会话，用 `spikes/tools/drag.sh` 往 pane 里写 SGR 鼠标序列模拟拖选，probe 把选区、`prompt.submit` 和消息行的 props 记到 `/tmp/atc-probe/log.jsonl`，再用 `spikes/tools/match.py` 离线评估匹配策略。

## 1. 空草稿按 Enter：不会触发 `prompt.submit`

- 草稿为空、或者只有空格时按 Enter，都没有 `prompt.submit`。只有空格的草稿会原样留在输入框里。
- **`$.prompt.submit` 兜底也不能照原方案做**：插件自己 `$.prompt.submit` 发出的 prompt **不会经过本插件的任何 hook**。`prompt.submit` 没触发，transcript 里那一行也没有触发 `UserMessage` 渲染。从按钮的 `onPress` 里调用和从 `$.clock.after` 里调用，结果都一样。这和 `$.prompt.submit` doc comment 写的"the plugin's others see it"不符。
  - 那一行显示为 `› Prompt from the <plugin> plugin`；不加 `asUser: true` 时，模型读到的还会带上 "The <plugin> plugin sent a message: …" 这层包装。
  - `PromptSubmitArgs` 不接受 `context`。
- 结论：第 8 节需要改方案，见文末"对规格的影响"。

## 2. Excerpt 和 markdown 的匹配

选区文本是**渲染后的文字**（"what a copy would take"）：

| 选区跨越 | `selection().text` | 原文 markdown |
|---|---|---|
| 行内代码、加粗、链接 | `npm test before you commit the change, then read the guide` | `` `npm test` before you **commit the change**, then read [the guide](https://…) `` |
| 跨段落（同一条回复） | `MARKTEST here.\n\nSecond` | 同左（段落间的 `\n\n` 保留） |
| 跨列表项 | `item one\n- list item two` | 同左（第二项的 `- ` 保留） |
| 从回复的 `⏺` 开始选 | `Run npm` | `⏺` 不会进入选区 |
| 已插入的标记 | `sentence for MARKTEST⁽¹⁾ here.` | **我们插进去的 `⁽¹⁾` 会被选进去** |
| 用户消息（换行折叠的多行） | `…"Run npm test before …, then read [the guide](https://example.com/guide) for details.` | 用户行去掉了反引号和 `**`，但**保留**链接的原始写法 |

- 同一条回复内跨段落、跨列表项的选区，**仍然带 `requestId`**（同一个 transcript 行）。
- 直接用 `indexOf` 在 `props.text` 里找：17 个选区（含拖选中途的中间状态）里匹配上 11 个，凡是带行内代码、加粗、链接的都失败。
- 投影匹配（按行类型选择投影规则）：17/17。做法是把 markdown 投影成"渲染后的纯文本"，同时记录每个字符在原文中的偏移，然后用空白不敏感的正则搜索 Excerpt，再把匹配结尾映射回原文偏移，在那里插入标记。
  - `AssistantMessage`：去掉 `` ` `` `*` `_`（单词内部的 `_` 保留，例如 `foo_bar`）和 `~`，`[text](url)` → `text`。
  - `UserMessage`：只去掉 `` ` `` `*` `~`，链接写法保留。
  - 收录时先把 Excerpt 里的标记字符（`⁽⁾⁰-⁹`、`①-⑳`）去掉。
- 没覆盖到的写法：标题 `#`、引用 `>`、表格、代码块（围栏内文本原样，可能可以直接匹配）、HTML 实体。匹配失败时退回到行首标记，这是规格里已有的兜底。

## 3. 点击 band 按钮时的选区；轮询开销

- 点击 band 按钮时，`onPress` 里读到的 `selection()` 和点击前完全一样。
- 选区**一直保留**：点击 transcript 空白处、按 Esc、在输入框打字之后，都不会变回 `undefined`。只有在**下一条 prompt 的 turn 结束**之后才会变成 `undefined`（不是提交那一刻）。
  - 由此推出：从提交到 turn 结束这段时间里，刚收录过的选区还会被返回。"最近一次已收录或已忽略"必须跨提交保留，否则按钮会重新出现。
  - 由于选区不会自己消失，band 需要一个"忽略"操作（规格里提到"已忽略"，但没写入口）。否则对一个不想收录的选区，按钮会一直挂着，直到下一个 turn 结束。
- 拖选过程中，250ms 轮询会拿到中间状态（`foo_b` → `foo_bar()`），band 会跟着更新几次。可以接受。
- 开销：720 次轮询，单次 `selection()` 平均 0.47ms，最大 20ms（在插件里用 `$.clock.now()` 测得）。体感没有问题。
- `$.clock.every` 返回的是 `Timer`（`{ cancel() }`），不是函数。

## 4. 改写 `text` 后还原原文：可以，按内容

- `prompt.submit` 改写 `text` 之后，`UserMessage` 先用 `requestId: "placeholder"` 渲染一次，`props.text` 是**原文**；大约 100ms 后换成真正的 uuid，`props.text` 变成**改写后的全文**，和传给 `next` 的字符串逐字节相同。
- `next()` 的返回值 `{ text, origin }` 不带消息 id，所以提交时拿不到 rowId。按内容还原是可行的：state 里存 `改写后的全文 → 原文`。
- ctrl+o 时 `isExpanded: true`，`props.text` 仍然是改写后的全文。
- 会话恢复或热重载之后，`$.state` 还在（重载不会清空）；但新开进程时 state 是空的。如果要在 `--resume` 之后也显示紧凑行，需要把这张映射表写进 `$.store`，或者按模板结构从全文里把 `{{request}}` 部分解析出来。
- `UserMessage` 的 placeholder 阶段也会触发第 4 节"记录 requestId → role"的逻辑，要忽略 `requestId === "placeholder"`。

## 5. 实现之后的真机验证

用 `claude --plugin-dir add-to-chat` 在 tmux 里把完整流程跑了一遍：选区 → Add → Comment → 列表删除并重排 → 发送 → Citation → `[Send]` → `--continue` 恢复。

- 用鼠标点击 band 的 Button **不会**让 band 拿到键盘：`$.ui.focus` 返回 `{ deny: "that site does not hold the keyboard" }`，`autoFocus` 也不起作用，接着打字会进入 prompt。直接点击 `Input` 可以输入。
- 用行内代码包起来的标记显示为颜色 153（和行内代码相同）。
- `--continue` 之后，靠 `$.store` 里的映射表，两条带 Annotation 的消息都显示为紧凑行。
- 第一次运行时有一回点击 `[ Add to chat ]` 没有反应，之后（包括在新进程里）都复现不了。

## 6. herdr 里的端到端测试（2026-10-13）

两个 herdr pane 各跑一个 `claude --plugin-dir add-to-chat`：一个用默认模板，一个用 `--settings` 的 `pluginConfigs["add-to-chat"].options.templatePath` 指向 XML 模板。鼠标操作通过 `herdr pane send-text` 写入 SGR 序列（现在由 `e2e/harness/mouse.ts` 负责）。

- **默认模板**：发给 LLM 的用户消息就是渲染后的全文，和 `spec.md` 第 7 节一致。模型逐条回应 Comment，每条都以 `:annotation{index="N"}` 开头，显示为代码色的 ①②。
- **XML 模板**：用户消息保持原样，渲染结果存为 `hook_additional_context` 附件。模型按编号回应，没有 Comment 的条目也会处理。
- **`[Send]`**：request 是 `(see annotations)`，模型从 Excerpt 本身推断出了意图。
- **热重载**：重载后，band 要等 state 变化才会重绘，所以 `session.start` 里会先清一次 `candidate`。
- **矮 pane**：band 只有 1 行时，引擎只显示一行 "↓ n more"。所以 band 按 `maxRows` 只显示最需要的那几行。
- **Fragment**：`<>…</>` 放在 Box 里会打乱横向布局，要改用子元素数组。`borderStyle="quote"` 会多出一个空的上边框行，所以竖线改为每行自己画。
- **`/clear`**：会触发 `session.end`（reason 是 `clear`），之后不会再有 `session.start`。待发送的 Annotation 指向的行已经不存在了，所以要清空。
- **标记紧挨代码片段**：`` `let` `` 后面直接接 `` `⁽¹⁾` ``，两组反引号会连成双反引号的代码片段。现在匹配结尾落在代码片段里时，标记插在片段内部；其他贴着反引号的位置用 U+200B 隔开。
- **测试工具的问题，不是 mod 的 bug**：模拟拖选有时没能正确收尾，或者被识别成连击，结果选中整行或跨行，没有 `requestId`。这时 mod 按规格把 Source 记为 Transcript。布局变化后的第一次点击有时会被吃掉，需要再点一次。

## 7. 消息类型矩阵（2026-10-13）

后台 tmux 会话（160×50）同时加载 add-to-chat 和只做记录的探针 `spikes/probe`（每一行的组件、`requestId`、props，以及选区，写到 `ATC_PROBE_LOG`）。每种行都做一遍"选中 → Add"，再展开列表核对 Source 和标记，最后发送并读 transcript JSONL 里的 prompt。这一套后来成了 `e2e/` 测试框架，矩阵变成了 `e2e/scenarios/02-rows.e2e.ts`。

| 行 | 引擎组件（`requestId`） | 收录 | Source | 行内标记 |
|---|---|---|---|---|
| 自己的 prompt（composer） | `UserMessage`（uuid；提交瞬间是 `placeholder`） | ✓ | you | ✓ |
| 紧凑行的原文 / ctrl+o 展开后的全文 | `UserMessage` | ✓ | you | ✓（展开视图在全文上画） |
| 紧凑行的 `📎 N annotations` 及其任意前缀 | `UserMessage` | 不提供（mod 自己的界面元素） | — | — |
| 回复正文、标题、表格单元格、引用、嵌套列表、编号列表、行内代码、`__粗体__`、`_斜体_`、`~~删除线~~`、中文、emoji | `AssistantMessage`（每个文本块一个 uuid） | ✓ | claude | ✓（代码片段内用不带反引号的标记） |
| 表格里跨列的一行（含 `│`） | `AssistantMessage` | ✓ | claude | 回退到行首 |
| 代码块 | `AssistantMessage` | ✓ | claude | 回退到行首 |
| 工具调用标题 `Agent(…)`、`Edit(…)`，以及结果、diff | `ToolUse` / `ToolResult`（`tool_use_id`） | ✓ | transcript | — |
| 折叠组 `Read 3 files, ran 1 shell command` | `ToolGroup`（`collapsed-…`） | ✓ | transcript | — |
| `Baked for 11s` | `TurnDuration` | ✓ | transcript | — |
| 子 agent 结束、后台命令结束的通知 | `UserMessage`，origin 为 `task-notification` | ✓ | transcript | — |
| 插件命令的输出 | `CommandOutput` | ✓ | transcript | — |
| `!` bash 模式的输入和输出、`/命令` 输入行、插件 prompt 行、`… reloaded` 通知、`/compact` 产生的行、logo 区域 | 无 `ui.render` | ✓ | transcript | — |
| AskUserQuestion 被拒的结果、`(No output)` | `ToolResult` | ✓ | transcript | — |
| 粘贴的长文本（transcript 里显示展开后的内容） | `UserMessage` | ✓（多行也可以） | you | ✓ |
| 跨多行的长选区 | 同一个 `AssistantMessage` | ✓（预览压成一行，按显示宽度截断） | claude | ✓ |
| 输入框里的草稿、band 自己的文字 | 无 `requestId` | 不提供 | — | — |

在矩阵测试中发现并已修复的 mod bug：

- 回复里单独出现的 ```` ``` ```` 会让 `codeRanges` 一直延伸到后面别的反引号，中间的 `:annotation` 指令全被当成"代码里的示例"留着不动。现在改为 CommonMark 规则：开头和结尾是等长的反引号串，不能跨段落。投影匹配也改用同一个 `spanClose`。
- 长回复在流式输出结束后不重绘，Citation 停留在原始指令的样子。现在在 `turn.complete` 时调用 `$.ui.invalidate('ui.render')`。
- `~~删除线~~` 在终端里带着波浪号显示，投影却把 `~` 去掉了。现在保留 `~`。
- 判断单词内部的 `_` 时用了 `\w`，而 `\w` 包含 `_`，导致 `__bold__` 的结尾被误判。现在改为判断 `\p{L}\p{N}`。
- 同一段 Excerpt 中间隔着别的选区时能被重复收录。现在会对照整个待发送列表去重（同一行、同样的文字）。
- 草稿、band 自己的文字、`📎` 行能被收录；band 预览里会出现 `📎`。现在都已过滤，预览显示的就是最终保存的 Excerpt。
- 编号超过 20 时显示为 `(21)`。现在用 ㉑–㊿ 编到 50。
- 预览按字符数截断，中文会超宽折行。现在按显示宽度截断（`hooks/text.ts`）。
- 窄终端里评论框前的编号被挤掉。现在编号单独放在不收缩的 Box 里，宽度不足时换用短 placeholder。

其他场景：

- turn 进行中收录、排队发送：模板在提交那一刻就套上了，模型引用了这条 Annotation。
- `/compact` 之后待发送列表保留，照常发送。
- 热重载时评论框保留，能继续写。
- 非 fullscreen：`/add-to-chat` 提示需要 fullscreen，不显示 band。
- ctrl+o 视图里没有 band，选区留到退出后再由 band 提供。

测试工具本身的问题（不是 mod 的 bug）：

- 中文和 emoji 要按显示宽度计算坐标。
- 拖选前不要按 Esc，也不要插入中间的移动事件。
- 鼠标操作之间要停顿 1 秒以上，否则会被识别成连击（扩展成选整行）。
- 选区终点正好在行尾时，会带上换行符，延伸到下一行，于是没有 `requestId`。

## 8. e2e 框架测出的问题（2026-10-13）

- **拖选途中 band 变高，选区会跳行**：拖选未松开时选区已经可读，轮询看到后 band 多出一行，transcript 停在底部时被顶上去，按住的鼠标落到下一行。复现方法是拖到一半停顿 900ms（`01-band` 的停顿场景）。等选区稳定（600ms）只能减少发生，所以改为 fullscreen 下常驻一行头行，高度不随选区变化（用户选择的方案）。
- **没有 `requestId` 的选区，Add 按钮会闪烁**：offer 的预览本身被当成"band 的文字"过滤掉，下一次轮询又出现。现在判断"band 的文字"时排除 offer 自身。
- **终端宽度的计算**：`⏺ ✚` 等符号占 1 列，只有默认以 emoji 形式显示的字符（🚀 📎）占 2 列，应该用 `\p{Emoji_Presentation}`，而不是 `\p{Extended_Pictographic}`。
- **窄屏头行**：预览被挤到只剩一个字。现在按宽度逐级缩短右侧的文字。
- Claude Code 的行为（测试框架已经适配，这些不是 mod 的问题）：
  - 位于 transcript 视口最边缘一行的选区没有 `requestId`；
  - 拖选终点落在行末字符上时，会带上换行；
  - 在 turn 进行中排队的 prompt 会并入这一轮，存成 `queued_command` 附件；
  - 恢复会话时，transcript 的行比 `session.start` 先画出来；
  - 多行输入要用括号粘贴，换行用 CR。

## 对规格的影响

1. **第 8 节 `[Send]`**：二选一
   - (a) `[Send]` 调用 `$.prompt.fill({ text: '(see annotations)' })`，用户再按一次 Enter，走正常的 composer 路径（模板、紧凑行、清空列表都照常）。代价是要按两下。
   - (b) `[Send]` 由插件自己渲染模板，把结果全部放进 `text`（不含 `{{request}}` 的模板也只能拼进 text），调用 `$.prompt.submit({ text, asUser: true })`，然后自己清空列表。代价是 transcript 里会显示完整的模板展开，并带 "Prompt from the add-to-chat plugin" 标题，没有紧凑行。
2. **第 2 节**：加一个"忽略当前选区"的按钮（例如 `[×]`），写入"最近一次已收录或已忽略"。这个 key 要跨提交保留。
3. **第 5 节**：匹配采用上面的投影算法；收录时去掉 Excerpt 里的标记字符。
4. **第 4 节**：忽略 `requestId === "placeholder"`。
5. **第 7 节**：原文映射表的 key 用改写后的全文；是否写进 `$.store` 以支持 `--resume`，需要定一下。
6. 表格里"`$.clock.every` 返回一个取消函数"改为返回 `Timer`。
