import Link from '@/components/common/Link';
import { Tag, BarChart3, Users, MessageSquare, MessageCircle } from 'lucide-react';
import { formatCompactNumber } from '@/utils/format';

// 分类列表组件
export function CategoryList({ categories, currentPath }) {
  const isActiveCategory = (categorySlug) => {
    return (
      currentPath === `/categories/${categorySlug}` ||
      currentPath?.startsWith(`/categories/${categorySlug}/`)
    );
  };

  return (
    <div className='card-base'>
      <div className='px-4 py-3 border-b border-border'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <Tag className='h-4 w-4' />
          分类
        </h3>
      </div>
      <div className='p-2'>
        {categories.length === 0 ? (
          <div className='px-2 py-8 text-center text-sm text-muted-foreground'>
            暂无分类
          </div>
        ) : (
          <div className='space-y-0.5'>
            {categories.map((category) => {
              const isActive = isActiveCategory(category.slug);
              return (
                <Link
                  key={category.id}
                  href={`/categories/${category.slug}`}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors group ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted/60'
                  }`}
                >
                  <div className='flex items-center gap-2.5 min-w-0'>
                    <span
                      aria-hidden='true'
                      className='w-2.5 h-2.5 rounded-sm shrink-0'
                      style={{ backgroundColor: category.color }}
                    />
                    <span className='truncate'>{category.name}</span>
                  </div>
                  <span className='text-xs tabular-nums text-muted-foreground/80 shrink-0'>
                    {category.topicCount || 0}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 统计信息组件
export function StatsPanel({ stats }) {
  const rows = [
    { icon: MessageSquare, label: '话题', value: stats.totalTopics },
    { icon: MessageCircle, label: '回复', value: stats.totalPosts },
    { icon: Users, label: '用户', value: stats.totalUsers },
  ];

  return (
    <div className='card-base'>
      <div className='px-4 py-3 border-b border-border'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <BarChart3 className='h-4 w-4' />
          统计
        </h3>
      </div>
      <div className='p-4 space-y-3'>
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className='flex items-center justify-between'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Icon className='h-4 w-4' />
              <span>{label}</span>
            </div>
            <span className='text-sm font-semibold tabular-nums'>
              {formatCompactNumber(value)}
            </span>
          </div>
        ))}
        <div className='flex items-center justify-between pt-3 border-t border-border'>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <span className='relative flex h-2 w-2 shrink-0'>
              <span className='absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 animate-ping' />
              <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
            </span>
            <span>在线</span>
          </div>
          <span className='text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'>
            {formatCompactNumber(stats.online?.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// 主 Sidebar 组件
export function SidebarContent({ categories, stats, currentPath }) {
  return (
    <div className='space-y-4'>
      <CategoryList categories={categories} currentPath={currentPath} />
      {stats ? <StatsPanel stats={stats} /> : null}
    </div>
  );
}
