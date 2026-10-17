'use client';

import { Printer } from 'lucide-react';
import { classeBotao } from '@/components/ui';

export function BotaoImprimir({ rotulo = 'Imprimir ou salvar PDF', className = 'flex-1' }: { rotulo?: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={classeBotao('secundario', 'normal', `${className} print:hidden`)}>
      <Printer size={17} aria-hidden="true" /> {rotulo}
    </button>
  );
}
