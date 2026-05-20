# 话题内嵌投票 v1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在话题正文里通过 `::poll{id="..."}` markdown 指令插入投票，支持单/多选、匿名、截止时间、一人一票，与话题原子提交、孤儿自动清理。

**Architecture:** 三表规范化（polls/poll_options/poll_votes）+ 5 个 REST 路由（/api/polls 系列）+ pollService 集中业务逻辑（事务、计数缓存、bindPollsToTopic 校验）+ 现有 MarkdownEditor 工具栏插槽接入新 PollDialog + 改写已有 PollWidget 占位组件。话题与 poll 通过外键 ON DELETE CASCADE 强耦合，话题硬删时投票数据一并消失。

**Tech Stack:** Fastify 5（自动加载路由）、Drizzle ORM、PostgreSQL、Next.js 16 + React 19、Tailwind v4、shadcn/ui、lucide-react。纯 JS（无 TS），API 用 ESM 且 import 必带 `.js`。

**Spec：** `docs/superpowers/specs/2026-05-20-topic-polls-design.md`

**测试约定**：项目无自动化测试套件（AGENTS.md 明示），每个任务的验证步骤都用**手动操作 + 日志检查 + curl/Drizzle Studio** 而非 `pnpm test`。

**开发约定**（来自 AGENTS.md）：
- 2 空格缩进、语句必加分号
- JS 用单引号，JSX 属性用双引号
- API 端 import 必须带 `.js` 后缀
- 前端用 `@/` 别名，shadcn/ui + Tailwind v4

---

## 文件结构总览

### 新增（7 个文件）
| 路径 | 责任 |
|---|---|
| `apps/api/src/utils/extractPollIds.js` | 从 markdown 文本里提取 `::poll{id="..."}` 的 ID 列表与剥离指令 |
| `apps/api/src/services/pollService.js` | createPoll / getPoll / castVote / listVoters / deletePoll / bindPollsToTopic |
| `apps/api/src/routes/polls/index.js` | 5 个 REST 路由（自动被 autoload 挂在 `/api/polls`） |
| `apps/web/src/components/topic/PollDialog.jsx` | 创建投票表单弹框 |
| `apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx` | 编辑器工具栏的"插入投票"按钮 |
| —— | —— |

### 修改（7 个文件）
| 路径 | 改动要点 |
|---|---|
| `apps/api/src/db/schema.js` | 新增 polls / pollOptions / pollVotes 三个表 + relations |
| `apps/api/src/config/rbac.js` | SYSTEM_PERMISSIONS 增 3 个权限点；ROLE_PERMISSION_MAP user 角色新增 2 项 |
| `apps/api/src/plugins/cleanup.js` | 注册 'orphan-polls' 清理任务 |
| `apps/api/src/routes/topics/index.js` | POST `/topics` 与 PUT `/topics/:id` 接入 `bindPollsToTopic` |
| `apps/web/src/components/topic/TopicForm.jsx` | TOPIC_TOOLBAR 加入 `'poll'` |
| `apps/web/src/components/common/MarkdownEditor/tools/index.js` | ToolRegistry 增 `poll: PollTool` |
| `apps/web/src/components/common/MarkdownRender/components/PollWidget.jsx` | 替换占位实现为真实数据获取与投票逻辑 |

---

## Task 1: 添加数据库 Schema

**Files:**
- Modify: `apps/api/src/db/schema.js`（末尾追加三表）
- Verify: PostgreSQL via `pnpm db:studio` 或 `psql`

- [ ] **Step 1: 打开 schema.js 检查 imports**

读 `apps/api/src/db/schema.js` 第 1-12 行，确认 imports 已有 `pgTable, varchar, text, timestamp, boolean, index, unique, integer` 以及 `uniqueIndex`。

如果 `uniqueIndex` 没有，修改第 1-10 行的 import 语句加入：

```js
import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  unique,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: 在 schema.js 末尾追加三个表定义**

文件末尾追加（保持文件末尾换行符）：

```js
// ============ Polls (话题投票) ============
export const polls = pgTable(
  'polls',
  {
    ...$defaults,
    topicId: integer('topic_id').references(() => topics.id, { onDelete: 'cascade' }), // 允许 NULL：创建到绑定的过渡期
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    selectionType: varchar('selection_type', { length: 20 }).notNull(), // 'single' | 'multiple'
    maxChoices: integer('max_choices'), // 仅 selectionType='multiple' 用
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    closedAt: timestamp('closed_at', { withTimezone: true }), // NULL = 永久开放
    totalVoters: integer('total_voters').notNull().default(0),
  },
  (table) => [
    index('polls_topic_idx').on(table.topicId),
    index('polls_created_by_idx').on(table.createdBy),
  ]
);

export const pollsRelations = relations(polls, ({ one, many }) => ({
  topic: one(topics, {
    fields: [polls.topicId],
    references: [topics.id],
  }),
  creator: one(users, {
    fields: [polls.createdBy],
    references: [users.id],
  }),
  options: many(pollOptions),
  votes: many(pollVotes),
}));

// ============ Poll Options (投票选项) ============
export const pollOptions = pgTable(
  'poll_options',
  {
    ...$defaults,
    pollId: integer('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    voteCount: integer('vote_count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('poll_options_poll_order_idx').on(table.pollId, table.displayOrder),
  ]
);

export const pollOptionsRelations = relations(pollOptions, ({ one, many }) => ({
  poll: one(polls, {
    fields: [pollOptions.pollId],
    references: [polls.id],
  }),
  votes: many(pollVotes),
}));

// ============ Poll Votes (投票记录) ============
export const pollVotes = pgTable(
  'poll_votes',
  {
    ...$defaults,
    pollId: integer('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: integer('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('poll_votes_poll_user_option_idx').on(table.pollId, table.userId, table.optionId),
    index('poll_votes_poll_user_idx').on(table.pollId, table.userId),
  ]
);

export const pollVotesRelations = relations(pollVotes, ({ one }) => ({
  poll: one(polls, {
    fields: [pollVotes.pollId],
    references: [polls.id],
  }),
  option: one(pollOptions, {
    fields: [pollVotes.optionId],
    references: [pollOptions.id],
  }),
  user: one(users, {
    fields: [pollVotes.userId],
    references: [users.id],
  }),
}));
```

- [ ] **Step 3: 推送 schema 变更到数据库**

在 `apps/api` 目录运行：

```bash
cd apps/api && pnpm db:push
```

Expected: drizzle-kit 提示创建三张新表的 SQL；选 "create new table" 或回车确认。完成后控制台无报错。

- [ ] **Step 4: 验证表已创建**

启动 Drizzle Studio：

```bash
cd apps/api && pnpm db:studio
```

Expected: 浏览器打开后侧边栏看到 `polls`、`poll_options`、`poll_votes` 三个表。关闭即可。

或用 psql：

```bash
psql $DATABASE_URL -c "\dt poll*"
```

Expected: 列出三张表名。

- [ ] **Step 5: Commit**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project
git add apps/api/src/db/schema.js
git commit -m "$(cat <<'EOF'
feat(db): 新增 polls / poll_options / poll_votes 三表

支持话题内嵌投票 v1。强外键 CASCADE 保证话题硬删时投票数据
一并清理。pollVotes (pollId, userId, optionId) 唯一索引兜底
一人一票。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: extractPollIds 工具函数

**Files:**
- Create: `apps/api/src/utils/extractPollIds.js`

- [ ] **Step 1: 创建工具文件**

文件内容：

```js
/**
 * 从 markdown 文本中提取所有 `::poll{id="..."}` 指令引用的 ID。
 *
 * 指令语法（remark leafDirective）：行级 `::poll{id="xxxxx"}`，可带其他属性。
 *
 * @param {string} content - markdown 原文
 * @returns {string[]} 去重后的 id 字符串数组（按出现顺序）
 */
export function extractPollIds(content) {
  if (!content || typeof content !== 'string') return [];

  const re = /::poll\{[^}]*\bid="([^"]+)"[^}]*\}/g;
  const ids = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(content)) !== null) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * 从 markdown 文本中删除指定 id 列表对应的 `::poll{id="..."}` 指令行。
 * 整行（含可能的前后空白与尾部换行）一并去掉，避免遗留空行污染排版。
 *
 * @param {string} content - markdown 原文
 * @param {string[]} idsToRemove - 要删除的 poll id 数组
 * @returns {string} 清洗后的 markdown
 */
