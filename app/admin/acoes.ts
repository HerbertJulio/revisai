'use server';

// Ações do painel da equipe. Cada uma confere de novo, no servidor, se quem chama é da equipe,
// passou pelo app autenticador nas últimas 12 horas e tem o papel certo; depois grava com o
// cliente da própria pessoa, e o banco confere tudo outra vez e guarda no histórico.

import { revalidatePath } from 'next/cache';
import type { PapelEquipe } from '@/lib/conta-dados';
import { situacaoCadastroValida, situacaoPedidoValida } from '@/lib/equipe-dados';
import * as escrita from '@/lib/equipe/escrita';
import { PODE } from '@/lib/equipe/papeis';
import { equipeNaAcao } from '@/lib/equipe/sessao';
import type { RegistroDeAcesso, SituacaoChamado } from '@/lib/equipe/tipos';
import { criarAssinatura } from '@/lib/pro';
import type { Assinatura } from '@/lib/pro-dados';

type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const INVALIDO = { ok: false, erro: 'Dados inválidos. Atualize a página e tente de novo.' } as const;

function atualizar<T extends Gravacao<object>>(r: T): T {
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

function texto(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function valorOuNulo(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

// ---------------------------------------------------------------- pedidos e cadastros

export async function mudarSituacaoPedido(id: number, status: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.mudarPedido);
  if (!a.ok) return a;
  if (!escrita.idValido(id) || !situacaoPedidoValida(status)) return INVALIDO;
  return atualizar(await escrita.salvarSituacaoPedido(a.sb, id, status));
}

export async function mudarSituacaoCadastro(id: number, situacao: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.mudarCadastro);
  if (!a.ok) return a;
  if (!escrita.idValido(id) || !situacaoCadastroValida(situacao)) return INVALIDO;
  return atualizar(await escrita.salvarSituacaoCadastro(a.sb, id, situacao));
}

// ---------------------------------------------------------------- lojas

export async function salvarFornecedor(entrada: unknown): Promise<Gravacao<{ id: number; aviso?: string }>> {
  const a = await equipeNaAcao(PODE.editarLoja);
  if (!a.ok) return a;
  return atualizar(await escrita.salvarLoja(a.sb, a.papel, entrada));
}

/** Convida o dono (ou um vendedor) para a loja pelo e-mail: ele entra com a conta desse e-mail. */
export async function convidarNaLoja(fornecedorId: number, email: string, papel: string): Promise<Gravacao<{ convite: string }>> {
  const a = await equipeNaAcao(PODE.convidarNaLoja);
  if (!a.ok) return a;
  if (!escrita.idValido(fornecedorId) || (papel !== 'dono' && papel !== 'vendedor')) return INVALIDO;
  return atualizar(await escrita.convidarParaLoja(a.sb, fornecedorId, texto(email, 160), papel));
}

export async function cancelarConviteDaLoja(id: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.convidarNaLoja);
  if (!a.ok) return a;
  if (!escrita.uuidValido(id)) return INVALIDO;
  return atualizar(await escrita.cancelarConvite(a.sb, id));
}

export async function decidirLojaEmAnalise(fornecedorId: number, aprovar: boolean, observacao: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.decidirLoja);
  if (!a.ok) return a;
  if (!escrita.idValido(fornecedorId) || typeof aprovar !== 'boolean') return INVALIDO;
  return atualizar(await escrita.decidirLoja(a.sb, fornecedorId, aprovar, texto(observacao)));
}

export async function decidirPedidoDeImpulso(id: number, decisao: string, inicio: string | null): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.decidirImpulso);
  if (!a.ok) return a;
  if (!escrita.idValido(id) || !['ativo', 'recusado', 'encerrado'].includes(decisao)) return INVALIDO;
  return atualizar(await escrita.decidirImpulso(a.sb, id, decisao as 'ativo' | 'recusado' | 'encerrado', typeof inicio === 'string' ? inicio.slice(0, 10) : null));
}

export async function decidirSugestaoDaBase(id: number, aprovar: boolean): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.decidirBase);
  if (!a.ok) return a;
  if (!escrita.idValido(id) || typeof aprovar !== 'boolean') return INVALIDO;
  return atualizar(await escrita.decidirReferencia(a.sb, id, aprovar));
}

// ---------------------------------------------------------------- Pro e oficinas

/** Cria o código do Pro de uma oficina que pagou (ela digita o código no app). */
export async function criarCodigoPro(entrada: unknown): Promise<Gravacao<{ assinatura: Assinatura }>> {
  const a = await equipeNaAcao(PODE.criarCodigo);
  if (!a.ok) return a;
  return atualizar(await criarAssinatura(a.sb, entrada));
}

/** Libera alertas de preço extras para a oficina (depois do pagamento do pacote). */
export async function liberarAlertasDaOficina(oficinaId: string, quantidade: number, valor: number | null, observacao: string, cadastroId: number | null): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.liberarAlertas);
  if (!a.ok) return a;
  if (!escrita.uuidValido(oficinaId)) return INVALIDO;
  const r = await escrita.liberarAlertas(a.sb, oficinaId, Number(quantidade), valorOuNulo(valor), texto(observacao, 200));
  if (r.ok && escrita.idValido(cadastroId)) await escrita.salvarSituacaoCadastro(a.sb, cadastroId, 'respondido');
  return atualizar(r);
}

