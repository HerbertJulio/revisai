import 'server-only';

// Códigos do Pro. O financeiro cria o código no painel depois do pagamento; o dono da oficina
// digita o código no app e o banco liga o código à oficina (ativar_codigo_pro): a primeira
// oficina que ativar fica com ele. A equipe também pode dar o Pro direto (equipe_dar_pro).

import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { acessoDaOficina } from './conta';
import { mensagemDoBanco } from './conta-dados';
import { somarMeses } from './datas';
import { diaEmBrasilia } from './equipe-dados';
import { normalizarTelefone } from './formatos';
import { normalizarCodigo } from './plano';
import { COLUNAS_ASSINATURA, lerAssinaturas, MESES_PRO, type Assinatura } from './pro-dados';

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 16 letras e números sem os que confundem (0/O, 1/I): 80 bits de sorte. */
export function gerarCodigoPro(): string {
  let c = '';
  for (let i = 0; i < 16; i++) c += LETRAS[randomInt(LETRAS.length)];
  return c;
}

/** As assinaturas (códigos do Pro), como a equipe vê (o banco só mostra para financeiro e suporte). */
export async function listarAssinaturas(sb: SupabaseClient): Promise<{ dados: Assinatura[]; erro: string | null }> {
  const { data, error } = await sb.from('assinaturas').select(COLUNAS_ASSINATURA).order('criado_em', { ascending: false }).limit(500);
  if (error) {
    console.error('[pro] assinaturas', error);
    return { dados: [], erro: 'Não deu para carregar agora. Atualize a página em instantes.' };
  }
  const { itens, descartadas } = lerAssinaturas(data);
  if (descartadas) console.warn(`[pro] ${descartadas} assinatura(s) fora do formato esperado`);
  return { dados: itens, erro: null };
}

const esquemaNova = z.object({
  oficinaNome: z.string().trim().min(2, 'Escreva o nome da oficina.').max(120),
  oficinaWhatsapp: z.string().trim().max(30).default(''),
  meses: z.coerce.number().refine((m) => (MESES_PRO as readonly number[]).includes(m), 'Escolha 1, 3, 6 ou 12 meses.'),
  valor: z.coerce.number().min(0).max(100_000).nullable().default(null),
  observacao: z.string().trim().max(300).default('')
});

/** Cria o código do Pro de uma oficina que pagou (com o cliente de quem é do financeiro). */
export async function criarAssinatura(sb: SupabaseClient, entrada: unknown): Promise<Gravacao<{ assinatura: Assinatura }>> {
  const r = esquemaNova.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Dados inválidos.' };
  const e = r.data;
  let whatsapp: string | null = null;
  if (e.oficinaWhatsapp) {
    whatsapp = normalizarTelefone(e.oficinaWhatsapp);
    if (!whatsapp) return { ok: false, erro: 'O WhatsApp não parece um número do Brasil. Use DDD e número.' };
  }
  const ate = somarMeses(diaEmBrasilia(Date.now()), e.meses);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data, error } = await sb
      .from('assinaturas')
      .insert({
        oficina_nome: e.oficinaNome,
        oficina_whatsapp: whatsapp,
        meses: e.meses,
        valor: e.valor,
        ate,
        codigo: gerarCodigoPro(),
        observacao: e.observacao || null
      })
      .select(COLUNAS_ASSINATURA)
      .single();
    if (!error) {
      const [assinatura] = lerAssinaturas([data]).itens;
      return assinatura ? { ok: true, assinatura } : { ok: false, erro: 'O código foi criado, mas não deu para mostrar. Atualize a página.' };
    }
    if (error.code !== '23505') {
      console.error('[pro] nova assinatura', error);
      return { ok: false, erro: mensagemDoBanco(error, 'Não deu para criar o código agora. Tente de novo.') };
    }
  }
  return { ok: false, erro: 'Não deu para criar o código agora. Tente de novo.' };
}

/** O dono (ou o gerente) ativa um código do Pro na oficina dele. */
export async function ativarCodigoNaOficina(sb: SupabaseClient, oficinaId: string, texto: string): Promise<Gravacao<{ ate: string; oficina: string; codigo: string }>> {
  const codigo = normalizarCodigo(texto);
  if (!/^[0-9A-Z]{16}$/.test(codigo)) return { ok: false, erro: 'O código tem 16 letras e números. Confira e tente de novo.' };
  const { data, error } = await sb.rpc('ativar_codigo_pro', { p_oficina: oficinaId, p_codigo: codigo });
  if (error) {
    if (error.code === 'RV030') return { ok: false, erro: 'Esse código não existe. Confira as letras e os números.' };
    if (error.code === 'RV031') return { ok: false, erro: 'Esse código já foi usado por outra oficina. Fale com a equipe do Revisaí.' };
    if (error.code === 'RV032') return { ok: false, erro: 'Esse código já venceu. Fale com a equipe do Revisaí para renovar.' };
    if (error.code === '42501') return { ok: false, erro: 'Só o dono ou o gerente da oficina ativa o Pro.' };
    console.error('[pro] ativar código', error);
    return { ok: false, erro: 'Não deu para ativar agora. Tente de novo.' };
  }
  const r = (data ?? {}) as { ate?: unknown; oficina?: unknown };
  return { ok: true, ate: String(r.ate ?? ''), oficina: String(r.oficina ?? ''), codigo };
}

/**
 * @deprecated Use ativarCodigoNaOficina com o acesso da oficina. Fica para a tela antiga do
 * plano: ativa o código na oficina escolhida de quem entrou.
 */
export async function ativarCodigo(texto: string): Promise<Gravacao<{ ate: string; oficina: string; codigo: string }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return a;
  return ativarCodigoNaOficina(a.sb, a.oficina.id, texto);
}
