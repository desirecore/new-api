# Group Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

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

- [x] 在集中测试文件使用现有 `modelManagementDB(t, dialect, dsn)` 与 require/assert，编写 `TestModelTopologyDatabaseMatrix`：空组保留、未登记组保留、跨组隔离、未入库/隐藏模型仍出现、禁用渠道计数、能力不一致诊断、分页上限 100、字面搜索 `%`、模型名含 `/`、响应无凭据。fixture 初始化并恢复分组配置，不依赖全局默认值。
- [x] 运行 `go test ./controller -run '^TestModelTopologyDatabaseMatrix$' -count=1 -v`，确认因接口尚未实现而失败。
- [x] 实现限定字段查询及上述聚合函数：按模型名稳定排序，筛选先于计数/分页；分组和模型参数精确匹配，空白原值保留诊断，不偷偷改变路由语义。只读现有数据，不调用 Insert/UpdateAbilities/InitChannelCache。
- [x] 运行相同测试；SQLite 子测试通过，其他引擎若未配置仍是待验证，任务 7 完成真实矩阵。
- [x] `gofmt` 修改 Go 文件；提交本任务生产文件与集中测试文件，提交信息 `feat: add read-only model topology queries`。

## Task 2: 映射详情、管理 API 与权限接入

**Files:** 扩展 service/controller 和集中测试；新增 `router/model-topology-router.go`，修改 `router/api-router.go`，扩展 `router/channel_router_test.go`。

**Interfaces:**
- service：`ResolveModelTopologyMapping(modelName, rawMapping string) TopologyMapping`；返回 names、status、scope=channel_mapping、diagnostics；同一解析供详情和映射摘要使用。
- controller：`GetModelTopologyGroups(c *gin.Context)`、`GetModelTopologyModels(c *gin.Context)`、`GetModelTopologyDetail(c *gin.Context)`。
- router：`setModelTopologyRoutes(apiRouter *gin.RouterGroup)`；注册设计的 `/api/model-topology/{groups,models,detail}`，使用既有 `handlePermissionRoute` 和 `authz.ChannelRead`，不新增角色/权限种子。
- 参数缺失或非法返回 400，资源不存在 404，无权限 403；认证失败沿用现有中间件语义；正常配置查询失败不伪造成功空列表。

- [x] 在集中测试新增 `TestModelTopologyMapping`，精确断言无映射 `[A]`、链式 `[A,B,C]`、自身映射不报循环、真实循环明确报错、非法 JSON 只影响该渠道、修饰名回退与原 helper 一致。以可控 relay helper fixture 校对行为，不复制生产函数作为预期算法。
- [x] 在已有 router 测试加入 `TestModelTopologyRoutesRequireChannelRead`，验证允许的管理用户、显式拒绝 ChannelRead 的管理用户和普通用户；断言拒绝响应不含渠道名及映射。
- [x] 运行 `go test ./controller -run 'TestModelTopology' -count=1` 与 `go test ./router -run 'TestModelTopology' -count=1`，观察新增失败。
- [x] 实现映射解析与路由注册；非法映射显示局部诊断，最大展示链 64 步，超限明确标识截断。无权限数据不得先聚合再靠前端隐藏。原 helper 和授权流程不改。
- [x] 重跑上述测试，运行 `go test ./router -run 'Test.*Channel' -count=1` 验证既有渠道授权接入未回归；gofmt 后提交 `feat: expose protected model topology API`。

## Task 3: 前端数据契约、图投影和布局

**Files:** 新增 feature 的 types.ts、api.ts、lib/graph.ts、lib/layout.ts、`__tests__/graph.test.ts`、`__tests__/layout.test.ts`；修改依赖分类。

**Interfaces:**
- API：`getTopologyGroups(signal?: AbortSignal)`、`getTopologyModels(query: TopologyModelQuery, signal?: AbortSignal)`、`getTopologyDetail(group: string, model: string, signal?: AbortSignal)`；返回类型与任务 1 DTO 一致，错误走项目服务端错误封装。
- 图：`buildTopologyGraph(input: TopologyGraphInput): TopologyGraph`；input 含 group、模型页、detailsByModel、expandedModels、mode、visibleBudget；输出 nodes、edges、omittedCounts。
- 布局：`layoutTopologyGraph(graph: TopologyGraph, mode: 'tree' | 'network', previousPositions?: ReadonlyMap<string, { x: number; y: number }>): TopologyGraph`；稳定业务键构造 ID，禁止拼接分隔符导致名称冲突，使用结构化 tuple 编码。通过前次坐标保留无关子图锚点，因子树变大而需要让位的节点属于受影响集合。
- 模型键 `(group, model)`；树渠道键 `(group, model, channel_id)`；网络渠道键 `(group, channel_id)`；映射节点带模型/渠道/步骤。网络映射归属保存在边数据，详情跟随所选关系。

