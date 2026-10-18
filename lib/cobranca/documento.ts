// CPF e CNPJ para a nota fiscal, e o dia de hoje em Brasília para os vencimentos.

import { cnpjValido, soNumeros } from '@/lib/cnpj';

export function cpfValido(v: string): boolean {
  const c = soNumeros(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const digito = (base: string, peso: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(c.slice(0, 9), 10) === Number(c[9]) && digito(c.slice(0, 10), 11) === Number(c[10]);
}

/** CPF ou CNPJ válido, só números (ou null). */
export function documentoValido(v: string): string | null {
  const c = soNumeros(v ?? '');
  if (c.length === 11) return cpfValido(c) ? c : null;
  if (c.length === 14) return cnpjValido(c) ? c : null;
  return null;
}

export function formatarDocumento(v: string): string {
  const c = soNumeros(v ?? '');
  if (c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  if (c.length === 14) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  return c;
}

/** AAAA-MM-DD de hoje em Brasília. */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

/** O mesmo dia no mês seguinte (31/01 vira 28 ou 29/02). */
export function maisUmMes(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(a, m, Math.min(d, ultimo)));
  return alvo.toISOString().slice(0, 10);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function maisDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Um identificador de transação Pix (26 a 35 letras e números). */
export function novoTxid(prefixo = 'rv'): string {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(30);
  globalThis.crypto.getRandomValues(bytes);
  let t = prefixo.replace(/[^A-Za-z0-9]/g, '');
  for (const b of bytes) t += letras[b % letras.length];
  return t.slice(0, 32);
}
