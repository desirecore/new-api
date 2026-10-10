# Group Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现以分组为入口的交互式模型配置链路图，支持模型链路树、共享渠道网络与辅助表格。

**Architecture:** 新增独立只读聚合接口，从现有 channels、abilities 和分组配置构建展示 DTO。前端复用已有 React Flow 画布、节点和项目业务组件，将同一份配置事实投影为两种图形；不改请求路由、映射或计费执行路径。

**Tech Stack:** Go 1.25.1、Gin、GORM、React 19、TypeScript、TanStack Query/Router、React Flow、Bun、Vitest、Testing Library。

**Spec:** [已确认设计](./2026-10-10-group-model-routing-design.md)。执行前同时读取该设计、`AGENTS.md`、`web/AGENTS.md`、`docs/fork-maintenance.md` 和项目 shadcn-ui 技能。

## Global Constraints

- 首版仅配置拓扑；访问指标、真实请求追踪、额度/账单同步不在本计划内。
- 默认模型链路树，可切换共享渠道网络，表格辅助；默认保留禁用配置。
- 不修改已有表结构、现有接口响应、路由选择、重试、模型映射和计费行为；不触发渠道缓存重建。
- 配置来源标为 `basis=config`，注明配置读取时间及运行模式；不声称是多实例运行时快照。
- 模型首屏 50 个，接口分页上限 100；同时最多 4 个详情请求；画布初始节点预算 300，超限明确提供继续加载。
- 配置边等宽、无流动动画；优先级分层、同层渠道并列；不展示未经验证的命中概率。
- 节点不得拖动、连接、删除或编辑；缩放和平移只改变视角。
- 渠道读取权限在服务端执行；返回限定字段，排除密钥、认证头、私有地址和完整渠道配置。
- 英文源字符串作为 i18n 键；普通数值使用已有格式化工具，语言参数经 `toIntlLocale` 转换。
- 后端新测试集中在一个 `controller/model_topology_test.go`，复用现有真实数据库 fixture；路由授权覆盖扩展已有测试文件。
- 查询改变数据库行为，必须在真实 SQLite、MySQL 和 PostgreSQL 上验证；缺少实例时明确阻塞，不能将 SKIP 当 PASS。
- 保留已有未提交的维护规则改动；执行时使用适合本功能的 `codex/` 分支或托管工作树，不把本功能写入上游镜像 main。

## Review Focus

1. 连续切换分组时旧详情晚返回：不得把 A 组渠道挂到 B 组模型；任务 4 覆盖。
2. 同一渠道服务两个模型且映射不同：共享节点不能产生跨模型的虚假映射路径；任务 3 覆盖。
3. 未加载分页或节点超限：不得将局部子图宣称为全组完整拓扑；任务 4、5 覆盖。
4. Delete 键和 React Flow 控件切换交互状态：任何入口都不能开启编辑或删除；任务 5 覆盖。
5. 映射损坏、配置/能力不一致或详情局部失败：保留其他链路，显示诊断，不回写修复；任务 1、2、4 覆盖。

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| `model/model_topology.go`（新增） | 限定字段读取及来源快照类型，不含凭据 |
| `service/model_topology.go`（新增） | 分组/模型聚合、分页筛选、配置诊断、映射解析及 DTO |
| `controller/model_topology.go`（新增） | 参数校验、状态码与标准响应信封 |
| `router/model-topology-router.go`（新增） | 三个只读接口注册，复用 AdminAuth 与 ChannelRead 权限 |
| `router/api-router.go`（修改） | 调用上述注册函数 |
| `controller/model_topology_test.go`（新增）、`router/channel_router_test.go`（扩展） | 集中数据/API 回归与既有授权体系接入验证 |
| `web/src/features/model-topology/{types,api}.ts`（新增） | DTO、查询参数、React Query 入口 |
| `web/src/features/model-topology/lib/{graph,layout}.ts`（新增） | 业务事实到图投影、确定性分层布局 |
| `web/src/features/model-topology/hooks/use-topology-view.ts`（新增） | 加载、展开、选择、分页及视角状态 |
| `web/src/features/model-topology/components/{topology-canvas,topology-node,topology-toolbar,topology-details,topology-table}.tsx`（新增） | 组合已有画布、业务 UI 与图交互 |
| `web/src/features/model-topology/index.tsx`（新增） | 页面组织，图形与辅助表格切换 |
| `web/src/features/models/{index,section-registry}.tsx`（修改） | 新分区入口，保留现有分区行为 |
| `web/src/routes/_authenticated/models/$section.tsx`（修改） | 带前缀的拓扑查询参数校验 |
| `web/src/components/ai-elements/{canvas,controls}.tsx`（按需兼容扩展） | 仅当现有 props 无法关闭编辑控件时增加可选能力，保留旧默认值 |
| `web/package.json`、`web/bun.lock`（修改） | 将已锁定的 `@xyflow/react` 移入正式依赖，不升级版本 |
| `web/src/i18n/locales/*.json`（修改） | 七种语言新增文案 |