export function stripPollDirectives(content, idsToRemove) {
  if (!content || !idsToRemove || idsToRemove.length === 0) return content;

  const idSet = new Set(idsToRemove.map(String));
  const lineRe = /^[ \t]*::poll\{[^}]*\}[ \t]*$\n?/gm;

  return content.replace(lineRe, (line) => {
    const idMatch = /\bid="([^"]+)"/.exec(line);
    if (idMatch && idSet.has(idMatch[1])) {
      return '';
    }
    return line;
  });
}
```

- [ ] **Step 2: 内联自测**

跑一段 Node 一次性脚本验证两个函数：

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && node -e "
import('./src/utils/extractPollIds.js').then(({ extractPollIds, stripPollDirectives }) => {
  const md = 'before\n::poll{id=\"abc\"}\nmiddle\n::poll{id=\"def\" other=\"x\"}\nend\n';
  console.log('ids:', extractPollIds(md));
  console.log('strip abc:', JSON.stringify(stripPollDirectives(md, ['abc'])));
  console.log('strip both:', JSON.stringify(stripPollDirectives(md, ['abc', 'def'])));
});
"
```

Expected output:
```
ids: [ 'abc', 'def' ]
strip abc: "\"before\\nmiddle\\n::poll{id=\\\"def\\\" other=\\\"x\\\"}\\nend\\n\""
strip both: "\"before\\nmiddle\\nend\\n\""
```

如果不匹配，回 Step 1 调试正则。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/utils/extractPollIds.js
git commit -m "$(cat <<'EOF'
feat(api): 新增 extractPollIds 工具

解析与剥离 markdown 中的 ::poll{id="..."} 指令，
供 pollService.bindPollsToTopic 与盗用防御使用。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: pollService — createPoll 与 getPoll

**Files:**
- Create: `apps/api/src/services/pollService.js`（本任务只放 create / get，后续任务追加 vote / bind / delete）

- [ ] **Step 1: 创建 service 骨架与两个方法**

文件内容：

```js
import db from '../db/index.js';
import { polls, pollOptions, pollVotes } from '../db/schema.js';
import { and, asc, eq, sql } from 'drizzle-orm';

/**
 * 创建投票（不绑定 topic）
 *
 * @param {object} data - 投票数据
 * @param {string} data.question
 * @param {Array<string>} data.options - 至少 2、至多 20 项
 * @param {'single'|'multiple'} data.selectionType
 * @param {number|null} data.maxChoices - 仅 multiple 时有意义；null = 不限（最多等于选项数）
 * @param {boolean} data.isAnonymous
 * @param {Date|null} data.closedAt
 * @param {number} userId - 创建者
 * @returns {Promise<{id:number}>}
 */
export async function createPoll(data, userId) {
  const { question, options, selectionType, maxChoices, isAnonymous, closedAt } = data;

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

  return await db.transaction(async (tx) => {
    const [poll] = await tx
      .insert(polls)
      .values({
        topicId: null,
        createdBy: userId,
        question: question.trim(),
        selectionType,
        maxChoices: selectionType === 'multiple' ? maxChoices ?? null : null,
        isAnonymous: !!isAnonymous,
        closedAt: closedAt ?? null,
      })
      .returning({ id: polls.id });

    const rows = options.map((text, idx) => ({
      pollId: poll.id,
      text: String(text).slice(0, 500),
      displayOrder: idx,
      voteCount: 0,
    }));
    await tx.insert(pollOptions).values(rows);

    return { id: poll.id };
  });
}

/**
 * 获取投票详情（含选项 + 当前用户已投选项 + 是否过期）
 *
 * @param {number} pollId
 * @param {number|null} userId - 未登录传 null
 * @returns {Promise<object|null>} 不存在或关联话题已软删返回 null
 */
export async function getPoll(pollId, userId) {
  const [poll] = await db
    .select()
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);

  if (!poll) return null;

  // 校验关联 topic 未软删：spec §6.4
  if (poll.topicId) {
    const { topics } = await import('../db/schema.js');
    const [topic] = await db
      .select({ isDeleted: topics.isDeleted })
      .from(topics)
      .where(eq(topics.id, poll.topicId))
      .limit(1);
    if (!topic || topic.isDeleted) return null;
  }

  const options = await db
    .select({
      id: pollOptions.id,
      text: pollOptions.text,
      displayOrder: pollOptions.displayOrder,
      voteCount: pollOptions.voteCount,
    })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId))
    .orderBy(asc(pollOptions.displayOrder));

  let myVotedOptionIds = [];
  if (userId) {
    const myVotes = await db
      .select({ optionId: pollVotes.optionId })
      .from(pollVotes)
      .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId)));
    myVotedOptionIds = myVotes.map((v) => v.optionId);
  }

  const isClosed = !!poll.closedAt && new Date(poll.closedAt).getTime() <= Date.now();

  return {
    id: poll.id,
    topicId: poll.topicId,
    question: poll.question,
    selectionType: poll.selectionType,
    maxChoices: poll.maxChoices,
    isAnonymous: poll.isAnonymous,
    closedAt: poll.closedAt,
    isClosed,
    totalVoters: poll.totalVoters,
    options,
    myVotedOptionIds,
    createdAt: poll.createdAt,
    createdBy: poll.createdBy,
  };
}
```

