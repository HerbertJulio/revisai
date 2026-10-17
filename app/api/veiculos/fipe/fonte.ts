import 'server-only';
import { esquemaOpcaoFipe, esquemaPrecoFipe, lerOpcoesBrasilApi, lerPrecosBrasilApi, mesDeBrasilia, type OpcaoFipe, type PrecoFipe } from '@/lib/fipe';
import { clienteSistema } from '@/lib/supabase-servidor';
import { emModoDeTeste } from '../placa/provedores';

// A tabela FIPE pela BrasilAPI (grátis, sem chave), só de carros. O que já veio fica guardado até
// o mês virar: na memória deste servidor e no banco (para todos os servidores). No modo de
// teste (fora de produção), responde uma tabela de mentira.

const BASE = 'https://brasilapi.com.br/api/fipe';

export type PedidoFipe =
  | { acao: 'marcas' }
  | { acao: 'modelos'; marca: string }
  | { acao: 'anos'; marca: string; modelo: string }
  | { acao: 'detalhe'; marca: string; modelo: string; ano: string }
  | { acao: 'preco'; codigo: string };

export type RespostaFipe = { ok: true; opcoes: OpcaoFipe[] } | { ok: true; precos: PrecoFipe[] } | { ok: false; erro: string; status: number };

function chaveDoPedido(p: PedidoFipe): string {
  switch (p.acao) {
    case 'marcas':
      return 'marcas:carros';
    case 'modelos':
      return `modelos:carros:${p.marca}`;
    case 'anos':
      return `anos:carros:${p.marca}:${p.modelo}`;
    case 'detalhe':
      return `detalhe:carros:${p.marca}:${p.modelo}:${p.ano}`;
    case 'preco':
      return `preco:${p.codigo}`;
  }
}

function enderecoDoPedido(p: PedidoFipe): string {
  switch (p.acao) {
    case 'marcas':
      return `${BASE}/marcas/v1/carros`;
    case 'modelos':
      return `${BASE}/veiculos/v1/carros/${p.marca}`;
    case 'anos':
      return `${BASE}/anos/v1/carros/${p.marca}/${p.modelo}`;
    case 'detalhe':
      return `${BASE}/detalhes/v1/carros/${p.marca}/${p.modelo}/${p.ano}`;
    case 'preco':
      return `${BASE}/preco/v1/${p.codigo}`;
  }
}

const ehPreco = (p: PedidoFipe) => p.acao === 'preco' || p.acao === 'detalhe';

/** O que veio da BrasilAPI no formato do app (o que fica guardado). */
function normalizar(p: PedidoFipe, json: unknown): OpcaoFipe[] | PrecoFipe[] {
  return ehPreco(p) ? lerPrecosBrasilApi(json) : lerOpcoesBrasilApi(json);
}

function doGuardado(p: PedidoFipe, dados: unknown): RespostaFipe | null {
  if (!Array.isArray(dados)) return null;
  if (ehPreco(p)) {
    const precos = dados.map((x) => esquemaPrecoFipe.safeParse(x)).filter((r) => r.success).map((r) => r.data);
    return precos.length ? { ok: true, precos } : null;
  }
  const opcoes = dados.map((x) => esquemaOpcaoFipe.safeParse(x)).filter((r) => r.success).map((r) => r.data);
  return opcoes.length ? { ok: true, opcoes } : null;
}

function resposta(p: PedidoFipe, dados: OpcaoFipe[] | PrecoFipe[]): RespostaFipe {
  return ehPreco(p) ? { ok: true, precos: dados as PrecoFipe[] } : { ok: true, opcoes: dados as OpcaoFipe[] };
}

const memoria = new Map<string, { mes: string; dados: OpcaoFipe[] | PrecoFipe[] }>();

