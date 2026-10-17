import 'server-only';
import { createHash } from 'node:crypto';
import {
  CHAMADAS_POR_MINUTO,
  conferirConsulta,
  conferirLote,
  ERROS_DA_API,
  FALHAS_POR_IP,
  FORMATO_DO_TOKEN,
  tokenDoCabecalho,
  type CodigoDeErroDaApi
} from './api-dados';
import { hashDoToken } from './tokens';

// A API de estoque e preço das lojas (/api/lojas/v1/produtos), sem o Next: recebe o pedido já lido e
// o cliente do banco com a chave do sistema, e devolve status e corpo. As regras de quem pode o quê
// estão no banco (loja_api_listar e loja_api_atualizar resolvem o token e só tocam na loja dele);
// aqui ficam o limite de chamadas por token (public.limite_consumir), o limite de tokens errados por
// IP, a conferência do corpo e as mensagens em português.

export interface ErroDoBanco {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/** O pedaço do cliente do Supabase que a API usa (nos testes, um falso). */
export interface BancoDaApi {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErroDoBanco | null }>;
}

export interface PedidoDaApi {
  metodo: 'GET' | 'PATCH';
  autorizacao: string | null;
  ip: string;
  busca: URLSearchParams;
  /** O corpo, lido com limite de tamanho (null quando passou). */
  corpo: () => Promise<string | null>;
}

export interface RespostaDaApi {
  status: number;
  corpo: Record<string, unknown>;
  cabecalhos?: Record<string, string>;
}

function erro(codigo: CodigoDeErroDaApi, extra: Record<string, unknown> = {}, cabecalhos?: Record<string, string>): RespostaDaApi {
  const e = ERROS_DA_API[codigo];
  return { status: e.status, corpo: { erro: e.erro, codigo, ...extra }, cabecalhos };
}

function marcaDoIp(ip: string): string {
  return createHash('sha256').update(`loja-api:${ip}`).digest('hex').slice(0, 24);
}

/** Conta uma chamada na janela; se o banco falhar, deixa passar (melhor que derrubar a integração). */
async function consumir(banco: BancoDaApi, chave: string, maximo: number, segundos: number): Promise<boolean> {
  try {
    const { data, error } = await banco.rpc('limite_consumir', { p_chave: chave, p_max: maximo, p_segundos: segundos });
    if (error) {
      console.warn('[loja-api] limite', error.code, error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.warn('[loja-api] limite', e);
    return true;
  }
}

async function esgotado(banco: BancoDaApi, chave: string, maximo: number, segundos: number): Promise<boolean> {
  try {
    const { data, error } = await banco.rpc('limite_esgotado', { p_chave: chave, p_max: maximo, p_segundos: segundos });
    return !error && data === true;
  } catch {
    return false;
  }
}

async function contarFalha(banco: BancoDaApi, ip: string): Promise<void> {
  await consumir(banco, `loja-api-falha:${marcaDoIp(ip)}`, 1_000_000, 600);
}

/** Registra a chamada recusada antes do banco mexer nos produtos. true/false = o token vale ou não; null = não deu para saber. */
async function registrar(banco: BancoDaApi, token: string, metodo: 'GET' | 'PATCH', situacao: number, recebidos: number): Promise<boolean | null> {
  try {
    const { data, error } = await banco.rpc('loja_api_registrar', { p_token: token, p_metodo: metodo, p_situacao: situacao, p_recebidos: recebidos });
    if (error) {
      console.warn('[loja-api] registrar', error.code, error.message);
      return null;
    }
    return data === true;
  } catch {
    return null;
  }
}

/** Recusa depois de registrar; com token que não vale, a resposta é a do token (401). */
async function recusar(banco: BancoDaApi, p: PedidoDaApi, token: string, codigo: CodigoDeErroDaApi, extra: Record<string, unknown> = {}, recebidos = 0, cabecalhos?: Record<string, string>): Promise<RespostaDaApi> {
  const valido = await registrar(banco, token, p.metodo, ERROS_DA_API[codigo].status, recebidos);
  if (valido === false) {
    await contarFalha(banco, p.ip);
    return erro('token_invalido');
  }
  return erro(codigo, extra, cabecalhos);
}

/** O erro do banco numa chamada que chegou lá. */
async function falhaDoBanco(banco: BancoDaApi, p: PedidoDaApi, e: ErroDoBanco): Promise<RespostaDaApi> {
  if (e.code === 'RV066') {
    await contarFalha(banco, p.ip);
    return erro('token_invalido');
  }
  if (e.code === '22023') return erro('lote_invalido', { erro: `${(e.message ?? 'Confira os produtos').replace(/\.$/, '')}.` });
  console.error('[loja-api]', e.code, e.message);
  return erro('falha');
}

export async function atenderApi(p: PedidoDaApi, banco: BancoDaApi | null): Promise<RespostaDaApi> {
  const token = tokenDoCabecalho(p.autorizacao);
  if (!token) return erro('sem_token');
  if (!banco) return erro('indisponivel');
  if (await esgotado(banco, `loja-api-falha:${marcaDoIp(p.ip)}`, FALHAS_POR_IP, 600)) return erro('muitas_falhas', {}, { 'Retry-After': '600' });
  if (!FORMATO_DO_TOKEN.test(token)) {
    await contarFalha(banco, p.ip);
    return erro('token_invalido');
  }
  // o limite é por token (a chave é o hash dele: o token não vai para a tabela dos limites)
  if (!(await consumir(banco, `loja-api:${hashDoToken(token).slice(0, 40)}`, CHAMADAS_POR_MINUTO, 60))) {
    return recusar(banco, p, token, 'limite', {}, 0, { 'Retry-After': '60' });
  }
  return p.metodo === 'GET' ? listar(p, banco, token) : atualizar(p, banco, token);
}

async function listar(p: PedidoDaApi, banco: BancoDaApi, token: string): Promise<RespostaDaApi> {
  const c = conferirConsulta(p.busca);
  if (!c.ok) return recusar(banco, p, token, 'consulta_invalida', { erro: c.erro });
  const { data, error } = await banco.rpc('loja_api_listar', { p_token: token, p_codigo: c.codigo, p_depois: c.depois, p_limite: c.limite });
  if (error) return falhaDoBanco(banco, p, error);
  return { status: 200, corpo: (data ?? {}) as Record<string, unknown> };
}

async function atualizar(p: PedidoDaApi, banco: BancoDaApi, token: string): Promise<RespostaDaApi> {
  const texto = await p.corpo();
  if (texto == null) return recusar(banco, p, token, 'corpo_grande');
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return recusar(banco, p, token, 'json_invalido');
  }
  const lote = conferirLote(json);
  if (!lote.ok) return recusar(banco, p, token, 'lote_invalido', { erro: lote.erro, erros: lote.erros }, lote.recebidos);
  const { data, error } = await banco.rpc('loja_api_atualizar', { p_token: token, p_itens: lote.itens });
  if (error) return falhaDoBanco(banco, p, error);
  return { status: 200, corpo: (data ?? {}) as Record<string, unknown> };
}

/** Lê o corpo até `maximo` bytes (null quando passa), sem guardar o resto na memória. */
export async function lerCorpoLimitado(corpo: ReadableStream<Uint8Array> | null, maximo: number, tamanhoDeclarado: number | null): Promise<string | null> {
  if (tamanhoDeclarado != null && tamanhoDeclarado > maximo) return null;
  if (!corpo) return '';
  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(partes));
}
