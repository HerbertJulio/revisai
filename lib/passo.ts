// O passo a passo da ordem de serviço e do orçamento: o que já foi respondido (o rascunho),
// quais perguntas faltam e como cada resposta falada vira um dado. Sem nada de tela aqui.

import { totais } from './documentos';
import { comandoFalado, disseNaoSei, escolherPorFala, kmFalado, limparFala, modalidadeFalada, modeloFalado, nomeFalado, numeroFalado, placaFalada, servicosFalados, telefoneFalado, tipoFalado, valorFalado, type Comando, type ModeloFalado } from './fala';
import { lerNumero, normalizarPlaca, normalizarTelefone } from './formatos';
import { servico as infoServico } from './manutencao';
import type { Documento, Id, LinhaDocumento, ModalidadeOrcamento, ProdutoUsado, ServicoId, TipoDocumento, UnidadeLinha, UrgenciaRecomendacao } from './tipos';

export type PassoId = 'tipo' | 'modalidade' | 'carro' | 'placa' | 'km' | 'dono' | 'servicos' | `peca:${ServicoId}` | 'valores' | 'conferir';

export interface Rascunho {
  versao: 1;
  /** O documento que está sendo editado (null num novo). */
  editandoId: Id | null;
  tipo: TipoDocumento | null;
  modalidade: ModalidadeOrcamento | null;
  vistoria: string;
  abater: boolean;
  veiculoId: Id | null;
  carroNovo: { marca: string; modelo: string; ano: string } | null;
  placa: string;
  semPlaca: boolean;
  km: string;
  kmNaoSei: boolean;
  dono: { clienteId: Id | null; nome: string; telefone: string; semNome: boolean };
  servicos: ServicoId[];
  linhas: LinhaDocumento[];
  desconto: string;
  diagnostico: string;
  observacao: string;
  prazo: string;
  pagamento: string;
  validadeDias: number;
  relato: string;
  recomendacoes: { texto: string; urgencia: UrgenciaRecomendacao }[];
  passo: PassoId;
  criadoEm: string;
}

export function rascunhoVazio(agora: string, validadeDias = 10): Rascunho {
  return {
    versao: 1,
    editandoId: null,
    tipo: null,
    modalidade: null,
    vistoria: '',
    abater: true,
    veiculoId: null,
    carroNovo: null,
    placa: '',
    semPlaca: false,
    km: '',
    kmNaoSei: false,
    dono: { clienteId: null, nome: '', telefone: '', semNome: false },
    servicos: [],
    linhas: [],
    desconto: '',
    diagnostico: '',
    observacao: '',
    prazo: '',
    pagamento: '',
    validadeDias,
    relato: '',
    recomendacoes: [],
    passo: 'tipo',
    criadoEm: agora
  };
}

/** As perguntas deste rascunho, na ordem. As que vieram respondidas pelo link (tipo, carro) não entram. */
export function passosDo(r: Rascunho, fixos: { tipo?: boolean; carro?: boolean } = {}): PassoId[] {
  const lista: PassoId[] = [];
  if (!fixos.tipo) lista.push('tipo');
  if (r.tipo === 'orcamento') lista.push('modalidade');
  if (!fixos.carro) lista.push('carro');
  if (r.carroNovo) lista.push('placa');
  lista.push('km');
  if (r.carroNovo) lista.push('dono');
  lista.push('servicos');
  for (const s of r.servicos) if (infoServico(s).categoria) lista.push(`peca:${s}`);
  lista.push('valores', 'conferir');
  return lista;
}

export function servicoDoPasso(p: PassoId): ServicoId | null {
  return p.startsWith('peca:') ? (p.slice(5) as ServicoId) : null;
}

