'use client';

// O hub de gestão (ERP) da oficina: os números do negócio em abas. Começa pelo estoque valorizado
// e recebe o resultado (DRE), o fluxo de caixa e os indicadores conforme os módulos entram.

import { useState, type ComponentType } from 'react';
import { Dre } from './Dre';
import { EstoqueValorizado } from './EstoqueValorizado';
import { FluxoCaixa } from './FluxoCaixa';
import { Painel } from './Painel';

interface Aba {
  id: string;
  rotulo: string;
  Conteudo: ComponentType;
}

const ABAS: Aba[] = [
  { id: 'painel', rotulo: 'Painel', Conteudo: Painel },
  { id: 'resultado', rotulo: 'Resultado', Conteudo: Dre },
  { id: 'caixa', rotulo: 'Fluxo de caixa', Conteudo: FluxoCaixa },
  { id: 'estoque', rotulo: 'Estoque', Conteudo: EstoqueValorizado }
];

export function Gestao() {
  const [aba, setAba] = useState(ABAS[0].id);
  const Atual = (ABAS.find((a) => a.id === aba) ?? ABAS[0]).Conteudo;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="largo text-[26px] leading-tight">Gestão</h1>
        <p className="mt-1 text-[15px] text-tinta-2">Os números do seu negócio: quanto está parado em peças, o resultado e o caixa.</p>
      </div>

      {ABAS.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === aba}
              onClick={() => setAba(a.id)}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${a.id === aba ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta-2 hover:text-tinta'}`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      ) : null}

      <Atual />
    </div>
  );
}
