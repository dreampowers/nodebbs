# 话题内嵌投票（v1）设计文档

- 日期：2026-05-20
- 范围：NodeBBS 论坛新增"投票"功能 v1
- 关联背景：用户反馈希望增加"投票"等核心论坛功能（抽奖暂不做）
- 现状：前端已有 `::poll{id="..."}` markdown 指令骨架与 `PollWidget` 占位组件，API、数据库、编辑器集成完全缺失

---

## 0. 词汇表

- **Poll（投票）**：一个问题 + 一组选项 + 一组用户投票记录
- **Option（选项）**：投票的一个可选项，附 `displayOrder` 与 `voteCount`
- **Vote（投票记录）**：一条 `(pollId, userId, optionId)` 记录
- **指令（directive）**：markdown 中的 `::poll{id="xxx"}` 引用
- **Orphan Poll（孤儿投票）**：建立后未与任何 topic 关联的 poll

## 1. 功能范围

### 1.1 In Scope（v1 必做）
- 话题内嵌投票，markdown 中用 `::poll{id="..."}` 引用
- 单选 / 多选切换；多选可设最大可选数
- 截止时间可选（不设 = 永久开放）
- 匿名可选（匿名时不暴露投票者）
- 一人一票（匿名亦不可重复投）
- 提交即锁定，不可改票；创建后不可改投票本身（选项/问题/设置）
- 编辑器工具栏"插入投票"按钮，弹框填写后与话题同 commit 落库
- PollWidget 渲染：投票前显示选项，投票后/截止后显示结果条
- 权限：新增 `topic.poll.create`、`topic.poll.delete`、`dashboard.polls` 三个权限点
- 未登录用户：可读、不可投

### 1.2 Out of Scope（v1 不做，留 v2+）
- 投票统计图表（仅柱状条；不做饼图/趋势）
- 投票模板（"喜欢/不喜欢"、"是/否"等预设）
- 跨话题投票引用
- 投票截止前可改票
- 增删选项
- 积分门槛 / 角色门槛投票
- 投票数据导出 / 报表
- 列表上的"含投票"标识图标
- 抽奖功能（独立项目，暂不规划）

## 2. 设计决策记录

| # | 决策 | 选项 | 已选 | 理由 |
|---|---|---|---|---|
| D1 | 投票形态 | 内嵌 / 独立类型 / 独立模块 | **内嵌** | 与现有话题模型最融合，前端骨架已朝此方向 |
| D2 | 功能档次 | 基础 / 常用 / 全功能 | **常用** | 覆盖 90% 场景，避免运营复杂度 |
| D3 | 创建权限 | 与发帖一致 / 独立权限点 / 仅管理员 | **独立权限点** | 给后台调整空间，默认与发帖等价 |
| D4 | 改票 | 不能改 / 截止前可改 / 创建者可改 | **不能改** | 简化、防刷、不引入额外接口 |
| D5 | 匿名 | 创建时选 / 全匿名 / 全实名 | **创建时选** | 兼顾隐私与互动 |
| D6 | 选择类型 | 单/多 / 仅单 / 仅多 | **单+多** | 多花一个枚举字段，UX 显著提升 |
| D7 | 创建流程 | 工具栏插入按钮+同 commit / 先建空 poll / 仅后台 | **工具栏插入+同 commit** | 原子性最好，无中间态 |
| D8 | 二次编辑 | 不能改 / 首票前可改 / 任意改 | **不能改** | 一致性优先 |
| D9 | 限制集 | （多选）截止时间可选、选项数 2-20、一人一票（匿名亦限制）、未登录不可投 | **全部启用** | 用户明确要求 |
| D10 | 选项存储 | 三表规范化 / JSONB | **三表规范化** | Drizzle 体验佳，扩展空间大 |
| D11 | 话题-投票耦合 | 强（CASCADE） / 弱（独立引用） | **强耦合** | 无孤儿数据，YAGNI |

## 3. 数据模型

文件：`apps/api/src/db/schema.js`

```js
export const polls = pgTable('polls', {
  id: serial('id').primaryKey(),
  topicId: integer('topic_id').references(() => topics.id, { onDelete: 'cascade' }), // 允许 NULL（创建到关联的过渡期）
  createdBy: integer('created_by').notNull().references(() => users.id),
  question: text('question').notNull(),
  selectionType: text('selection_type').notNull(),     // 'single' | 'multiple'
  maxChoices: integer('max_choices'),                  // 仅 selectionType='multiple' 用
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  closedAt: timestamp('closed_at'),                    // NULL = 永久开放
  totalVoters: integer('total_voters').notNull().default(0),  // 去重投票人数缓存
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const pollOptions = pgTable('poll_options', {
  id: serial('id').primaryKey(),
  pollId: integer('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  voteCount: integer('vote_count').notNull().default(0),
}, (t) => ({
  pollOrderIdx: uniqueIndex('poll_options_poll_order_idx').on(t.pollId, t.displayOrder),
}));

export const pollVotes = pgTable('poll_votes', {
  id: serial('id').primaryKey(),
  pollId: integer('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  optionId: integer('option_id').notNull().references(() => pollOptions.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqueUserOption: uniqueIndex('poll_votes_poll_user_option_idx').on(t.pollId, t.userId, t.optionId),
  byPollUser: index('poll_votes_poll_user_idx').on(t.pollId, t.userId),
}));
```

