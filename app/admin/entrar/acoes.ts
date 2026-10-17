'use server';

// A entrada da equipe, toda no servidor (os cookies da sessão ficam fora do alcance da página):
// código no e-mail, depois o app autenticador (cadastro na primeira vez), depois o banco confirma
// que a pessoa é da equipe e anota o aparelho.

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { codigoLimpo, COOKIE_APARELHO, COOKIE_APARELHO_NOVO, descricaoDoAparelho, emailValido, mensagemDaEntrada } from '@/lib/equipe/entrada';
import { contarErro, esgotado, permitido } from '@/lib/limite';
import { agenteDoPedido, clienteDoUsuario, ipDoPedido, OPCOES_COOKIE_EQUIPE, sessaoAtual } from '@/lib/supabase-servidor';

export type Resposta = { ok: true } | { ok: false; erro: string; naoExiste?: boolean };

const NAO_EXISTE: { ok: false; erro: string; naoExiste: true } = { ok: false, erro: 'Página não encontrada.', naoExiste: true };

export async function pedirCodigo(email: string): Promise<Resposta> {
  const limpo = String(email ?? '').trim().toLowerCase();
  if (!emailValido(limpo)) return { ok: false, erro: 'Confira o e-mail.' };
  if (!(await permitido('equipe-codigo', 6, 15))) return { ok: false, erro: 'Muitos códigos pedidos seguidos. Espere alguns minutos.' };
  const sb = await clienteDoUsuario(true);
  if (!sb) return { ok: false, erro: 'O login ainda não foi ligado neste servidor.' };
  const { error } = await sb.auth.signInWithOtp({ email: limpo, options: { shouldCreateUser: true } });
  if (error) {
    console.error('[equipe] pedir código', error.message);
    return { ok: false, erro: mensagemDaEntrada(error) };
  }
  return { ok: true };
}

export async function conferirCodigo(email: string, codigo: string): Promise<Resposta> {
  const limpo = String(email ?? '').trim().toLowerCase();
  const token = codigoLimpo(codigo);
  if (!emailValido(limpo) || !token) return { ok: false, erro: 'O código tem 6 números.' };
  if (await esgotado('equipe-conferir', 10, 15)) return { ok: false, erro: 'Muitas tentativas erradas seguidas. Espere alguns minutos.' };
  const sb = await clienteDoUsuario(true);
  if (!sb) return { ok: false, erro: 'O login ainda não foi ligado neste servidor.' };
  const { error } = await sb.auth.verifyOtp({ email: limpo, token, type: 'email' });
  if (error) {
    await contarErro('equipe-conferir', 15);
    return { ok: false, erro: mensagemDaEntrada(error) };
  }
  // só segue para o app autenticador quem é da equipe (ou tem convite)
  const { data } = await sb.rpc('equipe_convidado');
  if (data !== true) {
    await sb.auth.signOut({ scope: 'local' });
    return NAO_EXISTE;
  }
  return { ok: true };
}

export interface CadastroDoApp {
  ok: true;
  fatorId: string;
  uri: string;
  segredo: string;
}

