'use client';

// Orçamentos e ordens de serviço da oficina. O orçamento vai para o cliente pelo WhatsApp e,
// quando ele aprova, vira uma ordem já preenchida; a ordem concluída registra o serviço.

import { Check, ChevronDown, ClipboardList, FileText, MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Vazio, classeBotao } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import { gruposDeLinhas, situacaoVisivel, SITUACOES, tituloDoDocumento, totais, totalDaLinha, validoAte, type SituacaoVisivel } from '@/lib/documentos';
import { formatarKm, formatarMoeda, formatarNumero, SEM_NOME } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import type { Documento, Id } from '@/lib/tipos';
import { useConcluirOrdem, useMandarOrcamento } from './documentos';
import { aoAprovarOrcamento, aoRecusarOrcamento, PaineisDaOrdem } from './extensoes';
import { EscolhaDaAprovacao, formaInicial, provaDaAprovacao, type FormaDaAprovacao } from './servico/Aprovar';
import { janelaParaDepois } from './servico/comum';
import { mandarCopiaDaAprovacao } from './servico/copia';
import { EscutaDasRespostas } from './servico/Escuta';

type Aba = 'orcamentos' | 'ordens';

const GRUPOS: Record<Aba, { titulo: string; situacoes: SituacaoVisivel[]; fechado?: boolean }[]> = {
  orcamentos: [
    { titulo: 'Esperando o cliente', situacoes: ['enviado'] },
    { titulo: 'Rascunhos', situacoes: ['rascunho'] },
    { titulo: 'Aprovados', situacoes: ['aprovado'] },
    { titulo: 'Recusados e vencidos', situacoes: ['recusado', 'vencido'], fechado: true }
  ],
  ordens: [
    { titulo: 'Em andamento', situacoes: ['aberta'] },
    { titulo: 'Concluídas', situacoes: ['concluida'] },
    { titulo: 'Canceladas', situacoes: ['cancelada'], fechado: true }
  ]
};

