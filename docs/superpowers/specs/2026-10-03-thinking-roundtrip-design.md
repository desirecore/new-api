# Messages ↔ Chat 思考内容与签名保真转换设计草案

日期：2026-10-03

状态：讨论结果及上游 PR 参考研究已落盘，待设计决策收敛与评审；不是已批准的实现规范。本轮不修改运行时代码、不导入外部补丁、不部署。

## 目标与证据基线

修复 Anthropic Messages 与 OpenAI Chat Completions 转换中的思考正文、签名及不透明思考数据丢失，使支持该约定的客户端能够完成开启 thinking 的连续工具调用。优先保证本 fork 的可靠性、可维护性和可回退性；提交上游是次要目标，但提交历史应方便移植。

当前 main：`28b8bfb834e7835f5b5f778fac1b128f6c4265b2`，运行时对应官方 `v1.0.0-rc.41`（`2035a82aeb5414253a728bd937d4b8f97aa99b9b`）。对照基线为材料所述生产前驱 `f98e7b6b44d5a2f1bcd1932d5576fc6e5215bcc4` 和 rc.33 候选 `0ff70000a5b36c1741e7f312c4dc988223fa4abc`；线上实际镜像 digest 尚未确认。

三个基线的隔离转换函数复测均确认：

| 编号 | 路径 | 当前缺口 |
| --- | --- | --- |
| P1 | Messages 流式响应 → Chat | signature_delta 被替换为 reasoning_content 中的换行 |
| P2 | Messages 非流式响应 → Chat | thinking 正文保留，signature 丢失 |
| P3 | Messages 请求 → Chat | 历史 assistant thinking 正文和签名丢失 |
| P4 | Chat 请求 → Messages | 历史 reasoning_content 未恢复为 thinking 块 |

补充探针确认：生产使用的流式状态转换器仍有 P1；多个非流式 thinking 块只留下最后一段 message.reasoning_content；redacted_thinking 数据未保留；ClaudeMediaMessage 的 string + omitempty 无法区分缺省和空签名。DTO 重编码缺口不代表原始 SSE 事件透传也会丢字段。

原始材料：`/Users/liyongsheng/Projects/desirecore/.desirecore/plans/issue-3481-root-cause/deliverables/newapi-thinking-review/`。本轮复测日志：`/private/tmp/newapi-thinking-review-20261003/`（临时诊断文件，不作为长期发布验收存档）。探针 PASS 表示复现旧缺口，不表示协议正确。

## 范围与非目标

- 首期聚焦 Messages ↔ Chat，覆盖请求、响应、流式与非流式。
- 保持同协议转发、普通文本及工具调用行为兼容；不改变计费与 usage 语义。
- 不把 Responses、Gemini 的签名语义等同于 Claude；不承诺跨模型、跨厂商签名可用。
- 不重建全协议中间表示，不引入签名数据库、跨请求缓存或客户端专属逻辑。
- 不默认关闭 thinking、伪造签名或注入空签名来掩盖缺口。
- 不将通用转换缺口直接认定为已发生 MiMo 故障的根因；线上归因仍需实际路由和请求证据。

## 职责边界

1. relaykit：协议 DTO、转换和单次流式状态；保持独立 Go 模块，不引用宿主包。复用现有注册机制。
2. 网关宿主：渠道与目标协议选择、能力和兼容策略、脱敏诊断；不让转换器依赖生产配置或数据库。
3. 客户端：保存并原样回传必要扩展数据。DesireCore 如需适配，应独立提交；该适配范围尚未确认。

## 推荐方向与备选方案

推荐将可展示正文与用于恢复原协议的不透明结构分离：reasoning_content 承载正文视图，独立扩展结构保存必要的原始块信息。扩展字段名称和 wire schema 尚未定稿，不能预设一个 reasoning_opaque 字段就足以覆盖所有边界。