- [ ] **Step 2: 启动 API 服务验证 import 无错**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

Expected: API 服务端控制台无 `Cannot find module` 或语法错误。看到 `[系统] 服务启动成功` 即可。`Ctrl+C` 停掉。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/pollService.js
git commit -m "$(cat <<'EOF'
feat(api): pollService 新增 createPoll 与 getPoll

createPoll 在事务里同时落 polls 与 poll_options 行。
getPoll 返回选项、当前用户已投项与 isClosed 计算结果，
并在关联话题被软删时返回 null。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: pollService — castVote 投票逻辑

**Files:**
- Modify: `apps/api/src/services/pollService.js`（追加 castVote 与 listVoters）

- [ ] **Step 1: 在 pollService.js 末尾追加两个方法**

```js
/**
 * 投票（事务 + UNIQUE 兜底）
 *
 * @param {number} pollId
 * @param {number} userId
 * @param {number[]} optionIds
 * @returns {Promise<{success:true}>}
 * @throws {Error & {statusCode: number}} 400 / 404 / 409
 */
export async function castVote(pollId, userId, optionIds) {
  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    throw Object.assign(new Error('请至少选择一项'), { statusCode: 400 });
  }
  const uniqueOptionIds = [...new Set(optionIds.map(Number))];
  if (uniqueOptionIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw Object.assign(new Error('optionIds 必须为正整数'), { statusCode: 400 });
  }

  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
  if (!poll) {
    throw Object.assign(new Error('投票不存在'), { statusCode: 404 });
  }
  if (poll.closedAt && new Date(poll.closedAt).getTime() <= Date.now()) {
    throw Object.assign(new Error('投票已结束'), { statusCode: 400 });
  }

  if (poll.selectionType === 'single' && uniqueOptionIds.length !== 1) {
    throw Object.assign(new Error('单选投票只能选择一项'), { statusCode: 400 });
  }
  if (poll.selectionType === 'multiple' && poll.maxChoices != null && uniqueOptionIds.length > poll.maxChoices) {
    throw Object.assign(new Error(`最多可选 ${poll.maxChoices} 项`), { statusCode: 400 });
  }

  // 校验所有 optionId 都属于该 poll
  const validOptions = await db
    .select({ id: pollOptions.id })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId));
  const validIdSet = new Set(validOptions.map((o) => o.id));
  if (uniqueOptionIds.some((id) => !validIdSet.has(id))) {
    throw Object.assign(new Error('选项不属于该投票'), { statusCode: 400 });
  }

  try {
    await db.transaction(async (tx) => {
      // 先尝试插入所有投票行；UNIQUE(pollId, userId, optionId) 兜底防重复
      const voteRows = uniqueOptionIds.map((optionId) => ({
        pollId,
        optionId,
        userId,
      }));
      await tx.insert(pollVotes).values(voteRows);

      // 增加每个选项的 voteCount
      for (const optionId of uniqueOptionIds) {
        await tx
          .update(pollOptions)
          .set({ voteCount: sql`${pollOptions.voteCount} + 1` })
          .where(eq(pollOptions.id, optionId));
      }

      // totalVoters +1（去重的人头数）
      await tx
        .update(polls)
        .set({ totalVoters: sql`${polls.totalVoters} + 1` })
        .where(eq(polls.id, pollId));
    });
    return { success: true };
  } catch (err) {
    // PG UNIQUE violation
    if (err.code === '23505') {
      throw Object.assign(new Error('您已投过票'), { statusCode: 409 });
    }
    throw err;
  }
}

/**
 * 列出某选项的投票者（仅非匿名投票）
 *
 * @param {number} pollId
 * @param {number} optionId
 * @param {{page?: number, limit?: number}} pagination
 * @returns {Promise<{voters: Array, total: number}>}
 * @throws {Error & {statusCode: number}} 403 匿名投票
 */
export async function listVoters(pollId, optionId, { page = 1, limit = 20 } = {}) {
  const [poll] = await db
    .select({ isAnonymous: polls.isAnonymous })
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);

  if (!poll) {
    throw Object.assign(new Error('投票不存在'), { statusCode: 404 });
  }
  if (poll.isAnonymous) {
    throw Object.assign(new Error('该投票为匿名，无法查看投票者'), { statusCode: 403 });
  }

  const { users } = await import('../db/schema.js');
  const offset = (Math.max(1, page) - 1) * limit;

  const rows = await db
    .select({
      userId: pollVotes.userId,
      username: users.username,
      name: users.name,
      avatar: users.avatar,
      votedAt: pollVotes.createdAt,
    })
    .from(pollVotes)
    .innerJoin(users, eq(users.id, pollVotes.userId))
    .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.optionId, optionId)))
    .orderBy(asc(pollVotes.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql`count(*)::int` })
    .from(pollVotes)
    .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.optionId, optionId)));

  return { voters: rows, total: count };
}
```

- [ ] **Step 2: 重启 dev 服务确认无语法错误**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

Expected: API 启动成功，无报错。`Ctrl+C` 停掉。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/pollService.js
git commit -m "$(cat <<'EOF'
feat(api): pollService 新增 castVote 与 listVoters

castVote 在事务里写 votes、加 voteCount、加 totalVoters；
PG UNIQUE 23505 兜底返回 409。匿名投票拒绝 listVoters。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: pollService — bindPollsToTopic 与 deletePoll

**Files:**
- Modify: `apps/api/src/services/pollService.js`

- [ ] **Step 1: 在文件头部 import 区追加 extractPollIds 引用**

修改 import 区，使其包含：

```js
import db from '../db/index.js';
import { polls, pollOptions, pollVotes } from '../db/schema.js';
import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { extractPollIds, stripPollDirectives } from '../utils/extractPollIds.js';
```

- [ ] **Step 2: 在文件末尾追加 bindPollsToTopic / deletePoll / cleanupOrphanPolls**

