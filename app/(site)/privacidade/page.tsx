import type { Metadata } from 'next';
import { FormInteresse } from '@/components/site/FormInteresse';

export const metadata: Metadata = {
  title: 'Privacidade',
  description: 'O que o Revisaí guarda, onde fica e como pedir para corrigir ou apagar os seus dados.'
};

const SECOES = [
  {
    titulo: 'Os dados da oficina ficam no aparelho',
    texto:
      'Clientes, carros, serviços, contatos e ajustes da oficina ficam guardados no navegador do aparelho onde o painel é usado. Eles não são enviados para os servidores do Revisaí. Por isso, faça backup em Ajustes: se o navegador for limpo, os dados somem.'
  },
  {
    titulo: 'O que recebemos',
    texto:
      'Os pedidos da loja (nome, WhatsApp, cidade e endereço de entrega da oficina, produtos e quantidades) e os cadastros de interesse (nome, WhatsApp ou e-mail, cidade e mensagem), sempre com o seu consentimento. Usamos esses dados para responder, para passar o pedido ao fornecedor dos produtos e para avisar sobre o que você pediu. Para a oficina acompanhar o pedido, o app manda junto um número aleatório do aparelho, que não identifica ninguém.'
  },
  {
    titulo: 'Alerta de preço',
    texto:
      'Quando a oficina pede um preço às lojas, o alerta leva o produto, a quantidade, o preço que ela quer, a cidade e o estado. As lojas do mesmo estado veem só isso: o nome e o WhatsApp da oficina vão apenas para a loja que ela escolher, junto com o pedido.'
  },
  {
    titulo: 'Pix e entrega',
    texto:
      'O pagamento por Pix vai direto da oficina para a conta da loja; o Revisaí não recebe nem guarda dados bancários, só a chave Pix que a loja cadastrou (e as anteriores, para tirar dúvidas) para montar o código, que a oficina vê depois que a loja confirma o pedido. Na entrega, o celular do entregador manda a posição enquanto a página da entrega está aberta, para a oficina acompanhar no mapa (OpenStreetMap). Quando a entrega termina, a posição é apagada e o link deixa de funcionar; o que sobrar é apagado em no máximo 3 dias.'
  },
  {
    titulo: 'Ordem de serviço por voz',
    texto:
      'O áudio da ordem por voz vai para o servidor só para a inteligência artificial (o Gemini, do Google) passar a fala para texto. Depois, o texto e as fotos vão só para ela preencher a ordem e a mensagem para o cliente. O Revisaí não guarda esse material: o áudio, o texto, as fotos e a ordem conferida ficam no aparelho da oficina. A voz que faz as perguntas no passo a passo é gravada uma vez pela mesma inteligência artificial a partir de frases fixas, sem nenhum dado da oficina.'
  },
  {
    titulo: 'Agente no WhatsApp',
    texto:
      'O que o mecânico manda ao número do Revisaí passa pelo WhatsApp (Meta) e fica num rascunho até a oficina conferir no app. Quando a oficina confirma ou descarta, ou depois de 30 dias parado, os áudios, fotos e textos são apagados do servidor.'
  },
  {
    titulo: 'Previsão de compras para os fornecedores',
    texto:
      'Só se a oficina ligar essa opção: o app manda a soma do que os carros vão precisar nos próximos 30 dias (tipo de produto e quantidade), sem nome de cliente, placa ou nome da oficina. Os fornecedores veem apenas o total da região, e só quando pelo menos três oficinas compartilham.'
  },
  {
    titulo: 'Cartão de manutenção',
    texto:
      'Os dados do cartão que a oficina manda para o cliente ficam dentro do próprio link, depois do sinal #. Essa parte do endereço não é enviada ao servidor quando a página abre.'
  },
  {
    titulo: 'Quem cuida da estrutura',
    texto:
      'O site é hospedado na Vercel. Pedidos, cadastros, alertas de preço, a loja e os rascunhos do agente ficam num banco de dados do Supabase, na região de São Paulo. Os únicos cookies são os de entrada dos painéis do fornecedor e da equipe. Não usamos cookies de rastreamento nem anúncios.'
  },
  {
    titulo: 'Seus direitos',
    texto:
      'Pela LGPD, você pode pedir para ver, corrigir ou apagar os dados que nos enviou, e retirar o consentimento quando quiser. Use o formulário abaixo e responderemos pelo contato que você deixar.'
  }
];

export default function Privacidade() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 lg:pt-16">
      <h1 className="largo text-[38px] leading-[1.02] sm:text-[48px]">Privacidade</h1>
      <p className="mt-4 text-[17px] text-tinta-2">Em poucas palavras: o que a oficina cadastra fica com ela, e o que você manda para a gente é usado só para o que você pediu.</p>
      <div className="mt-10 flex flex-col gap-8">
        {SECOES.map((s) => (
          <section key={s.titulo}>
            <h2 className="text-[21px]">{s.titulo}</h2>
            <p className="mt-2 leading-relaxed text-tinta-2">{s.texto}</p>
          </section>
        ))}
      </div>
      <section className="mt-14 rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
        <h2 className="text-[21px]">Fale com a gente</h2>
        <p className="mt-1 mb-5 text-tinta-2">Para pedidos sobre os seus dados ou qualquer dúvida.</p>
        <FormInteresse tipo="contato" origem="privacidade" comCidade={false} mensagem="O que você precisa" botao="Enviar" consentimento="Concordo em receber a resposta pelo WhatsApp ou e-mail." />
      </section>
    </div>
  );
}
