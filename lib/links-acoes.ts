'use server';

// As respostas do cliente pelos links, sem conta: aprovar ou recusar o orçamento (todo ou em
// parte) e assinar o checklist de entrada. O servidor confere o que o cliente aprovou contra o
// que está publicado (o resumo tem de bater) e guarda com o IP e o aparelho de quem respondeu.

import { z } from 'zod';
import { conteudoDaAprovacao, versaoDoConteudo } from './aprovacao';
import { assinaturaValida } from './checklist';
import { permitido } from './limite';
import { hojeNoBrasil, lerOrcamentoDoLink, tokenValido } from './links-publicos';
import { consultarGarantia, responderLink, verLink } from './links-servidor';
import { agenteDoPedido, ipDoPedido } from './supabase-servidor';

export type RespostaDaAcao = { ok: true } | { ok: false; erro: string; mudou?: boolean };

const esquemaResposta = z.object({
  acao: z.enum(['aprovar', 'recusar']),
  recusadas: z.array(z.string().min(1).max(100)).max(100),
  nome: z.string().trim().max(80),
  versao: z.string().regex(/^[0-9a-f]{64}$/)
});

export async function responderOrcamento(token: string, entrada: unknown): Promise<RespostaDaAcao> {
  if (!tokenValido(token)) return { ok: false, erro: 'Link inválido.' };
  const e = esquemaResposta.safeParse(entrada);
  if (!e.success) return { ok: false, erro: 'Resposta inválida.' };
  if (!(await permitido(`responder-${token.slice(0, 12)}`, 12, 10))) return { ok: false, erro: 'Muitas tentativas. Espere um pouco e tente de novo.' };
  const r = e.data;
  if (r.acao === 'aprovar' && r.nome.length < 2) return { ok: false, erro: 'Escreva o seu nome para aprovar.' };

  const link = await verLink(token);
  if (!link || link.tipo !== 'orcamento') return { ok: false, erro: 'Este link não vale mais. Peça um novo para a oficina.' };
  if (link.resposta) return { ok: false, erro: 'Este orçamento já foi respondido.' };
  const dados = lerOrcamentoDoLink(link.dados);
  if (!dados) return { ok: false, erro: 'Este orçamento não abriu. Peça para a oficina mandar de novo.' };
  if (hojeNoBrasil() > dados.validade) return { ok: false, erro: 'Este orçamento venceu. Peça um novo para a oficina.' };

  const ids = new Set(dados.linhas.map((l) => l.id));
  const recusadas = r.acao === 'recusar' ? [...ids] : [...new Set(r.recusadas)].filter((id) => ids.has(id));
  if (r.acao === 'aprovar' && recusadas.length >= ids.size) return { ok: false, erro: 'Deixe pelo menos um item marcado para aprovar.' };
  const conteudo = conteudoDaAprovacao(dados, recusadas);
  const versao = await versaoDoConteudo(conteudo);
  // o cliente aprovou exatamente o que está publicado (a oficina pode ter mudado enquanto ele via)
  if (versao !== r.versao) return { ok: false, erro: 'A oficina atualizou o orçamento enquanto você via. Confira de novo antes de responder.', mudou: true };

  const [ip, agente] = await Promise.all([ipDoPedido(), agenteDoPedido()]);
  const g = await responderLink(token, { acao: r.acao, recusadas, nome: r.nome.slice(0, 80), hashAprovado: versao, total: conteudo.total }, ip, agente);
  return g.ok ? { ok: true } : { ok: false, erro: g.erro };
}

const esquemaAssinatura = z.object({ nome: z.string().trim().min(2).max(80), imagem: z.string().max(90_000) });

export async function assinarChecklist(token: string, entrada: unknown): Promise<RespostaDaAcao> {
  if (!tokenValido(token)) return { ok: false, erro: 'Link inválido.' };
  const e = esquemaAssinatura.safeParse(entrada);
  if (!e.success) return { ok: false, erro: 'Escreva o seu nome e assine no quadro.' };
  if (!assinaturaValida(e.data.imagem)) return { ok: false, erro: 'Assine no quadro antes de mandar.' };
  if (!(await permitido(`assinar-${token.slice(0, 12)}`, 8, 10))) return { ok: false, erro: 'Muitas tentativas. Espere um pouco e tente de novo.' };
  const link = await verLink(token);
  if (!link || link.tipo !== 'checklist') return { ok: false, erro: 'Este link não vale mais. Peça um novo para a oficina.' };
  if (link.resposta) return { ok: false, erro: 'Este checklist já foi assinado.' };
  const [ip, agente] = await Promise.all([ipDoPedido(), agenteDoPedido()]);
  const g = await responderLink(token, { acao: 'assinar', nome: e.data.nome, imagem: e.data.imagem }, ip, agente);
  return g.ok ? { ok: true } : { ok: false, erro: g.erro };
}

/** A consulta da garantia na página pública (placa e código do certificado). */
export async function consultarGarantiaPublica(placa: string, codigo: string): Promise<{ ok: true; dados: Record<string, unknown>; oficina: Record<string, unknown> } | { ok: false; erro: string }> {
  const p = String(placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const c = String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) return { ok: false, erro: 'Confira a placa.' };
  if (!/^[A-Z0-9]{6}$/.test(c)) return { ok: false, erro: 'O código tem 6 letras e números, como está no certificado.' };
  if (!(await permitido('garantia-consulta', 20, 10))) return { ok: false, erro: 'Muitas consultas seguidas. Espere uns minutos.' };
  const g = await consultarGarantia(p, c);
  if (!g) return { ok: false, erro: 'Não achamos uma garantia com esta placa e este código.' };
  return { ok: true, dados: g.dados, oficina: g.oficina };
}