- [x] 写图投影测试：模型 A/B 共用渠道 7，分别映射 X/Y；tree 存在两个渠道图节点，network 只有一个渠道图节点但保留两条关系，选 A 不展示 Y。另测同名不同 ID、名称含分隔符、禁用边、折叠、诊断与 300 节点预算的明确 omittedCounts。
- [x] 写布局测试：相同输入输出位置稳定、边从左至右、节点包围盒不重叠、同优先级并列、展开一个模型不移动无关子图的锚点。检查确定性坐标，不做耗时断言。

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

- [x] 在 web 运行 `bun run test src/features/model-topology/__tests__/graph.test.ts src/features/model-topology/__tests__/layout.test.ts`，确认失败。
- [x] 实现上述接口与纯函数；用现有已安装 React Flow 类型，布局使用固定层和子树高度分配。将 `@xyflow/react` 原版本范围移入 dependencies，执行 `bun install` 后核对锁定版本仍为已有版本，不带入无关升级。
- [x] 重跑测试与 `bun run typecheck`，提交 `feat: build group model topology graphs`。

## Task 4: 查询、展开、搜索和 URL 状态

**Files:** 新增 use-topology-view.ts、`__tests__/view-state.test.tsx`；扩展 api.ts；修改模型路由 search schema。

**Interfaces:**
- `useTopologyView(input: TopologyViewInput): TopologyViewState`；input 含经路由校验的 search 与更新 search 的回调；state 提供 groups、models、details、expandedModels、selection、mode、loading/errors、loadMoreModels、expandModel、collapseModel、refresh、setSelection。
- URL 字段独立使用 `tGroup`、`tModel`、`tMode`、`tSearch`、`tChannel`、`tStatus`、`tMapping`、`tDiagnostics`，不得覆盖现有模型/厂商/部署查询参数；非法 mode 回落 tree。
- 查询键以 model-topology 为前缀并包含 group/model/filters；支持 AbortSignal，过期响应不得写入新组状态。详情并发上限 4，最多 50 模型/页；选择刷新期间保留旧数据并标识刷新状态。

- [x] 写受控 Promise 测试：A 组详情在切换 B 后才完成，B 图不出现 A 渠道；同模型跨组不复用错误缓存。局部详情失败只显示对应模型重试入口，其余成功详情保留。
- [x] 写搜索/分页/URL 测试：未加载模型可被服务端搜索找到，`org/model-a` 刷新可恢复；加载 50/120 时显示完整计数；第 51 个来自加载更多；展开当前加载集合最多 4 个并发且取消后不继续排队；空组不请求无效详情。
- [x] 运行 `bun run test src/features/model-topology/__tests__/view-state.test.tsx` 观察失败。
- [x] 实现 hook 与路由 schema；搜索输入使用项目可控防抖模式，测试用 fake timer，不加入固定 sleep。每组/模式的视角由下一任务画布保存，本 hook 保留业务选择。
- [x] 重跑测试与 typecheck，提交 `feat: manage topology loading and navigation state`。

## Task 5: 交互画布、节点、详情抽屉和辅助表格

**Files:** 新增上述五个 components 及 `__tests__/canvas.test.tsx`、`__tests__/details.test.tsx`；按需扩展公共 Canvas/Controls 并增加其回归测试。

**Interfaces:**
- `TopologyCanvas(props: { graph: TopologyGraph; view: TopologyViewState }): ReactElement`。
- `TopologyDetails(props: { selection: TopologySelection | null; view: TopologyViewState; onClose: () => void }): ReactElement`。
- Graph 构建使用任务 3，业务操作使用任务 4；Canvas 视角通过 group/mode 键保存，不能由抽屉状态触发 fitView。

