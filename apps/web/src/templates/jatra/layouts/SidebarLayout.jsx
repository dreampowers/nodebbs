import { getStatsData } from '@/lib/server/topics';
import { getApiInfo } from '@/lib/server/layout';
import { AdSlot } from '@/extensions/ads/components';
import RightSidebar from '../components/RightSidebar';

/**
 * Jatra SidebarLayout（服务端组件）
 * 负责右栏(stats/关于社区) + 主体横幅广告。
 * 列表型 View(Home/Category/Tag/Categories/Rank) 通过它接入默认右栏。
 * 详情/特殊 View(Topic/User/Tags/Search) 自行布局,不走本 layout。
 *
 * 用法:
 *   <SidebarLayout>                       → 默认右栏 + 侧栏广告
 *   <SidebarLayout rightSidebar={null}>   → 不显示右栏
 */
export default async function SidebarLayout({ children, rightSidebar }) {
  const [stats, apiInfo] = await Promise.all([
    getStatsData(),
    getApiInfo(),
  ]);

  // 如果没有指定自定义右侧栏，使用默认的 RightSidebar
  const sidebarContent = rightSidebar !== undefined
    ? rightSidebar
    : <RightSidebar stats={stats} version={apiInfo?.version} />;

  return (
    <div className='flex flex-col gap-6'>
      <AdSlot slotCode='home_header_banner' className='rounded-lg' />
      <div className='flex gap-6 items-start'>
        <main className='flex-1 min-w-0 flex flex-col gap-6'>
          {children}
        </main>

        {sidebarContent && (
          <aside className='hidden lg:flex flex-col w-64 shrink-0 sticky top-[var(--header-offset)] gap-4'>
            <AdSlot slotCode='home_sidebar_top' />
            {sidebarContent}
            <AdSlot slotCode='home_sidebar_bottom' />
          </aside>
        )}
      </div>
      <AdSlot slotCode='home_footer_banner' className='rounded-lg' />
    </div>
  );
}
