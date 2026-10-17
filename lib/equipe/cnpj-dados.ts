// Os dados públicos do CNPJ (Receita Federal, pela BrasilAPI) que a equipe confere antes de
// aprovar uma loja. Só a leitura da resposta aqui (sem rede), para dar para testar.

import { z } from 'zod';
import { formatarCnpj, soNumeros } from '@/lib/cnpj';

export interface AtividadeCnpj {
  codigo: string;
  descricao: string;
}

export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  /** "ATIVA", "BAIXADA", "INAPTA", "SUSPENSA" ou "NULA". */
  situacao: string | null;
  ativa: boolean;
  situacaoDesde: string | null;
  abertura: string | null;
  atividade: AtividadeCnpj | null;
  outrasAtividades: AtividadeCnpj[];
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  naturezaJuridica: string | null;
  porte: string | null;
  socios: string[];
  /** A atividade principal ou uma das outras é de peças, lubrificantes ou manutenção de carro. */
  ligadaAPecas: boolean;
}

const textoOuNulo = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v == null ? null : String(v).trim() || null));

const esquema = z.object({
  cnpj: textoOuNulo,
  razao_social: textoOuNulo,
  nome_fantasia: textoOuNulo,
  situacao_cadastral: textoOuNulo,
  descricao_situacao_cadastral: textoOuNulo,
  data_situacao_cadastral: textoOuNulo,
  data_inicio_atividade: textoOuNulo,
  cnae_fiscal: textoOuNulo,
  cnae_fiscal_descricao: textoOuNulo,
  cnaes_secundarios: z
    .array(z.object({ codigo: textoOuNulo, descricao: textoOuNulo }))
    .nullish()
    .catch(null),
  descricao_tipo_de_logradouro: textoOuNulo,
  logradouro: textoOuNulo,
  numero: textoOuNulo,
  complemento: textoOuNulo,
  bairro: textoOuNulo,
  cep: textoOuNulo,
  municipio: textoOuNulo,
  uf: textoOuNulo,
  natureza_juridica: textoOuNulo,
  porte: textoOuNulo,
  descricao_porte: textoOuNulo,
  qsa: z
    .array(z.object({ nome_socio: textoOuNulo }))
    .nullish()
    .catch(null)
});

const SITUACOES: Record<string, string> = { '1': 'NULA', '2': 'ATIVA', '3': 'SUSPENSA', '4': 'INAPTA', '8': 'BAIXADA' };

/** CNAE com a máscara de sempre: 4530703 vira 4530-7/03. */
export function formatarCnae(codigo: string | number): string {
  const c = String(codigo).replace(/\D/g, '').padStart(7, '0');
  return c.length === 7 ? `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}` : String(codigo);
}

// comércio de peças de carro e de moto, lubrificantes, manutenção e fabricação de peças
const PREFIXOS_DE_PECAS = ['4530', '4541', '4542', '4520', '4732', '468180', '2945', '2949', '2950'];

function ligadaAPecas(codigos: string[]): boolean {
  return codigos.some((c) => PREFIXOS_DE_PECAS.some((p) => c.replace(/\D/g, '').padStart(7, '0').startsWith(p)));
}

function atividade(codigo: string | null, descricao: string | null): AtividadeCnpj | null {
  if (!codigo || /^0+$/.test(codigo)) return null;
  return { codigo: formatarCnae(codigo), descricao: descricao ?? '' };
}

/** Lê a resposta da BrasilAPI (/api/cnpj/v1/{cnpj}); null se não vier no formato esperado. */
export function lerDadosCnpj(dados: unknown): DadosCnpj | null {
  if (!dados || typeof dados !== 'object') return null;
  const r = esquema.safeParse(dados);
  if (!r.success) return null;
  const d = r.data;
  const cnpj = soNumeros(d.cnpj ?? '');
  if (cnpj.length !== 14) return null;
  const situacao = (d.descricao_situacao_cadastral ?? SITUACOES[d.situacao_cadastral ?? ''] ?? null)?.toUpperCase() ?? null;
  const rua = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ');
  const endereco = [[rua, d.numero].filter(Boolean).join(', '), d.complemento, d.bairro, d.cep ? `CEP ${d.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : null]
    .filter(Boolean)
    .join(', ');
  const principal = atividade(d.cnae_fiscal, d.cnae_fiscal_descricao);
  const outras = (d.cnaes_secundarios ?? []).flatMap((x) => {
    const a = atividade(x.codigo, x.descricao);
    return a ? [a] : [];
  });
  return {
    cnpj,
    razaoSocial: d.razao_social,
    nomeFantasia: d.nome_fantasia,
    situacao,
    ativa: situacao === 'ATIVA',
    situacaoDesde: d.data_situacao_cadastral,
    abertura: d.data_inicio_atividade,
    atividade: principal,
    outrasAtividades: outras,
    endereco: endereco || null,
    municipio: d.municipio,
    uf: d.uf,
    naturezaJuridica: d.natureza_juridica,
    porte: d.descricao_porte ?? d.porte,
    socios: (d.qsa ?? []).flatMap((s) => (s.nome_socio ? [s.nome_socio] : [])).slice(0, 10),
    ligadaAPecas: ligadaAPecas([principal?.codigo, ...outras.map((o) => o.codigo)].filter((c): c is string => !!c))
  };
}

/** O endereço da consulta pública na Receita, para conferir quando a BrasilAPI não responde. */
export function linkDaReceita(): string {
  return 'https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp';
}

export { formatarCnpj };
