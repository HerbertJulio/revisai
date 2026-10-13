import type { Metadata } from 'next';
import { Calculadora } from '@/components/site/Calculadora';

export const metadata: Metadata = {
  title: 'Quando trocar o óleo?',
  description: 'Calcule a próxima troca de óleo do seu carro pela data e pela quilometragem, e salve o lembrete no calendário.'
};

export default function Motorista() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="max-w-3xl">
        <h1 className="largo text-[38px] leading-[1.02] sm:text-[52px]">Quando trocar o óleo do seu carro?</h1>
        <p className="mt-5 max-w-[60ch] text-[18px] leading-relaxed text-tinta-2">
          O óleo vence pela data ou pela quilometragem, o que chegar primeiro. Quem roda muito chega ao limite de km antes; quem roda pouco, à data.
        </p>
      </div>
      <div className="mt-12">
        <Calculadora />
      </div>
    </div>
  );
}