前端测试置于对应 feature 的 `__tests__/`；公共 Canvas 如有改动，在其 `__tests__/` 覆盖默认行为兼容。执行时不预先创建无内容文件。

## Task 1: 只读配置事实、聚合与集中数据库测试

**Files:** 新增 model/service/controller 三个 `model_topology.go` 和 `controller/model_topology_test.go`。

**Interfaces:**
- model：`LoadModelTopologySnapshot() (*ModelTopologySnapshot, error)`；快照包含限定渠道字段、能力记录、分组倍率副本、读取时间和 runtime_mode；禁止包含完整 Channel 或 Key。
- service：`GetModelTopologyGroups() ([]TopologyGroup, error)`；`GetModelTopologyModels(query TopologyModelQuery) (*TopologyModelPage, error)`；`GetModelTopologyDetail(group, modelName string) (*TopologyDetail, error)`。
- `TopologyModelQuery` 字段：Group、Keyword、ChannelKeyword、Status 为 string；ChannelID、Page、PageSize 为 int；HasMapping、HasDiagnostics 为 `*bool`。Status 允许 all/enabled/disabled/inconsistent。
- DTO 字段遵循设计第 6 节；分页包括 items、total（筛选命中数）、group_total、page、page_size、observed_at。enabled 指至少一个启用渠道，disabled 指仅有禁用渠道，inconsistent 指配置/能力不一致；诊断与启用状态可同时存在。
- 列表诊断范围固定为分组配置缺失、异常空白、能力缺失/多余/启用状态不一致；映射 JSON 损坏与循环只在详情检查。列表 HasDiagnostics 只筛选前述范围。
- 来源并集保留仅 abilities 引用的分组；没有渠道配置的能力记录只形成诊断，不伪造渠道链路。auto 返回 special 标识及说明，无固定拓扑。
- 公共可匹配错误 `ErrTopologyNotFound` 用于无分组/模型；映射异常留给任务 2，不能作为整页 error。

- [ ] 在集中测试文件使用现有 `modelManagementDB(t, dialect, dsn)` 与 require/assert，编写 `TestModelTopologyDatabaseMatrix`：空组保留、未登记组保留、跨组隔离、未入库/隐藏模型仍出现、禁用渠道计数、能力不一致诊断、分页上限 100、字面搜索 `%`、模型名含 `/`、响应无凭据。fixture 初始化并恢复分组配置，不依赖全局默认值。
- [ ] 运行 `go test ./controller -run '^TestModelTopologyDatabaseMatrix$' -count=1 -v`，确认因接口尚未实现而失败。
- [ ] 实现限定字段查询及上述聚合函数：按模型名稳定排序，筛选先于计数/分页；分组和模型参数精确匹配，空白原值保留诊断，不偷偷改变路由语义。只读现有数据，不调用 Insert/UpdateAbilities/InitChannelCache。
- [ ] 运行相同测试；SQLite 子测试通过，其他引擎若未配置仍是待验证，任务 7 完成真实矩阵。
- [ ] `gofmt` 修改 Go 文件；提交本任务生产文件与集中测试文件，提交信息 `feat: add read-only model topology queries`。

## Task 2: 映射详情、管理 API 与权限接入

**Files:** 扩展 service/controller 和集中测试；新增 `router/model-topology-router.go`，修改 `router/api-router.go`，扩展 `router/channel_router_test.go`。

