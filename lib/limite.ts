import 'server-only';
import { headers } from 'next/headers';

// Limite simples de tentativas por IP, para evitar envios em série. Vale por instância do servidor;
// o banco tem os próprios limites para pedidos e cadastros.
const janela = new Map<string, number[]>();

export async function ipDaRequisicao(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

export async function permitido(chave: string, maximo: number, minutos: number): Promise<boolean> {
  const ip = await ipDaRequisicao();
  const agora = Date.now();
  const id = `${chave}:${ip}`;
  const recentes = (janela.get(id) ?? []).filter((t) => agora - t < minutos * 60_000);
  if (recentes.length >= maximo) return false;
  recentes.push(agora);
  janela.set(id, recentes);
  if (janela.size > 5000) janela.clear();
  return true;
}
