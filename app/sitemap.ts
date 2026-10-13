import type { MetadataRoute } from 'next';

const BASE = 'https://revisai.howlks.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/fornecedores', '/planos', '/motorista', '/privacidade'].map((p) => ({ url: `${BASE}${p}`, changeFrequency: 'monthly', priority: p === '' ? 1 : 0.6 }));
}