**Interfaces:**
- service：`ResolveModelTopologyMapping(modelName, rawMapping string) TopologyMapping`；返回 names、status、scope=channel_mapping、diagnostics；同一解析供详情和映射摘要使用。
- controller：`GetModelTopologyGroups(c *gin.Context)`、`GetModelTopologyModels(c *gin.Context)`、`GetModelTopologyDetail(c *gin.Context)`。
- router：`setModelTopologyRoutes(apiRouter *gin.RouterGroup)`；注册设计的 `/api/model-topology/{groups,models,detail}`，使用既有 `handlePermissionRoute` 和 `authz.ChannelRead`，不新增角色/权限种子。
- 参数缺失或非法返回 400，资源不存在 404，无权限 403；认证失败沿用现有中间件语义；正常配置查询失败不伪造成功空列表。

- [ ] 在集中测试新增 `TestModelTopologyMapping`，精确断言无映射 `[A]`、链式 `[A,B,C]`、自身映射不报循环、真实循环明确报错、非法 JSON 只影响该渠道、修饰名回退与原 helper 一致。以可控 relay helper fixture 校对行为，不复制生产函数作为预期算法。
- [ ] 在已有 router 测试加入 `TestModelTopologyRoutesRequireChannelRead`，验证允许的管理用户、显式拒绝 ChannelRead 的管理用户和普通用户；断言拒绝响应不含渠道名及映射。
- [ ] 运行 `go test ./controller -run 'TestModelTopology' -count=1` 与 `go test ./router -run 'TestModelTopology' -count=1`，观察新增失败。
- [ ] 实现映射解析与路由注册；非法映射显示局部诊断，最大展示链 64 步，超限明确标识截断。无权限数据不得先聚合再靠前端隐藏。原 helper 和授权流程不改。
- [ ] 重跑上述测试，运行 `go test ./router -run 'Test.*Channel' -count=1` 验证既有渠道授权接入未回归；gofmt 后提交 `feat: expose protected model topology API`。

## Task 3: 前端数据契约、图投影和布局

**Files:** 新增 feature 的 types.ts、api.ts、lib/graph.ts、lib/layout.ts、`__tests__/graph.test.ts`、`__tests__/layout.test.ts`；修改依赖分类。

**Interfaces:**
- API：`getTopologyGroups(signal?: AbortSignal)`、`getTopologyModels(query: TopologyModelQuery, signal?: AbortSignal)`、`getTopologyDetail(group: string, model: string, signal?: AbortSignal)`；返回类型与任务 1 DTO 一致，错误走项目服务端错误封装。
- 图：`buildTopologyGraph(input: TopologyGraphInput): TopologyGraph`；input 含 group、模型页、detailsByModel、expandedModels、mode、visibleBudget；输出 nodes、edges、omittedCounts。
- 布局：`layoutTopologyGraph(graph: TopologyGraph, mode: 'tree' | 'network', previousPositions?: ReadonlyMap<string, { x: number; y: number }>): TopologyGraph`；稳定业务键构造 ID，禁止拼接分隔符导致名称冲突，使用结构化 tuple 编码。通过前次坐标保留无关子图锚点，因子树变大而需要让位的节点属于受影响集合。
- 模型键 `(group, model)`；树渠道键 `(group, model, channel_id)`；网络渠道键 `(group, channel_id)`；映射节点带模型/渠道/步骤。网络映射归属保存在边数据，详情跟随所选关系。

- [ ] 写图投影测试：模型 A/B 共用渠道 7，分别映射 X/Y；tree 存在两个渠道图节点，network 只有一个渠道图节点但保留两条关系，选 A 不展示 Y。另测同名不同 ID、名称含分隔符、禁用边、折叠、诊断与 300 节点预算的明确 omittedCounts。
- [ ] 写布局测试：相同输入输出位置稳定、边从左至右、节点包围盒不重叠、同优先级并列、展开一个模型不移动无关子图的锚点。检查确定性坐标，不做耗时断言。

本任务的关键回归断言（fixture 的 A/B 共用渠道 7）：

```ts
expect(tree.nodes.filter((node) => node.data.channelId === 7)).toHaveLength(2)
expect(network.nodes.filter((node) => node.data.channelId === 7)).toHaveLength(1)
expect(network.edges.filter((edge) => edge.data?.channelId === 7)).toHaveLength(2)
expect(network.edges.find((edge) => edge.data?.model === 'A')?.data?.mapping.names)
  .toEqual(['A', 'X'])
expect(network.edges.find((edge) => edge.data?.model === 'B')?.data?.mapping.names)
  .toEqual(['B', 'Y'])
```

