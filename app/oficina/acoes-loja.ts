'use server';

// Ações da loja da oficina: alerta de preço, acompanhar os pedidos, pagar por Pix, pedir mais
// alertas, as condições e o cashback das lojas, os anúncios vistos e clicados, e a garantia ou
// devolução de uma compra. Tudo como a pessoa que entrou, pela oficina escolhida; o banco confere
// de novo.

import { after } from 'next/server';
import { z } from 'zod';
import { alertasDaOficina, cancelarAlerta, criarAlerta, fecharAlerta, pedirPacote, type ItemFechado } from '@/lib/alertas';
import type { AlertaDaOficina, CotaAlertas } from '@/lib/alertas-dados';
import { acessoDaOficina } from '@/lib/conta';
import { acompanharPedidos, informarPagamento, pixDaParte } from '@/lib/entregas';
import { esquemaParte, type PedidoAcompanhado } from '@/lib/entregas-dados';
import { permitido } from '@/lib/limite';
import { condicoesDaOficina, type CondicoesDaOficina } from '@/lib/loja-da-oficina';
import { registrarClique, registrarImpressoes } from '@/lib/loja/anuncios';
import { avisarLojaDaDevolucao, avisarLojasDoAlerta } from '@/lib/loja/avisos';
import type { Devolucao } from '@/lib/loja/dados';
import { abrirDevolucao, confirmarResolucao, desistirDaDevolucao, devolucoesDaOficina, editarDevolucao, enviarFotoDaDevolucao } from '@/lib/loja/devolucoes';

/** `semConta`: a pessoa não entrou (ou saiu); a tela manda para o login. */
type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string; semConta?: boolean };

const MUITOS = 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
const FALHOU = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';

export async function mandarAlerta(entrada: unknown): Promise<Resposta<{ alerta: AlertaDaOficina; lojas: number; cota: CotaAlertas | null }> & { semCota?: boolean }> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('alerta-criar', 12, 60))) return { ok: false, erro: MUITOS };
  try {
    const r = await criarAlerta(a, entrada);
    if (r.ok) {
      // o aviso no WhatsApp das lojas da região sai depois da resposta (sem o modelo configurado, não sai nada)
      const alertaId = r.alerta.id;
      after(async () => {
        try {
          await avisarLojasDoAlerta(a.sb, alertaId);
        } catch (e) {
          console.error('[alertas] aviso às lojas', e);
        }
      });
    }
    return r;
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

/**
 * Os pedidos da oficina (últimos 45 dias) com a situação e o histórico de cada loja, e os pedidos de
 * garantia ou devolução com as respostas das lojas (null quando não deu para buscar agora).
 */
export async function acompanhar(): Promise<Resposta<{ pedidos: PedidoAcompanhado[]; devolucoes: Devolucao[] | null }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('acompanhar', 120, 10))) return { ok: false, erro: MUITOS };
  try {
    const [d, devolucoes] = await Promise.all([acompanharPedidos(a.sb, a.oficina.id), devolucoesDaOficina(a.sb, a.oficina.id, 100)]);
    return d.erro ? { ok: false, erro: d.erro } : { ok: true, pedidos: d.dados, devolucoes };
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

// ---------------------------------------------------------------- condições e cashback

/** O que cada loja combinou com a oficina (desconto ou preço fixo) e o saldo de cashback em cada uma. */
export async function condicoesDaLoja(): Promise<Resposta<CondicoesDaOficina>> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('loja-condicoes', 60, 10))) return { ok: false, erro: MUITOS };
  try {
    const d = await condicoesDaOficina(a.sb, a.oficina.id);
    return d ? { ok: true, ...d } : { ok: false, erro: FALHOU };
  } catch (e) {
    console.error('[loja da oficina] condições', e);
    return { ok: false, erro: FALHOU };
  }
}

// ---------------------------------------------------------------- anúncios

const esquemaVistos = z.object({ ids: z.array(z.number().int().positive()).min(1).max(50) });

/** A vitrine mostrou estes anúncios à oficina (o banco conta uma vez por anúncio por dia). */
export async function anunciosVistos(entrada: unknown): Promise<Resposta<{ n: number }>> {
  const r = esquemaVistos.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('anuncio-visto', 120, 10))) return { ok: false, erro: MUITOS };
  return { ok: true, n: await registrarImpressoes(a.sb, r.data.ids, a.oficina.id) };
}

/** A oficina abriu um anúncio. `esgotado`: o anúncio por clique gastou o teto do dia (sai da vitrine). */
export async function cliqueNoAnuncio(entrada: unknown): Promise<Resposta<{ esgotado: boolean }>> {
  const r = z.object({ impulsoId: z.number().int().positive() }).safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('anuncio-clique', 60, 10))) return { ok: false, erro: MUITOS };
  const c = await registrarClique(a.sb, r.data.impulsoId, a.oficina.id);
  if (!c) return { ok: false, erro: FALHOU };
  return { ok: true, esgotado: c.esgotado === true || c.motivo === 'fora_do_ar' };
}

// ---------------------------------------------------------------- garantia e devolução

/** Guarda uma foto (já reduzida no aparelho) para o pedido de garantia ou devolução. */
export async function fotoParaDevolucao(dados: FormData): Promise<Resposta<{ caminho: string }>> {
  const foto = dados.get('foto');
  if (!(foto instanceof File) || !foto.size) return { ok: false, erro: 'Escolha uma foto.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('devolucao-foto', 30, 10))) return { ok: false, erro: MUITOS };
  const r = await enviarFotoDaDevolucao(a.sb, a.oficina.id, foto);
  return r.ok ? { ok: true, caminho: r.caminho } : r;
}

/** A oficina pede garantia ou devolução de uma compra entregue; a loja recebe o aviso no WhatsApp. */
export async function pedirDevolucao(entrada: unknown): Promise<Resposta<{ id: string }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('devolucao-pedir', 10, 60))) return { ok: false, erro: MUITOS };
  const r = await abrirDevolucao(a.sb, entrada);
  if (r.ok) {
    const id = r.id;
    after(async () => {
      try {
        await avisarLojaDaDevolucao(a.sb, id);
      } catch (e) {
        console.error('[devoluções] aviso à loja', e);
      }
    });
  }
  return r;
}

/** A oficina muda o pedido (responde à loja) enquanto a loja não decidiu. */
export async function mudarDevolucao(id: string, entrada: unknown): Promise<Resposta> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('devolucao-mudar', 20, 60))) return { ok: false, erro: MUITOS };
  return editarDevolucao(a.sb, id, entrada);
}

export async function desistirDevolucao(id: string): Promise<Resposta> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('devolucao-desistir', 20, 60))) return { ok: false, erro: MUITOS };
  return desistirDaDevolucao(a.sb, id);
}

/** A oficina confirma que a loja resolveu (troca feita ou dinheiro devolvido). */
export async function confirmarDevolucao(id: string): Promise<Resposta> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('devolucao-confirmar', 20, 60))) return { ok: false, erro: MUITOS };
  return confirmarResolucao(a.sb, id);
}
