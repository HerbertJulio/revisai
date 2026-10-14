'use client';

import { useEffect, useRef } from 'react';

/** No celular, deixa a aba da página atual à vista quando as abas não cabem na tela. */
export function RolarAteAtual() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const abas = ref.current?.parentElement?.querySelector<HTMLElement>('[data-abas]');
    const atual = abas?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!abas || !atual) return;
    const fim = atual.offsetLeft + atual.offsetWidth;
    if (atual.offsetLeft < abas.scrollLeft || fim > abas.scrollLeft + abas.clientWidth) abas.scrollLeft = atual.offsetLeft - 16;
  }, []);
  return <span ref={ref} hidden />;
}
