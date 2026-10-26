import Link from 'next/link';
import { ChevronRight, Store, Wrench } from 'lucide-react';

// A primeira tela do login: a pessoa escolhe por onde usa o Revisaí e segue para entrar. Oficina e
// loja usam o mesmo login (e-mail ou Google); a equipe tem a entrada própria, com duas etapas.
const PAINEIS = [
  { href: '/entrar?para=/oficina', Icone: Wrench, titulo: 'Sou oficina', texto: 'Clientes, carros, ordens de serviço e avisos de manutenção.' },
  { href: '/entrar?para=/fornecedor', Icone: Store, titulo: 'Tenho loja de peças', texto: 'Produtos, pedidos, alertas de preço e entregas.' }
];

export function SeletorDePainel() {
  return (
    <div className="flex flex-col gap-3">
      {PAINEIS.map(({ href, Icone, titulo, texto }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-4 rounded-2xl bg-papel-2 p-4 ring-1 ring-linha transition hover:ring-caneta focus-visible:outline-2 focus-visible:outline-caneta"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-oleo-claro text-oleo-tinta">
            <Icone size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold">{titulo}</span>
            <span className="block text-[13.5px] text-tinta-2">{texto}</span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-tinta-3 transition group-hover:translate-x-0.5 group-hover:text-caneta" aria-hidden="true" />
        </Link>
      ))}
      <Link href="/admin/entrar" className="mt-1 text-center text-[13.5px] font-semibold text-tinta-3 hover:text-caneta">
        Sou da equipe Revisaí
      </Link>
    </div>
  );
}
