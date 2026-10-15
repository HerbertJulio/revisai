import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV === 'development';

// Fotos da loja: as do Supabase Storage (enviadas pelos fornecedores) e as livres do Wikimedia Commons.
// Passam pelo otimizador de imagens, então o navegador continua falando só com o próprio site.
let hostSupabase = 'jlbpsgscspxpnvjhwwnq.supabase.co';
try {
  if (process.env.SUPABASE_URL) hostSupabase = new URL(process.env.SUPABASE_URL).hostname;
} catch {}

// O navegador só fala com o próprio site; o banco é acessado pelo servidor.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  // áudios gravados na ordem por voz tocam a partir do próprio aparelho
  "media-src 'self' blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  // o mapa da entrega (OpenStreetMap) na tela do pedido
  'frame-src https://www.openstreetmap.org',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests'])
].join('; ');

const seguranca = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // o microfone e a câmera ficam liberados só para o próprio site (ordem de serviço por voz e fotos do carro)
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), hid=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' }
];

// a página do entregador pede a localização do celular para a oficina acompanhar a entrega
const permissoesDaEntrega = 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), serial=(), hid=(), browsing-topics=()';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  // fotos dos produtos e a ordem de serviço por voz (áudio e fotos) passam por ações do servidor;
  // a Vercel aceita até 4,5 MB por requisição
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org', pathname: '/wikipedia/commons/**' },
      { protocol: 'https', hostname: hostSupabase, pathname: '/storage/v1/object/public/**' }
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 31
  },
  async headers() {
    return [
      { source: '/:path*', headers: seguranca },
      // vem depois para valer no lugar da regra geral
      { source: '/entrega/:token*', headers: [{ key: 'Permissions-Policy', value: permissoesDaEntrega }] }
    ];
  },
  async redirects() {
    return [
      // o painel da equipe virou painel administrativo
      { source: '/equipe', destination: '/admin', permanent: true },
      { source: '/equipe/loja', destination: '/admin/promocoes', permanent: true },
      { source: '/equipe/:caminho*', destination: '/admin/:caminho*', permanent: true },
      { source: '/admin/loja', destination: '/admin/promocoes', permanent: true }
    ];
  }
};

export default config;
