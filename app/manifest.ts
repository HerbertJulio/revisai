import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Revisaí',
    short_name: 'Revisaí',
    description: 'A oficina avisa o cliente antes da troca de óleo e das revisões vencerem.',
    lang: 'pt-BR',
    start_url: '/oficina',
    scope: '/',
    display: 'standalone',
    background_color: '#e6e9e7',
    theme_color: '#e6e9e7',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
