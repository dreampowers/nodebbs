import { getTagsData } from '@/modules/forum/server';
import { TagsView } from '@/modules/forum/ui';

export const metadata = {
  title: '标签广场',
  description: '浏览社区中的所有话题标签',
};

export default async function TagsPage() {
  const tags = await getTagsData({ limit: 500 });

  return (
    <TagsView tags={tags} />
  );
}
