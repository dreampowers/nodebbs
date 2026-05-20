# 投票草稿管理 v1.1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v1 投票之上增加"草稿管理"——PollDialog 重构为 Tab 式（新建/草稿/编辑话题时增加"本话题已有"），支持列出、复用、编辑、删除草稿；草稿保留期 30 分钟 → 7 天；DELETE 接口收紧为不允许 owner 删已绑投票。

**Architecture:** 后端在 `pollService` 增 3 个方法（listDrafts / listByTopic / updateDraft）+ 改名 cleanup 函数 + 收紧 deletePoll；新增 3 个路由（GET /drafts、GET /by-topic/:id、PUT /:id）。前端把 PollDialog 拆为 `PollDialog/` 目录下的容器 + 3 个 Tab 子组件，topicId 从 TopicForm 经 MarkdownEditor → PollTool → PollDialog 透传下来。无 schema 变更，无 DB 迁移。

**Tech Stack:** Fastify 5（autoload）、Drizzle ORM、PostgreSQL、Next.js 16 + React 19、Tailwind v4、shadcn/ui（Tabs/AlertDialog/Pagination 都已就位）。

**Spec：** `docs/superpowers/specs/2026-05-21-poll-drafts-design.md`

**测试约定**：无自动化测试套件（AGENTS.md），每个任务以 `node` 直调 service / `curl` 探路由 / `psql` 检查 DB 为验证手段。

**开发约定**：2 空格缩进、单引号 JS / 双引号 JSX、API import 必带 `.js` 后缀。

---

## 文件结构总览

### 新增（3 个）
| 路径 | 责任 |
|---|---|
| `apps/web/src/components/topic/PollDialog/index.jsx` | Tab 容器，管理 activeTab / editingDraftId / 跨 Tab 协作状态 |
| `apps/web/src/components/topic/PollDialog/PollFormTab.jsx` | 新建/编辑统一表单（editingDraftId === null 走 POST，否则走 PUT） |
| `apps/web/src/components/topic/PollDialog/DraftsTab.jsx` | 草稿列表 + 插入/编辑/删除按钮 |
| `apps/web/src/components/topic/PollDialog/BoundTab.jsx` | 本话题已绑列表，仅"重新插入" |

### 删除（1 个）
| 路径 | 备注 |
|---|---|
| `apps/web/src/components/topic/PollDialog.jsx` | 用 `PollDialog/index.jsx` 替代；import 路径 `@/components/topic/PollDialog` 不变 |

### 修改（5 个）
| 路径 | 改动 |
|---|---|
| `apps/api/src/services/pollService.js` | 抽 validatePollData 内部函数；增 listDrafts/listByTopic/updateDraft；改 cleanupOrphanPolls → cleanupExpiredDraftPolls（7 天） |
| `apps/api/src/routes/polls/index.js` | 增 3 个路由；收紧 DELETE 行为 |
| `apps/api/src/plugins/cleanup.js` | 任务名 + import 改名 |
| `apps/web/src/components/topic/TopicForm.jsx` | 编辑模式传 `topicId` 给 MarkdownEditor |
| `apps/web/src/components/common/MarkdownEditor/index.jsx` | 接 topicId 透传到 config |
| `apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx` | 读 config.topicId 传 PollDialog |

---

## Task 1: pollService — 重构（抽 validatePollData + 改名 cleanup）

**Files:**
- Modify: `apps/api/src/services/pollService.js`

- [ ] **Step 1: 抽出 validatePollData 内部辅助函数**

在 `apps/api/src/services/pollService.js` 顶部 import 之后、第一个 `export` 之前插入：

```js
/**
 * 校验 poll 表单数据。createPoll 与 updateDraft 共用。
 * @param {object} data
 * @throws {Error & {statusCode: 400}}
 */
function validatePollData(data) {
  const { question, options, selectionType, maxChoices } = data;

  if (!question || !question.trim()) {
    throw Object.assign(new Error('问题不能为空'), { statusCode: 400 });
  }
  if (!Array.isArray(options) || options.length < 2 || options.length > 20) {
    throw Object.assign(new Error('选项数量应在 2-20 之间'), { statusCode: 400 });
  }
  if (!['single', 'multiple'].includes(selectionType)) {
    throw Object.assign(new Error('selectionType 必须为 single 或 multiple'), { statusCode: 400 });
  }
  if (selectionType === 'multiple' && maxChoices != null) {
    if (maxChoices < 1 || maxChoices > options.length) {
      throw Object.assign(new Error('maxChoices 必须在 1 到选项数之间'), { statusCode: 400 });
    }
  }
}
```

- [ ] **Step 2: 在 createPoll 中替换内联校验**

定位 `createPoll`（约第 30-65 行）。把开头的 4 个 throw 块替换为单行：

```js
export async function createPoll(data, userId) {
  validatePollData(data);
  const { question, options, selectionType, maxChoices, isAnonymous, closedAt } = data;
  // ...其余逻辑保持不变（事务、insert polls、insert pollOptions、return {id}）
}
```

确保解构语句仍在函数体内、validatePollData 调用之后；事务体不变。

- [ ] **Step 3: 改 cleanupOrphanPolls → cleanupExpiredDraftPolls**

定位 `export async function cleanupOrphanPolls()`（约文件末尾）。整个函数替换为：

```js
/**
 * 清理过期草稿：未绑定 topic 且创建超过 7 天的 poll
 * 由 plugins/cleanup.js 调度
 *
 * @returns {Promise<number>} 清理的记录数
 */
export async function cleanupExpiredDraftPolls() {
  const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(polls)
    .where(and(isNull(polls.topicId), lt(polls.createdAt, threshold)));
  return result.rowCount ?? 0;
}
```

- [ ] **Step 4: 验证 imports + 函数仍可加载**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then((m) => {
  const exports = Object.keys(m).sort().join(',');
  console.log('exports:', exports);
  if (!exports.includes('cleanupExpiredDraftPolls')) throw new Error('FAIL: missing cleanupExpiredDraftPolls');
  if (exports.includes('cleanupOrphanPolls')) throw new Error('FAIL: old name still present');
  console.log('OK');
});
"
```

Expected: `OK` 行 + `bindPollsToTopic,castVote,cleanupExpiredDraftPolls,createPoll,deletePoll,getPoll,listVoters`。

- [ ] **Step 5: 验证 createPoll 仍然工作**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then(async ({ createPoll, deletePoll }) => {
  const { default: db } = await import('./src/db/index.js');
  const { users } = await import('./src/db/schema.js');
  const [u] = await db.select({id: users.id}).from(users).limit(1);
  const { id } = await createPoll({question:'task1 smoke',options:['a','b'],selectionType:'single'}, u.id);
  console.log('created:', id);
  await deletePoll(id);
  console.log('cleanup OK');
});
"
```