let contador = 0;
export function idDeLinha(): Id {
  contador = (contador + 1) % 1_000_000;
  return `l${Date.now().toString(36)}${contador.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------- linhas

export function linhaDaPeca(r: Pick<Rascunho, 'linhas'>, s: ServicoId): LinhaDocumento | undefined {
  return r.linhas.find((l) => l.tipo === 'peca' && l.servico === s);
}

export function linhaDaMaoDeObra(r: Pick<Rascunho, 'linhas'>, s: ServicoId | null): LinhaDocumento | undefined {
  return r.linhas.find((l) => l.tipo === 'servico' && (l.servico ?? null) === s);
}

export interface EscolhaPeca {
  descricao: string;
  quantidade: number;
  unidade: UnidadeLinha;
  valorUnitario: number | null;
  estoqueId?: Id;
  produto: ProdutoUsado | null;
}

/** Põe (ou tira, com null) a peça principal de um serviço. */
export function definirPeca(r: Rascunho, s: ServicoId, e: EscolhaPeca | null): Rascunho {
  const atual = linhaDaPeca(r, s);
  if (!e) return { ...r, linhas: r.linhas.filter((l) => l !== atual) };
  const linha: LinhaDocumento = {
    id: atual?.id ?? idDeLinha(),
    tipo: 'peca',
    servico: s,
    descricao: e.descricao.trim().slice(0, 160) || infoServico(s).nome,
    quantidade: e.quantidade,
    unidade: e.unidade,
    valorUnitario: e.valorUnitario,
    ...(e.estoqueId ? { estoqueId: e.estoqueId } : {}),
    produto: e.produto,
    ...(atual?.intervaloKm !== undefined ? { intervaloKm: atual.intervaloKm } : {}),
    ...(atual?.intervaloMeses !== undefined ? { intervaloMeses: atual.intervaloMeses } : {})
  };
  if (atual) return { ...r, linhas: r.linhas.map((l) => (l === atual ? linha : l)) };
  // a peça entra antes da mão de obra do serviço
  const i = r.linhas.findIndex((l) => l.servico === s);
  const linhas = [...r.linhas];
  linhas.splice(i >= 0 ? i : linhas.length, 0, linha);
  return { ...r, linhas };
}

export function mudarLinha(r: Rascunho, id: Id, mudanca: Partial<LinhaDocumento>): Rascunho {
  return { ...r, linhas: r.linhas.map((l) => (l.id === id ? { ...l, ...mudanca } : l)) };
}

/** A mão de obra de um serviço (ou a geral, com s null). Valor null ou zero tira a linha. */
export function definirMaoDeObra(r: Rascunho, s: ServicoId | null, valor: number | null): Rascunho {
  const atual = linhaDaMaoDeObra(r, s);
  if (valor == null || valor <= 0) return atual ? { ...r, linhas: r.linhas.filter((l) => l !== atual) } : r;
  if (atual) return mudarLinha(r, atual.id, { valorUnitario: valor, quantidade: 1 });
  const descricao = s ? `Mão de obra: ${infoServico(s).nome.toLowerCase()}` : 'Mão de obra';
  return { ...r, linhas: [...r.linhas, { id: idDeLinha(), tipo: 'servico', ...(s ? { servico: s } : {}), descricao, quantidade: 1, unidade: 'un', valorUnitario: valor }] };
}

/** Marca ou desmarca um serviço. Marcar traz junto o que costuma ir junto; desmarcar tira as linhas dele. */
export function alternarServico(r: Rascunho, s: ServicoId): Rascunho {
  if (r.servicos.includes(s)) return { ...r, servicos: r.servicos.filter((x) => x !== s), linhas: r.linhas.filter((l) => l.servico !== s) };
  const servicos = [...r.servicos, s];
  for (const j of infoServico(s).junto ?? []) if (!servicos.includes(j)) servicos.push(j);
  return { ...r, servicos };
}

/**
 * Marca os serviços da lista. Do que costuma ir junto, só o filtro de óleo entra sozinho (com a
 * troca de óleo): o resto o mecânico fala se fez.
 */
export function incluirServicos(r: Rascunho, lista: ServicoId[]): Rascunho {
  const servicos = [...r.servicos];
  for (const s of lista) if (!servicos.includes(s)) servicos.push(s);
  if (lista.includes('troca_oleo') && !servicos.includes('filtro_oleo')) servicos.push('filtro_oleo');
  return { ...r, servicos };
}

/** Os itens que não são de um serviço da lista ("Troca da bomba d'água", "Mão de obra"). */
export function linhasAvulsas(r: Pick<Rascunho, 'linhas'>): LinhaDocumento[] {
  return r.linhas.filter((l) => !l.servico);
}

export function incluirAvulsa(r: Rascunho, descricao: string, valor: number | null, tipo: LinhaDocumento['tipo'] = 'servico'): Rascunho {
  return { ...r, linhas: [...r.linhas, { id: idDeLinha(), tipo, descricao: descricao.trim().slice(0, 160), quantidade: 1, unidade: 'un', valorUnitario: valor }] };
}

export function tirarLinha(r: Rascunho, id: Id): Rascunho {
  return { ...r, linhas: r.linhas.filter((l) => l.id !== id) };
}

export function totaisDoRascunho(r: Pick<Rascunho, 'linhas' | 'desconto'>) {
  return totais({ linhas: r.linhas, desconto: lerNumero(r.desconto) });
}

/** Os campos do documento que o rascunho preenche (o carro e o km vêm de fora, já resolvidos). */
export function documentoDoRascunho(r: Rascunho, veiculoId: Id, km: number | null, hoje: string): Omit<Documento, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm' | 'situacao'> {
  const tipo = r.tipo ?? 'ordem';
  const vistoria = lerNumero(r.vistoria);
  const desconto = lerNumero(r.desconto);
  const linhas = r.linhas.filter((l) => l.descricao.trim() && (!l.servico || r.servicos.includes(l.servico)));
  // todo serviço marcado aparece no documento, mesmo sem peça e sem mão de obra própria
  for (const s of r.servicos) {
    if (linhas.some((l) => l.servico === s)) continue;
    linhas.push({ id: idDeLinha(), tipo: 'servico', servico: s, descricao: infoServico(s).nome, quantidade: 1, unidade: 'un', valorUnitario: null });
  }
  return {
    tipo,
    veiculoId,
    km,
    data: hoje,
    linhas,
    desconto: desconto && desconto > 0 ? desconto : null,
    ...(tipo === 'orcamento'
      ? {
          modalidade: r.modalidade ?? 'frio',
          vistoria: r.modalidade === 'pago' && vistoria && vistoria > 0 ? { valor: vistoria, abater: r.abater } : null,
          validadeDias: r.validadeDias
        }
      : {}),
    prazo: r.prazo.trim() || undefined,
    pagamento: r.pagamento.trim() || undefined,
    diagnostico: r.diagnostico.trim() || undefined,
    observacao: r.observacao.trim() || undefined,
    recomendacoes: r.recomendacoes.length ? r.recomendacoes : undefined,
    relato: r.relato.trim() || undefined
  };
}

/** O rascunho de um documento que já existe, para editar (vai direto para a conferência). */
export function rascunhoDoDocumento(d: Documento, agora: string): Rascunho {
  const servicos: ServicoId[] = [];
  for (const l of d.linhas) if (l.servico && !servicos.includes(l.servico)) servicos.push(l.servico);
  return {
    ...rascunhoVazio(agora, d.validadeDias ?? 10),
    editandoId: d.id,
    tipo: d.tipo,
    modalidade: d.modalidade ?? (d.tipo === 'orcamento' ? 'frio' : null),
    vistoria: d.vistoria ? String(d.vistoria.valor).replace('.', ',') : '',
    abater: d.vistoria?.abater ?? true,
    veiculoId: d.veiculoId,
    km: d.km != null ? String(d.km) : '',
    kmNaoSei: d.km == null,
    servicos,
    linhas: d.linhas.map((l) => ({ ...l })),
    desconto: d.desconto ? String(d.desconto).replace('.', ',') : '',
    diagnostico: d.diagnostico ?? '',
    observacao: d.observacao ?? '',
    prazo: d.prazo ?? '',
    pagamento: d.pagamento ?? '',
    relato: d.relato ?? '',
    recomendacoes: d.recomendacoes ?? [],
    passo: 'conferir'
  };
}

// ---------------------------------------------------------------- respostas faladas

export interface OpcaoFalada {
  id: string;
  texto: string;
}

/** O que a resposta falada fez: mudou o rascunho (e pode seguir), um comando, ou não deu para entender. */
export type Subpergunta = 'vistoria' | 'telefone' | 'modelo';

export type Interpretacao =
  | { tipo: 'resposta'; rascunho: Rascunho; entendi: string; seguir: boolean; perguntar?: Subpergunta }
  /** No passo da peça: qual cartão marcar (a tela monta a linha com o preço e a quantidade). */
  | { tipo: 'peca'; opcao: string; quantidade: number | null; entendi: string }
  | { tipo: 'comando'; comando: Comando }
  | { tipo: 'nada' };

export interface ContextoFala {
  /** Carros já cadastrados, para achar pela placa ou pelo modelo. */
  carros: { id: Id; placa: string; modelo: string; dono: string }[];
  clientes: { id: Id; nome: string; telefone: string }[];
  /** As opções de peça do passo (cartões da tela). */
  opcoes?: OpcaoFalada[];
  /** Qual pergunta extra está aberta dentro do passo. */
  subpergunta?: Subpergunta | null;
  anoMaximo?: number;
}

const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const km = new Intl.NumberFormat('pt-BR');

function quantidadeFalada(texto: string): number | null {
  const t = limparFala(texto);
  const m = t.match(/\b([\d.,]+|[a-z]+(?: e [a-z]+)?)\s*(litros?|l|unidades?|pecas?|jogos?|pares?)\b/);
  if (!m) return null;
  const n = numeroFalado(m[1]);
  return n != null && n > 0 && n < 1000 ? n : null;
}

/** Interpreta a resposta falada a uma pergunta do passo a passo. */
export function interpretar(passo: PassoId, texto: string, r: Rascunho, ctx: ContextoFala): Interpretacao {
  const comando = comandoFalado(texto);
  if (comando === 'voltar' || comando === 'parar' || comando === 'pular' || (comando === 'continuar' && passo !== 'conferir')) return { tipo: 'comando', comando };

  if (ctx.subpergunta === 'vistoria') {
    const v = valorFalado(texto);
    if (v == null) return { tipo: 'nada' };
    return { tipo: 'resposta', rascunho: { ...r, vistoria: String(v).replace('.', ',') }, entendi: `Vistoria de ${real.format(v)}`, seguir: true };
  }
  if (ctx.subpergunta === 'modelo') {
    const m = modeloFalado(texto, ctx.anoMaximo);
    if (!m || !m.modelo) return { tipo: 'nada' };
    return { tipo: 'resposta', rascunho: { ...r, veiculoId: null, carroNovo: carroDoModelo(m) }, entendi: [m.marca, m.modelo, m.ano].filter(Boolean).join(' '), seguir: true };
  }
  if (ctx.subpergunta === 'telefone') {
    if (disseNaoSei(texto) || comando === 'nao') return { tipo: 'resposta', rascunho: r, entendi: 'Sem WhatsApp', seguir: true };
    const tel = telefoneFalado(texto);
    if (!tel || !normalizarTelefone(tel)) return { tipo: 'nada' };
    return { tipo: 'resposta', rascunho: { ...r, dono: { ...r.dono, telefone: tel } }, entendi: `WhatsApp ${tel.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')}`, seguir: true };
  }

  switch (passo) {
    case 'tipo': {
      const t = tipoFalado(texto);
      if (!t) return { tipo: 'nada' };
      return { tipo: 'resposta', rascunho: { ...r, tipo: t, modalidade: t === 'orcamento' ? r.modalidade : null }, entendi: t === 'orcamento' ? 'Orçamento' : 'Ordem de serviço', seguir: true };
    }
    case 'modalidade': {
      const m = modalidadeFalada(texto);
      if (!m) return { tipo: 'nada' };
      if (m === 'frio') return { tipo: 'resposta', rascunho: { ...r, modalidade: 'frio' }, entendi: 'Orçamento frio', seguir: true };
      const v = valorFalado(texto);
      const novo = { ...r, modalidade: 'pago' as const, vistoria: v != null && v > 0 ? String(v).replace('.', ',') : r.vistoria };
      if (v != null && v > 0) return { tipo: 'resposta', rascunho: novo, entendi: `Orçamento pago, vistoria de ${real.format(v)}`, seguir: true };
      return { tipo: 'resposta', rascunho: novo, entendi: 'Orçamento pago', seguir: false, perguntar: 'vistoria' };
    }
    case 'carro': {
      const placa = placaFalada(texto);
      if (placa) {
        const achado = ctx.carros.find((c) => c.placa === placa);
        if (achado) return { tipo: 'resposta', rascunho: { ...r, veiculoId: achado.id, carroNovo: null }, entendi: `${achado.modelo} de ${achado.dono || 'cliente sem nome'}`, seguir: true };
        return { tipo: 'resposta', rascunho: { ...r, veiculoId: null, carroNovo: r.carroNovo ?? { marca: '', modelo: '', ano: '' }, placa, semPlaca: false }, entendi: `Carro novo, placa ${placa}`, seguir: false, perguntar: 'modelo' };
      }
      const m = modeloFalado(texto, ctx.anoMaximo);
      if (!m || !m.modelo) return { tipo: 'nada' };
      const iguais = ctx.carros.filter((c) => limparFala(c.modelo).includes(limparFala(m.modelo)));
      if (iguais.length === 1) {
        const c = iguais[0];
        return { tipo: 'resposta', rascunho: { ...r, veiculoId: c.id, carroNovo: null }, entendi: `${c.modelo} de ${c.dono || 'cliente sem nome'}`, seguir: true };
      }
      if (iguais.length > 1) return { tipo: 'nada' };
      return { tipo: 'resposta', rascunho: { ...r, veiculoId: null, carroNovo: carroDoModelo(m) }, entendi: [m.marca, m.modelo, m.ano].filter(Boolean).join(' '), seguir: true };
    }
    case 'placa': {
      if (disseNaoSei(texto)) return { tipo: 'resposta', rascunho: { ...r, placa: '', semPlaca: true }, entendi: 'Sem placa', seguir: true };
      const placa = placaFalada(texto);
      if (!placa) return { tipo: 'nada' };
      return { tipo: 'resposta', rascunho: { ...r, placa, semPlaca: false }, entendi: `Placa ${placa}`, seguir: true };
    }
    case 'km': {
      const k = kmFalado(texto);
      if (k == null) return { tipo: 'nada' };
      if (k === 'nao_sei') return { tipo: 'resposta', rascunho: { ...r, km: '', kmNaoSei: true }, entendi: 'Sem quilometragem', seguir: true };
      return { tipo: 'resposta', rascunho: { ...r, km: String(k), kmNaoSei: false }, entendi: `${km.format(k)} km`, seguir: true };
    }
    case 'dono': {
      const nome = nomeFalado(texto);
      if (!nome) {
        if (!limparFala(texto)) return { tipo: 'nada' };
        return { tipo: 'resposta', rascunho: { ...r, dono: { clienteId: null, nome: '', telefone: r.dono.telefone, semNome: true } }, entendi: 'Cliente sem nome', seguir: false, perguntar: 'telefone' };
      }
      const igual = ctx.clientes.filter((c) => limparFala(c.nome) === limparFala(nome));
      const dono = igual.length === 1 ? { clienteId: igual[0].id, nome: igual[0].nome, telefone: igual[0].telefone, semNome: false } : { clienteId: null, nome, telefone: r.dono.telefone, semNome: false };
      if (dono.clienteId) return { tipo: 'resposta', rascunho: { ...r, dono }, entendi: `${dono.nome}, já é cliente`, seguir: true };
      return { tipo: 'resposta', rascunho: { ...r, dono }, entendi: nome, seguir: false, perguntar: 'telefone' };
    }
    case 'servicos': {
      const lista = servicosFalados(texto);
      if (!lista.length) return { tipo: 'nada' };
      const novo = incluirServicos(r, lista);
      const nomes = novo.servicos.filter((s) => lista.includes(s) || !r.servicos.includes(s)).map((s) => infoServico(s).nome.toLowerCase());
      return { tipo: 'resposta', rascunho: { ...novo, relato: [r.relato, texto.trim()].filter(Boolean).join('\n') }, entendi: juntar(nomes), seguir: true };
    }
    case 'valores': {
      const v = valorFalado(texto);
      if (v == null) return { tipo: 'nada' };
      const servicos = r.servicos;
      const alvo = servicos.length === 1 ? servicos[0] : null;
      return { tipo: 'resposta', rascunho: definirMaoDeObra(r, alvo, v), entendi: `Mão de obra de ${real.format(v)}`, seguir: false };
    }
    case 'conferir':
      return comando === 'sim' || comando === 'continuar' ? { tipo: 'comando', comando: 'sim' } : comando === 'nao' ? { tipo: 'comando', comando: 'nao' } : { tipo: 'nada' };
    default: {
      const s = servicoDoPasso(passo);
      if (!s) return { tipo: 'nada' };
      if (/\b(nenhum|nenhuma|nao anotar|nao sei|sem peca|nao usei)\b/.test(limparFala(texto))) return { tipo: 'resposta', rascunho: definirPeca(r, s, null), entendi: 'Sem anotar a peça', seguir: true };
      const opcao = escolherPorFala(texto, ctx.opcoes ?? []);
      const quantidade = quantidadeFalada(texto);
      if (!opcao) {
        if (quantidade == null) return { tipo: 'nada' };
        const atual = linhaDaPeca(r, s);
        if (!atual) return { tipo: 'nada' };
        return { tipo: 'resposta', rascunho: mudarLinha(r, atual.id, { quantidade }), entendi: `${quantidade} ${atual.unidade === 'L' ? 'litros' : 'unidades'}`, seguir: false };
      }
      return { tipo: 'peca', opcao: opcao.id, quantidade, entendi: opcao.texto };
    }
  }
}

function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

function carroDoModelo(m: ModeloFalado): Rascunho['carroNovo'] {
  return { marca: m.marca, modelo: m.modelo, ano: m.ano ? String(m.ano) : '' };
}

/** A placa como fica guardada. */
export function placaDoRascunho(r: Pick<Rascunho, 'placa' | 'semPlaca'>): string {
  return r.semPlaca ? '' : normalizarPlaca(r.placa);
}
