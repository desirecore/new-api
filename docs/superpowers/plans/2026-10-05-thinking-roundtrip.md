# 内容块与思考状态保真转换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task; if the user chooses delegation, use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Chat 客户端与 Messages 上游之间、包含文本/思考/签名/工具块的保真历史回放，修复已有正文和签名丢失。

**Architecture:** relaykit 负责受支持内容的投影、验证、恢复和单次流式状态；宿主负责协商、路由、错误与输出；客户端保存并回传快照。保持完整内容快照、无跨请求缓存，不建设通用多厂商中间格式。

**Tech Stack:** 使用各模块 go.mod 的 Go 基线、Gin、kitutil/common JSON、testify require/assert；客户端契约覆盖 JavaScript JSON 精度。

**Spec:** `docs/superpowers/specs/2026-10-03-thinking-roundtrip-design.md`（v0.2）。执行者必须先读规格和本计划。

## Global Constraints

- 用户最终约束：假设上游结构稳定，实际新模型差异以后单独支持；不增加版本分层、能力声明、迁移框架或未来兼容机制。沿用 v0.2 已有的单一 `version: 1`、`source: anthropic_messages`、`newapi_reasoning` 和协商头，不新增协议字段。
- 首期只启用 Chat 入口 → Messages 出口，支持 assistant 的 thinking/text/redacted_thinking/tool_use；Responses、Gemini、多跳及全体 body 透传不启用。
- 单条扩展编码后最多 1 MiB；单请求所有扩展合计最多 8 MiB；单 assistant 最多 256 个内容块。宿主可以降低上限但不能意外关闭；客户端必须保存空文本及无 thinking 消息的快照。
- 根模块 JSON 使用 common，relaykit 使用 kitutil。独立验证必须使用 `GOWORK=off`；不改变现有 Meta 必选接口。
- 不改计费算法、认证策略、数据库、前端管理界面或任务插件；涉及计费验证前完整读取 `.agents/rules/billing.md`，涉及表达式时另读 `pkg/billingexpr/expr.md`。
- 使用确定性回归测试，require 做前置/致命断言、assert 做值断言；优先复用现有测试文件，不按调用层重复造 fixture。
- main 只同步官方。当前文档基线为 `1d6081732`；实施开始时记录实际代码 HEAD 与工作区状态，隔离功能工作，不能把“设计时 rc.41”误当成当前运行时或生产版本。
- 本计划不授权部署、创建外部 PR 或修改 DesireCore 仓库。客户端配套为独立交付依赖，未完成实际客户端验收时不得称端到端完成。

## Review Focus

1. 上游 JSON 先进入 typed DTO 后未知字段被吞掉：原始块必须在丢字段之前接受保真校验（任务 3/4）。
2. 宿主直接使用 Claude 转换器，绕过 registry：实际 HTTP/SSE 路径和库入口都要覆盖（任务 4/5）。
3. JavaScript 将工具参数大整数变成 Number：客户端完整保存快照，拒绝使用有损普通解析完成持久化（任务 3/6）。
4. 已输出正文后上游断流，或空文本含签名：不能过滤空块或伪造成功 finish_reason/DONE（任务 4/5）。
5. 重试、覆盖规则或客户端编辑导致历史改变：每次尝试重建选项并验证一致性，拒绝冲突且日志不泄露内容（任务 5）。

## 文件与接口安排

优先修改已有文件；不为了每个步骤拆出新的生产模块。

| 文件 | 工作 |
| --- | --- |
| relaykit/dto/claude.go | signature 的缺省/空值；原始内容块校验所需信息；保留工具参数精度 |
| relaykit/dto/openai_request.go、openai_response.go | Message 和 stream delta 的可选扩展，token meta 不重复读取快照 |
| relaykit/dto/reasoning_replay.go（新增） | 固定 envelope DTO，完整内容使用 RawMessage，避免 any/float64 解码 |
| relaykit/relayconvert/replay/replay.go（新增） | 可被宿主及转换器共同调用的投影、验证、恢复；不依赖根模块 |
| relaykit/relayconvert/convmeta/options.go | 新增可选请求级 ReasoningReplay 配置；零值关闭 |
| relaykit/relayconvert/internal/claude_messages/to_oai_chat_req.go、to_oai_chat_resp.go | 正文映射、快照收集与真实流式状态 |
| relaykit/relayconvert/internal/oai_chat/to_claude_messages_req.go | 校验恢复，绕过会破坏块顺序的拼接逻辑 |
| relaykit/relayconvert/response_registry.go、response_compat.go | 将选项及错误传到真实实现，保留现有无选项 API |
| service/request_converter.go、response_converter.go | 复用验证与错误映射，覆盖 registry 包装路径 |
| controller/relay.go、relay/common/relay_info.go、relay/request_billing.go | 协商状态、每次尝试的路由验证、预扣前预检调用位置 |
| relay/channel/claude/relay-claude.go、adaptor.go | 实际 Claude HTTP/SSE 入口，原始块校验和终态输出 |
| middleware/cors.go | 暴露确认头；现有 AllowHeaders 已为 *，不扩大其他策略 |

