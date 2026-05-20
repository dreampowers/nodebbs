# 投票草稿管理与编辑（v1.1）设计文档

- 日期：2026-05-21
- 范围：在已上线的投票 v1（commits 1d4cc7c → 065dcbc）之上，增加"草稿投票"管理（列出/插入/编辑/删除）与编辑话题模式下的已绑投票视图
- 关联背景：用户反馈孤儿清理过激（30 分钟过短），且希望复用之前创建的投票
- 关联 spec：`docs/superpowers/specs/2026-05-20-topic-polls-design.md`（v1 基础设计）
- 关联 plan：`docs/superpowers/plans/2026-05-20-topic-polls.md`（v1 实现）

---

## 0. 术语补充

- **草稿（draft）**：当前用户拥有、尚未绑定任何 topic 的 poll。即 `polls.topicId IS NULL AND polls.userId = currentUser.id`
- **已绑（bound）**：`polls.topicId IS NOT NULL`
- **过期草稿（expired draft）**：草稿且 `createdAt < now - 7 days`，由 cleanup 任务清理

## 1. 范围

### 1.1 In Scope（v1.1 必做）

- API：列出当前用户的草稿
- API：列出某话题已绑的所有 polls
- API：编辑草稿（仅 owner，仅未绑）
- 前端 PollDialog 重构为 Tab 式（新建/草稿，编辑话题时增加"本话题已有"）
- 草稿 Tab 支持「插入」「编辑」「删除」三种操作
- 编辑模式复用"新建"表单（提交走 PUT 而非 POST）
- 已绑 Tab 仅支持「重新插入」（不可编辑、不可删除、不可解绑）
- **DELETE /api/polls/:id 当 poll 已绑话题且调用者非 admin → 400 拒绝**（API 层与 UI 层一致禁止 owner 删除已绑投票，避免话题里出现悬空 `::poll{id=X}` 引用）
- cleanup 任务窗口：30 分钟 → 7 天，任务名 `orphan-polls` → `expired-draft-polls`

### 1.2 Out of Scope（v1.1 不做）

- 编辑已绑话题的投票（即使 0 票）— 违反 v1 spec D8，且引入 TOCTOU 竞争。"打错字"场景走"删除+重建"
- 解除绑定（unbind / 把已绑 poll 退回草稿）— 边角案例，留 v3
- 全局 `/polls/drafts` 用户主页面（独立路由）— 仅 PollDialog 内提供入口
- 多选/批量操作（批量删除/批量插入草稿）— YAGNI
- 草稿搜索/过滤/排序选项 — 列表按 createdAt DESC 即可
- 草稿同步至多设备的实时协作 — 用户单点访问足够

## 2. 决策记录

| # | 决策 | 已选 | 理由 |
|---|---|---|---|
| E1 | 编辑边界 | **只能改草稿** | 与 v1 D8 一致，避免 TOCTOU 竞争与缓存失效 |
| E2 | 草稿保留期 | **7 天后自动清理** | 用户可视化管理后，不再需要激进 30 分钟回收；7 天足够回头 |
| E3 | 弹框布局 | **Tab 式切换** | 不引入 modal-in-modal 嵌套；状态隔离清晰 |
| E4 | 草稿编辑 UX | **复用"新建"表单** | 减少 UI 表面积；表单结构本来就一致 |
| E5 | "本话题已有"Tab 操作 | **仅"重新插入"** | 阻止误删后的恢复；不引入 unbind 副作用 |
| E6 | 是否新加 schema | **不加** | 仅查询条件区分（topicId IS NULL = 草稿），无需额外字段 |

## 3. 数据模型

**无 schema 变更。** 复用现有 polls / poll_options / poll_votes 三张表。

新增的查询模式：

