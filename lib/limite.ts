import 'server-only';
import { headers } from 'next/headers';

// Limite simples de tentativas por IP, para evitar envios em série. Vale por instância do servidor;
// o banco tem os próprios limites para pedidos e cadastros.
const janela = new Map<string, number[]>();

export async function ipDaRequisicao(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

function recentes(id: string, minutos: number, agora: number): number[] {
  return (janela.get(id) ?? []).filter((t) => agora - t < minutos * 60_000);
}

function guardar(id: string, lista: number[]) {
  janela.set(id, lista);
  if (janela.size > 5000) janela.clear();
}

/** Conta esta tentativa e diz se ela ainda cabe no limite. */
export async function permitido(chave: string, maximo: number, minutos: number): Promise<boolean> {
  const id = `${chave}:${await ipDaRequisicao()}`;
  const agora = Date.now();
  const lista = recentes(id, minutos, agora);
  if (lista.length >= maximo) return false;
  lista.push(agora);
  guardar(id, lista);
  return true;
}

/** Só confere, sem contar: para limitar erros (senha errada) sem punir quem acerta. */
export async function esgotado(chave: string, maximo: number, minutos: number): Promise<boolean> {
  const id = `${chave}:${await ipDaRequisicao()}`;
  return recentes(id, minutos, Date.now()).length >= maximo;
}

/** Conta um erro para o limite de `esgotado`. */
export async function contarErro(chave: string, minutos: number): Promise<void> {
  const id = `${chave}:${await ipDaRequisicao()}`;
  const agora = Date.now();
  const lista = recentes(id, minutos, agora);
  lista.push(agora);
  guardar(id, lista);
}
