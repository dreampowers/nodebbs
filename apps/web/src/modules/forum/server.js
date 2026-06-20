import { cache } from 'react';
import { request } from '@/lib/server/api';

/**
 * 论坛模块服务端数据获取。
 *
 * 从 lib/server/topics.js 拆出（话题/分类/帖子/标签/统计 + 分类树组装）。
 * 复用底座的 request 传输层（lib/server/api.js）；本文件只编码 forum 领域端点与逻辑。
 * 注：打赏相关（getRewardStats / getRewardEnabledStatus）属 rewards 扩展，已移至
 * '@/extensions/rewards/server'。
 */

/**
 * 服务端获取话题列表数据
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.limit - 每页数量
 * @param {string} params.sort - 排序方式
 * @param {string} params.categoryId - 分类ID
 * @param {string} params.tag - 标签
 * @param {string} params.status - 状态
 * @returns {Promise<Object>} 话题列表数据
 */
export async function getTopicsData(params = {}) {
  const {
    page = 1,
    limit = 20,
    sort = 'latest',
    categoryId,
    tag,
    status,
  } = params;

  try {
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sort,
    });

    if (categoryId) {
      queryParams.set('categoryId', categoryId);
    }

    if (tag) {
      queryParams.set('tag', tag);
    }

    if (status) {
      queryParams.set('status', status);
    }

    const data = await request(`/topics?${queryParams}`);

    return data || { items: [], total: 0, limit: 20 };
  } catch (error) {
    console.error('Error fetching topics:', error);
    return { items: [], total: 0, limit: 20 };
  }
}

/**
 * 服务端获取所有分类
 * @param {Object} params - 查询参数
 * @param {boolean} params.isFeatured - 是否只获取精选分类
 * @param {string} params.search - 搜索关键词
 * @returns {Promise<Array>} 分类列表
 */
export async function getCategoriesData(params = {}) {
  try {
    const { isFeatured, search } = params;
    const queryParams = new URLSearchParams();

    if (isFeatured !== undefined) {
      queryParams.set('isFeatured', isFeatured.toString());
    }

    if (search) {
      queryParams.set('search', search);
    }

    const queryString = queryParams.toString();
    const url = queryString ? `/categories?${queryString}` : '/categories';

    const data = await request(url);
    return data || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

/**
 * 服务端根据slug获取分类
 * @param {string} slug - 分类slug
 * @returns {Promise<Object|null>} 分类数据
 */
export async function getCategoryBySlug(slug) {
  try {
    const data = await request(`/categories/${slug}`);
    return data || null;
  } catch (error) {
    console.error('Error fetching category:', error);
    return null;
  }
}

/**
 * 服务端获取统计数据
 * @returns {Promise<Object>} 统计数据
 */
export async function getStatsData() {
  try {
    const data = await request('/stats');
    return data || null;
  } catch (error) {
    console.error('Error fetching stats:', error);
    return {
      totalTopics: 0,
      totalPosts: 0,
      totalUsers: 0,
      online: { total: 0 },
    };
  }
}

/**
 * 服务端获取热门标签
 * @param {Object} params - 查询参数
 * @param {number} params.limit - 数量
 * @returns {Promise<Array>} 标签列表
 */
export async function getTagsData(params = {}) {
  try {
    const { limit = 20 } = params;
    const data = await request(`/tags?limit=${limit}`);
    return data.items || [];
  } catch (error) {
    console.error('Error fetching tags:', error);
    return [];
  }
}

/**
 * 服务端获取单个话题数据
 * 使用 React cache 确保同一渲染周期内的重复请求被去重
 * @param {number|string} id - 话题ID
 * @returns {Promise<Object|null>} 话题数据
 */
export const getTopicData = cache(async (id) => {
  try {
    const data = await request(`/topics/${id}`);
    return data;
  } catch (error) {
    console.error('Error fetching topic:', error);
    return null;
  }
});

/**
 * 服务端获取话题回复数据
 * @param {number|string} topicId - 话题ID
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Promise<Object>} 回复列表数据
 */
export async function getPostsData(topicId, page = 1, limit = 20) {
  try {
    const params = new URLSearchParams({
      topicId: topicId.toString(),
      page: page.toString(),
      limit: limit.toString(),
    });

    const data = await request(`/posts?${params}`);
    return data || { items: [], total: 0 };
  } catch (error) {
    console.error('Error fetching posts:', error);
    return { items: [], total: 0 };
  }
}

/**
 * 服务端获取单个标签数据
 * @param {string} slug - 标签slug
 * @returns {Promise<Object|null>} 标签数据
 */
export async function getTagData(slug) {
  try {
    const data = await request(`/tags/${slug}`);
    return data;
  } catch (error) {
    console.error('Error fetching tag:', error);
    return null;
  }
}

/**
 * 将扁平分类列表组装为树形结构
 * @param {Array} data - 扁平分类列表
 * @returns {Array} 树形分类列表
 */
export function buildCategoryTree(data) {
  const categoryMap = new Map();
  const rootCategories = [];

  data.forEach(cat => {
    categoryMap.set(cat.id, { ...cat, subcategories: [] });
  });

  data.forEach(cat => {
    const category = categoryMap.get(cat.id);
    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId);
      if (parent) {
        parent.subcategories.push(category);
      }
    } else {
      rootCategories.push(category);
    }
  });

  const sortByName = (a, b) => a.name.localeCompare(b.name);
  const sortCategories = (cats) => {
    cats.sort(sortByName);
    cats.forEach(cat => {
      if (cat.subcategories.length > 0) {
        sortCategories(cat.subcategories);
      }
    });
  };
  sortCategories(rootCategories);

  const calculateTotalStats = (category) => {
    let total = category.topicCount || 0;
    if (category.subcategories.length > 0) {
      category.subcategories.forEach(sub => {
        total += calculateTotalStats(sub);
      });
    }
    category.totalTopics = total;
    return total;
  };
  rootCategories.forEach(calculateTotalStats);

  return rootCategories;
}

/**
 * 服务端获取分类树形数据（获取 + 组装）
 * @returns {Promise<Array>} 树形分类列表
 */
export async function getCategoriesTree() {
  const data = await getCategoriesData();
  return buildCategoryTree(data);
}
