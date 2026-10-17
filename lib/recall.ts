// Recall: a campanha que a montadora anunciou (marca, modelo, anos) cruzada com os carros dos
// clientes. Cada carro que entra vira um lembrete (motivo 'recall') que aparece no início, e a
// oficina avisa o cliente pelo WhatsApp. O reparo é de graça na concessionária; a consulta
// oficial, pela placa ou pelo chassi, é a da Senatran no gov.br.

import { formatarPlaca, primeiroNome } from './formatos';
import { chaveDeTexto, nomeDaMarca } from './placa';
import type { NovoItemExtra, Recall } from './registros-oficina';
import type { Id, Veiculo } from './tipos';

/** A consulta oficial de recall pela placa ou pelo chassi (Portal de Serviços da Senatran, entra com a conta gov.br). */
export const LINK_CONSULTA_RECALL = 'https://portalservicos.senatran.serpro.gov.br/#/veiculos/recall';
/** A página do serviço no gov.br ("Realizar consulta sobre recall de veículos"). */
export const LINK_SERVICO_RECALL = 'https://www.gov.br/pt-br/servicos/realizar-consulta-sobre-recall-de-veiculos';

export type SituacaoNoRecall = 'sim' | 'sem_ano' | 'nao';

function palavras(t: string): string[] {
  // "T-Cross" e "TCross" são o mesmo modelo
  return chaveDeTexto(String(t ?? '').replace(/(\w)-(\w)/g, '$1$2'))
    .split(' ')
    .filter(Boolean);
}

/** Os modelos da campanha ("Onix, Onix Plus e Tracker" vira três; "Classe E" continua um). */
export function modelosDoRecall(texto: string): string[] {
  return String(texto ?? '')
    .split(/\s*[,;/|]\s*|\s+e\s+/)
    .map((m) => m.trim())
    .filter((m) => palavras(m).length > 0);
}

/** O modelo do carro é um dos da campanha: todas as palavras do modelo da campanha estão no do carro. */
export function modeloCombina(modeloDoRecall: string, modeloDoCarro: string): boolean {
  const carro = new Set(palavras(modeloDoCarro));
  return modelosDoRecall(modeloDoRecall).some((m) => palavras(m).every((p) => carro.has(p)));
}

/** O ano que vale para a campanha: o do modelo, ou o de fabricação quando não tem. */
export function anoDoCarro(v: Pick<Veiculo, 'ano' | 'anoModelo'>): number | null {
  return v.anoModelo ?? v.ano ?? null;
}

/** O carro entra na campanha? 'sem_ano' quando a marca e o modelo batem, mas o carro não tem o ano cadastrado. */
export function situacaoNoRecall(r: Pick<Recall, 'marca' | 'modelo' | 'anoDe' | 'anoAte'>, v: Pick<Veiculo, 'marca' | 'modelo' | 'ano' | 'anoModelo'>): SituacaoNoRecall {
  const marca = nomeDaMarca(r.marca);
  if (!marca || nomeDaMarca(v.marca) !== marca) return 'nao';
  if (!modeloCombina(r.modelo, v.modelo)) return 'nao';
  const temFaixa = r.anoDe != null || r.anoAte != null;
  if (!temFaixa) return 'sim';
  const ano = anoDoCarro(v);
  if (ano == null) return 'sem_ano';
  if (r.anoDe != null && ano < r.anoDe) return 'nao';
  if (r.anoAte != null && ano > r.anoAte) return 'nao';
  return 'sim';
}

export interface CarroNoRecall {
  veiculo: Veiculo;
  situacao: Exclude<SituacaoNoRecall, 'nao'>;
}

/** Os carros dos clientes que entram na campanha (os de ano certo primeiro, depois por placa). */
export function carrosDoRecall(r: Recall, veiculos: Iterable<Veiculo>): CarroNoRecall[] {
  const lista: CarroNoRecall[] = [];
  for (const v of veiculos) {
    const s = situacaoNoRecall(r, v);
    if (s !== 'nao') lista.push({ veiculo: v, situacao: s });
  }
  return lista.sort((a, b) => Number(a.situacao === 'sem_ano') - Number(b.situacao === 'sem_ano') || a.veiculo.placa.localeCompare(b.veiculo.placa));
}

/** O id do lembrete de um carro numa campanha (o mesmo em qualquer aparelho: não repete). */
export function idDoLembrete(recallId: Id, veiculoId: Id): Id {
  return `recall-${recallId}-${veiculoId}`.slice(0, 100);
}

/** "2018 a 2020", "a partir de 2019", "até 2017", "" (todos os anos). */
export function textoDosAnos(r: Pick<Recall, 'anoDe' | 'anoAte'>): string {
  if (r.anoDe != null && r.anoAte != null) return r.anoDe === r.anoAte ? String(r.anoDe) : `${r.anoDe} a ${r.anoAte}`;
  if (r.anoDe != null) return `a partir de ${r.anoDe}`;
  if (r.anoAte != null) return `até ${r.anoAte}`;
  return '';
}

/** "Chevrolet Onix e Onix Plus 2019 a 2020". */
export function tituloDoRecall(r: Pick<Recall, 'marca' | 'modelo' | 'anoDe' | 'anoAte'>): string {
  const modelos = modelosDoRecall(r.modelo);
  const nomes = modelos.length > 1 ? `${modelos.slice(0, -1).join(', ')} e ${modelos.at(-1)}` : (modelos[0] ?? r.modelo);
  return [nomeDaMarca(r.marca) || r.marca, nomes, textoDosAnos(r)].filter(Boolean).join(' ');
}

/** O lembrete que aparece no início para o carro da campanha. */
export function lembreteDoRecall(r: Recall, v: Pick<Veiculo, 'id' | 'clienteId'>, hoje: string): NovoItemExtra<'lembretes'> {
  return {
    id: idDoLembrete(r.id, v.id),
    veiculoId: v.id,
    clienteId: v.clienteId,
    documentoId: null,
    descricao: `Recall: ${r.descricao}`.slice(0, 300),
    motivo: 'recall',
    data: hoje,
    valorEstimado: null,
    recallId: r.id,
    situacao: 'aberto',
    avisadoEm: null
  };
}

/** A mensagem do WhatsApp para o cliente do carro da campanha. */
export function mensagemDoRecall(ctx: { cliente: string; oficina: string; recall: Pick<Recall, 'marca' | 'descricao' | 'fonte'>; veiculo: Pick<Veiculo, 'marca' | 'modelo' | 'placa' | 'ano' | 'anoModelo'> }): string {
  const nome = primeiroNome(ctx.cliente);
  const ano = anoDoCarro(ctx.veiculo);
  const carro = [ctx.veiculo.modelo.trim() || 'carro', ano ? String(ano) : ''].filter(Boolean).join(' ');
  const marca = nomeDaMarca(ctx.recall.marca) || ctx.recall.marca;
  const descricao = ctx.recall.descricao.trim().replace(/[.!]+$/, '');
  return [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`,
    `A ${marca} chamou para recall carros como o seu ${carro} (placa ${formatarPlaca(ctx.veiculo.placa)}): ${descricao}.`,
    'O reparo é de graça na concessionária. Para confirmar se o seu carro está na lista, dá para consultar pela placa no site do governo:',
    LINK_CONSULTA_RECALL,
    'Qualquer dúvida, é só chamar.'
  ].join('\n');
}

/** O endereço da fonte, só se for um link de verdade (https). */
export function fonteValida(t: string | null | undefined): string | null {
  const s = String(t ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}