Expected: 两行输出无报错。

- [ ] **Step 6: Commit**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project
git add apps/api/src/services/pollService.js
git commit -m "$(cat <<'EOF'
refactor(api): pollService 抽 validatePollData + cleanup 改名

为 updateDraft 复用校验逻辑做准备：将 createPoll 的内联
校验抽成 validatePollData 内部函数。同时把
cleanupOrphanPolls 改名 cleanupExpiredDraftPolls，阈值
30 分钟 → 7 天，对齐 v1.1 的草稿可视化语义。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: pollService — listDrafts + listByTopic

**Files:**
- Modify: `apps/api/src/services/pollService.js`

- [ ] **Step 1: 在文件末尾追加两个查询方法**

```js
/**
 * 列出当前用户的草稿（topicId IS NULL）
 *
 * @param {number} userId
 * @param {{page?: number, limit?: number}} pagination
 * @returns {Promise<{drafts: Array, total: number}>}
 */
export async function listDrafts(userId, { page = 1, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const offset = (Math.max(1, page) - 1) * safeLimit;

  const drafts = await db
    .select({
      id: polls.id,
      question: polls.question,
      selectionType: polls.selectionType,
      maxChoices: polls.maxChoices,
      isAnonymous: polls.isAnonymous,
      closedAt: polls.closedAt,
      createdAt: polls.createdAt,
      optionsCount: sql`(SELECT COUNT(*)::int FROM ${pollOptions} WHERE ${pollOptions.pollId} = ${polls.id})`.as('options_count'),
    })
    .from(polls)
    .where(and(eq(polls.userId, userId), isNull(polls.topicId)))
    .orderBy(desc(polls.createdAt))
    .limit(safeLimit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql`count(*)::int` })
    .from(polls)
    .where(and(eq(polls.userId, userId), isNull(polls.topicId)));

  return { drafts, total: count };
}

/**
 * 列出某话题已绑的所有 polls（含完整 options/voteCount，不含 myVotedOptionIds）
 *
 * @param {number} topicId
 * @returns {Promise<{polls: Array}>}
 */
export async function listByTopic(topicId) {
  const rows = await db
    .select({ id: polls.id })
    .from(polls)
    .where(eq(polls.topicId, topicId))
    .orderBy(asc(polls.createdAt));

  // 复用 getPoll 拼装详情（不传 userId → myVotedOptionIds 为空）
  const detailed = await Promise.all(rows.map((r) => getPoll(r.id, null)));
  // getPoll 在 topic 软删时返回 null；这里 topic 必然存在（参数即来自现有 topic），但若并发删除则过滤
  return { polls: detailed.filter(Boolean) };
}
```

- [ ] **Step 2: 在 import 区追加 desc**

文件顶部 `import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';` 改为：

```js
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
```

- [ ] **Step 3: 验证 imports + 烟雾测试**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then(async ({ createPoll, listDrafts, listByTopic, deletePoll, bindPollsToTopic }) => {
  const { default: db } = await import('./src/db/index.js');
  const { users, topics, categories, polls } = await import('./src/db/schema.js');
  const { eq } = await import('drizzle-orm');

  const [u] = await db.select({id: users.id}).from(users).limit(1);
  const [cat] = await db.select().from(categories).limit(1);

  // 草稿测试
  const { id: draftId } = await createPoll({question:'task2 draft', options:['a','b'], selectionType:'single'}, u.id);
  const { drafts, total } = await listDrafts(u.id, {limit: 5});
  console.log('drafts contains new:', drafts.some(d => d.id === draftId), 'total>=1:', total >= 1);
  console.log('draft fields:', Object.keys(drafts[0]).sort().join(','));

  // 已绑测试
  const [topic] = await db.insert(topics).values({
    title: 'task2 smoke', slug: 'task2-' + Date.now(),
    categoryId: cat.id, userId: u.id,
    postCount: 1, lastPostAt: new Date(), approvalStatus: 'approved',
  }).returning();
  const { id: boundId } = await createPoll({question:'task2 bound', options:['x','y'], selectionType:'single'}, u.id);
  await bindPollsToTopic(topic.id, '::poll{id=\"'+boundId+'\"}', u.id);
  const { polls: bound } = await listByTopic(topic.id);
  console.log('bound count:', bound.length, 'first has options:', !!bound[0]?.options);

  // 清理
  await deletePoll(draftId);
  await db.delete(polls).where(eq(polls.id, boundId));
  await db.delete(topics).where(eq(topics.id, topic.id));
  console.log('OK');
});
"
```

Expected: 全部 true / 字段列表包含 question/optionsCount 等 / `OK` 行最后输出。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/pollService.js
git commit -m "$(cat <<'EOF'
feat(api): pollService 新增 listDrafts 与 listByTopic

listDrafts 返回当前用户未绑话题的 poll 列表（带选项数），
按 createdAt DESC 分页。listByTopic 复用 getPoll 拼装某话题
所有已绑 poll 的完整详情。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: pollService — updateDraft + 收紧 deletePoll

**Files:**
- Modify: `apps/api/src/services/pollService.js`

- [ ] **Step 1: 把 deletePoll 改为带 owner 视角校验**

定位 `export async function deletePoll(pollId)`（v1 原版只删行）。整个函数替换：

```js
/**
 * 删除投票（CASCADE 自动清掉 options 与 votes）
 *
 * 业务规则：
 *  - 调用方传 isAdmin=true 时跳过 bound 校验（admin 走特权路径）
 *  - 否则若 poll 已绑话题（topicId 非空）→ 抛 400，要求先移除话题正文里的引用
 *
 * @param {number} pollId
 * @param {{isAdmin?: boolean}} options
 * @throws {Error & {statusCode}} 404 / 400
 */
export async function deletePoll(pollId, { isAdmin = false } = {}) {
  const [poll] = await db
    .select({ id: polls.id, topicId: polls.topicId })
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);

  if (!poll) {
    throw Object.assign(new Error('投票不存在'), { statusCode: 404 });
  }
  if (!isAdmin && poll.topicId !== null) {
    throw Object.assign(
      new Error('已发布的投票不允许删除，请先从话题正文中移除引用'),
      { statusCode: 400 }
    );
  }
  await db.delete(polls).where(eq(polls.id, pollId));
}
```

- [ ] **Step 2: 追加 updateDraft 方法（文件末尾）**

```js
/**
 * 编辑草稿（仅 owner，仅未绑）。
 * 事务：DELETE 旧 options → INSERT 新 options → UPDATE polls 元数据。
 *
 * @param {number} pollId
 * @param {object} data - 与 createPoll 一致字段
 * @param {number} userId - 必须是 poll.userId
 * @returns {Promise<{success: true}>}
 * @throws {Error & {statusCode}} 400 / 403 / 404
 */