- [x] 写交互测试：展开按钮不误开抽屉、正文打开详情、选模型高亮其路径、共享渠道显示所选关系映射、折叠后焦点回模型；关闭抽屉保持画布状态并回焦。
- [x] 写只读/状态测试：Delete/Backspace 不移除节点、连接与节点拖动不可用，Controls 不提供可开启编辑的按钮；空/错/刷新/局部详情失败状态与加载更多都有可访问名称。
- [x] 运行 `bun run test src/features/model-topology/__tests__/canvas.test.tsx src/features/model-topology/__tests__/details.test.tsx`，确认失败。
- [x] 组合现有 Canvas、Node、Controls、Sheet、drawer-layout、数据表与状态组件；禁用连接/删除/节点拖动并开启画布平移，覆盖默认框选。只读 Controls 隐藏编辑开关；若公共封装需要扩展，使用可选 prop 保持原调用行为。
- [x] 加入静态边、关系标签、缩略图、缩放/适应窗口/定位选中/全部折叠。网络渠道共用信息在节点，模型特定优先级/映射在边和详情；配置边不使用 Animated。
- [x] 完成移动端全屏画布与纵向等价列表、长名称展开、键盘及文字状态；300 节点后显示继续加载入口，可逐批增加 300 节点，折叠后回收展示预算。
- [x] 重跑测试，执行受影响文件 lint 与 typecheck，提交 `feat: render interactive read-only topology views`。

## Task 6: 模型管理接入与国际化

**Files:** feature/index.tsx、models/index.tsx、models/section-registry.tsx、七种 locale；新增 `__tests__/page.test.tsx`，扩展已有模型分区测试中合适文件。

**Interfaces:** 新分区 ID `topology`，地址 `/models/topology`；由 `ModelTopology` feature 入口渲染。既有 metadata/vendors/deployments 分区与原默认入口保持行为。

- [x] 写页面测试：通过模型管理导航进入 topology，默认 tree，切换 network/table 保留业务选择；旧分区仍可访问；错误 URL 回退规则不变。测试普通用户/无渠道读取权限用户不会看到可用的敏感拓扑内容。
- [x] 在 web 运行 `bun run test src/features/model-topology/__tests__/page.test.tsx`，确认新增失败。
- [x] 接入分区、懒加载画布 feature，隐藏无关“新增模型/部署”操作；复用 existing selectors/toolbars，完整展示已加载/命中/全组计数及 basis 说明。
- [x] 按项目 i18n 技能完成 en、zh、zh-TW、fr、ru、ja、vi；英文源键保持平铺。执行 `bun run i18n:sync`，核对改动只包含本功能所需键；通用数值使用既有 format + toIntlLocale。
- [x] 验证中英文切换后控件、诊断、状态和数值随语言更新；运行 feature 测试与原 models 测试、typecheck、涉及文件 lint，提交 `feat: integrate group topology into model management`。

## Task 7: 实例验证、浏览器验收与交付

**Files:** 只修正本功能问题；将实际命令/版本/结果回填本计划末尾，不编造结果。

- [x] 核对任务 1/2 fixture 的三引擎子测试没有 SKIP；使用专用测试数据库与已配置 `TEST_MYSQL_DSN`、`TEST_POSTGRES_DSN`，不要打印 DSN。确需本地容器时只创建可清理的测试实例，不连接生产数据。
- [x] 运行 `go test ./controller -run 'TestModelTopology' -count=1 -v`、`go test ./router -run 'TestModelTopology|Test.*Channel' -count=1 -v`。记录 SQLite/MySQL/PostgreSQL 的真实版本及每个子测试结果；新查询无版本特性依赖时各覆盖一个支持版本即可。
- [x] 在 web 运行 `bun run test src/features/model-topology/__tests__ src/features/models/__tests__`、`bun run typecheck`、`bun run build`；对修改文件执行项目 oxlint（从 web 运行 `bunx --no-install oxlint -c .oxlintrc.json <修改的文件路径>`），修复 error。
- [x] 启动本地 dev server，按可用浏览器技能检查真实 React Flow：缩放、拖动画布、缩略图、命中框、抽屉焦点、窄屏切换、模式转换及长名称；用明确 fixture 检查同渠道不同映射、50 模型分页与超过 300 节点的继续加载。保存可复现证据；jsdom 无法替代实际画布验证。
- [x] 检查最终 diff：无认证/凭据泄露、无 schema/runtime/billing 改动、无依赖升级、无署名改动、无夹带原有维护规则变更。运行 `git diff --check`。
- [x] 执行方法若允许独立 reviewer，安排一次全分支审查；否则由执行者逐条对照验收清单复核并明确没有独立审查。不要自行扩大用户批准的代理执行范围。
- [x] 汇总实现、命令、实际数据库版本、浏览器验收与限制。任一必需验证缺失则标明未完成，不创建或合并 PR，除非用户另行要求。

## 计划自审与当前验证状态

