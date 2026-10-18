import { BadgePercent, MessageCircle, Printer, ShieldCheck, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { Galheta } from '@/components/icones';
import { Carimbo, EtiquetaTroca, Placa } from '@/components/pecas';
import { DemoEtiqueta } from '@/components/site/DemoEtiqueta';
import { classeBotao } from '@/components/ui';

export default function Inicio() {
  return (
    <>
      {/* abertura */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.12fr_1fr] lg:pt-16">
        <div className="flex flex-col gap-6">
          <h1 className="largo text-[40px] leading-[0.98] sm:text-[54px] lg:text-[58px]">Seu cliente esquece a troca de óleo. A oficina avisa antes.</h1>
          <p className="max-w-[54ch] text-[18px] leading-relaxed text-tinta-2">
            O Revisaí calcula quando cada carro precisa voltar, pela data ou pela quilometragem, e avisa a oficina com antecedência. Um toque e a mensagem sai pelo WhatsApp, já com a peça certa em promoção na loja.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/oficina" className={classeBotao('primario', 'grande')}>
              Abrir o painel da oficina
            </Link>
            <Link href="#como-funciona" className={classeBotao('secundario', 'grande')}>
              Ver como funciona
            </Link>
          </div>
          <p className="text-[14px] text-tinta-3">Grátis. Sem cadastro nesta versão: os dados ficam no aparelho da oficina.</p>
        </div>
        <DemoEtiqueta />
      </section>

      {/* como funciona: é uma sequência, por isso os números */}
      <section id="como-funciona" className="scroll-mt-20 border-y border-linha bg-papel">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="largo max-w-[22ch] text-[32px] sm:text-[40px]">Do serviço feito ao cliente de volta</h2>
          <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
            {[
              {
                titulo: 'Registre o serviço',
                texto: 'Placa, quilometragem do painel e o que foi feito. O prazo da próxima troca já vem preenchido pelo manual, pelo uso do carro e pelo produto usado.'
              },
              {
                titulo: 'Receba o aviso',
                texto: 'Quando faltar 15 dias ou 500 km (você escolhe), o carro entra na lista de quem avisar. Ao abrir o app, você vê o resumo do dia.'
              },
              {
                titulo: 'Mande pelo WhatsApp',
                texto: 'Um toque abre a conversa com a mensagem pronta. Depois é só marcar como agendado. Quem não respondeu volta para a lista em uma semana.'
              }
            ].map((p, i) => (
              <li key={p.titulo} className="flex flex-col gap-3">
                <span className="largo num grid h-11 w-11 place-items-center rounded-full bg-tinta text-[18px] font-extrabold text-papel">{i + 1}</span>
                <h3 className="text-[21px]">{p.titulo}</h3>
                <p className="text-tinta-2">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* aviso de exemplo com a oferta */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col gap-5">
          <h2 className="largo text-[32px] sm:text-[40px]">A peça certa, na hora em que vai precisar</h2>
          <p className="text-[17px] leading-relaxed text-tinta-2">
            Em cada aviso, o Revisaí sugere o produto que atende ao manual do carro, com viscosidade, API e norma da montadora, e mostra as promoções dos fornecedores. A loja soma o que os seus clientes vão precisar nos próximos 30 dias para você comprar de uma vez.
          </p>
          <ul className="flex flex-col gap-3 text-[15.5px]">
            <li className="flex gap-3">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
              Não sugere óleo fora da norma, nem rebaixa de sintético para mineral.
            </li>
            <li className="flex gap-3">
              <Printer size={20} className="mt-0.5 shrink-0 text-tinta-2" aria-hidden="true" />
              Imprime a etiqueta do para-brisa com a próxima troca.
            </li>
            <li className="flex gap-3">
              <Smartphone size={20} className="mt-0.5 shrink-0 text-tinta-2" aria-hidden="true" />
              Manda para o cliente o cartão de manutenção do carro, com lembrete no calendário.
            </li>
          </ul>
        </div>
        <ExemploAviso />
      </section>

      {/* para quem */}
      <section className="border-y border-linha bg-papel">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="largo text-[32px] sm:text-[40px]">Um lugar para os três lados da troca</h2>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            <Publico titulo="Oficinas" texto="Mais clientes voltando na hora certa e menos agenda vazia. Grátis para começar hoje." link="/oficina" acao="Abrir o painel" destaque />
            <Publico
              titulo="Fornecedores"
              texto="Sua oferta aparece no aviso da oficina, no momento em que ela vai precisar do óleo, do filtro ou da pastilha."
              link="/fornecedores"
              acao="Quero vender no Revisaí"
            />
            <Publico
              titulo="Quem tem carro"
              texto="Descubra quando vence a próxima troca e peça à sua oficina o cartão de manutenção do carro."
              link="/motorista"
              acao="Calcular a próxima troca"
            />
          </div>
        </div>
      </section>

      {/* planos */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 rounded-[28px] bg-asfalto px-6 py-10 text-white sm:px-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <h2 className="largo text-[30px] sm:text-[36px]">Grátis para começar. Pro para avisar todo mundo.</h2>
            <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-white/80">
              No grátis, a oficina avisa até 20 carros por mês. No Pro, avisa todos, dita as ordens de serviço por voz ou pelo WhatsApp e vê quanto os avisos rendem. Teste 30 dias sem pagar.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link href="/planos" className={classeBotao('primario', 'grande')}>
              Ver os planos
            </Link>
            <Link href="/oficina" className={classeBotao('claro', 'grande')}>
              Usar o grátis
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Publico({ titulo, texto, link, acao, destaque = false }: { titulo: string; texto: string; link: string; acao: string; destaque?: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-fundo px-6 py-7">
      <h3 className="text-[22px]">{titulo}</h3>
      <p className="flex-1 text-tinta-2">{texto}</p>
      <Link href={link} className={classeBotao(destaque ? 'primario' : 'secundario', 'normal', 'self-start')}>
        {acao}
      </Link>
    </div>
  );
}

/** Um aviso de verdade do painel, desenhado com as mesmas peças. */
function ExemploAviso() {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-papel shadow-etiqueta ring-1 ring-linha before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-oleo">
      <div className="relative flex gap-5 py-5 pr-5 pl-7">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Placa placa="FLM2C24" />
            <span className="text-[14px] text-tinta-2">Chevrolet Onix Plus 1.0 turbo</span>
          </div>
          <p className="meio-largo mt-2 text-[20px] font-extrabold">Fernanda Lima</p>
          <p className="text-[13.5px] text-tinta-3">Hoje com uns 41.000 km. Roda uns 700 km por mês.</p>
          <ul className="mt-3 divide-y divide-linha border-t border-linha">
            <li className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-papel-2 text-tinta-2">
                <Galheta size={20} />
              </span>
              <span className="flex-1 font-semibold">Troca de óleo</span>
              <span className="text-[14px] font-bold text-oleo-tinta">vence em 5 dias</span>
            </li>
          </ul>
        </div>
        <div className="relative hidden pt-1 sm:block">
          <EtiquetaTroca data="2026-10-18" km={41200} situacao="avisar" girar />
          <Carimbo texto="Avisado" data="13/10" className="pointer-events-none absolute -bottom-5 -left-7" />
        </div>
      </div>
      <div className="mx-5 mb-4 flex items-center gap-3 rounded-xl bg-oleo-claro px-3 py-2.5 text-[14px] sm:ml-7">
        <BadgePercent size={20} className="shrink-0 text-oleo-tinta" aria-hidden="true" />
        <p className="leading-snug">
          <span className="text-tinta-2">Para a troca de óleo</span> <span className="font-semibold">Óleo 5W-30 sintético API SP dexos1 Gen 3</span>
          <span className="block text-tinta-2">4 frascos por R$ 159,60 com 15% de desconto</span>
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-linha bg-papel-2/60 px-5 py-3 sm:pl-7">
        <span className={classeBotao('secundario', 'normal', 'pointer-events-none')}>
          <MessageCircle size={18} /> Avisar de novo
        </span>
        <span className={classeBotao('secundario', 'normal', 'pointer-events-none')}>Agendar</span>
      </div>
    </div>
  );
}