```sql
-- 草稿列表
SELECT id, question, selection_type, is_anonymous, max_choices,
       closed_at, total_voters, created_at,
       (SELECT COUNT(*) FROM poll_options WHERE poll_id = polls.id) AS options_count
FROM polls
WHERE user_id = $1 AND topic_id IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- 某话题已绑列表
SELECT id FROM polls WHERE topic_id = $1 ORDER BY created_at ASC;
-- 然后逐个 getPoll(id, null) 拼装详情
```

## 4. API 设计

新增 3 个端点到 `apps/api/src/routes/polls/index.js`：

| 方法 | 路径 | 鉴权 | 行为 |
|---|---|---|---|
| `GET` | `/polls/drafts` | 已登录 | 列出当前用户的草稿。Query `?page=1&limit=20`。返回 `{drafts: [...], total: N}`，每项含 `id/question/selectionType/isAnonymous/maxChoices/closedAt/optionsCount/createdAt` |
| `GET` | `/polls/by-topic/:topicId` | 已登录，且为话题作者或拥有 `dashboard.topics` | 列出某话题已绑的所有 polls。返回 `{polls: [...]}`，每项是完整 getPoll 结构（不含 myVotedOptionIds） |
| `PUT` | `/polls/:id` | 已登录 | 编辑草稿。Body 与 POST /polls 完全一致：`{question, options, selectionType, maxChoices?, isAnonymous?, closedAt?}`。后端校验：poll 存在、`poll.topicId IS NULL`（必须是草稿）、`poll.userId === request.user.id`（必须是 owner）。事务内：DELETE 旧 options → INSERT 新 options → UPDATE polls 元数据 |

**已有的 `DELETE /polls/:id` 接口行为调整：** owner 删除时新增校验 `poll.topicId IS NULL`，否则 400 `"已发布的投票不允许删除，请先从话题正文中移除引用"`。admin（拥有 `dashboard.polls`）保持现有 override 能力，可删任意 poll（包括已绑的，用于内容审核场景）。

错误响应：

- `403` 非 owner 编辑或删除草稿
- `400` 已绑话题的 poll 拒绝编辑：`"已发布的投票不允许修改"`
- `404` poll 不存在
- `400` 同 POST 的字段校验失败
- 编辑接口 `403` 鉴权失败维持现有 `{error: ...}` 格式（路由层 try/catch 内调 service，service 抛 statusCode）

## 5. Service 层

`apps/api/src/services/pollService.js` 新增 3 个方法 + 1 个改名：

```js
/**
 * 列出当前用户的草稿
 * @param {number} userId
 * @param {{page?: number, limit?: number}} pagination
 * @returns {Promise<{drafts: Array, total: number}>}
 */
listDrafts(userId, { page = 1, limit = 20 })

/**
 * 列出某话题已绑的所有 polls（不含 myVotedOptionIds）
 * @param {number} topicId
 * @returns {Promise<{polls: Array}>}
 */
listByTopic(topicId)

/**
 * 编辑草稿（仅 topicId IS NULL + owner）
 * @param {number} pollId
 * @param {object} data - 与 createPoll 一致的字段集合
 * @param {number} userId - 必须是 poll.userId
 * @returns {Promise<{success: true}>}
 * @throws {Error & {statusCode}} 400 / 403 / 404
 */
updateDraft(pollId, data, userId)

/**
 * 清理过期草稿（已存在的方法改名 + 阈值变 7 天）
 * cleanupOrphanPolls → cleanupExpiredDraftPolls
 */
cleanupExpiredDraftPolls()
  // WHERE topic_id IS NULL AND created_at < NOW() - INTERVAL '7 days'
```

**事务设计 — updateDraft：**

