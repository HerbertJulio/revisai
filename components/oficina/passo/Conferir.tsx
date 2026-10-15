'use client';

// A conferência antes de salvar: o carro, os serviços com as peças, o total, a próxima troca de
// cada serviço (na ordem) e, no orçamento, validade, prazo e pagamento. Avisa o que falta no estoque.

import { Pencil, ShoppingCart, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IconeServico } from '@/components/icones';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Campo, classeArea, classeEntrada } from '@/components/ui';
import { calcularVencimento, estimarRodagem, pontosDoVeiculo } from '@/lib/agenda';
import { quantidadeComUnidade } from '@/lib/catalogo';
import { formatarData, somarDias } from '@/lib/datas';
import { textoQuantidade } from '@/lib/estoque';
import { formatarKm, formatarMoeda, formatarNumero, lerNumero, normalizarTelefone } from '@/lib/formatos';
import { rotuloIntervalo, servico as infoServico } from '@/lib/manutencao';
import { linhaDaMaoDeObra, linhaDaPeca, linhasAvulsas, mudarLinha, totaisDoRascunho, type Rascunho } from '@/lib/passo';
import { useOficina } from '@/lib/store';
import type { LinhaDocumento, ServicoId, Veiculo } from '@/lib/tipos';
import { useCatalogo } from '../catalogo';
import { usePrazoDoServico } from '../prazos';
import { embalagensPara } from './opcoes';

export interface ResumoDoCarro {
  placa: string;
  titulo: string;
  dono: string;
  telefone: string;
  veiculo: Veiculo | undefined;
}