export async function updateDraft(pollId, data, userId) {
  validatePollData(data);

  return await db.transaction(async (tx) => {
    const [poll] = await tx
      .select({ id: polls.id, topicId: polls.topicId, userId: polls.userId })
      .from(polls)
      .where(eq(polls.id, pollId))
      .for('update')
      .limit(1);

    if (!poll) {
      throw Object.assign(new Error('投票不存在'), { statusCode: 404 });
    }
    if (poll.topicId !== null) {
      throw Object.assign(new Error('已发布的投票不允许修改'), { statusCode: 400 });
    }
    if (poll.userId !== userId) {
      throw Object.assign(new Error('没有权限修改此投票'), { statusCode: 403 });
    }

    const { question, options, selectionType, maxChoices, isAnonymous, closedAt } = data;

    await tx.delete(pollOptions).where(eq(pollOptions.pollId, pollId));
    await tx.insert(pollOptions).values(
      options.map((text, idx) => ({
        pollId,
        text: String(text).slice(0, 500),
        displayOrder: idx,
        voteCount: 0,
      }))
    );

    await tx
      .update(polls)
      .set({
        question: question.trim(),
        selectionType,
        maxChoices: selectionType === 'multiple' ? maxChoices ?? null : null,
        isAnonymous: !!isAnonymous,
        closedAt: closedAt ?? null,
      })
      .where(eq(polls.id, pollId));

    return { success: true };
  });
}
```

- [ ] **Step 3: 烟雾测试**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then(async ({ createPoll, updateDraft, deletePoll, getPoll, bindPollsToTopic }) => {
  const { default: db } = await import('./src/db/index.js');
  const { users, topics, categories, polls } = await import('./src/db/schema.js');
  const { eq } = await import('drizzle-orm');
  const [u1, u2] = await db.select({id: users.id}).from(users).limit(2);
  const [cat] = await db.select().from(categories).limit(1);

  // 1. update 自己的草稿 OK
  const { id: d1 } = await createPoll({question:'before', options:['a','b'], selectionType:'single'}, u1.id);
  await updateDraft(d1, {question:'after', options:['x','y','z'], selectionType:'multiple', maxChoices:2}, u1.id);
  const p1 = await getPoll(d1, u1.id);
  console.log('1. updated question:', p1.question === 'after', 'options:', p1.options.map(o=>o.text).join(','), 'maxChoices:', p1.maxChoices);

  // 2. update 别人的草稿 → 403
  try {
    await updateDraft(d1, {question:'hack', options:['a','b'], selectionType:'single'}, u2.id);
    console.log('2. FAIL: should 403');
  } catch (e) {
    console.log('2. 403:', e.statusCode === 403 && e.message.includes('没有权限'));
  }

  // 3. update 已绑 → 400
  const [topic] = await db.insert(topics).values({
    title:'t3', slug:'task3-'+Date.now(),
    categoryId:cat.id, userId:u1.id, postCount:1, lastPostAt:new Date(), approvalStatus:'approved'
  }).returning();
  await bindPollsToTopic(topic.id, '::poll{id=\"'+d1+'\"}', u1.id);
  try {
    await updateDraft(d1, {question:'x', options:['a','b'], selectionType:'single'}, u1.id);
    console.log('3. FAIL: should 400');
  } catch (e) {
    console.log('3. 400:', e.statusCode === 400 && e.message.includes('不允许修改'));
  }

  // 4. delete 已绑 owner → 400
  try {
    await deletePoll(d1);
    console.log('4. FAIL: should 400');
  } catch (e) {
    console.log('4. 400:', e.statusCode === 400 && e.message.includes('不允许删除'));
  }

  // 5. delete 已绑 admin override → OK
  await deletePoll(d1, {isAdmin: true});
  const after = await getPoll(d1, null);
  console.log('5. admin删了:', after === null);

  await db.delete(topics).where(eq(topics.id, topic.id));
  console.log('DONE');
});
"
```

Expected: 5 行全部展示 true（或预期的成功语），最后 `DONE`。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/pollService.js
git commit -m "$(cat <<'EOF'
feat(api): pollService updateDraft + deletePoll 收紧 owner 行为

updateDraft：仅允许 owner 编辑未绑草稿；SELECT FOR UPDATE
事务里替换 options + 更新元数据；复用 validatePollData。

deletePoll：owner 调用时若 poll 已绑话题 → 400 拒绝
（要求先移除话题正文引用，避免悬空 ::poll{id}）。
admin 路径通过 {isAdmin:true} 选项 override，仍可强制删除。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: API 路由 — 新增 3 个端点 + DELETE 行为修正

**Files:**
- Modify: `apps/api/src/routes/polls/index.js`

- [ ] **Step 1: 顶部 import 区追加新方法引用**

定位文件顶部 import：

```js
import {
  createPoll,
  getPoll,
  castVote,
  listVoters,
  deletePoll,
} from '../../services/pollService.js';
```

改为：

```js
import {
  createPoll,
  getPoll,
  castVote,
  listVoters,
  deletePoll,
  listDrafts,
  listByTopic,
  updateDraft,
} from '../../services/pollService.js';
import { topics } from '../../db/schema.js';
```

（`db` 与 `polls` 已经在 import 中，无需修改；新增 `topics` 用于 GET /by-topic/:id 的鉴权）

- [ ] **Step 2: 在 POST `/` 路由之后、GET `/:id` 路由之前插入 GET `/drafts`**

> 路由顺序很重要：`/drafts` 必须在 `/:id` 之前注册，否则会被 `:id` 当作字符串路径吃掉（即使 id 是 number 类型，fastify 也会先解析顺序）。

```js
  // GET /polls/drafts — 列出当前用户的草稿
  fastify.get(
    '/drafts',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['polls'],
        description: '列出当前用户的草稿（未绑话题）',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await listDrafts(request.user.id, {
        page: request.query.page,
        limit: request.query.limit,
      });
      return result;
    }
  );
```

- [ ] **Step 3: 在 GET `/:id/voters` 路由之后插入 GET `/by-topic/:topicId`**

