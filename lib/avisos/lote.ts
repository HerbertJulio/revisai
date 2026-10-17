// O lote que o banco entrega ao processador (avisos_reservar) e a decisão de cada aviso.
// Sem nada de servidor aqui, para testar.

import { z } from 'zod';

const inscricao = z.object({ endpoint: z.string().min(8), p256dh: z.string().min(10), auth: z.string().min(4) });

const pessoa = z.object({
  userId: z.string().nullable().catch(null),
  email: z.string().nullable().catch(null),
  push: z.boolean().catch(true),
  emailLigado: z.boolean().catch(true),
  whatsapp: z.boolean().catch(true),
  inscricoes: z.array(inscricao).catch([])
});

const aviso = z.object({
  id: z.coerce.number(),
  tipo: z.string(),
  dados: z.record(z.string(), z.unknown()).catch({}),
  tentativas: z.coerce.number().catch(1),
  para: z
    .object({
      pessoas: z.array(pessoa).catch([]),
      whatsapps: z.array(z.string()).catch([])
    })
    .catch({ pessoas: [], whatsapps: [] })
});

export type AvisoReservado = z.infer<typeof aviso>;
export type PessoaDoAviso = z.infer<typeof pessoa>;

export function lerLote(dados: unknown): AvisoReservado[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = aviso.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Os e-mails para mandar (sem repetir, só de quem deixou o e-mail ligado). */
export function emailsDoAviso(pessoas: PessoaDoAviso[]): string[] {
  const vistos = new Set<string>();
  for (const p of pessoas) {
    const e = (p.email ?? '').trim().toLowerCase();
    if (p.emailLigado && EMAIL.test(e)) vistos.add(e);
  }
  return [...vistos];
}

/** As inscrições de push de quem deixou o push ligado (sem repetir o mesmo navegador). */
export function pushesDoAviso(pessoas: PessoaDoAviso[]): z.infer<typeof inscricao>[] {
  const vistos = new Map<string, z.infer<typeof inscricao>>();
  for (const p of pessoas) if (p.push) for (const i of p.inscricoes) vistos.set(i.endpoint, i);
  return [...vistos.values()];
}

export interface Contagem {
  ok: number;
  tentar: number;
  erro: number;
}

/**
 * Deu certo se algum canal entregou ou se não havia por onde mandar. Se nada entregou e houve
 * falha passageira (rede, limite do serviço), tenta de novo mais tarde. Falha definitiva
 * (endereço recusado) não adianta repetir.
 */
export function avisoConcluido(c: Contagem): boolean {
  if (c.ok > 0) return true;
  return c.tentar === 0;
}