```js
/**
 * 把 markdown 正文里所有 ::poll{id="..."} 指令绑定到 topic。
 * 规则：
 *   - 只允许绑定 createdBy === userId 的 poll
 *   - 若 poll.topicId 已是当前 topicId → 跳过（编辑话题幂等）
 *   - 若 poll.topicId 为 null → UPDATE 为当前 topicId
 *   - 若 poll.topicId 是别的 → 视为盗用，删除该指令并不绑定
 *   - 校验失败的指令从 content 里剥离
 *
 * @param {number} topicId
 * @param {string} content - 原始 markdown
 * @param {number} userId - 话题作者 ID
 * @returns {Promise<string>} 清洗后的 content
 */
export async function bindPollsToTopic(topicId, content, userId) {
  const ids = extractPollIds(content);
  if (ids.length === 0) return content;

  // 字符串 id（前端传过来的）转 number；非法 id 直接进 invalid
  const numericIds = ids
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (numericIds.length === 0) {
    return stripPollDirectives(content, ids);
  }

  const rows = await db
    .select({
      id: polls.id,
      topicId: polls.topicId,
      createdBy: polls.createdBy,
    })
    .from(polls)
    .where(inArray(polls.id, numericIds));

  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const invalidIds = [];
  const toBindIds = [];

  for (const idStr of ids) {
    const idNum = Number(idStr);
    const row = rowsById.get(idNum);
    if (!row) {
      invalidIds.push(idStr);
      continue;
    }
    if (row.createdBy !== userId) {
      invalidIds.push(idStr);
      continue;
    }
    if (row.topicId == null) {
      toBindIds.push(idNum);
    } else if (row.topicId !== topicId) {
      invalidIds.push(idStr);
    }
    // else: 已绑定到本 topic，幂等跳过
  }

  if (toBindIds.length > 0) {
    await db
      .update(polls)
      .set({ topicId })
      .where(inArray(polls.id, toBindIds));
  }

  return invalidIds.length > 0 ? stripPollDirectives(content, invalidIds) : content;
}

/**
 * 删除投票（CASCADE 自动清掉 options 与 votes）
 *
 * @param {number} pollId
 */
export async function deletePoll(pollId) {
  await db.delete(polls).where(eq(polls.id, pollId));
}

/**
 * 清理孤儿投票：创建超过 30 分钟仍未绑定 topic 的 poll
 * 由 plugins/cleanup.js 调度
 *
 * @returns {Promise<number>} 清理的记录数
 */
export async function cleanupOrphanPolls() {
  const threshold = new Date(Date.now() - 30 * 60 * 1000);
  const result = await db
    .delete(polls)
    .where(and(isNull(polls.topicId), lt(polls.createdAt, threshold)));
  return result.rowCount ?? 0;
}
```

- [ ] **Step 3: 重启 dev 服务确认无错**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

Expected: 启动成功。`Ctrl+C` 停掉。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/pollService.js
git commit -m "$(cat <<'EOF'
feat(api): pollService 新增 bind/delete/cleanup

bindPollsToTopic 把正文里的 ::poll{id} 绑定到话题，并剥离
盗用或非法引用。cleanupOrphanPolls 删除 30 分钟未绑定的
孤儿投票，供 cleanup 插件调度。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: API 路由 — /api/polls 系列

**Files:**
- Create: `apps/api/src/routes/polls/index.js`

注意：`@fastify/autoload` 会自动把这个文件挂在 `/api/polls`，无需修改 `app.js` 或 `server.js`。

- [ ] **Step 1: 创建路由文件**

文件内容：

```js
import {
  createPoll,
  getPoll,
  castVote,
  listVoters,
  deletePoll,
} from '../../services/pollService.js';
import db from '../../db/index.js';
import { polls } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function pollRoutes(fastify, options) {
  // POST /polls — 创建投票
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['polls'],
        description: '创建投票（不绑定 topic，由后续话题提交时绑定）',
        security: [{ bearerAuth: [] }],
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
        response: {
          200: {
            type: 'object',
            properties: { id: { type: 'number' } },
          },
        },
      },
    },
    async (request, reply) => {
      await fastify.permission.check(request, 'topic.poll.create');
      try {
        const { closedAt, ...rest } = request.body;
        const result = await createPoll(
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

  // GET /polls/:id — 读取投票详情
  fastify.get(
    '/:id',
    {
      preHandler: [fastify.optionalAuth],
      schema: {
        tags: ['polls'],
        description: '获取投票详情',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'number' } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user?.id ?? null;
      const result = await getPoll(request.params.id, userId);
      if (!result) {
        return reply.code(404).send({ error: '投票不存在' });
      }
      return result;
    }
  );

  // POST /polls/:id/vote — 投票
  fastify.post(
    '/:id/vote',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['polls'],
        description: '提交投票',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'number' } },
        },
        body: {
          type: 'object',
          required: ['optionIds'],
          properties: {
            optionIds: {
              type: 'array',
              minItems: 1,
              items: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await castVote(
          request.params.id,
          request.user.id,
          request.body.optionIds
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

  // GET /polls/:id/voters — 列出某选项的投票者
  fastify.get(
    '/:id/voters',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['polls'],
        description: '获取某选项的投票者列表（仅非匿名）',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'number' } },
        },
        querystring: {
          type: 'object',
          required: ['optionId'],
          properties: {
            optionId: { type: 'number' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await listVoters(
          request.params.id,
          request.query.optionId,
          { page: request.query.page, limit: request.query.limit }
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

  // DELETE /polls/:id — 删除投票
  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['polls'],
        description: '删除投票',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'number' } },
        },
      },
    },
    async (request, reply) => {
      const [poll] = await db
        .select({ id: polls.id, createdBy: polls.createdBy })
        .from(polls)
        .where(eq(polls.id, request.params.id))
        .limit(1);

      if (!poll) {
        return reply.code(404).send({ error: '投票不存在' });
      }

      const hasDashboard = await fastify.permission.can(request, 'dashboard.polls');
      const isOwner = request.user.id === poll.createdBy;

      if (!hasDashboard) {
        if (!isOwner) {
          return reply.code(403).send({ error: '没有权限删除此投票' });
        }
        await fastify.permission.check(request, 'topic.poll.delete');
      }

      await deletePoll(request.params.id);
      return { success: true };
    }
  );
}
```

- [ ] **Step 2: 启动 API 并用 curl 探测路由存在**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

等到 API 打印 `服务启动成功`，另开终端：

```bash
curl -i http://127.0.0.1:7100/api/polls/99999
```

Expected: HTTP 404 with body `{"error":"投票不存在"}`。说明路由已挂载且 service 正常执行。

`Ctrl+C` 停 dev。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/polls/index.js
git commit -m "$(cat <<'EOF'
feat(api): 新增 /api/polls 路由（POST/GET/vote/voters/DELETE）

被 @fastify/autoload 自动挂载，无需手动注册。
错误用 statusCode 抛出，路由层统一转 HTTP 响应。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Topics 路由接入 bindPollsToTopic

**Files:**
- Modify: `apps/api/src/routes/topics/index.js`（POST `/topics` 与 PUT `/topics/:id`）

- [ ] **Step 1: 在文件 import 区追加引用**

打开 `apps/api/src/routes/topics/index.js`，找到顶部已有的 imports（约 1-25 行），在适当位置追加：

```js
import { bindPollsToTopic } from '../../services/pollService.js';
```

- [ ] **Step 2: 在 POST `/topics` 创建首贴之后插入绑定调用**

定位到第 962-973 行（创建首贴后）：

```js
      // 创建首贴
      const [firstPost] = await db
        .insert(posts)
        .values({
          topicId: newTopic.id,
          userId: request.user.id,
          content,
          rawContent: content,
          postNumber: 1,
          approvalStatus,
        })
        .returning();
```

