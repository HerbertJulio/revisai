// Orçamentos e ordens de serviço. O orçamento vai para o cliente aprovar (frio, sem custo, ou pago,
// com a vistoria cobrada); aprovado, vira uma ordem já descrita. A ordem concluída registra o serviço,
// que é o que gera os avisos das próximas trocas, e tira as peças do estoque.

import { formatarData } from './datas';
import { formatarMoeda, formatarPlaca, primeiroNome } from './formatos';
import { servico as infoServico } from './manutencao';
import type { Documento, Id, ItemServico, LinhaDocumento, ProdutoUsado, ServicoId, SituacaoDocumento, TipoDocumento } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const VALIDADE_PADRAO = 10;

export function totalDaLinha(l: Pick<LinhaDocumento, 'quantidade' | 'valorUnitario'>): number {
  return l.valorUnitario == null ? 0 : r2(l.quantidade * l.valorUnitario);
}

export interface Totais {
  pecas: number;
  servicos: number;
  outros: number;
  subtotal: number;
  desconto: number;
  total: number;
  /** Linhas ainda sem preço (o total pode estar incompleto). */
  semPreco: number;
}

/** Os totais, só com as linhas que o cliente aprovou. */
export function totais(d: Pick<Documento, 'linhas' | 'desconto'>): Totais {
  let pecas = 0;
  let servicos = 0;
  let outros = 0;
  let semPreco = 0;
  for (const l of d.linhas) {
    if (l.recusada) continue;
    // serviço sem valor é serviço incluído; peça sem valor é preço que falta
    if (l.valorUnitario == null && l.tipo !== 'servico') semPreco++;
    const v = totalDaLinha(l);
    if (l.tipo === 'peca') pecas += v;
    else if (l.tipo === 'servico') servicos += v;
    else outros += v;
  }
  const subtotal = r2(pecas + servicos + outros);
  const desconto = r2(Math.min(Math.max(0, d.desconto ?? 0), Math.max(0, subtotal)));
  return { pecas: r2(pecas), servicos: r2(servicos), outros: r2(outros), subtotal, desconto, total: r2(Math.max(0, subtotal - desconto)), semPreco };
}

/** Até quando vale o orçamento: a data em que foi mandado (ou feito) mais a validade. */
export function validoAte(d: Pick<Documento, 'data' | 'enviadoEm' | 'validadeDias'>): string {
  const inicio = d.enviadoEm ? d.enviadoEm.slice(0, 10) : d.data;
  const [a, m, dia] = inicio.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, dia + (d.validadeDias ?? VALIDADE_PADRAO))).toISOString().slice(0, 10);
}

export type SituacaoVisivel = SituacaoDocumento | 'vencido';

/** A situação como a tela mostra: o orçamento mandado que passou da validade aparece como vencido. */
export function situacaoVisivel(d: Pick<Documento, 'tipo' | 'situacao' | 'data' | 'enviadoEm' | 'validadeDias'>, hoje: string): SituacaoVisivel {
  if (d.tipo === 'orcamento' && (d.situacao === 'enviado' || d.situacao === 'rascunho') && validoAte(d) < hoje) return 'vencido';
  return d.situacao;
}

export const SITUACOES: Record<SituacaoVisivel, { nome: string; tom: 'oleo' | 'caneta' | 'ok' | 'atraso' | 'neutro' }> = {
  rascunho: { nome: 'Rascunho', tom: 'neutro' },
  enviado: { nome: 'Esperando o cliente', tom: 'oleo' },
  vencido: { nome: 'Vencido', tom: 'neutro' },
  aprovado: { nome: 'Aprovado', tom: 'ok' },
  recusado: { nome: 'Recusado', tom: 'atraso' },
  aberta: { nome: 'Em andamento', tom: 'caneta' },
  concluida: { nome: 'Concluída', tom: 'ok' },
  cancelada: { nome: 'Cancelada', tom: 'neutro' }
};

export function nomeDoTipo(t: TipoDocumento, curto = false): string {
  if (t === 'orcamento') return 'Orçamento';
  return curto ? 'OS' : 'Ordem de serviço';
}

/** "Orçamento nº 12", "OS nº 7". */
export function tituloDoDocumento(d: Pick<Documento, 'tipo' | 'numero'>): string {
  return `${nomeDoTipo(d.tipo, true)} nº ${d.numero}`;
}

/** O próximo número de cada tipo (os dois contam separado, como no talão da oficina). */
export function proximoNumero(contadores: Partial<Record<TipoDocumento, number>>, documentos: Pick<Documento, 'tipo' | 'numero'>[], tipo: TipoDocumento): number {
  const maior = documentos.filter((d) => d.tipo === tipo).reduce((m, d) => Math.max(m, d.numero), 0);
  return Math.max(contadores[tipo] ?? 0, maior) + 1;
}

