import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoErro } from '@/components/equipe/comum';
import { MolduraFornecedor, SemAcesso } from '@/components/fornecedor/Moldura';
import { Numero } from '@/components/painel/Numero';
import { Chip, Secao, Vazio, classeBotao } from '@/components/ui';
import { nomeCategoria } from '@/lib/catalogo';
import { MINIMO_OFICINAS, quantidadeDaLinha } from '@/lib/demanda';
import { diaEmBrasilia } from '@/lib/equipe-dados';
import { formatarMoeda, plural } from '@/lib/formatos';
import { painelDaSessao } from '@/lib/fornecedor-servidor';
import { inicioDoMes } from '@/lib/marketplace-dados';
import { PLANOS_FORNECEDOR, valorDaComissao } from '@/lib/planos-fornecedor';
import { sugerirPromocoes, type ProdutoDoFornecedor } from '@/lib/sugestoes';
import type { EspecProduto } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Início' };

const LINHAS_VITRINE = 3;

export default async function InicioFornecedor({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const r = await painelDaSessao();
  if (!r.sessao) return <SemAcesso linkInvalido={(await searchParams).erro === 'link'} />;
  if (!r.painel)
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <AvisoErro>{r.erro ?? 'Não deu para abrir o painel agora.'}</AvisoErro>
      </main>
    );

  const { fornecedor, contrato, produtos, promocoes, pedidos, demanda, hoje } = r.painel;
  const plano = contrato?.plano ?? 'vitrine';
  const destaque = plano === 'destaque';
  const desde = inicioDoMes(hoje);
  const doMes = pedidos.filter((p) => diaEmBrasilia(p.criadoEm) >= desde && p.status !== 'cancelado');
  const vendas = doMes.reduce((s, p) => s + p.subtotal, 0);
  const comissao = doMes.reduce((s, p) => s + valorDaComissao(p.subtotal, p.comissaoPercentual), 0);
  const novos = pedidos.filter((p) => p.status === 'novo').length;
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
      loja={fornecedor.nome}
      novos={novos}
      titulo={`Olá, ${fornecedor.nome}`}
      descricao={
        <>
          Plano {PLANOS_FORNECEDOR[plano].nome}
          {destaque && fornecedor.destaque_ate ? ` até ${fornecedor.destaque_ate.split('-').reverse().join('/')}` : ''}. {fornecedor.ativo ? 'Sua loja está no ar para as oficinas.' : 'Sua loja está fora do ar. Fale com a equipe do Revisaí.'}
        </>
      }
    >
      {r.erro ? <AvisoErro>{r.erro}</AvisoErro> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Pedidos novos" valor={String(novos)} href="/fornecedor/pedidos" />
        <Numero rotulo="Vendas no mês" valor={formatarMoeda(vendas)} detalhe={`${formatarMoeda(comissao)} de comissão`} />
        <Numero rotulo="Produtos à venda" valor={String(ativos)} href="/fornecedor/produtos" />
        <Numero rotulo="Promoções no ar" valor={String(vigentes.length)} href="/fornecedor/promocoes" />
      </div>

      <Secao
        titulo={`O que as oficinas de ${fornecedor.uf ?? 'sua região'} vão comprar`}
        descricao="A soma da previsão dos próximos 30 dias das oficinas que compartilham. Você vê só as quantidades, nunca quem são as oficinas ou os clientes delas."
      >
        {!demanda || demanda.linhas.length === 0 ? (
          <Vazio titulo="Ainda sem previsão suficiente na região">
            A soma aparece quando pelo menos {MINIMO_OFICINAS} oficinas de {fornecedor.uf ?? 'seu estado'} compartilham a previsão de compras do mesmo produto. Enquanto isso, deixe os produtos com foto, ficha técnica e prazo de troca, que é o que faz eles entrarem nas recomendações.
          </Vazio>
        ) : (
          <>
            <p className="text-[14px] text-tinta-3">
              {plural(demanda.oficinas, 'oficina compartilhou', 'oficinas compartilharam')} a previsão nos últimos 10 dias.
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
                    <Link
                      href={`/fornecedor/promocoes?nova=${s.produto.id}&preco=${s.precoSugerido}&minimo=${s.quantidadeMinima}`}
                      className={classeBotao('escuro', 'pequeno')}
                    >
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