已对照设计核对：分组来源、auto 说明、模型/渠道事实、能力诊断、映射、两种图模式、辅助表格、只读限制、分页预算、搜索、视角、权限、i18n、移动端和上游兼容均有对应任务。业务指标与账单同步明确排除。

实施与验证已完成；独立审查结论及其修正记录见后续补充。


## 实施与验证记录（2026-10-10）

实现分支为 `codex/group-model-topology`，托管工作树为 `/Users/liyongsheng/.codex/worktrees/group-model-topology/new-api`。入口是模型管理的“分组模型链路”分区，URL 为 `/models/topology`。本次完成第一交付的配置拓扑，访问/性能指标、真实请求追踪及业务后台账单同步仍按需求文档另行实施。

实现保持 channels/abilities/分组配置为既有事实来源，新增三个受 AdminAuth + ChannelRead 保护的只读接口。字段投影排除凭据，不发起 relay 请求、不刷新路由缓存、不修改 schema、计费、鉴权机制或旧模型管理契约。回滚可移除新增接口注册、topology 分区与独立 feature；没有数据迁移或数据清理。上游同步重点是入口文件与渠道映射/路由语义变化；后端聚合及图投影集中在新增模块。

复用了 GroupSelector、StaticDataTable、Sheet/drawer-layout、LoadingState/ErrorState/EmptyState 以及 ai-elements Canvas/Node。现有组件没有配置拓扑的节点投影、分层布局或全屏画布，故这些为 feature 业务组合；全屏通过 React portal 避免祖先容器裁切。共享 Canvas 仅增加可选 controlsProps，默认交互控件保持原行为；GroupSelector 补充分组触发器可访问名称。沿用现有 React Flow 版本，仅将已使用的包归入运行时 dependencies，没有升级依赖。

实际运行命令与结果：

- 设置专用测试实例的 TEST_MYSQL_DSN、TEST_POSTGRES_DSN 后，运行 `go test ./controller ./router -run 'TestModelTopology|Test.*Channel' -count=1 -v`：两个包 PASS；拓扑数据库矩阵 SQLite **3.50.4**、MySQL **8.0.46**、PostgreSQL **17.9** 全部 PASS，无 SKIP。测试覆盖配置/能力不一致、空/孤立分组、映射链/循环/损坏/64 步边界、分页筛选、状态码、凭据排除和 ChannelRead 授权。新查询未依赖版本专有 SQL，没有 schema/migration 变更。
- `cd web && bun run test src/features/model-topology/__tests__ src/features/models/__tests__ src/components/ai-elements/__tests__ src/components/model-group-selector/__tests__`：**17 个文件，101 个测试 PASS**（Bun 1.4.3 使用临时路径运行）。
- `cd web && bun run typecheck`：PASS。
- `cd web && bun run build`：PASS（Rsbuild 2.1.6）。
- 对新增 feature、共享 Canvas/GroupSelector、models 接入与路由修改运行项目 oxlint：0 error；保留一个 prefer-query-selector 提示，焦点恢复使用 getElementById 支持包含 JSON 元组/模型特殊字符的安全 ID。
- `bun run i18n:sync`：7 个语言文件所需键齐全，0 missing；既有译文值未改动。
- `git diff --check`：PASS。主工作区未提交的维护政策改动保持原状，不夹带到功能提交。

浏览器使用专用 SQLite fixture、测试账号与本地端口 23930/23931，未向供应商发起请求。验证了 58 个模型的 50→58 分页、全组搜索带 `/` 的长模型名、335 节点的 300→335 继续展示及视角保持、同渠道 A→vendor-X/B→vendor-Y 的关联独立展示、共享渠道抽屉、树/网络/表格切换、缩放/平移与只读 Delete/Backspace、缩略图控件、390px 窄屏（scrollWidth=390）、全屏 portal（实际 bounds 为 0,0,1280,800）、empty/auto 分组及中英文显示。验收中修复了 URL 选择同步、优先级布局边界、初始视角和全屏裁切；相应回归先观察失败再修正通过。

集成选择保留给用户：当前保留独立 feature 分支和工作树，未合并、推送或创建 PR。正式集成到定制分支时需同时纳入主工作区已确认的维护政策变更。测试实例和测试服务在交付后清理。


### 独立审查与修正

一次独立 `gpt-6-astra` 全分支审查（1636789..f1c3f37）未发现 Critical 问题；三个用户可见问题已在一次修正轮处理：禁用渠道网络关系优先级改取真实渠道配置；详情字典使用无原型对象以支持 `constructor`、`toString`、`__proto__` 等合法模型名；表格同一事件中的展开和选中采用函数式状态更新。对应 5 个回归用例先失败，修正后通过，完整相关前端测试为 101/101。未进行重复代理审查。

