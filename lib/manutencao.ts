// Base de conhecimento de manutenção preventiva (carro de passeio, Brasil).
// Os prazos são o ponto de partida quando o manual do carro não está à mão: a oficina
// pode mudar o padrão em Ajustes e cada serviço registrado guarda o seu próprio prazo.
// Fontes: manuais e revisões de VW, GM, Hyundai, Toyota e Jeep (via revista O Mecânico),
// NGK, Mann, Cobreq, Monroe, Pirelli, Michelin, Bosch, Auto Papo, Resolução CONTRAN 913/2022.

import type { Categoria, EspecProduto, Intervalo, Preferencias, ServicoId, Veiculo } from './tipos';

export type GrupoServico = 'motor' | 'freios' | 'pneus' | 'eletrica' | 'conforto' | 'geral';

export interface Servico {
  id: ServicoId;
  /** Nome curto, para botões e listas. */
  nome: string;
  /** Como aparece na mensagem ao cliente: "a troca de óleo". */
  frase: string;
  categoria: Categoria | null;
  normal: Intervalo;
  severo: Intervalo;
  grupo: GrupoServico;
  /** Por que fazer e o que o mecânico observa. */
  dica: string;
  /** Costuma ser feito junto. */
  junto?: ServicoId[];
}

export const SERVICOS: Servico[] = [
  {
    id: 'troca_oleo',
    nome: 'Troca de óleo',
    frase: 'a troca de óleo',
    categoria: 'oleo_motor',
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'motor',
    dica: 'Quem define o prazo é o manual. O comum é 10.000 km ou 12 meses, e metade no uso severo. Óleo sintético não estica o prazo, e óleo mineral pede prazo menor.',
    junto: ['filtro_oleo']
  },
  {
    id: 'filtro_oleo',
    nome: 'Filtro de óleo',
    frase: 'a troca do filtro de óleo',
    categoria: 'filtro_oleo',
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'motor',
    dica: 'Troque em toda troca de óleo.'
  },
  {
    id: 'filtro_ar',
    nome: 'Filtro de ar do motor',
    frase: 'a troca do filtro de ar',
    categoria: 'filtro_ar',
    normal: { km: 20000, meses: 24 },
    severo: { km: 10000, meses: 12 },
    grupo: 'motor',
    dica: 'As montadoras pedem de 24 a 40 mil km, mas com poeira, terra ou trânsito pesado vale trocar antes. Elemento escuro e saturado é sinal de troca.'
  },
  {
    id: 'filtro_combustivel',
    nome: 'Filtro de combustível',
    frase: 'a troca do filtro de combustível',
    categoria: 'filtro_combustivel',
    normal: { km: 10000, meses: 12 },
    severo: { km: 10000, meses: 12 },
    grupo: 'motor',
    dica: 'Nos carros flex, a maioria das montadoras pede a cada 10.000 km ou 12 meses.'
  },
  {
    id: 'filtro_cabine',
    nome: 'Filtro de cabine',
    frase: 'a troca do filtro do ar-condicionado',
    categoria: 'filtro_cabine',
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'conforto',
    dica: 'Mau cheiro e pouco vento no ar-condicionado indicam filtro saturado. Não limpe com ar comprimido, troque.',
    junto: ['higienizacao']
  },
  {
    id: 'revisao',
    nome: 'Revisão',
    frase: 'a revisão',
    categoria: null,
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'geral',
    dica: 'Confira freios, suspensão, pneus, fluidos, luzes, correias e bateria. O prazo comum é 10.000 km ou 12 meses, metade no uso severo.'
  },
  {
    id: 'alinhamento',
    nome: 'Alinhamento e balanceamento',
    frase: 'o alinhamento e balanceamento',
    categoria: null,
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'pneus',
    dica: 'A cada 5 a 10 mil km, ao trocar pneus e depois de buracos ou batidas. Carro puxando e pneu gastando de um lado só são sinais.'
  },
  {
    id: 'rodizio',
    nome: 'Rodízio de pneus',
    frase: 'o rodízio dos pneus',
    categoria: null,
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'pneus',
    dica: 'A cada 5 a 10 mil km, seguindo o esquema do manual, para os pneus gastarem por igual.'
  },
  {
    id: 'pastilhas',
    nome: 'Pastilhas de freio',
    frase: 'a revisão dos freios',
    categoria: 'pastilha_freio',
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'freios',
    dica: 'Confira a cada revisão e troque antes de o material de atrito ficar abaixo de 2 mm. Chiado, ruído metálico ou pedal diferente pedem atenção.',
    junto: ['discos']
  },
  {
    id: 'discos',
    nome: 'Discos de freio',
    frase: 'a revisão dos freios',
    categoria: 'disco_freio',
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'freios',
    dica: 'Meça na troca das pastilhas. Abaixo da espessura mínima gravada pelo fabricante, troque o par.'
  },
  {
    id: 'fluido_freio',
    nome: 'Fluido de freio',
    frase: 'a troca do fluido de freio',
    categoria: 'fluido_freio',
    normal: { km: null, meses: 24 },
    severo: { km: null, meses: 24 },
    grupo: 'freios',
    dica: 'Absorve umidade e perde eficiência com o tempo. Troque a cada 2 anos, mesmo rodando pouco.'
  },
  {
    id: 'pneus',
    nome: 'Pneus',
    frase: 'a avaliação dos pneus',
    categoria: 'pneu',
    normal: { km: 40000, meses: 60 },
    severo: { km: 40000, meses: 60 },
    grupo: 'pneus',
    dica: 'O limite legal é 1,6 mm de sulco, na marca TWI (Resolução CONTRAN 913/2022). Com mais de 5 anos, inspecione todo ano; a Michelin recomenda trocar 10 anos depois da fabricação (código DOT).',
    junto: ['alinhamento']
  },
  {
    id: 'bateria',
    nome: 'Bateria',
    frase: 'o teste da bateria',
    categoria: 'bateria',
    normal: { km: null, meses: 24 },
    severo: { km: null, meses: 24 },
    grupo: 'eletrica',
    dica: 'Dura em média de 2 a 3 anos. A partir de 2 anos, teste em toda revisão.'
  },
  {
    id: 'velas',
    nome: 'Velas de ignição',
    frase: 'a troca das velas',
    categoria: 'vela',
    normal: { km: 30000, meses: 36 },
    severo: { km: 30000, meses: 36 },
    grupo: 'motor',
    dica: 'Velas comuns duram de 20 a 50 mil km conforme o manual; as de irídio ou platina, de 40 a 100 mil. Partida difícil, consumo alto e falha na retomada são sinais.'
  },
  {
    id: 'correia_dentada',
    nome: 'Correia dentada',
    frase: 'a troca da correia dentada',
    categoria: 'correia_dentada',
    normal: { km: 60000, meses: 48 },
    severo: { km: 30000, meses: 24 },
    grupo: 'motor',
    dica: 'Varia muito por motor, de 60 a 120 mil km, e rompe sem aviso. Troque tensor e polias junto. Vários motores usam corrente, sem troca programada.'
  },
  {
    id: 'correia_acessorios',
    nome: 'Correia de acessórios',
    frase: 'a troca da correia de acessórios',
    categoria: 'correia_acessorios',
    normal: { km: 60000, meses: 60 },
    severo: { km: 60000, meses: 60 },
    grupo: 'motor',
    dica: 'Confira a cada revisão. Trincas, ressecamento e chiado pedem troca, junto com tensor e polias.'
  },
  {
    id: 'arrefecimento',
    nome: 'Líquido de arrefecimento',
    frase: 'a troca do líquido de arrefecimento',
    categoria: 'arrefecimento',
    normal: { km: 40000, meses: 24 },
    severo: { km: 40000, meses: 24 },
    grupo: 'motor',
    dica: 'O prazo vai de 2 a 10 anos conforme o aditivo e o manual. Não misture tipos nem complete só com água.'
  },
  {
    id: 'amortecedores',
    nome: 'Amortecedores',
    frase: 'a revisão da suspensão',
    categoria: 'amortecedor',
    normal: { km: 10000, meses: 12 },
    severo: { km: 5000, meses: 6 },
    grupo: 'geral',
    dica: 'Revise no máximo a cada 10.000 km; os 40 mil km não são regra. Balanço, ruído e vazamento indicam troca, sempre em pares.'
  },
  {
    id: 'cambio_manual',
    nome: 'Óleo do câmbio manual',
    frase: 'a conferência do óleo do câmbio',
    categoria: 'fluido_cambio',
    normal: { km: 60000, meses: 60 },
    severo: { km: 60000, meses: 60 },
    grupo: 'motor',
    dica: 'A maioria dos manuais só pede conferir o nível e procurar vazamentos.'
  },
  {
    id: 'cambio_automatico',
    nome: 'Fluido do câmbio automático',
    frase: 'a troca do fluido do câmbio automático',
    categoria: 'fluido_cambio',
    normal: { km: 80000, meses: 48 },
    severo: { km: 80000, meses: 48 },
    grupo: 'motor',
    dica: 'Varia por montadora. Alguns câmbios não têm troca, outros pedem de 80 a 100 mil km ou só no uso severo.'
  },
  {
    id: 'higienizacao',
    nome: 'Higienização do ar-condicionado',
    frase: 'a higienização do ar-condicionado',
    categoria: 'higienizacao_ar',
    normal: { km: 10000, meses: 12 },
    severo: { km: 10000, meses: 12 },
    grupo: 'conforto',
    dica: 'As montadoras não dão prazo. Vale fazer junto com o filtro de cabine.'
  },
  {
    id: 'palhetas',
    nome: 'Palhetas',
    frase: 'a troca das palhetas',
    categoria: 'palheta',
    normal: { km: null, meses: 12 },
    severo: { km: null, meses: 12 },
    grupo: 'conforto',
    dica: 'Troque pelo menos uma vez por ano, ou quando riscar, fizer barulho ou deixar faixas no vidro.'
  },
  {
    id: 'gnv',
    nome: 'Inspeção do GNV',
    frase: 'a inspeção anual do GNV',
    categoria: null,
    normal: { km: null, meses: 12 },
    severo: { km: null, meses: 12 },
    grupo: 'geral',
    dica: 'No RJ, carro a GNV precisa do Certificado de Segurança Veicular (CSV) todo ano para licenciar, feito em instituição credenciada pelo Inmetro.'
  }
];

