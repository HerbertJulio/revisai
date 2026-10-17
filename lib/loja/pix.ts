import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizarChavePix, type TipoChavePix } from '../pix';
import { mensagemDaLoja } from './comum';
import { lerResumoPix, type ResumoPix } from './dados';

// A chave Pix da loja, para a oficina pagar o pedido direto na conta dela. Só o dono troca, logo
// depois de confirmar o código do e-mail; a troca vale depois de 24 horas (e dá para cancelar),
// para quem pegar a sessão de alguém não desviar os pagamentos na hora.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

/** O que o painel mostra do Pix (aplicando antes a troca que já passou das 24 horas). */
export async function pixDaLoja(sb: SupabaseClient, fornecedorId: number): Promise<ResumoPix | null> {
  const { data, error } = await sb.rpc('loja_pix', { p_fornecedor: fornecedorId });
  if (error) {
    console.error('[loja] pix', error);
    return null;
  }
  return lerResumoPix(data);
}

const TIPOS_PIX = ['cnpj', 'cpf', 'email', 'telefone', 'aleatoria'] as const;

export const esquemaPixDaLoja = z.object({
  tipo: z.enum(TIPOS_PIX),
  chave: z.string().trim().min(1, 'Escreva a chave Pix.').max(100),
  nome: z.string().trim().min(2, 'Escreva o nome de quem recebe, como está no banco.').max(80),
  cidade: z.string().trim().min(2, 'Escreva a cidade.').max(80)
});

const ERRO_CHAVE: Record<TipoChavePix, string> = {
  cnpj: 'O CNPJ tem 14 letras e números (como aparece no cartão do CNPJ).',
  cpf: 'O CPF tem 11 números.',
  email: 'Confira o e-mail da chave.',
  telefone: 'Escreva o celular da chave com DDD.',
  aleatoria: 'A chave aleatória tem 32 letras e números, com tracinhos (como aparece no app do banco).'
};

/** No QR Code do Pix, o nome vai com até 25 letras e a cidade com até 15 (sem acento fica melhor). */
function cortar(texto: string, max: number): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

export type ResultadoTroca = { ok: true; imediata: boolean; valeEm: string } | { ok: false; erro: string; confirmarEmail?: boolean };

export async function trocarPix(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<ResultadoTroca> {
  const r = esquemaPixDaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira a chave Pix.' };
  const d = r.data;
  const chave = normalizarChavePix(d.tipo, d.chave);
  if (!chave) return { ok: false, erro: ERRO_CHAVE[d.tipo] };
  const nome = cortar(d.nome, 25);
  const cidade = cortar(d.cidade, 15);
  if (nome.length < 2 || cidade.length < 2) return { ok: false, erro: 'Confira o nome e a cidade.' };
  const { data, error } = await sb.rpc('loja_trocar_pix', { p_fornecedor: fornecedorId, p_tipo: d.tipo, p_chave: chave, p_nome: nome, p_cidade: cidade });
  if (error) {
    if (error.code === 'RV020') return { ok: false, erro: 'Para trocar a chave, confirme o código que vamos mandar para o seu e-mail.', confirmarEmail: true };
    console.error('[loja] trocar pix', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para salvar a chave agora. Tente de novo.') };
  }
  const x = z.object({ imediata: z.boolean(), valeEm: z.string() }).safeParse(data);
  return x.success ? { ok: true, imediata: x.data.imediata, valeEm: x.data.valeEm } : { ok: true, imediata: false, valeEm: new Date(Date.now() + 86_400_000).toISOString() };
}

export async function cancelarTrocaDoPix(sb: SupabaseClient, fornecedorId: number): Promise<Gravacao> {
  const { error } = await sb.rpc('loja_cancelar_troca_pix', { p_fornecedor: fornecedorId });
  if (error) {
    console.error('[loja] cancelar troca do pix', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para cancelar agora. Tente de novo.') };
  }
  return { ok: true };
}
