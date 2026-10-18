import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { FormInteresse } from '@/components/site/FormInteresse';
import { chaveDoSiteCaptcha } from '@/lib/captcha';
import { classeBotao } from '@/components/ui';
import { formatarMoeda } from '@/lib/formatos';
import { ALERTAS } from '@/lib/alertas-dados';
import { PRO } from '@/lib/plano';

export const metadata: Metadata = {
  title: 'Planos',
  description: `Use o Revisaí grátis, sem cadastro. O Pro libera avisos sem limite, ordem de serviço por voz, agente no WhatsApp, alerta de preço e o relatório de retorno, por ${formatarMoeda(PRO.precoFundador)} por mês para as primeiras oficinas.`
};

const GRATIS = [
  `${PRO.avisosGratis} avisos por mês pelo WhatsApp, pela data e pela quilometragem`,
  `${PRO.ordensGratis} ordens de serviço por voz por mês, montadas pela IA`,
  'Cartão de manutenção para o cliente, com lembrete no calendário',
  'Etiqueta do para-brisa para imprimir',
  'Orçamento e ordem de serviço no passo a passo, com o link para o cliente aprovar',
  'Estoque com a previsão do que vai faltar',
  'Loja com promoções, o preço que você pagou e o das outras lojas',
  'Pedido acompanhado, Pix direto para a loja e entrega no mapa',
  'Dados guardados no aparelho, com backup em arquivo'
];

const PRO_ITENS = [
  'Avisos sem limite',
  'Ordem de serviço por voz para a oficina toda e agente no WhatsApp: o mecânico manda áudio e foto, a ordem chega pronta',
  'Relatório de retorno: quem voltou depois do aviso e quanto isso rendeu',
  'Pedido de avaliação no Google depois do serviço, com um toque',
  `Alerta de preço: diga quanto quer pagar e as lojas do seu estado respondem, ${ALERTAS.porMesPro} por mês (dá para comprar mais)`,
  'O Pro vale para a oficina toda, em todos os aparelhos da equipe',
  `${PRO.diasTeste} dias de teste direto no app, sem cartão`
];

const EM_BREVE = 'Entrar com o Google e guardar os dados na nuvem, acesso para a equipe toda, lembrete automático para o cliente e etiqueta com a marca da oficina.';

const PASSOS = [
  { t: 'Teste no app', d: 'Em Ajustes, na parte Plano, toque em Testar o Pro. São 30 dias com tudo liberado.' },
  { t: 'Deixe o contato', d: 'A equipe do Revisaí chama no WhatsApp e manda o Pix, por mês ou por 3, 6 ou 12 meses.' },
  { t: 'Digite o código', d: 'Depois do pagamento chega um código. Digite em Ajustes, na parte Plano, e pronto.' }
];

const PERGUNTAS = [
  {
    p: 'Preciso de cadastro para usar o grátis?',
    r: 'Não. Abra o painel, escreva o nome da oficina e comece. Os dados ficam no aparelho; em Ajustes dá para baixar um backup.'
  },
  {
    p: 'O que é o preço de fundador?',
    r: `As ${PRO.vagasFundador} primeiras oficinas que assinarem pagam ${formatarMoeda(PRO.precoFundador)} por mês. Depois, o Pro custa ${formatarMoeda(PRO.preco)} por mês.`
  },
  {
    p: 'Tem fidelidade?',
    r: 'Não. Quando o Pro acaba, o app volta para o grátis e nenhum cliente, carro ou serviço se perde.'
  },
  {
    p: 'O que acontece com os meus dados quando o login chegar?',
    r: 'Ao entrar com a sua conta, os clientes e serviços que estão no aparelho sobem para a nuvem. Nada se perde.'
  }
];

export default function Planos() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
      <h1 className="largo max-w-[20ch] text-[38px] leading-[1.02] sm:text-[52px]">Comece grátis. Avise todos os clientes no Pro.</h1>

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-6 rounded-[22px] bg-papel px-6 py-8 ring-1 ring-linha sm:px-8">
          <div>
            <h2 className="text-[26px]">Grátis</h2>
            <p className="mt-1 text-tinta-2">Para usar hoje, sem cadastro e sem cartão.</p>
          </div>
          <Lista itens={GRATIS} />
          <Link href="/oficina" className={classeBotao('secundario', 'grande', 'mt-auto self-start')}>
            Abrir o painel
          </Link>
        </div>
        <div className="flex flex-col gap-6 rounded-[22px] bg-asfalto px-6 py-8 text-white sm:px-8">
          <div>
            <h2 className="text-[26px]">Pro</h2>
            <p className="num mt-2">
              <span className="largo text-[40px] leading-none font-extrabold text-oleo">{formatarMoeda(PRO.precoFundador)}</span>
              <span className="ml-1.5 text-white/75">por mês</span>
            </p>
            <p className="mt-1 text-[14.5px] text-white/70">
              Para as {PRO.vagasFundador} primeiras oficinas. Depois, {formatarMoeda(PRO.preco)} por mês. Tudo do grátis e mais:
            </p>
          </div>
          <Lista itens={PRO_ITENS} claro />
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <p className="text-[14px] font-semibold text-white/85">Chegando no Pro</p>
            <p className="mt-0.5 text-[14px] text-white/65">{EM_BREVE}</p>
          </div>
          <div className="mt-auto flex flex-wrap gap-3">
            <Link href="/oficina/ajustes#plano" className={classeBotao('primario', 'grande')}>
              Testar 30 dias grátis
            </Link>
            <a href="#assinar" className={classeBotao('claro', 'grande')}>
              Assinar
            </a>
          </div>
        </div>
      </div>

      <section id="assinar" className="mt-20 grid scroll-mt-20 gap-12 lg:grid-cols-[1fr_1.1fr]" aria-labelledby="t-assinar">
        <div className="flex flex-col gap-8">
          <div>
            <h2 id="t-assinar" className="largo text-[30px] sm:text-[36px]">
              Como assinar
            </h2>
            <ol className="mt-5 flex flex-col gap-4">
              {PASSOS.map((x, i) => (
                <li key={x.t} className="flex gap-4">
                  <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-tinta text-[15px] font-bold text-papel">{i + 1}</span>
                  <div>
                    <p className="font-bold">{x.t}</p>
                    <p className="text-tinta-2">{x.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <dl className="flex flex-col gap-5">
            {PERGUNTAS.map((x) => (
              <div key={x.p}>
                <dt className="font-bold">{x.p}</dt>
                <dd className="mt-1 text-tinta-2">{x.r}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="self-start rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
          <FormInteresse
            captcha={chaveDoSiteCaptcha()}
            tipo="oficina"
            origem="planos"
            plano="plus"
            comEmpresa
            rotuloEmpresa="Nome da oficina"
            mensagem="Quantos carros a oficina atende por mês?"
            dicaMensagem="Opcional. Ajuda a gente a combinar o melhor jeito de pagar."
            botao="Quero assinar o Pro"
            sucesso="Pronto. A equipe do Revisaí chama você no WhatsApp para combinar o pagamento."
          />
        </div>
      </section>
    </div>
  );
}

function Lista({ itens, claro = false }: { itens: string[]; claro?: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {itens.map((i) => (
        <li key={i} className="flex gap-3">
          <Check size={20} className={`mt-0.5 shrink-0 ${claro ? 'text-oleo' : 'text-ok'}`} aria-hidden="true" />
          <span className={claro ? 'text-white/90' : ''}>{i}</span>
        </li>
      ))}
    </ul>
  );
}
