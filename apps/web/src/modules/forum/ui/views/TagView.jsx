import { TopicList } from '@/modules/forum/components/topic/TopicList';
import { TopicSortTabs } from '@/modules/forum/components/topic/TopicSortTabs';
import { Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import SidebarLayout from '../layouts/SidebarLayout';
import TopicFeed from '../components/TopicFeed';

/**
 * 标签详情页
 */
export default function TagView({ tag, sort, data, page, totalPages, limit }) {

  return (
    <SidebarLayout>
      <div>
        {/* 标签信息头部 */}
        <div className='bg-card border border-border rounded-lg p-5 mb-4'>
          <div className='flex items-start gap-4'>
            <div className='p-3 bg-primary/10 rounded-lg'>
              <Tag className='h-6 w-6 text-primary' />
            </div>
            <div>
              <h1 className='text-2xl font-bold flex items-center gap-3'>
                {tag.name}
                <Badge variant='secondary' className='text-sm font-normal'>
                  {data.total} 个话题
                </Badge>
              </h1>
              {tag.description && (
                <p className='mt-2 text-muted-foreground'>{tag.description}</p>
              )}
            </div>
          </div>
        </div>

        <div className='flex justify-end mb-4'>
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
