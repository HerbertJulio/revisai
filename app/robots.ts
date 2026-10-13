import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/oficina', '/cartao', '/api'] }],
    sitemap: 'https://revisai.howlks.com/sitemap.xml'
  };
}
