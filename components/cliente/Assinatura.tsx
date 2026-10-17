'use client';

// Quadro para assinar com o dedo (ou o mouse). Sai um PNG pequeno em data URL, com fundo branco
// (para aparecer no tema escuro e no papel).

import { Eraser } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const LARGURA = 480;
const ALTURA = 160;
/** Acima disso a assinatura sai menor (o registro e a resposta do link têm limite). */
const MAXIMO = 60_000;

export function QuadroDeAssinatura({ aoMudar, rotulo = 'Assinatura', desativado = false }: { aoMudar: (png: string | null) => void; rotulo?: string; desativado?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vazio, setVazio] = useState(true);

  const preparar = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = '#1b1f22';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setVazio(true);
  }, []);

  useEffect(() => {
    preparar();
  }, [preparar]);

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function exportar() {
    const c = ref.current;
    if (!c) return;
    for (const escala of [1, 0.75, 0.5]) {
      const saida = document.createElement('canvas');
      saida.width = Math.round(LARGURA * escala);
      saida.height = Math.round(ALTURA * escala);
      const ctx = saida.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, saida.width, saida.height);
      ctx.drawImage(c, 0, 0, saida.width, saida.height);
      const png = saida.toDataURL('image/png');
      if (png.length <= MAXIMO || escala === 0.5) {
        aoMudar(png);
        return;
      }
    }
  }

  function limpar() {
    preparar();
    aoMudar(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{rotulo}</span>
        <button type="button" onClick={limpar} disabled={desativado || vazio} className="inline-flex items-center gap-1 text-[14px] font-semibold text-tinta-3 hover:text-tinta disabled:opacity-40">
          <Eraser size={15} aria-hidden="true" /> Limpar
        </button>
      </div>
      <canvas
        ref={ref}
        role="img"
        aria-label={vazio ? 'Quadro em branco para assinar com o dedo ou o mouse' : 'Assinatura feita no quadro'}
        className={`h-40 w-full touch-none rounded-xl bg-white ring-1 ring-linha ${desativado ? 'pointer-events-none opacity-60' : 'cursor-crosshair'}`}
        onPointerDown={(e) => {
          if (desativado) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          ultimo.current = ponto(e);
          const ctx = e.currentTarget.getContext('2d');
          if (ctx) {
            ctx.beginPath();
            ctx.arc(ultimo.current.x, ultimo.current.y, 1.2, 0, Math.PI * 2);
            ctx.fillStyle = '#1b1f22';
            ctx.fill();
          }
        }}
        onPointerMove={(e) => {
          if (!ultimo.current) return;
          const ctx = e.currentTarget.getContext('2d');
          const p = ponto(e);
          if (ctx) {
            ctx.beginPath();
            ctx.moveTo(ultimo.current.x, ultimo.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
          ultimo.current = p;
          if (vazio) setVazio(false);
        }}
        onPointerUp={() => {
          if (!ultimo.current) return;
          ultimo.current = null;
          setVazio(false);
          exportar();
        }}
        onPointerCancel={() => {
          ultimo.current = null;
        }}
      />
      <p className="text-[13px] text-tinta-3">Assine com o dedo ou com o mouse dentro do quadro.</p>
    </div>
  );
}
