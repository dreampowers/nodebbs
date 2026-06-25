import { cache } from 'react';
import { fetchData } from './api';

export function normalizeSlugSegments(slug) {
  return (Array.isArray(slug) ? slug : [slug])
    .filter(Boolean)
    .map((segment) => decodeURIComponent(String(segment)))
    .filter(Boolean);
}

export function joinSlugSegments(slug) {
  return normalizeSlugSegments(slug).join('/');
}

export function encodeSlugPath(slug) {
  return normalizeSlugSegments(slug)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

const fetchPageByEncodedSlug = cache(async (encodedSlug) => {
  return fetchData(`/pages/${encodedSlug}`, {
    fallback: null,
    options: { cache: 'no-store' },
  });
});

export async function getPageBySlug(slug) {
  const encodedSlug = encodeSlugPath(slug);

  if (!encodedSlug) {
    return null;
  }

  return fetchPageByEncodedSlug(encodedSlug);
}
