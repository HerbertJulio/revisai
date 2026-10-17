'use client';

// O carro visto de cima (frente para cima), para marcar as avarias do checklist. Tocando no
// desenho, a marca entra na posição (de 0 a 1 em cada eixo).

export interface MarcaNoCarro {
  id: string;
  x?: number | null;
  y?: number | null;
}

export function CarroDeCima({ marcas, aoTocar, selecionada, rotulo = 'Desenho do carro visto de cima' }: { marcas: MarcaNoCarro[]; aoTocar?: (x: number, y: number) => void; selecionada?: string | null; rotulo?: string }) {
  return (
    <svg
      viewBox="0 0 200 400"
      role="img"
      aria-label={aoTocar ? `${rotulo}. Toque onde está a avaria.` : rotulo}
      className={`mx-auto block h-auto w-full max-w-[220px] select-none ${aoTocar ? 'cursor-crosshair' : ''}`}
      onClick={(e) => {
        if (!aoTocar) return;
        const r = e.currentTarget.getBoundingClientRect();
        aoTocar((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      <text x="100" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.6">
        FRENTE
      </text>
      {/* rodas */}
      {[
        [16, 72],
        [166, 72],
        [16, 272],
        [166, 272]
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="18" height="56" rx="6" fill="#3a4146" />
      ))}
      {/* retrovisores */}
      <ellipse cx="24" cy="150" rx="9" ry="6" fill="#cbd1ce" stroke="#4b545a" strokeWidth="2" />
      <ellipse cx="176" cy="150" rx="9" ry="6" fill="#cbd1ce" stroke="#4b545a" strokeWidth="2" />
      {/* carroceria */}
      <rect x="30" y="20" width="140" height="364" rx="46" fill="#f2f4f3" stroke="#4b545a" strokeWidth="3" />
      {/* capô */}
      <path d="M52 40 Q100 26 148 40" fill="none" stroke="#9aa3a8" strokeWidth="2" />
      <line x1="100" y1="36" x2="100" y2="112" stroke="#9aa3a8" strokeWidth="1.5" strokeDasharray="4 4" />
      {/* para-brisa */}
      <path d="M44 128 Q100 108 156 128 L146 166 Q100 154 54 166 Z" fill="#cfe0e6" stroke="#4b545a" strokeWidth="2" />
      {/* teto */}
      <rect x="54" y="168" width="92" height="92" rx="10" fill="#e6e9e7" stroke="#9aa3a8" strokeWidth="1.5" />
      {/* vidro traseiro */}
      <path d="M54 262 Q100 272 146 262 L154 292 Q100 306 46 292 Z" fill="#cfe0e6" stroke="#4b545a" strokeWidth="2" />
      {/* portas */}
      <line x1="34" y1="200" x2="52" y2="200" stroke="#9aa3a8" strokeWidth="1.5" />
      <line x1="148" y1="200" x2="166" y2="200" stroke="#9aa3a8" strokeWidth="1.5" />
      {/* porta-malas */}
      <path d="M52 362 Q100 374 148 362" fill="none" stroke="#9aa3a8" strokeWidth="2" />
      <text x="100" y="396" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.6">
        TRASEIRA
      </text>
      {marcas.map((m, i) =>
        m.x != null && m.y != null ? (
          <g key={m.id} transform={`translate(${m.x * 200} ${m.y * 400})`}>
            <circle r="12" fill={selecionada === m.id ? '#2546c2' : '#c7361f'} stroke="#ffffff" strokeWidth="2.5" />
            <text y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#ffffff">
              {i + 1}
            </text>
          </g>
        ) : null
      )}
    </svg>
  );
}
