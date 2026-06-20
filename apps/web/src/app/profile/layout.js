import ProfileSidebar from '@/components/layout/ProfileSidebar';
import RequireAuth from '@/components/auth/RequireAuth';
import StickySidebar from '@/components/common/StickySidebar';

export const metadata = {
  title: '个人中心',
  description: '管理你的话题和个人设置',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileLayout({ children }) {
  return (
    <RequireAuth>
      <div className='container mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12'>
        <div className='flex lg:gap-6'>
          <div className='hidden lg:block w-64 shrink-0'>
            <StickySidebar>
              <ProfileSidebar />
            </StickySidebar>
          </div>

          <main className='flex-1 min-w-0'>{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}
