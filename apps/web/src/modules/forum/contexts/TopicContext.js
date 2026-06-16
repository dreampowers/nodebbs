'use client';

import { createContext, useContext } from 'react';
import { useTopicDetail } from '@/modules/forum/hooks/topic/useTopicDetail';

const TopicContext = createContext(null);

export function TopicProvider({
  children,
  initialTopic,
  initialRewardStats,
  initialIsRewardEnabled,
  currentPage,
  limit,
}) {
  const topicLogic = useTopicDetail({
    initialTopic,
    initialRewardStats,
    initialIsRewardEnabled,
    currentPage,
    limit,
  });

  return (
    <TopicContext.Provider value={topicLogic}>
      {children}
    </TopicContext.Provider>
  );
}

export function useTopicContext() {
  const context = useContext(TopicContext);
  if (!context) {
    throw new Error('useTopicContext must be used within a TopicProvider');
  }
  return context;
}
