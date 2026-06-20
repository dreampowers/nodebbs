/**
 * 颜色 / 徽章样式计算工具（纯函数）。
 */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 角色徽章颜色（GitHub label 风格）：
 * 淡色背景 + 同色边框 + 同色文字（配合 Badge variant="outline"）。
 * 仅当 color 是合法的 6 位十六进制时才返回内联样式；否则返回 null，
 * 由调用方回退到主题色样式。
 *
 * @param {{ color?: string|null }} role
 * @returns {{ backgroundColor: string, borderColor: string, color: string }|null}
 */
export function getRoleBadgeStyle(role) {
  const color = role?.color;
  if (typeof color === 'string' && HEX_COLOR_RE.test(color)) {
    return {
      backgroundColor: `${color}20`, // ~12% 透明度的淡色底
      borderColor: `${color}40`, // ~25% 透明度的边框
      color,
    };
  }
  return null;
}

/**
 * 根据字符串生成一个固定的随机柔和渐变色
 * 适合用于默认头像背景色，类似 GitHub/Flarum 风格
 * @param {string} str - 用于生成颜色的字符串（如用户名）
 * @returns {string|null} - 返回 CSS backgroundImage 渐变字符串，或 null
 */
export function generateAvatarColor(str) {
  if (!str) return null;

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const absHash = Math.abs(hash);

  // 基础色相
  const h = absHash % 360;
  // 渐变角度 (0-360)
  const angle = (absHash >> 8) % 360;
  // 中间色标位置 (35%-65%)
  const midStop = 35 + ((absHash >> 16) % 31);

  // 生成三个相近/互补的颜色用于渐变
  const color1 = `hsl(${h}, 70%, 55%)`;
  const color2 = `hsl(${(h + 40) % 360}, 65%, 60%)`;
  const color3 = `hsl(${(h - 20 + 360) % 360}, 65%, 65%)`;

  // 返回一个柔和的线性渐变
  return `linear-gradient(${angle}deg, ${color1} 0%, ${color2} ${midStop}%, ${color3} 100%)`;
}
