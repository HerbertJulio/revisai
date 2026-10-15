'use server';

// Ações da loja da oficina: alerta de preço, acompanhar o pedido, pagar por Pix e pedir mais alertas.
// O aparelho manda o número aleatório dele; o servidor confere tudo no banco antes de responder.

import { z } from 'zod';
import { alertasDaOficina, cancelarAlerta, criarAlerta, fecharAlerta, pedirPacote, type ItemFechado } from '@/lib/alertas';
import type { AlertaDaOficina, CotaAlertas } from '@/lib/alertas-dados';
import { acompanharPedidos, informarPagamento, pixDaParte } from '@/lib/entregas';
import { esquemaAcompanhar, esquemaParteDaOficina, type PedidoAcompanhado } from '@/lib/entregas-dados';
import { permitido } from '@/lib/limite';

type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const MUITOS = 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
const FALHOU = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';

const codigoPro = z
  .string()
  .regex(/^[0-9A-Z]{16}$/)
  .nullable();

export async function mandarAlerta(entrada: unknown): Promise<Resposta<{ alerta: AlertaDaOficina; lojas: number; cota: CotaAlertas }> & { semCota?: boolean }> {
  if (!(await permitido('alerta-criar', 12, 60))) return { ok: false, erro: MUITOS };
  try {
    return await criarAlerta(entrada);
  } catch (e) {
    console.error('[alertas] mandar', e);
    return { ok: false, erro: FALHOU };
  }
}

const esquemaVer = z.object({ aparelhoId: z.uuid(), codigoPro, whatsapp: z.string().max(30) });

export async function verAlertas(entrada: unknown): Promise<Resposta<{ alertas: AlertaDaOficina[]; cota: CotaAlertas | null }>> {
  const r = esquemaVer.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  if (!(await permitido('alerta-ver', 90, 10))) return { ok: false, erro: MUITOS };
  try {
    const d = await alertasDaOficina(r.data);
    return d.erro ? { ok: false, erro: d.erro } : { ok: true, alertas: d.alertas, cota: d.cota };
  } catch (e) {
    console.error('[alertas] ver', e);
    return { ok: false, erro: FALHOU };
  }
}

export async function desistirDoAlerta(aparelhoId: string, alertaId: string): Promise<Resposta> {
  if (!z.uuid().safeParse(aparelhoId).success || !z.uuid().safeParse(alertaId).success) return { ok: false, erro: 'Pedido inválido.' };
  if (!(await permitido('alerta-cancelar', 20, 10))) return { ok: false, erro: MUITOS };
  return cancelarAlerta(aparelhoId, alertaId);
}

export async function fecharComLoja(entrada: unknown): Promise<Resposta<{ codigo: string; total: number; itens: ItemFechado[] }>> {
  if (!(await permitido('alerta-fechar', 8, 10))) return { ok: false, erro: MUITOS };
  try {
    return await fecharAlerta(entrada);
  } catch (e) {
    console.error('[alertas] fechar', e);
    return { ok: false, erro: FALHOU };
  }
}

export async function comprarAlertas(entrada: unknown): Promise<Resposta<{ pix: string | null; valor: number }>> {
  const r = z
    .object({
      codigoPro: z.string().regex(/^[0-9A-Z]{16}$/, 'Os pacotes são para quem tem o Pro.'),
      quantidade: z.number().int(),
      oficina: z.object({ nome: z.string().max(120), whatsapp: z.string().max(30), cidade: z.string().max(80), uf: z.string().max(2) })
    })
    .safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Pedido inválido.' };
  if (!(await permitido('alerta-pacote', 4, 60))) return { ok: false, erro: 'Já recebemos o seu pedido. A equipe fala com você em breve.' };
  return pedirPacote(r.data);
}

export async function acompanhar(entrada: unknown): Promise<Resposta<{ pedidos: PedidoAcompanhado[] }>> {
  const r = esquemaAcompanhar.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  if (!(await permitido('acompanhar', 120, 10))) return { ok: false, erro: MUITOS };
  try {
    const d = await acompanharPedidos(r.data.aparelhoId, r.data.codigos);
    return d.erro ? { ok: false, erro: d.erro } : { ok: true, pedidos: d.dados };
  } catch (e) {
    console.error('[entregas] acompanhar', e);
    return { ok: false, erro: FALHOU };
  }
}

export async function codigoDoPix(entrada: unknown): Promise<Resposta<{ codigo: string; valor: number; recebedor: string }>> {
  const r = esquemaParteDaOficina.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  if (!(await permitido('pix', 30, 10))) return { ok: false, erro: MUITOS };
  return pixDaParte(r.data.aparelhoId, r.data.codigo, r.data.fornecedorId);
}

export async function avisarQuePaguei(entrada: unknown): Promise<Resposta> {
  const r = esquemaParteDaOficina.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  if (!(await permitido('pix-pago', 20, 10))) return { ok: false, erro: MUITOS };
  return informarPagamento(r.data.aparelhoId, r.data.codigo, r.data.fornecedorId);
}
