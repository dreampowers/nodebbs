/**
 * 服务器配置模块
 *
 * 职责：
 * - 自动加载 plugins 目录下的所有插件（数据库、认证、缓存等基础设施）
 * - 自动加载 extensions 目录下的所有扩展（积分、商城、徽章等业务模块）
 * - 自动加载 routes 目录下的所有路由（API 接口定义）
 */
'use strict';

import path from 'node:path';
import AutoLoad from '@fastify/autoload';
import { dirname } from './utils/index.js';
import { modules } from './modules/index.js';

const __dirname = dirname(import.meta.url);

/**
 * 服务器主函数
 * @param {import('fastify').FastifyInstance} fastify - Fastify 实例
 * @param {object} opts - 选项
 */
export default async function (fastify, opts) {
  /**
   * 加载基础插件
   * 位置：src/plugins/
   * 包含：数据库 (db)、Redis (redis)、认证 (auth)、消息 (message) 等
   */
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: Object.assign({}, opts),
    maxDepth: 1,
  });

  /**
   * 加载业务扩展模块
   * 位置：src/extensions/
   * 包含：积分系统 (points)、商城 (shop)、徽章 (badges) 等可选功能
   */
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'extensions'),
    options: Object.assign({}, opts),
    maxDepth: 1,
  });

  /**
   * 加载业务模块（硬编码，无运行时开关）
   * 位置：src/modules/  —— 组合根见 src/modules/index.js
   * 迁移期：模块为占位插件；其 routes/services 仍由下方 routes 自动加载，P3 阶段迁入模块目录。
   */
  for (const mod of modules) {
    fastify.register(mod, Object.assign({}, opts));
  }

  /**
   * 加载 API 路由
   * 位置：src/routes/
   * 所有路由自动添加 /api 前缀
   */
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: {
      prefix: '/api',
    },
  });
}

