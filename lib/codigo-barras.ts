// Código de barras dos produtos: o GTIN (EAN-13, EAN-8, UPC) que vem na embalagem e na nota de
// compra, e o jeito de achar o item do estoque pelo que a câmera leu ou pela digitação.

import type { ItemEstoque } from './tipos';

/** Os formatos que a câmera procura (os das embalagens de peças e de óleo). */
export const FORMATOS_DE_BARRAS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] as const;

/** Só letras e números, sem espaços (códigos de fabricante às vezes têm letras e traços). */
export function limparCodigo(t: string | null | undefined): string {
  return String(t ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s.\-/]+/g, '');
}

function digitoGtin(corpo: string): number {
  let soma = 0;
  for (let i = 0; i < corpo.length; i++) {
    const d = Number(corpo[corpo.length - 1 - i]);
    soma += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (soma % 10)) % 10;
}

/** GTIN-8, 12 (UPC-A), 13 (EAN-13) ou 14, com o dígito verificador certo. */
export function gtinValido(t: string | null | undefined): boolean {
  const c = String(t ?? '').trim();
  if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false;
  if (/^0+$/.test(c)) return false;
  return digitoGtin(c.slice(0, -1)) === Number(c.at(-1));
}

/** O GTIN com 14 dígitos (zeros na frente), para comparar EAN-13 com UPC-A e GTIN-14. */
export function gtin14(t: string | null | undefined): string | null {
  const c = String(t ?? '').trim();
  return gtinValido(c) ? c.padStart(14, '0') : null;
}

/** O código de barras da nota (cEAN): "SEM GTIN", vazio ou inválido viram null. */
export function eanDaNota(t: string | null | undefined): string | null {
  const c = String(t ?? '').trim();
  return gtinValido(c) ? c : null;
}

/** Os dois códigos são o mesmo (GTIN em tamanhos diferentes, ou o mesmo texto). */
export function mesmoCodigo(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = limparCodigo(a);
  const y = limparCodigo(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const gx = gtin14(x);
  return !!gx && gx === gtin14(y);
}

/** O item do estoque com esse código: o código de barras primeiro, depois o código do fabricante e o do fornecedor. */
export function acharPorCodigo(estoque: Iterable<ItemEstoque>, codigo: string): ItemEstoque | null {
  const c = limparCodigo(codigo);
  if (c.length < 3) return null;
  const itens = [...estoque];
  return (
    itens.find((i) => mesmoCodigo(i.ean, c)) ??
    itens.find((i) => mesmoCodigo(i.codigo, c)) ??
    itens.find((i) => mesmoCodigo(i.codigoFornecedor, c)) ??
    null
  );
}

/** Onde o código lido fica guardado no item: no código de barras se for um GTIN; senão, no código do fabricante. */
export function campoDoCodigo(codigo: string): { ean: string } | { codigo: string } {
  const c = limparCodigo(codigo);
  return gtinValido(c) ? { ean: c } : { codigo: c };
}
