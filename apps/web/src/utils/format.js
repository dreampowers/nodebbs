/**
 * 数字 / 文本格式化工具（纯函数）
 */

/**
 * 格式化数字显示（1000 → 1K, 1000000 → 1M）
 */
export function formatCompactNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}
