'use client';

import Link from 'next/link';
import { Home, ChartBarBig, MessageCircle, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import StickySidebar from '@/components/common/StickySidebar';

/**
 * 左侧导航
 * 首页 + 3 个主入口（全部版块 / 标签广场 / 排行榜）+ 动态分类
 * 桌面端（≥1024px）内联显示；移动端通过悬浮球 + 抽屉访问
 */
export default function NavSidebar({ categories = [] }) {
  const pathname = usePathname();

  // 导航项：首页 + 固定主入口 + 动态分类
  const navItems = [
    { href: '/', label: '首页', icon: Home },
    { href: '/categories', label: '全部版块', icon: MessageCircle },
    { href: '/tags', label: '标签广场', icon: Hash },
    { href: '/rank', label: '排行榜', icon: ChartBarBig },
    ...categories.map((cat) => ({
      href: `/categories/${cat.slug}`,
      label: cat.name,
      icon: Hash,
      color: cat.color,
    })),
  ];

  return (
    // hidden lg:block：移动端用 CSS 隐藏内联渲染，避免 SSR/hydration 时「出现→收起」闪现
    // self-stretch：PageLayout 是 items-start，需撑满高度才能让内部 sticky 生效
    <div className='hidden lg:block w-44 shrink-0 self-stretch'>
      <StickySidebar>
        <nav className='flex flex-col gap-3'>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors border-l-2',
                  isActive
                    ? 'border-primary text-foreground font-semibold'
                    : 'border-transparent text-foreground/60 hover:text-primary'
                )}
              >
                {/* 分类带颜色圆点 */}
                {item.color ? (
                  <span
                    className='w-3 h-3 rounded-full shrink-0'
                    style={{ backgroundColor: item.color }}
                  />
                ) : (
                  <Icon className='w-5 h-5 shrink-0' />
                )}
                <span className='truncate'>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </StickySidebar>
    </div>
  );
}
