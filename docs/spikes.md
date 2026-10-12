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

## 对规格的影响

1. **第 8 节 `[Send]`**：二选一
   - (a) `[Send]` 调用 `$.prompt.fill({ text: '(see annotations)' })`，用户再按一次 Enter，走正常的 composer 路径（模板、紧凑行、清空列表都照常）。代价是要按两下。
   - (b) `[Send]` 由插件自己渲染模板，把结果全部放进 `text`（不含 `{{request}}` 的模板也只能拼进 text），调用 `$.prompt.submit({ text, asUser: true })`，然后自己清空列表。代价是 transcript 里会显示完整的模板展开，并带 "Prompt from the add-to-chat plugin" 标题，没有紧凑行。
2. **第 2 节**：加一个"忽略当前选区"的按钮（例如 `[×]`），写入"最近一次已收录或已忽略"。这个 key 要跨提交保留。
3. **第 5 节**：匹配采用上面的投影算法；收录时去掉 Excerpt 里的标记字符。
4. **第 4 节**：忽略 `requestId === "placeholder"`。
5. **第 7 节**：原文映射表的 key 用改写后的全文；是否写进 `$.store` 以支持 `--resume`，需要定一下。
6. 表格里"`$.clock.every` 返回一个取消函数"改为返回 `Timer`。
