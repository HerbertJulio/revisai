// CNPJ: só números, com os dois dígitos verificadores conferidos.

export function soNumeros(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

export function cnpjValido(v: string): boolean {
  const c = soNumeros(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const digito = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((s, n, i) => s + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digito(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(v: string): string {
  const c = soNumeros(v).slice(0, 14);
  if (c.length !== 14) return c;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