const POR_ID = new Map(SERVICOS.map((s) => [s.id, s]));

export function servico(id: ServicoId): Servico {
  const s = POR_ID.get(id);
  if (!s) throw new Error(`Serviço desconhecido: ${id}`);
  return s;
}

export function servicoExiste(id: string): id is ServicoId {
  return POR_ID.has(id as ServicoId);
}

/** Os serviços que mais aparecem no balcão, para os botões rápidos. */
export const SERVICOS_RAPIDOS: ServicoId[] = ['troca_oleo', 'filtro_oleo', 'filtro_ar', 'filtro_combustivel', 'filtro_cabine', 'revisao', 'alinhamento', 'pastilhas'];

export function servicosDaCategoria(categoria: Categoria): ServicoId[] {
  return SERVICOS.filter((s) => s.categoria === categoria).map((s) => s.id);
}

export function usaUsoSevero(veiculo: Pick<Veiculo, 'usoSevero'> | undefined, prefs: Pick<Preferencias, 'usoSeveroPadrao'>): boolean {
  return veiculo?.usoSevero ?? prefs.usoSeveroPadrao;
}

/** O prazo que vale para o serviço quando nada mais específico foi informado. */
export function intervaloPadrao(id: ServicoId, prefs: Pick<Preferencias, 'intervalos'>, severo: boolean): Intervalo {
  const s = servico(id);
  const proprio = prefs.intervalos[id];
  if (proprio) {
    if (!severo || (s.normal.km === s.severo.km && s.normal.meses === s.severo.meses)) return { ...proprio };
    return { km: metade(proprio.km), meses: metade(proprio.meses) };
  }
  return { ...(severo ? s.severo : s.normal) };
}

