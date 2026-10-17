// O histórico da equipe em português: o que cada ação foi e o que mudou em cada campo.
// Sem nada de servidor aqui, para dar para testar.

import { formatarMoeda, formatarTelefone } from '@/lib/formatos';
import type { EventoDoHistorico } from './tipos';

const TABELAS: Record<string, string> = {
  'public.oficinas': 'oficina',
  'public.fornecedores': 'loja',
  'public.fornecedores_contrato': 'contrato da loja',
  'public.assinaturas': 'assinatura do Pro',
  'public.alertas_creditos': 'pacote de alertas',
  'public.impulsos': 'impulso',
  'public.produtos_referencia': 'linha da base de prazos',
  'public.pedidos': 'pedido',
  'public.interessados': 'cadastro do site',
  'public.convites': 'convite',
  'privado.equipe': 'pessoa da equipe',
  'privado.equipe_convites': 'convite para a equipe',
  'privado.equipe_aparelhos': 'aparelho',
  'privado.acessos': 'registro de acessos',
  'auth.users': 'conta'
};

const ACOES: Record<string, string> = {
  insert: 'Criou',
  update: 'Mudou',
  delete: 'Apagou',
  entrou: 'Entrou no painel',
  aparelho_novo: 'Entrou de um aparelho novo',
  consultou_acessos: 'Consultou os registros de acesso',
  exportou_titular: 'Exportou os dados de uma pessoa',
  apagou_titular: 'Apagou os dados de uma pessoa'
};

const CAMPOS: Record<string, string> = {
  nome: 'Nome',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  cidade: 'Cidade',
  uf: 'UF',
  endereco: 'Endereço',
  cnpj: 'CNPJ',
  pro_ate: 'Pro até',
  teste_ate: 'Teste até',
  fundador: 'Fundador',
  ativa: 'Ativa',
  ativo: 'Ativo',
  excluir_em: 'Apagar em',
  verificacao: 'Verificação',
  verificacao_obs: 'Observação da verificação',
  destaque: 'Destaque',
  destaque_ate: 'Destaque até',
  descricao: 'Descrição',
  demonstracao: 'Exemplo',
  plano: 'Plano',
  comissao_percentual: 'Comissão (%)',
  mensalidade: 'Mensalidade',
  observacao: 'Observação',
  oficina_id: 'Id da oficina',
  oficina_nome: 'Oficina',
  oficina_whatsapp: 'WhatsApp da oficina',
  meses: 'Meses',
  valor: 'Valor',
  ate: 'Vale até',
  codigo: 'Código',
  ativacoes: 'Ativações',
  quantidade: 'Quantidade',
  codigo_pro: 'Código do Pro',
  status: 'Situação',
  situacao: 'Situação',
  inicio: 'Início',
  fim: 'Fim',
  dias: 'Dias',
  aprovado: 'Aprovado',
  papel: 'Papel',
  motivo: 'Motivo',
  de: 'De',
  cadastros: 'Cadastros apagados',
  conta: 'Conta apagada',
  expira_em: 'Vale até',
  fornecedor_id: 'Id da loja',
  user_id: 'Id da conta',
  descricao_aparelho: 'Aparelho',
  tipo: 'Tipo'
};

/** Campos em reais e de telefone, para mostrar do jeito que a pessoa lê. */
const EM_REAIS = new Set(['valor', 'mensalidade', 'subtotal', 'total']);
const TELEFONES = new Set(['whatsapp', 'oficina_whatsapp']);

/** Campos que mudam sozinhos e só atrapalham a leitura. */
const IGNORAR = new Set(['atualizado_em', 'criado_em', 'criado_por', 'id', 'aceito_em']);

export interface Mudanca {
  campo: string;
  rotulo: string;
  de: string | null;
  para: string | null;
}

export function nomeDaTabela(tabela: string | null): string {
  return tabela ? (TABELAS[tabela] ?? tabela) : '';
}

/** "Mudou a oficina", "Entrou no painel", "Criou o convite". */
export function descricaoDoEvento(e: Pick<EventoDoHistorico, 'acao' | 'tabela'>): string {
  const acao = ACOES[e.acao] ?? e.acao;
  if (!['insert', 'update', 'delete'].includes(e.acao) || !e.tabela) return acao;
  const coisa = nomeDaTabela(e.tabela);
  const artigo = /^(oficina|loja|assinatura|linha|pessoa|conta)/.test(coisa) ? 'a' : 'o';
  return `${acao} ${artigo} ${coisa}`;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** O valor como a pessoa lê: datas no formato do Brasil, sim e não, textos curtos. */
export function valorLegivel(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') return String(v).replace('.', ',');
  if (typeof v === 'string') {
    if (DIA.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
    if (INSTANTE.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime()))
        return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
    }
    return v.length > 120 ? `${v.slice(0, 117)}...` : v;
  }
  const json = JSON.stringify(v);
  return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

/** O valor de um campo conhecido (reais, telefone) ou o valor legível de sempre. */
export function valorDoCampo(campo: string, v: unknown): string | null {
  if (v != null && v !== '' && EM_REAIS.has(campo) && Number.isFinite(Number(v))) return formatarMoeda(Number(v));
  if (typeof v === 'string' && TELEFONES.has(campo) && /^55\d{10,11}$/.test(v)) return formatarTelefone(v);
  return valorLegivel(v);
}

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** O que mudou: no "mudou", só os campos diferentes; no "criou" e no "apagou", os preenchidos. */
export function mudancas(e: Pick<EventoDoHistorico, 'antes' | 'depois'>, limite = 12): Mudanca[] {
  const antes = e.antes ?? {};
  const depois = e.depois ?? {};
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => !IGNORAR.has(k));
  const lista: Mudanca[] = [];
  for (const campo of chaves) {
    const de = e.antes ? antes[campo] : undefined;
    const para = e.depois ? depois[campo] : undefined;
    if (e.antes && e.depois && igual(de, para)) continue;
    const mudanca = { campo, rotulo: CAMPOS[campo] ?? campo.replace(/_/g, ' '), de: valorDoCampo(campo, de), para: valorDoCampo(campo, para) };
    if (mudanca.de == null && mudanca.para == null) continue;
    lista.push(mudanca);
  }
  // os campos conhecidos primeiro, na ordem da lista acima
  const ordem = Object.keys(CAMPOS);
  lista.sort((a, b) => (ordem.indexOf(a.campo) + 1 || 999) - (ordem.indexOf(b.campo) + 1 || 999));
  return lista.slice(0, limite);
}