export function Conferir({ r, carro, hoje, aoMudar, aoEditar }: { r: Rascunho; carro: ResumoDoCarro; hoje: string; aoMudar: (r: Rascunho) => void; aoEditar: (passo: Rascunho['passo']) => void }) {
  const t = totaisDoRascunho(r);
  const km = r.kmNaoSei ? null : lerNumero(r.km);
  const ordem = r.tipo !== 'orcamento';

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha">
        {carro.placa ? <Placa placa={carro.placa} /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{carro.titulo || 'Carro'}</p>
          <p className="truncate text-[14px] text-tinta-2">{[carro.dono, km != null ? formatarKm(km) : 'sem quilometragem'].filter(Boolean).join(', ')}</p>
        </div>
        <button type="button" onClick={() => aoEditar(r.veiculoId ? 'km' : 'carro')} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[14px] font-semibold text-caneta hover:bg-caneta-claro">
          <Pencil size={15} aria-hidden="true" /> Mudar
        </button>
      </section>

      <section className="flex flex-col gap-2" aria-label="Serviços">
        <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {r.servicos.map((s) => (
            <LinhaDoServico key={s} s={s} r={r} km={km} hoje={hoje} veiculo={carro.veiculo} mostrarPrazo={ordem} aoMudar={aoMudar} />
          ))}
          {linhasAvulsas(r).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[14.5px]">
              <span>{l.descricao}</span>
              <span className="num font-semibold">{l.valorUnitario != null ? formatarMoeda(l.valorUnitario * l.quantidade) : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 px-1">
          <button type="button" onClick={() => aoEditar('servicos')} className="text-[14px] font-semibold text-caneta hover:underline">
            Mudar serviços
          </button>
          <button type="button" onClick={() => aoEditar('valores')} className="text-[14px] font-semibold text-caneta hover:underline">
            Mudar valores
          </button>
        </div>
      </section>

      <FaltaNoEstoque r={r} orcamento={r.tipo === 'orcamento'} />

      <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-tinta px-5 py-4 text-papel">
        <span className="font-semibold">{t.desconto ? `Total com ${formatarMoeda(t.desconto)} de desconto` : 'Total'}</span>
        <span className="largo num text-[30px] font-extrabold">{formatarMoeda(t.total)}</span>
      </div>

      {r.tipo === 'orcamento' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Vale por quantos dias" htmlFor="c-validade" dica={`Até ${formatarData(somarDias(hoje, r.validadeDias))}.`}>
            <input
              id="c-validade"
              className={`${classeEntrada} num`}
              value={String(r.validadeDias)}
              onChange={(e) => aoMudar({ ...r, validadeDias: Math.min(90, Math.max(1, Math.round(lerNumero(e.target.value) ?? 10))) })}
              inputMode="numeric"
            />
          </Campo>
          <Campo rotulo="Prazo para ficar pronto" htmlFor="c-prazo" dica="Opcional. Ex.: 1 dia útil.">
            <input id="c-prazo" className={classeEntrada} value={r.prazo} onChange={(e) => aoMudar({ ...r, prazo: e.target.value })} maxLength={80} />
          </Campo>
          <Campo rotulo="Forma de pagamento" htmlFor="c-pagamento" dica="Opcional. Ex.: Pix ou cartão em até 3 vezes." className="sm:col-span-2">
            <input id="c-pagamento" className={classeEntrada} value={r.pagamento} onChange={(e) => aoMudar({ ...r, pagamento: e.target.value })} maxLength={120} />
          </Campo>
        </div>
      ) : null}

      <Campo rotulo={r.tipo === 'orcamento' ? 'O que foi visto no carro' : 'Observações'} htmlFor="c-diag" dica={r.tipo === 'orcamento' ? 'Vai no orçamento para o cliente entender por que fazer.' : 'Opcional. Fica no histórico do carro.'}>
        <textarea id="c-diag" rows={3} className={classeArea} value={r.diagnostico} onChange={(e) => aoMudar({ ...r, diagnostico: e.target.value })} maxLength={800} />
      </Campo>

      {r.tipo === 'orcamento' && !normalizarTelefone(carro.telefone) ? (
        <Campo rotulo="WhatsApp do cliente" htmlFor="c-whats" dica="Para mandar o orçamento. Com DDD." erro={r.dono.telefone.trim() && !normalizarTelefone(r.dono.telefone) ? 'Confira o número, com DDD.' : null}>
          <input id="c-whats" className={classeEntrada} value={r.dono.telefone} onChange={(e) => aoMudar({ ...r, dono: { ...r.dono, telefone: e.target.value } })} inputMode="tel" placeholder="(21) 98765-4321" />
        </Campo>
      ) : null}
    </div>
  );
}

function LinhaDoServico({ s, r, km, hoje, veiculo, mostrarPrazo, aoMudar }: { s: ServicoId; r: Rascunho; km: number | null; hoje: string; veiculo: Veiculo | undefined; mostrarPrazo: boolean; aoMudar: (r: Rascunho) => void }) {
  const prazo = usePrazoDoServico();
  const atendimentos = useOficina((x) => x.atendimentos);
  const leituras = useOficina((x) => x.leituras);
  const kmMesPadrao = useOficina((x) => x.preferencias.kmMesPadrao);
  const [editando, setEditando] = useState(false);
  const peca = linhaDaPeca(r, s);
  const mao = linhaDaMaoDeObra(r, s);
  const comPrazo = r.linhas.find((l) => l.servico === s && (l.intervaloKm !== undefined || l.intervaloMeses !== undefined));
  const sugerido = prazo(s, peca?.produto ?? null, veiculo);
  const intervalo = comPrazo ? { km: comPrazo.intervaloKm ?? null, meses: comPrazo.intervaloMeses ?? null } : { km: km == null ? null : sugerido.km, meses: sugerido.meses };
  const valor = [peca, mao].reduce((soma, l) => soma + (l?.valorUnitario != null ? l.valorUnitario * l.quantidade : 0), 0);

  const venc = useMemo(() => {
    if (!mostrarPrazo) return null;
    const pontos = veiculo ? pontosDoVeiculo(veiculo.id, Object.values(atendimentos), Object.values(leituras)) : [];
    const base = { data: hoje, km: km ?? 0 };
    const rodagem = estimarRodagem(km != null ? [...pontos, base] : pontos, veiculo, kmMesPadrao, hoje);
    return calcularVencimento(base, { km: km == null ? null : intervalo.km, meses: intervalo.meses }, [], rodagem.kmDia, hoje);
  }, [mostrarPrazo, veiculo, atendimentos, leituras, km, hoje, intervalo.km, intervalo.meses, kmMesPadrao]);

  function mudarPrazo(m: { km?: number | null; meses?: number | null }) {
    const alvo: LinhaDocumento | undefined = peca ?? mao ?? r.linhas.find((l) => l.servico === s);
    if (!alvo) {
      // serviço sem linha (sem peça e sem mão de obra): guarda o prazo numa linha de serviço sem valor
      const id = `p${Date.now().toString(36)}`;
      aoMudar({ ...r, linhas: [...r.linhas, { id, tipo: 'servico', servico: s, descricao: infoServico(s).nome, quantidade: 1, unidade: 'un', valorUnitario: null, intervaloKm: m.km ?? intervalo.km, intervaloMeses: m.meses ?? intervalo.meses }] });
      return;
    }
    aoMudar(mudarLinha(r, alvo.id, { intervaloKm: m.km !== undefined ? m.km : intervalo.km, intervaloMeses: m.meses !== undefined ? m.meses : intervalo.meses }));
  }

  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-start gap-3">
        <IconeServico servico={s} size={20} className="mt-0.5 shrink-0 text-tinta-2" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{infoServico(s).nome}</p>
          {peca ? (
            <p className="text-[13.5px] text-tinta-2">
              {peca.descricao}, {formatarNumero(peca.quantidade, 2)} {peca.unidade === 'L' ? 'L' : 'un'}
            </p>
          ) : null}
        </div>
        <span className="num shrink-0 font-semibold">{valor ? formatarMoeda(valor) : ''}</span>
      </div>
      {mostrarPrazo ? (
        <div className="ml-8 text-[13.5px] text-tinta-3">
          {venc?.dataLimite || venc?.kmLimite ? (
            <p>
              Próxima: <strong className="text-tinta-2">{[venc.dataLimite ? formatarData(venc.dataLimite) : '', venc.kmLimite ? formatarKm(venc.kmLimite) : ''].filter(Boolean).join(' ou ')}</strong> ({rotuloIntervalo(intervalo)}).{' '}
              <button type="button" onClick={() => setEditando((v) => !v)} className="font-semibold text-caneta hover:underline">
                {editando ? 'Pronto' : 'Mudar'}
              </button>
            </p>
          ) : (
            <p>
              Sem prazo para a próxima.{' '}
              <button type="button" onClick={() => setEditando(true)} className="font-semibold text-caneta hover:underline">
                Pôr prazo
              </button>
            </p>
          )}
          {editando ? (
            <div className="mt-2 grid max-w-sm grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-tinta-2">
                Em km
                <input className={classeEntrada} defaultValue={intervalo.km ?? ''} inputMode="numeric" onChange={(e) => mudarPrazo({ km: lerNumero(e.target.value) || null })} disabled={km == null} placeholder={km == null ? 'sem km' : ''} />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-tinta-2">
                Em meses
                <input className={classeEntrada} defaultValue={intervalo.meses ?? ''} inputMode="numeric" onChange={(e) => mudarPrazo({ meses: lerNumero(e.target.value) || null })} />
              </label>
              <p className="col-span-2 text-[12.5px] text-tinta-3">{comPrazo ? 'Prazo escolhido por você.' : `${sugerido.origem}.`}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** As peças das linhas que o estoque não cobre, com o produto da loja para pedir. */
function FaltaNoEstoque({ r, orcamento }: { r: Rascunho; orcamento: boolean }) {
  const estoque = useOficina((s) => s.estoque);
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const { produto } = useCatalogo();
  const toast = useToast();
  const faltas = useMemo(() => {
    const usado = new Map<string, number>();
    for (const l of r.linhas) if (l.tipo === 'peca' && l.estoqueId) usado.set(l.estoqueId, (usado.get(l.estoqueId) ?? 0) + l.quantidade);
    const lista: { nome: string; tem: number; falta: number; unidade: 'un' | 'L'; produtoId?: number; comprar?: number; rotulo?: string }[] = [];
    for (const [id, q] of usado) {
      const i = estoque[id];
      if (!i || i.quantidade >= q) continue;
      const p = i.produtoLojaId != null ? produto(i.produtoLojaId) : undefined;
      const falta = Math.round((q - i.quantidade) * 100) / 100;
      const comprar = p ? embalagensPara(p, falta) : undefined;
      lista.push({ nome: i.nome, tem: i.quantidade, falta, unidade: i.unidade, produtoId: p?.id, comprar, rotulo: p && comprar ? quantidadeComUnidade(p, comprar) : undefined });
    }
    // no orçamento, as peças da loja que não estão no estoque vão precisar ser compradas
    for (const l of orcamento ? r.linhas : []) {
      if (l.tipo !== 'peca' || l.estoqueId || l.produto?.id == null) continue;
      const p = produto(l.produto.id);
      if (!p) continue;
      const comprar = embalagensPara(p, l.quantidade);
      lista.push({ nome: l.descricao, tem: 0, falta: l.quantidade, unidade: l.unidade === 'L' ? 'L' : 'un', produtoId: p.id, comprar, rotulo: quantidadeComUnidade(p, comprar) });
    }
    return lista;
  }, [r.linhas, estoque, produto, orcamento]);
  if (!faltas.length) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-oleo-claro px-4 py-3.5 text-oleo-tinta" aria-label="Falta no estoque">
      <p className="flex items-center gap-2 font-bold">
        <TriangleAlert size={17} aria-hidden="true" /> {orcamento ? 'Vai precisar comprar' : 'O estoque não cobre'}
      </p>
      <ul className="flex flex-col gap-2">
        {faltas.map((f) => (
          <li key={f.nome} className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="min-w-0 flex-1">
              {f.nome}: {f.tem > 0 ? `tem ${textoQuantidade(f.tem, f.unidade)}, ` : ''}faltam {textoQuantidade(f.falta, f.unidade)}
            </span>
            {f.produtoId != null && f.comprar ? (
              <button
                type="button"
                onClick={() => {
                  adicionar(f.produtoId!, f.comprar!);
                  toast({ texto: `${f.rotulo} no pedido da loja.` });
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-tinta px-3 text-[13.5px] font-semibold text-papel"
              >
                <ShoppingCart size={15} aria-hidden="true" /> Pôr {f.rotulo} no pedido
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