function metade(n: number | null): number | null {
  return n == null ? null : Math.max(1, Math.round(n / 2));
}

export interface ProdutoComPrazo {
  intervaloKm?: number | null;
  intervaloMeses?: number | null;
  especificacao?: EspecProduto;
}

export interface Sugestao extends Intervalo {
  origem: string;
}

/**
 * O prazo sugerido ao registrar um serviço.
 * Óleo e filtro de óleo seguem o manual do carro (ou o padrão), metade no uso severo,
 * e nunca passam do limite do produto (óleo mineral, por exemplo).
 * Peças com vida própria (vela de irídio, bateria, pneu) usam o prazo do produto.
 */
export function intervaloSugerido(
  id: ServicoId,
  ctx: { veiculo?: Pick<Veiculo, 'usoSevero' | 'intervaloOleo'>; prefs: Pick<Preferencias, 'intervalos' | 'usoSeveroPadrao'>; produto?: ProdutoComPrazo | null }
): Sugestao {
  const severo = usaUsoSevero(ctx.veiculo, ctx.prefs);
  const p = ctx.produto;
  const temPrazoProduto = p != null && (p.intervaloKm != null || p.intervaloMeses != null);

  if (id === 'troca_oleo' || id === 'filtro_oleo') {
    const manual = ctx.veiculo?.intervaloOleo;
    let base: Intervalo;
    let origem: string;
    if (manual && (manual.km != null || manual.meses != null)) {
      // o lado que ficou em branco no cadastro vem do padrão (sem prazo por tempo, quem roda pouco nunca seria avisado)
      const padrao = intervaloPadrao(id, ctx.prefs, false);
      const completo = { km: manual.km ?? padrao.km, meses: manual.meses ?? padrao.meses };
      base = severo ? { km: metade(completo.km), meses: metade(completo.meses) } : completo;
      origem = severo ? 'Manual do carro, metade pelo uso severo' : 'Manual do carro';
    } else {
      base = intervaloPadrao(id, ctx.prefs, severo);
      origem = severo ? 'Padrão para uso severo' : 'Padrão para uso normal';
    }
    if (id === 'troca_oleo' && temPrazoProduto) {
      const km = menor(base.km, p!.intervaloKm ?? null);
      const meses = menor(base.meses, p!.intervaloMeses ?? null);
      if (km !== base.km || meses !== base.meses) {
        return { km, meses, origem: p!.especificacao?.base === 'mineral' ? 'Limite do óleo mineral' : 'Limite do óleo escolhido' };
      }
    }
    return { ...base, origem };
  }

  if (temPrazoProduto) {
    return { km: p!.intervaloKm ?? null, meses: p!.intervaloMeses ?? null, origem: 'Vida útil indicada para o produto' };
  }
  const base = intervaloPadrao(id, ctx.prefs, severo);
  const s = servico(id);
  const muda = s.normal.km !== s.severo.km || s.normal.meses !== s.severo.meses;
  return { ...base, origem: severo && muda ? 'Padrão para uso severo' : 'Padrão' };
}

function menor(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

const km = new Intl.NumberFormat('pt-BR');

/** "10.000 km ou 12 meses", "24 meses", "60.000 km". */
export function rotuloIntervalo(i: Intervalo): string {
  const partes: string[] = [];
  if (i.km != null) partes.push(`${km.format(i.km)} km`);
  if (i.meses != null) partes.push(i.meses === 1 ? '1 mês' : `${i.meses} meses`);
  return partes.length ? partes.join(' ou ') : 'sem prazo';
}
