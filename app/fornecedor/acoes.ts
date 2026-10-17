'use server';

// Ações do painel da loja. Cada uma roda como a pessoa que entrou (o banco aplica as regras dela:
// só a loja dela, só o que o papel dela deixa) e confere o papel antes, para a mensagem sair clara.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { acessoDaLoja } from '@/lib/conta';
import { permitido } from '@/lib/limite';
import { responderAlerta } from '@/lib/loja/alertas';
import { salvarCashback } from '@/lib/loja/cashback';
import { removerCondicao, salvarCondicao } from '@/lib/loja/clientes';
import { avisarTrocaDePix, lojaParaAviso } from '@/lib/loja/avisos';
import { cancelarConviteDaLoja, convidarParaLoja, mudarPapelNaLoja, tirarDaLoja, type ResultadoConvite, type ResultadoPapel } from '@/lib/loja/equipe';
import { confirmarPagamento, mudarSituacao, saidaParaEntrega } from '@/lib/loja/pedidos';
import { cancelarTrocaDoPix, trocarPix, type ResultadoTroca } from '@/lib/loja/pix';
import {
  enviarFoto as guardarFoto,
  importarProdutos,
  pedirDestaque,
  pedirImpulso,
  salvarCadastro,
  salvarProduto as gravarProduto,
  salvarPromocao as gravarPromocao
} from '@/lib/loja/produtos';
import { situacaoParteValida } from '@/lib/marketplace-dados';
import { lerLoja, COLUNAS_LOJA } from '@/lib/loja/dados';

type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const SO_DONO = { ok: false, erro: 'Só o dono da loja pode fazer isso.' } as const;
const DEVAGAR = { ok: false, erro: 'Muitas mudanças seguidas. Espere alguns minutos.' } as const;

function atualizar() {
  revalidatePath('/fornecedor', 'layout');
}

function idValido(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
}

/** O acesso da pessoa à loja escolhida, com um limite de mudanças por pessoa e loja. */
async function acesso(acao: string, maximo = 120, minutos = 60) {
  const a = await acessoDaLoja();
  if (!a.ok) return a;
  if (!(await permitido(`loja-${acao}-${a.loja.id}-${a.conta.usuario.id}`, maximo, minutos))) return DEVAGAR;
  return a;
}

// ---------------------------------------------------------------- vitrine

export async function salvarProduto(entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const a = await acesso('produto');
  if (!a.ok) return a;
  const r = await gravarProduto(a.sb, a.loja.id, entrada);
  if (r.ok) atualizar();
  return r;
}

/** A planilha de produtos, já lida e conferida na tela; o servidor confere de novo e grava tudo junto. */
export async function importarPlanilha(produtos: unknown): Promise<Gravacao<{ novos: number; mudados: number }>> {
  const a = await acesso('planilha', 20);
  if (!a.ok) return a;
  const r = await importarProdutos(a.sb, a.loja.id, produtos);
  if (r.ok) atualizar();
  return r;
}

export async function enviarFoto(produtoId: number, dados: FormData): Promise<Gravacao<{ url: string }>> {
  if (!idValido(produtoId)) return { ok: false, erro: 'Produto inválido.' };
  const a = await acesso('foto', 60);
  if (!a.ok) return a;
  const arquivo = dados.get('foto');
  if (!(arquivo instanceof File)) return { ok: false, erro: 'Escolha uma foto.' };
  const r = await guardarFoto(a.sb, a.loja.id, produtoId, arquivo);
  if (r.ok) atualizar();
  return r;
}

export async function salvarPromocao(entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const a = await acesso('promocao');
  if (!a.ok) return a;
  const r = await gravarPromocao(a.sb, a.loja.id, entrada);
  if (r.ok) atualizar();
  return r;
}

/** Impulso é pago: só o dono pede. */
export async function impulsionar(produtoId: number, dias: number, uf: string, porClique?: { cpc: number; orcamentoDiario: number } | null): Promise<Gravacao> {
  if (!idValido(produtoId)) return { ok: false, erro: 'Produto inválido.' };
  const a = await acesso('impulso', 20);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const clique = porClique && typeof porClique === 'object' ? { cpc: Number(porClique.cpc), orcamentoDiario: Number(porClique.orcamentoDiario) } : null;
  const r = await pedirImpulso(a.sb, a.loja.id, produtoId, Number(dias), String(uf ?? ''), clique);
  if (r.ok) atualizar();
  return r;
}

/** O plano Destaque também: o pedido vai para a equipe falar com o dono. */
export async function quererDestaque(): Promise<Gravacao> {
  const a = await acesso('plano', 3);
  if (!a.ok) return a.erro === DEVAGAR.erro ? { ok: false, erro: 'Já recebemos o seu pedido. A equipe fala com você em breve.' } : a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const { data } = await a.sb.from('fornecedores').select(COLUNAS_LOJA).eq('id', a.loja.id).maybeSingle();
  const loja = lerLoja(data);
  if (!loja) return { ok: false, erro: 'Loja não encontrada.' };
  return pedirDestaque(a.sb, loja, a.conta.usuario.email);
}

// ---------------------------------------------------------------- pedidos

export async function mudarSituacaoDoPedido(parteId: number, status: string, motivo?: string): Promise<Gravacao> {
  if (!idValido(parteId) || typeof status !== 'string' || !situacaoParteValida(status)) return { ok: false, erro: 'Pedido ou situação inválida.' };
  const a = await acesso('pedido', 300);
  if (!a.ok) return a;
  const r = await mudarSituacao(a.sb, a.loja.id, parteId, status, typeof motivo === 'string' ? motivo : null);
  if (r.ok) atualizar();
  return r;
}

