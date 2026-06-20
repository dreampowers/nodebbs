'use client';

import StickySidebar from '@/components/common/StickySidebar';
import { TopicProvider } from '@/modules/forum/contexts/TopicContext';
import { AdSlot } from '@/extensions/ads/components';
import TopicContent from '@/app/(main)/topic/[id]/components/TopicContent';
import ReplySection from '@/app/(main)/topic/[id]/components/ReplySection';
import TopicSidebar from '@/app/(main)/topic/[id]/components/TopicSidebar';

/**
 * 话题详情页（客户端组件）
 * 自行管理布局：内容区 + TopicSidebar
 * 左侧栏由 PageLayout 提供
 */
export default function TopicView({
  topic: initialTopic,
  initialPosts,
  totalPosts,
  totalPages,
  currentPage,
  limit,
  initialRewardStats = {},
  initialIsRewardEnabled = false,
}) {
  return (
    <TopicProvider
      initialTopic={initialTopic}
      initialRewardStats={initialRewardStats}
      initialIsRewardEnabled={initialIsRewardEnabled}
      currentPage={currentPage}
      limit={limit}
    >
      <div className='flex gap-6 w-full'>
        {/* 主内容区 */}
        <div className='flex-1 min-w-0'>
          <AdSlot slotCode='topic_detail_top' className='mb-4 rounded-lg' />
          <TopicContent />
          <ReplySection
            initialPosts={initialPosts}
            totalPosts={totalPosts}
            totalPages={totalPages}
            currentPage={currentPage}
            limit={limit}
          />
          <AdSlot slotCode='topic_detail_bottom' className='mt-4 rounded-lg' />
        </div>

        {/* 话题专属右侧栏 */}
        <div className='hidden lg:block w-64 shrink-0'>
          <StickySidebar className='space-y-4'>
            <AdSlot slotCode='topic_sidebar_top' />
            <TopicSidebar />
            <AdSlot slotCode='topic_sidebar_bottom' />
          </StickySidebar>
        </div>
      </div>
    </TopicProvider>
  );
}
