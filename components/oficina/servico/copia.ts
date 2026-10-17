'use client';

// A cópia da aprovação por e-mail, quando o cliente tem e-mail cadastrado e a oficina tem conta.
// O servidor manda pelo Resend (ou não manda nada, sem a chave) e o app anota para quem foi.

import { dataHora } from '@/components/cliente/comum';
import { conteudoDoOrcamento } from '@/lib/aprovacao';
import { formatarData } from '@/lib/datas';
import { validoAte } from '@/lib/documentos';
import { primeiroNome } from '@/lib/formatos';
import { enviarCopiaDaAprovacao } from '@/lib/email';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { contextoDaConta } from './conta';

export async function mandarCopiaDaAprovacao(orcamentoId: Id): Promise<{ ok: boolean; enviado: boolean; erro?: string }> {
  if (!contextoDaConta()) return { ok: false, enviado: false, erro: 'Sem conta, o e-mail não sai.' };
  const s = useOficina.getState();
  const doc = s.documentos[orcamentoId];
  const a = doc?.aprovacao;
  const veiculo = doc?.veiculoId ? s.veiculos[doc.veiculoId] : undefined;
  const cliente = veiculo ? s.clientes[veiculo.clienteId] : undefined;
  const email = cliente?.email?.trim();
  if (!doc || !a || !a.versao || !email) return { ok: false, enviado: false };
  if (a.copiaEnviadaPara && a.copiaEnviadaPara.toLowerCase() === email.toLowerCase()) return { ok: true, enviado: true };
  const conteudo = conteudoDoOrcamento(doc);
  try {
    const r = await enviarCopiaDaAprovacao({
      para: email,
      documentoId: doc.id,
      numero: doc.numero,
      cliente: primeiroNome(cliente?.nome ?? ''),
      carro: [veiculo?.marca, veiculo?.modelo].filter(Boolean).join(' ').slice(0, 100),
      placa: veiculo?.placa ?? '',
      itens: conteudo.itens.map((i) => ({
        descricao: i.descricao,
        quantidade: i.quantidade,
        unidade: i.unidade,
        valor: i.valorUnitario == null ? null : Math.round(i.quantidade * i.valorUnitario * 100) / 100
      })),
      recusados: conteudo.recusados,
      total: conteudo.total,
      validade: formatarData(validoAte(doc)),
      canal: a.canal,
      quando: dataHora(a.quando),
      nome: a.nome ?? null,
      ip: a.ip ?? null,
      agente: a.agente ?? null,
      versao: a.versao,
      link: doc.links?.orcamento?.url ?? null
    });
    if (!r.ok) return { ok: false, enviado: false, erro: r.erro };
    if (r.enviado) {
      const atual = useOficina.getState().documentos[orcamentoId];
      if (atual?.aprovacao) useOficina.getState().salvarDocumento({ ...atual, aprovacao: { ...atual.aprovacao, copiaEnviadaPara: r.para } });
    }
    return { ok: true, enviado: r.enviado };
  } catch (e) {
    console.error('[email] cópia', e);
    return { ok: false, enviado: false, erro: 'Não deu para mandar o e-mail agora.' };
  }
}
