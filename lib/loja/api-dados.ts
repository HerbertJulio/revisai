// A API de estoque e preço das lojas: o formato do token, o que o PATCH aceita e as mensagens de erro.
// Sem nada de servidor aqui: o painel (documentação) e os testes usam as mesmas regras.

import { z } from 'zod';

/** rvl_ + 8 letras e números (o prefixo que o painel mostra) + _ + 43 do base64url (o segredo). */
export const FORMATO_DO_TOKEN = /^rvl_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/;
export const TAMANHO_DO_PREFIXO = 12;

/** Quantos produtos por PATCH, quantas chamadas por minuto em cada token e o tamanho do corpo. */
export const LIMITE_DO_LOTE = 500;
export const CHAMADAS_POR_MINUTO = 60;
export const MAXIMO_DO_CORPO = 512 * 1024;
/** Tentativas com token errado do mesmo IP antes de esperar (em 10 minutos). */
export const FALHAS_POR_IP = 20;

export function prefixoDoToken(token: string): string {
  return token.slice(0, TAMANHO_DO_PREFIXO);
}

/** O token do cabeçalho Authorization: Bearer <token> (ou null). */
export function tokenDoCabecalho(valor: string | null | undefined): string | null {
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(valor ?? '');
  return m ? m[1] : null;
}

const CAMPOS = ['codigo', 'preco', 'estoque', 'prazo_entrega_horas', 'ativo'] as const;

export const esquemaItemDaApi = z
  .object({
    codigo: z.string({ error: 'Falta o código do produto (codigo, o da sua loja).' }).trim().min(1, 'Falta o código do produto (codigo, o da sua loja).').max(60, 'O código tem até 60 letras.'),
    preco: z.number({ error: 'preco é um número, como 41.9.' }).min(0.01, 'O preço vai de 0,01 a 100.000.').max(100000, 'O preço vai de 0,01 a 100.000.').optional(),
    estoque: z
      .number({ error: 'estoque é um número inteiro (ou null para não controlar).' })
      .int('estoque é um número inteiro (ou null para não controlar).')
      .min(0, 'O estoque vai de 0 a 1.000.000.')
      .max(1_000_000, 'O estoque vai de 0 a 1.000.000.')
      .nullable()
      .optional(),
    prazo_entrega_horas: z
      .number({ error: 'prazo_entrega_horas é um número inteiro de horas (ou null para usar o da loja).' })
      .int('prazo_entrega_horas é um número inteiro de horas (ou null para usar o da loja).')
      .min(1, 'O prazo de entrega vai de 1 a 720 horas.')
      .max(720, 'O prazo de entrega vai de 1 a 720 horas.')
      .nullable()
      .optional(),
    ativo: z.boolean({ error: 'ativo é true ou false.' }).optional()
  })
  .strict()
  .refine((i) => i.preco !== undefined || i.estoque !== undefined || i.prazo_entrega_horas !== undefined || i.ativo !== undefined, {
    message: 'Mande pelo menos um de preco, estoque, prazo_entrega_horas ou ativo.'
  });

export type ItemDaApi = z.infer<typeof esquemaItemDaApi>;

export interface ErroDoItem {
  indice: number;
  codigo: string | null;
  erro: string;
}

/** A primeira mensagem do item, já no jeito da API ("campo não reconhecido: x"). */
function mensagemDoItem(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return 'Confira este produto.';
  if (issue.code === 'unrecognized_keys') return `Campo não reconhecido: ${issue.keys.join(', ')}. Use ${CAMPOS.join(', ')}.`;
  if (issue.code === 'invalid_type' && issue.path.length === 0) return 'Cada produto é um objeto, como {"codigo": "ABC123", "estoque": 10}.';
  return issue.message;
}

/**
 * Confere o corpo do PATCH: {"produtos": [...]} com 1 a 500 produtos, sem código repetido. Devolve os
 * itens limpos, ou a mensagem geral e os erros de cada produto (até 50).
 */
