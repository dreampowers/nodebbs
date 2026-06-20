import { getCategoriesTree } from '@/modules/forum/server';
import { CategoriesView } from '@/modules/forum/ui';

export const metadata = {
  title: '分类',
  description: '浏览所有话题分类，发现感兴趣的内容。',
};

export default async function CategoriesPage() {
  const categories = await getCategoriesTree();

  return (
    <CategoriesView categories={categories} />
  );
}
