'use client';

// A previsão de compras dos próximos 30 dias, para as lojas da região prepararem ofertas. Vai uma
// vez por dia, só da oficina da conta que ligou o compartilhamento (uma linha por oficina; as
// lojas veem só a soma da região).

import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { enviarDemanda } from '@/app/acoes';
import { useConta } from '@/components/conta/ProvedorConta';
import { useToast } from '@/components/Toasts';
import { Alternar } from '@/components/ui';
import { itensParaComprar } from '@/lib/avisos';
import type { Catalogo } from '@/lib/catalogo';
import { itensDaDemanda } from '@/lib/demanda';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { calcularDemanda } from '@/lib/recomendacao';
import { useOficina } from '@/lib/store';
import { useCatalogo } from './catalogo';

const INTERVALO_MS = 20 * 60 * 60_000;

let emAndamento: Promise<boolean> | null = null;

function mandar(dados: ReturnType<typeof useDadosAvisos>, catalogo: Catalogo, hoje: string): Promise<boolean> {
  emAndamento ??= enviarPrevisao(dados, catalogo, hoje).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function enviarPrevisao(dados: ReturnType<typeof useDadosAvisos>, catalogo: Catalogo, hoje: string): Promise<boolean> {
  const s = useOficina.getState();
  const linhas = calcularDemanda(itensParaComprar(dados, hoje, 30), catalogo, hoje, 30);
  try {
    const r = await enviarDemanda({ uf: /^[A-Z]{2}$/.test(s.oficina.uf) ? s.oficina.uf : '', cidade: s.oficina.cidade.trim().slice(0, 80), itens: itensDaDemanda(linhas) });
    if (r.ok) s.marcarDemandaEnviada();
    return r.ok;
  } catch {
    return false;
  }
}

/** Com o compartilhamento ligado e a conta, manda a previsão uma vez por dia, quando o app abre. */
export function useEnvioDeDemanda() {
  const ligado = useOficina((s) => s.preferencias.compartilharDemanda);
  const enviadaEm = useOficina((s) => s.demandaEnviadaEm);
  const { oficina } = useConta();
  const { catalogo, carregando } = useCatalogo();
  const dados = useDadosAvisos();
  const hoje = useHoje();
  const oficinaId = oficina?.id ?? null;
  useEffect(() => {
    if (!ligado || carregando || !oficinaId) return;
    if (enviadaEm && Date.now() - new Date(enviadaEm).getTime() < INTERVALO_MS) return;
    void mandar(dados, catalogo, hoje);
    // só ao abrir, ao entrar e quando liga; as mudanças do dia vão no envio de amanhã
  }, [ligado, carregando, oficinaId]);
}

/** O convite para compartilhar a previsão de compras, na loja. */
export function CartaoDemanda() {
  const ligado = useOficina((s) => s.preferencias.compartilharDemanda);
  const uf = useOficina((s) => s.oficina.uf);
  const salvar = useOficina((s) => s.salvarPreferencias);
  const { conta } = useConta();
  const { catalogo } = useCatalogo();
  const dados = useDadosAvisos();
  const hoje = useHoje();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);

  async function mudar(v: boolean) {
    salvar({ compartilharDemanda: v });
    if (!v) {
      toast({ texto: 'Pronto. A previsão deixa de ser enviada.' });
      return;
    }
    if (!conta) {
      toast({ texto: 'Ligado. A previsão vai quando você entrar na sua conta.' });
      return;
    }
    setOcupado(true);
    const ok = await mandar(dados, catalogo, hoje);
    setOcupado(false);
    toast(ok ? { texto: 'Previsão enviada. Os fornecedores da região veem a soma, sem saber de quem é.' } : { texto: 'Ligado. A previsão vai quando a internet voltar.', tom: 'erro' });
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:items-center sm:px-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-oleo-claro text-oleo-tinta">
        <Megaphone size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <Alternar
          id="loja-demanda"
          ligado={ligado}
          aoMudar={(v) => void mudar(v)}
          rotulo="Receber ofertas para o que vou comprar"
          descricao={`Os fornecedores${uf ? ` de ${uf}` : ''} veem só a soma do que as oficinas da região vão precisar nos próximos 30 dias e preparam promoções. Não vai nome de cliente, placa nem o nome da oficina.${ocupado ? ' Enviando…' : ''}`}
        />
        {!conta ? (
          <p className="mt-2 text-[13.5px] text-tinta-3">
            A previsão vai só para quem tem conta.{' '}
            <Link href="/entrar?para=/oficina/loja" className="font-semibold text-caneta hover:underline">
              Entrar
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
