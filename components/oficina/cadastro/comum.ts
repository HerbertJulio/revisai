'use client';

import { useConta } from '@/components/conta/ProvedorConta';

/** Dono ou gerente (ou o aparelho sem conta, que é do dono): quem vê o que envolve dinheiro. */
export function useGestao(): boolean {
  const { oficina } = useConta();
  return !oficina || oficina.papel !== 'mecanico';
}
