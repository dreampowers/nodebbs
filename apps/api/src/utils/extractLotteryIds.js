/**
 * 从 markdown 文本中提取所有 `::lottery{id="..."}` 指令引用的 ID。
 *
 * @param {string} content - markdown 原文
 * @returns {string[]} 去重后的 id 字符串数组（按出现顺序）
 */
export function extractLotteryIds(content) {
  if (!content || typeof content !== 'string') return [];

  const re = /::lottery\{[^}]*\bid="([^"]+)"[^}]*\}/g;
  const ids = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(content)) !== null) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * 从 markdown 文本中删除指定 id 列表对应的 `::lottery{id="..."}` 指令行。
 *
 * @param {string} content - markdown 原文
 * @param {string[]} idsToRemove - 要删除的 lottery id 数组
 * @returns {string} 清洗后的 markdown
 */
export function stripLotteryDirectives(content, idsToRemove) {
  if (!content || !idsToRemove || idsToRemove.length === 0) return content;

  const idSet = new Set(idsToRemove.map(String));
  const lineRe = /^[ \t]*::lottery\{[^}]*\}[ \t]*$\n?/gm;

  return content.replace(lineRe, (line) => {
    const idMatch = /\bid="([^"]+)"/.exec(line);
    if (idMatch && idSet.has(idMatch[1])) {
      return '';
    }
    return line;
  });
}
