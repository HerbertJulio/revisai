// O pedido depois de enviado, como a oficina acompanha: a situação da parte de cada loja, o
// pagamento por Pix direto para a loja e a entrega no mapa, como nos apps de entrega.
// Sem servidor aqui, para dar para testar e usar nas telas.

import { z } from 'zod';
import { formatarMoeda } from './formatos';
import type { SituacaoParte } from './marketplace-dados';

export type SituacaoPagamento = 'pendente' | 'informado' | 'confirmado';

/** Como a oficina lê a situação da parte de cada loja. */
export const SITUACOES_PARA_OFICINA: Record<SituacaoParte, { nome: string; tom: 'oleo' | 'caneta' | 'ok' | 'atraso' | 'neutro' }> = {
  novo: { nome: 'Pedido recebido', tom: 'oleo' },
  em_contato: { nome: 'A loja está falando com você', tom: 'caneta' },
  confirmado: { nome: 'Confirmado, separando', tom: 'caneta' },
  saiu_entrega: { nome: 'Saiu para entrega', tom: 'ok' },
  entregue: { nome: 'Entregue', tom: 'neutro' },
  cancelado: { nome: 'Cancelado', tom: 'atraso' }
};

/** As etapas da barra de progresso. */
export const ETAPAS: { id: SituacaoParte; nome: string }[] = [
  { id: 'novo', nome: 'Recebido' },
  { id: 'confirmado', nome: 'Confirmado' },
  { id: 'saiu_entrega', nome: 'A caminho' },
  { id: 'entregue', nome: 'Entregue' }
];

/** Em que etapa está (em contato conta como recebido). */
export function etapa(s: SituacaoParte): number {
  if (s === 'cancelado') return -1;
  if (s === 'em_contato') return 0;
  return ETAPAS.findIndex((e) => e.id === s);
}

export interface PosicaoEntrega {
  lat: number;
  lng: number;
  precisao: number | null;
  em: string;
}

export interface ParteAcompanhada {
  fornecedorId: number;
  fornecedor: string;
  whatsapp: string | null;
  status: SituacaoParte;
  subtotal: number;
  itens: { nome: string; quantidade: number; precoUnitario: number; combinado: boolean }[];
  pagamento: SituacaoPagamento;
  pagamentoEm: string | null;
  /** A loja cadastrou a chave Pix. */
  pix: boolean;
  entrega: { previsao: string | null; saiuEm: string | null; posicao: PosicaoEntrega | null; entregueEm: string | null };
  atualizadoEm: string;
}

export interface PedidoAcompanhado {
  codigo: string;
  criadoEm: string;
  total: number;
  partes: ParteAcompanhada[];
}

/** A oficina vê o Pix da loja depois que a loja confirma o pedido. */
export function pixLiberado(s: SituacaoParte): boolean {
  return s === 'confirmado' || s === 'saiu_entrega' || s === 'entregue';
}

/** Dias que o link do entregador vale depois da saída (o servidor usa o mesmo prazo). */
export const DIAS_DO_LINK = 3;

/**
 * A parte está a caminho: saiu para entrega há menos de 3 dias. Depois disso, se a loja esqueceu de
 * marcar a entrega, deixa de contar como a caminho (sem mapa, sem número na aba).
 */
export function aCaminho(parte: { status: SituacaoParte; entrega: { saiuEm: string | null } }, agora: number): boolean {
  if (parte.status !== 'saiu_entrega') return false;
  const saiu = parte.entrega.saiuEm ? Date.parse(parte.entrega.saiuEm) : Number.NaN;
  return !Number.isFinite(saiu) || agora - saiu < DIAS_DO_LINK * 86_400_000;
}

/** O pedido ainda pede atenção (alguma parte não terminou). */
export function pedidoEmAndamento(p: Pick<PedidoAcompanhado, 'partes'>): boolean {
  return p.partes.some((x) => x.status !== 'entregue' && x.status !== 'cancelado');
}