export function Ordens() {
  const params = useSearchParams();
  const router = useRouter();
  const hoje = useHoje();
  const documentos = useOficina((s) => s.documentos);
  const [aberto, setAberto] = useState<Id | null>(params.get('ver'));
  const aba: Aba = params.get('aba') === 'ordens' ? 'ordens' : 'orcamentos';
  const lista = useMemo(() => Object.values(documentos).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)), [documentos]);
  const contagem = {
    orcamentos: lista.filter((d) => d.tipo === 'orcamento' && situacaoVisivel(d, hoje) === 'enviado').length,
    ordens: lista.filter((d) => d.tipo === 'ordem' && d.situacao === 'aberta').length
  };
  const doc = aberto ? documentos[aberto] : undefined;

  function trocar(a: Aba) {
    router.replace(a === 'ordens' ? '/oficina/ordens?aba=ordens' : '/oficina/ordens');
  }

  return (
    <div className="flex flex-col gap-6">
      <EscutaDasRespostas />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Ordens e orçamentos</h1>
          <p className="mt-1 max-w-[60ch] text-tinta-2">O orçamento vai para o cliente aprovar pelo WhatsApp. Aprovado, vira ordem de serviço já preenchida.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/oficina/nova?tipo=orcamento" className={classeBotao('secundario')}>
            <FileText size={17} aria-hidden="true" /> Novo orçamento
          </Link>
          <Link href="/oficina/nova?tipo=ordem" className={classeBotao('primario')}>
            <Plus size={18} aria-hidden="true" /> Nova OS
          </Link>
        </div>
      </header>

      <div className="flex gap-1 self-start rounded-[12px] bg-papel-2 p-1" role="tablist" aria-label="Tipo">
        {(['orcamentos', 'ordens'] as Aba[]).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => trocar(a)}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold ${aba === a ? 'bg-papel text-tinta shadow-sm' : 'text-tinta-2 hover:text-tinta'}`}
          >
            {a === 'orcamentos' ? 'Orçamentos' : 'Ordens de serviço'}
            {contagem[a] ? <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-oleo px-1.5 text-[11.5px] font-bold text-[#1b1f22]">{contagem[a]}</span> : null}
          </button>
        ))}
      </div>

      <Lista aba={aba} lista={lista.filter((d) => d.tipo === (aba === 'ordens' ? 'ordem' : 'orcamento'))} hoje={hoje} aoAbrir={setAberto} />

      <Folha aberta={!!doc} aoFechar={() => setAberto(null)} titulo={doc ? tituloDoDocumento(doc) : ''} descricao={doc ? SITUACOES[situacaoVisivel(doc, hoje)].nome : undefined}>
        {doc ? <Detalhe doc={doc} hoje={hoje} aoFechar={() => setAberto(null)} aoAbrir={setAberto} /> : null}
      </Folha>
    </div>
  );
}

function Lista({ aba, lista, hoje, aoAbrir }: { aba: Aba; lista: Documento[]; hoje: string; aoAbrir: (id: Id) => void }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  if (!lista.length)
    return (
      <Vazio
        titulo={aba === 'ordens' ? 'Nenhuma ordem de serviço ainda' : 'Nenhum orçamento ainda'}
        acao={
          <Link href={aba === 'ordens' ? '/oficina/nova?tipo=ordem' : '/oficina/nova?tipo=orcamento'} className={classeBotao('primario')}>
            {aba === 'ordens' ? 'Fazer a primeira OS' : 'Fazer o primeiro orçamento'}
          </Link>
        }
      >
        {aba === 'ordens' ? 'A ordem guarda o que foi feito em cada carro. Concluída, ela gera os avisos das próximas trocas.' : 'Depois da vistoria, monte o orçamento falando ou tocando e mande o link para o cliente aprovar.'}
      </Vazio>
    );
  return (
    <div className="flex flex-col gap-6">
      {GRUPOS[aba].map((g) => {
        const doGrupo = lista.filter((d) => g.situacoes.includes(situacaoVisivel(d, hoje)));
        if (!doGrupo.length) return null;
        const fechado = g.fechado && !abertos.has(g.titulo);
        return (
          <section key={g.titulo} className="flex flex-col gap-2.5" aria-label={g.titulo}>
            <button
              type="button"
              onClick={() => setAbertos((x) => new Set(x.has(g.titulo) ? [...x].filter((y) => y !== g.titulo) : [...x, g.titulo]))}
              className="flex items-center gap-2 self-start text-[17px] font-bold"
              aria-expanded={!fechado}
            >
              {g.titulo} <span className="num text-[14px] font-semibold text-tinta-3">{doGrupo.length}</span>
              {g.fechado ? <ChevronDown size={17} className={`text-tinta-3 transition-transform ${fechado ? '' : 'rotate-180'}`} aria-hidden="true" /> : null}
            </button>
            {fechado ? null : (
              <ul className="flex flex-col gap-2.5">
                {doGrupo.slice(0, g.situacoes.includes('concluida') ? 30 : 100).map((d) => (
                  <li key={d.id}>
                    <Cartao doc={d} hoje={hoje} aoAbrir={() => aoAbrir(d.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function useCarro(doc: Documento) {
  const veiculo = useOficina((s) => (doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  return { veiculo, cliente, nome: cliente?.nome === SEM_NOME ? 'Cliente sem nome' : (cliente?.nome ?? '') };
}

function Cartao({ doc, hoje, aoAbrir }: { doc: Documento; hoje: string; aoAbrir: () => void }) {
  const { veiculo, nome } = useCarro(doc);
  const situacao = situacaoVisivel(doc, hoje);
  const s = SITUACOES[situacao];
  const t = totais(doc);
  const servicos = gruposDeLinhas(doc.linhas.filter((l) => !l.recusada)).map((g) => g.titulo);
  return (
    <button type="button" onClick={aoAbrir} className="flex w-full flex-col gap-2 rounded-2xl bg-papel px-4 py-3.5 text-left ring-1 ring-linha hover:ring-tinta-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="largo num font-extrabold">{tituloDoDocumento(doc)}</span>
        <Chip tom={s.tom === 'neutro' ? 'neutro' : s.tom}>{s.nome}</Chip>
        {doc.tipo === 'orcamento' ? <Chip>{doc.modalidade === 'pago' ? 'Pago' : 'Frio'}</Chip> : null}
        <span className="num ml-auto text-[17px] font-extrabold">{t.total > 0 || !t.semPreco ? formatarMoeda(t.total) : <span className="text-[14px] font-semibold text-tinta-3">sem valor</span>}</span>
      </div>
      <div className="flex min-w-0 items-center gap-2.5">
        {veiculo?.placa ? <Placa placa={veiculo.placa} /> : null}
        <span className="min-w-0 truncate text-[14.5px] font-semibold">{[veiculo?.modelo, nome].filter(Boolean).join(', ') || 'Sem carro'}</span>
      </div>
      <p className="line-clamp-1 text-[13.5px] text-tinta-3">
        {servicos.join(', ')}
        {servicos.length ? '. ' : ''}
        {doc.tipo === 'orcamento' && situacao === 'enviado' ? `Vale até ${formatarData(validoAte(doc))}.` : `Feito em ${formatarData(doc.data)}.`}
      </p>
    </button>
  );
}

function Detalhe({ doc, hoje, aoFechar, aoAbrir }: { doc: Documento; hoje: string; aoFechar: () => void; aoAbrir: (id: Id) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { veiculo, cliente, nome } = useCarro(doc);
  const aprovar = useOficina((s) => s.aprovarOrcamento);
  const recusar = useOficina((s) => s.recusarOrcamento);
  const cancelar = useOficina((s) => s.cancelarOrdem);
  const remover = useOficina((s) => s.removerDocumento);
  const marcarEnviado = useOficina((s) => s.marcarEnviado);
  const concluir = useConcluirOrdem();
  const mandarOrcamento = useMandarOrcamento();
  const [aprovando, setAprovando] = useState(false);
  const [recusadas, setRecusadas] = useState<Set<Id>>(new Set());
  const [forma, setForma] = useState<FormaDaAprovacao>(formaInicial);
  const [ocupado, setOcupado] = useState(false);
  const situacao = situacaoVisivel(doc, hoje);
  const t = totais(doc);
  const ehOrcamento = doc.tipo === 'orcamento';

  async function mandar() {
    if (!cliente?.telefone) {
      toast({ texto: 'O cliente não tem WhatsApp cadastrado. Edite o orçamento e escreva o número.', tom: 'erro' });
      return;
    }
    if (doc.situacao === 'rascunho' || situacao === 'vencido') marcarEnviado(doc.id);
    // a janela abre já no toque; o link do servidor fica pronto em seguida
    const janela = janelaParaDepois();
    setOcupado(true);
    const l = await mandarOrcamento(doc.id);
    setOcupado(false);
    if (!l.ok || !l.whatsapp) {
      janela.fechar();
      toast({ texto: l.ok ? 'O WhatsApp do cliente não parece certo. Edite o cadastro.' : l.erro, tom: 'erro' });
      return;
    }
    janela.ir(l.whatsapp);
    if (l.servidor) toast({ texto: 'Link mandado. Quando o cliente responder, a aprovação aparece aqui sozinha.' });
  }

  async function confirmarAprovacao() {
    const fora = [...recusadas];
    if (fora.length >= doc.linhas.length) {
      toast({ texto: 'Deixe pelo menos um item aprovado.', tom: 'erro' });
      return;
    }
    setOcupado(true);
    const prova = await provaDaAprovacao(doc, fora, forma);
    setOcupado(false);
    if (!prova.ok) {
      toast({ texto: prova.erro, tom: 'erro' });
      return;
    }
    const ordemId = aprovar(doc.id, fora);
    if (!ordemId) {
      toast({ texto: 'Deixe pelo menos um item aprovado.', tom: 'erro' });
      return;
    }
    const aprovado = useOficina.getState().documentos[doc.id];
    if (aprovado) useOficina.getState().salvarDocumento({ ...aprovado, aprovacao: prova.aprovacao });
    aoAprovarOrcamento(doc.id, ordemId, fora);
    void mandarCopiaDaAprovacao(doc.id);
    toast({ texto: 'Aprovado. A ordem de serviço já está pronta para começar.' });
    setAprovando(false);
    router.replace('/oficina/ordens?aba=ordens');
    aoAbrir(ordemId);
  }

  function concluirAgora() {
    const r = concluir(doc.id, hoje);
    if (r.erro) {
      toast({ texto: r.erro, tom: 'erro' });
      return;
    }
    toast({ texto: `${tituloDoDocumento(doc)} concluída. Os avisos das próximas trocas já estão contando.` });
    aoFechar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        {veiculo?.placa ? <Placa placa={veiculo.placa} /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{[veiculo?.marca, veiculo?.modelo, veiculo?.ano].filter(Boolean).join(' ') || 'Sem carro'}</p>
          <p className="truncate text-[13.5px] text-tinta-2">{[nome, doc.km != null ? formatarKm(doc.km) : '', formatarData(doc.data)].filter(Boolean).join(', ')}</p>
        </div>
        {veiculo ? (
          <Link href={`/oficina/carro?id=${veiculo.id}`} className="text-[14px] font-semibold text-caneta hover:underline">
            Ver o carro
          </Link>
        ) : null}
      </div>

      {aprovando ? <p className="rounded-xl bg-caneta-claro px-3.5 py-2.5 text-[14px] text-caneta">Desmarque o que o cliente não aprovou. O resto vira a ordem de serviço.</p> : null}

      <ul className="flex flex-col divide-y divide-linha rounded-xl ring-1 ring-linha">
        {doc.linhas.map((l) => {
          const fora = aprovando ? recusadas.has(l.id) : !!l.recusada;
          return (
            <li key={l.id} className={`flex items-center gap-3 px-3.5 py-2.5 text-[14.5px] ${fora ? 'text-tinta-3 line-through' : ''}`}>
              {aprovando ? (
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-tinta)]"
                  checked={!recusadas.has(l.id)}
                  onChange={(e) => setRecusadas((x) => new Set(e.target.checked ? [...x].filter((y) => y !== l.id) : [...x, l.id]))}
                  aria-label={`Aprovado: ${l.descricao}`}
                />
              ) : null}
              <span className="min-w-0 flex-1">
                {l.descricao}
                {l.quantidade !== 1 || l.unidade === 'L' ? (
                  <span className="num text-tinta-3">
                    {' '}
                    · {formatarNumero(l.quantidade, 2)} {l.unidade === 'L' ? 'L' : l.unidade === 'h' ? 'h' : 'un'}
                  </span>
                ) : null}
              </span>
              <span className="num font-semibold">{l.valorUnitario != null ? formatarMoeda(totalDaLinha(l)) : '—'}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-0.5 rounded-xl bg-papel-2 px-3.5 py-3">
        {t.desconto ? <p className="text-[13.5px] text-tinta-2">Desconto de {formatarMoeda(t.desconto)}</p> : null}
        {ehOrcamento && doc.modalidade === 'pago' && doc.vistoria ? (
          <p className="text-[13.5px] text-tinta-2">
            Vistoria de {formatarMoeda(doc.vistoria.valor)}
            {doc.vistoria.abater ? ', abatida quando aprovar' : ', cobrada à parte'}
          </p>
        ) : null}
        <p className="flex items-baseline justify-between">
          <span className="font-semibold">Total</span>
          <span className="largo num text-[24px] font-extrabold">{formatarMoeda(t.total)}</span>
        </p>
      </div>

      {doc.diagnostico ? <p className="text-[14.5px] text-tinta-2">{doc.diagnostico}</p> : null}
      {doc.orcamentoId ? (
        <button type="button" onClick={() => aoAbrir(doc.orcamentoId!)} className="self-start text-[14px] font-semibold text-caneta hover:underline">
          Veio do orçamento
        </button>
      ) : null}

      {ehOrcamento && aprovando ? <EscolhaDaAprovacao forma={forma} aoMudar={setForma} nomeDoCliente={cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : ''} /> : <PaineisDaOrdem doc={doc} />}

      <div className="flex flex-wrap gap-2 border-t border-linha pt-4">
        {ehOrcamento && aprovando ? (
          <>
            <Botao variante="primario" disabled={ocupado} onClick={() => void confirmarAprovacao()}>
              <Check size={17} aria-hidden="true" /> Confirmar aprovação
            </Botao>
            <Botao variante="fantasma" onClick={() => setAprovando(false)}>
              Cancelar
            </Botao>
          </>
        ) : ehOrcamento ? (
          <>
            {situacao === 'aprovado' && doc.ordemId ? (
              <Botao variante="escuro" onClick={() => aoAbrir(doc.ordemId!)}>
                <ClipboardList size={17} aria-hidden="true" /> Ver a ordem de serviço
              </Botao>
            ) : situacao !== 'recusado' ? (
              <>
                <Botao
                  variante="primario"
                  onClick={() => {
                    setForma(formaInicial());
                    setAprovando(true);
                  }}
                >
                  <Check size={17} aria-hidden="true" /> Aprovado
                </Botao>
                {cliente?.telefone ? (
                  <Botao variante="whatsapp" disabled={ocupado} onClick={() => void mandar()}>
                    <MessageCircle size={17} aria-hidden="true" /> {ocupado ? 'Preparando…' : doc.situacao === 'rascunho' ? 'Mandar' : 'Mandar de novo'}
                  </Botao>
                ) : null}
                <Botao
                  variante="perigo"
                  onClick={() => {
                    recusar(doc.id);
                    aoRecusarOrcamento(doc.id);
                    toast({ texto: 'Anotado: o cliente não quis agora.' });
                  }}
                >
                  <X size={17} aria-hidden="true" /> Recusado
                </Botao>
              </>
            ) : null}
            {situacao !== 'aprovado' ? (
              <Link href={`/oficina/nova?editar=${doc.id}`} className={classeBotao('fantasma')}>
                <Pencil size={16} aria-hidden="true" /> Editar
              </Link>
            ) : null}
          </>
        ) : doc.situacao === 'aberta' ? (
          <>
            <Botao variante="primario" onClick={concluirAgora}>
              <Check size={17} aria-hidden="true" /> Concluir
            </Botao>
            <Link href={`/oficina/nova?editar=${doc.id}`} className={classeBotao('secundario')}>
              <Pencil size={16} aria-hidden="true" /> Editar
            </Link>
            <Botao
              variante="fantasma"
              onClick={() => {
                if (!window.confirm('Cancelar esta ordem de serviço?')) return;
                cancelar(doc.id);
                aoFechar();
              }}
            >
              Cancelar a OS
            </Botao>
          </>
        ) : doc.situacao === 'concluida' && doc.atendimentoId ? (
          <Link href={`/oficina/etiqueta?atendimento=${doc.atendimentoId}`} className={classeBotao('secundario')}>
            Imprimir etiqueta
          </Link>
        ) : null}
        {doc.situacao !== 'concluida' ? (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Apagar ${tituloDoDocumento(doc).toLowerCase()}?`)) return;
              remover(doc.id);
              aoFechar();
            }}
            className="ml-auto grid h-11 w-11 place-items-center rounded-[10px] text-tinta-3 hover:bg-papel-2 hover:text-atraso"
            aria-label="Apagar"
          >
            <Trash2 size={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Os orçamentos e ordens de um carro, na página dele. */
export function DocumentosDoCarro({ veiculoId }: { veiculoId: Id }) {
  const documentos = useOficina((s) => s.documentos);
  const hoje = useHoje();
  const lista = Object.values(documentos)
    .filter((d) => d.veiculoId === veiculoId)
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="t-docs-carro">
      <h2 id="t-docs-carro" className="text-[21px]">
        Orçamentos e ordens
      </h2>
      <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
        {lista.slice(0, 20).map((d) => {
          const s = SITUACOES[situacaoVisivel(d, hoje)];
          return (
            <li key={d.id}>
              <Link href={`/oficina/ordens?${d.tipo === 'ordem' ? 'aba=ordens&' : ''}ver=${d.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-papel-2 sm:px-5">
                <span className="largo num font-extrabold">{tituloDoDocumento(d)}</span>
                <Chip tom={s.tom === 'neutro' ? 'neutro' : s.tom}>{s.nome}</Chip>
                <span className="text-[13.5px] text-tinta-3">{formatarData(d.data)}</span>
                <span className="num ml-auto font-semibold">{formatarMoeda(totais(d).total)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
