'use client';

import ErrorView from '@/components/common/ErrorView';

export default function RootErrorPage({ error, reset }) {
  return <ErrorView error={error} reset={reset} logLabel='[页面错误]' />;
}
