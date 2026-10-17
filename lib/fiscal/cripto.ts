// Os tokens de acesso que o emissor dá a cada empresa (Focus NFe: um de produção e um de
// homologação, para emitir as notas dela) ficam cifrados no banco (AES-256-GCM, chave do
// servidor): quem lesse a tabela não conseguiria emitir nem cancelar nota em nome da oficina.
// O certificado A1 e a senha dele nunca passam por aqui: vão do formulário direto para o emissor
// (lib/fiscal/servidor.ts) e o Revisaí não guarda nenhum dos dois.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AmbienteFiscal, CredenciaisFiscais } from './tipos';

const b64 = (b: Buffer) => b.toString('base64url');

export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return `v1.${b64(iv)}.${b64(c.getAuthTag())}.${b64(dados)}`;
}

export function decifrar(cifrado: string, chave: Buffer): string | null {
  const [v, iv, tag, dados] = cifrado.split('.');
  if (v !== 'v1' || !iv || !tag || dados === undefined) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const AMBIENTES: AmbienteFiscal[] = ['producao', 'homologacao'];

/** As credenciais como vão para o banco (os tokens cifrados). */
export function credenciaisParaGuardar(c: CredenciaisFiscais, chave: Buffer | null): Record<string, unknown> {
  const tokens: Record<string, string> = {};
  for (const a of AMBIENTES) {
    const t = c.tokens?.[a];
    if (t && chave) tokens[a] = cifrar(t, chave);
  }
  return { empresaId: c.empresaId, tokens };
}

/** As credenciais lidas do banco (os tokens que não abrirem com a chave ficam de fora). */
export function credenciaisGuardadas(v: unknown, chave: Buffer | null): CredenciaisFiscais | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  const tokens: Partial<Record<AmbienteFiscal, string | null>> = {};
  const brutos = d.tokens && typeof d.tokens === 'object' ? (d.tokens as Record<string, unknown>) : {};
  for (const a of AMBIENTES) {
    const t = brutos[a];
    tokens[a] = typeof t === 'string' && chave ? decifrar(t, chave) : null;
  }
  return { empresaId: typeof d.empresaId === 'string' && d.empresaId ? d.empresaId : null, tokens };
}
