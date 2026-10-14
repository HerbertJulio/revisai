import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoErro } from '@/components/equipe/comum';
import { ListaCadastros } from '@/components/equipe/ListaCadastros';
import { ListaPedidos } from '@/components/equipe/ListaPedidos';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { Secao, Vazio } from '@/components/ui';
import { buscarCadastros, buscarLoja, buscarPedidos } from '@/lib/equipe';
import { dataCurta, diaEmBrasilia, diasParaAcabar, situacaoPromocao, somaDosPedidos } from '@/lib/equipe-dados';
import { formatarMoeda, plural } from '@/lib/formatos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Resumo' };

const MOSTRAR = 5;

export default async function PaginaResumo() {
  const portao = await portaoDaEquipe('/equipe');
  if (portao) return portao;

  const agora = Date.now();
  const hoje = diaEmBrasilia(agora);
  const [pedidos, cadastros, loja] = await Promise.all([buscarPedidos(), buscarCadastros(), buscarLoja()]);
  const erro = pedidos.erro ?? cadastros.erro ?? loja.erro;

  const pedidosNovos = pedidos.dados.filter((p) => p.status === 'novo');
  const cadastrosNovos = cadastros.dados.filter((c) => c.situacao === 'novo');
  const emAndamento = pedidos.dados.filter((p) => p.status === 'em_contato' || p.status === 'confirmado');
  const produtos = new Map(loja.dados.produtos.map((p) => [p.id, p]));
  const acabando = loja.dados.promocoes
    .filter((pr) => situacaoPromocao(pr, hoje) === 'em_vigor' && diasParaAcabar(pr.fim, hoje) <= 7)
    .sort((a, b) => a.fim.localeCompare(b.fim));

  const descricao = [
    pedidosNovos.length ? `${plural(pedidosNovos.length, 'pedido novo', 'pedidos novos')}, somando ${formatarMoeda(somaDosPedidos(pedidosNovos))}` : 'Nenhum pedido novo',
    cadastrosNovos.length ? plural(cadastrosNovos.length, 'cadastro novo', 'cadastros novos') : 'nenhum cadastro novo',
    emAndamento.length ? `${plural(emAndamento.length, 'pedido em andamento', 'pedidos em andamento')}` : null
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Moldura aba="resumo" titulo="Resumo" descricao={`${descricao}.`}>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}

      <Secao
        titulo="Pedidos esperando resposta"
        acao={
          <Link href="/equipe/pedidos" className="text-[15px] font-semibold text-caneta hover:underline">
            Ver todos
          </Link>
        }
      >
        <ListaPedidos
          pedidos={pedidosNovos.slice(0, MOSTRAR)}
          agora={agora}
          comFiltros={false}
          vazio={<Vazio titulo="Nenhum pedido esperando">Quando uma oficina mandar um pedido pela loja, ele aparece aqui.</Vazio>}
        />
        {pedidosNovos.length > MOSTRAR ? (
          <Link href="/equipe/pedidos" className="text-[15px] font-semibold text-caneta hover:underline">
            Ver os outros {pedidosNovos.length - MOSTRAR}
          </Link>
        ) : null}
      </Secao>

      <Secao
        titulo="Cadastros esperando resposta"
        acao={
          <Link href="/equipe/cadastros" className="text-[15px] font-semibold text-caneta hover:underline">
            Ver todos
          </Link>
        }
      >
        <ListaCadastros
          cadastros={cadastrosNovos.slice(0, MOSTRAR)}
          agora={agora}
          comFiltros={false}
          vazio={<Vazio titulo="Nenhum cadastro esperando">Oficinas querendo o Pro, fornecedores e donos de carro que preencherem o site aparecem aqui.</Vazio>}
        />
        {cadastrosNovos.length > MOSTRAR ? (
          <Link href="/equipe/cadastros" className="text-[15px] font-semibold text-caneta hover:underline">
            Ver os outros {cadastrosNovos.length - MOSTRAR}
          </Link>
        ) : null}
      </Secao>

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
