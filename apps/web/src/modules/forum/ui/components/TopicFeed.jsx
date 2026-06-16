'use client';

import { Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { Pager } from '@/components/common/Pagination';
import TopicCard from './TopicCard';

export default function TopicFeed({
  topics,
  totalTopics,
  currentPage,
  totalPages,
  limit,
  showPagination,
  onPageChange,
  itemInserts,
}) {
  const searchParams = useSearchParams();
  const sort = searchParams.get('sort') || 'latest';
  if (topics.length === 0) {
    return (
      <div className='py-12 text-center text-muted-foreground bg-card rounded-xl border border-border shadow-sm'>
        暂无话题
      </div>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-3'>
        {topics.map((topic, index) => (
          <Fragment key={topic.id}>
            <TopicCard topic={topic} sort={sort} />
            {itemInserts?.[index]}
          </Fragment>
        ))}
      </div>

      {showPagination && totalPages > 1 && (
        <div className='py-6 flex justify-center'>
          <Pager
            total={totalTopics}
            page={currentPage}
            pageSize={limit}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  );
}