export function conferirLote(corpo: unknown): { ok: true; itens: ItemDaApi[] } | { ok: false; erro: string; erros: ErroDoItem[]; recebidos: number } {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || !Array.isArray((corpo as { produtos?: unknown }).produtos)) {
    return { ok: false, erro: 'Mande um JSON como {"produtos": [{"codigo": "ABC123", "preco": 41.9, "estoque": 10}]}.', erros: [], recebidos: 0 };
  }
  const lista = (corpo as { produtos: unknown[] }).produtos;
  if (lista.length === 0) return { ok: false, erro: 'A lista de produtos está vazia.', erros: [], recebidos: 0 };
  if (lista.length > LIMITE_DO_LOTE) return { ok: false, erro: `Mande até ${LIMITE_DO_LOTE} produtos por vez (vieram ${lista.length}).`, erros: [], recebidos: lista.length };
  const itens: ItemDaApi[] = [];
  const erros: ErroDoItem[] = [];
  const vistos = new Map<string, number>();
  lista.forEach((bruto, indice) => {
    const r = esquemaItemDaApi.safeParse(bruto);
    const codigoBruto = bruto && typeof bruto === 'object' && typeof (bruto as { codigo?: unknown }).codigo === 'string' ? String((bruto as { codigo: string }).codigo).trim() : null;
    if (!r.success) {
      erros.push({ indice, codigo: codigoBruto, erro: mensagemDoItem(r.error.issues[0]) });
      return;
    }
    const antes = vistos.get(r.data.codigo);
    if (antes != null) {
      erros.push({ indice, codigo: r.data.codigo, erro: `O código ${r.data.codigo} veio repetido (também no produto ${antes}).` });
      return;
    }
    vistos.set(r.data.codigo, indice);
    itens.push(r.data);
  });
  if (erros.length) return { ok: false, erro: erros.length === 1 ? 'Um produto não confere. Nada foi mudado.' : `${erros.length} produtos não conferem. Nada foi mudado.`, erros: erros.slice(0, 50), recebidos: lista.length };
  return { ok: true, itens };
}

/** Os filtros do GET: codigo, depois (id do último da página anterior) e limite (1 a 500). */
export function conferirConsulta(busca: URLSearchParams): { ok: true; codigo: string | null; depois: number | null; limite: number } | { ok: false; erro: string } {
  const codigo = busca.get('codigo');
  const depois = busca.get('depois');
  const limite = busca.get('limite');
  if (codigo != null && (codigo.trim().length < 1 || codigo.trim().length > 60)) return { ok: false, erro: 'codigo tem de 1 a 60 letras.' };
  if (depois != null && !/^[1-9]\d{0,15}$/.test(depois)) return { ok: false, erro: 'depois é o id do último produto da página anterior (o campo proximo).' };
  if (limite != null && (!/^\d{1,3}$/.test(limite) || Number(limite) < 1 || Number(limite) > LIMITE_DO_LOTE)) return { ok: false, erro: `limite vai de 1 a ${LIMITE_DO_LOTE}.` };
  return { ok: true, codigo: codigo?.trim() || null, depois: depois ? Number(depois) : null, limite: limite ? Number(limite) : 100 };
}

/** As respostas de erro da API: sempre {erro, codigo} em português, e às vezes a lista de erros. */
export const ERROS_DA_API = {
  sem_token: { status: 401, erro: 'Mande o token no cabeçalho Authorization: Bearer <token>. O dono da loja cria o token no painel, em Integração.' },
  token_invalido: { status: 401, erro: 'Token inválido ou revogado. Confira o token ou crie outro no painel da loja, em Integração.' },
  muitas_falhas: { status: 429, erro: 'Muitas tentativas com token errado deste endereço. Espere 10 minutos.' },
  limite: { status: 429, erro: `Muitas chamadas seguidas: até ${CHAMADAS_POR_MINUTO} por minuto em cada token. Espere um minuto e mande de novo, de preferência em lotes de até ${LIMITE_DO_LOTE} produtos.` },
  corpo_grande: { status: 413, erro: 'O corpo passou de 512 KB. Mande em lotes menores.' },
  json_invalido: { status: 400, erro: 'O corpo não é um JSON válido.' },
  lote_invalido: { status: 400, erro: 'Confira os produtos.' },
  consulta_invalida: { status: 400, erro: 'Confira os filtros da consulta.' },
  indisponivel: { status: 503, erro: 'A API não está disponível agora. Tente de novo em instantes.' },
  falha: { status: 500, erro: 'Não deu para responder agora. Tente de novo em instantes.' }
} as const;

export type CodigoDeErroDaApi = keyof typeof ERROS_DA_API;
