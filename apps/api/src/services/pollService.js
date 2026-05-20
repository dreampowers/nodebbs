import db from '../db/index.js';
import { polls, pollOptions, pollVotes, topics, users } from '../db/schema.js';
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
