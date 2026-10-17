'use server';

// A consulta da página pública do comparativo. Só a UF e a cidade vêm do navegador; os números
// que a pessoa digita ficam no aparelho dela (a comparação é feita lá). Limite por IP.

import { z } from 'zod';
import { lerComparativo, type Comparativo } from '@/lib/comparativo';
import { permitido } from '@/lib/limite';
import { UFS } from '@/lib/padroes';
import { clientePublico, clienteSistema, ipDoPedido } from '@/lib/supabase-servidor';

export type RespostaComparativo = { ok: true; dados: Comparativo | null } | { ok: false; erro: string };

const esquema = z.object({
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .refine((uf) => UFS.includes(uf), 'Escolha o estado.'),
  cidade: z.string().trim().max(80, 'Confira o nome da cidade.').optional().default('')
});

/** 20 consultas a cada 10 minutos por IP, contadas no banco (vale para todos os servidores). */
async function dentroDoLimite(): Promise<boolean> {
  const ip = await ipDoPedido();
  const sistema = clienteSistema();
  if (sistema) {
    const { data, error } = await sistema.rpc('limite_consumir', { p_chave: `comparativo:${ip}`, p_max: 20, p_segundos: 600 });
    if (!error) return data === true;
    console.error('[comparativo] limite', error);
  }
  // sem a chave do sistema (ou com o banco fora), o limite fica na memória deste servidor
  return permitido('comparativo', 20, 10);
}

export async function consultarComparativo(entrada: unknown): Promise<RespostaComparativo> {
  const r = esquema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Escolha o estado.' };
  if (!(await dentroDoLimite())) return { ok: false, erro: 'Muitas consultas seguidas. Espere alguns minutos e tente de novo.' };
  const sb = clientePublico();
  if (!sb) return { ok: false, erro: 'O comparativo ainda não está ligado por aqui.' };
  const { data, error } = await sb.rpc('comparativo_da_regiao', { p_uf: r.data.uf, p_cidade: r.data.cidade || null });
  if (error) {
    console.error('[comparativo]', error);
    return { ok: false, erro: 'Não deu para buscar a média agora. Tente de novo em instantes.' };
  }
  return { ok: true, dados: lerComparativo(data) };
}
