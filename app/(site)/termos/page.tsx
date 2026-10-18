import type { Metadata } from 'next';
import Link from 'next/link';
import { ALERTAS, PACOTES_ALERTAS } from '@/lib/alertas-dados';
import { dadosDaEmpresa } from '@/lib/avisos/empresa';
import { formatarMoeda } from '@/lib/formatos';
import { PRO } from '@/lib/plano';
import { Documento, Lista, Secao } from './documento';

// Termos de uso do Revisaí. Revisado por advogado: pendente.
// Ao mudar o texto de verdade, mude também VERSAO_DOS_DOCUMENTOS (./versao) e public.versoes_dos_termos().

export const metadata: Metadata = {
  title: 'Termos de uso',
  description: 'As regras para usar o Revisaí: conta, planos, pagamento, loja de peças, avisos aos clientes, inteligência artificial e o que acontece se algo der errado.'
};

const link = 'font-semibold text-caneta underline';

export default function Termos() {
  const e = dadosDaEmpresa();
  return (
    <Documento
      titulo="Termos de uso"
      atual="/termos"
      resumo={
        <>
          <p>
            Estes termos são o contrato entre você e o Revisaí. Eles valem para quem usa o app da oficina, a loja de peças, os alertas de preço, os avisos e o site. Leia com calma: ao criar uma conta ou
            usar o Revisaí, você concorda com eles.
          </p>
          <p>
            Lojas que vendem pelo Revisaí seguem também o{' '}
            <Link href="/contrato-lojas" className={link}>
              Contrato das lojas
            </Link>
            . Os dados dos clientes da oficina seguem o{' '}
            <Link href="/tratamento-de-dados" className={link}>
              Acordo de tratamento de dados
            </Link>
            . Como cuidamos dos dados pessoais está na{' '}
            <Link href="/privacidade" className={link}>
              Política de privacidade
            </Link>
            .
          </p>
        </>
      }
    >
      <Secao n={1} titulo="Quem somos e o que é o Revisaí">
        <p>
          O Revisaí é um serviço de {e.razaoSocial}, CNPJ {e.cnpj}, com endereço em {e.endereco} (aqui chamado de “Revisaí” ou “nós”).
        </p>
        <p>O Revisaí ajuda oficinas mecânicas a cuidar dos clientes e dos carros e a comprar peças. Entre outras coisas, ele permite:</p>
        <Lista
          itens={[
            'guardar clientes, carros e serviços e lembrar o cliente da próxima troca de óleo ou revisão pelo WhatsApp;',
            'montar ordens de serviço, também por voz, com ajuda de inteligência artificial;',
            'mandar ao cliente, por link, orçamento para aprovar, checklist para assinar, andamento do serviço e garantia;',
            'comprar peças e produtos das lojas cadastradas e pedir preço a elas pelos alertas de preço;',
            'receber avisos no celular, no computador, por e-mail ou pelo WhatsApp.'
          ]}
        />
        <p>
          Podem usar o Revisaí empresas (oficinas e lojas de autopeças) e as pessoas que trabalham nelas, desde que maiores de 18 anos e capazes. Quem age em nome de uma empresa declara que tem poderes
          para aceitar estes termos por ela. O cliente da oficina que só abre um link (orçamento, checklist, cartão de manutenção ou garantia) não precisa de conta.
        </p>
      </Secao>

      <Secao n={2} titulo="Sua conta">
        <Lista
          itens={[
            'Você entra com o seu e-mail e um código que mandamos para ele. Não passe esse código para ninguém: o Revisaí nunca pede o código por telefone ou WhatsApp.',
            'Sem conta, os dados da oficina ficam só no aparelho em que foram cadastrados. Com conta, eles são guardados nos nossos servidores e aparecem em todos os aparelhos das pessoas da oficina.',
            'Cada oficina ou loja tem um dono, que convida as outras pessoas, escolhe o papel de cada uma (gerente, mecânico, vendedor) e pode tirar o acesso de quem saiu.',
            'Mantenha os dados da empresa corretos (nome, CNPJ, WhatsApp, endereço). Você responde pelo que é feito na sua conta e pelas pessoas que você convidou.',
            `Se perceber uso que você não fez, escreva para ${e.emailContato} na hora.`
          ]}
        />
      </Secao>

      <Secao n={3} titulo="Planos, teste e pagamento das oficinas">
        <Lista
          itens={[
            `Grátis: até ${PRO.avisosGratis} avisos aos clientes e ${PRO.ordensGratis} ordens de serviço por voz por mês.`,
            `Teste do Pro: ${PRO.diasTeste} dias com tudo liberado, uma vez por oficina. No fim do teste, a oficina volta para o grátis; nada é cobrado sem que você assine.`,
            `Pro: ${formatarMoeda(PRO.preco)} por mês. As ${PRO.vagasFundador} primeiras oficinas que assinarem pagam o preço de fundador, ${formatarMoeda(PRO.precoFundador)} por mês, enquanto a assinatura delas seguir ativa.`,
            `Uso justo do Pro: até ${PRO.ordensPro} ordens de serviço por voz por mês em cada oficina.`,
            `Alertas de preço: o Pro inclui ${ALERTAS.porMesPro} alertas por mês. Durante o teste são ${ALERTAS.amostra} a cada 30 dias. Quem tem o Pro pode comprar pacotes extras: ${PACOTES_ALERTAS.map((p) => `${p.quantidade} alertas por ${formatarMoeda(p.preco)}`).join(' ou ')}.`
          ]}
        />
        <p>
          O Pro é uma assinatura mensal que se renova sozinha até você cancelar. O pagamento é feito por Pix Automático, Pix, cartão de crédito ou boleto, por meio de instituições de pagamento
          parceiras. Os dados do cartão são digitados na página da instituição de pagamento e não passam pelo Revisaí. Emitimos nota fiscal de serviço de cada pagamento.
        </p>
        <p>
          Você pode cancelar quando quiser, na sua conta. O cancelamento vale para as próximas cobranças: o Pro continua até o fim do mês já pago e não há multa. Se você contratou como consumidor, pode
          desistir em até 7 dias depois de assinar e recebe de volta tudo o que pagou (Código de Defesa do Consumidor, art. 49).
        </p>
        <p>
          Se um pagamento atrasar, os recursos do Pro ficam pausados até a regularização; os dados da oficina continuam guardados. Se os preços mudarem, avisamos com pelo menos 30 dias de antecedência,
          e você pode cancelar antes de o preço novo valer.
        </p>
      </Secao>

      <Secao n={4} titulo="Loja de peças e alertas de preço">
        <p>
          Na loja do Revisaí, a oficina compra direto das lojas de autopeças cadastradas. O Revisaí aproxima as duas, mas não é o vendedor: a venda é entre a oficina e a loja. A loja responde pelo
          produto, pelo preço, pelo estoque, pela entrega, pela nota fiscal, pela garantia e pelas trocas, como manda a lei.
        </p>
        <Lista
          itens={[
            'O pagamento é feito por Pix direto da oficina para a conta da loja. O Revisaí não recebe esse dinheiro. Confira o nome de quem recebe antes de pagar.',
            'A chave Pix da loja aparece para a oficina só depois que a loja confirma o pedido. Por segurança, uma chave nova leva 24 horas para valer, e a loja é avisada da troca.',
            'No alerta de preço, as lojas do mesmo estado veem o produto, a quantidade, o preço desejado e a cidade. O nome e o WhatsApp da oficina vão só para a loja cuja proposta ela escolher.',
            'Durante a entrega, a oficina pode acompanhar no mapa a posição do entregador, só enquanto a entrega está em andamento.',
            'Se houver problema com um pedido, fale primeiro com a loja. Se não resolver, o suporte do Revisaí ajuda a intermediar e pode tirar do ar a loja que descumprir as regras.'
          ]}
        />
      </Secao>

      <Secao n={5} titulo="Avisos e links para os clientes da oficina">
        <p>
          O Revisaí prepara a mensagem de lembrete e abre o WhatsApp da oficina; quem manda é a oficina. Os dados dos clientes são da oficina, que decide como usá-los. Por isso, a oficina é responsável
          por:
        </p>
        <Lista
          itens={[
            'ter motivo legítimo para falar com cada cliente (por exemplo, o serviço feito ou o pedido dele) e informar que usa o Revisaí, como explica o Acordo de tratamento de dados;',
            'parar de mandar mensagens para quem pedir;',
            'não usar o Revisaí para propaganda em massa, correntes ou mensagens que o cliente não espera.'
          ]}
        />
        <p>
          Quem tem o link de um orçamento, checklist, andamento ou garantia consegue abrir a página. Mande o link só ao cliente certo e cancele o link quando precisar. Quando o cliente aprova um
          orçamento ou assina um checklist, guardamos a data, a hora, o endereço IP, o navegador e um resumo do que ele viu, como prova da resposta.
        </p>
      </Secao>

      <Secao n={6} titulo="Inteligência artificial">
        <p>
          A ordem de serviço por voz e o agente no WhatsApp usam inteligência artificial (o Gemini, do Google) para passar a fala para texto e organizar a ordem. A inteligência artificial pode errar:
          confira sempre a ordem, os valores e as mensagens antes de salvar ou mandar ao cliente. O Revisaí não usa o conteúdo das oficinas para treinar modelos de inteligência artificial.
        </p>
      </Secao>

      <Secao n={7} titulo="O que não é permitido">
        <Lista
          itens={[
            'usar o Revisaí para algo ilegal, para enganar alguém ou para fazer pedidos falsos;',
            'cadastrar dados de outras pessoas sem ter o direito de usá-los;',
            'tentar entrar em contas ou dados que não são seus, sobrecarregar o serviço, copiar o conteúdo em massa ou contornar os limites dos planos;',
            'testar a segurança do Revisaí fora das regras da página Segurança;',
            'mandar vírus, programas maliciosos ou conteúdo ofensivo;',
            'revender o acesso ao Revisaí sem um acordo por escrito com a gente.'
          ]}
        />
      </Secao>

      <Secao n={8} titulo="Seus dados e os dados dos seus clientes">
        <p>
          Os dados que a oficina cadastra são dela. Usamos esses dados só para prestar o serviço, como explicam a Política de privacidade e o Acordo de tratamento de dados. A oficina pode baixar uma
          cópia dos dados em Ajustes a qualquer momento.
        </p>
        <p>
          Para os dados dos clientes da oficina, a oficina é a controladora e o Revisaí é o operador, nos termos da Lei Geral de Proteção de Dados (LGPD). O dono da oficina aceita o Acordo de
          tratamento de dados ao usar o Revisaí com conta.
        </p>
      </Secao>

      <Secao n={9} titulo="Propriedade intelectual">
        <p>
          A marca Revisaí, o app, o site, os textos e o código são de {e.razaoSocial}. Enquanto a sua conta estiver ativa, você pode usar o Revisaí para o seu trabalho, sem exclusividade e sem
          transferir esse direito a outros.
        </p>
        <p>
          O que você cadastra continua seu. Você nos autoriza a guardar, copiar e mostrar esse conteúdo só na medida necessária para prestar o serviço a você. Sugestões que você mandar podem ser usadas
          para melhorar o Revisaí, sem obrigação de pagamento.
        </p>
      </Secao>

      <Secao n={10} titulo="Disponibilidade e mudanças no serviço">
        <p>
          Trabalhamos para o Revisaí ficar no ar o tempo todo, mas podem acontecer interrupções por manutenção, por falha de fornecedores (internet, WhatsApp, hospedagem) ou por motivos fora do nosso
          controle. O app da oficina continua funcionando sem internet e sincroniza quando a conexão volta.
        </p>
        <p>
          Podemos melhorar, mudar ou tirar funções. Mudanças importantes são avisadas antes. Se tirarmos uma função paga que você usa, você pode cancelar e receber de volta o valor proporcional ao
          período que ainda não usou.
        </p>
      </Secao>

      <Secao n={11} titulo="Responsabilidade">
        <p>
          Respondemos pelos danos que causarmos, na forma da lei. Não respondemos pelos atos das lojas na venda, pelas mensagens que a oficina manda aos clientes, por falhas de serviços de terceiros que
          o Revisaí não controla, nem por uso da conta causado por quem recebeu o código de entrada de você.
        </p>
        <p>
          Quando quem contrata é uma empresa e não um consumidor, a nossa responsabilidade total fica limitada ao que a empresa pagou ao Revisaí nos 12 meses anteriores ao fato, exceto em caso de dolo
          ou culpa grave e nos casos em que a lei não permite limite. Para consumidores, vale o Código de Defesa do Consumidor.
        </p>
      </Secao>

      <Secao n={12} titulo="Suspensão e encerramento">
        <Lista
          itens={[
            'Você pode apagar a sua conta quando quiser, na tela da conta. Se você for o único dono de uma oficina ou loja, apague a empresa antes ou passe o dono para outra pessoa.',
            'Quando o dono pede para apagar a oficina, ninguém mais acessa os dados dela, e eles são apagados de vez em 30 dias. Dentro desse prazo, o dono pode desistir.',
            'Podemos suspender ou encerrar uma conta que descumpra estes termos, que traga risco a outras pessoas, que fique sem pagar ou por ordem da Justiça. Sempre que possível, avisamos antes e damos prazo para baixar os dados.'
          ]}
        />
      </Secao>

      <Secao n={13} titulo="Mudanças nestes termos">
        <p>
          Quando estes termos mudarem, avisamos no app ou por e-mail com pelo menos 15 dias de antecedência, salvo mudanças exigidas por lei. Nas mudanças importantes, pedimos que você aceite a versão
          nova. Se não concordar, você pode cancelar e apagar a conta.
        </p>
      </Secao>

      <Secao n={14} titulo="Comunicações, lei e foro">
        <p>
          Falamos com você pelo e-mail da conta, pelos avisos do app e pelo WhatsApp. Para falar com a gente, escreva para {e.emailContato} ou use a ajuda dentro do app.
        </p>
        <p>
          Estes termos seguem as leis do Brasil. Se você for consumidor, vale o foro do seu domicílio. Nos demais casos, fica eleito o foro {e.foro}. Antes de ir à Justiça, procure o nosso suporte: a
          maioria dos problemas se resolve assim.
        </p>
      </Secao>
    </Documento>
  );
}