不透明结构需要能够表达版本、来源协议、多个 thinking/redacted_thinking 块、缺省/空/非空签名以及与工具调用的顺序关系。来源标签仅用于解释数据，不是可信认证。不得假定不同协议的不透明数据可以互换。

正文拼接只能保留文字，不能替代原始块保存。存在扩展结构时，恢复依据、正文被编辑时的冲突处理、工具调用改变后的处理，都必须由明确规则约束。

备选一：把签名编码进 reasoning_content。优点是可能经过仅保留正文的客户端；风险是文本展示、裁剪、重新分段、解析歧义和签名污染，暂不作为默认方案。

备选二：服务端缓存签名并在下一轮找回。引入状态、缓存失效、多实例一致性和上下文匹配问题，首期排除。

## 安全与失败边界

- 所有客户端回传数据均视为不可信；只恢复白名单协议字段，不能将扩展对象直接合并进上游请求。
- 实施大小、块数和累计流式数据限制；具体阈值及与现有请求限制的关系须在 schema 定稿时给出。
- 区分格式损坏、未知版本、字段缺失、正文冲突以及目标协议不支持；不能静默恢复错误历史。
- 不在普通日志记录签名和思考正文；诊断只含路径、错误类别、大小和数量等必要信息。
- 无扩展数据时不自动保证无损：目标允许纯正文才转换；需要真实签名的路径必须有显式限制和兼容策略。
- 本地结构检查不能替代厂商签名校验；网关不声称可以验证签名真实性。

## 验收要求

- P1–P4 的确定性回归用例；流式与非流式完整往返。
- 多 thinking 块、redacted_thinking、文本和多工具调用交错的顺序；保留工具 ID、参数及结果。
- 缺省、空和非空签名；签名分成多个 delta 时结果与分片方式无关。
- 未知版本、损坏、超限、正文/结构冲突及缺失扩展的失败行为。
- 无 thinking、同协议、普通客户端兼容路径和 usage 不回归。
- relaykit 的 `GOWORK=off go test ./...`、`GOWORK=off go build ./...` 及受影响宿主路径测试。
- 实际客户端保存/回传验证；同一厂商与模型连续两次无副作用工具调用后完成回答。对照直连、网关同协议和跨协议。
- 实测未完成时不得以构建或单元测试通过声称生产就绪。

## 提交、PR 与发布组织

main 保持官方同步用途；功能分支使用 codex/ 前缀。候选部署基于明确官方 tag，只纳入必要且已验证的补丁。

按完整可验证的行为划分 PR：正文保留、原始思考块往返、同协议字段保真可以作为候选边界，但不预先固定 PR 数量。签名输出与恢复不能成为可部署的半成品。修复与对应回归测试放在同一行为提交中，所有提交应可构建、可审查；不混入无关重构、批量格式化或发布配置。

外部实现若被采用，保留作者与提交来源并遵循 vendor/compat 分支约定；部署前记录 docs/patches.md。向官方发 PR 前按当时上游基线检查差异与测试，避免携带 fork 发布配置。

## 实现前需要收敛的设计决策

1. 扩展 wire schema、字段名称、版本规则以及块顺序的精确表达。
2. 客户端兼容范围、流式扩展聚合约定、DesireCore 是否需要独立适配。
3. 原始块与正文/工具调用冲突时的处理，以及数据大小/块数限制。
4. 无签名纯正文的目标能力判断与不支持路径的错误/降级约定。

这些是有意保留的草案决策项，不代表可以直接进入编码。下面的 PR 研究是方案选择依据，不替代对最终 schema 和失败策略的评审。

## 上游 PR 参考研究（2026-10-03）

### 检索和证据范围

通过 GitHub API/gh search 检索 QuantumNous/new-api 的 open、closed 和 merged PR，关键词包括 thinking signature、reasoning、思考、signature、reasoning_opaque。按相关性筛选后读取 PR 元数据与代码 diff；对 #4591、#6998、#6593 额外读取 reviews、行内评论及会话评论。搜索有结果数量限制，不宣称穷尽全部历史 PR。

