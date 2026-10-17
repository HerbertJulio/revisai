import type { Metadata } from 'next';
import Link from 'next/link';
import { ALERTAS } from '@/lib/alertas-dados';
import { dadosDaEmpresa } from '@/lib/avisos/empresa';
import { formatarMoeda } from '@/lib/formatos';
import { DIAS_IMPULSO, PLANOS_FORNECEDOR, PRECO_IMPULSO } from '@/lib/planos-fornecedor';
import { Documento, Lista, Secao } from '../termos/documento';

// Contrato das lojas (fornecedores) que vendem pelo Revisaí. Revisado por advogado: pendente.
// Os valores vêm de lib/planos-fornecedor; ao mudar o texto de verdade, mude também a versão (../termos/versao).

export const metadata: Metadata = {
  title: 'Contrato das lojas',
  description: 'As regras para lojas de autopeças venderem às oficinas pelo Revisaí: cadastro, produtos, pedidos, Pix, planos, comissão, dados pessoais e encerramento.'
};

const link = 'font-semibold text-caneta underline';

export default function ContratoLojas() {
  const e = dadosDaEmpresa();
  const { vitrine, destaque } = PLANOS_FORNECEDOR;
  const impulsos = DIAS_IMPULSO.map((d) => `${d} dias (${formatarMoeda(PRECO_IMPULSO[d])})`);
  return (
    <Documento
      titulo="Contrato das lojas"
      atual="/contrato-lojas"
      resumo={
        <>
          <p>
            Este contrato vale entre {e.razaoSocial} (“Revisaí”) e a empresa que cadastra uma loja de autopeças para vender às oficinas pelo Revisaí (“loja”). Quem aceita em nome da loja declara ter
            poderes para isso.
          </p>
          <p>
            Ele completa os{' '}
            <Link href="/termos" className={link}>
              Termos de uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className={link}>
              Política de privacidade
            </Link>
            , que também valem para a loja. Se houver conflito, vale este contrato.
          </p>
        </>
      }
    >
      <Secao n={1} titulo="O que o Revisaí oferece">
        <p>
          O Revisaí dá à loja um espaço para mostrar produtos às oficinas, receber pedidos, responder alertas de preço, fazer promoções e acompanhar a demanda da região, pelo painel da loja. O Revisaí
          aproxima a loja e a oficina, mas não compra nem vende os produtos e não recebe o pagamento deles: a venda é entre a loja e a oficina.
        </p>
      </Secao>

      <Secao n={2} titulo="Cadastro e verificação">
        <Lista
          itens={[
            'A loja informa dados corretos e atuais: razão social, CNPJ, endereço, WhatsApp, e-mail e chave Pix em nome da própria loja.',
            'A equipe do Revisaí confere o cadastro antes de a loja aparecer e pode pedir documentos, recusar ou suspender cadastros com dados falsos ou incompletos.',
            'O dono da loja convida os vendedores e responde pelo que eles fazem no painel. Ao sair alguém, o dono tira o acesso dessa pessoa.'
          ]}
        />
      </Secao>

      <Secao n={3} titulo="Produtos, preços e estoque">
        <Lista
          itens={[
            'Descrição, fotos, ficha técnica, aplicações (em que carros a peça serve), preço e estoque devem ser verdadeiros e atualizados. A loja precisa ter o direito de usar as fotos e textos que publica.',
            'Só podem ser anunciados produtos novos (ou usados, se isso estiver claro no anúncio), originais ou de reposição legítima, com as certificações exigidas por lei. É proibido anunciar produto falsificado, roubado, adulterado ou de venda proibida.',
            'O preço que vale é o que estava no anúncio quando a oficina fez o pedido, incluindo as promoções em vigor.',
            'O Revisaí pode tirar do ar anúncios que descumpram estas regras ou recebam reclamações fundadas.'
          ]}
        />
      </Secao>

      <Secao n={4} titulo="Pedidos, entrega e pós-venda">
        <Lista
          itens={[
            'A loja confirma ou cancela cada pedido pelo painel o quanto antes e só confirma o que tem para entregar. O cancelamento precisa de motivo, que a oficina vê.',
            'A loja entrega no prazo que informou. O link da entrega mostra à oficina a posição do entregador enquanto a entrega está em andamento; a loja avisa o entregador disso.',
            'A loja emite a nota fiscal da venda para a oficina e cumpre as obrigações fiscais dela.',
            'Garantia, troca e devolução seguem a lei e as regras que a loja informar no anúncio, e são feitas pelo painel quando a função estiver disponível.'
          ]}
        />
      </Secao>

      <Secao n={5} titulo="Pagamento das oficinas e chave Pix">
        <Lista
          itens={[
            'A oficina paga por Pix direto para a conta da loja, com o código que o Revisaí monta a partir da chave cadastrada. A loja confere o recebimento no banco e marca no painel.',
            'Por segurança, a chave Pix só pode ser trocada logo depois de entrar na conta, a troca leva 24 horas para valer e a loja é avisada pelo WhatsApp. Se não reconhecer a troca, a loja deve cancelá-la e avisar o Revisaí na hora.',
            'A loja cuida da segurança do acesso ao painel e do e-mail da conta. O Revisaí não responde por pagamentos feitos para uma chave que a própria loja cadastrou.'
          ]}
        />
      </Secao>

      <Secao n={6} titulo="Alertas de preço">
        <p>
          As lojas do estado da oficina que vendem a categoria recebem o alerta com o produto, a quantidade, o preço desejado e a cidade, sem o nome da oficina. A loja tem {ALERTAS.horasParaResponder}{' '}
          horas para aceitar, fazer uma contraproposta ou recusar. A proposta enviada vale pelo prazo do alerta; se a oficina escolher a proposta, ela vira um pedido com o preço e a quantidade mínima
          propostos.
        </p>
      </Secao>

      <Secao n={7} titulo="Planos, comissão e cobrança">
        <Lista
          itens={[
            `${vitrine.nome}: ${vitrine.mensalidade === 0 ? 'sem mensalidade' : `${formatarMoeda(vitrine.mensalidade)} por mês`}, com comissão de ${vitrine.comissao}% sobre os pedidos entregues.`,
            `${destaque.nome}: ${formatarMoeda(destaque.mensalidade)} por mês, com comissão de ${destaque.comissao}% sobre os pedidos entregues. A loja aparece antes das outras, com o selo Loja destaque, e ganha um impulso de 7 dias por mês.`,
            `Impulso: um produto no topo da categoria, com o selo Patrocinado, por ${impulsos.slice(0, -1).join(', ')} ou ${impulsos[impulsos.length - 1]}.`
          ]}
        />
        <p>
          A comissão é calculada sobre o valor dos produtos de cada pedido marcado como entregue, sem o frete. Pedido cancelado ou devolvido não paga comissão; se já tiver sido cobrada, o valor é
          descontado na cobrança seguinte. A equipe do Revisaí pode combinar por escrito outro valor com a loja; nesse caso, vale o combinado.
        </p>
        <p>
          A cobrança é mensal, com a mensalidade do plano, as comissões do mês anterior e os impulsos contratados, e é paga por Pix ou outra forma oferecida no painel. Emitimos nota fiscal de serviço.
          Atraso acima de 15 dias pode tirar a loja da vitrine até o pagamento, com multa de 2% e juros de 1% ao mês sobre o valor em atraso.
        </p>
        <p>
          Pedidos que começaram pelo Revisaí devem ser concluídos pelo Revisaí: combinar com a oficina fechar fora do app para não pagar a comissão descumpre este contrato. Mudanças de preço são avisadas
          com 30 dias de antecedência.
        </p>
      </Secao>

      <Secao n={8} titulo="Dados pessoais">
        <p>
          Com o pedido, a loja recebe o nome, o WhatsApp e o endereço da oficina e, às vezes, o nome de quem vai receber. A partir daí, a loja é controladora desses dados para fazer a venda e cumprir a
          lei, e se compromete a:
        </p>
        <Lista
          itens={[
            'usar os dados só para atender o pedido, entregar, emitir a nota, dar garantia e cumprir obrigações legais;',
            'não usar os dados para propaganda nem passar a terceiros sem base legal;',
            'proteger os dados e apagar o que não precisar mais;',
            'avisar o Revisaí em até 48 horas de qualquer incidente de segurança com dados que recebeu pelo Revisaí.'
          ]}
        />
        <p>Os dados das pessoas da loja são tratados pelo Revisaí como explica a Política de privacidade.</p>
      </Secao>

      <Secao n={9} titulo="Marca e conteúdo da loja">
        <p>
          A loja autoriza o Revisaí a mostrar o nome, a marca, as fotos e as descrições dos produtos dentro do Revisaí e em divulgações do próprio Revisaí que apresentem a loja, enquanto este contrato
          valer. A loja garante que tem os direitos sobre esse conteúdo.
        </p>
      </Secao>

      <Secao n={10} titulo="O que o Revisaí faz">
        <Lista
          itens={[
            'mantém a plataforma funcionando com cuidado e segurança, sem garantia de funcionamento sem interrupções;',
            'mostra os produtos com critérios claros: relevância para o carro e para a busca, lojas do plano Destaque antes e produtos impulsionados com o selo Patrocinado;',
            'dá suporte à loja e ajuda a resolver problemas com as oficinas;',
            'avisa com antecedência as mudanças que afetam a loja.'
          ]}
        />
      </Secao>

      <Secao n={11} titulo="Responsabilidade">
        <p>
          A loja responde pelos produtos, pela venda, pela entrega, pela nota fiscal, pela garantia e pelas reclamações das oficinas e de terceiros sobre eles, e ressarce o Revisaí se ele for cobrado
          por algo que é responsabilidade da loja. A responsabilidade total do Revisaí perante a loja fica limitada ao que a loja pagou ao Revisaí nos 12 meses anteriores ao fato, exceto em caso de
          dolo ou culpa grave.
        </p>
      </Secao>

      <Secao n={12} titulo="Prazo e encerramento">
        <Lista
          itens={[
            'Este contrato vale por prazo indeterminado, a partir do aceite.',
            'A loja pode sair quando quiser, pelo painel ou pelo suporte. O Revisaí pode encerrar o contrato com aviso de 30 dias.',
            'Qualquer parte pode encerrar na hora se a outra descumprir este contrato de forma grave, como fraude, venda de produto proibido ou falta de pagamento.',
            'Ao encerrar, os anúncios saem do ar, os pedidos em andamento são concluídos e os valores devidos até a data continuam devidos.'
          ]}
        />
      </Secao>

      <Secao n={13} titulo="Confidencialidade, mudanças e foro">
        <p>
          As partes mantêm em sigilo as informações da outra que não forem públicas, como valores combinados e dados de vendas. Mudanças neste contrato são avisadas com 30 dias de antecedência pelo
          painel ou por e-mail, e a loja aceita a versão nova para continuar vendendo.
        </p>
        <p>Este contrato segue as leis do Brasil. Fica eleito o foro {e.foro} para resolver qualquer questão sobre ele.</p>
      </Secao>
    </Documento>
  );
}
