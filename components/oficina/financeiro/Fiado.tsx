'use client';

// O fiado em aberto, junto por cliente: os vencidos em cima, com o lembrete de um toque pelo
// WhatsApp (valor, vencimento e o Pix copia e cola), e o que ainda está no prazo.

import { HandCoins, KeyRound } from 'lucide-react';
import { useMemo } from 'react';
import { Botao, Chip, Vazio } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import { chavePixDaOficina, fiadosPorCliente, type FiadoDoCliente } from '@/lib/financeiro';
import { formatarMoeda, formatarTelefone, SEM_NOME } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { textoDaParcela } from './comum';
import { BotaoLembrete, textoDoLembrado } from './lembrete';

export function Fiado({ hoje, aoAbrir, aoIrParaPix }: { hoje: string; aoAbrir: (id: Id) => void; aoIrParaPix: () => void }) {
  const lancamentos = useOficina((s) => s.lancamentos);
  const oficina = useOficina((s) => s.oficina);
  const grupos = useMemo(() => fiadosPorCliente(Object.values(lancamentos), hoje), [lancamentos, hoje]);
  const vencidos = grupos.filter((g) => g.vencido > 0);
  const noPrazo = grupos.filter((g) => g.vencido === 0);
  const temChave = !!chavePixDaOficina(oficina);

  if (!grupos.length)
    return (
      <Vazio titulo="Nenhum fiado em aberto">
        Quando o cliente leva o carro e paga depois, toque em Receber na ordem de serviço e escolha Fiado, com o dia de pagar. O app avisa quando vencer e manda o lembrete com o Pix.
      </Vazio>
    );

  return (
    <div className="flex flex-col gap-6">
      {!temChave ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-oleo-claro px-4 py-3 text-oleo-tinta">
          <KeyRound size={18} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[14.5px]">Cadastre a chave Pix da oficina para o lembrete já ir com o Pix copia e cola do valor.</p>
          <Botao tamanho="pequeno" variante="escuro" onClick={aoIrParaPix}>
            Cadastrar
          </Botao>
        </div>
      ) : null}

      <section className="flex flex-col gap-3" aria-label="Fiado vencido">
        <h2 className="text-[21px]">
          Vencido <span className="num text-[15px] font-semibold text-tinta-3">{vencidos.length}</span>
        </h2>
        {vencidos.length ? (
          <ul className="flex flex-col gap-3">
            {vencidos.map((g) => (
              <li key={g.chave}>
                <CartaoDoFiado grupo={g} hoje={hoje} aoAbrir={aoAbrir} soVencidos />
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl bg-ok-claro px-4 py-3 font-semibold text-ok">
            <HandCoins size={18} aria-hidden="true" /> Nenhum fiado vencido.
          </p>
        )}
      </section>

      {noPrazo.length ? (
        <section className="flex flex-col gap-3" aria-label="Fiado no prazo">
          <h2 className="text-[21px]">
            No prazo <span className="num text-[15px] font-semibold text-tinta-3">{noPrazo.length}</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {noPrazo.map((g) => (
              <li key={g.chave}>
                <CartaoDoFiado grupo={g} hoje={hoje} aoAbrir={aoAbrir} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CartaoDoFiado({ grupo: g, hoje, aoAbrir, soVencidos = false }: { grupo: FiadoDoCliente; hoje: string; aoAbrir: (id: Id) => void; soVencidos?: boolean }) {
  const cliente = useOficina((s) => (g.clienteId ? s.clientes[g.clienteId] : undefined));
  const nome = cliente ? (cliente.nome === SEM_NOME ? 'Cliente sem nome' : cliente.nome) : (g.lancamentos[0]?.descricao ?? 'Sem cliente');
  // no lembrete dos vencidos vai só o que venceu; nos do prazo, o que está em aberto
  const doLembrete = soVencidos ? g.lancamentos.filter((l) => l.vencimento < hoje) : g.lancamentos;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{nome}</p>
          <p className="text-[13.5px] text-tinta-3">
            {cliente?.telefone ? formatarTelefone(cliente.telefone) : 'Sem WhatsApp cadastrado'}
            {g.lembradoEm ? ` · ${textoDoLembrado(g.lembradoEm)}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="largo num text-[19px] font-extrabold">{formatarMoeda(soVencidos ? g.vencido : g.total)}</span>
          {soVencidos && g.total > g.vencido ? <span className="text-[12.5px] text-tinta-3">de {formatarMoeda(g.total)} em aberto</span> : null}
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-linha rounded-xl ring-1 ring-linha">
        {g.lancamentos.map((l) => (
          <li key={l.id}>
            <button type="button" onClick={() => aoAbrir(l.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] hover:bg-papel-2">
              <span className="min-w-0 flex-1 truncate">
                {l.descricao}
                {textoDaParcela(l) ? <span className="text-tinta-3"> · {textoDaParcela(l)}</span> : null}
              </span>
              {l.vencimento < hoje ? <Chip tom="atraso">venceu {formatarData(l.vencimento).slice(0, 5)}</Chip> : <span className="text-tinta-3">vence {formatarData(l.vencimento).slice(0, 5)}</span>}
              <span className="num font-semibold">{formatarMoeda(l.valor)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <BotaoLembrete itens={doLembrete} hoje={hoje} tamanho="pequeno" />
        <Botao tamanho="pequeno" variante="fantasma" onClick={() => aoAbrir(doLembrete[0]?.id ?? g.lancamentos[0].id)}>
          Recebi
        </Botao>
      </div>
    </div>
  );
}