把它替换为：

```js
      // 绑定正文里的 ::poll{id} 到本话题，剥离非法/盗用引用
      const cleanContent = await bindPollsToTopic(newTopic.id, content, request.user.id);

      // 创建首贴
      const [firstPost] = await db
        .insert(posts)
        .values({
          topicId: newTopic.id,
          userId: request.user.id,
          content: cleanContent,
          rawContent: cleanContent,
          postNumber: 1,
          approvalStatus,
        })
        .returning();
```

- [ ] **Step 3: 在 PUT `/topics/:id` 编辑话题处插入同样调用**

`apps/api/src/routes/topics/index.js` 里搜索 PUT 处理器（路径 `'/:id'`）。找到它处理 `content` 字段更新首贴的位置——通常是 `db.update(posts).set({ content, rawContent: content }).where(eq(posts.topicId, ...))` 这样的代码块。

读取定位：

```bash
grep -n "fastify.put\|update(posts)\|rawContent" /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api/src/routes/topics/index.js
```

确认 PUT 路由对应行号后，在 `db.update(posts).set(...)` 调用**之前**插入：

```js
      const cleanContent = await bindPollsToTopic(id, content, request.user.id);
```

并把后续 `set({ content, rawContent: content, ... })` 改为 `set({ content: cleanContent, rawContent: cleanContent, ... })`。

> ⚠️ 实施者注意：PUT 处理器内变量名可能是 `topicId` 或 `id`，按实际情况替换。如果 PUT 接口不支持修改正文（仅改标题/分类），则跳过本步，仅在 Step 2 调用即可。

- [ ] **Step 4: 重启服务**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

Expected: 启动无错。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/topics/index.js
git commit -m "$(cat <<'EOF'
feat(api): 话题创建与编辑时绑定 poll 引用并剥离非法引用

POST /topics 与 PUT /topics/:id 在写库前调用
bindPollsToTopic：合法引用回填 polls.topicId，
非创建者或已绑别 topic 的引用被剥离。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 注册孤儿 Poll 清理任务

**Files:**
- Modify: `apps/api/src/plugins/cleanup.js`

- [ ] **Step 1: 在 import 区追加 cleanupOrphanPolls 引用**

打开 `apps/api/src/plugins/cleanup.js`，在第 1-7 行的 imports 后追加：

```js
import { cleanupOrphanPolls } from '../services/pollService.js';
```

- [ ] **Step 2: 在现有 registerCleanupTask 调用列表末尾追加 orphan-polls 任务**

找到第 134-147 行的 `'moderation-logs-cleanup'` 任务注册之后、第 149 行 `setInterval` 之前的位置，插入：

```js
  // 5. 清理孤儿投票（创建超过 30 分钟未绑定 topic）
  registerCleanupTask('orphan-polls', async () => {
    return await cleanupOrphanPolls();
  });
```

- [ ] **Step 3: 重启服务确认插件注册成功**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

Expected: 日志中能看到 `[清理] 已注册任务: orphan-polls`（debug 级，需 dev 模式）或至少看到 `[清理] 插件已注册`。`Ctrl+C` 停。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/plugins/cleanup.js
git commit -m "$(cat <<'EOF'
feat(api): cleanup 插件注册 orphan-polls 任务

每 2 小时清理未绑定 topic 且创建超过 30 分钟的 poll。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: RBAC 权限点配置

**Files:**
- Modify: `apps/api/src/config/rbac.js`

- [ ] **Step 1: 在 SYSTEM_PERMISSIONS 数组末尾（或紧贴话题权限组之后）追加 3 个权限**

打开 `apps/api/src/config/rbac.js`，找到 `topic.close` 之后（约第 217 行）插入：

```js
  {
    slug: 'topic.poll.create',
    name: '创建投票',
    module: 'topic',
    action: 'poll.create',
    isSystem: true,
    conditions: [],
  },
  {
    slug: 'topic.poll.delete',
    name: '删除投票',
    module: 'topic',
    action: 'poll.delete',
    isSystem: true,
    conditions: [],
  },
```

并在 `dashboard.*` 权限组（在文件末尾附近搜索 `dashboard.users` 或 `dashboard.topics` 找位置）合适位置追加：

```js
  {
    slug: 'dashboard.polls',
    name: '后台管理投票',
    module: 'dashboard',
    action: 'polls',
    isSystem: true,
    conditions: [],
  },
```

- [ ] **Step 2: 把 `user` 角色的默认权限列表加入两项**

在第 540-555 行的 `user:` 数组里，在 `'topic.create', 'topic.read', 'topic.update', 'topic.delete',` 这一行下面追加：

```js
    'topic.poll.create', 'topic.poll.delete',
```

> 注意：`admin` 角色用 `['*']`，会自动包含所有 `SYSTEM_PERMISSIONS`，无需修改。`dashboard.polls` 自动归属 admin。

- [ ] **Step 3: 跑 seed 把新权限写入数据库**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/api && pnpm seed
```

Expected: 日志出现 `初始化权限...` 与"新增: 3"（或包含 3 项的增量）的统计。无报错。

- [ ] **Step 4: 在数据库里确认权限行已写入**

```bash
cd apps/api && pnpm db:studio
```

打开 `permissions` 表，搜索 slug 列：应看到 `topic.poll.create`、`topic.poll.delete`、`dashboard.polls` 三行。关闭。

或 psql：

```bash
psql $DATABASE_URL -c "SELECT slug FROM permissions WHERE slug LIKE '%poll%';"
```

Expected: 三行。

- [ ] **Step 5: Commit**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project
git add apps/api/src/config/rbac.js
git commit -m "$(cat <<'EOF'
feat(rbac): 新增 topic.poll.create / topic.poll.delete / dashboard.polls

普通用户默认有创建与删除（仅自己）投票的权限；
后台管理投票仅限 admin（通过 ['*'] 自动包含）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: PollDialog — 创建投票表单组件

**Files:**
- Create: `apps/web/src/components/topic/PollDialog.jsx`

- [ ] **Step 1: 创建组件文件**

```jsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
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
 * 投票创建对话框
 * 提交成功后调用 onCreated(pollId)，由调用方负责在编辑器插入 ::poll{id}
 */