/** Marca que o pedido saiu e devolve o código do link do entregador (só aparece agora). */
export async function marcarSaida(parteId: number, previsao: string): Promise<Gravacao<{ token: string }>> {
  if (!idValido(parteId)) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acesso('saida', 60);
  if (!a.ok) return a;
  const r = await saidaParaEntrega(a.sb, a.loja.id, parteId, String(previsao ?? '').slice(0, 40));
  if (r.ok) atualizar();
  return r;
}

export async function confirmarPagamentoDoPedido(parteId: number, confirmado: boolean): Promise<Gravacao> {
  if (!idValido(parteId)) return { ok: false, erro: 'Pedido inválido.' };
  const a = await acesso('pagamento', 300);
  if (!a.ok) return a;
  const r = await confirmarPagamento(a.sb, a.loja.id, parteId, confirmado === true);
  if (r.ok) atualizar();
  return r;
}

// ---------------------------------------------------------------- condições por oficina

export async function salvarCondicaoDaOficina(entrada: unknown): Promise<Gravacao> {
  const a = await acesso('condicao', 200);
  if (!a.ok) return a;
  const r = await salvarCondicao(a.sb, a.loja.id, entrada);
  if (r.ok) atualizar();
  return r;
}

export async function removerCondicaoDaOficina(id: number): Promise<Gravacao> {
  if (!idValido(id)) return { ok: false, erro: 'Condição inválida.' };
  const a = await acesso('condicao', 200);
  if (!a.ok) return a;
  const r = await removerCondicao(a.sb, a.loja.id, id);
  if (r.ok) atualizar();
  return r;
}

// ---------------------------------------------------------------- alertas de preço

export async function responderAlertaPreco(entrada: unknown): Promise<Gravacao> {
  const a = await acesso('alerta');
  if (!a.ok) return a;
  const r = await responderAlerta(a.sb, a.loja.id, entrada);
  if (r.ok) atualizar();
  return r;
}

// ---------------------------------------------------------------- sua loja (só o dono)

export async function salvarCadastroDaLoja(entrada: unknown): Promise<Gravacao> {
  const a = await acesso('cadastro', 30);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const r = await salvarCadastro(a.sb, a.loja.id, entrada);
  if (r.ok) atualizar();
  return r;
}

/** O cashback que a loja dá às oficinas (0 a 10%): decisão de dinheiro, só o dono. */
export async function salvarCashbackDaLoja(percentual: number): Promise<Gravacao> {
  const a = await acesso('cashback', 30);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const r = await salvarCashback(a.sb, a.loja.id, Number(percentual));
  if (r.ok) atualizar();
  return r;
}

export async function trocarChavePix(entrada: unknown): Promise<ResultadoTroca> {
  const a = await acesso('pix', 20);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const r = await trocarPix(a.sb, a.loja.id, entrada);
  if (r.ok) {
    atualizar();
    // a troca espera 24 horas: o WhatsApp da loja fica sabendo (quem não pediu cancela a tempo)
    if (!r.imediata) {
      const loja = await lojaParaAviso(a.sb, a.loja.id);
      if (loja) after(() => avisarTrocaDePix(loja, r.valeEm).catch(() => false));
    }
  }
  return r;
}

export async function cancelarTrocaPix(): Promise<Gravacao> {
  const a = await acesso('pix-cancelar', 20);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const r = await cancelarTrocaDoPix(a.sb, a.loja.id);
  if (r.ok) atualizar();
  return r;
}

export async function convidarParaALoja(entrada: unknown): Promise<ResultadoConvite> {
  const a = await acesso('convite', 30);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const r = await convidarParaLoja(a.sb, a.loja.id, entrada);
  if (r.ok) atualizar();
  return r;
}

export async function cancelarConvite(id: string): Promise<Gravacao> {
  const a = await acesso('convite', 30);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const r = await cancelarConviteDaLoja(a.sb, String(id ?? ''));
  if (r.ok) atualizar();
  return r;
}

export async function mudarPapel(userId: string, papel: string): Promise<ResultadoPapel> {
  const a = await acesso('papel', 30);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  const r = await mudarPapelNaLoja(a.sb, a.loja.id, String(userId ?? ''), String(papel ?? ''));
  if (r.ok) atualizar();
  return r;
}

export async function tirarPessoa(userId: string): Promise<Gravacao> {
  const a = await acesso('tirar', 30);
  if (!a.ok) return a;
  if (a.loja.papel !== 'dono') return SO_DONO;
  if (userId === a.conta.usuario.id) return { ok: false, erro: 'Para sair da loja, use o botão Sair desta loja.' };
  const r = await tirarDaLoja(a.sb, a.loja.id, String(userId ?? ''));
  if (r.ok) atualizar();
  return r;
}

/** A pessoa sai da loja (o último dono não sai: passe o dono para outra pessoa antes). */
export async function sairDaLoja(): Promise<Gravacao> {
  const a = await acesso('tirar', 30);
  if (!a.ok) return a;
  const r = await tirarDaLoja(a.sb, a.loja.id, a.conta.usuario.id);
  if (!r.ok) return r;
  revalidatePath('/', 'layout');
  redirect('/conta');
}
