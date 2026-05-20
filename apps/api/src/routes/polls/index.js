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
import db from '../../db/index.js';
import { polls, topics } from '../../db/schema.js';
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
      try {
        await fastify.permission.check(request, 'topic.poll.create');
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
        .select({ id: polls.id, userId: polls.userId })
        .from(polls)
        .where(eq(polls.id, request.params.id))
        .limit(1);

      if (!poll) {
        return reply.code(404).send({ error: '投票不存在' });
      }

      const hasDashboard = await fastify.permission.can(request, 'dashboard.polls');
      const isOwner = request.user.id === poll.userId;

      if (!hasDashboard) {
        if (!isOwner) {
          return reply.code(403).send({ error: '没有权限删除此投票' });
        }
        await fastify.permission.check(request, 'topic.poll.delete');
      }

      try {
        await deletePoll(request.params.id, { isAdmin: hasDashboard });
        return { success: true };
      } catch (err) {
        if (err.statusCode) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
}