延期的小项：分组选择器目前显示名称及 auto 说明，尚不显示模型数、启用渠道数及普通分组的异常摘要；选择分组后可查看计数与诊断。此项保留为后续体验优化，不将当前实现描述为已完成选择器摘要。

范围裁定维持设计：历史访问/账单指标留在第二交付；真实请求决策、多实例实时缓存、用户/Token 的 auto 展开不在首版；provider adaptor/plugin 的额外名称改写不从渠道映射推断。相应限制已在页面及详情提示。


## 模型列表与按需链路图交互调整

用户确认将默认全分组树改为分组模型列表。复用 StaticDataTable、TopologyDetails 抽屉及 `@/components/dialog` 业务弹窗；新增业务图弹窗仅组合原有图构建器和 Canvas，不新增通用弹窗实现。单模型图限制模型范围，分组共享网络改为次级入口。关闭图保留模型详情和列表状态，保留已有 URL 参数契约；后端 API、转发及数据结构未变更。

验证：`bun run typecheck` 通过；限定修改文件 oxlint 无错误（原有 getElementById 警告保留）；`bun run test src/features/model-topology src/features/models src/components/ai-elements/__tests__ src/lib/__tests__/format.test.ts`：16 文件、98 测试通过；`bun run build` 通过。新增文案覆盖七种语言并执行 i18n:sync。

本地验收：使用既有脱敏快照启动 localhost:23930，浏览器验证 default 分组列表、mimo-v2.5-pro 的五渠道/优先级/映射图、全屏和 Escape 返回详情；关闭图后 URL 为 tMode=table 且保留 tModel，焦点返回“查看模型链路”按钮。服务升级保留 test.db 和本地管理员账号。


## 2026-10-11 节点详情被链路弹窗遮挡修复

原因：单模型图更新了底层模型抽屉选择，却未在前台弹窗渲染节点详情。复用 TopologyDetails 的内容，增加内嵌展示方式，在图弹窗内显示节点详情；桌面并排，窄屏上下排列，详情独立滚动。关闭面板保留图并恢复节点焦点，图关闭仍回到原模型抽屉。无新增依赖、翻译键或后端变更。

先增加节点点击后详情在可访问面板内可见的失败用例，修复后 `bun run test src/features/model-topology`（7 文件、23 测试）、`bun run typecheck`、限定 feature 的 oxlint（无错误，原有 getElementById 警告保留）及 `bun run build` 均通过。浏览器验证 default / mimo-v2.5-pro / 潞晨科技节点的映射和优先级在弹窗内可见，全屏仍可查看；390×844 窄屏详情在画布下方，内容 overflow:auto 且可滚动；关闭详情保留链路图。本地 23930 服务已更新，保留既有脱敏数据库。


## 2026-10-11 rc.43 合并检查与发布阻碍

发布候选分支 `codex/release-rc43`，工作树 `/Users/liyongsheng/.codex/worktrees/release-rc43/new-api`，从官方 `v1.0.0-rc.43` 的 peeled SHA `c6741c36a9a1a729554ad94ee99f21602a214a23` 创建。通过带 `-x` 的 scoped cherry-pick 导入模型链路提交，未直接合并 moving main 或历史 compatibility 分支；模型链路代码集成至 `006ea494d`。未夹带 thinking-roundtrip 实现或主工作区未提交政策文件。

文本冲突仅出现在七种 locale；保留 rc.43 的所有已有翻译键和值，再补入本功能译文，执行 i18n:sync。最终按 translation 字典逐键比较，每个语言新增 78 键，已有值无变化、无丢失。其余功能代码无文本冲突。

### 已执行验证

- `cd web && bun run typecheck`：exit 0。
- `cd web && bun run test src/features/model-topology src/features/models src/components/ai-elements/__tests__ src/components/model-group-selector/__tests__`：18 文件、103 测试 PASS。
- `cd web && bun run build`：exit 0。
- `go test ./controller ./router ./service ./model ./plugins ./pkg/jsplugin ./relay/... ./setting/... ./pkg/billingexpr`：exit 0。此轮未配置外部数据库，不把被跳过的 DB 子测试当作三库验证。
- 在本次新建的专用 loopback MySQL/PostgreSQL 容器上，设置 TEST_MYSQL_DSN 与 URL 格式的 TEST_POSTGRES_DSN，运行 `go test -count=1 -v ./controller -run ModelTopology`：SQLite 3.50.4、MySQL 8.0.46、PostgreSQL 16.15 三个数据库子测试全部 PASS，无 SKIP。首次 PostgreSQL 参数使用 keyword DSN，被测试 fixture 的 loopback 安全检查拒绝；改用 URL DSN 后通过，未修改测试绕过检查。
- 同一专用实例运行 `go test -count=1 ./model`：exit 0，包含现有 schema 重启稳定性及各迁移回归测试。首次 keyword PostgreSQL DSN 被数据库选择逻辑误认为 MySQL，URL DSN 重跑通过。
- `cd relaykit && GOWORK=off go build ./...`：exit 0。
- `cd tokenkit && GOWORK=off go test ./...`：PASS。
- `git diff --check`：PASS。

