import { visit } from 'unist-util-visit';

/**
 * 抽奖插件
 *
 * 支持语法:
 * ::lottery{id="1234"}
 *
 * 抽奖数据从服务端根据 ID 获取，Markdown 中只存储引用。
 */
export default function remarkLottery() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type === 'leafDirective' && node.name === 'lottery') {
        const attributes = node.attributes || {};
        if (!attributes.id) {
          console.warn('Lottery directive missing required "id" attribute');
          return;
        }
        node.data = node.data || {};
        node.data.hName = 'lottery';
        node.data.hProperties = {
          'data-lottery-id': attributes.id,
        };
      }
    });
  };
}