```js
return db.transaction(async (tx) => {
  // 1. 锁 + 校验
  const [poll] = await tx.select().from(polls)
    .where(eq(polls.id, pollId))
    .for('update');  // SELECT FOR UPDATE 防 cleanup 中途删
  if (!poll) throw httpError(404, '投票不存在');
  if (poll.topicId !== null) throw httpError(400, '已发布的投票不允许修改');
  if (poll.userId !== userId) throw httpError(403, '没有权限修改此投票');

  // 2. 替换 options
  await tx.delete(pollOptions).where(eq(pollOptions.pollId, pollId));
  await tx.insert(pollOptions).values(
    data.options.map((text, idx) => ({
      pollId, text: String(text).slice(0, 500), displayOrder: idx, voteCount: 0,
    }))
  );

  // 3. 更新 poll 元数据
  await tx.update(polls).set({
    question: data.question.trim(),
    selectionType: data.selectionType,
    maxChoices: data.selectionType === 'multiple' ? data.maxChoices ?? null : null,
    isAnonymous: !!data.isAnonymous,
    closedAt: data.closedAt ?? null,
    // totalVoters 不动（草稿一直是 0）
  }).where(eq(polls.id, pollId));

  return { success: true };
});
```

> 校验逻辑（question 非空、options 长度、selectionType、maxChoices 范围）从 createPoll 提取为内部 `validatePollData(data)` 复用，避免重复。

## 6. 前端 PollDialog 重构

文件：`apps/web/src/components/topic/PollDialog.jsx`

### 6.1 新增 Props

```jsx
function PollDialog({
  open, onOpenChange, onCreated,
  topicId,  // 新增：仅编辑现有话题时传入
})
```

调用方传递路径：
- `TopicForm` → `MarkdownEditor.topicId` → 透传到 `PollTool` 的 `config.topicId` → `PollDialog.topicId`
- 新建话题时 `topicId === undefined`，编辑模式下从 `initialData.id` 或 URL 取

### 6.2 Tab 结构

```jsx
<Tabs defaultValue="new">
  <TabsList>
    <TabsTrigger value="new">新建</TabsTrigger>
    <TabsTrigger value="drafts">草稿</TabsTrigger>
    {topicId && <TabsTrigger value="bound">本话题已有</TabsTrigger>}
  </TabsList>

  <TabsContent value="new">
    <PollFormTab
      editingDraftId={editingDraftId}     // 状态：null = 新建，N = 编辑草稿 #N
      initialData={editingInitialData}    // 编辑时从草稿加载
      onSubmitSuccess={(pollId) => {
        if (editingDraftId) {
          // 编辑：清状态，留在本 Tab，提示成功
          setEditingDraftId(null); resetForm(); toast.success('草稿已保存');
          mutateDrafts();
        } else {
          // 新建：插入到编辑器并关闭弹框
          onCreated?.(pollId);
          handleOpenChange(false);
        }
      }}
    />
  </TabsContent>

  <TabsContent value="drafts">
    <DraftsTab
      onInsert={(id) => { onCreated?.(id); handleOpenChange(false); }}
      onEdit={(draft) => {
        setEditingDraftId(draft.id);
        setEditingInitialData(draft);
        setActiveTab('new');
      }}
    />
  </TabsContent>

  {topicId && (
    <TabsContent value="bound">
      <BoundTab
        topicId={topicId}
        onInsert={(id) => { onCreated?.(id); handleOpenChange(false); }}
      />
    </TabsContent>
  )}
</Tabs>
```

### 6.3 PollFormTab（统一新建/编辑）

- editingDraftId === null：标题"插入投票"，按钮"创建投票"，提交 → POST /polls
- editingDraftId !== null：标题"编辑草稿 #N"，按钮"保存修改"，提交 → PUT /polls/:id
- 表单字段、校验逻辑完全复用（DRY）
- 编辑模式下需要先加载 poll 详情（question/options/...）并预填 — 由 DraftsTab 点"编辑"时传入 initialData

### 6.4 DraftsTab

- 挂载时 `GET /api/polls/drafts?page=1&limit=20`
- 列表项：
  ```
  +------------------------------------------+
  | [问题截断 60 字符]                       |
  | 单选 · 匿名 · 4 选项 · 3 天前            |
  | [插入] [编辑] [删除]                     |
  +------------------------------------------+
  ```
