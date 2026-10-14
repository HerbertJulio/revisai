'use client';

import { Mail, MessageCircle } from 'lucide-react';
import { useMemo, useOptimistic, useState, useTransition, type ReactNode } from 'react';
import { mudarSituacaoCadastro } from '@/app/admin/acoes';
import { useToast } from '@/components/Toasts';
import { Chip, classeBotao, Vazio } from '@/components/ui';
import {
  assuntoEmail,
  contarPor,
  mensagemCadastro,
  NOMES_ORIGEM,
  NOMES_PLANO,
  nomeDoTipo,
  quandoFoi,
  SITUACOES_CADASTRO,
  TIPOS_CADASTRO,
  type Cadastro,
  type SituacaoCadastro,
  type TipoCadastro
} from '@/lib/equipe-dados';
import { formatarTelefone } from '@/lib/formatos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { ChipSituacao, Filtro, LinhaDeFiltros, SeletorSituacao } from './comum';

const situacao = (id: SituacaoCadastro) => SITUACOES_CADASTRO.find((s) => s.id === id) ?? SITUACOES_CADASTRO[0];

export function ListaCadastros({
  cadastros,
  agora,
  comFiltros = true,
  vazio
}: {
  cadastros: Cadastro[];
  agora: number;
  comFiltros?: boolean;
  /** O que mostrar quando não há cadastros (no resumo, por exemplo). */
  vazio?: ReactNode;
}) {
  const toast = useToast();
  const [, iniciar] = useTransition();
  const [lista, aplicar] = useOptimistic(cadastros, (atual: Cadastro[], m: { id: number; situacao: SituacaoCadastro }) =>
    atual.map((c) => (c.id === m.id ? { ...c, situacao: m.situacao } : c))
  );
  const [tipo, setTipo] = useState<TipoCadastro | 'todos'>('todos');
  const [estado, setEstado] = useState<SituacaoCadastro | 'todos'>(() => (cadastros.some((c) => c.situacao === 'novo') ? 'novo' : 'todos'));

  const doTipo = useMemo(() => (tipo === 'todos' ? lista : lista.filter((c) => c.tipo === tipo)), [lista, tipo]);
  const porTipo = useMemo(() => contarPor(lista, (c) => c.tipo), [lista]);
  const porEstado = useMemo(() => contarPor(doTipo, (c) => c.situacao), [doTipo]);
  const visiveis = !comFiltros ? lista : estado === 'todos' ? doTipo : doTipo.filter((c) => c.situacao === estado);

  function mudar(c: Cadastro, nova: SituacaoCadastro, comDesfazer = false) {
    const anterior = c.situacao;
    if (anterior === nova) return;
    iniciar(async () => {
      aplicar({ id: c.id, situacao: nova });
      const r = await mudarSituacaoCadastro(c.id, nova);
      if (!r.ok) {
        toast({ texto: r.erro, tom: 'erro' });
        return;
      }
      if (comDesfazer) {
        toast({
          texto: `${c.nome} foi para ${situacao(nova).plural.toLowerCase()}.`,
          acao: { rotulo: 'Desfazer', fazer: () => mudar({ ...c, situacao: nova }, anterior) }
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {comFiltros ? (
        <div className="flex flex-col gap-2">
          <LinhaDeFiltros rotulo="Filtrar por tipo de cadastro">
            <Filtro ativo={tipo === 'todos'} aoClicar={() => setTipo('todos')} n={lista.length}>
              Todos
            </Filtro>
            {TIPOS_CADASTRO.map((t) => (
              <Filtro key={t.id} ativo={tipo === t.id} aoClicar={() => setTipo(t.id)} n={porTipo[t.id] ?? 0}>
                {t.plural}
              </Filtro>
            ))}
          </LinhaDeFiltros>
          <LinhaDeFiltros rotulo="Filtrar por situação">
            {SITUACOES_CADASTRO.map((s) => (
              <Filtro key={s.id} ativo={estado === s.id} aoClicar={() => setEstado(s.id)} n={porEstado[s.id] ?? 0}>
                {s.plural}
              </Filtro>
            ))}
            <Filtro ativo={estado === 'todos'} aoClicar={() => setEstado('todos')} n={doTipo.length}>
              Todas as situações
            </Filtro>
          </LinhaDeFiltros>
        </div>
      ) : null}

      {visiveis.length ? (
        <div className="flex flex-col gap-3">
          {visiveis.map((c) => (
            <CartaoCadastro key={c.id} cadastro={c} agora={agora} aoMudar={mudar} />
          ))}
        </div>
      ) : lista.length ? (
        <Vazio titulo="Nada por aqui">Nenhum cadastro com esses filtros.</Vazio>
      ) : vazio ? (
        vazio
      ) : (
        <Vazio titulo="Nenhum cadastro ainda">
          Quem preencher os formulários do site (oficinas querendo o Pro, fornecedores, donos de carro e contato) aparece aqui.
        </Vazio>
      )}
    </div>
  );
}

function CartaoCadastro({
  cadastro: c,
  agora,
  aoMudar
}: {
  cadastro: Cadastro;
  agora: number;
  aoMudar: (c: Cadastro, s: SituacaoCadastro, comDesfazer?: boolean) => void;
}) {
  const s = situacao(c.situacao);
  const whatsapp = c.whatsapp ? linkWhatsApp(c.whatsapp, mensagemCadastro(c)) : null;
  const email = c.email ? `mailto:${c.email}?subject=${encodeURIComponent(assuntoEmail(c))}` : null;
  const local = [c.cidade, c.uf].filter(Boolean).join(', ');
  const plano = c.plano ? NOMES_PLANO[c.plano] : null;
  const respondeu = () => {
    if (c.situacao === 'novo') aoMudar(c, 'respondido', true);
  };

  return (
    <article className="rounded-2xl bg-papel ring-1 ring-linha" aria-label={`Cadastro de ${c.nome}`}>
      <div className="px-4 pt-4 pb-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tom={c.tipo === 'fornecedor' ? 'caneta' : 'neutro'}>{nomeDoTipo(c.tipo)}</Chip>
          {plano ? <Chip tom={plano === 'Pro' ? 'oleo' : 'neutro'}>{plano === 'Grátis' ? 'Plano grátis' : `Quer o ${plano}`}</Chip> : null}
          <ChipSituacao nome={s.nome} tom={s.tom} />
          <span className="ml-auto text-[14px] text-tinta-3">{quandoFoi(c.criado_em, agora)}</span>
        </div>
        <p className="mt-2 text-[17px] font-bold break-words">{c.nome}</p>
        {c.empresa || local ? (
          <p className="flex flex-wrap gap-x-3 text-[14px] text-tinta-2">
            {c.empresa ? <span className="font-semibold">{c.empresa}</span> : null}
            {local ? <span>{local}</span> : null}
          </p>
        ) : null}
        {c.mensagem ? <p className="mt-2 rounded-xl bg-papel-2 px-3 py-2 text-[15px] leading-relaxed whitespace-pre-line text-tinta-2">{c.mensagem}</p> : null}
        {c.origem ? <p className="mt-2 text-[13px] text-tinta-3">Veio da {NOMES_ORIGEM[c.origem] ?? c.origem}</p> : null}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-linha px-4 py-3 sm:px-5">
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')} onClick={respondeu}>
            <MessageCircle size={16} aria-hidden="true" />
            {formatarTelefone(c.whatsapp ?? '')}
          </a>
        ) : null}
        {email ? (
          <a href={email} className={classeBotao('secundario', 'pequeno', 'max-w-full')} onClick={respondeu}>
            <Mail size={16} aria-hidden="true" />
            <span className="truncate">{c.email}</span>
          </a>
        ) : null}
        <SeletorSituacao valor={c.situacao} opcoes={SITUACOES_CADASTRO} aoMudar={(v) => aoMudar(c, v)} rotulo={`Situação do cadastro de ${c.nome}`} />
      </footer>
    </article>
  );
}
