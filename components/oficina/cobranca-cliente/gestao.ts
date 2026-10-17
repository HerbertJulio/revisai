'use client';

import { useConta } from '@/components/conta/ProvedorConta';

/**
 * Quem vê dinheiro: sem conta, quem usa o aparelho é o dono; com conta, o dono e o gerente.
 * O mecânico não vê cobranças, clube nem notas (o banco também não entrega esses dados a ele).
 */
export function useGestao() {
  const { oficina, banco } = useConta();
  return {
    gestao: !oficina || oficina.papel !== 'mecanico',
    comConta: !!oficina,
    oficinaId: oficina?.id ?? null,
    plano: oficina?.plano ?? null,
    banco
  };
}
