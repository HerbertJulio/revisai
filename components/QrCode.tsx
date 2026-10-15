'use client';

import { useMemo } from 'react';
import { encode } from 'uqr';

/** QR Code em SVG (um caminho só, nítido em qualquer tamanho). */
export function QrCode({ texto, rotulo, className = '' }: { texto: string; rotulo: string; className?: string }) {
  const { tamanho, caminho } = useMemo(() => {
    const qr = encode(texto, { ecc: 'M', border: 3 });
    let d = '';
    qr.data.forEach((linha, y) => {
      let x = 0;
      while (x < linha.length) {
        if (!linha[x]) {
          x++;
          continue;
        }
        let fim = x;
        while (fim < linha.length && linha[fim]) fim++;
        d += `M${x} ${y}h${fim - x}v1h-${fim - x}z`;
        x = fim;
      }
    });
    return { tamanho: qr.size, caminho: d };
  }, [texto]);
  return (
    <svg viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={rotulo} className={className} shapeRendering="crispEdges">
      <rect width={tamanho} height={tamanho} fill="#fff" />
      <path d={caminho} fill="#000" />
    </svg>
  );
}
