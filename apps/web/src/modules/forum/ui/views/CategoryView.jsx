import { TopicList } from '@/modules/forum/components/topic/TopicList';
import { TopicSortTabs } from '@/modules/forum/components/topic/TopicSortTabs';
import SidebarLayout from '../layouts/SidebarLayout';
import TopicFeed from '../components/TopicFeed';

/**
 * 分类详情页
 */
export default function CategoryView({ category, sort, data, page, totalPages, limit }) {

  return (
    <SidebarLayout>
      <div>
        <div className='flex flex-col gap-2 mb-4 lg:flex-row lg:items-end lg:justify-between lg:gap-4'>
          <div>
            <div className='flex items-center gap-2'>
              <div
                className='w-3 h-3 rounded-sm shrink-0'
                style={{ backgroundColor: category.color }}
              />
              <h1 className='text-2xl font-bold text-foreground'>{category.name}</h1>
            </div>
            {category.description && (
              <p className='text-sm text-muted-foreground mt-1'>{category.description}</p>
            )}
          </div>
          <TopicSortTabs defaultValue={sort} className='w-auto' />
        </div>

        <TopicList
          initialData={data.items}
          total={data.total}
          currentPage={page}
          totalPages={totalPages}
          limit={limit}
          showPagination={true}
          useUrlPagination={true}
          component={TopicFeed}
        />
      </div>
    </SidebarLayout>
  );
}
