import { getPublicBaseUrl } from '@/lib/server/sitemap';

export const revalidate = 3600;

export default async function robots() {
  const base = await getPublicBaseUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/profile', '/auth', '/create', '/search', '/api'],
    },
    sitemap: base ? `${base}/sitemap.xml` : undefined,
    host: base || undefined,
  };
}
