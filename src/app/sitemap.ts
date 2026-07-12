import type { MetadataRoute } from 'next';
import { getAllPublishedSlugs } from '@/lib/queries';

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://vnsvault.vercel.app';

export const revalidate = 3600; // regenerate hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const statics: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/games`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE}/requests`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/donate`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Dynamic game pages
  let gameEntries: MetadataRoute.Sitemap = [];
  try {
    const games = await getAllPublishedSlugs();
    games.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    gameEntries = games.slice(0, 1000).map(g => ({
      url: `${BASE}/games/${g.slug}`,
      lastModified: new Date(g.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error('[sitemap] DB error:', e);
  }

  return [...statics, ...gameEntries];
}
