// "Saúde do carro": quanto ainda resta de cada item até a próxima troca e onde ele fica no carro.
// A vida restante usa o que vencer primeiro, a data ou a quilometragem estimada de hoje.

import type { ItemAviso, Situacao } from './avisos';
import { diasEntre } from './datas';
import type { ServicoId } from './tipos';

export type Area = 'motor' | 'bateria' | 'parabrisa' | 'cabine' | 'cambio' | 'freio_dianteiro' | 'freio_traseiro' | 'rodas' | 'suspensao';

export const NOMES_AREA: Record<Area, string> = {
  motor: 'Motor',
  bateria: 'Bateria',
  parabrisa: 'Para-brisa',
  cabine: 'Cabine',
  cambio: 'Câmbio',
  freio_dianteiro: 'Freios dianteiros',
  freio_traseiro: 'Freios traseiros',
  rodas: 'Pneus e rodas',
  suspensao: 'Suspensão'
};

export const AREA_DO_SERVICO: Record<ServicoId, Area> = {
  troca_oleo: 'motor',
  filtro_oleo: 'motor',
  filtro_ar: 'motor',
  filtro_combustivel: 'motor',
  velas: 'motor',
  correia_dentada: 'motor',
  correia_acessorios: 'motor',
  arrefecimento: 'motor',
  revisao: 'motor',
  gnv: 'motor',
  bateria: 'bateria',
  palhetas: 'parabrisa',
  filtro_cabine: 'cabine',
  higienizacao: 'cabine',
  cambio_manual: 'cambio',
  cambio_automatico: 'cambio',
  pastilhas: 'freio_dianteiro',
  discos: 'freio_dianteiro',
  fluido_freio: 'freio_dianteiro',
  pneus: 'rodas',
  rodizio: 'rodas',
  alinhamento: 'rodas',
  amortecedores: 'suspensao'
};

/** Fração da vida que ainda resta (1 = acabou de trocar, 0 = venceu). */
export function vidaRestante(item: Pick<ItemAviso, 'base' | 'venc'>, hoje: string): number {
  const fracoes: number[] = [];
  const { base, venc } = item;
  if (venc.kmLimite != null && venc.kmLimite > base.km) fracoes.push((venc.kmLimite - venc.kmHoje) / (venc.kmLimite - base.km));
  if (venc.dataLimite) {
    const total = diasEntre(base.data, venc.dataLimite);
    if (total > 0) fracoes.push(diasEntre(hoje, venc.dataLimite) / total);
  }
  if (!fracoes.length) return 1;
  return Math.max(0, Math.min(1, Math.min(...fracoes)));
}

const PESO: Record<Situacao, number> = { atrasado: 2, avisar: 1, futuro: 0 };

export type EstadoArea = 'atrasado' | 'avisar' | 'ok';

/** O pior estado de cada área do carro (as recomendações das ordens de serviço contam também). */
export function estadoDasAreas(itens: Pick<ItemAviso, 'servico' | 'situacao'>[], recomendacoes: { area: Area | null; urgencia: 'agora' | 'proxima_revisao' | 'observar' }[] = []): Partial<Record<Area, EstadoArea>> {
  const r: Partial<Record<Area, EstadoArea>> = {};
  const piorar = (area: Area, estado: EstadoArea) => {
    const atual = r[area];
    const peso = (e: EstadoArea | undefined) => (e === 'atrasado' ? 2 : e === 'avisar' ? 1 : e === 'ok' ? 0 : -1);
    if (peso(estado) > peso(atual)) r[area] = estado;
  };
  for (const i of itens) piorar(AREA_DO_SERVICO[i.servico], PESO[i.situacao] === 2 ? 'atrasado' : PESO[i.situacao] === 1 ? 'avisar' : 'ok');
  for (const rec of recomendacoes) if (rec.area) piorar(rec.area, rec.urgencia === 'agora' ? 'atrasado' : rec.urgencia === 'proxima_revisao' ? 'avisar' : 'ok');
  return r;
}

/** De que parte do carro fala uma recomendação escrita ("trocar as pastilhas dianteiras"). */
export function areaDoTexto(texto: string): Area | null {
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (/pastilha|disco|freio|lona|tambor|cilindro de roda|pinca/.test(t)) return /tras/.test(t) ? 'freio_traseiro' : 'freio_dianteiro';
  if (/pneu|roda|alinhament|balancea|calibr/.test(t)) return 'rodas';
  if (/amortecedor|suspens|bandeja|pivo|bieleta|bucha|terminal|coxim|mola/.test(t)) return 'suspensao';
  if (/bateria|alternador|motor de partida/.test(t)) return 'bateria';
  if (/palheta|para-?brisa|limpador/.test(t)) return 'parabrisa';
  if (/ar-?condicionado|cabine|polen|higieniz/.test(t)) return 'cabine';
  if (/cambio|embreagem|atf/.test(t)) return 'cambio';
  if (/oleo|filtro|vela|correia|motor|vazamento|arrefec|radiador|bomba|junta|injec|bobina/.test(t)) return 'motor';
  return null;
}
