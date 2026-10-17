// Ajudas para testar com o Supabase local: chaves, código do e-mail e TOTP.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SB_LOCAL ?? path.join(process.env.HOME ?? '/root', '.revisai-supabase');
export const chaves = JSON.parse(fs.readFileSync(path.join(BASE, 'chaves.json'), 'utf8'));
export const URL_LOCAL = 'http://127.0.0.1:54321';

/** Espera o e-mail com o código chegar e devolve o código de 6 dígitos. */
export async function codigoDoEmail(email, desde = 0, tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    const lista = await (await fetch(`${URL_LOCAL}/__mail?para=${encodeURIComponent(email.toLowerCase())}`)).json();
    const m = lista.filter((x) => x.quando >= desde).at(-1);
    const cod = m && (m.texto + ' ' + m.html).match(/\b(\d{6})\b/);
    if (cod) return cod[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`sem e-mail para ${email}`);
}

function base32(s) {
  const alfa = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += alfa.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Código TOTP (30 s, 6 dígitos, SHA-1) do segredo em base32. */
export function totp(segredo, quando = Date.now()) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(quando / 1000 / 30)));
  const h = crypto.createHmac('sha1', base32(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
