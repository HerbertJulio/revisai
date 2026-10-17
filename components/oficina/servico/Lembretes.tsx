'use client';

// Os lembretes no início (os que chegaram na data) e na página do carro: o que o cliente recusou
// no orçamento, os recalls e as anotações, cada um com a mensagem pronta para o WhatsApp e as
// ações avisado, feito, adiar e descartar.

import { BellRing, Car, Check, Clock3, MessageCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Menu } from '@/components/Menu';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, classeBotao } from '@/components/ui';
import { grupoDeLembretes, type ItemDeLembrete } from '@/lib/avisos';
import { formatarData, somarDias } from '@/lib/datas';
import { formatarMoeda, SEM_NOME } from '@/lib/formatos';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { mensagemDoLembrete, MOTIVOS_DO_LEMBRETE } from '@/lib/lembretes';
import type { Lembrete } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useEhMecanico } from './conta';

const TOM_DO_MOTIVO = { recusado: 'oleo', recall: 'atraso', manual: 'caneta' } as const;

function useAcoesDoLembrete() {
  const toast = useToast();
  const hoje = useHoje();
  return (l: Lembrete, acao: 'avisado' | 'feito' | 'descartado' | 'adiar7' | 'adiar30', silencioso = false) => {
    const s = useOficina.getState();
    const antes = s.lembretes[l.id];
    if (!antes) return;
    const base = antes.data > hoje ? antes.data : hoje;
    const parte: Partial<Lembrete> =
      acao === 'avisado'
        ? { situacao: 'avisado', avisadoEm: new Date().toISOString() }
        : acao === 'adiar7'
          ? { situacao: 'aberto', data: somarDias(base, 7) }
          : acao === 'adiar30'
            ? { situacao: 'aberto', data: somarDias(base, 30) }
            : { situacao: acao };
    s.salvarRegistro('lembretes', { ...antes, ...parte });
    if (silencioso) return;
    const texto = { avisado: 'Marcado como avisado.', feito: 'Marcado como feito.', descartado: 'Lembrete descartado.', adiar7: 'Adiado por uma semana.', adiar30: 'Adiado por um mês.' }[acao];
    toast({ texto, acao: { rotulo: 'Desfazer', fazer: () => useOficina.getState().salvarRegistro('lembretes', antes) } });
  };
}

function CartaoDoLembrete({ item, hoje, noCarro = false }: { item: ItemDeLembrete; hoje: string; noCarro?: boolean }) {
  const { lembrete: l, veiculo, cliente } = item;
  const router = useRouter();
  const oficina = useOficina((s) => s.oficina.nome);
  const mecanico = useEhMecanico();
  const agir = useAcoesDoLembrete();
  const nome = cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : '';
  const texto = mensagemDoLembrete(l, { cliente: nome, oficina, veiculo });
  const zap = cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null;
  const atrasado = l.situacao === 'aberto' && l.data < hoje;
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha" aria-label={`${MOTIVOS_DO_LEMBRETE[l.motivo]}: ${l.descricao}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tom={TOM_DO_MOTIVO[l.motivo]}>{MOTIVOS_DO_LEMBRETE[l.motivo]}</Chip>
        {!noCarro && veiculo ? <Placa placa={veiculo.placa} /> : null}
        {!noCarro ? <span className="min-w-0 truncate text-[14px] text-tinta-2">{[veiculo?.modelo, nome].filter(Boolean).join(', ')}</span> : null}
        <span className={`ml-auto text-[13px] font-semibold ${atrasado ? 'text-atraso' : 'text-tinta-3'}`}>
          {l.situacao === 'avisado' && l.avisadoEm ? `Avisado em ${formatarData(l.avisadoEm.slice(0, 10))}` : l.data > hoje ? `Para ${formatarData(l.data)}` : `Desde ${formatarData(l.data)}`}
        </span>
      </div>
      <p className="font-semibold">
        {l.descricao}
        {!mecanico && l.valorEstimado ? <span className="num font-normal text-tinta-2"> · {formatarMoeda(l.valorEstimado)}</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao(l.situacao === 'aberto' ? 'whatsapp' : 'secundario', 'pequeno')} onClick={() => agir(l, 'avisado', true)}>
            <MessageCircle size={15} aria-hidden="true" /> {l.situacao === 'avisado' ? 'Avisar de novo' : 'WhatsApp'}
          </a>
        ) : veiculo ? (
          <Link href={`/oficina/carro?id=${veiculo.id}`} className={classeBotao('secundario', 'pequeno')}>
            Cadastrar telefone
          </Link>
        ) : null}
        <Botao tamanho="pequeno" onClick={() => agir(l, 'feito')}>
          <Check size={15} aria-hidden="true" /> Feito
        </Botao>
        <div className="ml-auto">
          <Menu
            rotulo="Mais opções do lembrete"
            itens={[
              ...(l.situacao !== 'avisado' ? [{ rotulo: 'Marcar como avisado', fazer: () => agir(l, 'avisado'), icone: <BellRing size={17} /> }] : []),
              { rotulo: 'Adiar uma semana', fazer: () => agir(l, 'adiar7'), icone: <Clock3 size={17} /> },
              { rotulo: 'Adiar um mês', fazer: () => agir(l, 'adiar30'), icone: <Clock3 size={17} /> },
              ...(veiculo && !noCarro ? [{ rotulo: 'Ver o carro', fazer: () => router.push(`/oficina/carro?id=${veiculo.id}`), icone: <Car size={17} /> }] : []),
              { rotulo: 'Descartar', fazer: () => agir(l, 'descartado'), icone: <Trash2 size={17} />, perigo: true }
            ]}
          />
        </div>
      </div>
    </article>
  );
}

/** No início: os lembretes que chegaram na data, em um grupo próprio. */
export function GrupoDeLembretes() {
  const lembretes = useOficina((s) => s.lembretes);
  const dados = useDadosAvisos();
  const hoje = useHoje();
  const lista = useMemo(() => grupoDeLembretes(lembretes, dados, hoje), [lembretes, dados, hoje]);
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="t-lembretes">
      <h2 id="t-lembretes" className="flex items-center gap-2 text-[19px]">
        <BellRing size={19} aria-hidden="true" /> Lembretes <span className="num text-[14px] font-semibold text-tinta-3">{lista.length}</span>
      </h2>
      <div className="flex flex-col gap-2.5">
        {lista.slice(0, 20).map((item) => (
          <CartaoDoLembrete key={item.lembrete.id} item={item} hoje={hoje} />
        ))}
      </div>
    </section>
  );
}

/** Na página do carro: os lembretes em aberto e os avisados. */
export function LembretesDoCarro({ veiculoId }: { veiculoId: Id }) {
  const lembretes = useOficina((s) => s.lembretes);
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const hoje = useHoje();
  const lista = useMemo(
    () =>
      Object.values(lembretes)
        .filter((l) => l.veiculoId === veiculoId && (l.situacao === 'aberto' || l.situacao === 'avisado'))
        .sort((a, b) => (a.data < b.data ? -1 : 1)),
    [lembretes, veiculoId]
  );
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="t-lembretes-carro">
      <h2 id="t-lembretes-carro" className="text-[21px]">
        Lembretes
      </h2>
      <div className="flex flex-col gap-2.5">
        {lista.map((l) => (
          <CartaoDoLembrete key={l.id} item={{ lembrete: l, veiculo, cliente }} hoje={hoje} noCarro />
        ))}
      </div>
    </section>
  );
}
