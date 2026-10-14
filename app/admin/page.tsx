import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoErro } from '@/components/equipe/comum';
import { ListaCadastros } from '@/components/equipe/ListaCadastros';
import { ListaPedidos } from '@/components/equipe/ListaPedidos';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { Secao, Vazio } from '@/components/ui';
import { buscarCadastros, buscarLoja, buscarPedidos, contarNovos } from '@/lib/equipe';
import { dataCurta, diaEmBrasilia, diasParaAcabar, situacaoPromocao, somaDosPedidos } from '@/lib/equipe-dados';
import { formatarMoeda, plural } from '@/lib/formatos';
import { listarFornecedoresAdmin } from '@/lib/marketplace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Resumo' };

const MOSTRAR = 5;

export default async function PaginaResumo() {
  const portao = await portaoDaEquipe('/admin');
  if (portao) return portao;

  const agora = Date.now();
  const hoje = diaEmBrasilia(agora);
  const [pedidos, cadastros, loja, novos, fornecedores] = await Promise.all([buscarPedidos(), buscarCadastros(), buscarLoja(), contarNovos(), listarFornecedoresAdmin()]);
  const vendasMes = fornecedores.dados.reduce((s, f) => s + f.vendasMes, 0);
  const comissaoMes = fornecedores.dados.reduce((s, f) => s + f.comissaoMes, 0);
  const mensalidades = fornecedores.dados.filter((f) => f.ativo && f.contrato?.plano === 'destaque').reduce((s, f) => s + (f.contrato?.mensalidade ?? 0), 0);
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Vendas da loja no mês" valor={formatarMoeda(vendasMes)} />
        <Numero rotulo="Comissão no mês" valor={formatarMoeda(comissaoMes)} />
        <Numero rotulo="Mensalidades Destaque" valor={formatarMoeda(mensalidades)} />
        <Numero rotulo="Esperando você" valor={String(novos.impulsos + novos.sugestoes)} detalhe={`${plural(novos.impulsos, 'impulso', 'impulsos')}, ${plural(novos.sugestoes, 'sugestão', 'sugestões')}`} />
      </div>

      {novos.impulsos || novos.sugestoes ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-oleo-claro px-4 py-3 text-[15px] text-oleo-tinta sm:px-5">
          {novos.impulsos ? (
            <Link href="/admin/impulsos" className="font-semibold hover:underline">
              {plural(novos.impulsos, 'pedido de impulso esperando', 'pedidos de impulso esperando')}
            </Link>
          ) : null}
          {novos.sugestoes ? (
            <Link href="/admin/base" className="font-semibold hover:underline">
              {plural(novos.sugestoes, 'sugestão para a base de prazos', 'sugestões para a base de prazos')}
            </Link>
          ) : null}
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
          vazio={<Vazio titulo="Nenhum pedido esperando">Quando uma oficina mandar um pedido pela loja, ele aparece aqui.</Vazio>}
        />
        {pedidosNovos.length > MOSTRAR ? (
          <Link href="/admin/pedidos" className="text-[15px] font-semibold text-caneta hover:underline">
            Ver os outros {pedidosNovos.length - MOSTRAR}
          </Link>
        ) : null}
      </Secao>

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
          vazio={<Vazio titulo="Nenhum cadastro esperando">Oficinas querendo o Pro, fornecedores e donos de carro que preencherem o site aparecem aqui.</Vazio>}
        />
        {cadastrosNovos.length > MOSTRAR ? (
          <Link href="/admin/cadastros" className="text-[15px] font-semibold text-caneta hover:underline">
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

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
      <p className="text-[13px] font-semibold text-tinta-3">{rotulo}</p>
      <p className="largo num mt-0.5 text-[22px] font-extrabold">{valor}</p>
      {detalhe ? <p className="text-[12.5px] text-tinta-3">{detalhe}</p> : null}
    </div>
  );
}
