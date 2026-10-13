import type { Metadata } from 'next';
import { BadgePercent, LayoutGrid, Star } from 'lucide-react';
import { FormInteresse } from '@/components/site/FormInteresse';

export const metadata: Metadata = {
  title: 'Para fornecedores',
  description: 'Venda óleo, filtros e peças para as oficinas no momento em que elas vão precisar. O Revisaí mostra a sua oferta no aviso de troca.'
};

const FORMAS = [
  {
    Icone: LayoutGrid,
    titulo: 'Vitrine',
    texto: 'Seus produtos no catálogo da loja, com a especificação técnica (viscosidade, API, normas, medidas) para entrarem nas recomendações certas.'
  },
  {
    Icone: Star,
    titulo: 'Destaque',
    texto: 'Quando mais de um produto atende ao carro, o seu aparece primeiro para a oficina.'
  },
  {
    Icone: BadgePercent,
    titulo: 'Oferta na hora certa',
    texto: 'Sua promoção aparece dentro do aviso de troca e na soma de compras dos próximos 30 dias das oficinas da sua região.'
  }
];

export default function Fornecedores() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="max-w-3xl">
        <h1 className="largo text-[38px] leading-[1.02] sm:text-[52px]">Venda para a oficina na hora em que ela vai precisar</h1>
        <p className="mt-5 max-w-[60ch] text-[18px] leading-relaxed text-tinta-2">
          O Revisaí sabe quantas trocas de óleo, filtros e revisões estão para vencer em cada oficina. A sua oferta aparece ali, no aviso do cliente e na lista de compras da semana, e o pedido chega com o WhatsApp da oficina.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {FORMAS.map(({ Icone, titulo, texto }) => (
          <div key={titulo} className="flex flex-col gap-3 rounded-[22px] bg-papel px-6 py-7 ring-1 ring-linha">
            <Icone size={24} className="text-tinta-2" aria-hidden="true" />
            <h2 className="text-[22px]">{titulo}</h2>
            <p className="text-tinta-2">{texto}</p>
          </div>
        ))}
      </div>

      <div className="mt-20 grid gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-5">
          <h2 className="largo text-[30px] sm:text-[36px]">Quero vender no Revisaí</h2>
          <p className="text-[17px] leading-relaxed text-tinta-2">
            Estamos começando pelo Rio de Janeiro e vamos combinar as condições com os primeiros fornecedores. Conte o que você vende e onde entrega.
          </p>
          <ul className="flex flex-col gap-2 text-[15.5px] text-tinta-2">
            <li>Para entrar na vitrine: CNPJ, entrega na região das oficinas e a ficha técnica dos produtos.</li>
            <li>Os pedidos chegam com os itens, as quantidades e o WhatsApp da oficina.</li>
            <li>As promoções podem ter quantidade mínima e data de validade.</li>
          </ul>
        </div>
        <div className="rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
          <FormInteresse
            tipo="fornecedor"
            origem="fornecedores"
            comEmpresa
            rotuloEmpresa="Empresa"
            mensagem="O que você vende e onde entrega"
            dicaMensagem="Ex.: lubrificantes e filtros, entrega na Baixada e na Zona Norte."
            botao="Enviar"
            sucesso="Recebemos. A gente fala com você pelo WhatsApp ou e-mail para combinar."
          />
        </div>
      </div>
    </div>
  );
}