- 「插入」→ `onCreated(id)` + 关弹框
- 「编辑」→ 切到「新建」Tab + 预填 + 设 editingDraftId
- 「删除」→ `AlertDialog` 确认 → `DELETE /api/polls/:id` → `mutate()`
- 空状态："还没有草稿。去『新建』Tab 创建第一个吧。"
- 分页器（使用项目现有 Pager 组件）

### 6.5 BoundTab（仅 topicId 存在时）

- 挂载时 `GET /api/polls/by-topic/:topicId`
- 列表项：
  ```
  +------------------------------------------+
  | [问题截断]                               |
  | 单选 · 匿名 · 4 选项 · 12 人投票          |
  | [重新插入正文]                            |
  +------------------------------------------+
  ```
- 「重新插入」→ `onCreated(id)` + 关弹框
- 不提供编辑/删除按钮（设计上完全没有这些控件，不是 disabled）

### 6.6 文件拆分

如果 PollDialog.jsx 超过 350 行，按 Tab 拆：

- `apps/web/src/components/topic/PollDialog.jsx` — 容器 + Tab 框架（~100 行）
- `apps/web/src/components/topic/PollDialog/PollFormTab.jsx` — 新建/编辑表单（~200 行，从现有 PollDialog 移出表单部分）
- `apps/web/src/components/topic/PollDialog/DraftsTab.jsx` — 草稿列表（~120 行）
- `apps/web/src/components/topic/PollDialog/BoundTab.jsx` — 已绑列表（~80 行）

实施时按需决定是否拆分。优先单文件，超过阈值再拆。

## 7. 调用方变动

### 7.1 `TopicForm.jsx`

`isEditMode` 时把 `initialData.id`（话题 id）传给 MarkdownEditor：

```jsx
<MarkdownEditor
  // ... 现有 props
  topicId={isEditMode ? initialData?.id : undefined}
  toolbar={TOPIC_TOOLBAR}
  // ...
/>
```

### 7.2 `MarkdownEditor/index.jsx`

接收并透传 `topicId` 到 ToolRegistry 的每个工具的 `config` prop：

```js
config={{
  onUpload, uploadType, textareaRef, onChange,
  topicId,  // 新增
}}
```

### 7.3 `MarkdownEditor/tools/poll/index.jsx`

读 `config.topicId` 并透传 PollDialog：

```jsx
export function PollTool({ editor, disabled, config }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button .../>
      <PollDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => editor.insertBlock(`::poll{id="${id}"}\n`)}
        topicId={config?.topicId}
      />
    </>
  );
}
```

## 8. cleanup 任务调整

文件：`apps/api/src/plugins/cleanup.js`

```js
// 改 import
import { cleanupExpiredDraftPolls } from '../services/pollService.js';

// 改任务注册（名字 + 函数）
registerCleanupTask('expired-draft-polls', async () => {
  return await cleanupExpiredDraftPolls();
});
```

`pollService.js` 内：

```js
// 改名 + 阈值
export async function cleanupExpiredDraftPolls() {
  const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);  // 7 天
  const result = await db
    .delete(polls)
    .where(and(isNull(polls.topicId), lt(polls.createdAt, threshold)));
  return result.rowCount ?? 0;
}
```

## 9. 边界与策略

| 场景 | 处理 |
|---|---|
| 用户编辑草稿时另一会话 cleanup 删了它 | PUT 返回 404，前端 toast "草稿已不存在"，自动 mutate draft list |
| 用户编辑草稿时另一会话已绑该 poll 到 topic | service 内的 `SELECT FOR UPDATE` + topicId 校验拒绝 → 400 "已发布的投票不允许修改" |
| 用户在 DraftsTab 同时点两次编辑按钮 | UI 用 disabled 防双击；服务端最终一致（按写入顺序） |
| 草稿列表分页中草稿被删 | 分页结果可能有 gap，下次 mutate 修正 |
| topicId 透传链路断裂（某层忘了传） | undefined → bound Tab 不显示，无致命影响 |
| 编辑草稿提交时校验失败 | 与 createPoll 一致，前端 toast 显示后端 error 文本 |
| 同一草稿被插入到同一话题正文两次 | bindPollsToTopic 已对 id 去重；冗余直到 textarea 文本本身就重复 — bindPollsToTopic 的 stripPollDirectives 不会去掉合法的重复行，留作 v3 处理（实际渲染时 PollWidget 会渲染两次，是个轻微问题但非阻断） |

