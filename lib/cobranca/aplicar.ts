// Aplica no banco o que o aviso do gateway quer dizer. Sem nada de servidor aqui: o banco entra
// por uma interface (a de verdade fala com o Supabase pela chave do sistema; nos testes, é uma
// de mentira). Cada aviso pode chegar mais de uma vez; o banco não soma o mesmo mês duas vezes.

import type { Cobranca, Evento, LinhaAssinatura, LinhaPagamento, NomeProvedor, Nota } from './tipos';

export interface RegistroPagamento {
  provedor: NomeProvedor;
  externo: string;
  tipo: 'pro' | 'loja';
  oficinaId: string | null;
  fornecedorId: number | null;
  assinaturaId: string | null;
  valor: number;
  vencimento: string | null;
  metodo: string | null;
  descricao: string;
  link: string | null;
  pix: string | null;
  boleto: string | null;
  referencia?: string | null;
  userId?: string | null;
}

export interface BancoCobranca {
  assinaturaPorExterna(provedor: string, externa: string): Promise<LinhaAssinatura | null>;
  pagamentoPorExterno(provedor: string, externo: string): Promise<LinhaPagamento | null>;
  registrarPagamento(r: RegistroPagamento): Promise<string>;
  confirmarPagamento(provedor: string, externo: string, pagoEm: string | null): Promise<{ achou: boolean; aplicado: boolean }>;
  pagamentoAtrasado(provedor: string, externo: string): Promise<boolean>;
  pagamentoDesfeito(provedor: string, externo: string, situacao: 'cancelado' | 'estornado'): Promise<boolean>;
  gravarNota(provedor: string, externo: string | null, nota: Nota): Promise<boolean>;
  assinaturaCancelada(provedor: string, externa: string): Promise<boolean>;
  autorizacaoAprovada(provedor: string, externa: string): Promise<boolean>;
}

export type Resultado = { ok: true; pago: LinhaPagamento | null; nota?: string } | { ok: false; erro: string };

export const DESCRICAO_PRO = 'Revisaí Pro: assinatura mensal';

function registroDaCobranca(provedor: NomeProvedor, c: Cobranca, a: LinhaAssinatura): RegistroPagamento {
  return {
    provedor,
    externo: c.externo,
    tipo: 'pro',
    oficinaId: a.oficina_id,
    fornecedorId: null,
    assinaturaId: a.id,
    valor: c.valor > 0 ? c.valor : a.valor,
    vencimento: c.vencimento,
    metodo: c.metodo ?? a.metodo,
    descricao: DESCRICAO_PRO,
    link: c.link,
    pix: c.pixCopiaECola,
    boleto: c.boletoLinha
  };
}

/** Guarda a cobrança nova de uma assinatura (a renovação do mês, criada pelo gateway). */
async function guardarCobranca(provedor: NomeProvedor, c: Cobranca, assinatura: string | null, banco: BancoCobranca): Promise<Resultado> {
  const existente = await banco.pagamentoPorExterno(provedor, c.externo);
  if (existente) {
    await banco.registrarPagamento({
      provedor,
      externo: c.externo,
      tipo: existente.tipo,
      oficinaId: existente.oficina_id,
      fornecedorId: existente.fornecedor_id,
      assinaturaId: existente.assinatura_id,
      valor: c.valor > 0 ? c.valor : existente.valor,
      vencimento: c.vencimento ?? existente.vencimento,
      metodo: c.metodo ?? existente.metodo,
      descricao: existente.descricao ?? DESCRICAO_PRO,
      link: c.link,
      pix: c.pixCopiaECola,
      boleto: c.boletoLinha
    });
    return { ok: true, pago: null };
  }
  if (!assinatura) return { ok: true, pago: null, nota: 'cobrança fora de assinatura' };
  const a = await banco.assinaturaPorExterna(provedor, assinatura);
  // a assinatura acabou de ser criada e ainda não foi guardada: tenta de novo depois
  if (!a) return { ok: false, erro: `Assinatura ${assinatura} ainda não está no banco` };
  await banco.registrarPagamento(registroDaCobranca(provedor, c, a));
  return { ok: true, pago: null };
}

export async function aplicarEvento(provedor: NomeProvedor, e: Evento, banco: BancoCobranca): Promise<Resultado> {
  switch (e.tipo) {
    case 'cobranca':
      return guardarCobranca(provedor, e.cobranca, e.assinatura, banco);

    case 'pago': {
      let r = await banco.confirmarPagamento(provedor, e.externo, e.pagoEm);
      if (!r.achou && e.assinatura) {
        // pago antes do aviso da cobrança nova: guarda a cobrança e confirma
        const a = await banco.assinaturaPorExterna(provedor, e.assinatura);
        if (a) {
          const c: Cobranca = e.cobranca ?? {
            externo: e.externo,
            valor: a.valor,
            vencimento: null,
            link: null,
            pixCopiaECola: null,
            boletoLinha: null,
            situacao: 'pago',
            pagoEm: e.pagoEm,
            metodo: a.metodo
          };
          await banco.registrarPagamento(registroDaCobranca(provedor, { ...c, externo: e.externo }, a));
          r = await banco.confirmarPagamento(provedor, e.externo, e.pagoEm);
        }
      }
      if (!r.achou) {
        // na Efí chega todo Pix recebido na chave, inclusive os que não são do Revisaí
        return provedor === 'efi' ? { ok: true, pago: null, nota: 'Pix fora do Revisaí' } : { ok: false, erro: `Pagamento ${e.externo} não está no banco` };
      }
      return { ok: true, pago: await banco.pagamentoPorExterno(provedor, e.externo) };
    }

    case 'atrasado':
      await banco.pagamentoAtrasado(provedor, e.externo);
      return { ok: true, pago: null };

    case 'cancelado':
    case 'estornado':
      await banco.pagamentoDesfeito(provedor, e.externo, e.tipo);
      return { ok: true, pago: null };

    case 'assinatura_cancelada':
    case 'autorizacao_recusada':
      await banco.assinaturaCancelada(provedor, e.assinatura);
      return { ok: true, pago: null };

    case 'autorizacao_ativa':
      await banco.autorizacaoAprovada(provedor, e.assinatura);
      return { ok: true, pago: null };

    case 'nota':
      await banco.gravarNota(provedor, e.externo, e.nota);
      return { ok: true, pago: null };

    case 'ignorado':
      return { ok: true, pago: null, nota: e.motivo };
  }
}

/**
 * Depois de um pagamento confirmado, a nota fiscal sai por aqui quando o gateway não emite
 * sozinho. O Asaas emite a nota das mensalidades do Pro pela configuração da assinatura.
 */
export function precisaEmitirNota(p: LinhaPagamento, emissor: NomeProvedor | null, asaasEmiteNaAssinatura: boolean): boolean {
  if (!emissor || p.situacao !== 'pago' || p.valor <= 0) return false;
  if (p.nota_situacao === 'emitida' || p.nota_situacao === 'agendada') return false;
  if (p.provedor === 'asaas' && p.tipo === 'pro' && p.assinatura_id && asaasEmiteNaAssinatura) return false;
  return true;
}
