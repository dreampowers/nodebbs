import {
  getPublicBaseUrl,
  fetchSitemapTaxonomy,
  fetchSitemapTopics,
  getShardChunk,
  buildUrlset,
  xmlResponse,
} from '@/lib/server/sitemap';

export const revalidate = 3600;

// 静态公开页（首页 + 列表索引 + about）
const STATIC_PAGES = [
  { path: '', changefreq: 'daily', priority: 1.0 },
  { path: 'categories', changefreq: 'daily', priority: 0.7 },
  { path: 'tags', changefreq: 'weekly', priority: 0.5 },
  { path: 'about', changefreq: 'monthly', priority: 0.4 },
];

export async function GET(request, { params }) {
  const { id: rawId } = await params; // Next 16: params 是 Promise
  const id = String(rawId).replace(/\.xml$/, '');
  const base = await getPublicBaseUrl();

  if (id === 'core') {
    const { categories, tags, pages } = await fetchSitemapTaxonomy();
    const entries = [
      ...STATIC_PAGES.map((p) => ({
        loc: p.path ? `${base}/${p.path}` : `${base}/`,
        changefreq: p.changefreq,
        priority: p.priority,
      })),
      ...categories.map((c) => ({
        loc: `${base}/categories/${c.slug}`,
        lastmod: c.lastmod,
        changefreq: 'daily',
        priority: 0.7,
      })),
      ...tags.map((t) => ({
        loc: `${base}/tags/${t.slug}`,
        lastmod: t.lastmod,
        changefreq: 'weekly',
        priority: 0.4,
      })),
      ...pages.map((p) => ({
        loc: `${base}/${p.slug}`,
        lastmod: p.lastmod,
        changefreq: 'monthly',
        priority: 0.5,
      })),
    ];
    return xmlResponse(buildUrlset(entries));
  }

  const match = id.match(/^topics-(\d+)$/);
  if (match) {
    const shard = Number(match[1]);
    const chunk = getShardChunk();
    const minId = shard * chunk;
    const maxId = minId + chunk;
    const items = await fetchSitemapTopics(minId, maxId);
    const entries = items.map((t) => ({
      loc: `${base}/topic/${t.id}`,
      lastmod: t.lastmod,
      changefreq: 'weekly',
      priority: 0.6,
    }));
    return xmlResponse(buildUrlset(entries));
  }

  return new Response('Not found', { status: 404 });
}
