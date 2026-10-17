// O checklist de entrada: como o carro chegou (km, combustível, itens, avarias marcadas no
// desenho, fotos e observações) e a assinatura do cliente. Funções puras, para a tela, o link do
// cliente e os testes.

import { z } from 'zod';
import { caminhoDeFotoValido } from './andamento';
import { primeiroNome } from './formatos';
import type { AvariaChecklist, Checklist, EstadoItemChecklist, FotoRegistro, TipoAvaria } from './registros-oficina';
import type { Cliente, Veiculo } from './tipos';

export const ITENS_DO_CHECKLIST = [
  { id: 'estepe', nome: 'Estepe' },
  { id: 'macaco', nome: 'Macaco' },
  { id: 'chave_roda', nome: 'Chave de roda' },
  { id: 'triangulo', nome: 'Triângulo' },
  { id: 'tapetes', nome: 'Tapetes' },
  { id: 'som', nome: 'Som ou multimídia' },
  { id: 'calotas', nome: 'Calotas' },
  { id: 'documento', nome: 'Documento do carro' },
  { id: 'objetos_valor', nome: 'Objetos de valor' }
] as const;

export const ESTADOS_DO_ITEM: Record<EstadoItemChecklist, string> = { ok: 'OK', falta: 'Falta', avaria: 'Avaria' };

export const TIPOS_DE_AVARIA: Record<TipoAvaria, string> = { risco: 'Risco', amassado: 'Amassado', quebrado: 'Quebrado', trincado: 'Trincado', outro: 'Outro' };

/** Fotos no aparelho (sem conta): cada uma pequena, e poucas por checklist, para caber no registro. */
export const LIMITE_FOTO_NO_APARELHO = 150_000;
export const LIMITE_FOTOS_NO_APARELHO = 180_000;
export const LIMITE_ASSINATURA = 60_000;

/** A parte do carro pela posição no desenho visto de cima (frente para cima). */
export function localDaMarca(x: number, y: number): string {
  if (y < 0.16) return 'frente';
  if (y > 0.86) return 'traseira';
  if (x < 0.3) return y < 0.5 ? 'lateral esquerda, dianteira' : 'lateral esquerda, traseira';
  if (x > 0.7) return y < 0.5 ? 'lateral direita, dianteira' : 'lateral direita, traseira';
  if (y < 0.3) return 'capô';
  if (y < 0.4) return 'para-brisa';
  if (y > 0.72) return 'porta-malas';
  if (y > 0.64) return 'vidro traseiro';
  return 'teto';
}

/** "1/2 tanque", "reserva", "cheio". */
export function combustivelEmTexto(oitavos: number | null | undefined): string {
  if (oitavos == null || !Number.isFinite(oitavos)) return 'Não anotado';
  const n = Math.max(0, Math.min(8, Math.round(oitavos)));
  if (n === 0) return 'Reserva';
  if (n === 8) return 'Cheio';
  const frac: Record<number, string> = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' };
  return `${frac[n]} do tanque`;
}

/** Quantos bytes ocupam as fotos guardadas no próprio registro (modo sem conta). */
export function bytesNoAparelho(fotos: FotoRegistro[]): number {
  return fotos.reduce((n, f) => n + (f.dataUrl?.length ?? 0), 0);
}

/** Todas as fotos do checklist (as gerais e as das avarias). */
export function fotosDoChecklist(c: Pick<Checklist, 'fotos' | 'avarias'>): FotoRegistro[] {
  return c.fotos ?? [];
}

/** Ainda cabe esta foto no aparelho? */
export function cabeNoAparelho(c: Pick<Checklist, 'fotos'>, tamanho: number): boolean {
  return tamanho <= LIMITE_FOTO_NO_APARELHO && bytesNoAparelho(c.fotos ?? []) + tamanho <= LIMITE_FOTOS_NO_APARELHO;
}

/** Os itens que faltam ou estão com avaria (para o resumo). */
export function pendenciasDoChecklist(c: Pick<Checklist, 'itens' | 'avarias'>): { faltam: string[]; comAvaria: string[]; avarias: number } {
  const faltam: string[] = [];
  const comAvaria: string[] = [];
  for (const item of ITENS_DO_CHECKLIST) {
    if (c.itens[item.id] === 'falta') faltam.push(item.nome);
    if (c.itens[item.id] === 'avaria') comAvaria.push(item.nome);
  }
  return { faltam, comAvaria, avarias: c.avarias.length };
}