- [ ] 在 web 运行 `bun run test src/features/model-topology/__tests__/graph.test.ts src/features/model-topology/__tests__/layout.test.ts`，确认失败。
- [ ] 实现上述接口与纯函数；用现有已安装 React Flow 类型，布局使用固定层和子树高度分配。将 `@xyflow/react` 原版本范围移入 dependencies，执行 `bun install` 后核对锁定版本仍为已有版本，不带入无关升级。
- [ ] 重跑测试与 `bun run typecheck`，提交 `feat: build group model topology graphs`。

## Task 4: 查询、展开、搜索和 URL 状态

**Files:** 新增 use-topology-view.ts、`__tests__/view-state.test.tsx`；扩展 api.ts；修改模型路由 search schema。

**Interfaces:**
- `useTopologyView(input: TopologyViewInput): TopologyViewState`；input 含经路由校验的 search 与更新 search 的回调；state 提供 groups、models、details、expandedModels、selection、mode、loading/errors、loadMoreModels、expandModel、collapseModel、refresh、setSelection。
- URL 字段独立使用 `tGroup`、`tModel`、`tMode`、`tSearch`、`tChannel`、`tStatus`、`tMapping`、`tDiagnostics`，不得覆盖现有模型/厂商/部署查询参数；非法 mode 回落 tree。
- 查询键以 model-topology 为前缀并包含 group/model/filters；支持 AbortSignal，过期响应不得写入新组状态。详情并发上限 4，最多 50 模型/页；选择刷新期间保留旧数据并标识刷新状态。

- [ ] 写受控 Promise 测试：A 组详情在切换 B 后才完成，B 图不出现 A 渠道；同模型跨组不复用错误缓存。局部详情失败只显示对应模型重试入口，其余成功详情保留。
- [ ] 写搜索/分页/URL 测试：未加载模型可被服务端搜索找到，`org/model-a` 刷新可恢复；加载 50/120 时显示完整计数；第 51 个来自加载更多；展开当前加载集合最多 4 个并发且取消后不继续排队；空组不请求无效详情。
- [ ] 运行 `bun run test src/features/model-topology/__tests__/view-state.test.tsx` 观察失败。
- [ ] 实现 hook 与路由 schema；搜索输入使用项目可控防抖模式，测试用 fake timer，不加入固定 sleep。每组/模式的视角由下一任务画布保存，本 hook 保留业务选择。
- [ ] 重跑测试与 typecheck，提交 `feat: manage topology loading and navigation state`。

## Task 5: 交互画布、节点、详情抽屉和辅助表格

**Files:** 新增上述五个 components 及 `__tests__/canvas.test.tsx`、`__tests__/details.test.tsx`；按需扩展公共 Canvas/Controls 并增加其回归测试。

**Interfaces:**
- `TopologyCanvas(props: { graph: TopologyGraph; view: TopologyViewState }): ReactElement`。
- `TopologyDetails(props: { selection: TopologySelection | null; view: TopologyViewState; onClose: () => void }): ReactElement`。
- Graph 构建使用任务 3，业务操作使用任务 4；Canvas 视角通过 group/mode 键保存，不能由抽屉状态触发 fitView。

- [ ] 写交互测试：展开按钮不误开抽屉、正文打开详情、选模型高亮其路径、共享渠道显示所选关系映射、折叠后焦点回模型；关闭抽屉保持画布状态并回焦。
- [ ] 写只读/状态测试：Delete/Backspace 不移除节点、连接与节点拖动不可用，Controls 不提供可开启编辑的按钮；空/错/刷新/局部详情失败状态与加载更多都有可访问名称。
- [ ] 运行 `bun run test src/features/model-topology/__tests__/canvas.test.tsx src/features/model-topology/__tests__/details.test.tsx`，确认失败。
- [ ] 组合现有 Canvas、Node、Controls、Sheet、drawer-layout、数据表与状态组件；禁用连接/删除/节点拖动并开启画布平移，覆盖默认框选。只读 Controls 隐藏编辑开关；若公共封装需要扩展，使用可选 prop 保持原调用行为。
- [ ] 加入静态边、关系标签、缩略图、缩放/适应窗口/定位选中/全部折叠。网络渠道共用信息在节点，模型特定优先级/映射在边和详情；配置边不使用 Animated。
- [ ] 完成移动端全屏画布与纵向等价列表、长名称展开、键盘及文字状态；300 节点后显示继续加载入口，可逐批增加 300 节点，折叠后回收展示预算。
- [ ] 重跑测试，执行受影响文件 lint 与 typecheck，提交 `feat: render interactive read-only topology views`。

