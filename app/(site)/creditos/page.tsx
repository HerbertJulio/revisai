import type { Metadata } from 'next';
import { CATEGORIAS } from '@/lib/catalogo';
import { FOTOS_CATEGORIA, linkDaLicenca, paginaDaFoto } from '@/lib/fotos';

export const metadata: Metadata = {
  title: 'Créditos das fotos',
  description: 'As fotos ilustrativas da loja do Revisaí vêm do Wikimedia Commons, com licenças livres. Aqui estão os autores e as licenças.'
};

export default function Creditos() {
  const fotos = CATEGORIAS.flatMap((c) => {
    const f = FOTOS_CATEGORIA[c.id];
    return f ? [{ categoria: c.nome, f }] : [];
  });
  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6 lg:pt-16">
      <h1 className="largo text-[34px] leading-tight sm:text-[42px]">Créditos das fotos</h1>
      <p className="mt-4 max-w-[62ch] text-tinta-2">
        Quando o fornecedor ainda não mandou a foto do produto, a loja mostra uma foto ilustrativa da categoria. Essas fotos são do Wikimedia Commons, com licenças livres, e aparecem
        recortadas para caber na vitrine. A marca que aparecer na foto não tem ligação com o produto à venda.
      </p>
      <ul className="mt-10 divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
        {fotos.map(({ categoria, f }) => (
          <li key={categoria} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3.5">
            <span className="font-semibold">{categoria}</span>
            <span className="text-[14.5px] text-tinta-2">
              <a href={paginaDaFoto(f)} target="_blank" rel="noopener noreferrer" className="hover:text-caneta hover:underline">
                {f.autor}
              </a>
              ,{' '}
              <a href={linkDaLicenca(f)} target="_blank" rel="noopener noreferrer" className="hover:text-caneta hover:underline">
                {f.licenca}
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
