import 'server-only';
import { createHash } from 'node:crypto';
import { cache } from 'react';
import { z } from 'zod';
import { chaveDoSistema, clientePublico, clienteSistema } from '@/lib/supabase-servidor';

// A página pública de agendamento fala com o banco só pelas funções públicas da agenda
// (agenda_ver, agenda_horarios e agenda_pedir). O pedido vai pelo servidor, que manda o IP de quem
// pediu (em hash, com a chave do sistema) para o limite de pedidos por IP.

export const SLUG_VALIDO = /^[a-z0-9]{10,40}$/;

const texto = z
  .string()
  .nullish()
  .transform((v) => v ?? '');

const esquemaAgenda = z.object({
  oficina: z.object({ nome: z.string(), cidade: texto, uf: texto, endereco: texto }),
  config: z.object({
    intervaloMin: z.number().catch(30),
    diasAFrente: z.number().catch(30),
    antecedenciaHoras: z.number().catch(0),
    servicos: z.array(z.string()).catch([]),
    mensagem: texto
  }),
  hoje: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
export type AgendaPublica = z.infer<typeof esquemaAgenda>;

const esquemaHorarios = z.array(z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), horas: z.array(z.string().regex(/^\d{2}:\d{2}$/)) }));
export type DiaLivre = z.infer<typeof esquemaHorarios>[number];

/** A oficina e a configuração do link (null: o link não existe ou está desligado). Uma busca por requisição. */
export const verAgenda = cache(async (slug: string): Promise<AgendaPublica | null> => {
  if (!SLUG_VALIDO.test(slug)) return null;
  const sb = clientePublico();
  if (!sb) return null;
  const { data, error } = await sb.rpc('agenda_ver', { p_slug: slug });
  if (error) {
    console.error('[agendar] ver', error.message);
    return null;
  }
  const r = esquemaAgenda.safeParse(data);
  return r.success ? r.data : null;
});

/** Os dias com horário livre (null: o link não vale ou o banco não respondeu). */
export async function buscarLivres(slug: string): Promise<DiaLivre[] | null> {
  if (!SLUG_VALIDO.test(slug)) return null;
  const sb = clientePublico();
  if (!sb) return null;
  const { data, error } = await sb.rpc('agenda_horarios', { p_slug: slug });
  if (error) {
    console.error('[agendar] horários', error.message);
    return null;
  }
  const r = esquemaHorarios.safeParse(data);
  return r.success ? r.data : null;
}

export interface DadosDoPedido {
  data: string;
  hora: string;
  nome: string;
  telefone: string;
  placa: string;
  servico: string;
  observacao: string;
  consentimento: boolean;
}

export type ResultadoDoPedido = { ok: true; id: string; data: string; hora: string } | { ok: false; erro: string; ocupado?: boolean };

const ERROS: Record<string, string> = {
  RV070: 'Este link de agendamento não está ligado agora. Fale com a oficina.',
  RV071: 'Esse horário acabou de ser pego. Escolha outro.',
  RV072: 'Muitos pedidos seguidos. Tente mais tarde ou fale com a oficina pelo WhatsApp.',
  RV073: 'Marque que concorda em enviar seus dados para a oficina.'
};

/** O IP em hash (com um segredo do servidor, para não dar para voltar ao IP). */
export function hashDoIp(ip: string): string {
  return createHash('sha256').update(`${chaveDoSistema() ?? 'revisai'}:agenda:${ip}`).digest('hex');
}

export async function enviarPedido(slug: string, d: DadosDoPedido, ip: string): Promise<ResultadoDoPedido> {
  const sistema = clienteSistema();
  const sb = sistema ?? clientePublico();
  if (!sb) return { ok: false, erro: 'O agendamento está fora do ar agora. Fale com a oficina.' };
  const { data, error } = await sb.rpc('agenda_pedir', {
    p_slug: slug,
    p_data: d.data,
    p_hora: d.hora,
    p_nome: d.nome,
    p_telefone: d.telefone,
    p_placa: d.placa || null,
    p_servico: d.servico,
    p_observacao: d.observacao || null,
    p_consentimento: d.consentimento,
    p_ip_hash: sistema ? hashDoIp(ip) : null
  });
  if (error) {
    const conhecido = error.code ? ERROS[error.code] : undefined;
    if (conhecido) return { ok: false, erro: conhecido, ocupado: error.code === 'RV071' };
    // os erros de dados (22023) vêm do banco já em português
    if (error.code === '22023' && error.message && error.message.length < 120) return { ok: false, erro: `${error.message}.`.replace(/\.\.$/, '.') };
    console.error('[agendar] pedir', error.code, error.message);
    return { ok: false, erro: 'Não deu para enviar agora. Tente de novo em instantes.' };
  }
  const r = z.object({ id: z.string(), data: z.string(), hora: z.string() }).safeParse(data);
  return r.success ? { ok: true, ...r.data } : { ok: false, erro: 'Não deu para confirmar o envio. Tente de novo.' };
}
