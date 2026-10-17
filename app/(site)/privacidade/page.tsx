import type { Metadata } from 'next';
import Link from 'next/link';
import { dadosDaEmpresa } from '@/lib/avisos/empresa';
import { FormInteresse } from '@/components/site/FormInteresse';
import { Documento, Lista, Secao, Tratamento } from '../termos/documento';

// Política de privacidade do Revisaí. Revisado por advogado: pendente.
// Os prazos de guarda seguem public.rotina_diaria() e public.plataforma_rotina(); ao mudar um,
// mude o outro. Ao mudar o texto de verdade, mude também a versão (../termos/versao).

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description: 'Quais dados pessoais o Revisaí trata, para quê, com quem compartilha, por quanto tempo guarda e como pedir para ver, corrigir ou apagar os seus dados.'
};

const link = 'font-semibold text-caneta underline';

const OPERADORES = [
  { nome: 'Supabase', faz: 'banco de dados, login e arquivos', onde: 'servidores em São Paulo (Brasil); empresa nos Estados Unidos' },
  { nome: 'Vercel', faz: 'hospedagem do site e do app', onde: 'servidores do app em São Paulo (Brasil) e rede mundial de entrega; empresa nos Estados Unidos' },
  { nome: 'Google (Gemini)', faz: 'inteligência artificial da ordem por voz e do agente no WhatsApp', onde: 'Estados Unidos e outros países' },
  { nome: 'Meta (WhatsApp Business)', faz: 'agente no WhatsApp e avisos pelo WhatsApp', onde: 'Estados Unidos e outros países' },
  { nome: 'Resend', faz: 'envio dos e-mails de aviso', onde: 'Estados Unidos' },
  { nome: 'Serviços de push dos navegadores (Google, Apple, Mozilla, Microsoft)', faz: 'entrega dos avisos no celular e no computador, cifrados de ponta a ponta', onde: 'Estados Unidos e outros países' },
  { nome: 'Instituições de pagamento (Asaas, Efí)', faz: 'cobrança do Pro e das lojas e nota fiscal', onde: 'Brasil' },
  { nome: 'GitHub', faz: 'guarda das cópias de segurança do banco, cifradas antes de sair', onde: 'Estados Unidos' },
  { nome: 'OpenStreetMap', faz: 'mapa da entrega (o navegador baixa o mapa direto de lá)', onde: 'Reino Unido e outros países' }
];

