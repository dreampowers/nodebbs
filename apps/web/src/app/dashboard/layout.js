import StickySidebar from '@/components/common/StickySidebar';
import DashboardSidebar from '@/components/layout/DashboardSidebar';
import RequireAdmin from '@/components/auth/RequireAdmin';

export const metadata = {
  title: '管理后台',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }) {
  return (
    <div className='container mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12'>
      <RequireAdmin>
        <div className='flex lg:gap-6'>
          <div className='hidden lg:block w-64 shrink-0'>
            <StickySidebar>
              <DashboardSidebar />
            </StickySidebar>
          </div>

          <main className='flex-1 min-w-0'>{children}</main>
        </div>
      </RequireAdmin>
    </div>
  );
}