## Task 6: 模型管理接入与国际化

**Files:** feature/index.tsx、models/index.tsx、models/section-registry.tsx、七种 locale；新增 `__tests__/page.test.tsx`，扩展已有模型分区测试中合适文件。

**Interfaces:** 新分区 ID `topology`，地址 `/models/topology`；由 `ModelTopology` feature 入口渲染。既有 metadata/vendors/deployments 分区与原默认入口保持行为。

- [ ] 写页面测试：通过模型管理导航进入 topology，默认 tree，切换 network/table 保留业务选择；旧分区仍可访问；错误 URL 回退规则不变。测试普通用户/无渠道读取权限用户不会看到可用的敏感拓扑内容。
- [ ] 在 web 运行 `bun run test src/features/model-topology/__tests__/page.test.tsx`，确认新增失败。
- [ ] 接入分区、懒加载画布 feature，隐藏无关“新增模型/部署”操作；复用 existing selectors/toolbars，完整展示已加载/命中/全组计数及 basis 说明。
- [ ] 按项目 i18n 技能完成 en、zh、zh-TW、fr、ru、ja、vi；英文源键保持平铺。执行 `bun run i18n:sync`，核对改动只包含本功能所需键；通用数值使用既有 format + toIntlLocale。
- [ ] 验证中英文切换后控件、诊断、状态和数值随语言更新；运行 feature 测试与原 models 测试、typecheck、涉及文件 lint，提交 `feat: integrate group topology into model management`。

## Task 7: 实例验证、浏览器验收与交付

**Files:** 只修正本功能问题；将实际命令/版本/结果回填本计划末尾，不编造结果。

- [ ] 核对任务 1/2 fixture 的三引擎子测试没有 SKIP；使用专用测试数据库与已配置 `TEST_MYSQL_DSN`、`TEST_POSTGRES_DSN`，不要打印 DSN。确需本地容器时只创建可清理的测试实例，不连接生产数据。
- [ ] 运行 `go test ./controller -run 'TestModelTopology' -count=1 -v`、`go test ./router -run 'TestModelTopology|Test.*Channel' -count=1 -v`。记录 SQLite/MySQL/PostgreSQL 的真实版本及每个子测试结果；新查询无版本特性依赖时各覆盖一个支持版本即可。
- [ ] 在 web 运行 `bun run test src/features/model-topology/__tests__ src/features/models/__tests__`、`bun run typecheck`、`bun run build`；对修改文件执行项目 oxlint（从 web 运行 `bunx --no-install oxlint -c .oxlintrc.json <修改的文件路径>`），修复 error。
- [ ] 启动本地 dev server，按可用浏览器技能检查真实 React Flow：缩放、拖动画布、缩略图、命中框、抽屉焦点、窄屏切换、模式转换及长名称；用明确 fixture 检查同渠道不同映射、50 模型分页与超过 300 节点的继续加载。保存可复现证据；jsdom 无法替代实际画布验证。
- [ ] 检查最终 diff：无认证/凭据泄露、无 schema/runtime/billing 改动、无依赖升级、无署名改动、无夹带原有维护规则变更。运行 `git diff --check`。
- [ ] 执行方法若允许独立 reviewer，安排一次全分支审查；否则由执行者逐条对照验收清单复核并明确没有独立审查。不要自行扩大用户批准的代理执行范围。
- [ ] 汇总实现、命令、实际数据库版本、浏览器验收与限制。任一必需验证缺失则标明未完成，不创建或合并 PR，除非用户另行要求。

## 计划自审与当前验证状态

已对照设计核对：分组来源、auto 说明、模型/渠道事实、能力诊断、映射、两种图模式、辅助表格、只读限制、分页预算、搜索、视角、权限、i18n、移动端和上游兼容均有对应任务。业务指标与账单同步明确排除。

本轮只编写计划；上述实现步骤和验证命令均未执行。实施时先确认测试实例可用性，再按任务打勾并记录实际结果。