## 10. 文件改动清单

### 新增（最多 3 个，按文件拆分决策定）
- 可能：`apps/web/src/components/topic/PollDialog/PollFormTab.jsx`
- 可能：`apps/web/src/components/topic/PollDialog/DraftsTab.jsx`
- 可能：`apps/web/src/components/topic/PollDialog/BoundTab.jsx`

### 修改
- `apps/api/src/services/pollService.js` — 增 listDrafts/listByTopic/updateDraft；改 cleanupOrphanPolls → cleanupExpiredDraftPolls；提取 validatePollData 内部函数
- `apps/api/src/routes/polls/index.js` — 增 GET /drafts、GET /by-topic/:topicId、PUT /:id
- `apps/api/src/plugins/cleanup.js` — 改任务名 + import
- `apps/web/src/components/topic/PollDialog.jsx` — 重构为 Tab 容器
- `apps/web/src/components/topic/TopicForm.jsx` — 编辑模式传 topicId
- `apps/web/src/components/common/MarkdownEditor/index.jsx` — config 透传 topicId
- `apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx` — 读 config.topicId 并传 PollDialog

**无 schema 变动，无 DB 迁移。**

## 11. 手动测试要点

- [ ] 新建话题：插入草稿 A（不发帖）→ 关弹框 → 再开 → 草稿 Tab 看到 A
- [ ] 草稿 Tab 编辑 A → 改问题 → 保存 → 列表更新显示新问题
- [ ] 草稿 Tab 删除 A → 列表更新，A 消失
- [ ] 草稿 Tab 插入 A → 关弹框 → 编辑器有 `::poll{id="A"}`
- [ ] 7 天前的草稿运行 cleanup → 被清；3 天前的不被清
- [ ] 编辑话题：插入 B → 提交 → 重新打开编辑话题 → "本话题已有"Tab 显示 B
- [ ] "本话题已有"Tab 点重新插入 → 编辑器追加 `::poll{id="B"}`
- [ ] 草稿 Tab 不显示本话题已绑的 polls；"本话题已有"不显示别人的 poll；草稿 Tab 不显示别人的草稿
- [ ] 直接 PUT /polls/:id 别人的草稿 → 403
- [ ] 直接 PUT /polls/:id 已绑的 poll → 400 "已发布的投票不允许修改"
- [ ] 直接 DELETE /polls/:id 自己已绑的 poll → 400 "已发布的投票不允许删除..."
- [ ] admin DELETE 别人已绑的 poll → 成功（dashboard.polls 走特权路径）
- [ ] GET /drafts 不返回别人的草稿
- [ ] GET /by-topic/:topicId 非话题作者（且无 dashboard.topics）→ 403
- [ ] 同一草稿在草稿 Tab 编辑期间，另一会话删除 → 保存返回 404，toast 提示
- [ ] 编辑草稿时把 selectionType 从 multiple 改回 single → maxChoices 自动 null 存
- [ ] 编辑草稿时改 options 数量（5 → 2）→ 旧 options 全部删除再插入新的

## 12. 不解决的开放问题

- 用户主页"我的草稿"独立路由：v2 可考虑，本次只在 PollDialog 内列
- 跨设备/会话草稿同步：v1.1 不保证；用户必须在同一设备完成编辑
- 删除草稿时是否软删除：直接硬删，与 v1 保持一致

---

*遵循 AGENTS.md 约定：纯 JavaScript、ES Modules、Drizzle ORM、shadcn/ui、Tailwind v4、`@/` 别名、API import 必带 `.js` 后缀*
