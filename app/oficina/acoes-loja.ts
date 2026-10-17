'use server';

// Ações da loja da oficina: alerta de preço, acompanhar os pedidos, pagar por Pix e pedir mais
// alertas. Tudo como a pessoa que entrou, pela oficina escolhida; o banco confere de novo.

import { z } from 'zod';
import { alertasDaOficina, cancelarAlerta, criarAlerta, fecharAlerta, pedirPacote, type ItemFechado } from '@/lib/alertas';
import type { AlertaDaOficina, CotaAlertas } from '@/lib/alertas-dados';
import { acessoDaOficina } from '@/lib/conta';
import { acompanharPedidos, informarPagamento, pixDaParte } from '@/lib/entregas';
import { esquemaParte, type PedidoAcompanhado } from '@/lib/entregas-dados';
import { permitido } from '@/lib/limite';

/** `semConta`: a pessoa não entrou (ou saiu); a tela manda para o login. */
type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string; semConta?: boolean };

const MUITOS = 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
const FALHOU = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';

export async function mandarAlerta(entrada: unknown): Promise<Resposta<{ alerta: AlertaDaOficina; lojas: number; cota: CotaAlertas | null }> & { semCota?: boolean }> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('alerta-criar', 12, 60))) return { ok: false, erro: MUITOS };
  try {
    return await criarAlerta(a, entrada);
  } catch (e) {
    console.error('[alertas] mandar', e);
    return { ok: false, erro: FALHOU };
  }
}

/** Os alertas da oficina com as respostas e a cota. */
export async function verAlertas(): Promise<Resposta<{ alertas: AlertaDaOficina[]; cota: CotaAlertas | null }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('alerta-ver', 90, 10))) return { ok: false, erro: MUITOS };
  try {
    const d = await alertasDaOficina(a);
    return d.erro ? { ok: false, erro: d.erro } : { ok: true, alertas: d.alertas, cota: d.cota };
  } catch (e) {
    console.error('[alertas] ver', e);
    return { ok: false, erro: FALHOU };
  }
}

export async function desistirDoAlerta(alertaId: string): Promise<Resposta> {
  if (!z.uuid().safeParse(alertaId).success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('alerta-cancelar', 20, 10))) return { ok: false, erro: MUITOS };
  return cancelarAlerta(a, alertaId);
}

export async function fecharComLoja(entrada: unknown): Promise<Resposta<{ codigo: string; total: number; itens: ItemFechado[] }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('alerta-fechar', 8, 10))) return { ok: false, erro: MUITOS };
  try {
    return await fecharAlerta(a, entrada);
  } catch (e) {
    console.error('[alertas] fechar', e);
    return { ok: false, erro: FALHOU };
  }
}

export async function comprarAlertas(entrada: unknown): Promise<Resposta<{ pix: string | null; valor: number }>> {
  const r = z.object({ quantidade: z.number().int(), whatsapp: z.string().max(30).optional().default('') }).safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('alerta-pacote', 4, 60))) return { ok: false, erro: 'Já recebemos o seu pedido. A equipe fala com você em breve.' };
  return pedirPacote(a, r.data);
}

/** Os pedidos da oficina (últimos 45 dias) com a situação e o histórico de cada loja. */
export async function acompanhar(): Promise<Resposta<{ pedidos: PedidoAcompanhado[] }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('acompanhar', 120, 10))) return { ok: false, erro: MUITOS };
  try {
    const d = await acompanharPedidos(a.sb, a.oficina.id);
    return d.erro ? { ok: false, erro: d.erro } : { ok: true, pedidos: d.dados };
  } catch (e) {
    console.error('[entregas] acompanhar', e);
    return { ok: false, erro: FALHOU };
  }
}

export async function codigoDoPix(entrada: unknown): Promise<Resposta<{ codigo: string; valor: number; recebedor: string; trocadaEm: string | null }>> {
  const r = esquemaParte.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('pix', 30, 10))) return { ok: false, erro: MUITOS };
  return pixDaParte(a.sb, r.data.parteId);
}

export async function avisarQuePaguei(entrada: unknown): Promise<Resposta> {
  const r = esquemaParte.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('pix-pago', 20, 10))) return { ok: false, erro: MUITOS };
  return informarPagamento(a.sb, r.data.parteId);
}
