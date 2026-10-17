import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { RelatorDeErros } from '@/components/avisos/RelatorDeErros';
import './globals.css';

const archivo = localFont({
  src: './fontes/archivo-latin-standard-normal.woff2',
  variable: '--fonte-archivo',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }]
});

const DESCRICAO =
  'O Revisaí avisa a oficina antes da troca de óleo e das revisões dos clientes vencerem, pela data ou pela quilometragem. Um toque manda a mensagem no WhatsApp, e a loja já mostra a peça certa em promoção.';

export const metadata: Metadata = {
  metadataBase: new URL('https://revisai.howlks.com'),
  title: { default: 'Revisaí | A oficina avisa antes de vencer', template: '%s | Revisaí' },
  description: DESCRICAO,
  applicationName: 'Revisaí',
  openGraph: {
    title: 'Revisaí | A oficina avisa antes de vencer',
    description: DESCRICAO,
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Revisaí',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Etiqueta de troca de óleo com o carimbo de avisado' }]
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e6e9e7' },
    { media: '(prefers-color-scheme: dark)', color: '#121517' }
  ]
};

// Tema escolhido em Ajustes, aplicado antes de pintar a tela (sem piscar).
const TEMA =
  "try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){var t=null;try{t=localStorage.getItem('revisai:tema')}catch(e){}document.documentElement.dataset.tema=t==='escuro'||(t!=='claro'&&m.matches)?'escuro':'claro'};a();m.addEventListener('change',a);window.__revisaiTema=a}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body>
        {children}
        <RelatorDeErros />
        <noscript>
          <p className="sem-js">O Revisaí precisa do JavaScript ligado no navegador.</p>
        </noscript>
      </body>
    </html>
  );
}