```js
  // GET /polls/by-topic/:topicId — 列出某话题已绑的所有 polls
  fastify.get(
    '/by-topic/:topicId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['polls'],
        description: '列出某话题已绑的所有 polls（仅作者或 dashboard.topics）',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['topicId'],
          properties: { topicId: { type: 'number' } },
        },
      },
    },
    async (request, reply) => {
      const [topic] = await db
        .select({ id: topics.id, userId: topics.userId, categoryId: topics.categoryId })
        .from(topics)
        .where(eq(topics.id, request.params.topicId))
        .limit(1);

      if (!topic) {
        return reply.code(404).send({ error: '话题不存在' });
      }

      const isOwner = request.user.id === topic.userId;
      const hasDashboard = await fastify.permission.can(request, 'dashboard.topics', {
        categoryId: topic.categoryId,
      });
      if (!isOwner && !hasDashboard) {
        return reply.code(403).send({ error: '没有权限查看此话题的投票列表' });
      }

      const result = await listByTopic(request.params.topicId);
      return result;
    }
  );
```

- [ ] **Step 4: 在 DELETE `/:id` 路由之前插入 PUT `/:id`**

```js
  // PUT /polls/:id — 编辑草稿（仅 owner 且未绑话题）
  fastify.put(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['polls'],
        description: '编辑草稿投票',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'number' } },
        },
        body: {
          type: 'object',
          required: ['question', 'options', 'selectionType'],
          properties: {
            question: { type: 'string', minLength: 1, maxLength: 500 },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 20,
              items: { type: 'string', minLength: 1, maxLength: 500 },
            },
            selectionType: { type: 'string', enum: ['single', 'multiple'] },
            maxChoices: { type: ['integer', 'null'], minimum: 1 },
            isAnonymous: { type: 'boolean', default: false },
            closedAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { closedAt, ...rest } = request.body;
        const result = await updateDraft(
          request.params.id,
          { ...rest, closedAt: closedAt ? new Date(closedAt) : null },
          request.user.id
        );
        return result;
      } catch (err) {
        if (err.statusCode) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
```

- [ ] **Step 5: 改 DELETE 路由 — 把 isAdmin 信号传给 service**

定位 `fastify.delete('/:id', ...)` 内的 handler。当前末尾是：

```js
      await deletePoll(request.params.id);
      return { success: true };
```

替换为：

```js
      try {
        await deletePoll(request.params.id, { isAdmin: hasDashboard });
        return { success: true };
      } catch (err) {
        if (err.statusCode) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
```

（`hasDashboard` 变量在更上方已经声明：`const hasDashboard = await fastify.permission.can(request, 'dashboard.polls');`）

- [ ] **Step 6: 启动 dev 后烟雾探路由**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api
touch src/app.js  # 触发 node --watch 重载
sleep 4

# 5 个路由全部应答
curl -s -o /dev/null -w "GET /drafts (no auth): %{http_code}\n" http://127.0.0.1:7100/api/polls/drafts
curl -s -o /dev/null -w "GET /by-topic/999 (no auth): %{http_code}\n" http://127.0.0.1:7100/api/polls/by-topic/999
curl -s -o /dev/null -w "PUT /99999 (no auth): %{http_code}\n" -X PUT http://127.0.0.1:7100/api/polls/99999 -H "Content-Type: application/json" -d '{"question":"x","options":["a","b"],"selectionType":"single"}'
curl -s -o /dev/null -w "GET /99999 (still works): %{http_code}\n" http://127.0.0.1:7100/api/polls/99999
curl -s -o /dev/null -w "DELETE /99999 (no auth): %{http_code}\n" -X DELETE http://127.0.0.1:7100/api/polls/99999
```

Expected:
- `GET /drafts: 401`（路由命中，要鉴权）
- `GET /by-topic/999: 401`
- `PUT /99999: 401`
- `GET /99999: 404`（已存在的路由仍然正常，不被 /drafts 抢走）
- `DELETE /99999: 401`

如果 `GET /99999` 返回非 404（如 500 或 401），说明路由顺序错了，回 Step 2 检查 `/drafts` 是否声明在 `/:id` 之前。

- [ ] **Step 7: Commit**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project
git add apps/api/src/routes/polls/index.js
git commit -m "$(cat <<'EOF'
feat(api): /api/polls 新增 GET /drafts、GET /by-topic/:id、PUT /:id

GET /drafts 返回当前用户的草稿列表，含分页。
GET /by-topic/:topicId 鉴权 = 话题作者 或 dashboard.topics，
返回该话题所有已绑 poll 的完整详情。
PUT /:id 编辑草稿，转发给 updateDraft，错误用 statusCode 兜底。
DELETE 路由把 dashboard.polls 信号 isAdmin 传给 service，
让 service 决定是否允许删已绑 poll。

注意：/drafts 路由必须在 /:id 之前注册，避免被通配吃掉。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: cleanup 插件 — 改任务名 + import

**Files:**
- Modify: `apps/api/src/plugins/cleanup.js`

- [ ] **Step 1: 改 import**

文件顶部找到：

```js
import { cleanupOrphanPolls } from '../services/pollService.js';
```

改为：

```js
import { cleanupExpiredDraftPolls } from '../services/pollService.js';
```

- [ ] **Step 2: 改 registerCleanupTask 调用**

文件内找到（约 Task 8 v1 实现添加的位置）：

```js
  // 5. 清理孤儿投票（创建超过 30 分钟未绑定 topic）
  registerCleanupTask('orphan-polls', async () => {
    return await cleanupOrphanPolls();
  });
```

替换为：

```js
  // 5. 清理过期草稿投票（创建超过 7 天未绑定 topic）
  registerCleanupTask('expired-draft-polls', async () => {
    return await cleanupExpiredDraftPolls();
  });
```

- [ ] **Step 3: 验证 dev 启动**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api
touch src/app.js
sleep 4
# 没有 "Cannot find" / "is not defined" 等 import 错就 OK
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7100/api/polls/99999
```

Expected: `404`（服务正常启动，路由响应）。

