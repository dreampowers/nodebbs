'use client';

import { useSearch } from '@/hooks/useSearch';
import { SearchContent } from '@/app/(main)/search/components/SearchContent';

/**
 * 搜索结果页（客户端组件）
 * 左侧栏由 PageLayout 提供
 */
export default function SearchView() {
  const {
    searchQuery,
    searchType,
    setSearchType,
    loading,
    searchResults,
    loadTypePage,
  } = useSearch();

  return (
    <div>
      <SearchContent
        searchQuery={searchQuery}
        searchType={searchType}
        onSearchTypeChange={setSearchType}
        loading={loading}
        searchResults={searchResults}
        onLoadPage={loadTypePage}
      />
    </div>
  );
}
