import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoErro, Quadro } from '@/components/fornecedor/comum';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { CartaoReputacao } from '@/components/fornecedor/Reputacao';
import { Numero } from '@/components/painel/Numero';
import { Chip, Secao, Vazio, classeBotao } from '@/components/ui';
import { nomeCategoria } from '@/lib/catalogo';
import { quantidadeDaLinha } from '@/lib/demanda';
import { formatarMoeda, plural } from '@/lib/formatos';
import { dataCurta, diaEmBrasilia, inicioDoMes } from '@/lib/loja/comum';
import { demandaDaLoja } from '@/lib/loja/demanda';
import { painelOuEntrada } from '@/lib/loja/painel';
import { reputacaoDaLoja } from '@/lib/loja/reputacao';
import { PLANOS_FORNECEDOR, valorDaComissao } from '@/lib/planos-fornecedor';
import { sugerirPromocoes, type ProdutoDoFornecedor } from '@/lib/sugestoes';
import type { EspecProduto } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Início' };

const LINHAS_VITRINE = 3;

export default async function InicioDaLoja() {
  const r = await painelOuEntrada('/fornecedor');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const { loja, contrato, produtos, promocoes, pedidos, hoje } = painel;
  const [demanda, reputacao] = await Promise.all([loja.ativo ? demandaDaLoja(sb, loja.uf) : Promise.resolve(null), reputacaoDaLoja(sb, loja.id)]);

  const plano = contrato?.plano ?? 'vitrine';
  const destaque = plano === 'destaque';
  const desde = inicioDoMes(hoje);
  const doMes = pedidos.filter((p) => diaEmBrasilia(p.criadoEm) >= desde && p.status !== 'cancelado');
  const vendas = doMes.reduce((s, p) => s + p.subtotal, 0);
  const comissao = doMes.reduce((s, p) => s + valorDaComissao(p.subtotal, p.comissaoPercentual), 0);
  const novos = pedidos.filter((p) => p.status === 'novo').length;
  const pagos = pedidos.filter((p) => p.pagamento === 'informado' && p.status !== 'cancelado').length;
  const ativos = produtos.filter((p) => p.ativo).length;
  const vigentes = promocoes.filter((p) => p.ativo && p.inicio <= hoje && p.fim >= hoje);

  const paraSugerir: ProdutoDoFornecedor[] = produtos.map((p) => ({
    id: p.id,
    categoria: p.categoria,
    nome: [p.marca, p.nome].filter(Boolean).join(' '),
    marca: p.marca,
    unidade: p.unidade,
    conteudo: p.conteudo,
    preco: p.preco,
    especificacao: p.especificacao as EspecProduto,
    ativo: p.ativo
  }));
  const sugestoes = demanda ? sugerirPromocoes(demanda.linhas, paraSugerir, vigentes.map((v) => ({ produtoId: v.produto_id, inicio: v.inicio, fim: v.fim })), hoje) : [];
  const mostradas = destaque ? sugestoes : sugestoes.slice(0, LINHAS_VITRINE);

  return (
    <MolduraFornecedor
      aba="inicio"
      painel={painel}
      titulo={`Olá, ${loja.nome}`}
      descricao={
        <>
          Plano {PLANOS_FORNECEDOR[plano].nome}
          {destaque && loja.destaque_ate ? ` até ${dataCurta(loja.destaque_ate, hoje)}` : ''}. {loja.ativo ? 'Sua loja está no ar para as oficinas.' : 'Sua loja ainda não aparece para as oficinas.'}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Numero rotulo="Pedidos novos" valor={String(novos)} href="/fornecedor/pedidos" detalhe={pagos ? `${plural(pagos, 'pagamento para conferir', 'pagamentos para conferir')}` : undefined} />
        <Numero rotulo="Alertas para responder" valor={String(painel.alertasNovos)} href="/fornecedor/alertas" />
        <Numero rotulo="Vendas no mês" valor={formatarMoeda(vendas)} detalhe={`${formatarMoeda(comissao)} de comissão`} />
        <Numero rotulo="Produtos à venda" valor={String(ativos)} href="/fornecedor/produtos" />
        <Numero rotulo="Promoções no ar" valor={String(vigentes.length)} href="/fornecedor/promocoes" />
      </div>

      <Quadro
        titulo="Sua reputação"
        descricao="Como a loja está indo com as oficinas."
        acao={
          <Link href="/fornecedor/conta#reputacao" className={classeBotao('fantasma', 'pequeno')}>
            Como funciona
          </Link>
        }
      >
        <CartaoReputacao reputacao={reputacao} compacto />
      </Quadro>

      <Secao
        titulo={`O que as oficinas ${loja.uf ? `do ${loja.uf}` : 'da sua região'} vão comprar`}
        descricao="A soma da previsão dos próximos 30 dias das oficinas que compartilham. Você vê só as quantidades, nunca quem são as oficinas ou os clientes delas."
      >
        {!loja.ativo ? (
          <Vazio titulo="Aparece quando a loja estiver no ar">Com a loja aprovada, você vê aqui a soma do que as oficinas do seu estado vão comprar nos próximos 30 dias.</Vazio>
        ) : !demanda ? (
          loja.uf ? <AvisoErro>Não deu para carregar a previsão da região agora. Atualize a página em instantes.</AvisoErro> : <Vazio titulo="Falta o estado da loja">Peça para a equipe do Revisaí completar o cadastro da loja.</Vazio>
        ) : demanda.linhas.length === 0 ? (
          <Vazio titulo="Ainda sem previsão suficiente na região">
            A soma aparece quando pelo menos {demanda.minimo} oficinas do {demanda.uf} compartilham a previsão de compras do mesmo produto. Enquanto isso, deixe os produtos com foto, ficha técnica e prazo de troca, que é o que faz eles entrarem nas recomendações.
          </Vazio>
        ) : (
          <>
            <p className="text-[14px] text-tinta-3">
              {plural(demanda.oficinas, 'oficina compartilhou', 'oficinas compartilharam')} a previsão nos últimos 10 dias. As quantidades são aproximadas.
            </p>
            <ul className="flex flex-col gap-3">
              {mostradas.map((s) => (
                <li key={`${s.linha.categoria}-${s.linha.titulo}`} className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{s.linha.titulo}</p>
                      {nomeCategoria(s.linha.categoria) !== s.linha.titulo ? <Chip>{nomeCategoria(s.linha.categoria)}</Chip> : null}
                      <Chip tom="caneta">{quantidadeDaLinha(s.linha)}</Chip>
                    </div>
                    <p className="mt-1 text-[14.5px] text-tinta-2">{s.texto}</p>
                  </div>
                  {s.produto && !s.jaEmPromocao && s.precoSugerido ? (
                    <Link href={`/fornecedor/promocoes?nova=${s.produto.id}&preco=${s.precoSugerido}&minimo=${s.quantidadeMinima}`} className={classeBotao('escuro', 'pequeno')}>
                      Criar essa promoção
                    </Link>
                  ) : !s.produto ? (
                    <Link href="/fornecedor/produtos?novo=1" className={classeBotao('secundario', 'pequeno')}>
                      Cadastrar produto
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {!destaque && sugestoes.length > LINHAS_VITRINE ? (
              <div className="rounded-2xl bg-caneta-claro px-4 py-3 text-[15px] text-caneta sm:px-5">
                Mais {plural(sugestoes.length - LINHAS_VITRINE, 'oportunidade', 'oportunidades')} na sua região. No plano Destaque você vê a demanda completa e aparece primeiro na loja.{' '}
                <Link href="/fornecedor/plano" className="font-semibold underline">
                  Ver o plano
                </Link>
              </div>
            ) : null}
          </>
        )}
      </Secao>
    </MolduraFornecedor>
  );
}
