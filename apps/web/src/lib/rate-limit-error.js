/**
 * 限速（HTTP 429）错误在「SSR → 客户端错误边界」之间的编解码。
 *
 * 背景：Next.js 把「服务端组件渲染时抛出的错误」转发到客户端错误边界时，
 * 生产构建会将 error.message 替换为通用文案、并丢弃所有自定义属性
 * （status / resetTime）。唯一被原样保留的是 error.digest
 * （见 next/dist/server/app-render/create-error-handler.js：
 *  "If the error already has a digest, respect the original digest"）。
 * 因此把 429 元数据编码进 digest，才能在生产环境的错误边界里还原。
 */
export const RATE_LIMIT_DIGEST_PREFIX = 'RATE_LIMIT_429:';

/** 将限速元数据编码成 digest 字符串（供 SSR request() 设置到 error.digest）。 */
export function encodeRateLimitDigest({ resetTime } = {}) {
  return RATE_LIMIT_DIGEST_PREFIX + JSON.stringify({ resetTime });
}

/**
 * 从 Error 对象中提取限速信息；非限速错误返回 null。
 */
export function parseRateLimitError(error) {
  if (!error) return null;

  // 1. 服务端直接抛出、尚未跨边界序列化（如客户端 fetch 错误）：自定义属性仍在
  if (error.status === 429) {
    return { resetTime: error.resetTime };
  }

  // 2. 经 Next.js 转发到客户端错误边界后：元数据只剩在 digest 中
  if (typeof error.digest === 'string' && error.digest.startsWith(RATE_LIMIT_DIGEST_PREFIX)) {
    try {
      const parsed = JSON.parse(error.digest.slice(RATE_LIMIT_DIGEST_PREFIX.length));
      return { resetTime: parsed.resetTime };
    } catch {
      // digest 标记正确但负载损坏：仍按限速处理，只是缺少倒计时数据
      return { resetTime: undefined };
    }
  }

  return null;
}
