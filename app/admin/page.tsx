import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { AvisoAparelho } from '@/components/equipe/AvisoAparelho';
import { AvisoErro } from '@/components/equipe/comum';
import { ListaCadastros } from '@/components/equipe/ListaCadastros';
import { ListaPedidos } from '@/components/equipe/ListaPedidos';
import { Moldura } from '@/components/equipe/Moldura';
import { Numero } from '@/components/painel/Numero';
import { Secao, Vazio } from '@/components/ui';
import { dataCurta, diaEmBrasilia, diasParaAcabar, situacaoPromocao, somaDosPedidos } from '@/lib/equipe-dados';
import { buscarCadastros, buscarLoja, buscarPedidos, contarNovos, listarLojas } from '@/lib/equipe/dados';
import { COOKIE_APARELHO_NOVO, descricaoDoAparelho } from '@/lib/equipe/entrada';
import { pode } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { formatarMoeda, plural } from '@/lib/formatos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Resumo' };

const MOSTRAR = 5;

export default async function PaginaResumo() {
  const acesso = await exigirEquipe();
  const { sb, papel } = acesso;
  const agora = Date.now();
  const hoje = diaEmBrasilia(agora);
  const [jar, cabecalhos] = await Promise.all([cookies(), headers()]);
  const aparelhoNovo = jar.get(COOKIE_APARELHO_NOVO)?.value === '1';
  const verCadastros = pode(papel, 'mudarCadastro');
  const [pedidos, cadastros, loja, novos, lojas] = await Promise.all([
    buscarPedidos(sb, 200),
    verCadastros ? buscarCadastros(sb) : Promise.resolve({ dados: [], erro: null }),
    buscarLoja(sb),
    contarNovos(sb),
    listarLojas(sb)
  ]);
  const vendasMes = lojas.dados.reduce((s, f) => s + f.vendasMes, 0);
  const comissaoMes = lojas.dados.reduce((s, f) => s + f.comissaoMes, 0);
  const mensalidades = lojas.dados.filter((f) => f.ativo && f.contrato?.plano === 'destaque').reduce((s, f) => s + (f.contrato?.mensalidade ?? 0), 0);
  const erro = pedidos.erro ?? cadastros.erro ?? loja.erro ?? lojas.erro;

  const pedidosNovos = pedidos.dados.filter((p) => p.status === 'novo');
  const cadastrosNovos = cadastros.dados.filter((c) => c.situacao === 'novo');
  const emAndamento = pedidos.dados.filter((p) => p.status === 'em_contato' || p.status === 'confirmado');
  const produtos = new Map(loja.dados.produtos.map((p) => [p.id, p]));
  const acabando = loja.dados.promocoes
    .filter((pr) => situacaoPromocao(pr, hoje) === 'em_vigor' && diasParaAcabar(pr.fim, hoje) <= 7)
    .sort((a, b) => a.fim.localeCompare(b.fim));
  const esperando = novos.impulsos + novos.sugestoes + (pode(papel, 'decidirLoja') ? novos.lojas : 0) + (pode(papel, 'suporte') ? novos.chamados : 0);

  const descricao = [
    pedidosNovos.length ? `${plural(pedidosNovos.length, 'pedido novo', 'pedidos novos')}, somando ${formatarMoeda(somaDosPedidos(pedidosNovos))}` : 'Nenhum pedido novo',
    verCadastros ? (cadastrosNovos.length ? plural(cadastrosNovos.length, 'cadastro novo', 'cadastros novos') : 'nenhum cadastro novo') : null,
    emAndamento.length ? `${plural(emAndamento.length, 'pedido em andamento', 'pedidos em andamento')}` : null
  ]
    .filter(Boolean)
    .join(', ');

  const avisos = [
    novos.chamados && pode(papel, 'suporte') ? { href: '/admin/suporte', texto: plural(novos.chamados, 'pedido de ajuda esperando resposta', 'pedidos de ajuda esperando resposta') } : null,
    novos.lojas && pode(papel, 'decidirLoja') ? { href: '/admin/lojas-em-analise', texto: plural(novos.lojas, 'loja esperando a conferência do CNPJ', 'lojas esperando a conferência do CNPJ') } : null,
    novos.impulsos ? { href: '/admin/impulsos', texto: plural(novos.impulsos, 'pedido de impulso esperando', 'pedidos de impulso esperando') } : null,
    novos.sugestoes ? { href: '/admin/base', texto: plural(novos.sugestoes, 'sugestão para a base de prazos', 'sugestões para a base de prazos') } : null
  ].filter((a): a is { href: string; texto: string } => a != null);

  return (
    <Moldura acesso={acesso} aba="resumo" titulo="Resumo" descricao={`${descricao}.`}>
      {aparelhoNovo ? <AvisoAparelho descricao={descricaoDoAparelho(cabecalhos.get('user-agent') ?? '')} /> : null}
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Vendas da loja no mês" valor={formatarMoeda(vendasMes)} href={pode(papel, 'numeros') ? '/admin/marketplace' : undefined} />
        <Numero rotulo="Comissão no mês" valor={formatarMoeda(comissaoMes)} />
        <Numero rotulo="Mensalidades Destaque" valor={formatarMoeda(mensalidades)} />
        <Numero rotulo="Esperando você" valor={String(esperando)} detalhe={`${plural(novos.impulsos, 'impulso', 'impulsos')}, ${plural(novos.sugestoes, 'sugestão', 'sugestões')}`} />
      </div>

      {avisos.length ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-oleo-claro px-4 py-3 text-[15px] text-oleo-tinta sm:px-5">
          {avisos.map((a) => (
            <Link key={a.href} href={a.href} className="font-semibold hover:underline">
              {a.texto}
            </Link>
          ))}
        </div>
      ) : null}

      <Secao
        titulo="Pedidos esperando resposta"
        acao={
          <Link href="/admin/pedidos" className="text-[15px] font-semibold text-caneta hover:underline">
            Ver todos
          </Link>
        }
      >
        <ListaPedidos
          pedidos={pedidosNovos.slice(0, MOSTRAR)}
          agora={agora}
          comFiltros={false}
          podeMudar={pode(papel, 'mudarPedido')}
          vazio={<Vazio titulo="Nenhum pedido esperando">Quando uma oficina mandar um pedido pela loja, ele aparece aqui.</Vazio>}
        />
        {pedidosNovos.length > MOSTRAR ? (
          <Link href="/admin/pedidos" className="text-[15px] font-semibold text-caneta hover:underline">
            Ver os outros {pedidosNovos.length - MOSTRAR}
          </Link>
        ) : null}
      </Secao>

      {verCadastros ? (
        <Secao
          titulo="Cadastros esperando resposta"
          acao={
            <Link href="/admin/cadastros" className="text-[15px] font-semibold text-caneta hover:underline">
              Ver todos
            </Link>
          }
        >
          <ListaCadastros
            cadastros={cadastrosNovos.slice(0, MOSTRAR)}
            agora={agora}
            comFiltros={false}
            vazio={<Vazio titulo="Nenhum cadastro esperando">Oficinas querendo o Pro, lojas e donos de carro que preencherem o site aparecem aqui.</Vazio>}
          />
          {cadastrosNovos.length > MOSTRAR ? (
            <Link href="/admin/cadastros" className="text-[15px] font-semibold text-caneta hover:underline">
              Ver os outros {cadastrosNovos.length - MOSTRAR}
            </Link>
          ) : null}
        </Secao>
      ) : null}

      <Secao titulo="Promoções acabando nesta semana">
        {acabando.length ? (
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {acabando.map((pr) => {
              const produto = produtos.get(pr.produto_id);
              const dias = diasParaAcabar(pr.fim, hoje);
              return (
                <li key={pr.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <span className="font-semibold">{pr.titulo}</span>
                    <span className="block text-[14px] text-tinta-3">{produto ? [produto.marca, produto.nome].filter(Boolean).join(' ') : ''}</span>
                  </span>
                  <span className="text-[14px] font-semibold text-oleo-tinta">
                    {dias === 0 ? 'acaba hoje' : dias === 1 ? 'acaba amanhã' : `acaba em ${dataCurta(pr.fim, hoje)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vazio titulo="Nenhuma promoção acabando">As promoções em vigor seguem por mais de uma semana.</Vazio>
        )}
      </Secao>
    </Moldura>
  );
}