**约束设计要点：**
- `(pollId, userId, optionId)` 唯一索引：单选时只会写 1 行；多选时同一 userId 多行不同 optionId，但不会重复
- `totalVoters` / `voteCount` 是冗余缓存，提交时在事务里 `UPDATE ... SET count = count + 1`
- `topicId` 允许 NULL，但 §6.1 的孤儿清理任务保证生命周期收敛

## 4. API 设计

文件：`apps/api/src/routes/polls/index.js`

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/polls` | `topic.poll.create` | 创建投票。body 含 question/options/selectionType/maxChoices/isAnonymous/closedAt。**不需要 topicId**，立即返回 id；前端把 `::poll{id=...}` 写入话题草稿，话题提交时由 §6.1 回填 topicId。 |
| `GET` | `/polls/:id` | 公开 | 返回详情。已登录则带 `myVotedOptionIds`；匿名投票不返回投票者列表，但所有人可见统计。 |
| `POST` | `/polls/:id/vote` | 已登录 | body：`{ optionIds: [int] }`。校验 closedAt、selectionType / maxChoices / 一人一票。事务内写 votes + 更新 voteCount + totalVoters。 |
| `GET` | `/polls/:id/voters?optionId=` | 已登录 | **仅非匿名**：分页返回某选项的投票人。匿名投票 → 403。 |
| `DELETE` | `/polls/:id` | 创建者 + `topic.poll.delete` 或 `dashboard.polls` | 删除投票（CASCADE 清空 options + votes）。会从关联 topic 内容里"无声"丢弃 `::poll{id=...}` 指令的渲染（PollWidget 显示"投票已被删除"占位）。 |

**响应格式遵循现有约定**：成功 `reply.send(...)`；错误 `reply.code(...).send({ error: '...' })`。

**典型错误响应：**
- 409 已投过票（DB UNIQUE 违例兜底）
- 400 选项数量违规（单选 ≠ 1 / 多选 > maxChoices）
- 400 投票已结束（closedAt 过期）
- 403 匿名投票不允许查看投票者
- 404 投票不存在（含话题被软删情况）

## 5. 前端集成

### 5.1 编辑器"插入投票"按钮
- 修改：`apps/web/src/components/topic/TopicForm.jsx`
- 新增：`apps/web/src/components/topic/PollDialog.jsx`
- 行为：
  1. 工具栏新增"📊 插入投票"按钮，点击打开 PollDialog
  2. 表单字段：question（必填）/ options（2-20 行，动态增删）/ selectionType（单/多）/ maxChoices（多选时显示，默认 = options.length）/ isAnonymous / closedAt（可选）
  3. 提交：`POST /polls` → 拿到 `id` → 在编辑器光标处插入 `\n::poll{id="<id>"}\n` → 关闭弹框
  4. 草稿中可见 `::poll{id=...}` 文本块；预览时由 PollWidget 渲染（前端骨架已有）

### 5.2 PollWidget 实现
- 替换：`apps/web/src/components/common/MarkdownRender/components/PollWidget.jsx`
- 数据：`useSWR(`/polls/${pollId}`)`
- UI 状态机：

| 状态 | 渲染 |
|---|---|
| Loading | 骨架 skeleton（保留现有） |
| 未登录 + 未过期 | 选项 + 灰按钮"登录后投票" |
| 未登录 + 过期 | 结果条 |
| 已登录 + 未投 + 未过期 | radio（单选）或 checkbox（多选） + "提交"按钮 |
| 已登录 + 已投 / 过期 | 结果条：每选项一行水平柱（百分比 + 票数），高亮自己投的项；非匿名 → 选项右侧"查看 N 人"链接，弹小窗显示投票者 |
| 删除（404） | "该投票已被删除" 灰条占位 |

### 5.3 不做的事
- 不在话题列表显示"含投票"图标（密度优先）
- 不单独建后台菜单；常规话题/投票管理走 dashboard 既有路径 + DELETE 接口

## 6. 边界与策略

### 6.1 孤儿 Poll 与回填

**问题**：先 POST /polls 拿 id，再写入话题。若用户不提交话题，poll 就成孤儿。若用户复制别人的 `::poll{id}`，需要防御。

**方案**：
1. `polls.topicId` 允许 NULL
2. 新增工具：`apps/api/src/utils/extractPollIds.js` —— 从话题正文里解析出所有 `::poll{id=...}` 的 id 数组
3. 新增服务：`apps/api/src/services/pollService.js`，含 `bindPollsToTopic(topicId, content, userId)`：
   - 解析所有 `::poll{id}`
   - 对每个 id：检查 `polls.createdBy === userId`；不符则**从 content 里删除该指令**（防盗用）
   - 若 `polls.topicId === null` → 更新为当前 topicId
   - 若 `polls.topicId === topicId` → 跳过（编辑话题的幂等情况）
   - 若 `polls.topicId !== null && !== topicId` → 同上删除指令
   - 返回清洗后的 content
4. `apps/api/src/routes/topics/index.js` 的 POST `/topics` 与 PUT `/topics/:id` 在写库前调用上述方法，落入数据库的是清洗后的 content
5. `apps/api/src/plugins/cleanup.js` 增加任务：每 1 小时清理 `topicId IS NULL AND createdAt < now() - INTERVAL '30 minutes'` 的 poll

### 6.2 投票时的并发
- 应用层：先 SELECT 是否已投 → 不再事先检查；直接 INSERT，捕获 PG UNIQUE violation（code `23505`）→ 返回 409
- 计数器：`UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = ?` 与 vote INSERT 在同一事务

### 6.3 截止时间二次校验
- 前端按 closedAt 隐藏投票按钮，但 POST `/polls/:id/vote` **必须**服务端再校验一次

### 6.4 话题删除联动
- 话题硬删（已支持 `permanent=true`）：CASCADE 自动清掉关联 polls/options/votes
- 话题软删（`isDeleted=true`）：poll 数据保留；`GET /polls/:id` 校验关联 topic 未软删，否则 404（前端 PollWidget 显示"投票已被删除"）

## 7. 权限

修改：`apps/api/src/db/rbac-schema.js`（或对应的 permission seed 脚本）

| Slug | 默认分配 | 说明 |
|---|---|---|
| `topic.poll.create` | `user` 角色 | 允许在话题里插入投票 |
| `topic.poll.delete` | `user` 角色，conditions: `{ ownOnly: true }` | 允许删除自己创建的投票 |
| `dashboard.polls` | `admin` 角色 | 后台管理：可删任意投票 |

未登录：可读（`GET /polls/:id`），不可投、不可查看者列表。

## 8. 文件级改动清单

### 新增
- `apps/api/src/db/schema.js` — 新增 polls / pollOptions / pollVotes
- `apps/api/src/routes/polls/index.js` — 5 个路由
- `apps/api/src/services/pollService.js` — 业务逻辑（create / vote / delete / bindPollsToTopic）
- `apps/api/src/utils/extractPollIds.js` — 解析 markdown 文本里的 poll 指令
- `apps/web/src/components/topic/PollDialog.jsx` — 编辑器创建投票表单弹框

### 修改
- `apps/api/src/app.js` — 注册 /polls 路由
- `apps/api/src/db/rbac-schema.js` 或对应 seed — 三个权限点
- `apps/api/src/plugins/cleanup.js` — 加孤儿 poll 清理任务
- `apps/api/src/routes/topics/index.js` — POST/PUT 路由调用 `bindPollsToTopic`
- `apps/web/src/components/topic/TopicForm.jsx` — 工具栏"插入投票"按钮
- `apps/web/src/components/common/MarkdownRender/components/PollWidget.jsx` — 替换为真实实现

## 9. 测试要点（手动验证）

无自动化测试套件（项目约定）。开发后需手工验证：

- [ ] 创建单选投票，2 个用户分别投不同选项，看计数与百分比正确
- [ ] 创建多选投票 maxChoices=2，用户尝试选 3 个 → 提交时被拒
- [ ] 同一用户尝试重复投票 → 409
- [ ] 截止时间 30 秒后，再尝试投票 → 400
- [ ] 创建匿名投票，前端不应出现"查看投票者"链接，直接 GET /voters → 403
- [ ] 创建投票后不发帖，等 30 分钟后 cleanup 任务清理
- [ ] 复制别人的 `::poll{id=X}` 到自己新帖 → 提交后 X 指令应被去除
- [ ] 话题硬删 → polls/options/votes 全部消失
- [ ] 话题软删 → PollWidget 显示"投票已被删除"
- [ ] 删除投票后，原话题里 PollWidget 显示"投票已被删除"
- [ ] 未登录访问含投票的话题 → 看得到选项但不能投，提示登录
- [ ] 后台 admin 用户可删任意投票（验证 `dashboard.polls`）

## 10. 不解决的开放问题

- **PollDialog 表单的国际化**：项目当前以中文为主，本设计文档不引入 i18n，所有 UI 文案中文写死
- **重复投票的 UX 反馈**：409 的 toast 文案设为"您已投过票"，不阻塞二次进入页面后看到自己已投状态
- **超大投票（如 1 万人参与）的性能**：v1 不优化，`getPoll` 一次拉所有 options + voteCount，votes 仅在查看者列表分页时按 optionId 分页加载

---

*遵循 AGENTS.md 约定：纯 JavaScript、ES Modules、Drizzle ORM、shadcn/ui 组件、Tailwind v4*
