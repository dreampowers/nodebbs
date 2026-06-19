import fp from 'fastify-plugin';
import { setupConditionRegistry } from './registry.js';
import { createPermissionService } from './service.js';
import registerRbacEnricher from './enricher.js';

/**
 * RBAC 插件（统一接线点）。
 *
 * 把原先散落于 config/plugins/services 的运行时部分聚合到此插件目录：
 *   - registry.js  条件解析器注册表（registerRbacConditionResolver / rbacConditionResolvers）
 *   - service.js   PermissionService 引擎（装饰为 fastify.permission）
 *   - enricher.js  用户展示角色富化器（注册进 userEnricher）
 *
 * 注：RBAC「定义」（权限/角色/条件清单）保留在 config/rbac.js（定义层），
 * 因为离线种子脚本 scripts/init/rbac.js 也要消费它，不应耦合 fastify。
 *
 * 所有对 fastify.permission 的使用均在请求期（路由/钩子），故本插件无需 fp 依赖排序约束。
 */
async function rbacPlugin(fastify) {
  // 1) 条件解析器注册表（供业务模块注入 categories 等条件展开逻辑）
  setupConditionRegistry(fastify);

  // 2) 权限引擎：实例化并装饰为 fastify.permission（同时设置模块级单例供 enricher 取用）
  fastify.decorate('permission', createPermissionService(fastify));

  // 3) 用户展示角色富化器（enrichUser 内经闭包用 fastify.permission）
  registerRbacEnricher(fastify);
}

export default fp(rbacPlugin, { name: 'rbac' });
