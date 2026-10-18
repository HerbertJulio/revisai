// Lembretes da oficina: o que o cliente não quis agora no orçamento (volta daqui a 30 dias),
// os recalls e as anotações. Cada um sai pronto para o WhatsApp. Funções puras.

import { somarDias } from './datas';
import { formatarMoeda, primeiroNome } from './formatos';
import { servico as infoServico, servicoExiste } from './manutencao';
import type { Lembrete, NovoItemExtra } from './registros-oficina';
import type { Documento, Id, Veiculo } from './tipos';

export const MOTIVOS_DO_LEMBRETE: Record<Lembrete['motivo'], string> = {
  recusado: 'Recusado no orçamento',
  recall: 'Recall',
  manual: 'Lembrete'
};

/** Daqui a quantos dias volta o que o cliente recusou. */
export const DIAS_DO_RECUSADO = 30;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Os lembretes do que o cliente recusou: um por serviço (peça e mão de obra do mesmo serviço
 * juntas) e um por linha avulsa, com o valor que ficou de fora. `recusadas = 'todas'` quando o
 * cliente recusou o orçamento inteiro.
 */
export function lembretesDoOrcamento(
  doc: Pick<Documento, 'id' | 'linhas' | 'veiculoId'>,
  recusadas: Id[] | 'todas',
  ctx: { hoje: string; clienteId?: Id | null }
): NovoItemExtra<'lembretes'>[] {
  const fora = recusadas === 'todas' ? null : new Set(recusadas);
  const linhas = doc.linhas.filter((l) => l.descricao.trim() && (fora ? fora.has(l.id) : true) && !(l.valorUnitario != null && l.valorUnitario < 0));
  const grupos: { chave: string; descricao: string; valor: number; temValor: boolean }[] = [];
  for (const l of linhas) {
    const chave = l.servico ? `s:${l.servico}` : `l:${l.id}`;
    let g = grupos.find((x) => x.chave === chave);
    if (!g) {
      const descricao = l.servico && servicoExiste(l.servico) ? infoServico(l.servico).nome : l.descricao.trim();
      g = { chave, descricao, valor: 0, temValor: false };
      grupos.push(g);
    }
    if (l.valorUnitario != null) {
      g.valor += l.quantidade * l.valorUnitario;
      g.temValor = true;
    }
  }
  return grupos.map((g) => ({
    veiculoId: doc.veiculoId,
    clienteId: ctx.clienteId ?? null,
    documentoId: doc.id,
    descricao: g.descricao.slice(0, 160),
    motivo: 'recusado' as const,
    data: somarDias(ctx.hoje, DIAS_DO_RECUSADO),
    valorEstimado: g.temValor ? r2(g.valor) : null,
    situacao: 'aberto' as const,
    avisadoEm: null
  }));
}

/** Os lembretes para avisar hoje: abertos e com a data chegando (os mais antigos primeiro). */
export function lembretesDoDia(lembretes: Lembrete[], hoje: string): Lembrete[] {
  return lembretes.filter((l) => l.situacao === 'aberto' && l.data <= hoje).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.criadoEm < b.criadoEm ? -1 : 1));
}

/** "Pastilhas de freio" vira "pastilhas de freio" no meio da frase (siglas ficam como estão). */
function noMeioDaFrase(t: string): string {
  const s = t.trim();
  if (!s) return s;
  return /^[A-ZÀ-Ú][a-zà-ú]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** A mensagem pronta para o WhatsApp, conforme o motivo do lembrete. */
export function mensagemDoLembrete(
  l: Pick<Lembrete, 'motivo' | 'descricao' | 'valorEstimado'>,
  ctx: { cliente: string; oficina: string; veiculo?: Pick<Veiculo, 'modelo'> | null; mostrarValor?: boolean }
): string {
  const nome = primeiroNome(ctx.cliente);
  const oi = `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`;
  const carro = ctx.veiculo?.modelo?.trim() || 'carro';
  const item = noMeioDaFrase(l.descricao);
  if (l.motivo === 'recusado') {
    const valor = ctx.mostrarValor && l.valorEstimado ? ` (ficou em ${formatarMoeda(l.valorEstimado)})` : '';
    return `${oi} Lembra do que vimos no seu ${carro} e ficou para depois: ${item}${valor}? Quer marcar um horário para fazer? É só responder esta mensagem.`;
  }
  if (l.motivo === 'recall') {
    // a descrição do lembrete já começa com "Recall:" e pode terminar com ponto
    const defeito = noMeioDaFrase(l.descricao.trim().replace(/^recall\s*[:\-–]\s*/i, '')).replace(/[.!;\s]+$/, '');
    return `${oi} Saiu um recall para o seu ${carro}: ${defeito}. O reparo do recall é feito sem custo pela montadora. Quer ajuda para agendar? É só responder esta mensagem.`;
  }
  return `${oi} Passando para lembrar sobre o seu ${carro}: ${item}. Quer marcar um horário? É só responder esta mensagem.`;
}
