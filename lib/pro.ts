import 'server-only';

// Códigos do Pro. A equipe cria o código no painel depois do pagamento; a oficina digita o código
// no app e o servidor confere se ele existe, se ainda vale e em quantos aparelhos já foi usado.

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { somarMeses } from './datas';
import { clienteEquipe } from './equipe';
import { normalizarTelefone } from './formatos';
import { hojeEmBrasilia } from './marketplace';
import { normalizarCodigo } from './plano';
import { COLUNAS_ASSINATURA, lerAssinaturas, MAX_APARELHOS, MESES_PRO, type Assinatura } from './pro-dados';

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const SEM_BANCO = 'O banco não está configurado.';
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 16 letras e números sem os que confundem (0/O, 1/I): 80 bits de sorte. */
export function gerarCodigoPro(): string {
  let c = '';
  for (let i = 0; i < 16; i++) c += LETRAS[randomInt(LETRAS.length)];
  return c;
}

export async function listarAssinaturas(): Promise<{ dados: Assinatura[]; erro: string | null }> {
  const sb = clienteEquipe();
  if (!sb) return { dados: [], erro: SEM_BANCO };
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

export async function criarAssinatura(entrada: unknown): Promise<Gravacao<{ assinatura: Assinatura }>> {
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const r = esquemaNova.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Dados inválidos.' };
  const e = r.data;
  let whatsapp: string | null = null;
  if (e.oficinaWhatsapp) {
    whatsapp = normalizarTelefone(e.oficinaWhatsapp);
    if (!whatsapp) return { ok: false, erro: 'O WhatsApp não parece um número do Brasil. Use DDD e número.' };
  }
  const ate = somarMeses(hojeEmBrasilia(), e.meses);
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
      return { ok: false, erro: 'Não deu para criar o código agora. Tente de novo.' };
    }
  }
  return { ok: false, erro: 'Não deu para criar o código agora. Tente de novo.' };
}

/** A oficina digitou o código no app. Conta mais um aparelho se o código ainda vale. */
export async function ativarCodigo(texto: string): Promise<Gravacao<{ ate: string; oficina: string; codigo: string }>> {
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: 'O Pro ainda não está disponível neste servidor.' };
  const codigo = normalizarCodigo(texto);
  if (!/^[0-9A-Z]{16}$/.test(codigo)) return { ok: false, erro: 'O código tem 16 letras e números. Confira e tente de novo.' };
  const { data, error } = await sb.from('assinaturas').select('id, oficina_nome, ate, ativacoes').eq('codigo', codigo).maybeSingle();
  if (error) {
    console.error('[pro] conferir código', error);
    return { ok: false, erro: 'Não deu para conferir o código agora. Tente de novo.' };
  }
  if (!data) return { ok: false, erro: 'Esse código não existe. Confira as letras e os números.' };
  const linha = data as { id: number; oficina_nome: string; ate: string; ativacoes: number };
  if (linha.ate < hojeEmBrasilia()) return { ok: false, erro: 'Esse código já venceu. Fale com a equipe do Revisaí para renovar.' };
  if (linha.ativacoes >= MAX_APARELHOS) return { ok: false, erro: `Esse código já foi usado em ${MAX_APARELHOS} aparelhos. Fale com a equipe do Revisaí.` };
  const { data: atualizado, error: erroUpdate } = await sb
    .from('assinaturas')
    .update({ ativacoes: linha.ativacoes + 1 })
    .eq('id', linha.id)
    .eq('ativacoes', linha.ativacoes)
    .select('id')
    .maybeSingle();
  if (erroUpdate || !atualizado) {
    if (erroUpdate) console.error('[pro] contar ativação', erroUpdate);
    return { ok: false, erro: 'Não deu para ativar agora. Tente de novo.' };
  }
  return { ok: true, ate: linha.ate, oficina: linha.oficina_nome, codigo };
}
