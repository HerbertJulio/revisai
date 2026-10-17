import type { Metadata } from 'next';
import Link from 'next/link';
import { dadosDaEmpresa } from '@/lib/avisos/empresa';
import { Documento, Lista, Secao } from '../termos/documento';

// Como o Revisaí protege os dados e como relatar uma falha de segurança. Revisado por advogado: pendente.

export const metadata: Metadata = {
  title: 'Segurança',
  description: 'Como o Revisaí protege os dados das oficinas, das lojas e dos clientes, o que você pode fazer para se proteger e como relatar uma falha de segurança.'
};

const link = 'font-semibold text-caneta underline';

export default function Seguranca() {
  const e = dadosDaEmpresa();
  return (
    <Documento
      titulo="Segurança"
      atual="/seguranca"
      semVersao
      resumo={
        <p>
          Os dados das oficinas, das lojas e dos clientes delas são o que o Revisaí tem de mais importante para cuidar. Aqui estão as medidas que usamos, o que você pode fazer para se proteger e como
          nos contar se encontrar uma falha.
        </p>
      }
    >
      <Secao n={1} titulo="Como protegemos os dados">
        <Lista
          itens={[
            'Conexão cifrada (HTTPS) em todo o site, no app e na comunicação com o banco de dados.',
            'Banco de dados no Brasil (São Paulo), com os dados cifrados no disco pelo provedor.',
            'Controle de acesso em cada tabela: cada pessoa só lê e muda os dados da própria oficina ou loja, conforme o papel dela. Funções do servidor usam uma chave própria, que não sai do servidor.',
            'Entrada por código de uso único no e-mail. A equipe do Revisaí só acessa o painel interno com segundo fator de autenticação (aplicativo autenticador), refeito a cada 12 horas, e cada pessoa vê só o que o papel dela permite.',
            'Registro das ações da equipe nos dados (guardado 5 anos) e dos acessos ao serviço (guardado 6 meses).',
            'Links públicos (orçamento, checklist, garantia, entrega) com códigos longos e aleatórios; guardamos só uma impressão digital (hash) do código, que vence e pode ser cancelado.',
            'Troca de chave Pix das lojas só logo depois de entrar, com espera de 24 horas e aviso no WhatsApp da loja.',
            'Limites de uso contra robôs e abuso em login, formulários e funções sensíveis.',
            'Avisos no celular e no computador cifrados de ponta a ponta (padrão Web Push): o serviço de entrega não lê o conteúdo.',
            'Cópia de segurança semanal do banco, cifrada antes de sair do servidor, guardada por 90 dias e com restauração testada a cada cópia.',
            'Relato de erros das telas sem dados pessoais: e-mails, números longos, placas e códigos são apagados antes de guardar.',
            'Verificação automática do código a cada mudança (tipos, testes e testes de permissão no banco) e monitoramento do serviço a cada 15 minutos.'
          ]}
        />
      </Secao>

      <Secao n={2} titulo="Como você se protege">
        <Lista
          itens={[
            'Não passe o código de entrada para ninguém. O Revisaí nunca pede o código por telefone, WhatsApp ou e-mail.',
            'Antes de pagar um Pix, confira o nome de quem recebe. Se a loja mudou a chave, desconfie e fale com a loja por outro canal.',
            'Tire o acesso de quem saiu da oficina ou da loja assim que a pessoa sair.',
            'Use bloqueio de tela no celular e mantenha o navegador atualizado.',
            'Mande os links de orçamento, checklist e garantia só ao cliente certo.'
          ]}
        />
      </Secao>

      <Secao n={3} titulo="Encontrou uma falha? Conte para a gente">
        <p>
          Se você encontrou uma falha de segurança no Revisaí, escreva para {e.emailContato} com o assunto “Segurança”, explicando o que encontrou e como reproduzir. Respondemos em até 5 dias úteis e
          contamos quando a falha for corrigida.
        </p>
        <p>Para que a sua pesquisa seja de boa-fé, pedimos que você:</p>
        <Lista
          itens={[
            'use só contas e dados seus ou de teste, e pare assim que conseguir mostrar a falha, sem ver, copiar, mudar ou apagar dados de outras pessoas;',
            'não faça ataques de negação de serviço, envio em massa, engenharia social ou ataques físicos;',
            'não teste os serviços de terceiros que usamos (como hospedagem e banco de dados), que têm as próprias regras;',
            'dê um prazo razoável, de até 90 dias, para corrigirmos antes de divulgar a falha.'
          ]}
        />
        <p>
          Quem seguir essas regras não sofrerá ação judicial nem denúncia nossa pela pesquisa. Ainda não temos programa de recompensa em dinheiro, mas agradecemos publicamente a quem quiser.
        </p>
      </Secao>

      <Secao n={4} titulo="Se algo der errado">
        <p>
          Se acontecer um incidente de segurança, agimos para contê-lo, investigamos e, quando houver risco ou dano relevante às pessoas, avisamos a ANPD e as pessoas afetadas nos prazos da Resolução
          CD/ANPD nº 15/2024. As oficinas são avisadas em até 48 horas quando o incidente atingir os dados dos clientes delas, como diz o{' '}
          <Link href="/tratamento-de-dados" className={link}>
            Acordo de tratamento de dados
          </Link>
          .
        </p>
      </Secao>
    </Documento>
  );
}
