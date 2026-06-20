import NavSidebar from '../components/NavSidebar';
import { getCategoriesData } from '@/modules/forum/server';

/**
 * PageLayout（服务端组件）
 * 所有页面共享的框架：左侧导航 + 内容容器
 * 右侧栏由各 View 通过 SidebarLayout 自行决定
 */
export default async function PageLayout({ children }) {
  const categories = await getCategoriesData({ isFeatured: true });

  return (
    <>
      {/* 三栏框架：左侧导航（桌面内联 / 移动端抽屉），右侧栏由各 View 自行决定 */}
      <div className='container mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 items-start pt-6 pb-12'>
        <NavSidebar categories={categories} />

        <div className='flex-1 min-w-0'>
          {children}
        </div>
      </div>
    </>
  );
}