export default function Privacidade() {
  const e = dadosDaEmpresa();
  return (
    <Documento
      titulo="Política de privacidade"
      atual="/privacidade"
      resumo={
        <>
          <p>
            Esta política explica quais dados pessoais o Revisaí trata, para quê, com quem compartilha, por quanto tempo guarda e como você exerce os seus direitos, de acordo com a Lei Geral de Proteção
            de Dados Pessoais (LGPD, Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014).
          </p>
          <p>Em poucas palavras: usamos os dados só para fazer o Revisaí funcionar, não vendemos dados e não mostramos anúncios.</p>
        </>
      }
    >
      <Secao n={1} titulo="Quem cuida dos seus dados">
        <p>
          O controlador dos dados pessoais tratados pelo Revisaí é {e.razaoSocial}, CNPJ {e.cnpj}, com endereço em {e.endereco}.
        </p>
        <p>
          Encarregado pelo tratamento de dados pessoais: {e.encarregado}. Para falar com o encarregado, escreva para {e.emailPrivacidade} ou use o formulário no fim desta página.
        </p>
        <p>
          Os dados dos clientes das oficinas (nome, telefone, carro, placa, serviços) são da oficina, que é a controladora deles. Nesse caso, o Revisaí trata os dados como operador, seguindo as
          instruções da oficina, como explica o{' '}
          <Link href="/tratamento-de-dados" className={link}>
            Acordo de tratamento de dados
          </Link>
          . Se você é cliente de uma oficina, fale primeiro com ela; nós ajudamos no que for preciso.
        </p>
      </Secao>

      <Secao n={2} titulo="A quem esta política se aplica">
        <Lista
          itens={[
            'donos e equipes das oficinas e das lojas de autopeças que têm conta no Revisaí;',
            'clientes das oficinas, quando abrem um link (orçamento, checklist, andamento, garantia, cartão de manutenção);',
            'entregadores das lojas, quando usam o link da entrega;',
            'quem visita o site ou preenche um formulário de contato.'
          ]}
        />
      </Secao>

      <Secao n={3} titulo="Que dados tratamos, para quê e com qual base legal">
        <div className="flex flex-col gap-3">
          <Tratamento
            titulo="Conta e entrada"
            dados="e-mail, nome, papel na oficina ou na loja, o código de entrada (que vale por pouco tempo) e, para a equipe do Revisaí, o segundo fator de autenticação."
            para="criar a conta, deixar você entrar e proteger o acesso."
            base="execução do contrato (LGPD, art. 7º, V)."
            prazo="enquanto a conta existir."
          />
          <Tratamento
            titulo="Registros de acesso"
            dados="endereço IP, porta, data e hora, a página ou função usada e o navegador."
            para="segurança, investigação de abusos e cumprimento do Marco Civil da Internet."
            base="cumprimento de obrigação legal (LGPD, art. 7º, II; Marco Civil, art. 15)."
            prazo="6 meses."
          />
          <Tratamento
            titulo="Dados da oficina e da loja"
            dados="nome, CNPJ, WhatsApp, e-mail, endereço, cidade e estado da empresa, plano contratado e, das lojas, a chave Pix e as chaves anteriores (para tirar dúvidas sobre pagamentos)."
            para="prestar o serviço, mostrar a loja às oficinas, montar o código Pix dos pedidos e cobrar o plano."
            base="execução do contrato (art. 7º, V)."
            prazo="enquanto a conta existir; depois de pedido para apagar a oficina, 30 dias."
          />
          <Tratamento
            titulo="Clientes, carros e serviços da oficina"
            dados="o que a oficina cadastra: nome e telefone do cliente, placa, modelo e quilometragem do carro, serviços, valores, fotos, ordens de serviço, orçamentos, checklists e os lembretes mandados."
            para="guardar e sincronizar os dados entre os aparelhos da oficina e gerar lembretes, mensagens e links. Sem conta, esses dados ficam só no aparelho e não vêm para os nossos servidores."
            base="tratados em nome da oficina, que é a controladora e define a base legal (art. 39)."
            prazo="enquanto a oficina usar o Revisaí; itens apagados no app são removidos de vez em 180 dias."
          />
          <Tratamento
            titulo="Respostas pelos links"
            dados="a resposta (aprovação, recusa ou assinatura), o nome digitado, data e hora, endereço IP, navegador e um resumo do conteúdo que a pessoa viu."
            para="provar a resposta do cliente à oficina."
            base="exercício regular de direitos (art. 7º, VI), em nome da oficina."
            prazo="enquanto a oficina guardar o serviço; o link deixa de abrir no vencimento e é apagado 30 dias depois."
          />
          <Tratamento
            titulo="Pedidos, alertas de preço e entregas"
            dados="nome, WhatsApp, endereço e cidade da oficina, os produtos e as quantidades; no alerta, o produto, a quantidade, o preço desejado e a cidade; na entrega, a posição do celular do entregador."
            para="levar o pedido à loja, receber propostas das lojas e deixar a oficina acompanhar a entrega."
            base="execução do contrato (art. 7º, V); para a posição do entregador, legítimo interesse da loja e da oficina em acompanhar a entrega (art. 7º, IX)."
            prazo="pedidos, 5 anos (obrigações fiscais e defesa de direitos); a posição do entregador é apagada quando a entrega termina, e o que sobrar, em até 3 dias."
          />
          <Tratamento
            titulo="Ordem por voz e agente no WhatsApp"
            dados="o áudio, as fotos e o texto que a oficina manda para montar a ordem de serviço."
            para="passar a fala para texto e preencher a ordem com inteligência artificial."
            base="em nome da oficina (art. 39) e execução do contrato com ela (art. 7º, V)."
            prazo="o áudio não fica guardado depois de transcrito; os rascunhos do agente são apagados quando a oficina confirma ou descarta, ou depois de 30 dias parados."
          />
          <Tratamento
            titulo="Avisos (push, e-mail e WhatsApp)"
            dados="o endereço que o navegador cria para receber avisos, as chaves para cifrar o aviso, o tipo de navegador, as suas preferências de aviso e o próprio aviso enquanto ele sai."
            para="avisar você de pedidos, propostas, respostas de clientes e do suporte, pelos canais que você deixou ligados."
            base="execução do contrato (art. 7º, V). Você desliga cada canal ou tipo de aviso quando quiser."
            prazo="o aviso, 30 dias; o navegador inscrito, até você desligar ou 180 dias sem receber nada."
          />
          <Tratamento
            titulo="Pagamentos e notas fiscais"
            dados="nome ou razão social, CPF ou CNPJ, e-mail, telefone, a forma de pagamento escolhida e a situação de cada cobrança. Os dados do cartão ficam só com a instituição de pagamento."
            para="cobrar o plano, emitir a nota fiscal e manter a contabilidade."
            base="execução do contrato (art. 7º, V) e cumprimento de obrigação legal (art. 7º, II)."
            prazo="5 anos, como pede a lei fiscal."
          />
          <Tratamento
            titulo="Suporte e formulários do site"
            dados="nome, empresa, WhatsApp ou e-mail, cidade e a mensagem."
            para="responder o seu pedido de ajuda ou de contato."
            base="execução do contrato (art. 7º, V) para quem tem conta; consentimento (art. 7º, I) nos formulários do site, que você pode retirar quando quiser."
            prazo="pedidos de ajuda, enquanto a conta existir; contatos do site, até 2 anos depois do atendimento."
          />
          <Tratamento
            titulo="Erros técnicos"
            dados="a mensagem do erro, a página (sem códigos, números e e-mails, que são apagados antes de guardar), a versão do app e o tipo de navegador."
            para="encontrar e corrigir falhas."
            base="legítimo interesse em manter o serviço funcionando (art. 7º, IX)."
            prazo="30 dias."
          />
          <Tratamento
            titulo="Aceite dos documentos"
            dados="qual documento e versão você aceitou, data e hora, endereço IP e navegador."
            para="provar o aceite destes documentos."
            base="exercício regular de direitos (art. 7º, VI)."
            prazo="enquanto a conta existir e, depois, pelo prazo em que alguém ainda pode questionar o aceite na Justiça."
          />
        </div>
        <p>
          A previsão de compras para as lojas só é enviada se a oficina ligar essa opção e vai como soma da região (tipo de produto e quantidade), sem cliente, placa ou nome da oficina. O cartão de
          manutenção que a oficina manda ao cliente leva os dados dentro do próprio link, depois do sinal #, parte que o navegador não envia ao servidor.
        </p>
        <p>
          Não tomamos decisões só por meios automatizados que afetem os seus interesses. A inteligência artificial apenas ajuda a oficina a montar a ordem; quem decide e confere é a oficina.
        </p>
      </Secao>

      <Secao n={4} titulo="Dados sensíveis, crianças e adolescentes">
        <p>
          Não pedimos dados sensíveis (como saúde, religião ou origem racial). Não coloque esse tipo de dado nas observações e mensagens. O Revisaí é feito para empresas e pessoas maiores de 18 anos e
          não é dirigido a crianças e adolescentes. Se percebermos dados de menores tratados sem base legal, apagamos.
        </p>
      </Secao>

      <Secao n={5} titulo="Com quem compartilhamos">
        <Lista
          itens={[
            'Com a loja, quando a oficina manda um pedido ou escolhe uma proposta: nome, WhatsApp, endereço da oficina e os produtos.',
            'Com a oficina: os dados públicos da loja e, depois que a loja confirma o pedido, a chave Pix dela.',
            'Com o cliente da oficina: o que a oficina escolher mandar pelo link.',
            'Com as autoridades, quando a lei ou uma ordem da Justiça exigir.',
            'Com quem vier a controlar o Revisaí numa venda ou fusão da empresa, que terá de seguir esta política.'
          ]}
        />
        <p>Também usamos fornecedores que tratam dados em nosso nome (operadores), só para o que está abaixo:</p>
        <div className="overflow-x-auto rounded-[16px] ring-1 ring-linha">
          <table className="w-full min-w-[34rem] text-left text-[15px]">
            <thead className="bg-papel-2 text-tinta">
              <tr>
                <th className="px-3 py-2 font-semibold">Fornecedor</th>
                <th className="px-3 py-2 font-semibold">Para quê</th>
                <th className="px-3 py-2 font-semibold">Onde</th>
              </tr>
            </thead>
            <tbody>
              {OPERADORES.map((o) => (
                <tr key={o.nome} className="border-t border-linha align-top">
                  <td className="px-3 py-2 font-semibold text-tinta">{o.nome}</td>
                  <td className="px-3 py-2">{o.faz}</td>
                  <td className="px-3 py-2">{o.onde}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Não vendemos dados pessoais, não mostramos anúncios e não usamos os dados para criar perfis de propaganda.</p>
      </Secao>

      <Secao n={6} titulo="Transferência para outros países">
        <p>
          Alguns dos fornecedores acima tratam dados fora do Brasil, principalmente nos Estados Unidos. Essas transferências seguem o art. 33 da LGPD e a Resolução CD/ANPD nº 19/2024: usamos as
          cláusulas-padrão contratuais aprovadas pela ANPD ou garantias equivalentes, e, quando for o caso, a transferência é necessária para cumprir o contrato que você fez com a gente (art. 33, IX).
        </p>
        <p>
          Os dados viajam cifrados (HTTPS). Os avisos de push são cifrados de ponta a ponta, e as cópias de segurança são cifradas antes de sair dos nossos servidores. Para saber mais sobre as garantias
          de uma transferência, escreva para {e.emailPrivacidade}.
        </p>
      </Secao>

      <Secao n={7} titulo="Por quanto tempo guardamos">
        <p>Além dos prazos de cada tratamento, acima:</p>
        <Lista
          itens={[
            'Ao apagar a sua conta, os seus acessos somem na hora. Se você for o único dono de uma oficina ou loja, ela precisa ser apagada ou passada a outra pessoa antes.',
            'Ao pedir para apagar a oficina, ninguém mais acessa os dados e eles são apagados de vez em 30 dias.',
            'Convites não aceitos são apagados 30 dias depois de vencer.',
            'As ações da equipe do Revisaí nos dados ficam registradas por 5 anos, para auditoria.',
            'As cópias de segurança do banco são cifradas e guardadas por até 90 dias. Um dado apagado pode continuar nelas até a cópia vencer, sem uso.'
          ]}
        />
        <p>
          Depois dos prazos, os dados são apagados ou tornados anônimos. Podemos guardar por mais tempo o que a lei exigir ou o que for preciso para nos defender em um processo (LGPD, art. 16).
        </p>
      </Secao>

      <Secao n={8} titulo="Seus direitos">
        <p>Pela LGPD (art. 18), você pode pedir, a qualquer momento:</p>
        <Lista
          itens={[
            'a confirmação de que tratamos dados seus e o acesso a eles;',
            'a correção de dados incompletos, errados ou desatualizados;',
            'a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desacordo com a lei;',
            'a portabilidade dos dados a outro fornecedor;',
            'a eliminação dos dados tratados com o seu consentimento e a retirada do consentimento;',
            'a informação sobre com quem compartilhamos os seus dados e sobre a possibilidade de não consentir e o que isso implica;',
            'a oposição a um tratamento feito com base no legítimo interesse, se ele descumprir a lei;',
            'a revisão de decisões tomadas só por meios automatizados (art. 20).'
          ]}
        />
        <p>
          Muita coisa você faz sozinho no app: corrigir dados, desligar avisos, baixar os dados da oficina e apagar a conta. Para o resto, escreva para {e.emailPrivacidade} ou use o formulário abaixo.
          Podemos pedir informações para confirmar que o pedido é seu. Respondemos em até 15 dias. Se o pedido for sobre dados que uma oficina cadastrou, passamos à oficina, que é quem decide, e
          ajudamos no que for preciso.
        </p>
        <p>
          Se achar que não resolvemos, você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd, e aos órgãos de defesa do consumidor.
        </p>
      </Secao>

      <Secao n={9} titulo="Segurança">
        <p>
          Protegemos os dados com conexão cifrada, controle de acesso por conta em cada tabela do banco, segundo fator obrigatório para a equipe do Revisaí, registro das ações da equipe, limites contra
          abuso, cópias de segurança cifradas e testadas e o mínimo de dados possível. Os detalhes estão na página{' '}
          <Link href="/seguranca" className={link}>
            Segurança
          </Link>
          .
        </p>
        <p>
          Se acontecer um incidente de segurança que possa trazer risco ou dano relevante, avisamos a ANPD e as pessoas afetadas nos prazos da Resolução CD/ANPD nº 15/2024 e contamos o que aconteceu e o
          que foi feito.
        </p>
      </Secao>

      <Secao n={10} titulo="Cookies e o que fica no seu aparelho">
        <p>
          Usamos só o necessário para o Revisaí funcionar: os cookies de entrada, que mantêm você conectado, e o armazenamento do navegador, onde o app guarda os dados da oficina para funcionar sem
          internet e lembra as suas escolhas. O service worker do app mostra os avisos. Não usamos cookies de propaganda nem de medição de audiência de terceiros.
        </p>
        <p>
          Você pode apagar os cookies e os dados do site no seu navegador. Com isso, você sai da conta e, sem conta, os dados que estavam só naquele aparelho se perdem; por isso, baixe uma cópia antes em
          Ajustes.
        </p>
      </Secao>

      <Secao n={11} titulo="Mudanças nesta política">
        <p>
          A data da versão fica no topo da página. Quando houver mudança importante, avisamos no app ou por e-mail antes de ela valer e, se for o caso, pedimos que você leia e aceite a versão nova.
        </p>
      </Secao>

      <section className="rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
        <h2 className="text-[21px]">Fale com o encarregado</h2>
        <p className="mt-1 mb-5 text-tinta-2">Pedidos sobre os seus dados ou qualquer dúvida sobre privacidade.</p>
        <FormInteresse tipo="contato" origem="privacidade" comCidade={false} mensagem="O que você precisa" botao="Enviar" consentimento="Concordo em receber a resposta pelo WhatsApp ou e-mail." />
      </section>
    </Documento>
  );
}