- [ ] **Step 4: 手动跑一次清理函数**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then(({ cleanupExpiredDraftPolls }) =>
  cleanupExpiredDraftPolls().then(n => console.log('cleaned:', n))
);
"
```

Expected: `cleaned: 0`（无过期草稿）或正整数（如果有 7 天前的草稿）。无报错。

- [ ] **Step 5: Commit**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project
git add apps/api/src/plugins/cleanup.js
git commit -m "$(cat <<'EOF'
chore(api): cleanup 任务改名 orphan-polls → expired-draft-polls

对齐 v1.1 草稿可视化语义；阈值改在 service 内 (7 天)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 前端 — topicId 透传链路

**Files:**
- Modify: `apps/web/src/components/topic/TopicForm.jsx`
- Modify: `apps/web/src/components/common/MarkdownEditor/index.jsx`
- Modify: `apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx`

- [ ] **Step 1: TopicForm 传 topicId 给 MarkdownEditor**

打开 `apps/web/src/components/topic/TopicForm.jsx`。找到 `<MarkdownEditor` 调用（约第 96-105 行附近）。在其 props 中插入一行：

```jsx
<MarkdownEditor
  // ... 现有 props
  topicId={isEditMode ? initialData?.id : undefined}
  toolbar={TOPIC_TOOLBAR}
  // ... 其余 props 保持不变
