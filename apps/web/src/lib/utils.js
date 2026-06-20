import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

/**
 * shadcn/ui 规范的类名合并工具。
 * components.json 的 aliases.utils 指向此文件，shadcn CLI 生成的组件会从这里 import cn。
 * 因此本文件只保留 cn —— 其余纯函数 helper 请放到 @/utils/*（format / image / color ...）。
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
