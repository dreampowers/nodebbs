import {
  getPublicBaseUrl,
  fetchSitemapStats,
  getShardChunk,
  buildSitemapIndex,
  xmlResponse,
} from '@/lib/server/sitemap';

export const revalidate = 3600;

export async function GET() {
  const base = await getPublicBaseUrl();
  const { maxTopicId } = await fetchSitemapStats();
  const chunk = getShardChunk();
  const shardCount = maxTopicId ? Math.ceil(maxTopicId / chunk) : 0;

  const ids = ['core'];
  for (let i = 0; i < shardCount; i += 1) {
    ids.push(`topics-${i}`);
  }

  const locs = ids.map((id) => `${base}/sitemaps/${id}.xml`);
  return xmlResponse(buildSitemapIndex(locs));
}
