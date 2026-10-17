'use client';

// No cartão de manutenção: o atalho para o histórico verificado do carro, quando a oficina tem
// conta e o cartão trouxe o link (os dados do cartão ficam no fragmento do endereço).

import { BadgeCheck, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { decodificarCartao, historicoDoCartao } from '@/lib/cartao';

export function HistoricoNoCartao() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const ler = () => {
      const c = decodificarCartao(window.location.hash.slice(1));
      setUrl(c ? historicoDoCartao(window.location.origin, c) : null);
    };
    ler();
    window.addEventListener('hashchange', ler);
    return () => window.removeEventListener('hashchange', ler);
  }, []);
  if (!url) return null;
  return (
    <a href={url} className="mx-auto mt-6 flex max-w-2xl items-center gap-3 rounded-2xl bg-ok-claro px-4 py-3.5 text-ok ring-1 ring-ok/20 hover:brightness-[0.98] print:hidden">
      <BadgeCheck size={22} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Histórico de serviços confirmado pela oficina</span>
        <span className="block text-[14px]">Os serviços feitos no carro, com data, km e peças. Bom para mostrar na hora de vender.</span>
      </span>
      <ChevronRight size={20} className="shrink-0" aria-hidden="true" />
    </a>
  );
}
