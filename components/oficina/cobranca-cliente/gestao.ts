'use client';

import { useConta } from '@/components/conta/ProvedorConta';
import { useContextoDaConta } from '../servico/conta';

/**
 * Quem vê dinheiro: sem conta, quem usa o aparelho é o dono; com conta, o dono e o gerente.
 * O mecânico não vê cobranças, clube nem notas (o banco também não entrega esses dados a ele).
 * `ctx` é a conta ligada aos dados deste aparelho (null sem conta), a mesma dos links do cliente.
 */
export function useGestao() {
  const { oficina } = useConta();
  const ctx = useContextoDaConta();
  return {
    gestao: !oficina || oficina.papel !== 'mecanico',
    comConta: !!oficina,
    plano: oficina?.plano ?? null,
    ctx
  };
}