export default function PollDialog({ open, onOpenChange, onCreated }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [selectionType, setSelectionType] = useState('single');
  const [maxChoices, setMaxChoices] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [durationDays, setDurationDays] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setQuestion('');
    setOptions(['', '']);
    setSelectionType('single');
    setMaxChoices('');
    setIsAnonymous(true);
    setDurationDays('');
  };

  const handleOpenChange = (next) => {
    if (!next) resetForm();
    onOpenChange?.(next);
  };

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

    let closedAt = null;
    if (durationDays !== '') {
      const days = Number(durationDays);
      if (Number.isFinite(days) && days > 0) {
        closedAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedQuestion,
          options: trimmedOptions,
          selectionType,
          maxChoices: parsedMaxChoices,
          isAnonymous,
          closedAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || '创建投票失败');
        return;
      }
      onCreated?.(data.id);
      handleOpenChange(false);
    } catch (err) {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>插入投票</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 问题 */}
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

          {/* 选项 */}
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

          {/* 类型 */}
          <div className="space-y-2">
            <Label>类型</Label>
            <RadioGroup
              value={selectionType}
              onValueChange={setSelectionType}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="poll-single" />
                <Label htmlFor="poll-single">单选</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="multiple" id="poll-multiple" />
                <Label htmlFor="poll-multiple">多选</Label>
              </div>
            </RadioGroup>
          </div>

          {/* 最大可选数（仅多选） */}
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

          {/* 截止时间 */}
          <div className="space-y-2">
            <Label htmlFor="poll-duration">截止时间</Label>
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

          {/* 匿名 */}
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              创建投票
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 确认 shadcn/ui 组件存在**

```bash
ls /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/web/src/components/ui/ | grep -E "dialog|radio-group|checkbox|label|input|button"
```

Expected: 至少看到 `dialog.jsx`、`button.jsx`、`input.jsx`、`label.jsx`、`checkbox.jsx`、`radio-group.jsx`。如果有缺失，根据现有 shadcn 模式补一个（或用 `pnpm dlx shadcn@latest add radio-group` 在 `apps/web` 内执行）。

- [ ] **Step 3: 启动 web 服务确认无编译错误**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

Expected: web 编译无错（控制台无 `Module not found`）。`Ctrl+C` 停。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/topic/PollDialog.jsx
git commit -m "$(cat <<'EOF'
feat(web): 新增 PollDialog 创建投票弹框

表单含问题、选项（2-20）、单/多选、最大可选数、
截止时间预设（永久/1/3/7/30 天）、匿名开关。
提交时调用 POST /api/polls 并回调 onCreated(pollId)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: 编辑器工具栏 — 插入投票按钮

**Files:**
- Create: `apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx`
- Modify: `apps/web/src/components/common/MarkdownEditor/tools/index.js`
- Modify: `apps/web/src/components/topic/TopicForm.jsx`

- [ ] **Step 1: 创建 PollTool 工具按钮**

`apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx`：

```jsx
'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PollDialog from '@/components/topic/PollDialog';

export function PollTool({ editor, disabled }) {
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
      <PollDialog open={open} onOpenChange={setOpen} onCreated={handleCreated} />
    </>
  );
}
```

- [ ] **Step 2: 注册到 ToolRegistry**

打开 `apps/web/src/components/common/MarkdownEditor/tools/index.js`，在 imports 区追加：

```js
import { PollTool } from './poll';
```

并在 ToolRegistry 对象里追加 `poll: PollTool,`（顺位放在 `protected` 之后）：

```js
export const ToolRegistry = {
  // 基础格式化
  bold: (props) => <FormatTool type="bold" {...props} />,
  italic: (props) => <FormatTool type="italic" {...props} />,
  strike: (props) => <FormatTool type="strike" {...props} />,
  code: (props) => <FormatTool type="code" {...props} />,
  codeBlock: (props) => <FormatTool type="codeBlock" {...props} />,
  quote: (props) => <FormatTool type="quote" {...props} />,
  bulletList: (props) => <FormatTool type="bulletList" {...props} />,
  orderedList: (props) => <FormatTool type="orderedList" {...props} />,
  checklist: (props) => <FormatTool type="checklist" {...props} />,
  horizontalRule: (props) => <FormatTool type="horizontalRule" {...props} />,

  // 复杂交互
  heading: HeadingTool,
  table: TableTool,
  link: LinkTool,
  video: VideoTool,
  audio: AudioTool,
  image: ImageTool,
  emoji: EmojiTool,
  protected: ProtectedTool,
  poll: PollTool,
};
```

- [ ] **Step 3: 把 `'poll'` 加入 TopicForm 工具栏**

打开 `apps/web/src/components/topic/TopicForm.jsx`，找到第 17-29 行的 `TOPIC_TOOLBAR`，把最后一个数组项的 `'protected', 'emoji'` 改为 `'protected', 'poll', 'emoji'`：

```js
const TOPIC_TOOLBAR = [
  'heading', '|',
  'bold', 'italic', 'strike',
  '|',
  'code', 'quote', 'codeBlock',
  '|',
  'bulletList', 'orderedList', 'checklist',
  '|',
  'horizontalRule',
  '|',
  'link', 'image', 'video', 'audio', 'table', 'protected', 'poll', 'emoji'
];
```

- [ ] **Step 4: 验证编辑器里出现"插入投票"按钮**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

浏览器打开 `http://localhost:3100/create`，登录后看话题创建页：

Expected:
- 工具栏在 `protected` 与 `emoji` 之间多了一个柱状图图标按钮，hover 显示"插入投票"。
- 点击该按钮 → 弹出 PollDialog；填写最小数据（问题 + 2 个选项）→ 点"创建投票" → toast 无报错 → 弹框关闭 → textarea 内插入了一行 `::poll{id="<某 ID>"}`。
- 切换"预览"模式 → 看到 PollWidget 占位组件（"投票组件 / ID: xxx / 选项 1/2/3 / 投票（等待后端实现）"）。

> 此时 PollWidget 仍是占位，Task 12 替换。

`Ctrl+C` 停 dev。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/MarkdownEditor/tools/poll/index.jsx \
        apps/web/src/components/common/MarkdownEditor/tools/index.js \
        apps/web/src/components/topic/TopicForm.jsx
git commit -m "$(cat <<'EOF'
feat(web): 编辑器工具栏新增'插入投票'按钮

PollTool 点击后弹 PollDialog，创建成功在光标处插入
::poll{id="<pollId>"} 块。已注册到 ToolRegistry 并加入
TOPIC_TOOLBAR。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: 改写 PollWidget — 真实数据 + 投票交互

**Files:**
- Modify（实质重写）: `apps/web/src/components/common/MarkdownRender/components/PollWidget.jsx`

- [ ] **Step 1: 检查依赖与 useAuth 实际路径**

```bash
grep -rn "import useSWR\|from 'swr'" /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/web/src --include="*.jsx" --include="*.js" | grep -v node_modules | grep -v .next | head -3
grep -rn "export.*useAuth\|function useAuth" /Users/wengqianshan/aiprojecthub/nodebbs/project/apps/web/src --include="*.jsx" --include="*.js" | grep -v node_modules | grep -v .next | head -3
```

记下 `useAuth` 的实际 import 路径（项目里通常是 `@/contexts/AuthContext` 或 `@/hooks/useAuth`）。在 Step 2 的代码里把 `import { useAuth } from '@/contexts/AuthContext';` 替换为实际路径。