/** Começa o cadastro do app autenticador (o QR e o código para digitar no app). */
export async function comecarCadastroDoApp(): Promise<CadastroDoApp | { ok: false; erro: string; naoExiste?: boolean }> {
  const sb = await clienteDoUsuario(true);
  const sessao = await sessaoAtual(true);
  if (!sb || !sessao) return { ok: false, erro: 'Sua sessão terminou. Entre de novo.' };
  const { data: convidado } = await sb.rpc('equipe_convidado');
  if (convidado !== true) return NAO_EXISTE;
  const fatores = await sb.auth.mfa.listFactors();
  if (fatores.error) return { ok: false, erro: 'Não deu para começar agora. Tente de novo.' };
  if (fatores.data.totp.length) return { ok: false, erro: 'Esta conta já tem um app cadastrado. Atualize a página para digitar o código dele.' };
  // cadastros que ficaram pela metade saem antes do novo
  for (const f of fatores.data.all) if (f.factor_type === 'totp' && f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Revisaí ${new Date().toISOString().slice(0, 16)}`, issuer: 'Revisaí equipe' });
  if (error || !data) {
    console.error('[equipe] cadastrar app', error?.message);
    return { ok: false, erro: 'Não deu para começar o cadastro do app. Tente de novo.' };
  }
  return { ok: true, fatorId: data.id, uri: data.totp.uri, segredo: data.totp.secret };
}

async function aparelho(): Promise<string> {
  const jar = await cookies();
  let valor = jar.get(COOKIE_APARELHO)?.value ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(valor)) {
    valor = randomBytes(32).toString('base64url');
    jar.set(COOKIE_APARELHO, valor, { ...OPCOES_COOKIE_EQUIPE, maxAge: 60 * 60 * 24 * 400 });
  }
  return createHash('sha256').update(valor).digest('hex');
}

/** Depois do código do app: o banco confirma que é da equipe e anota o aparelho. */
async function entrarNaEquipe(): Promise<Resposta> {
  const sb = await clienteDoUsuario(true);
  if (!sb) return { ok: false, erro: 'Sua sessão terminou. Entre de novo.' };
  const { data, error } = await sb.rpc('equipe_entrar', { p_aparelho: await aparelho(), p_descricao: descricaoDoAparelho(await agenteDoPedido()), p_ip: await ipDoPedido() });
  const r = data as { papel: string | null; aparelhoNovo?: boolean } | null;
  if (error || !r?.papel) {
    if (error) console.error('[equipe] entrar', error.message);
    await sb.auth.signOut({ scope: 'local' });
    return NAO_EXISTE;
  }
  const jar = await cookies();
  if (r.aparelhoNovo) jar.set(COOKIE_APARELHO_NOVO, '1', { ...OPCOES_COOKIE_EQUIPE, maxAge: 60 * 60 * 24 });
  return { ok: true };
}

export async function confirmarCadastroDoApp(fatorId: string, codigo: string): Promise<Resposta> {
  const token = codigoLimpo(codigo);
  if (!token || !/^[0-9a-f-]{36}$/.test(String(fatorId))) return { ok: false, erro: 'O código do app tem 6 números.' };
  if (await esgotado('equipe-app', 10, 15)) return { ok: false, erro: 'Muitas tentativas erradas seguidas. Espere alguns minutos.' };
  const sb = await clienteDoUsuario(true);
  if (!sb) return { ok: false, erro: 'Sua sessão terminou. Entre de novo.' };
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fatorId, code: token });
  if (error) {
    await contarErro('equipe-app', 15);
    return { ok: false, erro: mensagemDaEntrada(error) };
  }
  return entrarNaEquipe();
}

/** O código do app já cadastrado (ao entrar, e quando o código de 12 horas vence). */
export async function confirmarCodigoDoApp(codigo: string): Promise<Resposta> {
  const token = codigoLimpo(codigo);
  if (!token) return { ok: false, erro: 'O código do app tem 6 números.' };
  if (await esgotado('equipe-app', 10, 15)) return { ok: false, erro: 'Muitas tentativas erradas seguidas. Espere alguns minutos.' };
  const sb = await clienteDoUsuario(true);
  if (!sb) return { ok: false, erro: 'Sua sessão terminou. Entre de novo.' };
  const fatores = await sb.auth.mfa.listFactors();
  const fator = fatores.data?.totp[0];
  if (!fator) return { ok: false, erro: 'Esta conta ainda não tem app cadastrado. Atualize a página.' };
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fator.id, code: token });
  if (error) {
    await contarErro('equipe-app', 15);
    return { ok: false, erro: mensagemDaEntrada(error) };
  }
  return entrarNaEquipe();
}

export async function sairDaEquipe(): Promise<void> {
  const sb = await clienteDoUsuario(true);
  await sb?.auth.signOut({ scope: 'local' });
  const jar = await cookies();
  jar.delete(COOKIE_APARELHO_NOVO);
  redirect('/admin/entrar');
}

/** O aviso de aparelho novo já foi visto. */
export async function dispensarAvisoDeAparelho(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_APARELHO_NOVO);
}
