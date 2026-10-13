import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { FormInteresse } from '@/components/site/FormInteresse';
import { classeBotao } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Planos',
  description: 'Use o Revisaí grátis hoje. O plano Plus traz login com Google, dados na nuvem, equipe e lembrete automático para o cliente.'
};

const GRATIS = [
  'Avisos pela data e pela quilometragem, com a antecedência que você escolher',
  'Mensagem pronta no WhatsApp, agenda e histórico de contatos',
  'Cartão de manutenção para o cliente, com lembrete no calendário',
  'Etiqueta do para-brisa para imprimir',
  'Loja com promoções e a soma do que comprar no mês',
  'Dados guardados no aparelho, com backup em arquivo'
];

const PLUS = [
  'Entrar com o Google ou com o e-mail da oficina',
  'Dados na nuvem, em vários aparelhos e com a equipe',
  'Lembrete automático para o cliente, sem precisar tocar em nada',
  'Relatório de quantos clientes voltaram e quanto isso rendeu',
  'Etiqueta e cartão com a marca da oficina',
  'Período de teste antes de assinar'
];

const PERGUNTAS = [
  {
    p: 'Preciso de cadastro para usar o grátis?',
    r: 'Não. Abra o painel, escreva o nome da oficina e comece. Os dados ficam no aparelho; em Ajustes dá para baixar um backup.'
  },
  {
    p: 'Quanto vai custar o Plus?',
    r: 'O preço ainda não foi definido. Quem deixar o contato fica sabendo primeiro e pode testar antes.'
  },
  {
    p: 'O que acontece com os meus dados quando o Plus chegar?',
    r: 'Ao entrar com a sua conta, os clientes e serviços que estão no aparelho sobem para a nuvem. Nada se perde.'
  }
];

export default function Planos() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
      <h1 className="largo max-w-[18ch] text-[38px] leading-[1.02] sm:text-[52px]">Comece grátis. O Plus vem aí.</h1>

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-6 rounded-[22px] bg-papel px-6 py-8 ring-1 ring-linha sm:px-8">
          <div>
            <h2 className="text-[26px]">Grátis</h2>
            <p className="mt-1 text-tinta-2">Para usar hoje, sem cadastro.</p>
          </div>
          <Lista itens={GRATIS} />
          <Link href="/oficina" className={classeBotao('primario', 'grande', 'mt-auto self-start')}>
            Abrir o painel
          </Link>
        </div>
        <div className="flex flex-col gap-6 rounded-[22px] bg-asfalto px-6 py-8 text-white sm:px-8">
          <div>
            <h2 className="text-[26px]">Plus</h2>
            <p className="mt-1 text-white/75">Em breve. Tudo do grátis e mais:</p>
          </div>
          <Lista itens={PLUS} claro />
          <a href="#quero-o-plus" className={classeBotao('primario', 'grande', 'mt-auto self-start')}>
            Quero testar o Plus
          </a>
        </div>
      </div>

      <div id="quero-o-plus" className="mt-20 grid scroll-mt-20 gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <h2 className="largo text-[30px] sm:text-[36px]">Quero testar o Plus</h2>
          <dl className="flex flex-col gap-5">
            {PERGUNTAS.map((x) => (
              <div key={x.p}>
                <dt className="font-bold">{x.p}</dt>
                <dd className="mt-1 text-tinta-2">{x.r}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
          <FormInteresse
            tipo="oficina"
            origem="planos"
            plano="plus"
            comEmpresa
            rotuloEmpresa="Nome da oficina"
            mensagem="Quantos carros a oficina atende por mês?"
            dicaMensagem="Opcional. Ajuda a gente a montar o plano certo."
            botao="Quero testar"
            sucesso="Pronto. Você vai ser avisado quando o Plus abrir para teste."
          />
        </div>
      </div>
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
