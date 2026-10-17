// Mensagens para o cliente pelo WhatsApp (link wa.me com o texto pronto).

import type { ItemAviso } from './avisos';
import { formatarDataCurta } from './datas';
import { formatarPlaca, normalizarTelefone, primeiroNome } from './formatos';
import { servico } from './manutencao';
import type { ServicoId, Veiculo } from './tipos';

export const MENSAGEM_PADRAO =
  'Oi, {cliente}! Aqui é da {oficina}. Passando para lembrar que {lista}. Quer marcar um horário? É só responder esta mensagem.';

export const VARIAVEIS_MENSAGEM = [
  { nome: '{cliente}', descricao: 'primeiro nome do cliente' },
  { nome: '{oficina}', descricao: 'nome da oficina' },
  { nome: '{veiculo}', descricao: 'modelo do carro' },
  { nome: '{placa}', descricao: 'placa do carro' },
  { nome: '{lista}', descricao: 'os serviços e quando vencem' },
  { nome: '{data}', descricao: 'dia do vencimento mais próximo' },
  { nome: '{agendar}', descricao: 'link para o cliente escolher o horário (sem o agendamento pelo link ligado, a frase com ele sai da mensagem)' }
];

/** O endereço público para o cliente pedir um horário na oficina. */
export function linkDeAgendamento(origem: string, slug: string | null | undefined): string | null {
  if (!slug || !/^[a-z0-9]{6,40}$/.test(slug)) return null;
  return `${origem.replace(/\/+$/, '')}/agendar/${slug}`;
}

/** Tira do texto a frase que tem a variável (quando ela não tem valor, a frase toda sai). */
function semAFraseCom(texto: string, variavel: string): string {
  if (!texto.includes(variavel)) return texto;
  // as frases ficam nas posições pares e o espaço (ou a quebra de linha) entre elas nas ímpares
  const partes = texto.split(/(?<=[.!?])(\s+)/);
  const r: string[] = [];
  for (let i = 0; i < partes.length; i += 2) {
    if (partes[i].includes(variavel)) continue;
    if (r.length) r.push(partes[i - 1] ?? ' ');
    r.push(partes[i]);
  }
  return r.join('');
}

export function linkWhatsApp(telefone: string, texto: string): string | null {
  const numero = normalizarTelefone(telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** "a troca de óleo, a troca do filtro de ar e a revisão" (sem repetir frases). */
export function listaDeServicos(servicos: ServicoId[]): { texto: string; quantidade: number } {
  const frases: string[] = [];
  for (const s of servicos) {
    const f = servico(s).frase;
    if (!frases.includes(f)) frases.push(f);
  }
  if (frases.length <= 1) return { texto: frases[0] ?? 'a revisão', quantidade: frases.length };
  return { texto: `${frases.slice(0, -1).join(', ')} e ${frases[frases.length - 1]}`, quantidade: frases.length };
}

/** "vence no dia 22/10", "venceram no dia 05/10", "deve vencer por volta do dia 22/10, pela quilometragem". */
export function frasePrazo(itens: ItemAviso[], plural: boolean): string {
  const primeiro = [...itens].sort((a, b) => (a.venc.dataPrevista ?? '9') < (b.venc.dataPrevista ?? '9') ? -1 : 1)[0];
  const v = (um: string, varios: string) => (plural ? varios : um);
  if (!primeiro?.venc.dataPrevista) return v('está chegando', 'estão chegando');
  const dias = primeiro.venc.diasRestantes ?? 0;
  const dia = formatarDataCurta(primeiro.venc.dataPrevista);
  const porKm = primeiro.venc.motivo === 'km';
  if (dias < 0) return porKm ? v('já passou da quilometragem', 'já passaram da quilometragem') : `${v('venceu', 'venceram')} no dia ${dia}`;
  if (porKm) {
    if (dias === 0) return `${v('deve vencer', 'devem vencer')} hoje, pela quilometragem`;
    return `${v('deve vencer', 'devem vencer')} por volta do dia ${dia}, pela quilometragem`;
  }
  if (dias === 0) return `${v('vence', 'vencem')} hoje`;
  if (dias === 1) return `${v('vence', 'vencem')} amanhã`;
  return `${v('vence', 'vencem')} no dia ${dia}`;
}

export function montarMensagem(
  modelo: string,
  ctx: {
    cliente: string;
    oficina: string;
    veiculo: Pick<Veiculo, 'modelo' | 'placa'>;
    itens: ItemAviso[];
    /** O link de agendamento da oficina (linkDeAgendamento), quando ela tem um ligado. */
    agendar?: string | null;
  }
): string {
  const { texto, quantidade } = listaDeServicos(ctx.itens.map((i) => i.servico));
  const carro = ctx.veiculo.modelo?.trim() || 'carro';
  const lista = `${texto} do seu ${carro} ${frasePrazo(ctx.itens, quantidade > 1)}`;
  const datas = ctx.itens.map((i) => i.venc.dataPrevista).filter(Boolean).sort() as string[];
  const base = modelo || MENSAGEM_PADRAO;
  return (ctx.agendar ? base.replaceAll('{agendar}', ctx.agendar) : semAFraseCom(base, '{agendar}'))
    .replaceAll('{cliente}', primeiroNome(ctx.cliente) || 'tudo bem')
    .replaceAll('{oficina}', ctx.oficina.trim() || 'oficina')
    .replaceAll('{veiculo}', carro)
    .replaceAll('{placa}', formatarPlaca(ctx.veiculo.placa))
    .replaceAll('{lista}', lista)
    .replaceAll('{data}', datas[0] ? formatarDataCurta(datas[0]) : '')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
}

export function mensagemCartao(ctx: { cliente: string; oficina: string; veiculo: Pick<Veiculo, 'modelo'>; link: string }): string {
  const nome = primeiroNome(ctx.cliente);
  return `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}. Este é o cartão de manutenção do seu ${ctx.veiculo.modelo || 'carro'}, com as datas das próximas trocas e revisões. Dá para salvar os lembretes no calendário do celular. ${ctx.link}`;
}
