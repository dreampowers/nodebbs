'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@uidotdev/usehooks';
import MultiSelect from '@/components/common/MultiSelect';
import { tagApi } from '@/lib/api';

/**
 * 标签异步搜索多选组件
 *
 * @param {string[]} value - 已选标签名数组
 * @param {(tags: string[]) => void} onChange - 更新回调
 * @param {number} maxTags - 最大标签数
 * @param {boolean} canCreateTag - 是否允许创建新标签
 */
export default function TagSelect({
  value = [],
  onChange,
  maxTags = 5,
  canCreateTag = false,
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const fetchTags = useCallback(async (query) => {
    setLoading(true);
    try {
      const res = await tagApi.getAll(query, 20);
      setOptions(
        (res.items || []).map((t) => ({ value: t.name, label: t.name }))
      );
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags(debouncedSearch);
  }, [debouncedSearch, fetchTags]);

  const handleCreate = canCreateTag
    ? (name) => {
        if (!value.includes(name)) {
          onChange([...value, name]);
        }
      }
    : undefined;

  return (
    <MultiSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder="搜索或选择标签..."
      searchPlaceholder="搜索标签..."
      onSearch={setSearch}
      loading={loading}
      maxCount={maxTags}
      onCreate={handleCreate}
    />
  );
}