这些检查不等于生产数据升级、计费集成及回滚演练。尚未复制当前生产数据库进行完整演练，也未宣称升级数据库可安全用于旧镜像。

### 功能变化及兼容阻碍

只读查询生产 `/api/status`，目前实际镜像版本仍为 `test-v1.0.0-rc.33-desirecore.1-20260910-0ff7000`，镜像 digest 为 `sha256:d0436db6f653e88c88d74d1dbe5b0569565751ed1899bf54f1d49caca60ce849`。因此生产升级范围为 rc.33→rc.43（215 个官方提交），不能只按开发基线 rc.41→rc.43 的 37 个提交评估。

官方新增/调整包括模型与定价管理 UI、渠道模型重定向和请求策略、Responses WebSocket、插件化 OpenAI Images、搜索计费、图像数量结算、tokenkit、Go 1.26 和 moejs 运行时；rc.43 还增加 utils.fetch、按渠道跳过上游 TLS 校验（默认仍校验）、自动视频时长及多语言错误/日志。后台 Access Token 权限化及敏感管理操作二次验证需要业务后台联调；这里只记录变更范围，尚未完成完整认证安全审计或业务后台验收。

已复现历史 PR 4810 补丁与 rc.43 的语义冲突：使用 Bun 分别导入生产镜像对应提交 `0ff70000a` 与候选中的 Alibaba factory plugin，以相同 fixture 调用 buildSubmitRequest/extractUsage（不发送供应商请求）：

- `wan2.7-r2v`、`wan2.7-videoedit`、`happyhorse-1.0-t2v/i2v/r2v/video-edit`：生产提交中的 factory plugin 声明并可转换；rc.43 未声明，转换返回 `unsupported Wan model`。
- `wan2.7-t2v/i2v`，duration=5、1080P、usagePurpose=billing_ratios：生产提交返回 seconds=5 和 resolution-1080P=1.6666666666666667；rc.43 仅返回 seconds=5。此差异影响仍使用旧式定价的配置，不能直接认定表达式定价已覆盖全部生产模型。
- 当前旧脱敏快照中的 happyhorse-1.1 名称不是 PR 4810 添加的 1.0 模型，不因其存在就推断历史补丁已无用途；真实生产插件可能有管理员覆盖，尚需核对启用插件来源、调用记录和模型定价后决定保留兼容层或退役旧行为。
- rc.43 已通过 Alibaba task plugin 提供 wan2.7 图片协议，旧 rc.33 Wan 图片 Go 路由修复不能照搬；需要对实际映射与 JSON/multipart 接口验证后判定替代。

按用户“没冲突的话……一并发布”的条件，本轮发现上述功能兼容冲突，停止正式发布。候选保留供后续移植/验证；未创建正式版本标签、未触发镜像发布、未修改测试或生产 Deployment、未推进 deploy/main。下一次发布必须先处理 PR 4810 兼容及定价差异、确认业务后台认证契约，并完成生产副本升级与回滚演练。

候选推送尚未成功：GitHub HTTPS OAuth 凭据缺少 workflow scope，上游包含 workflow 变更，远端拒绝接收；SSH 推送无响应后已终止。没有为绕过限制删除上游 workflow 或更改全局 Git 凭据。候选提交保存在本地托管工作树。


## 2026-10-11 隔离升级与业务契约验证（进行中）

候选源代码仍为 `a94098ffc`，未改动运行时代码。验证二进制由该提交构建（本机及 Linux arm64，`CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build`），未注入正式 VERSION，因此页面显示未知版本；它们不是已发布镜像，也不能替代最终生产镜像的验收。