export function novaAvaria(id: string, x: number, y: number): AvariaChecklist {
  const cx = Math.max(0, Math.min(1, x));
  const cy = Math.max(0, Math.min(1, y));
  return { id, local: localDaMarca(cx, cy), tipo: 'risco', x: Math.round(cx * 1000) / 1000, y: Math.round(cy * 1000) / 1000 };
}

// ---------------------------------------------------------------- o link do checklist

const estado = z.enum(['ok', 'falta', 'avaria']);

export const esquemaChecklistLink = z.object({
  v: z.literal(1),
  numero: z.number().int().nullish(),
  quando: z.string(),
  cliente: z.string().max(60),
  carro: z.object({ nome: z.string().max(80), placa: z.string().max(8) }),
  km: z.number().int().min(0).max(5_000_000).nullish(),
  combustivel: z.number().int().min(0).max(8).nullish(),
  itens: z.array(z.object({ nome: z.string().max(60), estado })).max(30),
  avarias: z
    .array(
      z.object({
        local: z.string().max(60),
        tipo: z.enum(['risco', 'amassado', 'quebrado', 'trincado', 'outro']),
        observacao: z.string().max(200).nullish(),
        x: z.number().min(0).max(1).nullish(),
        y: z.number().min(0).max(1).nullish(),
        fotos: z.array(z.string().refine(caminhoDeFotoValido)).max(4).nullish()
      })
    )
    .max(30),
  fotos: z.array(z.string().refine(caminhoDeFotoValido)).max(12),
  observacao: z.string().max(1000).nullish(),
  assinatura: z.object({ nome: z.string().max(80), quando: z.string(), imagem: z.string().max(LIMITE_ASSINATURA * 2) }).nullish()
});
export type DadosChecklistLink = z.infer<typeof esquemaChecklistLink>;

export function lerChecklistDoLink(dados: unknown): DadosChecklistLink | null {
  const r = esquemaChecklistLink.safeParse(dados);
  return r.success ? r.data : null;
}

/** Imagem de assinatura aceitável: PNG em data URL, pequena. */
export function assinaturaValida(imagem: string | null | undefined): imagem is string {
  return !!imagem && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imagem) && imagem.length <= LIMITE_ASSINATURA * 1.4;
}

/** O que o cliente vê no link do checklist (só as fotos guardadas no Storage). */
export function dadosDoChecklist(c: Checklist, ctx: { cliente?: Cliente; veiculo?: Veiculo; numero?: number | null }): DadosChecklistLink {
  const caminhos = new Map((c.fotos ?? []).map((f) => [f.id, f.caminho]));
  return {
    v: 1,
    numero: ctx.numero ?? null,
    quando: c.criadoEm,
    cliente: primeiroNome(ctx.cliente?.nome ?? '').slice(0, 60),
    carro: { nome: [ctx.veiculo?.marca, ctx.veiculo?.modelo].filter(Boolean).join(' ').slice(0, 80) || 'Carro', placa: (ctx.veiculo?.placa ?? '').slice(0, 8) },
    km: c.km != null && c.km >= 0 ? Math.round(c.km) : null,
    combustivel: c.combustivel ?? null,
    itens: ITENS_DO_CHECKLIST.filter((i) => c.itens[i.id]).map((i) => ({ nome: i.nome, estado: c.itens[i.id] })),
    avarias: c.avarias.slice(0, 30).map((a) => ({
      local: a.local.slice(0, 60),
      tipo: a.tipo,
      observacao: a.observacao?.slice(0, 200) || null,
      x: a.x ?? null,
      y: a.y ?? null,
      fotos: (a.fotoIds ?? []).map((id) => caminhos.get(id)).filter(caminhoDeFotoValido).slice(0, 4)
    })),
    fotos: (c.fotos ?? [])
      .filter((f) => !c.avarias.some((a) => a.fotoIds?.includes(f.id)))
      .map((f) => f.caminho)
      .filter(caminhoDeFotoValido)
      .slice(0, 12),
    observacao: c.observacao?.trim().slice(0, 1000) || null,
    assinatura: c.assinatura && assinaturaValida(c.assinatura.imagem) ? { nome: c.assinatura.nome.slice(0, 80), quando: c.assinatura.quando, imagem: c.assinatura.imagem } : null
  };
}

export function mensagemDoChecklist(ctx: { oficina: string; cliente: string; carro: string; link: string; assinado: boolean }): string {
  const nome = primeiroNome(ctx.cliente);
  const pedido = ctx.assinado ? 'Fica com você a cópia' : 'Confira e assine pelo link, por favor';
  return `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}. Este é o checklist de entrada do seu ${ctx.carro.trim() || 'carro'}, com como ele chegou na oficina. ${pedido}: ${ctx.link}`;
}
