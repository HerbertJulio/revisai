// Cartão de manutenção que a oficina manda para o cliente. Os dados vão no fragmento (#) do link,
// que o navegador não envia ao servidor: nada fica guardado em lugar nenhum.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { z } from 'zod';
import type { ItemAviso } from './avisos';
import { servicoExiste } from './manutencao';
import { normalizarTelefone } from './formatos';
import type { Cliente, Oficina, ServicoId, Veiculo } from './tipos';

const esquema = z.object({
  v: z.literal(1),
  o: z.object({ n: z.string().max(120), w: z.string().max(20).optional(), c: z.string().max(80).optional(), e: z.string().max(160).optional() }),
  c: z.string().max(60),
  car: z.object({ m: z.string().max(80), p: z.string().max(8), a: z.number().int().min(1900).max(2100).optional() }),
  i: z
    .array(
      z.object({
        s: z.string().refine(servicoExiste),
        d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        l: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        k: z.number().int().nonnegative().nullable(),
        f: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        fk: z.number().int().nonnegative()
      })
    )
    .max(30),
  g: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export type DadosCartao = z.infer<typeof esquema> & { i: { s: ServicoId; d: string | null; l?: string | null; k: number | null; f: string; fk: number }[] };

const corta = (t: string | undefined | null, max: number) => (t ?? '').trim().slice(0, max);
const km = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.max(0, Math.round(n)));

/** Monta o cartão já dentro dos limites que a leitura aceita (texto curto, km inteiro, telefone com DDI). */
export function montarCartao(oficina: Oficina, cliente: Cliente | undefined, veiculo: Veiculo, itens: ItemAviso[], hoje: string): DadosCartao {
  const ano = veiculo.ano && veiculo.ano >= 1900 && veiculo.ano <= 2100 ? Math.round(veiculo.ano) : undefined;
  const local = [oficina.cidade, oficina.uf].map((x) => x?.trim()).filter(Boolean).join(' - ');
  return {
    v: 1,
    o: {
      n: corta(oficina.nome, 120) || 'Oficina',
      w: normalizarTelefone(oficina.whatsapp ?? '') ?? undefined,
      c: corta(local, 80) || undefined,
      e: corta(oficina.endereco, 160) || undefined
    },
    c: corta((cliente?.nome ?? '').trim().split(/\s+/)[0], 60),
    car: { m: corta([veiculo.marca, veiculo.modelo].filter(Boolean).join(' '), 80) || 'Carro', p: corta(veiculo.placa, 8), a: ano },
    i: itens.slice(0, 30).map((item) => ({
      s: item.servico,
      d: item.venc.dataPrevista,
      l: item.venc.dataLimite,
      k: km(item.venc.kmLimite),
      f: item.base.data,
      fk: km(item.base.km) ?? 0
    })),
    g: hoje
  };
}

export function codificarCartao(d: DadosCartao): string {
  return compressToEncodedURIComponent(JSON.stringify(d));
}

export function decodificarCartao(texto: string): DadosCartao | null {
  try {
    const json = decompressFromEncodedURIComponent(texto.replace(/^#/, ''));
    if (!json) return null;
    const r = esquema.safeParse(JSON.parse(json));
    return r.success ? (r.data as DadosCartao) : null;
  } catch {
    return null;
  }
}

export function linkDoCartao(origem: string, d: DadosCartao): string {
  // confere com as mesmas regras da leitura: um link que não abre é pior que nenhum
  const r = esquema.safeParse(d);
  const dados = r.success ? d : { ...d, o: { n: d.o.n.slice(0, 120) }, i: d.i.filter((i) => esquema.shape.i.element.safeParse(i).success) };
  return `${origem.replace(/\/$/, '')}/cartao#${codificarCartao(dados)}`;
}