/** A ordem que nasce do orçamento aprovado: só os itens aprovados, e a vistoria paga sai do total. */
export function ordemDoOrcamento(orc: Documento, ctx: { id: Id; numero: number; agora: string; hoje: string; novoId: () => Id }): Documento {
  const linhas: LinhaDocumento[] = orc.linhas.filter((l) => !l.recusada).map((l) => ({ ...l, id: ctx.novoId() }));
  if (orc.modalidade === 'pago' && orc.vistoria && orc.vistoria.valor > 0 && orc.vistoria.abater) {
    linhas.push({ id: ctx.novoId(), tipo: 'outro', descricao: 'Vistoria já paga (abatida)', quantidade: 1, unidade: 'un', valorUnitario: -orc.vistoria.valor });
  }
  return {
    id: ctx.id,
    numero: ctx.numero,
    tipo: 'ordem',
    situacao: 'aberta',
    veiculoId: orc.veiculoId,
    km: orc.km,
    data: ctx.hoje,
    linhas,
    desconto: orc.desconto,
    diagnostico: orc.diagnostico,
    observacao: orc.observacao,
    recomendacoes: orc.recomendacoes,
    relato: orc.relato,
    prazo: orc.prazo,
    pagamento: orc.pagamento,
    orcamentoId: orc.id,
    criadoEm: ctx.agora,
    atualizadoEm: ctx.agora
  };
}

/** Os serviços distintos das linhas, na ordem em que aparecem. */
export function servicosDoDocumento(d: Pick<Documento, 'linhas'>): ServicoId[] {
  const lista: ServicoId[] = [];
  for (const l of d.linhas) if (l.servico && !l.recusada && !lista.includes(l.servico)) lista.push(l.servico);
  return lista;
}

/**
 * Os itens do serviço registrado quando a ordem fica pronta: um por serviço, com o produto da peça
 * (o que dá o prazo da próxima troca) e o prazo escolhido. Sem prazo na linha, `prazo` sugere.
 */
export function itensDoAtendimento(d: Pick<Documento, 'linhas'>, prazo: (s: ServicoId, produto: ProdutoUsado | null) => { km: number | null; meses: number | null }): ItemServico[] {
  const itens: ItemServico[] = [];
  for (const s of servicosDoDocumento(d)) {
    const doServico = d.linhas.filter((l) => l.servico === s && !l.recusada);
    const peca = doServico.find((l) => l.tipo === 'peca' && l.produto) ?? doServico.find((l) => l.tipo === 'peca');
    const produto: ProdutoUsado | null = peca?.produto ?? (peca ? { nome: peca.descricao, ...(peca.estoqueId ? { estoqueId: peca.estoqueId } : {}) } : null);
    const comPrazo = doServico.find((l) => l.intervaloKm != null || l.intervaloMeses != null);
    const p = comPrazo ? { km: comPrazo.intervaloKm ?? null, meses: comPrazo.intervaloMeses ?? null } : prazo(s, produto);
    const obs = doServico.map((l) => (l.tipo === 'servico' && l.descricao !== infoServico(s).nome ? l.descricao : '')).filter(Boolean).join('; ');
    itens.push({ servico: s, produto, intervaloKm: p.km, intervaloMeses: p.meses, ...(obs ? { observacao: obs.slice(0, 300) } : {}) });
  }
  return itens;
}

/** O texto que vai no WhatsApp junto com o link do orçamento. */
export function mensagemDoOrcamento(ctx: { oficina: string; cliente: string; carro: string; placa: string; numero: number; total: number; validade: string; link: string }): string {
  const nome = primeiroNome(ctx.cliente);
  const carro = [ctx.carro.trim(), ctx.placa ? `placa ${formatarPlaca(ctx.placa)}` : ''].filter(Boolean).join(', ');
  return [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`,
    `Segue o orçamento nº ${ctx.numero}${carro ? ` do seu ${carro}` : ''}, no total de ${formatarMoeda(ctx.total)}, válido até ${formatarData(ctx.validade)}.`,
    `Dá para ver tudo, escolher os itens e aprovar por aqui: ${ctx.link}`
  ].join('\n');
}

/** Para avisar o cliente que o carro ficou pronto. */
export function mensagemDePronto(ctx: { oficina: string; cliente: string; carro: string; total: number | null }): string {
  const nome = primeiroNome(ctx.cliente);
  const valor = ctx.total ? ` O total ficou em ${formatarMoeda(ctx.total)}.` : '';
  return `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}. O seu ${ctx.carro.trim() || 'carro'} está pronto e pode ser retirado.${valor}`;
}

/** As linhas de um serviço, para mostrar agrupado (o que não tem serviço fica em "Outros"). */
export function gruposDeLinhas(linhas: LinhaDocumento[]): { servico: ServicoId | null; titulo: string; linhas: LinhaDocumento[] }[] {
  const grupos: { servico: ServicoId | null; titulo: string; linhas: LinhaDocumento[] }[] = [];
  for (const l of linhas) {
    const s = l.servico ?? null;
    let g = grupos.find((x) => x.servico === s);
    if (!g) {
      g = { servico: s, titulo: s ? infoServico(s).nome : 'Outros itens', linhas: [] };
      grupos.push(g);
    }
    g.linhas.push(l);
  }
  // "Outros itens" por último
  return grupos.sort((a, b) => Number(a.servico == null) - Number(b.servico == null));
}
