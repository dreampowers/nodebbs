/**
 * 角色徽章颜色工具
 *
 * 为避免自定义角色颜色与主题色冲突，采用 GitHub label 风格：
 * 淡色背景 + 同色边框 + 同色文字（配合 Badge variant="outline"）。
 * 仅当 color 是合法的 6 位十六进制时才应用内联样式；否则返回 null，
 * 由调用方回退到主题色样式。
 */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
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
