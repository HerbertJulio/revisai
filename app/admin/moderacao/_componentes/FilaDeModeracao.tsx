'use client';

// A fila da moderação: as denúncias abertas juntas pelo produto (ou pela loja), com o que a equipe
// decide, os produtos fora da vitrine e as decisões recentes.

import { Ban, Eye, EyeOff, Flag, Search, Store } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FotoProduto } from '@/components/oficina/FotoProduto';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Vazio, classeEntrada } from '@/components/ui';
import { formatarMoeda } from '@/lib/formatos';
import { quandoFoi } from '@/lib/loja/comum';
import { nomeDoMotivo, SITUACOES_DA_DENUNCIA, type AcaoDaModeracao, type Denuncia, type GrupoDeDenuncias, type ProdutoForaDaVitrine } from '@/lib/loja/moderacao-dados';
import type { Categoria } from '@/lib/tipos';
import { decidirDenuncia, mudarVitrineDoProduto } from '../acoes';

const PERGUNTA: Partial<Record<AcaoDaModeracao, (g: GrupoDeDenuncias) => string>> = {
  desativar_loja: (g) => `Desativar a ${g.loja.nome}? A loja sai do ar para todas as oficinas até a equipe reativar.`,
  mostrar: () => 'Mostrar o produto de novo na vitrine e descartar as denúncias abertas dele?',
  manter_oculto: () => 'Manter o produto fora da vitrine e encerrar as denúncias abertas dele?'
};

const FEITO: Record<AcaoDaModeracao, string> = {
  analisar: 'Denúncia em análise.',
  descartar: 'Denúncia descartada.',
  manter_oculto: 'O produto ficou fora da vitrine.',
  mostrar: 'O produto voltou para a vitrine.',
  desativar_loja: 'A loja saiu do ar.'
};

