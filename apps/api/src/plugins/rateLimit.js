import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

async function rateLimitPlugin(fastify, opts) {
  // 先尝试可选认证，以便限速器可以识别用户
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      // 忽略错误，用户未登录
      request.user = null;
    }
  });

  // 注册 @fastify/rate-limit 插件
  await fastify.register(rateLimit, {
    global: true,
    allowList: async (request) => {
      try {
        const enabled = await fastify.settings.get('rate_limit_enabled', true);
        if (!enabled) {
          return true;
        }

        if (!request.user?.id || !fastify.permission?.hasRole) return false;
        return await fastify.permission.hasRole(request.user.id, 'admin');
      } catch {
        // 数据库未初始化时使用默认行为：应用限速
        return false;
      }
    },
    max: async (request, key) => {
      try {
        // 获取基础限制
        const maxRequests = await fastify.settings.get('rate_limit_max_requests', 100);

        // 如果是已登录用户，应用倍数
        if (request.user?.id) {
          const multiplier = await fastify.settings.get('rate_limit_auth_multiplier', 2);
          return Math.floor(maxRequests * multiplier);
        }

        return maxRequests;
      } catch {
        return 100;
      }
    },
    timeWindow: async (request, key) => {
      try {
        const windowMs = await fastify.settings.get('rate_limit_window_ms', 60000);
        return windowMs;
      } catch {
        return 60000;
      }
    },
    keyGenerator: (request) => {
      // 使用用户 ID 或 IP 作为限速键
      return request.user?.id ? `user:${request.user.id}` : `ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => {
      return {
        error: '请求过于频繁，请稍后再试',
        statusCode: 429,
        resetTime: new Date(Date.now() + context.ttl).toISOString(),
      };
    },
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  dependencies: ['settings', 'auth'],
});
