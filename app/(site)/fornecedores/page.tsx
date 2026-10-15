import type { Metadata } from 'next';
import { BarChart3, BellRing, Check, Rocket, Truck } from 'lucide-react';
import { FormInteresse } from '@/components/site/FormInteresse';
import { formatarMoeda } from '@/lib/formatos';
import { DIAS_IMPULSO, PLANOS_FORNECEDOR, PRECO_IMPULSO, type PlanoFornecedor } from '@/lib/planos-fornecedor';

export const metadata: Metadata = {
  title: 'Para fornecedores',
  description:
    'Venda óleo, filtros e peças para as oficinas no momento em que elas vão precisar. Plano Vitrine sem mensalidade, plano Destaque para aparecer primeiro e impulso de produto por 7, 15 ou 30 dias.'
};

export default function Fornecedores() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="max-w-3xl">
        <h1 className="largo text-[38px] leading-[1.02] sm:text-[52px]">Venda para a oficina na hora em que ela vai precisar</h1>
        <p className="mt-5 max-w-[60ch] text-[18px] leading-relaxed text-tinta-2">
          O Revisaí sabe quantas trocas de óleo, filtros e revisões estão para vencer em cada oficina. A sua oferta aparece ali, no aviso do cliente e na lista de compras da semana, e o pedido chega com o WhatsApp da oficina.
        </p>
      </div>

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {(Object.keys(PLANOS_FORNECEDOR) as PlanoFornecedor[]).map((id) => {
          const p = PLANOS_FORNECEDOR[id];
          const escuro = id === 'destaque';
          return (
            <section key={id} className={`flex flex-col gap-4 rounded-[22px] px-6 py-7 ${escuro ? 'bg-tinta text-papel' : 'bg-papel ring-1 ring-linha'}`}>
              <div>
                <h2 className="text-[26px]">{p.nome}</h2>
                <p className={escuro ? 'text-papel/75' : 'text-tinta-2'}>{p.resumo}</p>
              </div>
              <p>
                <span className="largo num text-[34px] font-extrabold">{p.mensalidade ? formatarMoeda(p.mensalidade) : 'Grátis'}</span>
                {p.mensalidade ? <span className={escuro ? 'text-papel/75' : 'text-tinta-3'}> por mês</span> : null}
                <span className={`block text-[15px] ${escuro ? 'text-papel/75' : 'text-tinta-3'}`}>e {p.comissao}% sobre os pedidos entregues</span>
              </p>
              <ul className="flex flex-col gap-2">
                {p.itens.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check size={19} className={`mt-0.5 shrink-0 ${escuro ? 'text-oleo' : 'text-ok'}`} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[22px] bg-papel px-6 py-7 ring-1 ring-linha">
          <Rocket size={24} className="text-tinta-2" aria-hidden="true" />
          <h2 className="text-[22px]">Impulsionar um produto</h2>
          <p className="text-tinta-2">Lançamento ou estoque parado: o produto aparece primeiro na categoria e ao lado da sugestão de compra das oficinas, com o selo Patrocinado, no seu estado ou no Brasil todo.</p>
          <p className="flex flex-wrap gap-2 pt-1">
            {DIAS_IMPULSO.map((d) => (
              <span key={d} className="rounded-xl bg-papel-2 px-3 py-1.5 text-[15px]">
                {d} dias, <span className="num font-semibold">{formatarMoeda(PRECO_IMPULSO[d])}</span>
              </span>
            ))}
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-[22px] bg-papel px-6 py-7 ring-1 ring-linha">
          <BarChart3 size={24} className="text-tinta-2" aria-hidden="true" />
          <h2 className="text-[22px]">Saiba o que a região vai comprar</h2>
          <p className="text-tinta-2">
            No seu painel aparece a soma do que as oficinas da região vão precisar nos próximos 30 dias, como 48 litros de 5W-30 ou 20 filtros de ar, com uma sugestão de promoção pronta para publicar. Você vê as
            quantidades, nunca quem são as oficinas ou os clientes delas.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-[22px] bg-papel px-6 py-7 ring-1 ring-linha">
          <BellRing size={24} className="text-tinta-2" aria-hidden="true" />
          <h2 className="text-[22px]">Responda os pedidos de preço</h2>
          <p className="text-tinta-2">
            A oficina do seu estado diz quanto quer pagar, como 5 filtros por R$ 24 cada. Você aceita, faz uma contraproposta (vendo por 24, levando 10) ou passa a vez. Se ela escolher a sua loja, o pedido chega pronto, com o preço combinado.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-[22px] bg-papel px-6 py-7 ring-1 ring-linha">
          <Truck size={24} className="text-tinta-2" aria-hidden="true" />
          <h2 className="text-[22px]">Receba por Pix e mostre a entrega</h2>
          <p className="text-tinta-2">
            Cadastre a sua chave Pix e, quando você confirmar o pedido, a oficina paga pelo app, com o QR Code do valor do pedido, direto na sua conta. Quando o pedido sair, mande o link para o entregador: a oficina acompanha a entrega no mapa, sem precisar ligar.
          </p>
        </div>
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