新增类型与接口（函数体在实施时编写）：

```go
// dto/reasoning_replay.go
type ReasoningReplay struct {
    Version int             `json:"version"`
    Source  string          `json:"source"`
    Content json.RawMessage `json:"content"`
}
// Message / ChatCompletionsStreamResponseChoiceDelta:
// NewAPIReasoning *ReasoningReplay `json:"newapi_reasoning,omitempty"`

// convmeta/options.go；Options 增加 ReasoningReplay *ReasoningReplayOptions
type ReasoningReplayOptions struct {
    MaxMessageBytes int
    MaxRequestBytes int
    MaxBlocks       int
}
// nil 关闭；非 nil 时 0 使用规格默认值；拒绝负数或高于默认值的配置。

// relayconvert/replay/replay.go
func Project(content json.RawMessage, limits convmeta.ReasoningReplayOptions) (dto.Message, error)
func Restore(message dto.Message, limits convmeta.ReasoningReplayOptions) (json.RawMessage, error)
func ValidateRequest(request *dto.GeneralOpenAIRequest, limits convmeta.ReasoningReplayOptions) error
type Error struct { Code string; Path string }
func (e *Error) Error() string
```

Project 验证白名单后产生 assistant Chat 字段与完整扩展；Restore 返回原始内容 JSON，不经过会损失精度的 map[string]any。Error 只包含规格错误类别和字段路径，不包含原始值。转换层使用普通 error，宿主通过 errors.As 映射状态；不将回放错误塞进只作用于请求阶段的 ToolLossPolicy。

## Task 1: PR A — 思考正文保留

**Files:** 修改 claude_messages 的 to_oai_chat_req.go/to_oai_chat_resp.go；测试扩展 `relaykit/relayconvert/internal/claude_messages/to_oai_chat_req_test.go` 和 `relaykit/relayconvert/response_registry_test.go`。

**Interfaces:** 沿用 `ClaudeMessagesRequestToOpenAIChat`、`ResponseClaude2OpenAI`、`ClaudeToChatStreamState.ConvertChunk`，不添加协商字段。

- [ ] 增加 `TestThinkingProjection` 表：assistant 多 thinking 按顺序无分隔拼接；显式空 thinking 得到非 nil 空串；redacted 不进入正文；text/tool_use 共存；非 assistant 不投影为 assistant reasoning。
- [ ] 增加流式断言：signature_delta 不产生换行正文，纯 thinking 和工具后文本不被丢弃。
- [ ] 运行 `cd relaykit && GOWORK=off go test ./relayconvert/... -run 'ThinkingProjection|SignatureDelta' -count=1`，确认新增断言在旧实现失败而非仅因编译错误。
- [ ] 实现最小正文修复，保留无扩展兼容路径；不补造 reasoning 空串、不恢复没有来源的签名。
- [ ] 重跑上述测试并运行 `GOWORK=off go test ./relayconvert/...`；失败必须定位后处理，不盲目更新 golden。
- [ ] 提交 `fix: preserve assistant thinking text in chat conversion`，只包含本任务文件。

## Task 2: PR B — 原生签名的缺省与空值

**Files:** 修改 `relaykit/dto/claude.go` 及编译器定位的 Signature 构造/读取调用点；复用 `relaykit/relayconvert/internal/oai_chat/to_claude_messages_resp_test.go` 和宿主 `relay/channel/claude/relay_claude_test.go`。

**Interfaces:** `ClaudeMediaMessage.Signature` 改为 `*string`；读取时不能将 nil 与空串混为一谈，不改变其他协议字段类型。

- [ ] 增加 `TestClaudeSignaturePresence`：缺省/空串/非空三个 JSON 经实际 DTO 重编码后保留存在性和值；覆盖空正文非空签名。
- [ ] 运行 `cd relaykit && GOWORK=off go test ./relayconvert/internal/oai_chat -run ClaudeSignaturePresence -count=1`，观察旧行为失败。
- [ ] 修改 DTO 与必要调用点；原生 Messages 的原始 SSE 转发保持原有数据路径，不因指针修改重新编码。
- [ ] 运行 relaykit `GOWORK=off go test ./...`、`GOWORK=off go build ./...`，根目录 `go test ./relay/channel/claude` 和 `go build ./...`。编译验证所有引用，不能以单包通过代替。
- [ ] 提交 `fix: preserve absent and empty Claude signatures`。

