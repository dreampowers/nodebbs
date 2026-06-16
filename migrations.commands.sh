#!/usr/bin/env bash
# =============================================================================
# 数据库迁移命令清单（平台化重构 dev/platform）
#
# ⚠️ 本文件由重构过程累积写入，命令按顺序执行。请在重构完成、代码 review 后由你手动运行。
#    Claude 不会自动执行其中任何一条。
#
# 当前状态：
#   - 投票/抽奖确定为「论坛模块功能」，保持原 topicId/FK 不变（决策 A）。
#   - P2 schema 拆分：论坛表（categories/topics/posts/tags/topicTags/likes/bookmarks/
#     subscriptions/polls/pollOptions/pollVotes/lotteries/lotteryParticipants/lotteryLedgerRefs）
#     的【定义】已迁到 src/modules/forum/db/schema.js，core 的 src/db/schema.js 末尾 re-export 之。
#     这是【纯代码搬迁，表结构不变】——drizzle 不会因此产生表变更。
#   - 唯一的 DB 变更：notifications 表对 topics/posts 的两个外键约束被移除（解除 core→forum 耦合），
#     topic_id/post_id 改为普通整型列（值仍照常写入/查询）。
#     ⚠️ 副作用：失去「话题/帖子删除时级联删除相关通知」。孤儿通知指向已删内容时，
#        通知路由的 leftJoin 取到 null（前端按缺失处理）。如需可加定时清理。
#
# 运行目录：apps/api
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/apps/api"

# -----------------------------------------------------------------------------
# 标准迁移流程
# -----------------------------------------------------------------------------
# pnpm run db:generate      # 生成 SQL 迁移到 ./drizzle，人工 review
# pnpm run db:migrate       # 应用迁移
# pnpm run db:setup         # 自定义扩展/索引（pg_trgm 等，幂等）

# =============================================================================
# [P2] schema 拆分产生的迁移
#
# 预期 db:generate 只生成「移除 notifications 的两个外键约束」，不应有任何建表/删表/改列
# （论坛表只是换了定义文件，drizzle 看到的最终 schema 与原来一致）。
# 若 generate 产出了 DROP TABLE / CREATE TABLE 论坛表，说明哪里漏了 re-export，先别 migrate，回查。
#
# 预期生成的迁移等价于：
# psql "$DATABASE_URL" <<'SQL'
# ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_topic_id_topics_id_fk;
# ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_post_id_posts_id_fk;
# SQL
#
# 验证步骤（不改 DB，仅解析+对比）：
#   pnpm run db:generate     # 看 ./drizzle 下新 .sql 是否只含上面两条 DROP CONSTRAINT
#   # 确认无误后再 pnpm run db:migrate
# =============================================================================

