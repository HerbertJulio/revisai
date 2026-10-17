'use server';

// O membro do clube avisa pelo cartão que pagou a mensalidade em aberto. O mês vem do que o
// cartão mostra (o servidor lê de novo), não do que o navegador manda.

import { z } from 'zod';
import { lerDadosDoCartao } from '@/lib/clube';
import { permitido } from '@/lib/limite';
import { tokenValido } from '@/lib/links-publicos';
import { responderLink, verLink } from '@/lib/links-servidor';
import { agenteDoPedido, ipDoPedido } from '@/lib/supabase-servidor';

export type AvisoDoMembro = { ok: true; quando: string } | { ok: false; erro: string };

const esquemaNome = z.string().trim().max(80).catch('');

export async function avisarMensalidadePaga(token: string, nome?: string): Promise<AvisoDoMembro> {
  if (!tokenValido(token)) return { ok: false, erro: 'Link inválido.' };
  if (!(await permitido(`paguei-${token.slice(0, 12)}`, 6, 10))) return { ok: false, erro: 'Muitas tentativas. Espere um pouco e tente de novo.' };
  const link = await verLink(token);
  const dados = link?.tipo === 'clube' ? lerDadosDoCartao(link.dados) : null;
  if (!link || !dados) return { ok: false, erro: 'Este cartão não vale mais. Peça um novo para a oficina.' };
  if (!dados.aberta) return { ok: false, erro: 'Não há mensalidade em aberto neste cartão.' };
  const quem = esquemaNome.parse(nome ?? '');
  const [ip, agente] = await Promise.all([ipDoPedido(), agenteDoPedido()]);
  const r = await responderLink(token, { acao: 'paguei', competencia: dados.aberta.competencia, ...(quem ? { nome: quem } : {}) }, ip, agente);
  if (r.ok) return { ok: true, quando: r.quando };
  if (r.codigo === 'RV051') return { ok: false, erro: 'Você já avisou que pagou. A oficina vai conferir e confirmar.' };
  return { ok: false, erro: r.erro };
}
