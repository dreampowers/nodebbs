import { request } from '@/lib/server/api';
import { DEFAULT_CURRENCY_CODE } from '@/extensions/ledger/constants';
import { isCurrencyActive } from '@/extensions/ledger/server';

/**
 * 打赏（rewards）扩展的服务端数据获取。
 *
 * 从 lib/server/topics.js 拆出——这些原本混在论坛 server 文件里，但属于 rewards/ledger
 * 关注点：依赖 ledger 货币是否启用，以及 /rewards 端点。论坛模块不应耦合它们。
 */

/**
 * 服务端获取积分系统是否启用
 * 可单独调用用于并行优化
 * @returns {Promise<boolean>} 是否启用
 */
export async function getRewardEnabledStatus() {
  try {
    return await isCurrencyActive(DEFAULT_CURRENCY_CODE);
  } catch (error) {
    console.error('检查积分系统状态失败:', error);
    return false;
  }
}

/**
 * 服务端获取打赏统计数据
 * @param {Object} topic - 话题对象（需要 firstPostId）
 * @param {Array} posts - 帖子列表
 * @returns {Promise<Object>} 打赏统计 Map
 */
export async function getRewardStats(topic, posts) {
  try {
    const postIds = [topic.firstPostId, ...posts.map(p => p.id)].filter(Boolean);
    if (postIds.length > 0) {
      const stats = await request('/rewards/posts/batch', {
        method: 'POST',
        body: JSON.stringify({ postIds })
      });
      return stats || {};
    }
  } catch (error) {
    console.error('获取打赏统计失败:', error);
  }
  return {};
}
