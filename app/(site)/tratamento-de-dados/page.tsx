import type { Metadata } from 'next';
import Link from 'next/link';
import { dadosDaEmpresa } from '@/lib/avisos/empresa';
import { Documento, Lista, Secao } from '../termos/documento';

// Acordo de tratamento de dados entre a oficina (controladora) e o Revisaí (operador), sobre os
// dados dos clientes da oficina. Revisado por advogado: pendente.
// Ao mudar o texto de verdade, mude também a versão (../termos/versao).

export const metadata: Metadata = {
  title: 'Acordo de tratamento de dados',
  description: 'Como o Revisaí trata, em nome da oficina, os dados dos clientes dela: papéis na LGPD, segurança, suboperadores, incidentes, direitos dos titulares e fim do tratamento.'
};

const link = 'font-semibold text-caneta underline';

const SUBOPERADORES = [
  'Supabase: banco de dados, login e arquivos (servidores em São Paulo; empresa nos Estados Unidos);',
  'Vercel: hospedagem do app (servidores do app em São Paulo e rede mundial de entrega; empresa nos Estados Unidos);',
  'Google (Gemini): transcrição e organização da ordem de serviço por voz e do agente no WhatsApp (Estados Unidos e outros países);',
  'Meta (WhatsApp Business): agente no WhatsApp, quando a oficina usa (Estados Unidos e outros países);',
  'Resend: e-mails de aviso às pessoas da oficina, que podem citar o nome do cliente (Estados Unidos);',
  'serviços de push dos navegadores (Google, Apple, Mozilla, Microsoft): entregam os avisos cifrados de ponta a ponta, sem acesso ao conteúdo (Estados Unidos e outros países);',
  'GitHub: guarda das cópias de segurança do banco, cifradas antes de sair (Estados Unidos).'
];

