'use client';

import Link from '@/components/common/Link';
import UserAvatar from '@/components/user/UserAvatar';
import Time from '@/components/common/Time';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Eye, Pin, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TopicCard({ topic, sort = 'latest' }) {
  const replyCount = Math.max((topic.postCount || 1) - 1, 0);
  const isPinned = topic.isPinned;

  // 根据排序模式决定显示时间
  const displayTime = sort === 'newest'
    ? topic.createdAt
    : topic.lastPostAt || topic.createdAt;

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-lg flex items-start gap-3 p-4 hover:shadow-md transition-shadow group relative',
        isPinned && 'bg-primary/5! dark:bg-primary/10! ring-1 ring-primary/10'
      )}
    >
      {/* 覆盖层链接：点击卡片跳转帖子详情 */}
      <Link href={`/topic/${topic.id}`} className='absolute inset-0 z-0'>
        <span className='sr-only'>查看帖子</span>
      </Link>

      {/* 用户头像：可独立点击跳转用户主页 */}
      <Link href={`/users/${topic.username}`} className='relative z-10 shrink-0 mt-0.5 hover:opacity-80 transition'>
        <UserAvatar
          url={topic.userAvatar}
          name={topic.userName || topic.username}
          size='sm'
          frameMetadata={topic.userAvatarFrame?.itemMetadata}
        />
      </Link>

      <div className='flex-1 min-w-0 relative z-10 pointer-events-none'>
        {/* 标题行：标记 + 标题 */}
        <div className='flex items-center gap-2'>
          {isPinned && (
            <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary shrink-0'>
              <Pin className='w-3 h-3' />
              置顶
            </span>
          )}
          {topic.isClosed && (
            <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground shrink-0'>
              <Lock className='w-3 h-3' />
              已关闭
            </span>
          )}
          {topic.approvalStatus === 'pending' && (
            <Badge
              variant='outline'
              className='text-chart-5 border-chart-5 text-[10px] h-4 shrink-0'
            >
              待审核
            </Badge>
          )}
          {topic.approvalStatus === 'rejected' && (
            <Badge
              variant='outline'
              className='text-destructive border-destructive text-[10px] h-4 shrink-0'
            >
              已拒绝
            </Badge>
          )}
          <h3 className={cn(
            'text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors',
            isPinned && 'font-bold'
          )}>
            {topic.title}
          </h3>
        </div>

        {/* 元信息行：用户名 / 分类 / 时间 */}
        <div className='flex items-center gap-2 mt-1 text-xs text-muted-foreground'>
          <Link
            href={`/users/${topic.username}`}
            className='text-foreground/70 font-medium hover:text-primary transition-colors pointer-events-auto'
          >
            {topic.userName || topic.username}
          </Link>
          {topic.categoryName && (
            <>
              <span className='text-border/60'>/</span>
              <Link
                href={`/categories/${topic.categorySlug}`}
                className='hover:text-primary transition-colors pointer-events-auto'
              >
                {topic.categoryName}
              </Link>
            </>
          )}
          <span className='text-border/60'>/</span>
          <Time date={displayTime} fromNow className='text-[11px]' />
        </div>
      </div>

      {/* 右侧统计 */}
      <div className='flex items-center gap-3 text-xs text-muted-foreground shrink-0 pt-0.5'>
        <span className='inline-flex items-center gap-0.5'>
          <MessageSquare className='w-3 h-3' />
          {replyCount}
        </span>
        {topic.viewCount > 0 && (
          <span className='hidden sm:inline-flex items-center gap-0.5'>
            <Eye className='w-3 h-3' />
            {topic.viewCount}
          </span>
        )}
      </div>
    </div>
  );
}