export function FilaDeModeracao({ grupos, ocultos, decididas }: { grupos: GrupoDeDenuncias[]; ocultos: ProdutoForaDaVitrine[]; decididas: Denuncia[] }) {
  const toast = useToast();
  const [ocupado, iniciar] = useTransition();
  const agora = Date.now();

  function agir(denunciaId: string, acao: AcaoDaModeracao, resolucao: string, grupo?: GrupoDeDenuncias) {
    const pergunta = grupo ? PERGUNTA[acao]?.(grupo) : null;
    if (pergunta && !window.confirm(pergunta)) return;
    iniciar(async () => {
      try {
        const r = await decidirDenuncia(denunciaId, acao, resolucao);
        toast(r.ok ? { texto: FEITO[acao] } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Nada mudou.', tom: 'erro' });
      }
    });
  }

  function mostrar(p: ProdutoForaDaVitrine) {
    if (!window.confirm(`Mostrar ${p.nome} de novo na vitrine?`)) return;
    iniciar(async () => {
      try {
        const r = await mudarVitrineDoProduto(p.id, true);
        toast(r.ok ? { texto: 'O produto voltou para a vitrine.' } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Nada mudou.', tom: 'erro' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="mod-abertas">
        <h2 id="mod-abertas" className="text-[21px]">
          Para decidir
        </h2>
        {grupos.length ? (
          <ul className="flex flex-col gap-4">
            {grupos.map((g) => (
              <li key={g.chave}>
                <Grupo grupo={g} agora={agora} ocupado={ocupado} agir={agir} />
              </li>
            ))}
          </ul>
        ) : (
          <Vazio titulo="Nenhuma denúncia aberta">Quando uma oficina denunciar um produto ou uma loja, aparece aqui. Produto denunciado por 3 oficinas sai da vitrine sozinho até a equipe decidir.</Vazio>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="mod-ocultos">
        <h2 id="mod-ocultos" className="text-[21px]">
          Fora da vitrine
        </h2>
        {ocultos.length ? (
          <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
            {ocultos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <EyeOff size={18} className="text-atraso" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{[p.marca, p.nome].filter(Boolean).join(' ')}</p>
                  <p className="text-[13.5px] text-tinta-3">
                    {p.loja} · {formatarMoeda(p.preco)}
                  </p>
                </div>
                <Botao tamanho="pequeno" onClick={() => mostrar(p)} disabled={ocupado}>
                  <Eye size={15} aria-hidden="true" /> Mostrar de novo
                </Botao>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14.5px] text-tinta-3">Nenhum produto fora da vitrine pela moderação.</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="mod-decididas">
        <h2 id="mod-decididas" className="text-[21px]">
          Decididas há pouco
        </h2>
        {decididas.length ? (
          <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
            {decididas.map((d) => {
              const s = SITUACOES_DA_DENUNCIA[d.situacao];
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[14px] sm:px-5">
                  <span className="min-w-0">
                    <span className="font-semibold">{d.produto ? d.produto.nome : d.loja.nome}</span>
                    <span className="text-tinta-3"> · {nomeDoMotivo(d.motivo)} · {d.oficina.nome}</span>
                    {d.resolucao ? <span className="block text-tinta-2">{d.resolucao}</span> : null}
                  </span>
                  <span className="flex items-center gap-2 text-[13px] text-tinta-3">
                    <Chip tom={s.tom}>{s.nome}</Chip>
                    {d.resolvidoEm ? quandoFoi(d.resolvidoEm, agora) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14.5px] text-tinta-3">Nada decidido ainda.</p>
        )}
      </section>
    </div>
  );
}

function Grupo({
  grupo: g,
  agora,
  ocupado,
  agir
}: {
  grupo: GrupoDeDenuncias;
  agora: number;
  ocupado: boolean;
  agir: (id: string, acao: AcaoDaModeracao, resolucao: string, grupo?: GrupoDeDenuncias) => void;
}) {
  const [anotacao, setAnotacao] = useState('');
  const primeira = g.denuncias[0];
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={g.produto ? `Denúncias de ${g.produto.nome}` : `Denúncias da ${g.loja.nome}`}>
      <div className="flex flex-wrap items-start gap-3">
        {g.produto ? (
          <FotoProduto
            produto={{ imagemUrl: g.produto.imagemUrl, categoria: (g.produto.categoria ?? 'oleo_motor') as Categoria, nome: g.produto.nome }}
            tamanhos="64px"
            className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-linha"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-papel-2 text-tinta-2">
            <Store size={26} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold">{g.produto ? [g.produto.marca, g.produto.nome].filter(Boolean).join(' ') : `A loja ${g.loja.nome}`}</p>
          <p className="text-[13.5px] text-tinta-3">
            {g.produto ? `${g.loja.nome}${g.produto.preco != null ? ` · ${formatarMoeda(g.produto.preco)}` : ''}` : 'Denúncia da loja, sem produto'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip tom="oleo">
              <Flag size={13} aria-hidden="true" /> {g.oficinas} {g.oficinas === 1 ? 'oficina' : 'oficinas'}
            </Chip>
            {g.produto?.oculto ? <Chip tom="atraso">Fora da vitrine</Chip> : null}
            {g.produto && !g.produto.ativo ? <Chip>A loja tirou da venda</Chip> : null}
            {!g.loja.ativo ? <Chip tom="atraso">Loja fora do ar</Chip> : null}
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-2 rounded-xl bg-papel-2 px-3 py-3">
        {g.denuncias.map((d) => {
          const s = SITUACOES_DA_DENUNCIA[d.situacao];
          return (
            <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 text-[14px]">
              <div className="min-w-0 flex-1">
                <p>
                  <strong>{nomeDoMotivo(d.motivo)}</strong>
                  <span className="text-tinta-3">
                    {' '}
                    ·{' '}
                    <Link href={`/admin/oficinas/${d.oficinaId}`} className="text-caneta hover:underline">
                      {d.oficina.nome}
                    </Link>
                    {d.oficina.cidade ? `, ${d.oficina.cidade}` : ''} · {quandoFoi(d.criadoEm, agora)}
                  </span>
                </p>
                {d.texto ? <p className="mt-0.5 text-tinta-2">“{d.texto}”</p> : null}
              </div>
              <span className="flex items-center gap-1.5">
                <Chip tom={s.tom}>{s.nome}</Chip>
                {d.situacao === 'nova' ? (
                  <button type="button" onClick={() => agir(d.id, 'analisar', '')} disabled={ocupado} className="text-[13px] font-semibold text-caneta hover:underline">
                    <Search size={13} aria-hidden="true" className="mr-0.5 inline" />
                    Analisar
                  </button>
                ) : null}
                <button type="button" onClick={() => agir(d.id, 'descartar', anotacao)} disabled={ocupado} className="text-[13px] font-semibold text-tinta-3 hover:text-atraso">
                  Descartar
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13.5px] font-semibold">Anotação da decisão (opcional, fica no histórico)</span>
        <input className={classeEntrada} value={anotacao} onChange={(e) => setAnotacao(e.target.value)} maxLength={500} placeholder="Ex.: nota fiscal conferida com a loja" />
      </label>

      <div className="flex flex-wrap gap-2">
        {g.produto ? (
          <>
            <Botao tamanho="pequeno" variante="escuro" onClick={() => agir(primeira.id, 'manter_oculto', anotacao, g)} disabled={ocupado}>
              <EyeOff size={15} aria-hidden="true" /> Manter fora da vitrine
            </Botao>
            <Botao tamanho="pequeno" onClick={() => agir(primeira.id, 'mostrar', anotacao, g)} disabled={ocupado}>
              <Eye size={15} aria-hidden="true" /> Mostrar de novo
            </Botao>
          </>
        ) : null}
        {g.loja.ativo ? (
          <Botao tamanho="pequeno" variante="perigo" onClick={() => agir(primeira.id, 'desativar_loja', anotacao, g)} disabled={ocupado}>
            <Ban size={15} aria-hidden="true" /> Desativar a loja
          </Botao>
        ) : null}
      </div>
    </article>
  );
}
