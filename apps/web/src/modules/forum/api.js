import { apiClient } from '@/lib/api';

/**
 * 论坛模块 API 客户端。
 *
 * 从 lib/api.js 单体拆出（分类/话题/帖子/标签/搜索）。
 * 复用底座的 apiClient 单例（lib/api.js 导出）。
 * 注：lib/api.js 仍 re-export 这些以保持旧导入路径兼容，可渐进迁移到 '@/modules/forum/api'。
 */

// ============= 分类 API =============
export const categoryApi = {
  // 获取所有分类
  async getAll() {
    return apiClient.get('/categories');
  },

  // 获取单个分类
  async getBySlug(slug) {
    return apiClient.get(`/categories/${slug}`);
  },

  // 创建分类 (管理员)
  async create(data) {
    return apiClient.post('/categories', data);
  },

  // 更新分类 (管理员)
  async update(id, data) {
    return apiClient.patch(`/categories/${id}`, data);
  },

  // 删除分类 (管理员)
  async delete(id) {
    return apiClient.delete(`/categories/${id}`);
  },

  // 批量更新分类排序（管理员）
  async batchReorder(items) {
    return apiClient.patch('/categories/batch-reorder', { items });
  },
};

// ============= 话题 API =============
export const topicApi = {
  // 获取话题列表
  async getList(params = {}) {
    // params: { page, limit, categoryId, userId, tag, sort }
    return apiClient.get('/topics', params);
  },

  // 获取话题详情
  async getById(id) {
    return apiClient.get(`/topics/${id}`);
  },

  // 创建话题
  async create(data) {
    // data: { title, categoryId, content, tags }
    return apiClient.post('/topics', data);
  },

  // 更新话题
  async update(id, data) {
    return apiClient.patch(`/topics/${id}`, data);
  },

  // 删除话题
  async delete(id, permanent = false) {
    const query = permanent ? '?permanent=true' : '';
    return apiClient.delete(`/topics/${id}${query}`);
  },

  // 批量删除话题
  async batchDelete(ids, permanent = false) {
    return apiClient.post('/topics/batch-delete', { ids, permanent });
  },

  // 收藏话题
  async bookmark(id) {
    return apiClient.post(`/topics/${id}/bookmark`);
  },

  // 取消收藏
  async unbookmark(id) {
    return apiClient.delete(`/topics/${id}/bookmark`);
  },

  // 订阅话题
  async subscribe(id) {
    return apiClient.post(`/topics/${id}/subscribe`);
  },

  // 取消订阅
  async unsubscribe(id) {
    return apiClient.delete(`/topics/${id}/subscribe`);
  },
};

// ============= 帖子 API =============
export const postApi = {
  // 获取话题的所有帖子
  async getByTopic(topicId, page = 1, limit = 20) {
    return apiClient.get('/posts', { topicId, page, limit });
  },

  // 获取用户的所有回复
  async getByUser(userId, page = 1, limit = 20) {
    return apiClient.get('/posts', { userId, page, limit });
  },

  // 获取单个帖子
  async getById(id) {
    return apiClient.get(`/posts/${id}`);
  },

  // 创建帖子 (回复)
  async create(data) {
    // data: { topicId, content, replyToPostId }
    return apiClient.post('/posts', data);
  },

  // 更新帖子
  async update(id, content) {
    return apiClient.patch(`/posts/${id}`, { content });
  },

  // 删除帖子
  async delete(id, permanent = false) {
    const query = permanent ? '?permanent=true' : '';
    return apiClient.delete(`/posts/${id}${query}`);
  },

  // 点赞帖子
  async like(id) {
    return apiClient.post(`/posts/${id}/like`);
  },

  // 取消点赞
  async unlike(id) {
    return apiClient.delete(`/posts/${id}/like`);
  },

  // 管理员：获取所有回复列表（不传 topicId 和 userId 即为管理员模式）
  async getAdminList(params = {}) {
    return apiClient.get('/posts', params);
  },

  // 获取帖子在话题中的位置（用于跳转到指定楼层）
  async getPosition(postId, topicId, limit = 20) {
    return apiClient.get(`/posts/${postId}/position`, { topicId, limit });
  },
};

// ============= 标签 API =============
export const tagApi = {
  // 获取所有标签
  async getAll(search = '', limit = 50) {
    return apiClient.get('/tags', { search, limit });
  },

  // 获取标签详情
  async getBySlug(slug) {
    return apiClient.get(`/tags/${slug}`);
  },

  // 获取标签下的话题
  async getTopics(slug, page = 1, limit = 20) {
    return apiClient.get(`/tags/${slug}/topics`, { page, limit });
  },

  // 创建标签
  async create(data) {
    return apiClient.post('/tags', data);
  },

  // 更新标签（管理员）
  async update(id, data) {
    return apiClient.patch(`/tags/${id}`, data);
  },

  // 删除标签（管理员）
  async delete(id) {
    return apiClient.delete(`/tags/${id}`);
  },

  // 获取标签列表（带分页）
  async getList(params = {}) {
    return apiClient.get('/tags', params);
  },
};

// ============= 搜索 API =============
export const searchApi = {
  // 搜索（单类型：topics / posts / users）
  async search(query, type, page = 1, limit = 20) {
    return apiClient.get('/search', { q: query, type, page, limit });
  },
};
