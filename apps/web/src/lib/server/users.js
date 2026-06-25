/**
 * 用户相关的服务端数据获取函数
 */
import { fetchData } from '@/lib/server/api';

/**
 * 获取用户数据
 * @param {string} username - 用户名
 * @returns {Promise<object|null>} 用户数据
 */
export async function getUserData(username) {
  return fetchData(`/users/${username}`, { fallback: null });
}

/**
 * 获取用户发布的话题列表
 * @param {number} userId - 用户 ID
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Promise<{items: array, total: number}>}
 */
export async function getUserTopics(userId, page = 1, limit = 20) {
  const params = new URLSearchParams({
    userId: userId.toString(),
    page: page.toString(),
    limit: limit.toString(),
  });
  return fetchData(`/topics?${params}`, { fallback: { items: [], total: 0 } });
}

/**
 * 获取用户发布的回复列表
 * @param {number} userId - 用户 ID
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Promise<{items: array, total: number}>}
 */
export async function getUserPosts(userId, page = 1, limit = 20) {
  const params = new URLSearchParams({
    userId: userId.toString(),
    page: page.toString(),
    limit: limit.toString(),
  });
  return fetchData(`/posts?${params}`, { fallback: { items: [], total: 0 } });
}

/**
 * 获取用户的粉丝列表
 * @param {string} username - 用户名
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Promise<{items: array, total: number}>}
 */
export async function getUserFollowers(username, page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  return fetchData(`/users/${username}/followers?${params}`, {
    fallback: { items: [], total: 0 },
  });
}

/**
 * 获取用户的关注列表
 * @param {string} username - 用户名
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Promise<{items: array, total: number}>}
 */
export async function getUserFollowing(username, page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  return fetchData(`/users/${username}/following?${params}`, {
    fallback: { items: [], total: 0 },
  });
}
