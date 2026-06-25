'use client';

import ErrorView from '@/components/common/ErrorView';

export default function TopicErrorPage({ error, reset }) {
  return (
    <ErrorView
      error={error}
      reset={reset}
      logLabel='[话题详情页错误]'
      title='加载失败'
      description='抱歉，话题加载时出现问题。这可能是网络问题或服务器暂时不可用。'
    />
  );
}
