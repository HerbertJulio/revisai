import 'server-only';
import { cookies } from 'next/headers';
import { configEquipe } from './equipe';
import { carregarPainelFornecedor, sessaoAindaVale, type PainelFornecedor } from './marketplace';
import { COOKIE_FORNECEDOR, lerSessaoFornecedor } from './sessao-fornecedor';

/** O fornecedor da sessão, conferido no banco (o link pode ter sido trocado), ou null. */
export async function fornecedorDaSessao(): Promise<number | null> {
  const c = configEquipe();
  if (!c) return null;
  const jar = await cookies();
  const sessao = lerSessaoFornecedor(jar.get(COOKIE_FORNECEDOR)?.value, c.chave);
  if (!sessao) return null;
  return (await sessaoAindaVale(sessao.fornecedorId, sessao.marca)) ? sessao.fornecedorId : null;
}

export type ResultadoPainel = { sessao: false } | { sessao: true; painel: PainelFornecedor | null; erro: string | null };

/** O painel do fornecedor da sessão (ou { sessao: false } para mostrar a tela de entrada). */
export async function painelDaSessao(): Promise<ResultadoPainel> {
  const id = await fornecedorDaSessao();
  if (!id) return { sessao: false };
  const { dados, erro } = await carregarPainelFornecedor(id);
  return { sessao: true, painel: dados, erro };
}
