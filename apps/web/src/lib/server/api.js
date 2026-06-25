// SSR请求专用
import { cookies } from 'next/headers';
import { getApiBaseUrl } from '../api-url';
import { encodeRateLimitDigest } from '../rate-limit-error';

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 20000;

export const request = async (endpoint, options = {}) => {
  const baseURL = getApiBaseUrl();
  const url = `${baseURL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const cks = await cookies();
  const token = cks.get('auth_token')?.value;
  if (token) {
    // headers['Authorization'] = `Bearer ${token}`;
    headers['Cookie'] = `auth_token=${token}`;
  }

  // 设置超时控制器
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // 传输层：只负责发请求。失败一律抛出，唯一例外是 404 → null（语义：资源不存在）。
  // 「失败 → 返回兜底默认值」的降级策略统一由 fetchData / 各调用方的 catch 决定。
  let response;
  try {
    const defaultCache = options.method && options.method !== 'GET' ? 'no-store' : undefined;

    response = await fetch(url, {
      ...options,
      // GET 用默认缓存让 Next.js 在同一渲染周期内去重；其它方法用 no-store
      cache: options.cache ?? defaultCache,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    // 网络错误 / 超时（AbortError）：规整后抛出
    if (error.name === 'AbortError') {
      throw new Error(`[SSR] 请求超时 (${timeout}ms): ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  // 404 静默返回 null（向后兼容）
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    // 解析错误响应体，提取消息与限速元数据
    let errorMessage = 'Failed to fetch';
    let resetTime;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
      resetTime = errorData.resetTime;
    } catch {
      // 忽略解析错误
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    error.resetTime = resetTime;

    // 限速错误需在「服务端组件 → 客户端错误边界」的序列化中存活。
    // 生产构建下 Next.js 会脱敏 error.message 并丢弃自定义属性，唯独
    // error.digest 被原样保留，故把 429 元数据编码进 digest。
    if (response.status === 429) {
      error.digest = encodeRateLimitDigest({ resetTime });
    }

    throw error;
  }

  return await response.json();
};

/**
 * 判断错误是否应「中断渲染、上抛到错误边界」（如限速 429 → RateLimitView）。
 * 这是「降级 vs 浮现」策略的唯一判定点；未来若要让 5xx 也浮现，只改这里。
 */
export function shouldSurface(error) {
  return error?.status === 429;
}

/**
 * 在 catch 块开头调用：把「必须浮现」的错误重新抛出，其余交由调用方兜底。
 * 供组合型调用（包别的数据函数、而非直接调 request）使用；
 * 直接调 request 的场景请优先用 fetchData。
 */
export function rethrowIfRateLimit(error) {
  if (shouldSurface(error)) throw error;
}

/**
 * 数据获取统一入口：成功返回数据，失败返回 fallback；但「必须浮现」的错误
 * （限速 429 等）会向上抛出，交给错误边界渲染 RateLimitView。
 * 把原先散落在各数据函数里的 try/catch + 兜底 + rethrow 收敛到此一处。
 *
 * @param {string} endpoint 请求路径
 * @param {object} [opts]
 * @param {*} [opts.fallback=null] 失败时的返回值
 * @param {object} [opts.options] 透传给 request 的选项（method/body/cache/timeout 等）
 * @param {(data:any)=>any} [opts.select] 对成功数据的整形（如取 .items、空值归一）
 */
export async function fetchData(endpoint, { fallback = null, options, select } = {}) {
  try {
    const data = await request(endpoint, options);
    return select ? select(data) : (data ?? fallback);
  } catch (error) {
    rethrowIfRateLimit(error);
    console.error(`[fetchData] ${endpoint}`, error);
    return fallback;
  }
}

// 增强用户对象，添加权限辅助属性（与 AuthContext 中的 enhanceUser 保持一致）
function enhanceUser(user) {
  if (!user) return null;

  const enhanced = {
    ...user,
    // 基于 RBAC 的 isAdmin 属性（不依赖旧 role 字段）
    isAdmin: user.userRoles?.some(r => r.slug === 'admin') ?? false,
  };

  return enhanced;
}

// 获取当前登录用户 (SSR专用)
// 优化：只有在存在 auth_token cookie 时才发请求
// /auth/me 接口已包含 RBAC 权限数据 (userRoles, permissions, displayRole)
export const getCurrentUser = async () => {
  const cookieStore = await cookies();
  const hasToken = cookieStore.has('auth_token');

  if (!hasToken) {
    return null;
  }

  try {
    const user = await request('/auth/me');
    return enhanceUser(user);
  } catch (error) {
    // token 过期/无效等情况，静默返回 null（视为未登录）
    return null;
  }
};
