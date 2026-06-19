/**
 * RBAC 条件解析器注册表（core kernel，由 plugins/rbac/index.js 装配）。
 *
 * 某些权限条件需要业务数据才能判定——典型是论坛 `categories`（父分类→子分类继承）。
 * 业务模块通过 fastify.registerRbacConditionResolver(key, resolver) 注册解析器，
 * permissionService 经注册表调用，core 不直接依赖任何业务表。
 *
 * resolver 约定：expand(values): Promise<Set>  将条件值展开为「允许集合」。
 */
export function setupConditionRegistry(fastify) {
  /** @type {Map<string, { expand: (values: any[]) => Promise<Set<any>> }>} */
  const resolvers = new Map();

  fastify.decorate('registerRbacConditionResolver', (key, resolver) => {
    resolvers.set(key, resolver);
    fastify.log.info(`[rbac] 注册条件解析器: ${key}`);
  });

  fastify.decorate('rbacConditionResolvers', resolvers);
}
