'use client';

import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/common/Loading';
import UserSidebar from '@/app/(main)/users/[id]/components/UserSidebar';
import UserActivityTabs from '@/app/(main)/users/[id]/components/UserActivityTabs';
import { useUserProfile } from '@/hooks/user/useUserProfile';

/**
 * 用户主页（客户端组件）
 * 不使用右侧栏，直接自上而下布局
 * 左侧栏由 PageLayout 提供
 */
export default function UserView({
  user,
  initialTab,
  initialTopics,
  initialPosts,
  topicsTotal,
  postsTotal,
  currentPage,
  limit,
}) {
  const {
    canViewContent,
    accessMessage,
    needsAuthCheck,
    authLoading,
    openLoginDialog,
  } = useUserProfile({
    user,
    initialFollowerCount: user.followerCount,
    initialFollowingCount: user.followingCount,
    initialIsFollowing: user.isFollowing,
  });

  const renderContent = () => {
    if (!needsAuthCheck) {
      return (
        <UserActivityTabs
          userId={user.id}
          initialTab={initialTab}
          initialTopics={initialTopics}
          initialPosts={initialPosts}
          topicsTotal={topicsTotal}
          postsTotal={postsTotal}
          currentPage={currentPage}
          limit={limit}
        />
      );
    }

    if (authLoading) {
      return <Loading className='py-12' />;
    }

    if (canViewContent) {
      return (
        <UserActivityTabs
          userId={user.id}
          initialTab={initialTab}
          initialTopics={initialTopics}
          initialPosts={initialPosts}
          topicsTotal={topicsTotal}
          postsTotal={postsTotal}
          currentPage={currentPage}
          limit={limit}
        />
      );
    }

    return (
      <div className='forum-card p-8 text-center'>
        <Lock className='h-12 w-12 text-muted-foreground/50 mx-auto mb-4' />
        <h3 className='text-lg font-semibold text-foreground mb-2'>
          {accessMessage?.title}
        </h3>
        <p className='text-sm text-muted-foreground mb-4'>
          {accessMessage?.description}
        </p>
        {accessMessage?.showLoginButton && (
          <Button onClick={openLoginDialog}>登录查看</Button>
        )}
      </div>
    );
  };

  return (
    <div className='flex flex-col lg:flex-row gap-4'>
      <UserSidebar user={user} />
      {renderContent()}
    </div>
  );
}
