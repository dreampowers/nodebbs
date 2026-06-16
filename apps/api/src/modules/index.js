/**
 * 业务模块组合根（composition root）
 *
 * 决策：模块硬编码、无运行时开关（不使用 ENABLED_MODULES）。
 * 每个「复制底座生成的系统」在此静态列出自带的业务模块，按数组顺序注册。
 * 更换业务（如改钓点）= 修改此列表 + 对应模块目录。
 */
import forumModule from './forum/index.js';

/** 启用的业务模块（按注册顺序） */
export const modules = [forumModule];
