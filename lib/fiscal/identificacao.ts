// CPF e CNPJ conferidos pelos dígitos verificadores. Desde julho de 2026 a Receita dá CNPJ com
// letras nas 12 primeiras posições (IN RFB 2.229/2024): cada caractere vale o código ASCII menos
// 48 (0 a 9 continuam valendo 0 a 9; A vale 17) e os dois dígitos finais continuam números.

function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Só números (CPF) ou letras e números em maiúsculas (CNPJ). */
export function limparDocumento(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function cpfValido(v: string | null | undefined): boolean {
  const c = (v ?? '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const d1 = digitoVerificador(c.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(c.slice(0, 9) + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${d1}${d2}`);
}

export function cnpjValido(v: string | null | undefined): boolean {
  const c = limparDocumento(v);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const d1 = digitoVerificador(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${d1}${d2}`);
}

export type TipoDocumentoPessoa = 'cpf' | 'cnpj';

/** O CPF ou o CNPJ válido, limpo, com o tipo; null quando não confere. */
export function lerCpfCnpj(v: string | null | undefined): { tipo: TipoDocumentoPessoa; numero: string } | null {
  const c = limparDocumento(v);
  if (c.length === 11 && cpfValido(c)) return { tipo: 'cpf', numero: c };
  if (c.length === 14 && cnpjValido(c)) return { tipo: 'cnpj', numero: c };
  return null;
}

/** '123.456.789-09' ou '12.345.678/0001-95' (o que não for CPF nem CNPJ volta como veio). */
export function formatarCpfCnpj(v: string | null | undefined): string {
  const c = limparDocumento(v);
  if (c.length === 11 && /^\d{11}$/.test(c)) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  if (c.length === 14) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  return (v ?? '').trim();
}