如果项目里**确实没有** `useAuth`（极少见），临时在文件里加一个小 hook：

```jsx
import { useEffect, useState } from 'react';
function useAuth() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then(setUser).catch(() => {});
  }, []);
  return { user };
}
```

> 不要写成 `useAuth?.()`（违反 React Hooks 规则，必须无条件调用 hook）。

- [ ] **Step 2: 重写 PollWidget**

```jsx
'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Loader2, BarChart3, Lock, CheckCircle2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
// ⚠️ 按 Step 1 grep 出来的实际路径替换：
import { useAuth } from '@/contexts/AuthContext';

const fetcher = async (url) => {
  const res = await fetch(url);
  if (res.status === 404) {
    const err = new Error('not found');
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data?.error || '加载失败');
    err.status = res.status;
    throw err;
  }
  return res.json();
};

function VotersDialog({ pollId, optionId, optionText, open, onOpenChange }) {
  const { data, error, isLoading } = useSWR(
    open ? `/api/polls/${pollId}/voters?optionId=${optionId}&limit=100` : null,
    fetcher
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>投票者：{optionText}</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="py-4 text-sm text-muted-foreground">加载中…</div>}
        {error && <div className="py-4 text-sm text-destructive">加载失败</div>}
        {data && (
          <div className="max-h-80 overflow-y-auto space-y-1">
            {data.voters.length === 0 && (
              <div className="py-4 text-sm text-muted-foreground text-center">暂无投票者</div>
            )}
            {data.voters.map((v) => (
              <div key={v.userId} className="flex items-center gap-2 py-1 text-sm">
                <span className="font-medium">{v.name || v.username}</span>
                <span className="text-xs text-muted-foreground">@{v.username}</span>
              </div>
            ))}
            {data.total > data.voters.length && (
              <div className="pt-2 text-xs text-muted-foreground text-center">
                共 {data.total} 人，仅显示前 {data.voters.length} 名
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PollWidget({ pollId }) {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const { data: poll, error, isLoading, mutate } = useSWR(
    pollId ? `/api/polls/${pollId}` : null,
    fetcher
  );

  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [votersDialog, setVotersDialog] = useState(null); // { optionId, optionText } | null

  const hasVoted = (poll?.myVotedOptionIds?.length ?? 0) > 0;
  const isClosed = !!poll?.isClosed;
  const showResults = hasVoted || isClosed;

  const maxVotes = useMemo(() => {
    if (!poll) return 0;
    return Math.max(1, ...poll.options.map((o) => o.voteCount));
  }, [poll]);

  if (isLoading) {
    return (
      <div className="my-4 p-4 card-base animate-pulse">
        <div className="h-5 bg-muted rounded w-1/3 mb-3"></div>
        <div className="space-y-2">
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <div className="my-4 p-3 border border-muted rounded-lg bg-muted/30 text-muted-foreground text-sm flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        该投票已被删除
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-4 p-4 border border-destructive/30 rounded-lg bg-destructive/5 text-destructive text-sm">
        投票加载失败：{error.message}
      </div>
    );
  }

  if (!poll) return null;

  const toggleOption = (optionId) => {
    if (poll.selectionType === 'single') {
      setSelectedIds([optionId]);
      return;
    }
    setSelectedIds((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }
      if (poll.maxChoices && prev.length >= poll.maxChoices) {
        toast.error(`最多可选 ${poll.maxChoices} 项`);
        return prev;
      }
      return [...prev, optionId];
    });
  };

  const submit = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || '投票失败');
        return;
      }
      await mutate();
      setSelectedIds([]);
      toast.success('投票成功');
    } catch (err) {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="my-4 p-4 card-base">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span>{poll.question}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {poll.isAnonymous && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> 匿名</span>}
          {isClosed && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> 已结束</span>}
        </div>
      </div>

      {/* 选项区 */}
      <div className="space-y-2 mb-3">
        {poll.options.map((opt) => {
          const myVoted = poll.myVotedOptionIds?.includes(opt.id);
          const checked = selectedIds.includes(opt.id);
          const percent = poll.totalVoters > 0
            ? Math.round((opt.voteCount / Math.max(poll.totalVoters, 1)) * 100)
            : 0;
          const barWidth = maxVotes > 0 ? Math.round((opt.voteCount / maxVotes) * 100) : 0;

          if (showResults) {
            return (
              <div key={opt.id} className="relative border border-border rounded-lg p-3 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 transition-all ${myVoted ? 'bg-primary/15' : 'bg-muted'}`}
                  style={{ width: `${barWidth}%` }}
                />
                <div className="relative flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {myVoted && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    <span>{opt.text}</span>
                  </span>
                  <span className="flex items-center gap-3 text-muted-foreground tabular-nums">
                    <span>{opt.voteCount} 票 · {percent}%</span>
                    {!poll.isAnonymous && opt.voteCount > 0 && (
                      <button
                        type="button"
                        className="relative z-10 text-xs underline hover:text-foreground"
                        onClick={() => setVotersDialog({ optionId: opt.id, optionText: opt.text })}
                      >
                        查看 {opt.voteCount} 人
                      </button>
                    )}
                  </span>
                </div>
              </div>
            );
          }

          // 未投票 / 未截止：可选交互
          return (
            <label
              key={opt.id}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
              } ${!isLoggedIn ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <input
                type={poll.selectionType === 'single' ? 'radio' : 'checkbox'}
                name={`poll-${poll.id}`}
                disabled={!isLoggedIn || submitting}
                checked={checked}
                onChange={() => toggleOption(opt.id)}
                className="h-4 w-4"
              />
              <span className="flex-1">{opt.text}</span>
            </label>
          );
        })}
      </div>

      {/* 提交按钮 / 提示 */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="h-3 w-3" />
          {poll.totalVoters} 人已投票
        </div>
        {!showResults && (
          <Button
            type="button"
            size="sm"
            disabled={!isLoggedIn || selectedIds.length === 0 || submitting}
            onClick={submit}
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {isLoggedIn ? '提交' : '登录后投票'}
          </Button>
        )}
      </div>

      {votersDialog && (
        <VotersDialog
          pollId={pollId}
          optionId={votersDialog.optionId}
          optionText={votersDialog.optionText}
          open={!!votersDialog}
          onOpenChange={(v) => !v && setVotersDialog(null)}
        />
      )}
    </div>
  );
}
```

> 说明：上述 `import { useAuth } from '@/contexts/AuthContext';` 已在 Step 1 用 grep 校验过路径——按实际项目位置调整。

- [ ] **Step 3: 重启 web 服务，端到端验证**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

浏览器打开 `http://localhost:3100/create`：

