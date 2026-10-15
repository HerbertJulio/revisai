// O código do pedido que a oficina e a loja usam para conversar: 6 letras e números sem os que
// confundem (0/O, 1/I).
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codigoPedido(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => LETRAS[b % LETRAS.length]).join('');
}
