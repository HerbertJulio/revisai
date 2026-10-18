'use server';

// O cliente avisa a oficina que pagou o Pix (página /pagar). O aviso fica no link, com o IP e o
// aparelho; a oficina confere no banco dela e confirma no app.

import { z } from 'zod';
import { permitido } from '@/lib/limite';
import { tokenValido } from '@/lib/links-publicos';
import { responderLink, verLink } from '@/lib/links-servidor';
import { agenteDoPedido, ipDoPedido } from '@/lib/supabase-servidor';

export type AvisoDoCliente = { ok: true; quando: string } | { ok: false; erro: string };

const esquemaNome = z.string().trim().max(80).catch('');

export async function avisarQuePaguei(token: string, nome?: string): Promise<AvisoDoCliente> {
  if (!tokenValido(token)) return { ok: false, erro: 'Link inválido.' };
  if (!(await permitido(`paguei-${token.slice(0, 12)}`, 6, 10))) return { ok: false, erro: 'Muitas tentativas. Espere um pouco e tente de novo.' };
  const link = await verLink(token);
  if (!link || link.tipo !== 'pagamento') return { ok: false, erro: 'Este link não vale mais. Peça um novo para a oficina.' };
  if (link.dados && (link.dados as { pago?: unknown }).pago === true) return { ok: false, erro: 'A oficina já confirmou este pagamento.' };
  const quem = esquemaNome.parse(nome ?? '');
  const [ip, agente] = await Promise.all([ipDoPedido(), agenteDoPedido()]);
  const r = await responderLink(token, { acao: 'paguei', ...(quem ? { nome: quem } : {}) }, ip, agente);
  if (r.ok) return { ok: true, quando: r.quando };
  if (r.codigo === 'RV051') return { ok: false, erro: 'Você já avisou que pagou. A oficina vai conferir e confirmar.' };
  return { ok: false, erro: r.erro };
}