验证目录位于仓库外的私有本地目录 `~/.codex/local-services/new-api-rc43-validation/`（目录 0700，连接信息和凭据文件 0600）。测试网关处于 Docker `--internal` 网络，没有外网默认路由；仅通过绑定 127.0.0.1 的固定目标反向代理访问。生产副本关闭 UPDATE_TASK，避免处理真实未完成任务；只有独立空库 fixture 开启任务轮询，使用内部模拟上游。生产与现有 test-newapi Deployment 均未修改，未发送供应商付费请求。

### 已观察到的结果

- `go test ./middleware ./service/... ./controller ./router ./common ./pkg/...`：PASS，包含认证/授权、二次验证、账务和插件运行时已有回归；日志保存在 `backend-security-billing.log`。此前前端 103 个测试、typecheck/build 及 relaykit 独立构建结果仍适用于未修改的候选代码。
- PostgreSQL **16.15** 与 SQLite **3.50.4**：实际运行生产发布源码 `0ff70000a`（rc.33）创建数据库与测试用户，设置额度 9876543；切换候选启动两次，再回切 rc.33。每一步登录、用户资料和额度读取均通过。另对候选两次启动后的完整 schema/index 定义比较一致。命令 `python3 schema-matrix.py`、`python3 schema-idempotency.py`，结果见对应 JSON；这是独立 fixture，不能描述成生产数据验证。
- MySQL **8.0.46**：rc.43 空库初始化、管理员登录、业务管理接口与 relay 验证通过。`python3 mysql-released-schema.py` 的 rc.33 fixture → rc.43 两次启动 → rc.33 回退读取通过，用户资料/额度保留；另对两次候选启动后的 schema/index 定义比较一致。真实生产副本迁移仍未完成。
- `python3 auth-contracts.py`：21 个断言通过，其中包含对预期拒绝的断言，不能解释为旧业务契约全部通过。普通用户创建、搜索分页、额度 override、普通分组更新、管理员消费日志、定价和 topology 读取可用；新 scoped PAT 创建、API Key 创建/搜索/读取、普通 PAT 的管理员权限拒绝、管理员创建的准确二次验证凭证及其重放拒绝均通过。
- `python3 legacy-expiry.py`：合成的 32 字符旧 PAT 在过渡期内可读；重启未延长退役时间；到达截止值后返回 401 `ACCESS_TOKEN_LEGACY_RETIRED`。测试结束恢复 fixture 原配置。意味着已有业务 PAT 也必须在首次升级后 30 天内迁移，不能仅修复新用户开户。
- 已独立复现旧业务流程的三处不兼容：管理员重置普通用户密码、自动 disable 用户需要 `X-Security-Proof`；普通用户通过旧 `GET /api/user/token` 换取 PAT 已不可用，该路径被 `/api/user/:id` 匹配后返回 403 `AUTH_INSUFFICIENT_PRIVILEGE`，不能仅以 404 描述。额度覆盖和普通分组同步不受这些验证凭证限制。
- 使用 desirecore-server 原有 `apps/cloud-api/scripts/_newapi-contract-probe.cjs`，加载其实际 `dist/newapi/schemas.js`，以 Node 对隔离 rc.43 实例执行：退出 1。创建和反查通过，在重置密码步骤返回 403，继而登录及 PAT 步骤失败。后两个失败在该整链探针中属于级联，独立端点检查见上一项。未改业务后台源代码、未降低网关安全要求。
- `python3 relay-contracts.py`、`python3 relay-followup.py` 与独立退款检查：实际 HTTP 的 OpenAI chat 模型映射、Qwen Claude `/v1/messages` 且 max_tokens=64、映射到 Wan2.7 的图片 JSON 生成、multipart 编辑、视频 JSON/multipart 提交及轮询终态均通过。内部模拟上游捕获到映射后模型名；fixture 单价 0.01 下，chat/image 实扣 5000 quota，5 秒视频实扣 25000 quota；图片上游 400 拒绝净扣费 0，失败视频终态 FAILURE、task quota=0，并单独验证用户余额退回预扣前值（预扣 25000，净扣费 0）。消费日志保留对应模型和扣费。这里只证明这些明确 fixture，不证明真实供应商网络或所有表达式定价。
- 图片模拟器最初没有实现实际异步路径，曾得到 404/缺少 task_id；按捕获到的真实请求补全模拟器后通过，没有据此修改插件。OpenAI Images 协议未传递本次 fixture 的 metadata.upstream_mode，验收最终采用其真实默认异步路径，未将它误报为同步图片通过。
- 浏览器对候选构建的 localhost:23933 实例登录，验证 default 的模型列表、fixture-image 单模型图和选中渠道后的弹窗内详情（优先级、权重、重定向可见）。使用合成账号/渠道，不在 UI 暴露生产密钥。

