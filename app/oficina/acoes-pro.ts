'use server';

// O plano da oficina pela conta: o teste de 30 dias, o código do Pro que a equipe manda depois do
// pagamento e a conta atualizada para a tela mostrar o plano novo.

import { acessoDaOficina, contaAtual } from '@/lib/conta';
import type { Conta } from '@/lib/conta-dados';
import { permitido } from '@/lib/limite';
import { ativarCodigoNaOficina, type Gravacao } from '@/lib/pro';

export async function ativarCodigoPro(codigo: string): Promise<Gravacao<{ ate: string; oficina: string; codigo: string }>> {
  if (!(await permitido('pro-ativar', 8, 30))) return { ok: false, erro: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
  const a = await acessoDaOficina();
  if (!a.ok) return a;
  return ativarCodigoNaOficina(a.sb, a.oficina.id, String(codigo ?? '').slice(0, 40));
}

/** Começa o teste do Pro de 30 dias (uma vez por oficina e por conta). */
export async function comecarTestePro(): Promise<Gravacao<{ ate: string }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return a;
  const { data, error } = await a.sb.rpc('comecar_teste_pro', { p_oficina: a.oficina.id });
  if (error) {
    if (error.code === 'RV033') return { ok: false, erro: 'O teste do Pro já foi usado nesta conta ou neste WhatsApp. Para continuar no Pro, assine.' };
    if (error.code === '42501') return { ok: false, erro: 'Só o dono ou o gerente da oficina começa o teste.' };
    console.error('[pro] teste', error);
    return { ok: false, erro: 'Não deu para começar o teste agora. Tente de novo.' };
  }
  return { ok: true, ate: String(data ?? '') };
}

/** A conta como está agora no banco (depois de mudar o plano). */
export async function contaAgora(): Promise<Conta | null> {
  return contaAtual();
}
