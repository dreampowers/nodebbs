import db from '../../db/index.js';
import {
  conversations,
  messages,
  users,
  blockedUsers,
  follows,
} from '../../db/schema.js';
import { eq, sql, desc, and, or, lt, count } from 'drizzle-orm';
import { createPaginator } from '../../utils/pagination.js';

/**
 * 获取或创建两个用户之间的会话
 * user1Id 始终为较小的 userId，user2Id 为较大的
 */
async function findOrCreateConversation(userAId, userBId) {
  const user1Id = Math.min(userAId, userBId);
  const user2Id = Math.max(userAId, userBId);

  // INSERT ... ON CONFLICT 保证并发安全
  const [row] = await db
    .insert(conversations)
    .values({ user1Id, user2Id })
    .onConflictDoUpdate({
      target: [conversations.user1Id, conversations.user2Id],
      set: { updatedAt: new Date() },
    })
    .returning();

  return row;
}

/**
 * 判断当前用户在会话中是 user1 还是 user2
 */
function getUserPosition(conversation, currentUserId) {
  return conversation.user1Id === currentUserId ? 1 : 2;
}

export default async function conversationRoutes(fastify) {
  // ============ GET / — 会话列表 ============
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['conversations'],
        description: '获取会话列表（含最新消息、未读数）',
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
    async (request) => {
      const { page = 1, limit = 20 } = request.query;
      const offset = (page - 1) * limit;
      const currentUserId = request.user.id;

      // 查询当前用户参与的会话（未被当前用户删除的）
      const otherUser = sql`CASE
        WHEN ${conversations.user1Id} = ${currentUserId} THEN ${conversations.user2Id}
        ELSE ${conversations.user1Id}
      END`;

      const unreadCount = sql`CASE
        WHEN ${conversations.user1Id} = ${currentUserId} THEN ${conversations.user1UnreadCount}
        ELSE ${conversations.user2UnreadCount}
      END`;

      const isDeletedByMe = sql`CASE
        WHEN ${conversations.user1Id} = ${currentUserId} THEN ${conversations.isDeletedByUser1}
        ELSE ${conversations.isDeletedByUser2}
      END`;

      const rows = await db
        .select({
          id: conversations.id,
          user1Id: conversations.user1Id,
          user2Id: conversations.user2Id,
          lastMessageAt: conversations.lastMessageAt,
          unreadCount,
          // 对方用户信息
          otherUserId: users.id,
          otherUsername: users.username,
          otherName: users.name,
          otherAvatar: users.avatar,
          // 最新消息
          lastMessageId: messages.id,
          lastMessageContent: messages.content,
          lastMessageSenderId: messages.senderId,
          lastMessageIsRead: messages.isRead,
          lastMessageCreatedAt: messages.createdAt,
        })
        .from(conversations)
        .innerJoin(users, eq(users.id, otherUser))
        .leftJoin(messages, eq(messages.id, conversations.lastMessageId))
        .where(
          and(
            or(
              eq(conversations.user1Id, currentUserId),
              eq(conversations.user2Id, currentUserId)
            ),
            eq(isDeletedByMe, false),
            sql`${conversations.lastMessageId} IS NOT NULL`
          )
        )
        .orderBy(desc(conversations.lastMessageAt))
        .limit(limit)
        .offset(offset);

      // 总数
      const [{ count: total }] = await db
        .select({ count: count() })
        .from(conversations)
        .where(
          and(
            or(
              eq(conversations.user1Id, currentUserId),
              eq(conversations.user2Id, currentUserId)
            ),
            eq(isDeletedByMe, false),
            sql`${conversations.lastMessageId} IS NOT NULL`
          )
        );

      const items = rows.map((row) => ({
        user: {
          id: row.otherUserId,
          username: row.otherUsername,
          name: row.otherName,
          avatar: row.otherAvatar,
        },
        latestMessage: row.lastMessageId
          ? {
              id: row.lastMessageId,
              content: row.lastMessageContent,
              isRead: row.lastMessageIsRead,
              isSentByMe: row.lastMessageSenderId === currentUserId,
              createdAt: row.lastMessageCreatedAt,
            }
          : null,
        unreadCount: Number(row.unreadCount),
      }));

      return { items, page, limit, total: Number(total) };
    }
  );

  // ============ GET /unread-count — 未读总数 ============
  fastify.get(
    '/unread-count',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['conversations'],
        description: '获取未读消息总数',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
      const currentUserId = request.user.id;

      const [result] = await db
        .select({
          count: sql`
            COALESCE(SUM(
              CASE
                WHEN ${conversations.user1Id} = ${currentUserId} THEN ${conversations.user1UnreadCount}
                ELSE ${conversations.user2UnreadCount}
              END
            ), 0)
          `.as('count'),
        })
        .from(conversations)
        .where(
          or(
            eq(conversations.user1Id, currentUserId),
            eq(conversations.user2Id, currentUserId)
          )
        );

      return { count: Number(result.count) };
    }
  );

  // ============ GET /:userId — 与某用户的消息记录 ============
  fastify.get(
    '/:userId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['conversations'],
        description: '获取与特定用户的消息记录（cursor 分页）',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'number' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 20, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const currentUserId = request.user.id;
      const paginator = createPaginator(request.query, {
        cursorKeys: ['createdAt', 'id'],
      });

      // cursorData 为 null 说明是首次请求（cursor=1 解码失败）
      const isFirstPage = !paginator.cursorData;

      // 仅首次请求时查询对方用户信息
      let otherUser = null;
      if (isFirstPage) {
        const [found] = await db
          .select({
            id: users.id,
            username: users.username,
            name: users.name,
            avatar: users.avatar,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!found) {
          return reply.code(404).send({ error: '用户不存在' });
        }
        otherUser = found;
      }

      // 查找会话
      const user1Id = Math.min(currentUserId, userId);
      const user2Id = Math.max(currentUserId, userId);

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.user1Id, user1Id),
            eq(conversations.user2Id, user2Id)
          )
        )
        .limit(1);

      // 无会话记录，返回空
      if (!conversation) {
        return {
          ...(isFirstPage ? { otherUser } : {}),
          items: [],
          page: paginator.page,
          limit: paginator.limit,
          ...(isFirstPage ? { total: 0 } : {}),
          nextCursor: undefined,
        };
      }

      // 构建消息查询条件
      const baseCondition = and(
        eq(messages.conversationId, conversation.id),
        or(
          and(
            eq(messages.senderId, currentUserId),
            eq(messages.isDeletedBySender, false)
          ),
          and(
            eq(messages.recipientId, currentUserId),
            eq(messages.isDeletedByRecipient, false)
          )
        )
      );

      // Cursor 分页条件
      let cursorCondition = null;
      if (paginator.hasCursor && paginator.cursorData) {
        const cData = paginator.cursorData;
        if (cData.id !== undefined && cData.createdAt) {
          cursorCondition = or(
            lt(messages.createdAt, new Date(cData.createdAt)),
            and(
              eq(messages.createdAt, new Date(cData.createdAt)),
              lt(messages.id, cData.id)
            )
          );
        }
      }

      const whereCondition = cursorCondition
        ? and(baseCondition, cursorCondition)
        : baseCondition;

      const rows = await db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          recipientId: messages.recipientId,
          content: messages.content,
          isRead: messages.isRead,
          readAt: messages.readAt,
          createdAt: messages.createdAt,
          senderUsername: users.username,
          senderName: users.name,
          senderAvatar: users.avatar,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(whereCondition)
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(paginator.fetchSize)
        .offset(paginator.offset);

      const { items, nextCursor } = paginator.paginate(rows);

      // 构建响应
      const response = {
        items,
        limit: paginator.limit,
        nextCursor: nextCursor || undefined,
      };

      // 仅首次请求时：返回 otherUser，并标记已读
      if (isFirstPage) {
        response.otherUser = otherUser;

        // 标记已读 + 重置未读数（仅首次进入时执行一次）
        const pos = getUserPosition(conversation, currentUserId);
        await db.transaction(async (tx) => {
          await tx
            .update(messages)
            .set({ isRead: true, readAt: new Date() })
            .where(
              and(
                eq(messages.conversationId, conversation.id),
                eq(messages.recipientId, currentUserId),
                eq(messages.isRead, false)
              )
            );
          const unreadUpdate =
            pos === 1
              ? { user1UnreadCount: 0 }
              : { user2UnreadCount: 0 };
          await tx
            .update(conversations)
            .set(unreadUpdate)
            .where(eq(conversations.id, conversation.id));
        });
      }

      return response;
    }
  );

  // ============ POST /:userId — 发送消息 ============
  fastify.post(
    '/:userId',
    {
      preHandler: [fastify.authenticate, fastify.requireEmailVerification],
      schema: {
        tags: ['conversations'],
        description: '向指定用户发送消息（自动创建会话）',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'number' },
          },
        },
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const recipientId = request.params.userId;
      const { content } = request.body;
      const currentUserId = request.user.id;

      // 不能给自己发消息
      if (recipientId === currentUserId) {
        return reply.code(400).send({ error: '不能给自己发消息' });
      }

      // 检查接收者是否存在并读取其设置
      const [recipient] = await db
        .select({
          id: users.id,
          username: users.username,
          messagePermission: users.messagePermission,
        })
        .from(users)
        .where(eq(users.id, recipientId))
        .limit(1);

      if (!recipient) {
        return reply.code(404).send({ error: '收件人不存在' });
      }

      // 检查接收者的消息权限
      const recipientPermission = recipient.messagePermission || 'everyone';

      if (recipientPermission === 'disabled') {
        return reply.code(403).send({ error: '该用户已禁用站内信功能' });
      }

      if (recipientPermission === 'followers') {
        const [followRelation] = await db
          .select()
          .from(follows)
          .where(
            and(
              eq(follows.followerId, currentUserId),
              eq(follows.followingId, recipientId)
            )
          )
          .limit(1);

        if (!followRelation) {
          return reply
            .code(403)
            .send({ error: '该用户只接收关注者的站内信' });
        }
      }

      // 检查当前用户是否禁用私信
      const [currentUser] = await db
        .select({ messagePermission: users.messagePermission })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      if ((currentUser.messagePermission || 'everyone') === 'disabled') {
        return reply.code(403).send({
          error: '你已禁用站内信功能，请在设置中启用后再发送消息',
        });
      }

      // 检查双方是否存在拉黑关系
      const [blockRelation] = await db
        .select()
        .from(blockedUsers)
        .where(
          or(
            and(
              eq(blockedUsers.userId, currentUserId),
              eq(blockedUsers.blockedUserId, recipientId)
            ),
            and(
              eq(blockedUsers.userId, recipientId),
              eq(blockedUsers.blockedUserId, currentUserId)
            )
          )
        )
        .limit(1);

      if (blockRelation) {
        if (blockRelation.userId === currentUserId) {
          return reply.code(403).send({ error: '你已拉黑该用户' });
        } else {
          return reply.code(403).send({ error: '你不能给该用户发消息' });
        }
      }

      // 查找或创建会话
      const conversation = await findOrCreateConversation(
        currentUserId,
        recipientId
      );
      const pos = getUserPosition(conversation, currentUserId);
      const otherPos = pos === 1 ? 2 : 1;

      // 插入消息 + 更新会话（事务）
      const newMessage = await db.transaction(async (tx) => {
        const [msg] = await tx
          .insert(messages)
          .values({
            conversationId: conversation.id,
            senderId: currentUserId,
            recipientId,
            content,
          })
          .returning();

        // 单次 UPDATE：恢复双方删除标记 + 更新 lastMessage + 对方 unreadCount += 1
        const unreadIncrement =
          otherPos === 1
            ? {
                user1UnreadCount: sql`${conversations.user1UnreadCount} + 1`,
              }
            : {
                user2UnreadCount: sql`${conversations.user2UnreadCount} + 1`,
              };

        await tx
          .update(conversations)
          .set({
            lastMessageId: msg.id,
            lastMessageAt: msg.createdAt,
            isDeletedByUser1: false,
            isDeletedByUser2: false,
            ...unreadIncrement,
          })
          .where(eq(conversations.id, conversation.id));

        return msg;
      });

      // 发送通知
      await fastify.notification.send({
        userId: recipientId,
        type: 'message',
        triggeredByUserId: currentUserId,
        message: `${request.user.username} 给你发送了一条新消息`,
        metadata: {
          messageId: newMessage.id,
        },
      });

      return newMessage;
    }
  );

  // ============ POST /:userId/read — 标记会话已读 ============
  fastify.post(
    '/:userId/read',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['conversations'],
        description: '标记与指定用户的会话所有消息已读',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const currentUserId = request.user.id;

      const user1Id = Math.min(currentUserId, userId);
      const user2Id = Math.max(currentUserId, userId);

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.user1Id, user1Id),
            eq(conversations.user2Id, user2Id)
          )
        )
        .limit(1);

      if (!conversation) {
        return reply.code(404).send({ error: '会话不存在' });
      }

      // 批量标记已读 + 重置未读数（事务）
      const pos = getUserPosition(conversation, currentUserId);
      await db.transaction(async (tx) => {
        await tx
          .update(messages)
          .set({ isRead: true, readAt: new Date() })
          .where(
            and(
              eq(messages.conversationId, conversation.id),
              eq(messages.recipientId, currentUserId),
              eq(messages.isRead, false)
            )
          );

        const unreadUpdate =
          pos === 1
            ? { user1UnreadCount: 0 }
            : { user2UnreadCount: 0 };

        await tx
          .update(conversations)
          .set(unreadUpdate)
          .where(eq(conversations.id, conversation.id));
      });

      return { success: true };
    }
  );

  // ============ DELETE /:userId — 删除与某用户的会话 ============
  fastify.delete(
    '/:userId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['conversations'],
        description: '删除与指定用户的会话',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const currentUserId = request.user.id;

      const user1Id = Math.min(currentUserId, userId);
      const user2Id = Math.max(currentUserId, userId);

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.user1Id, user1Id),
            eq(conversations.user2Id, user2Id)
          )
        )
        .limit(1);

      if (!conversation) {
        return reply.code(404).send({ error: '会话不存在' });
      }

      const pos = getUserPosition(conversation, currentUserId);

      // 标记会话已删除 + 软删除消息（事务）
      await db.transaction(async (tx) => {
        const deleteUpdate =
          pos === 1
            ? { isDeletedByUser1: true, user1UnreadCount: 0 }
            : { isDeletedByUser2: true, user2UnreadCount: 0 };

        await tx
          .update(conversations)
          .set(deleteUpdate)
          .where(eq(conversations.id, conversation.id));

        // 软删除当前用户在此会话中的消息
        await tx
          .update(messages)
          .set({ isDeletedBySender: true })
          .where(
            and(
              eq(messages.conversationId, conversation.id),
              eq(messages.senderId, currentUserId)
            )
          );

        await tx
          .update(messages)
          .set({ isDeletedByRecipient: true })
          .where(
            and(
              eq(messages.conversationId, conversation.id),
              eq(messages.recipientId, currentUserId)
            )
          );
      });

      return { message: 'Conversation deleted successfully' };
    }
  );

  // ============ DELETE /messages/:id — 删除单条消息 ============
  fastify.delete(
    '/messages/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['conversations'],
        description: '删除单条消息（软删除）',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.code(404).send({ error: '消息不存在' });
      }

      if (
        message.senderId !== request.user.id &&
        message.recipientId !== request.user.id
      ) {
        return reply
          .code(403)
          .send({ error: '你没有权限删除该消息' });
      }

      const updates = {};
      if (message.senderId === request.user.id) {
        updates.isDeletedBySender = true;
      }
      if (message.recipientId === request.user.id) {
        updates.isDeletedByRecipient = true;
      }

      await db.update(messages).set(updates).where(eq(messages.id, id));

      return { message: 'Message deleted successfully' };
    }
  );
}