认证检查参考 OWASP ASVS **5.0.0**、Authentication Cheat Sheet 和 Session Management Cheat Sheet，关注服务端权限、PAT 最小 scope、敏感操作凭证绑定与单次消费；本轮没有修改认证代码，也没有声称完成全量 ASVS 合规审计。来源：https://owasp.org/www-project-application-security-verification-standard/ 、https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html 、https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html 。

### 生产副本阻碍与剩余验收

通过 biz-k3s-01 的 devtest-system/mysql-0 客户端，对线上数据库做 `mysqldump --single-transaction --quick --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF --hex-blob`。一次导出中断，另一次命令返回 0、文件约 1.10 GB，但恢复发现 logs INSERT 被截断，缺少 dump 完成标记；因此拒绝把该文件作为有效备份，不能声称已完成生产副本恢复。已改为远端压缩、管道失败检查，并要求 gzip 完整性与 dump 结束标记验证后才允许恢复。

重新导出时 1Password SSH Agent 无法签名：`communication with agent failed` / `Permission denied (publickey)`；已请求用户解锁。未获取或绕过私钥。拒绝的部分导出中，完整 channels 表有 57 个渠道，没有声明 wan2.7-r2v/videoedit、happyhorse-1.0-* 或 wan2.7-t2v/i2v；这仅确认渠道配置，无法替代插件覆盖、历史任务和定价的完整核对。

待完成：完整生产备份校验与恢复，关键表原有列的行数/指纹对比、rc.43 两次迁移 schema/index 与 legacy PAT 退役截止值稳定性、生产拓扑分组及模型读取、原有后台契约在 rc.33 对照实例的检查、旧补丁真实使用与价格配置核对，以及升级后 rc.33 回退读取。用于这些步骤的 `production-rehearsal.py` 已准备好，但未实际完成运行，不能列为 PASS。

发布验收当前不通过：业务后台开户/自动禁用及 PAT 迁移需适配；真实生产副本检查尚未完成。没有创建发布标签、推送镜像或改动 deploy/main。GitHub workflow scope 的候选推送限制也仍未解决。

拒绝的截断导出文件、0 字节重试文件及失败恢复的隔离目标库已清理；保留脱敏核对结果和独立 fixture。生产没有数据修改。


### 2026-10-11 后台安全适配路径验证补充

生产 SSH 复查仍未恢复：`BatchMode=yes` / `ConnectTimeout=10` 的检查在外部 20 秒截止前未完成签名，子进程已结束；未再次发起重导出，未把未完成连接当成有效等待进程。

在现有隔离 MySQL fixture 上运行 `python3 admin-pat-proof.py`：18 项 HTTP 断言全部通过。新管理员 PAT 具备 user:read/user:write/log:read/profile:read 时，可使用管理员自身密码通过 `/api/verify` 取得 admin.user.update 或 admin.user.manage 的精确操作凭证，再执行重置、禁用和启用。跨用户和跨 action 均返回 403 SECURITY_PROOF_CONTEXT_MISMATCH，凭证重放返回 SECURITY_PROOF_CONSUMED；正确重置后的新密码登录通过，禁用状态经读取确认为 2，重新启用成功。该 fixture 管理员未启用 MFA，因此结果不代表生产管理员的二次验证方法；启用 MFA 的真实账户必须遵守服务端返回的验证策略，不能降级或绕过。

为了验证后续整个后台契约，而不改正式业务源代码，仓库外 `secure-probe-adapter.cjs` 对原有契约探针做显式 fixture 适配：管理员密码重置/清理取得单次 proof；用户登录后以本人密码取得 access_token.generate proof，调用 POST /api/user/access_tokens，读取 data.token 交回旧探针；其余调用沿用原探针。原探针中的 GET /api/user/token 标签因此是被转换的旧调用标签，并不意味着旧端点恢复。旧 cookie 对照请求继续直达网关，没有绕过鉴权。

该适配探针用 Node 和 desirecore-server 实际 dist/newapi/schemas.js 运行，退出 0：创建、搜索、密码重置、登录、新 PAT、API Key 创建/搜索/明文读取、用户和 Token 分组读取/更新、额度 override、定价目录共 14 步全部通过。结果保存在私有 business-adapted-probe.log。未修改 desirecore-server 的 client.ts、环境变量或线上凭据；此项只证明明确的安全适配路径可行，不等于正式业务实现已适配或发布阻碍已全部消除。
