'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useConta } from '@/components/conta/ProvedorConta';
import { Vazio } from '@/components/ui';
import { telasExtras } from './extensoes';

/** As outras telas da oficina (financeiro, agenda, relatórios, clube...). */
export function Mais() {
  const { oficina } = useConta();
  // sem conta, quem usa o aparelho é o dono; com conta, o mecânico não vê o dinheiro
  const gestao = !oficina || oficina.papel !== 'mecanico';
  const telas = telasExtras().filter((t) => gestao || !t.soGestao);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="largo text-[30px] sm:text-[34px]">Mais</h1>
        <p className="text-tinta-2">Tudo o que a oficina tem além dos avisos, das ordens e da loja.</p>
      </header>
      {telas.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {telas.map(({ href, rotulo, descricao, Icone }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 rounded-2xl bg-papel-2 px-4 py-3.5 ring-1 ring-linha hover:brightness-[0.98]">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-papel text-tinta">
                  <Icone size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{rotulo}</span>
                  <span className="block text-[13.5px] text-tinta-3">{descricao}</span>
                </span>
                <ChevronRight size={18} className="text-tinta-3" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo="Nada por aqui ainda">As outras telas da oficina aparecem aqui.</Vazio>
      )}
    </div>
  );
}