export async function buscarFipe(p: PedidoFipe): Promise<RespostaFipe> {
  const mes = mesDeBrasilia();
  const chave = chaveDoPedido(p);
  if (emModoDeTeste()) return resposta(p, fipeDeTeste(p, mes));

  const naMemoria = memoria.get(chave);
  if (naMemoria && naMemoria.mes === mes) return resposta(p, naMemoria.dados);

  const sistema = clienteSistema();
  if (sistema) {
    const { data, error } = await sistema.rpc('fipe_cache_ler', { p_chave: chave, p_mes: mes });
    if (error) console.warn('[fipe] ler guardado', error.message);
    const guardado = doGuardado(p, data);
    if (guardado) return guardado;
  }

  let res: Response;
  try {
    res = await fetch(enderecoDoPedido(p), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  } catch (e) {
    console.warn('[fipe] BrasilAPI não respondeu', e instanceof Error ? e.message : e);
    return { ok: false, erro: 'A tabela FIPE não respondeu agora. Tente de novo em instantes.', status: 502 };
  }
  if (res.status === 400 || res.status === 404) return { ok: false, erro: p.acao === 'preco' ? 'A FIPE não conhece esse código.' : 'A FIPE não tem esse carro.', status: 404 };
  if (!res.ok) {
    console.warn('[fipe] BrasilAPI', res.status);
    return { ok: false, erro: 'A tabela FIPE não respondeu agora. Tente de novo em instantes.', status: 502 };
  }
  const dados = normalizar(p, await res.json().catch(() => null));
  if (!dados.length) return { ok: false, erro: p.acao === 'preco' ? 'A FIPE não tem preço para esse código.' : 'A FIPE não tem esse carro.', status: 404 };
  memoria.set(chave, { mes, dados });
  if (memoria.size > 500) memoria.delete(memoria.keys().next().value as string);
  if (sistema) {
    const { error } = await sistema.rpc('fipe_cache_gravar', { p_chave: chave, p_mes: mes, p_dados: dados });
    if (error) console.warn('[fipe] guardar', error.message);
  }
  return resposta(p, dados);
}

// ---------------------------------------------------------------- de mentira (fora de produção)

const MARCAS_DE_TESTE: OpcaoFipe[] = [
  { codigo: '21', nome: 'Fiat' },
  { codigo: '23', nome: 'GM - Chevrolet' },
  { codigo: '26', nome: 'Hyundai' },
  { codigo: '59', nome: 'VW - VolksWagen' }
];

const MODELOS_DE_TESTE: Record<string, (OpcaoFipe & { fipe: string })[]> = {
  '21': [{ codigo: '1495', nome: 'ARGO DRIVE 1.0 6V Flex', fipe: '001495-8' }],
  '23': [
    { codigo: '4478', nome: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.', fipe: '004478-1' },
    { codigo: '8001', nome: 'ONIX PLUS 1.0 Turbo Flex Aut.', fipe: '004500-1' }
  ],
  '26': [{ codigo: '5137', nome: 'HB20 Comfort 1.0 Flex 12V', fipe: '015137-8' }],
  '59': [{ codigo: '5340', nome: 'Gol 1.6 MSI Flex 8V 5p', fipe: '005340-3' }]
};

const ANOS_DE_TESTE = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016];

function precosDeTeste(codigo: string, mes: string): PrecoFipe[] {
  const modelo = Object.entries(MODELOS_DE_TESTE).flatMap(([marca, ms]) => ms.map((m) => ({ ...m, marca: MARCAS_DE_TESTE.find((x) => x.codigo === marca)?.nome ?? '' }))).find((m) => m.fipe === codigo);
  const base = 30000 + (Number(codigo.replace(/\D/g, '')) % 7) * 1000;
  return ANOS_DE_TESTE.map((ano) => ({
    codigo,
    marca: modelo?.marca ?? 'Teste',
    modelo: modelo?.nome ?? `Carro de teste ${codigo}`,
    anoModelo: ano,
    zeroKm: false,
    combustivel: 'Gasolina',
    valor: base + (ano - 2016) * 4500,
    referencia: mes
  }));
}

function fipeDeTeste(p: PedidoFipe, mes: string): OpcaoFipe[] | PrecoFipe[] {
  switch (p.acao) {
    case 'marcas':
      return MARCAS_DE_TESTE;
    case 'modelos':
      return (MODELOS_DE_TESTE[p.marca] ?? []).map(({ codigo, nome }) => ({ codigo, nome }));
    case 'anos':
      return ANOS_DE_TESTE.map((a) => ({ codigo: `${a}-1`, nome: `${a} Gasolina` }));
    case 'detalhe': {
      const m = (MODELOS_DE_TESTE[p.marca] ?? []).find((x) => x.codigo === p.modelo);
      return m ? precosDeTeste(m.fipe, mes).filter((x) => `${x.anoModelo}-1` === p.ano) : [];
    }
    case 'preco':
      return precosDeTeste(p.codigo, mes);
  }
}