## Task 3: PR C 第一提交 — 固定快照契约和恢复

**Files:** 新增上述两个生产文件；修改 DTO、Options、oai_chat/to_claude_messages_req.go；新增唯一的库级综合测试 `relaykit/relayconvert/reasoning_replay_test.go`。

**Interfaces:** 实现文件表中 Project/Restore/ValidateRequest。恢复后的 ClaudeMessage.Content 直接携带已验证 RawMessage；不经过普通相邻 assistant 合并。无扩展但有 reasoning 且启用 v1 时按规格拒绝。

- [ ] 增加 `TestReasoningReplayRoundTrip`，直接使用公开 request/response 转换入口；fixture 含两段 thinking/签名、redacted、空 text、text/tool_use 交错和参数 `9007199254740993`。断言恢复序列、字符串和参数数值完全一致。
- [ ] 增加 `TestReasoningReplayRepeatedRoundTrip`：连续两次转换的保护字段相同，只有一层 envelope；包含无 thinking、单文本和空序列。
- [ ] 增加 `TestReasoningReplayRejectsInvalidInput`：正文/工具冲突、非 assistant 扩展、重复键、未知字段/块/source/version、非法 null、错误参数 JSON、256/257 块、1 MiB 与 8 MiB 边界。边界以完整编码字节数断言，不能按字符数。
- [ ] 运行 `cd relaykit && GOWORK=off go test ./relayconvert -run ReasoningReplay -count=1`，先确认失败。
- [ ] 实现固定白名单校验，嵌套工具参数按无损 JSON 值比较；键顺序和空白不影响比较，重复对象键拒绝。需要 decoder/token 能力时只在 kitutil codec 层实现，不在业务代码直接调用 encoding/json。
- [ ] 在未知字段被 typed DTO 丢弃之前捕获原始块：Claude DTO 的解码边界保留仅供校验的 raw 内容（不额外输出字段），Project 使用 raw；程序构造的 DTO 使用其实际字段编码。非流式和 content_block_start/delta 两条原始 JSON 入口都必须覆盖；不能仅在已丢字段的 DTO 上检查。
- [ ] 保留对象形式的协议，不新增载荷字符串字段。客户端契约要求无损 JSON 解析/序列化；Go 使用 RawMessage/精确数值比较，工具 arguments 保持字符串。普通 JS JSON.parse 不满足该契约，任务 6 验收必须明确证明精度。
- [ ] 重跑测试、relaykit 独立 build；提交 `feat: add validated assistant replay snapshots`。此提交不能在生产单独启用。

## Task 4: PR C 第二提交 — 非流式与流式收集

**Files:** 修改 claude_messages/to_oai_chat_resp.go、response_registry.go、response_compat.go；测试继续放 reasoning_replay_test.go、既有 terminal_stream_test.go。

**Interfaces:** 保留旧 API；新增 `ResponseClaude2OpenAIWithOptions(*dto.ClaudeResponse, *convmeta.ReasoningReplayOptions) (*dto.OpenAITextResponse, error)`、`NewClaudeToChatStreamStateWithOptions(*convmeta.ReasoningReplayOptions) *ClaudeToChatStreamState` 和 `(*ClaudeToChatStreamState).Finalize() error`。默认构造器委托 nil 选项，已存在 ConvertChunk 签名不变。

- [ ] 增加 `TestReasoningReplayStreamParity`：同一内容生成非流式输出与多组确定性的合法分片，聚合后扩展、正文、工具参数一致。覆盖初始非空值、空正文签名、多个工具块、无 thinking。
- [ ] 增加 `TestReasoningReplayStreamTerminal`：签名先收齐，message_delta 的 finish 暂存至合法 message_stop；完整扩展和 finish 同 chunk。缺 start、重复 stop、未知语义 delta、超限、EOF 中断不得成功终结；ping 不改变内容。
- [ ] 运行 `cd relaykit && GOWORK=off go test ./relayconvert -run 'ReasoningReplay|Terminal' -count=1`，确认失败。
- [ ] 按 block index 维护单请求状态和累计字节；在 block_stop 解析完整工具参数，在终态 Project 生成扩展；保留 usage-only chunk 和真实截断原因。Finalize 只能检查完成，不能凭 EOF 合成成功。
- [ ] registry 包装与公开兼容 API 使用同一实现；重跑定向及 relaykit 全部测试，独立 build。
- [ ] 提交 `feat: preserve replay snapshots across Claude response streams`。

## Task 5: PR C 第三提交 — 宿主完整接入

**Files:** 修改文件表中的宿主文件；测试优先扩展 `relay/channel/claude/relay_claude_test.go`、`relay/convert_request_error_test.go`、`controller/relay_count_tokens_test.go`，每处只保护不同的实际边界。

