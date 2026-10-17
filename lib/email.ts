'use server';

// A cópia da aprovação do orçamento por e-mail para o cliente da oficina. Só para quem está na
// oficina (com a conta), só para o e-mail de um cliente cadastrado nela e com limite por hora:
// o texto sai sempre do modelo do comprovante, com o nome da oficina tirado da conta.

import { headers } from 'next/headers';
import { z } from 'zod';
import { aparelhoDoAgente, codigoDeConferencia } from './aprovacao';
import { acessoDaOficina } from './conta';
import { emailDaAprovacao, enviarEmail } from './email-envio';
import { permitido } from './limite';

const esquema = z.object({
  para: z.email().max(160),
  documentoId: z.string().min(1).max(100),
  numero: z.number().int().min(1).max(10_000_000),
  cliente: z.string().max(80),
  carro: z.string().max(100),
  placa: z.string().max(8),
  itens: z
    .array(z.object({ descricao: z.string().max(160), quantidade: z.number().min(0).max(100_000), unidade: z.enum(['un', 'L', 'h']), valor: z.number().min(-1_000_000).max(1_000_000).nullable() }))
    .min(1)
    .max(100),
  recusados: z.array(z.string().max(160)).max(100),
  total: z.number().min(0).max(10_000_000),
  validade: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  canal: z.enum(['link', 'whatsapp', 'presencial']),
  quando: z.string().max(40),
  nome: z.string().max(80).nullish(),
  ip: z.string().max(64).nullish(),
  agente: z.string().max(300).nullish(),
  versao: z.string().regex(/^[0-9a-f]{64}$/),
  link: z.string().max(300).nullish()
});

export type EntradaDaCopia = z.input<typeof esquema>;

const CANAIS = { link: 'Pelo link do orçamento', whatsapp: 'Pelo WhatsApp', presencial: 'Na oficina, com assinatura' } as const;

/** O link do orçamento só entra se for deste site (/l/<token>). */
async function linkDesteSite(link: string | null | undefined): Promise<string | null> {
  if (!link) return null;
  try {
    const u = new URL(link);
    const h = await headers();
    const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase();
    if (u.host.toLowerCase() !== host || !/^\/l\/[A-Za-z0-9_-]{43}$/.test(u.pathname) || !/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Manda a cópia. `enviado: false` quando o e-mail está desligado (sem RESEND_API_KEY e
 * AVISOS_REMETENTE): a aprovação vale do mesmo jeito.
 */
export async function enviarCopiaDaAprovacao(entrada: EntradaDaCopia): Promise<{ ok: true; enviado: boolean; para: string } | { ok: false; erro: string }> {
  const r = esquema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Dados da aprovação inválidos.' };
  const d = r.data;
  const acesso = await acessoDaOficina();
  if (!acesso.ok) return { ok: false, erro: acesso.erro };
  if (!(await permitido(`copia-aprovacao:${acesso.oficina.id}`, 40, 60))) return { ok: false, erro: 'Muitos e-mails seguidos. Tente daqui a pouco.' };
  const para = d.para.trim().toLowerCase();
  // só para um cliente cadastrado nesta oficina (as regras do banco mostram só os dela)
  const { data: clientes, error } = await acesso.sb
    .from('registros')
    .select('id')
    .eq('oficina_id', acesso.oficina.id)
    .eq('colecao', 'clientes')
    .eq('apagado', false)
    .ilike('dados->>email', para)
    .limit(1);
  if (error) {
    console.error('[email] cliente', error);
    return { ok: false, erro: 'Não deu para conferir o cliente agora.' };
  }
  if (!clientes?.length) return { ok: false, erro: 'Este e-mail não é de um cliente da oficina (ou o cadastro ainda não subiu).' };
  const email = emailDaAprovacao({
    oficina: acesso.oficina.nome,
    cliente: d.cliente,
    numero: d.numero,
    carro: d.carro,
    placa: d.placa,
    itens: d.itens,
    recusados: d.recusados,
    total: d.total,
    validade: d.validade,
    canal: CANAIS[d.canal],
    quando: d.quando,
    nome: d.nome,
    ip: d.ip,
    aparelho: aparelhoDoAgente(d.agente),
    marcadoNaOficina: d.canal !== 'link',
    conferencia: codigoDeConferencia(d.versao),
    versao: d.versao,
    link: await linkDesteSite(d.link)
  });
  const envio = await enviarEmail({ para, ...email, chave: `aprovacao-${acesso.oficina.id}-${d.documentoId}-${d.versao.slice(0, 16)}` });
  if (envio.ok) return { ok: true, enviado: true, para };
  if (envio.motivo === 'desligado') return { ok: true, enviado: false, para };
  console.error('[email] envio', envio.erro);
  return { ok: false, erro: 'Não deu para mandar o e-mail agora.' };
}