export async function darProNaOficina(oficinaId: string, meses: number, valor: number | null, observacao: string): Promise<Gravacao<{ ate: string }>> {
  const a = await equipeNaAcao(PODE.mudarPlano);
  if (!a.ok) return a;
  if (!escrita.uuidValido(oficinaId)) return INVALIDO;
  return atualizar(await escrita.darPro(a.sb, oficinaId, Number(meses), valorOuNulo(valor), texto(observacao)));
}

export async function estenderTesteDaOficina(oficinaId: string, dias: number): Promise<Gravacao<{ ate: string }>> {
  const a = await equipeNaAcao(PODE.mudarPlano);
  if (!a.ok) return a;
  if (!escrita.uuidValido(oficinaId)) return INVALIDO;
  return atualizar(await escrita.estenderTeste(a.sb, oficinaId, Number(dias)));
}

export async function mudarAtivaDaOficina(oficinaId: string, ativa: boolean): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.mudarPlano);
  if (!a.ok) return a;
  if (!escrita.uuidValido(oficinaId) || typeof ativa !== 'boolean') return INVALIDO;
  return atualizar(await escrita.mudarAtivaDaOficina(a.sb, oficinaId, ativa));
}

export async function mudarFundadorDaOficina(oficinaId: string, fundador: boolean): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.mudarPlano);
  if (!a.ok) return a;
  if (!escrita.uuidValido(oficinaId) || typeof fundador !== 'boolean') return INVALIDO;
  return atualizar(await escrita.mudarFundador(a.sb, oficinaId, fundador));
}

// ---------------------------------------------------------------- equipe

function papelValido(p: unknown): p is PapelEquipe {
  return p === 'admin' || p === 'suporte' || p === 'financeiro';
}

export async function convidarParaEquipe(email: string, papel: string, nome: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.equipe);
  if (!a.ok) return a;
  if (!papelValido(papel)) return INVALIDO;
  return atualizar(await escrita.convidarParaEquipe(a.sb, texto(email, 160), papel, texto(nome, 80)));
}

export async function mudarPessoaDaEquipe(userId: string, papel: string, ativo: boolean): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.equipe);
  if (!a.ok) return a;
  if (!escrita.uuidValido(userId) || !papelValido(papel) || typeof ativo !== 'boolean') return INVALIDO;
  if (userId === a.userId && (!ativo || papel !== 'admin')) return { ok: false, erro: 'Você não pode tirar o próprio acesso de admin.' };
  return atualizar(await escrita.mudarPessoaDaEquipe(a.sb, userId, papel, ativo));
}

export async function cancelarConviteDaEquipe(email: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.equipe);
  if (!a.ok) return a;
  return atualizar(await escrita.cancelarConviteDaEquipe(a.sb, texto(email, 160)));
}

// ---------------------------------------------------------------- titulares e acessos

/** O arquivo com tudo o que o Revisaí guarda de um e-mail (o pedido fica no histórico). */
export async function exportarDadosDoTitular(email: string): Promise<Gravacao<{ json: string; arquivo: string }>> {
  const a = await equipeNaAcao(PODE.titulares);
  if (!a.ok) return a;
  const r = await escrita.exportarTitular(a.sb, texto(email, 160));
  if (!r.ok) return r;
  const nome = texto(email, 160).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { ok: true, json: JSON.stringify(r.dados, null, 2), arquivo: `revisai-dados-${nome || 'titular'}.json` };
}

/** Apaga os dados de um e-mail. A confirmação é o e-mail digitado de novo. */
export async function apagarDadosDoTitular(email: string, confirmacao: string): Promise<Gravacao<{ cadastros: number; conta: boolean }>> {
  const a = await equipeNaAcao(PODE.titulares);
  if (!a.ok) return a;
  const e = texto(email, 160).trim().toLowerCase();
  if (!e || e !== texto(confirmacao, 160).trim().toLowerCase()) return { ok: false, erro: 'Digite o mesmo e-mail na confirmação.' };
  if (e === a.email) return { ok: false, erro: 'Para apagar a própria conta, use a página da sua conta.' };
  return atualizar(await escrita.apagarTitular(a.sb, e));
}

export async function consultarRegistrosDeAcesso(pedido: { email?: string; ip?: string; de?: string; ate?: string; motivo: string }): Promise<Gravacao<{ registros: RegistroDeAcesso[]; userId: string | null }>> {
  const a = await equipeNaAcao(PODE.acessos);
  if (!a.ok) return a;
  if (!pedido || typeof pedido !== 'object') return INVALIDO;
  const r = await escrita.consultarAcessos(a.sb, {
    email: texto(pedido.email, 160),
    ip: texto(pedido.ip, 64),
    de: texto(pedido.de, 10),
    ate: texto(pedido.ate, 10),
    motivo: texto(pedido.motivo)
  });
  // a consulta entra no histórico
  return atualizar(r);
}

// ---------------------------------------------------------------- suporte

export async function responderChamado(id: string, resposta: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.suporte);
  if (!a.ok) return a;
  if (!escrita.uuidValido(id)) return INVALIDO;
  return atualizar(await escrita.responderChamado(a.sb, id, texto(resposta, 4000)));
}

export async function mudarSituacaoDoChamado(id: string, situacao: string): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.suporte);
  if (!a.ok) return a;
  if (!escrita.uuidValido(id) || !['novo', 'respondido', 'fechado'].includes(situacao)) return INVALIDO;
  return atualizar(await escrita.mudarSituacaoDoChamado(a.sb, id, situacao as SituacaoChamado));
}
