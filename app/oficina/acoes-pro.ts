'use server';

// A oficina digita o código do Pro que recebeu da equipe depois do pagamento.

import { permitido } from '@/lib/limite';
import { ativarCodigo, type Gravacao } from '@/lib/pro';

export async function ativarCodigoPro(codigo: string): Promise<Gravacao<{ ate: string; oficina: string; codigo: string }>> {
  if (!(await permitido('pro-ativar', 8, 30))) return { ok: false, erro: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
  return ativarCodigo(String(codigo ?? '').slice(0, 40));
}
