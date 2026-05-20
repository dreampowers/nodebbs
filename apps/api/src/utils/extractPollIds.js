/**
 * 从 markdown 文本中提取所有 `::poll{id="..."}` 指令引用的 ID。
 *
 * 指令语法（remark leafDirective）：行级 `::poll{id="xxxxx"}`，可带其他属性。
 *
 * @param {string} content - markdown 原文
 * @returns {string[]} 去重后的 id 字符串数组（按出现顺序）
 */
export function extractPollIds(content) {
  if (!content || typeof content !== 'string') return [];

  const re = /::poll\{[^}]*\bid="([^"]+)"[^}]*\}/g;
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
 * 从 markdown 文本中删除指定 id 列表对应的 `::poll{id="..."}` 指令行。
 * 整行（含可能的前后空白与尾部换行）一并去掉，避免遗留空行污染排版。
 *
 * @param {string} content - markdown 原文
 * @param {string[]} idsToRemove - 要删除的 poll id 数组
 * @returns {string} 清洗后的 markdown
 */
export function stripPollDirectives(content, idsToRemove) {
  if (!content || !idsToRemove || idsToRemove.length === 0) return content;

  const idSet = new Set(idsToRemove.map(String));
  const lineRe = /^[ \t]*::poll\{[^}]*\}[ \t]*$\n?/gm;

  return content.replace(lineRe, (line) => {
    const idMatch = /\bid="([^"]+)"/.exec(line);
    if (idMatch && idSet.has(idMatch[1])) {
      return '';
    }
    return line;
  });
}
