/**
 * RBAC「分类作用域」解析器接线点（core kernel，由 plugins/rbac/index.js 装配）。
 *
 * RBAC 条件中唯一需要业务数据的是论坛 `categories`：父分类需向下展开到所有子分类
 * （向下继承）。forum 模块通过 fastify.setCategoryScopeResolver(fn) 注入展开逻辑，
 * permissionService 经 fastify.resolveCategoryScope() 调用——core 不直接依赖论坛 categories 表。
 *
 * 注：这不是通用「条件注册表」。其它 RBAC 条件（accountAge / timeRange / rateLimit / …）
 * 由 permissionService 内联判定，不经此接线点。若将来出现更多「作用域」类条件，再考虑泛化。
 *
 * fn 约定：(parentIds: number[]) => Promise<Set<number>> | Set<number>
 */
export function setupCategoryScope(fastify) {
  /** @type {((parentIds: number[]) => (Promise<Set<number>> | Set<number>)) | null} */
  let resolver = null;
  let warnedMissing = false;

  // 注入分类作用域解析器（由 forum 模块在启动时调用）
  fastify.decorate('setCategoryScopeResolver', (fn) => {
    if (typeof fn !== 'function') {
      throw new TypeError('[rbac] setCategoryScopeResolver(fn) 需要一个函数');
    }
    if (resolver) {
      fastify.log.warn('[rbac] 分类作用域解析器被重复设置，后者覆盖前者');
    }
    resolver = fn;
    fastify.log.info('[rbac] 已注册分类作用域解析器');
  });

  /**
   * 将父分类 ID 展开为「允许的分类 ID 集合」（含子分类）。
   * 未注册解析器时退化为原值集合（不展开子分类），并仅告警一次。
   * @param {number[]} parentIds
   * @returns {Promise<Set<number>>}
   */
  fastify.decorate('resolveCategoryScope', async (parentIds) => {
    if (!parentIds || parentIds.length === 0) return new Set();
    if (!resolver) {
      if (!warnedMissing) {
        fastify.log.warn('[rbac] 未注册分类作用域解析器：categories 条件将不展开子分类');
        warnedMissing = true;
      }
      return new Set(parentIds);
    }
    return resolver(parentIds);
  });
}
