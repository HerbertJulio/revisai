'use server';

// A assinatura do Pro pela oficina: só o dono ou o gerente assina, troca o jeito de pagar ou
// cancela. O gateway recebe os dados; o cartão é digitado na página do próprio gateway.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { documentoValido } from '@/lib/cobranca/documento';
import { assinarPro, cancelarPro, conferirPagamentos, type Res } from '@/lib/cobranca/servidor';
import { acessoDaOficina } from '@/lib/conta';
import { permitido } from '@/lib/limite';
import { ipDoPedido } from '@/lib/supabase-servidor';

const SO_DONO = 'Só o dono ou o gerente da oficina cuida da assinatura.';

async function acessoDeQuemAssina() {
  const a = await acessoDaOficina();
  if (!a.ok) return a;
  if (a.oficina.papel !== 'dono' && a.oficina.papel !== 'gerente') return { ok: false as const, erro: SO_DONO };
  return a;
}

const esquema = z.object({
  metodo: z.enum(['pix_automatico', 'pix', 'cartao', 'boleto']),
  documento: z.string().max(30),
  nome: z.string().trim().min(2, 'Escreva o nome ou a razão social.').max(120),
  email: z.email('Confira o e-mail.').max(160)
});

export async function assinar(dados: unknown): Promise<Res> {
  if (!(await permitido('cobranca-assinar', 6, 15))) return { ok: false, erro: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
  const v = esquema.safeParse(dados);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? 'Confira os dados.' };
  const documento = documentoValido(v.data.documento);
  if (!documento) return { ok: false, erro: 'Confira o CPF ou o CNPJ.' };
  const a = await acessoDeQuemAssina();
  if (!a.ok) return a;
  const ip = await ipDoPedido();
  const r = await assinarPro(
    a.sb,
    { id: a.oficina.id, nome: a.oficina.nome, whatsapp: a.oficina.whatsapp },
    a.conta.usuario.id,
    { metodo: v.data.metodo, documento, nome: v.data.nome, email: v.data.email.toLowerCase(), telefone: a.oficina.whatsapp },
    ip === 'local' ? null : ip
  );
  revalidatePath('/oficina/assinatura');
  return r;
}

export async function cancelar(): Promise<Res> {
  if (!(await permitido('cobranca-cancelar', 6, 15))) return { ok: false, erro: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
  const a = await acessoDeQuemAssina();
  if (!a.ok) return a;
  const r = await cancelarPro(a.oficina.id);
  revalidatePath('/oficina/assinatura');
  return r;
}

/** A tela pergunta a cada 10 segundos enquanto há pagamento em aberto. */
export async function conferir(): Promise<Res<{ mudou: boolean }>> {
  if (!(await permitido('cobranca-conferir', 40, 5))) return { ok: true, mudou: false };
  const a = await acessoDeQuemAssina();
  if (!a.ok) return a;
  return conferirPagamentos(a.oficina.id);
}