1. 登录用户A → 用工具栏插入投票（单选 2 项，匿名，永久）→ 创建话题
2. 进入话题详情页 → 看到投票区，2 个选项，"提交"按钮初始 disabled
3. 选第一项 → "提交"按钮可点击 → 点提交 → toast"投票成功" → 选项变成结果条，第一项 100% / 1 票
4. 退出登录 → 同一话题页 → 选项区按钮显示"登录后投票"，无法操作
5. 登录用户B → 投第二项 → 看到每项 1 票 / 50% 各占

Expected: 全部通过。如有报错（如 401/403）回头检查 Step 9 权限是否写入 DB。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/common/MarkdownRender/components/PollWidget.jsx
git commit -m "$(cat <<'EOF'
feat(web): PollWidget 接入真实 API 与投票交互

替换原占位组件：用 SWR 拉 /api/polls/:id；按 hasVoted /
isClosed / 登录态切换 UI；结果条用 voteCount 与 totalVoters
计算百分比与柱宽，高亮自己投的项；非匿名投票结果旁可点
"查看 N 人"打开 VotersDialog。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: 端到端手动 QA

**Files:** 无变更（仅验证）

按 spec §9 走一遍。每项打勾。任何失败回到对应任务修复。

- [ ] **Step 1: 启动 dev**

```bash
cd /Users/wengqianshan/aiprojecthub/nodebbs/project && pnpm dev
```

- [ ] **Step 2: 单选投票计数正确**

用户 A 创建话题含单选投票（3 项）。A 投选项 1。退出。用户 B 登录投选项 2。
Expected：选项 1 票数 1，选项 2 票数 1，选项 3 票数 0；百分比 50/50/0。

- [ ] **Step 3: 多选 maxChoices 上限**

A 创建多选投票（4 项，maxChoices=2）。尝试勾选 3 项。
Expected：第 3 次勾选时 toast"最多可选 2 项"，不会提交。

- [ ] **Step 4: 重复投票拦截**

A 投票后刷新页面再次尝试用 devtools 手动 POST `/api/polls/<id>/vote`：

```bash
# 在浏览器 devtools console 里：
fetch('/api/polls/<id>/vote', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({optionIds:[<某id>]})}).then(r=>r.json()).then(console.log)
```

Expected：`{error: "您已投过票"}`，HTTP 409。

- [ ] **Step 5: 截止时间生效**

A 创建投票"截止 1 天"，然后用 psql 直接把 closedAt 改为过去：

```bash
psql $DATABASE_URL -c "UPDATE polls SET closed_at = NOW() - INTERVAL '1 minute' WHERE id = <id>;"
```

刷新页面 → 看到"已结束"角标，无提交按钮。

- [ ] **Step 6: 匿名拒绝 voters 接口**

A 创建匿名投票，B 投票。devtools 里 `fetch('/api/polls/<id>/voters?optionId=<某id>')`。

Expected：HTTP 403，`{error: "该投票为匿名，无法查看投票者"}`。

- [ ] **Step 6b: 非匿名 voters 链接可点开**

A 创建**非匿名**投票，B 投选项 1。在话题页（结果区）选项 1 右侧应出现"查看 1 人"按钮，点击 → 弹小窗显示 B 的用户名。

Expected：弹窗内列出 B；关闭后不影响投票状态。匿名投票时不应出现此按钮（Step 6 的话题里检查）。

- [ ] **Step 7: 孤儿清理**

A 在 PollDialog 里创建投票拿到 id，但**不发帖**直接关弹框、关浏览器。
psql 直接把 `created_at` 改成 31 分钟前：

```bash
psql $DATABASE_URL -c "UPDATE polls SET created_at = NOW() - INTERVAL '31 minutes' WHERE id = <orphanId>;"
```

手动触发清理（dev 里 setInterval 2 小时，所以临时 require/call 一下）：

```bash
cd apps/api && node -e "
import('./src/services/pollService.js').then(({ cleanupOrphanPolls }) =>
  cleanupOrphanPolls().then((n) => console.log('cleaned:', n))
);
"
```

Expected：`cleaned: 1`（或包含该 id 的数）。再去数据库查询确认 poll 行已不在。

- [ ] **Step 8: 盗用引用被剥离**

A 创建一个 poll 拿到 id（在话题里发出去）。B 新建话题，正文写 `::poll{id="<A 的 pollId>"}`。提交。
Expected：B 的话题正文里 `::poll` 行被剥离，预览页看不到投票区。

- [ ] **Step 9: 话题硬删 → 投票数据消失**

A 创建话题含投票，B 投票。A 后台或自己作为 owner 用 `permanent=true` 删除：

```bash
# 假设登录态 cookie 通过浏览器，用 devtools:
fetch('/api/topics/<id>?permanent=true', { method: 'DELETE' }).then(r=>r.json()).then(console.log)
```

确认数据库：

```bash
psql $DATABASE_URL -c "SELECT id FROM polls WHERE topic_id = <id>;"
```

Expected：0 行。

- [ ] **Step 10: 话题软删 → poll 隐藏**

A 创建话题含投票。A 软删（不带 `permanent`）。访问 `/api/polls/<id>`：
Expected：HTTP 404，前端 PollWidget 显示"该投票已被删除"。

- [ ] **Step 11: 删除投票 → 占位**

A 创建话题含投票。A 在 devtools 调 `fetch('/api/polls/<id>', { method: 'DELETE' })`，状态 200。返回话题页刷新。
Expected：PollWidget 处显示"该投票已被删除"占位。

- [ ] **Step 12: 未登录访问含投票的话题**

退出登录，访问含投票的话题。
Expected：看到选项区，但单选/多选 input disabled；底部按钮显示"登录后投票"且 disabled。

- [ ] **Step 13: admin 可删任意投票**

用 admin 账号登录（拥有 `dashboard.polls`），调 `fetch('/api/polls/<别人创建的id>', { method: 'DELETE' })`。
Expected：HTTP 200，投票被删除。

- [ ] **Step 14: 如全部通过 — 收尾**

不需要 commit，但可在 `docs/superpowers/specs/2026-05-20-topic-polls-design.md` 的 §9 测试要点处把方括号打成 `[x]` 留痕，再 commit：

```bash
git add docs/superpowers/specs/2026-05-20-topic-polls-design.md
git commit -m "docs(polls): 标记 v1 手动验收清单完成

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

完成。

---

## 收尾说明

- 本计划不包含 i18n、性能优化（大投票分页）、改票、增删选项等 v2+ 工作（见 spec §1.2 Out of Scope）。
- 后续可作为独立任务推进的有：列表显示密度切换、用户名/昵称敏感词强化、Footer `/about` 链接存在性判断、删除策略改进。各自独立 brainstorm → spec → plan。
- 若实施途中遇到与本计划描述不符的代码细节（如 PUT `/topics/:id` 实际不允许修改正文），按 spec 意图就近调整并在 PR 描述里记录差异；不要为对齐计划而增加无意义代码。
