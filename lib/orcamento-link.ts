// O orçamento que vai para o cliente. Como o cartão de manutenção, os dados vão no fragmento (#) do
// link, que o navegador não manda para o servidor: nada do orçamento fica guardado fora do aparelho
// da oficina. O cliente vê os itens, desmarca o que não quer e aprova pelo WhatsApp da oficina.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { z } from 'zod';
import { totais, validoAte } from './documentos';
import { normalizarTelefone, primeiroNome } from './formatos';
import type { Cliente, Documento, Oficina, Veiculo } from './tipos';

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dinheiro = z.number().min(-1_000_000).max(1_000_000);

const esquema = z.object({
  v: z.literal(1),
  o: z.object({ n: z.string().max(120), w: z.string().max(20).optional(), c: z.string().max(80).optional(), e: z.string().max(160).optional() }),
  n: z.number().int().min(1).max(10_000_000),
  d: dia,
  ate: dia,
  m: z.enum(['f', 'p']),
  vi: z.object({ v: dinheiro, a: z.boolean() }).optional(),
  c: z.string().max(60),
  car: z.object({ m: z.string().max(80), p: z.string().max(8), a: z.number().int().min(1900).max(2100).optional(), k: z.number().int().min(0).max(5_000_000).optional() }),
  l: z
    .array(
      z.object({
        t: z.enum(['p', 's', 'o']),
        d: z.string().min(1).max(160),
        q: z.number().min(0).max(100_000),
        u: z.enum(['un', 'L', 'h']),
        v: dinheiro.nullable(),
        g: z.string().max(60).optional()
      })
    )
    .min(1)
    .max(60),
  ds: z.number().min(0).max(1_000_000).optional(),
  dg: z.string().max(800).optional(),
  r: z.array(z.object({ t: z.string().max(200), u: z.enum(['a', 'p', 'o']) })).max(10).optional(),
  pz: z.string().max(80).optional(),
  pg: z.string().max(120).optional(),
  ob: z.string().max(400).optional()
});

export type DadosOrcamento = z.infer<typeof esquema>;
export type LinhaOrcamento = DadosOrcamento['l'][number];

const corta = (t: string | undefined | null, max: number) => (t ?? '').trim().slice(0, max);
const r2 = (n: number) => Math.round(n * 100) / 100;
const URGENCIA = { agora: 'a', proxima_revisao: 'p', observar: 'o' } as const;

/** Monta o orçamento já dentro dos limites que a leitura aceita. */
export function montarOrcamento(doc: Documento, oficina: Oficina, cliente: Cliente | undefined, veiculo: Veiculo | undefined): DadosOrcamento {
  const local = [oficina.cidade, oficina.uf].map((x) => x?.trim()).filter(Boolean).join(' - ');
  const ano = veiculo?.ano && veiculo.ano >= 1900 && veiculo.ano <= 2100 ? Math.round(veiculo.ano) : undefined;
  const linhas = doc.linhas.filter((l) => !l.recusada && l.descricao.trim()).slice(0, 60);
  const recs = (doc.recomendacoes ?? []).filter((r) => r.texto.trim()).slice(0, 10);
  return {
    v: 1,
    o: {
      n: corta(oficina.nome, 120) || 'Oficina',
      w: normalizarTelefone(oficina.whatsapp ?? '') ?? undefined,
      c: corta(local, 80) || undefined,
      e: corta(oficina.endereco, 160) || undefined
    },
    n: doc.numero,
    d: doc.data,
    ate: validoAte(doc),
    m: doc.modalidade === 'pago' ? 'p' : 'f',
    vi: doc.modalidade === 'pago' && doc.vistoria && doc.vistoria.valor > 0 ? { v: r2(doc.vistoria.valor), a: doc.vistoria.abater } : undefined,
    c: corta(primeiroNome(cliente?.nome ?? ''), 60),
    car: {
      m: corta([veiculo?.marca, veiculo?.modelo].filter(Boolean).join(' '), 80) || 'Carro',
      p: corta(veiculo?.placa, 8),
      a: ano,
      k: doc.km != null && doc.km >= 0 ? Math.round(doc.km) : undefined
    },
    l: linhas.map((l) => ({
      t: l.tipo === 'peca' ? 'p' : l.tipo === 'servico' ? 's' : 'o',
      d: corta(l.descricao, 160),
      q: r2(Math.max(0, l.quantidade)),
      u: l.unidade,
      v: l.valorUnitario == null ? null : r2(l.valorUnitario),
      ...(l.servico ? { g: l.servico } : {})
    })),
    ds: doc.desconto && doc.desconto > 0 ? r2(doc.desconto) : undefined,
    dg: corta(doc.diagnostico, 800) || undefined,
    r: recs.length ? recs.map((r) => ({ t: corta(r.texto, 200), u: URGENCIA[r.urgencia] })) : undefined,
    pz: corta(doc.prazo, 80) || undefined,
    pg: corta(doc.pagamento, 120) || undefined,
    ob: corta(doc.observacao, 400) || undefined
  };
}

export function codificarOrcamento(d: DadosOrcamento): string {
  return compressToEncodedURIComponent(JSON.stringify(d));
}

export function decodificarOrcamento(texto: string): DadosOrcamento | null {
  try {
    const json = decompressFromEncodedURIComponent(texto.replace(/^#/, ''));
    if (!json) return null;
    const r = esquema.safeParse(JSON.parse(json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function linkDoOrcamento(origem: string, d: DadosOrcamento): string | null {
  // um link que não abre é pior que nenhum: confere com as regras da leitura
  if (!esquema.safeParse(d).success) return null;
  return `${origem.replace(/\/$/, '')}/orcamento#${codificarOrcamento(d)}`;
}

/** O total das linhas escolhidas pelo cliente (índices), com o desconto e sem passar de zero. */
export function totalEscolhido(d: DadosOrcamento, escolhidas: Set<number>): number {
  const linhas = d.l.map((l, i) => ({ quantidade: l.q, valorUnitario: l.v, tipo: 'outro' as const, recusada: !escolhidas.has(i) }));
  return totais({ linhas: linhas.map((l) => ({ ...l, id: '', descricao: '', unidade: 'un' as const })), desconto: d.ds ?? null }).total;
}

/** A mensagem de aprovação que o cliente manda para a oficina. */
export function mensagemDeAprovacao(d: DadosOrcamento, escolhidas: Set<number>, formatar: (n: number) => string): string {
  const todas = escolhidas.size === d.l.length;
  const carro = [d.car.m, d.car.p].filter(Boolean).join(', ');
  const total = formatar(totalEscolhido(d, escolhidas));
  if (todas) return `Olá! Aprovo o orçamento nº ${d.n} (${carro}), no total de ${total}.`;
  const itens = d.l.filter((_l, i) => escolhidas.has(i)).map((l) => `- ${l.d}`);
  return [`Olá! Aprovo só estes itens do orçamento nº ${d.n} (${carro}), no total de ${total}:`, ...itens].join('\n');
}