export default function TratamentoDeDados() {
  const e = dadosDaEmpresa();
  return (
    <Documento
      titulo="Acordo de tratamento de dados"
      atual="/tratamento-de-dados"
      resumo={
        <>
          <p>
            Este acordo vale entre a oficina que usa o Revisaí com conta (“oficina”) e {e.razaoSocial} (“Revisaí”), e faz parte dos{' '}
            <Link href="/termos" className={link}>
              Termos de uso
            </Link>
            . Ele trata dos dados pessoais dos clientes da oficina e dos carros deles, que o Revisaí guarda e processa para a oficina, conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº
            13.709/2018). O dono da oficina aceita este acordo em nome dela.
          </p>
        </>
      }
    >
      <Secao n={1} titulo="Papéis">
        <p>
          A oficina é a controladora dos dados dos seus clientes: é ela quem decide quais dados cadastrar e para quê (LGPD, art. 5º, VI). O Revisaí é o operador: trata esses dados em nome da oficina e
          segundo as instruções dela (art. 5º, VII, e art. 39).
        </p>
        <p>
          Os dados das pessoas que usam o Revisaí (o dono e a equipe da oficina) não fazem parte deste acordo: deles o Revisaí é controlador, como explica a{' '}
          <Link href="/privacidade" className={link}>
            Política de privacidade
          </Link>
          .
        </p>
      </Secao>

      <Secao n={2} titulo="Dados e titulares">
        <Lista
          itens={[
            'Titulares: os clientes da oficina e as pessoas que respondem os links que a oficina manda.',
            'Dados: nome, telefone e WhatsApp, e-mail e endereço quando cadastrados, placa, marca, modelo, ano e quilometragem do carro, serviços, valores, fotos, ordens de serviço, orçamentos, checklists, garantias, os lembretes mandados e as respostas pelos links (com data, hora, endereço IP e navegador).',
            'O áudio da ordem por voz é processado só para virar texto e não fica guardado.',
            'Não é esperado nenhum dado sensível. A oficina não deve cadastrar dados de saúde, religião, origem racial ou outros dados sensíveis nos campos livres.'
          ]}
        />
      </Secao>

      <Secao n={3} titulo="O que o Revisaí faz com os dados">
        <p>
          O Revisaí trata os dados só para prestar o serviço à oficina: guardar, sincronizar entre os aparelhos das pessoas da oficina, mostrar no app, montar lembretes, mensagens, ordens e links,
          transcrever a ordem por voz, mandar avisos às pessoas da oficina, fazer cópias de segurança e dar suporte quando a oficina pedir.
        </p>
        <p>
          As instruções da oficina são estes documentos e o que a oficina faz no app. O Revisaí não usa os dados para fins próprios, não vende e não compartilha com terceiros fora do que está aqui. A
          única exceção são números agregados e anônimos, que não identificam ninguém (por exemplo, a previsão de compras da região, só quando a oficina liga essa opção), e o que a lei obrigar.
        </p>
      </Secao>

      <Secao n={4} titulo="Obrigações da oficina">
        <Lista
          itens={[
            'ter base legal para cada uso dos dados dos clientes, como a execução do serviço contratado pelo cliente ou o legítimo interesse em lembrar a próxima manutenção, respeitando quem pedir para não receber mais mensagens;',
            'informar aos clientes como usa os dados deles e que usa o Revisaí como operador;',
            'cadastrar só os dados necessários e mantê-los corretos;',
            'dar acesso só a quem trabalha na oficina e tirar o acesso de quem sair;',
            'responder aos pedidos dos clientes sobre os dados deles, com a ajuda do Revisaí.'
          ]}
        />
      </Secao>

      <Secao n={5} titulo="Obrigações do Revisaí">
        <Lista
          itens={[
            'tratar os dados só conforme as instruções da oficina e avisar se uma instrução parecer contrária à lei;',
            'manter sigilo: só pessoas autorizadas da equipe do Revisaí acessam os dados, quando necessário para suporte, segurança ou obrigação legal, com segundo fator de autenticação e com cada ação registrada;',
            'manter as medidas de segurança descritas na página Segurança, como cifragem na transmissão, controle de acesso por oficina em cada tabela, cópias de segurança cifradas e testadas e limites contra abuso (LGPD, art. 46);',
            'ajudar a oficina a atender os titulares e a fazer o relatório de impacto, quando ela precisar, com as informações que tiver;',
            'manter registro das operações de tratamento (art. 37).'
          ]}
        />
      </Secao>

      <Secao n={6} titulo="Suboperadores">
        <p>A oficina autoriza o Revisaí a usar os seguintes fornecedores, que tratam os dados só para as funções indicadas e com obrigações de proteção equivalentes às deste acordo:</p>
        <Lista itens={SUBOPERADORES} />
        <p>
          O Revisaí avisa a oficina com pelo menos 15 dias de antecedência antes de incluir ou trocar um suboperador. Se a oficina não concordar, pode encerrar o uso do Revisaí antes da mudança, com a
          devolução proporcional do que pagou e não usou.
        </p>
      </Secao>

      <Secao n={7} titulo="Transferência para outros países">
        <p>
          Alguns suboperadores tratam dados fora do Brasil, principalmente nos Estados Unidos. Essas transferências seguem o art. 33 da LGPD e a Resolução CD/ANPD nº 19/2024, com as cláusulas-padrão
          contratuais aprovadas pela ANPD ou garantias equivalentes. Os dados viajam cifrados, e as cópias de segurança são cifradas antes de sair.
        </p>
      </Secao>

      <Secao n={8} titulo="Incidentes de segurança">
        <p>
          Se o Revisaí souber de um incidente de segurança que atinja os dados da oficina, avisa o dono da oficina sem demora e em até 48 horas, com o que já souber: o que aconteceu, quais dados e
          quantos titulares foram afetados, os riscos, as medidas tomadas e as que a oficina pode tomar. As informações que faltarem vêm assim que forem apuradas.
        </p>
        <p>
          Cabe à oficina, como controladora, comunicar a ANPD e os titulares quando o incidente puder trazer risco ou dano relevante, no prazo de 3 dias úteis da Resolução CD/ANPD nº 15/2024. O
          Revisaí ajuda com as informações técnicas e guarda o registro do incidente por pelo menos 5 anos.
        </p>
      </Secao>

      <Secao n={9} titulo="Pedidos dos titulares">
        <p>
          Se um cliente da oficina pedir ao Revisaí algo sobre os próprios dados, o Revisaí passa o pedido à oficina em até 2 dias úteis e não responde no lugar dela, salvo se a oficina pedir. O app
          permite à oficina consultar, corrigir e apagar os dados de cada cliente e baixar uma cópia de todos os dados da oficina.
        </p>
      </Secao>

      <Secao n={10} titulo="Informações e auditoria">
        <p>
          A pedido da oficina, o Revisaí fornece as informações razoáveis para mostrar que cumpre este acordo, como uma descrição das medidas de segurança e dos suboperadores. Verificações além disso
          são combinadas antes, no máximo uma vez por ano, com aviso de 30 dias, sigilo e sem atrapalhar o serviço, por conta da oficina.
        </p>
      </Secao>

      <Secao n={11} titulo="Fim do tratamento">
        <p>
          O tratamento dura enquanto a oficina usar o Revisaí. A oficina pode baixar uma cópia dos dados em Ajustes a qualquer momento. Quando o dono pede para apagar a oficina, o acesso acaba na hora
          e os dados são apagados de vez em 30 dias; as cópias de segurança cifradas vencem em até 90 dias. O Revisaí só guarda depois disso o que a lei exigir (LGPD, art. 16).
        </p>
      </Secao>

      <Secao n={12} titulo="Responsabilidade e prazo">
        <p>
          Cada parte responde pelos danos que causar por descumprir a LGPD ou este acordo, na forma dos arts. 42 a 45 da LGPD. O Revisaí responde junto com a oficina quando descumprir a lei ou as
          instruções lícitas da oficina (art. 42, § 1º, I). Este acordo vale enquanto os Termos de uso valerem e, depois, enquanto o Revisaí ainda tiver dados da oficina.
        </p>
      </Secao>
    </Documento>
  );
}
