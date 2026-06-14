import db from '../../db/index.js';
import { topics, categories, tags } from '../../db/schema.js';
import { and, eq, gt, gte, lt, inArray, max, count } from 'drizzle-orm';
import { listPublishedPages } from '../../services/pageService.js';

// 计算「匿名访客（guest）可见」的分类 ID 集合：
// 非私有分类 ∩ guest 的 topic.read 可见分类。
// getAllowedCategories 返回 null 表示无 RBAC 限制（此时仅按 isPrivate 过滤）。
async function getPublicCategoryIds(fastify, request) {
  const allowed = await fastify.permission.getAllowedCategories(request, 'topic.read');
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isPrivate, false));
  let ids = rows.map((r) => r.id);
  if (Array.isArray(allowed)) {
    const allowedSet = new Set(allowed);
    ids = ids.filter((id) => allowedSet.has(id));
  }
  return ids;
}

function topicLastmod(t) {
  return t.lastPostAt || t.updatedAt || t.createdAt || null;
}

export default async function sitemapRoutes(fastify, options) {
  // 分片统计（仅公开话题）
  fastify.get(
    '/stats',
    {
      preHandler: [fastify.optionalAuth],
      schema: { tags: ['sitemap'], description: 'sitemap 分片统计（仅公开话题）' },
    },
    async (request) => {
      const categoryIds = await getPublicCategoryIds(fastify, request);
      if (categoryIds.length === 0) {
        return { topicCount: 0, maxTopicId: null };
      }
      const [row] = await db
        .select({ maxId: max(topics.id), total: count() })
        .from(topics)
        .where(
          and(
            eq(topics.isDeleted, false),
            eq(topics.approvalStatus, 'approved'),
            inArray(topics.categoryId, categoryIds),
          ),
        );
      return {
        topicCount: Number(row?.total || 0),
        maxTopicId: row?.maxId != null ? Number(row.maxId) : null,
      };
    },
  );

  // 话题分片：minId ≤ id < maxId 的公开话题
  fastify.get(
    '/topics',
    {
      preHandler: [fastify.optionalAuth],
      schema: {
        tags: ['sitemap'],
        description: 'sitemap 话题分片',
        querystring: {
          type: 'object',
          properties: {
            minId: { type: 'number', default: 0 },
            maxId: { type: 'number', default: 10000 },
          },
        },
      },
    },
    async (request) => {
      const { minId = 0, maxId = 10000 } = request.query;
      const categoryIds = await getPublicCategoryIds(fastify, request);
      if (categoryIds.length === 0) return { items: [] };
      const rows = await db
        .select({
          id: topics.id,
          lastPostAt: topics.lastPostAt,
          updatedAt: topics.updatedAt,
          createdAt: topics.createdAt,
        })
        .from(topics)
        .where(
          and(
            eq(topics.isDeleted, false),
            eq(topics.approvalStatus, 'approved'),
            inArray(topics.categoryId, categoryIds),
            gte(topics.id, minId),
            lt(topics.id, maxId),
          ),
        )
        .orderBy(topics.id);
      return { items: rows.map((t) => ({ id: t.id, lastmod: topicLastmod(t) })) };
    },
  );

  // 分类 / 标签 / 已发布页面（数量有界，合并进 core 子 sitemap）
  fastify.get(
    '/taxonomy',
    {
      preHandler: [fastify.optionalAuth],
      schema: { tags: ['sitemap'], description: 'sitemap 分类/标签/页面' },
    },
    async (request) => {
      const categoryIds = await getPublicCategoryIds(fastify, request);

      let categoryRows = [];
      if (categoryIds.length > 0) {
        categoryRows = await db
          .select({ slug: categories.slug, updatedAt: categories.updatedAt })
          .from(categories)
          .where(inArray(categories.id, categoryIds))
          .orderBy(categories.slug);
      }

      const tagRows = await db
        .select({ slug: tags.slug, updatedAt: tags.updatedAt })
        .from(tags)
        .where(gt(tags.topicCount, 0))
        .orderBy(tags.slug);

      const pageRows = await listPublishedPages();

      return {
        categories: categoryRows.map((c) => ({ slug: c.slug, lastmod: c.updatedAt || null })),
        tags: tagRows.map((t) => ({ slug: t.slug, lastmod: t.updatedAt || null })),
        pages: pageRows.map((p) => ({ slug: p.slug, lastmod: p.updatedAt || null })),
      };
    },
  );
}
