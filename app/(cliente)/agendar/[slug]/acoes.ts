'use server';

// O cliente da oficina pede um horário pelo link (sem conta). O banco confere de novo tudo: o
// horário livre, a antecedência, as vagas, o consentimento e os limites por IP e por oficina.

import { z } from 'zod';
import { normalizarPlaca, normalizarTelefone, placaValida } from '@/lib/formatos';
import { permitido } from '@/lib/limite';
import { ipDoPedido } from '@/lib/supabase-servidor';
import { buscarLivres, enviarPedido, SLUG_VALIDO, type DiaLivre, type ResultadoDoPedido } from './dados';

const esquema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  nome: z.string().trim().max(80),
  telefone: z.string().max(30),
  placa: z.string().max(10),
  servico: z.string().trim().max(80),
  observacao: z.string().trim().max(300),
  consentimento: z.boolean()
});

export async function pedirHorario(slug: string, entrada: unknown): Promise<ResultadoDoPedido & { horarios?: DiaLivre[] }> {
  if (!SLUG_VALIDO.test(slug)) return { ok: false, erro: 'Este link não vale.' };
  const r = esquema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Confira o dia, a hora e os seus dados.' };
  const d = r.data;
  if (!d.consentimento) return { ok: false, erro: 'Marque que concorda em enviar seus dados para a oficina.' };
  if (d.nome.length < 2) return { ok: false, erro: 'Escreva o seu nome.' };
  const telefone = normalizarTelefone(d.telefone);
  if (!telefone) return { ok: false, erro: 'Confira o WhatsApp, com DDD.' };
  const placa = normalizarPlaca(d.placa);
  if (placa && !placaValida(placa)) return { ok: false, erro: 'Confira a placa (ABC1D23 ou ABC-1234), ou deixe em branco.' };
  if (!d.servico) return { ok: false, erro: 'Escolha o serviço.' };
  if (!(await permitido(`agendar-${slug}`, 12, 60))) return { ok: false, erro: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.' };
  const res = await enviarPedido(slug, { ...d, telefone, placa }, await ipDoPedido());
  if (!res.ok && res.ocupado) return { ...res, horarios: (await buscarLivres(slug)) ?? undefined };
  return res;
}

/** Os horários livres de novo (o cliente ficou com a página aberta). */
export async function atualizarHorarios(slug: string): Promise<DiaLivre[] | null> {
  if (!SLUG_VALIDO.test(slug)) return null;
  return buscarLivres(slug);
}