/** "agora", "há 3 min", "há 2 h". */
export function haQuantoTempo(instante: string, agora: number): string {
  const min = Math.max(0, Math.round((agora - Date.parse(instante)) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'dia' : 'dias'}`;
}

/** A posição do entregador está recente o bastante para mostrar no mapa (até 30 minutos). */
export function posicaoRecente(p: PosicaoEntrega | null, agora: number): boolean {
  return !!p && agora - Date.parse(p.em) < 30 * 60_000;
}

/** Distância em metros entre duas posições (fórmula de haversine). */
export function distanciaEmMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * O celular do entregador manda a posição a cada 20 segundos, ou depois de 10 se andou mais de 60
 * metros: no máximo 6 por minuto, dentro do limite do servidor.
 */
export function deveMandar(ultimo: { t: number; lat: number; lng: number } | null, agora: { t: number; lat: number; lng: number }): boolean {
  if (!ultimo) return true;
  const passou = agora.t - ultimo.t;
  return passou >= 20_000 || (passou >= 10_000 && distanciaEmMetros(ultimo, agora) >= 60);
}

/** O mapa do OpenStreetMap com um marcador na posição (para o iframe). */
export function mapaEmbutido(lat: number, lng: number, raio = 0.008): string {
  const f = (n: number) => n.toFixed(5);
  const caixa = [lng - raio * 1.6, lat - raio, lng + raio * 1.6, lat + raio].map(f).join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${caixa}&layer=mapnik&marker=${f(lat)}%2C${f(lng)}`;
}

/** Abrir a posição no mapa, fora do app. */
export function linkDoMapa(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=16/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

/** O caminho até a oficina no Google Maps (o entregador escolhe o app). */
export function linkDoCaminho(endereco: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}`;
}

/** Mensagem para mandar o link ao entregador. */
export function mensagemDoEntregador(ctx: { loja: string; codigo: string; oficina: string; endereco: string | null; link: string }): string {
  return [
    `Entrega do pedido ${ctx.codigo} da ${ctx.loja} para a ${ctx.oficina}${ctx.endereco ? `, ${ctx.endereco}` : ''}.`,
    `Abra este link no celular e deixe aberto durante a entrega, para a oficina acompanhar: ${ctx.link}`
  ].join('\n');
}

/** Para a loja avisar a oficina que o pedido saiu. */
export function mensagemSaiu(ctx: { loja: string; codigo: string; oficina: string; previsao: string | null; total: number }): string {
  return `Olá, ${ctx.oficina}! Aqui é da ${ctx.loja}. O pedido ${ctx.codigo} (${formatarMoeda(ctx.total)}) saiu para entrega${ctx.previsao ? `, chega ${ctx.previsao}` : ''}. Dá para acompanhar no Revisaí, na Loja.`;
}

/** O que muda junto com a situação: a entrega termina (o link do entregador para de valer). */
export function mudancasDaSituacao(status: SituacaoParte, atual: { entrega_saiu_em: string | null }, agora: string): Record<string, unknown> {
  const m: Record<string, unknown> = { status, atualizado_em: agora };
  // a entrega terminou: o link para de valer e a posição do entregador é apagada
  const fim = { entrega_hash: null, entrega_lat: null, entrega_lng: null, entrega_precisao: null, entrega_posicao_em: null };
  if (status === 'entregue') Object.assign(m, { entregue_em: agora, ...fim });
  if (status === 'cancelado') Object.assign(m, fim);
  if (status === 'saiu_entrega' && !atual.entrega_saiu_em) m.entrega_saiu_em = agora;
  return m;
}

// ---------------------------------------------------------------- entradas

export const esquemaAcompanhar = z.object({
  aparelhoId: z.uuid(),
  codigos: z.array(z.string().regex(/^[A-Z0-9]{6}$/)).min(1).max(30)
});

export const esquemaParteDaOficina = z.object({
  aparelhoId: z.uuid(),
  codigo: z.string().regex(/^[A-Z0-9]{6}$/),
  fornecedorId: z.number().int().positive()
});

export const esquemaPosicao = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  precisao: z.number().min(0).max(100_000).nullable()
});

/** O código do link do entregador (43 caracteres, 256 bits). */
export function tokenValido(t: string | null | undefined): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
}

/** A previsão que a loja escreve ("hoje até 16h"). */
export const esquemaPrevisao = z.string().trim().max(40).optional().default('');
