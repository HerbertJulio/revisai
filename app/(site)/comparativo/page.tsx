import type { Metadata } from 'next';
import { EyeOff, ShieldCheck, Users } from 'lucide-react';
import { FormComparativo } from './Formulario';

export const metadata: Metadata = {
  title: 'Sua oficina contra a média',
  description: 'Compare o ticket médio, o preço da troca de óleo e os carros por mês da sua oficina com as oficinas da sua cidade. Grátis e sem cadastro.'
};

const COMO = [
  {
    Icone: Users,
    t: 'A média vem de oficinas de verdade',
    d: 'Das oficinas com conta no Revisaí na sua cidade (ou no estado, quando a cidade ainda tem poucas), pelas ordens de serviço dos últimos 90 dias.'
  },
  {
    Icone: EyeOff,
    t: 'Ninguém aparece',
    d: 'Só a faixa do meio, com 5 oficinas ou mais e um pouco de arredondamento. Nenhum nome, nenhum número de uma oficina só.'
  },
  {
    Icone: ShieldCheck,
    t: 'Seus números ficam com você',
    d: 'O que você digita não sai do seu aparelho e não é guardado. A conta é feita aqui mesmo.'
  }
];

export default function PaginaComparativo() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
      <p className="text-[15px] font-semibold text-oleo-tinta">Grátis e sem cadastro</p>
      <h1 className="largo mt-2 max-w-[20ch] text-[38px] leading-[1.02] sm:text-[52px]">Sua oficina contra a média</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] text-tinta-2">
        Digite três números da sua oficina e veja onde você fica entre as oficinas da sua cidade: o ticket médio, o preço da troca de óleo e quantos carros atende por mês.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <FormComparativo />
        <aside className="flex flex-col gap-6 self-start" aria-labelledby="t-como">
          <h2 id="t-como" className="text-[24px]">
            Como funciona
          </h2>
          <ul className="flex flex-col gap-5">
            {COMO.map(({ Icone, t, d }) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-papel text-tinta ring-1 ring-linha">
                  <Icone size={19} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-bold">{t}</p>
                  <p className="text-tinta-2">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