/>
```

> `initialData.id` 是话题在编辑模式下的标识；在 create 模式 `initialData` 通常没 `id`。

- [ ] **Step 2: MarkdownEditor 透传 topicId 到 config**

打开 `apps/web/src/components/common/MarkdownEditor/index.jsx`。在 props 解构（约第 32-44 行）追加 `topicId`：

```jsx
export default function MarkdownEditor({ 
  value = '', 
  onChange, 
  className, 
  editorClassName,
  placeholder = '开始编辑...',
  toolbar = DEFAULT_TOOLBAR,
  disabled = false,
  minimal = false,
  onUpload,
  uploadType = 'topics',
  topicId,
  ...props
}) {
```

在 ToolComponent 渲染的 `config={...}`（约第 90-96 行）追加 `topicId`：

```jsx
<ToolComponent 
  key={item}
  editor={editorCore}
  disabled={isPreviewMode || disabled}
  config={{ 
    onUpload, 
    uploadType,
    textareaRef,
    onChange,
    topicId,
  }}
/>
```

- [ ] **Step 3: PollTool 读 config.topicId 透传 PollDialog**

打开 `apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx`。全文替换为：

```jsx
'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PollDialog from '@/components/topic/PollDialog';

export function PollTool({ editor, disabled, config }) {
  const [open, setOpen] = useState(false);

  const handleCreated = (pollId) => {
    editor.insertBlock(`::poll{id="${pollId}"}\n`);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="插入投票"
      >
        <BarChart3 className="h-4 w-4" />
      </Button>
      <PollDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={handleCreated}
        topicId={config?.topicId}
      />
    </>
  );
}
```

> PollDialog 在 Task 7 之前还不接收 `topicId` prop，但传过去无害（React 会忽略未声明的 prop）。Task 7 完成后即生效。

- [ ] **Step 4: 验证编辑 dev 仍能编译**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev &
sleep 12
curl -s -o /dev/null -w "create: %{http_code}\n" http://127.0.0.1:3100/create
kill %1 2>/dev/null || true
```

Expected: `create: 200`（或 200/redirect），无 console 报错。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/topic/TopicForm.jsx \
        apps/web/src/components/common/MarkdownEditor/index.jsx \
        apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx
git commit -m "$(cat <<'EOF'
feat(web): topicId 从 TopicForm 透传到 PollDialog

为 v1.1 PollDialog 的"本话题已有"Tab 准备数据源：
TopicForm（编辑模式）→ MarkdownEditor.config → PollTool →
PollDialog.topicId。新建话题时 topicId === undefined。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: PollDialog 重构 — Tab 容器 + 3 个子组件

**Files:**
- Create: `apps/web/src/components/topic/PollDialog/index.jsx`
- Create: `apps/web/src/components/topic/PollDialog/PollFormTab.jsx`
- Create: `apps/web/src/components/topic/PollDialog/DraftsTab.jsx`
- Create: `apps/web/src/components/topic/PollDialog/BoundTab.jsx`
- Delete: `apps/web/src/components/topic/PollDialog.jsx`

这是本计划最复杂的任务。完成后 `@/components/topic/PollDialog` 自动 resolve 到 `PollDialog/index.jsx`。

- [ ] **Step 1: 创建 PollDialog/index.jsx — Tab 容器**

```jsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PollFormTab from './PollFormTab';
import DraftsTab from './DraftsTab';
import BoundTab from './BoundTab';

/**
 * 投票创建/编辑/复用对话框
 * Tab 式布局：
 *  - "新建"：编辑/创建表单（editingDraft 决定走 POST 还是 PUT）
 *  - "草稿"：当前用户的草稿列表，可插入/编辑/删除
 *  - "本话题已有"（仅 editingTopicId 存在时）：当前话题已绑 polls，仅"重新插入"
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open:boolean)=>void} props.onOpenChange
 * @param {(pollId:number)=>void} props.onCreated - 插入到编辑器的回调
 * @param {number|undefined} props.topicId - 仅编辑现有话题时传入
 */
export default function PollDialog({ open, onOpenChange, onCreated, topicId }) {
  const [activeTab, setActiveTab] = useState('new');
  const [editingDraft, setEditingDraft] = useState(null); // { id, question, options, selectionType, maxChoices, isAnonymous, closedAt } | null
  const [draftsRefreshKey, setDraftsRefreshKey] = useState(0);

  const handleOpenChange = (next) => {
    if (!next) {
      // 关闭弹框时重置所有状态
      setActiveTab('new');
      setEditingDraft(null);
    }
    onOpenChange?.(next);
  };

  // 表单提交成功后行为：新建时插入到编辑器+关弹框；编辑时留在 Tab 1+刷新草稿列表
  const handleFormSubmitted = (pollId, wasEditing) => {
    if (wasEditing) {
      setEditingDraft(null);
      setDraftsRefreshKey((k) => k + 1);
      // 留在"新建"Tab，标题/按钮回到新建态
    } else {
      onCreated?.(pollId);
      handleOpenChange(false);
    }
  };

  // 从草稿 Tab 触发编辑：切到表单 Tab 并预填
  const handleEditDraft = (draft) => {
    setEditingDraft(draft);
    setActiveTab('new');
  };

  // 从草稿/已绑 Tab 触发插入
  const handleInsert = (pollId) => {
    onCreated?.(pollId);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingDraft ? `编辑草稿 #${editingDraft.id}` : '插入投票'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={topicId ? 'grid grid-cols-3 w-full' : 'grid grid-cols-2 w-full'}>
            <TabsTrigger value="new">新建</TabsTrigger>
            <TabsTrigger value="drafts">草稿</TabsTrigger>
            {topicId && <TabsTrigger value="bound">本话题已有</TabsTrigger>}
          </TabsList>

          <TabsContent value="new">
            <PollFormTab
              editingDraft={editingDraft}
              onSubmitted={handleFormSubmitted}
              onCancelEdit={() => setEditingDraft(null)}
            />
          </TabsContent>

          <TabsContent value="drafts">
            <DraftsTab
              refreshKey={draftsRefreshKey}
              onInsert={handleInsert}
              onEdit={handleEditDraft}
            />
          </TabsContent>

          {topicId && (
            <TabsContent value="bound">
              <BoundTab topicId={topicId} onInsert={handleInsert} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 创建 PollFormTab.jsx — 新建/编辑统一表单**

```jsx
'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;

const DURATION_PRESETS = [
  { label: '永久', value: '' },
  { label: '1 天', value: '1' },
  { label: '3 天', value: '3' },
  { label: '7 天', value: '7' },
  { label: '30 天', value: '30' },
];

/**
 * @param {object} props
 * @param {object|null} props.editingDraft - null = 新建，否则预填编辑
 * @param {(pollId:number, wasEditing:boolean)=>void} props.onSubmitted
 * @param {()=>void} props.onCancelEdit
 */
export default function PollFormTab({ editingDraft, onSubmitted, onCancelEdit }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [selectionType, setSelectionType] = useState('single');
  const [maxChoices, setMaxChoices] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [durationDays, setDurationDays] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = editingDraft != null;

  // 编辑模式预填；切回新建时重置
  useEffect(() => {
    if (editingDraft) {
      setQuestion(editingDraft.question || '');
      setOptions(
        Array.isArray(editingDraft.options) && editingDraft.options.length >= MIN_OPTIONS
          ? editingDraft.options.map((o) => (typeof o === 'string' ? o : o.text))
          : ['', '']
      );
      setSelectionType(editingDraft.selectionType || 'single');
      setMaxChoices(editingDraft.maxChoices != null ? String(editingDraft.maxChoices) : '');
      setIsAnonymous(!!editingDraft.isAnonymous);
      // 编辑模式下不还原 closedAt 到预设（自由文本不易反推），就维持空 = 不变更
      setDurationDays('');
    } else {
      setQuestion('');
      setOptions(['', '']);
      setSelectionType('single');
      setMaxChoices('');
      setIsAnonymous(true);
      setDurationDays('');
    }
  }, [editingDraft]);

  const updateOption = (idx, value) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (idx) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      toast.error('请填写投票问题');
      return;
    }
    if (trimmedOptions.length < MIN_OPTIONS) {
      toast.error(`至少填写 ${MIN_OPTIONS} 个有效选项`);
      return;
    }
    if (trimmedOptions.length > MAX_OPTIONS) {
      toast.error(`最多 ${MAX_OPTIONS} 个选项`);
      return;
    }

    let parsedMaxChoices = null;
    if (selectionType === 'multiple') {
      if (maxChoices !== '') {
        const n = Number(maxChoices);
        if (!Number.isInteger(n) || n < 1 || n > trimmedOptions.length) {
          toast.error('最多可选项数必须在 1 与选项数之间');
          return;
        }
        parsedMaxChoices = n;
      }
    }

    // 编辑模式：durationDays 留空表示"不改变"；新建：留空 = 永久
    let closedAt;
    if (durationDays === '') {
      closedAt = isEditing ? (editingDraft.closedAt ?? null) : null;
    } else {
      const days = Number(durationDays);
      closedAt = days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;
    }

    const body = {
      question: trimmedQuestion,
      options: trimmedOptions,
      selectionType,
      maxChoices: parsedMaxChoices,
      isAnonymous,
      closedAt,
    };

    setSubmitting(true);
    try {
      const url = isEditing ? `/api/polls/${editingDraft.id}` : '/api/polls';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || (isEditing ? '保存失败' : '创建投票失败'));
        return;
      }
      if (isEditing) {
        toast.success('草稿已保存');
      }
      onSubmitted?.(isEditing ? editingDraft.id : data.id, isEditing);
    } catch (err) {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="poll-question">问题</Label>
        <Input
          id="poll-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="想问大家什么？"
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <Label>选项（{options.length}/{MAX_OPTIONS}）</Label>
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={`选项 ${idx + 1}`}
                maxLength={500}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeOption(idx)}
                disabled={options.length <= MIN_OPTIONS}
                title="删除该选项"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          disabled={options.length >= MAX_OPTIONS}
        >
          <Plus className="h-4 w-4" /> 添加选项
        </Button>
      </div>

      <div className="space-y-2">
        <Label>类型</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="poll-selection-type"
              value="single"
              checked={selectionType === 'single'}
              onChange={() => setSelectionType('single')}
              className="h-4 w-4"
            />
            <span>单选</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="poll-selection-type"
              value="multiple"
              checked={selectionType === 'multiple'}
              onChange={() => setSelectionType('multiple')}
              className="h-4 w-4"
            />
            <span>多选</span>
          </label>
        </div>
      </div>

      {selectionType === 'multiple' && (
        <div className="space-y-2">
          <Label htmlFor="poll-max-choices">最多可选（留空 = 不限）</Label>
          <Input
            id="poll-max-choices"
            type="number"
            min={1}
            max={options.length}
            value={maxChoices}
            onChange={(e) => setMaxChoices(e.target.value)}
            placeholder={`1-${options.length}`}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="poll-duration">
          截止时间{isEditing && '（留空 = 不变更）'}
        </Label>
        <select
          id="poll-duration"
          value={durationDays}
          onChange={(e) => setDurationDays(e.target.value)}
          className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
        >
          {DURATION_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="poll-anonymous"
          checked={isAnonymous}
          onCheckedChange={(v) => setIsAnonymous(v === true)}
        />
        <Label htmlFor="poll-anonymous" className="cursor-pointer">
          匿名投票（不显示投票者名单）
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancelEdit}
            disabled={submitting}
          >
            取消编辑
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEditing ? '保存修改' : '创建投票'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: 创建 DraftsTab.jsx — 草稿列表**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Pencil, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const LIMIT = 20;

function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return '今天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))} 周前`;
  return `${Math.floor(diff / (30 * day))} 月前`;
}

/**
 * @param {object} props
 * @param {number} props.refreshKey - 父组件递增以触发刷新
 * @param {(pollId:number)=>void} props.onInsert
 * @param {(draft:object)=>void} props.onEdit - 把完整 draft (含 options) 传回去
 */
export default function DraftsTab({ refreshKey, onInsert, onEdit }) {
  const [drafts, setDrafts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // {id, question} | null
  const [busyEdit, setBusyEdit] = useState(null); // id being loaded for edit

  const loadDrafts = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/polls/drafts?page=${page}&limit=${LIMIT}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载草稿失败');
        }
        return res.json();
      })
      .then((d) => {
        if (cancelled) return;
        setDrafts(d.drafts ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  };

  useEffect(() => {
    return loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, refreshKey]);

  const handleEditClick = async (draft) => {
    // 列表项只有摘要，编辑需要完整 options。先 GET /api/polls/:id 拿完整数据
    setBusyEdit(draft.id);
    try {
      const res = await fetch(`/api/polls/${draft.id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || '加载草稿失败');
        return;
      }
      onEdit?.({
        id: data.id,
        question: data.question,
        options: data.options.map((o) => o.text),
        selectionType: data.selectionType,
        maxChoices: data.maxChoices,
        isAnonymous: data.isAnonymous,
        closedAt: data.closedAt,
      });
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setBusyEdit(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/polls/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || '删除失败');
        return;
      }
      toast.success('草稿已删除');
      setDeleteTarget(null);
      loadDrafts();
    } catch {
      toast.error('网络错误，请重试');
    }
  };

  if (loading && drafts.length === 0) {
    return <div className="py-8 text-sm text-muted-foreground text-center">加载中…</div>;
  }
  if (error) {
    return <div className="py-8 text-sm text-destructive text-center">{error}</div>;
  }
  if (drafts.length === 0) {
    return (
      <div className="py-8 text-sm text-muted-foreground text-center">
        还没有草稿。去『新建』Tab 创建第一个吧。
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="pt-4 space-y-2">
      {drafts.map((d) => (
        <div key={d.id} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <BarChart3 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {d.question.length > 60 ? d.question.slice(0, 60) + '…' : d.question}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {d.selectionType === 'single' ? '单选' : '多选'}
                {' · '}
                {d.isAnonymous ? '匿名' : '实名'}
                {' · '}
                {d.optionsCount} 选项
                {' · '}
                {formatTimeAgo(d.createdAt)}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onInsert?.(d.id)}>
              <ArrowRight className="h-3 w-3" /> 插入
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEditClick(d)}
              disabled={busyEdit === d.id}
            >
              {busyEdit === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget({ id: d.id, question: d.question })}
            >
              <Trash2 className="h-3 w-3" /> 删除
            </Button>
          </div>
        </div>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              下一页
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除草稿</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除草稿"{deleteTarget?.question?.slice(0, 40)}…"？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: 创建 BoundTab.jsx — 本话题已绑列表**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { BarChart3, ArrowRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * @param {object} props
 * @param {number} props.topicId
 * @param {(pollId:number)=>void} props.onInsert
 */
export default function BoundTab({ topicId, onInsert }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/polls/by-topic/${topicId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载失败');
        }
        return res.json();
      })
      .then((d) => {
        if (cancelled) return;
        setPolls(d.polls ?? []);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [topicId]);

  if (loading) {
    return <div className="py-8 text-sm text-muted-foreground text-center">加载中…</div>;
  }
  if (error) {
    return <div className="py-8 text-sm text-destructive text-center">{error}</div>;
  }
  if (polls.length === 0) {
    return (
      <div className="py-8 text-sm text-muted-foreground text-center">
        本话题暂无已绑投票。
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-2">
      {polls.map((p) => (
        <div key={p.id} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <BarChart3 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {p.question.length > 60 ? p.question.slice(0, 60) + '…' : p.question}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <span>{p.selectionType === 'single' ? '单选' : '多选'}</span>
                <span>·</span>
                <span>{p.isAnonymous ? '匿名' : '实名'}</span>
                <span>·</span>
                <span>{p.options?.length ?? 0} 选项</span>
                <span>·</span>
                <Users className="h-3 w-3" />
                <span>{p.totalVoters ?? 0} 人投票</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onInsert?.(p.id)}>
              <ArrowRight className="h-3 w-3" /> 重新插入正文
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 删除旧 PollDialog.jsx**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project
rm apps/web/src/components/topic/PollDialog.jsx
```

> 此后 `import PollDialog from '@/components/topic/PollDialog'` 会自动 resolve 到 `PollDialog/index.jsx`。Next.js 与 Node 的模块解析都会优先目录里的 `index.jsx`。

- [ ] **Step 6: 验证编译 + 简单 UI 探测**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev &
sleep 12

# 编译没炸
curl -s -o /dev/null -w "create: %{http_code}\n" http://127.0.0.1:3100/create

# 抓首页看 console 报错
curl -s http://127.0.0.1:3100/ -o /tmp/home.html
grep -i "syntax\|error" /tmp/home.html | head -5 || echo "no obvious error in home HTML"

kill %1 2>/dev/null || true
```

Expected: `create: 200`，无明显 syntax 错误。

> 真实 Dialog 交互（开弹框 → 切 Tab → 编辑/删除 → 验证 UI 状态）由 Task 8 QA 走。

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src/components/topic/PollDialog*
git commit -m "$(cat <<'EOF'
refactor(web): PollDialog 重构为 Tab 式（新建/草稿/已绑）

把单文件 PollDialog.jsx 拆为 PollDialog/ 目录：
- index.jsx        Tab 容器，管理 activeTab + editingDraft
- PollFormTab.jsx  新建/编辑表单（按 editingDraft 切换 POST/PUT）
- DraftsTab.jsx    当前用户草稿列表，含插入/编辑/删除
- BoundTab.jsx     本话题已绑列表（仅 topicId 存在时显示），
                   仅"重新插入"

PollFormTab 仍处理表单冒泡（e.stopPropagation）保留 v1 的修复。
import 路径 @/components/topic/PollDialog 不变。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 端到端手动 QA

**Files:** 无变更（仅验证）

跑通 spec §11 的验收清单。能通过 API + DB 验证的尽量自动化；UI 部分明确列出供人浏览器走查。

- [ ] **Step 1: 启动 dev**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev &
sleep 8
```

- [ ] **Step 2: GET /drafts 只返回当前用户的草稿（API + DB）**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then(async ({ createPoll, listDrafts, deletePoll }) => {
  const { default: db } = await import('./src/db/index.js');
  const { users } = await import('./src/db/schema.js');
  const [u1, u2] = await db.select({id: users.id}).from(users).limit(2);
  const a = await createPoll({question:'qa: u1 draft', options:['a','b'], selectionType:'single'}, u1.id);
  const b = await createPoll({question:'qa: u2 draft', options:['x','y'], selectionType:'single'}, u2.id);
  const r1 = await listDrafts(u1.id);
  const r2 = await listDrafts(u2.id);
  const u1HasA = r1.drafts.some(d => d.id === a.id);
  const u1HasB = r1.drafts.some(d => d.id === b.id);
  const u2HasA = r2.drafts.some(d => d.id === a.id);
  const u2HasB = r2.drafts.some(d => d.id === b.id);
  console.log('u1 sees own:', u1HasA, 'u1 isolated from u2:', !u1HasB);
  console.log('u2 sees own:', u2HasB, 'u2 isolated from u1:', !u2HasA);
  await deletePoll(a.id); await deletePoll(b.id);
});
"
```

Expected: 4 个 boolean 全是 true。

- [ ] **Step 3: PUT /polls/:id — 编辑别人草稿 → 403；编辑已绑 poll → 400**

涵盖在 Task 3 Step 3 的脚本里，已验证。如果担心 commit 后行为变了再跑一次。

- [ ] **Step 4: DELETE /polls/:id — owner 删自己已绑的 → 400；admin 删别人已绑的 → OK**

涵盖在 Task 3 Step 3。如果担心，再跑一遍即可。

- [ ] **Step 5: 7 天自动清理生效**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then(async ({ createPoll, cleanupExpiredDraftPolls, getPoll }) => {
  const { default: db } = await import('./src/db/index.js');
  const { users, polls } = await import('./src/db/schema.js');
  const { eq, sql } = await import('drizzle-orm');
  const [u] = await db.select({id: users.id}).from(users).limit(1);
  // 创建 2 个草稿，把第一个 backdate 到 8 天前
  const a = await createPoll({question:'8 day old', options:['a','b'], selectionType:'single'}, u.id);
  const b = await createPoll({question:'fresh', options:['a','b'], selectionType:'single'}, u.id);
  await db.update(polls).set({createdAt: sql\`NOW() - INTERVAL '8 days'\`}).where(eq(polls.id, a.id));
  const cleaned = await cleanupExpiredDraftPolls();
  const aGone = (await getPoll(a.id, null)) === null;
  const bStill = (await getPoll(b.id, null)) !== null;
  console.log('cleaned >= 1:', cleaned >= 1, '8d old gone:', aGone, 'fresh still:', bStill);
  await db.delete(polls).where(eq(polls.id, b.id));
});
"
```

Expected: 3 个 boolean 全是 true。

- [ ] **Step 6: GET /by-topic/:id 鉴权**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm exec dotenvx run -- node -e "
import('./src/services/pollService.js').then(async ({ createPoll, bindPollsToTopic, listByTopic }) => {
  const { default: db } = await import('./src/db/index.js');
  const { users, topics, categories, polls } = await import('./src/db/schema.js');
  const { eq } = await import('drizzle-orm');
  const [u] = await db.select({id: users.id}).from(users).limit(1);
  const [cat] = await db.select().from(categories).limit(1);
  const [t] = await db.insert(topics).values({
    title:'qa bound', slug:'qa-bound-'+Date.now(),
    categoryId:cat.id, userId:u.id, postCount:1, lastPostAt:new Date(), approvalStatus:'approved'
  }).returning();
  const { id: pollId } = await createPoll({question:'in topic', options:['a','b'], selectionType:'single'}, u.id);
  await bindPollsToTopic(t.id, '::poll{id=\"'+pollId+'\"}', u.id);
  const result = await listByTopic(t.id);
  console.log('listByTopic count:', result.polls.length, 'has question:', !!result.polls[0]?.question);
  await db.delete(topics).where(eq(t.id, topics.id));
  await db.delete(polls).where(eq(polls.id, pollId));
});
"
```

Expected: `count: 1` `has question: true`.

> 鉴权（非作者无权限）通过 HTTP curl + 真实 session 测较麻烦，路由层已实现 `isOwner || dashboard.topics` 校验，service 层无校验。代码 review 已能确认。

- [ ] **Step 7: UI 浏览器走查（需要人）**

dev 服务在 `http://localhost:3100`。请用浏览器走一遍：

1. **发布新话题流程**
   - 进入 `/create`，点工具栏"插入投票" → 弹框默认 Tab "新建"
   - 填写后点"创建投票" → 弹框关闭、编辑器有 `::poll{id="X"}`、外层话题表单**未被误提交**（v1 fix 仍生效）
   - **重要：不发帖**，关弹框/关页面 → poll X 应该是草稿
   - 重新打开 `/create`，点工具栏"插入投票" → 切到"草稿"Tab → 看到刚才的 X

2. **草稿操作**
   - 草稿 Tab 点"编辑" → 切到"新建"Tab，标题变"编辑草稿 #X"，表单已预填
   - 改个问题，点"保存修改" → toast"草稿已保存"，回到新建态（editing cleared），草稿列表刷新
   - 草稿 Tab 点"插入" → 编辑器追加 `::poll{id="X"}` + 弹框关闭
   - 草稿 Tab 点"删除" → AlertDialog 确认 → 删除成功，列表更新

3. **编辑话题流程**
   - 发布一个含 poll Y 的话题（Y 自动绑定到该话题）
   - 进入该话题的编辑页 → 点工具栏"插入投票"
   - 这次弹框应该有 3 个 Tab：新建 / 草稿 / **本话题已有**
   - "本话题已有"Tab 应展示 Y，每项有"重新插入正文"按钮
   - 草稿 Tab **不应**显示 Y（Y 已绑话题，不是草稿）
   - 点"重新插入正文" → 编辑器追加 `::poll{id="Y"}` + 弹框关闭

4. **失败路径**
   - 在草稿 Tab 进入编辑、改了选项后保存 → 应成功
   - 别人开两个浏览器同时 PUT 同一草稿（很难复现）→ 后写的覆盖（事务）
   - DELETE 自己的已绑 poll（API 层）→ 返回 400 "已发布的投票不允许删除..."

- [ ] **Step 8: 收尾**

```bash
kill %1 2>/dev/null || true  # 杀掉 dev
```

QA 完毕。如有失败回到对应 Task 修。

---

## 收尾说明

- 本计划未涵盖（spec §1.2 Out of Scope）：编辑已绑投票、解绑、用户主页"我的草稿"独立路由、批量操作、草稿搜索/排序。
- 若实施中遇到 Drizzle 的 `sql` 模板拼接、Radix Tabs API 变动等具体差异，按现状调整，不必生硬照搬代码。
- 若 PollDialog 的状态管理后续变复杂（如跨 Tab 联动增加），可考虑提一个 `usePollDialog` hook 收口；v1.1 当前规模没必要。