**Interfaces:** service/request_converter.go 新增 `ValidateReasoningReplayRequest(c *gin.Context, info *relaycommon.RelayInfo) error`，内部调用公共 ValidateRequest；RelayInfo 保存请求级启用信息，ConvOptions 每次渠道尝试生成配置。不使用包级开关；宿主实际选定出口才判断路由能力。

- [ ] 增加 `TestClaudeReasoningReplayHTTP`：httptest 上游返回固定 JSON/SSE，调用真实 HandleClaudeResponseData/HandleStreamResponseData/收尾函数，验证扩展及终态。覆盖这些直接调用路径而非只测 registry。
- [ ] 增加 `TestReasoningReplayPreflight`：未协商携带扩展、非 v1 值、错路由、多跳、透传、大小超限、历史冲突均在上游调用前拒绝；用计数断言没有上游请求，未发生预扣。显式初始化设置、请求和计费 fixture。
- [ ] 在入口完成 raw 结构预检，并在每次尝试实际路由及参数覆盖确定后再次核验；把校验放在 PrepareRequestBilling 之前的调用链，避免在成功预扣后才发现无效快照。日志只输出 code/path/大小/request ID，测试 sentinel 正文和签名不出现在错误或日志中。
- [ ] Chat 目标为 Claude 的非流式与流式分支调用带选项 API；同协议继续走原始数据。核查 FormatClaudeResponseInfo 和 HandleStreamFinalResponse 不过滤终态扩展、不在失败后写 DONE。
- [ ] 确认头只在支持的路由开始响应时返回；CORS 暴露同名头；上游请求不得携带本地协商头或 newapi_reasoning。重试锁定本次已选渠道并重建选项，不能因转换错误切到原生 Chat 上游。
- [ ] 增加 `TestReasoningReplayDoesNotDoubleCount`：相同 Chat 投影有/无快照的 GetTokenCountMeta 和估算结果一致，响应 usage 保持原来源；不改倍率、价格或结算算法。转换失败后的真实上游使用量沿现有失败/审计路径处理，不假定免费。
- [ ] 根目录运行 `go test ./controller ./service ./relay/... ./middleware`、`go build ./...`；若环境/fixture 阻塞，记录具体失败和未完成项，不称已通过。没有 DB 行为变更不引入迁移；若实施意外触及 DB，必须追加真实三库验证。
- [ ] 提交 `feat: integrate opt-in replay transport into Claude relay`。C 的三个提交合起来才构成可交付功能。

## Task 6: 全链路验收与交付

**Files:** 使用已有综合测试和宿主测试；临时联调产物写入 /private/tmp，不新增生产数据或仓库文档。DesireCore 配套不在本次代码修改授权范围。

**Interfaces:** 客户端读取确认头；按 choice 聚合，先接收完整 delta 再处理 finish；持久化普通消息和原始扩展；回传前检查 v1 历史的扩展存在性，不递归合并、不去掉空块。

- [ ] 跑固定 JSON/SSE → 实际无损 JS 解析/持久化/序列化 → Go 恢复契约。大整数 9007199254740993 必须保持，另有 key 重排、空串、Unicode、工具 arguments 测试。不能用仅 Go 往返替代客户端验收；若目标客户端无无损解析能力，报告具体依赖，不能偷偷缩小保真范围。
- [ ] 校验新客户端/旧网关缺少确认头时停用依赖回放的工具循环；普通客户端不启用头的行为保持；同协议流内容不受影响。
- [ ] 在用户已有授权及可用凭据下，固定已验证模型和渠道，对照直连、同协议与保真跨协议，连续两次无副作用工具调用后得到最终回答，分别覆盖流式/非流式及 thinking 关闭。无凭据或无客户端配套时标明“仅库/宿主契约通过，真实端到端未完成”。
- [ ] 最终仅运行一次完整检查：relaykit 中 `GOWORK=off go test ./...`、`GOWORK=off go build ./...`；根目录 `go test ./controller ./service ./relay/... ./middleware`、`go build ./...`、`git diff --check`。
- [ ] 按 A/B/C 汇总提交和实际验证结果；不开 PR、不部署。后续需要 PR 时执行项目模板/归属检查；准备部署时才按 fork 维护规则选正式 tag、记录临时补丁并验证生产升级。

## 完成定义与执行方式

库正确性、实际宿主路径正确性、客户端完整保存、真实上游接受回放四项分开报告。前两项通过不能代替后两项；测试命令在本计划中均为待执行项，本次只完成计划与源码落点检查。

建议由当前代理顺序实施，A/B 独立检查，C 按共享接口连续推进，最后做一次独立审查；相较每个任务都切换代理，能减少接口同步成本。用户也可选择每任务实现与审查的子代理方式。实施前按 writing-plans 流程评审本计划并选择执行方式。