下列评价基于所列 head 的静态代码审阅。没有导入、构建或实测这些 PR；PR 作者和评论者的实测声明单独标注，不作为本 fork 验收。open PR 的 merge_commit_sha 可能是 GitHub 生成的测试合并对象，不能据此认定已合并；以 merged 字段和已落地历史为准。

| PR | 查询时状态 | 本次固定的 head | 用途 |
| --- | --- | --- | --- |
| [#4591](https://github.com/QuantumNous/new-api/pull/4591) | open，未合并 | `c41bacf4a51d9dd94746ad270598612a4ace3000` | 正文/签名分离、空值语义的主要参考 |
| [#6998](https://github.com/QuantumNous/new-api/pull/6998) | open，未合并 | `f11dee4a5ba856aed1c7ebe9741ec4bd302c8037` | 正文内编码签名的备选及反例 |
| [#6593](https://github.com/QuantumNous/new-api/pull/6593) | open，未合并 | `ba31b587a39563b066a1b93ee3b81ddb75846b75` | 请求正文映射、消息合并、回归用例参考 |
| [#4497](https://github.com/QuantumNous/new-api/pull/4497) | open，未合并 | `edbd5347fcf41f6393b0839db833cf1df803cff4` | 厂商 Messages 扩展字段的边界参考 |
| [#4520](https://github.com/QuantumNous/new-api/pull/4520) | 已合并 | `821f130c2812bc9d80b4c54b7f749545d250cf5e` | 已有 reasoning 空值保留机制，避免重复实现 |
| [#7153](https://github.com/QuantumNous/new-api/pull/7153) | closed，未合并 | `ea028e9650c57cd286a5bed301f21400a1f3d0a8` | 自动补空正文方案，非保真修复 |
| [#6629](https://github.com/QuantumNous/new-api/pull/6629) | open，未合并 | `b9e1ddaff613be3c83566327d2034fa9393adb78` | 流式生命周期边界参考 |
| [#6652](https://github.com/QuantumNous/new-api/pull/6652) | open，未合并 | `6d85cadc3544a8c111aed9388bacd3867e8a62d1` | 原生 Messages 兼容的邻近工作 |
| [#6392](https://github.com/QuantumNous/new-api/pull/6392) | open，未合并 | `cabc25623638f5e4108dca8ff2231be253e01739` | Responses 签名错误后降级，首期范围外 |

### #4591：方向最接近，但不是现成的完整往返实现

实际 diff 将 ClaudeMediaMessage.Signature 改为 *string，在 Chat message/delta 增加 *string reasoning_opaque；Messages → Chat 请求从 thinking 块读取正文和签名；Chat → Messages 响应写出 thinking，并在流式思考块关闭时写出签名 delta。

可参考：将签名与正文分离；用指针保存缺省/空值差异；把签名事件放在相关块结束之前。

具体限制：

- 本次 diff 没有覆盖 Claude 响应 → Chat 的签名输出，也没有覆盖 Chat 请求 → Claude 的签名恢复，不能把 PR 摘要中的双向描述当作 P1–P4 全部覆盖。
- reasoning_opaque 是单字符串；Messages 请求遍历多个 thinking 块时直接赋值，仍可能覆盖前一块，不能表达完整块顺序和 redacted 数据。
- 部分响应代码通过非空字符串判断签名，流式关闭逻辑则会构造空签名 delta；DTO 支持 nil/空区分不等于所有转换路径保持该区别。
- 代码基于拆出 relaykit 之前的 dto/、service/ 结构，不能直接视为适配 rc.41 的补丁。

作者和一位用户在评论中报告 ClaudeCode + DeepSeek-V4 工具续轮有效。这是特定链路的外部反馈，尚不能证明普通 SDK 能回传扩展字段，也不能证明 Claude 原生签名的完整往返。

### #6998：实现紧凑，但正文编码不满足当前保真目标

实际 diff 仅修改两个转换文件：把每段 signature_delta 编码为 `{"_sig":"..."}` 追加到 reasoning_content；非流式也追加该标记；反向请求通过 LastIndex 查找最后一个标记，恢复一个 thinking 块。

静态可见的风险：多段签名会形成多个标记，解析器只提取最后一个，前面的标记落入正文；多 thinking 块仍缺少边界；正文自然包含同样标记时存在歧义；标记由字符串拼接生成而不是 JSON 编码；该请求恢复分支本身没有按厂商能力限定无签名正文恢复。当前 diff 没有附带测试，也没有修复 P3。

因此保留为备选方案对照，不建议作为默认承载格式或直接合入。

### #6593：正文处理及测试最值得借鉴，但主动放弃部分保真

实际实现覆盖多种请求协议，包括 assistant-only thinking 正文聚合、纯 thinking 消息保留、相邻消息合并时保留正文，以及工具与文本共存的处理。新增多方向及往返测试，可作为用例来源。

它明确丢弃 redacted_thinking，不保留签名；Chat → Claude 只在非最新 assistant 回合构造无签名 thinking，最新回合故意不恢复。因此不能用作最新工具续轮完整修复。其关于较早回合无签名块被接受的假设必须按实际厂商/模型核实，不能变成通用架构规则。

PR 描述称 tool_use 共存文本处理未改变，但当前 diff 已修改该条件；这说明应以固定 head 的代码为准。评论中还有 #6395 作者要求保留原始分析、实现和测试归属；如果复用相应代码/测试，需追溯原提交并保留署名。

### 已落地和邻近方案

- **#4520 已落地**：ReasoningContent/Reasoning 从 string 改为 *string，保留客户端显式空正文。其合并提交 `6f57dcd2f5a7149561fbad39820988e74a944d4a` 已在当前 main 历史中。复用该约定，不能误把“保留客户端发送的空串”与“网关补造空串”混为一谈。
- **#4497**：在厂商 Messages 消息上保存额外 reasoning_content，属于厂商方言兼容；不等同于标准 thinking 块或原始签名保真。适合帮助明确能力边界，不应把所有 Messages 上游视为同一种语义。
- **#7153**：对含 tool_calls 且缺少 reasoning_content 的 assistant 自动补空字符串。PR 已关闭未合并；它不恢复原始正文，不能满足本设计目标。
- **#6629**：处理 thinking-only 流与工具后文本的客户端兼容。diff 存在丢弃工具后文本的逻辑；其协议解释和适用范围需另验，不纳入本次保真修复。可借鉴边界输入，不直接采用降级策略。
- **#6652**：改动范围包含原生 Messages、count_tokens、错误及流式终止等多层逻辑；不是 P1–P4 的聚焦补丁。首期不整包引入。
- **#6392**：针对 Responses encrypted_content 无效后的缓存与重试降级，解决的是另一问题；首期不引入其缓存及删除历史数据的策略。

### 对本草案的修正结论

1. 优先借鉴 #4591 的正文/签名分离思路、#6593 的正文映射和测试边界、#4520 已有的空值语义，而不是选一个 PR 整体合入。
2. 尚未在本次重点审阅的 PR 中找到同时覆盖多块顺序、分段签名、redacted 数据、客户端回传和 P1–P4 的完整实现。
3. 不应因为 #4591 使用 reasoning_opaque 就直接标准化同名单字符串字段；先确定有版本、块边界、来源和顺序的结构，再决定字段命名和兼容映射。
4. 准确区分“用户原样回传的空字段”“上游合法返回的空签名”和“为了通过校验而补造空字段”。这三种情况需要不同的验收用例。
5. 实现前仍需确定客户端聚合/回传约定和无损路径的失败策略。代码评审与这些 PR 的外部成功反馈均不能替代本 fork 的实际客户端验证。
