'use client';

// O kit da revisão na semana da agenda: as peças que os carros marcados nos próximos 7 dias vão
// usar (óleo do manual de cada carro, filtros...), contra o estoque, e a compra do que falta na loja
// do Revisaí num toque. Depois do pedido, a oficina marca o código do pedido nos horários.

import { PackageCheck, ShoppingCart, TriangleAlert, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Secao, classeEntrada } from '@/components/ui';
import { quantidadeComUnidade } from '@/lib/catalogo';
import { dataLocal, formatarData } from '@/lib/datas';
import { textoQuantidade } from '@/lib/estoque';
import { formatarMoeda } from '@/lib/formatos';
import { agendamentosDoKit, DIAS_DO_KIT, itensDoKit, montarKit } from '@/lib/kit-revisao';
import { servico as infoServico } from '@/lib/manutencao';
import { diaCurto } from '@/lib/rotulos';
import { useOficina } from '@/lib/store';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { mudarSituacao, useAgendamentos } from './comum';

export function KitRevisao({ hoje }: { hoje: string }) {
  const agendamentos = useAgendamentos();
  const clientes = useOficina((s) => s.clientes);
  const veiculos = useOficina((s) => s.veiculos);
  const atendimentos = useOficina((s) => s.atendimentos);
  const estoque = useOficina((s) => s.estoque);
  const pedidos = useOficina((s) => s.pedidos);
  const { catalogo, carregando } = useCatalogo();
  const router = useRouter();
  const toast = useToast();
  const [codigo, setCodigo] = useState('');

  const kit = useMemo(
    () => montarKit({ agendamentos, clientes, veiculos, atendimentos, estoque, catalogo, hoje }),
    [agendamentos, clientes, veiculos, atendimentos, estoque, catalogo, hoje]
  );
  const semPedido = agendamentosDoKit(kit);
  const recentes = pedidos.slice(0, 8);
  const cobertas = kit.linhas.filter((l) => l.faltam <= 0 && !l.semEspecificacao);

  function porNoCarrinho() {
    const itens = itensDoKit(kit);
    if (!itens.length) return;
    const s = useOficina.getState();
    for (const i of itens) s.adicionarAoCarrinho(i.produtoId, i.quantidade);
    toast({ texto: `${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'} do kit no carrinho.` });
    router.push('/oficina/loja');
  }

  function marcarPedido() {
    const c = codigo.trim().toUpperCase();
    if (!c) return;
    const s = useOficina.getState();
    for (const id of semPedido) {
      const a = s.agendamentos[id];
      if (a) mudarSituacao(a, a.situacao, { kitPedidoCodigo: c });
    }
    setCodigo('');
    toast({ texto: `Kit marcado como pedido (${c}).` });
  }

  return (
    <Secao titulo="Kit da revisão" descricao={`As peças dos carros marcados nos próximos ${DIAS_DO_KIT} dias, contra o que tem no estoque.`} id="kit">
      {!kit.carros.length ? (
        <p className="rounded-2xl bg-papel px-4 py-3 text-[14.5px] text-tinta-2 ring-1 ring-linha">Nenhum carro marcado nos próximos {DIAS_DO_KIT} dias com troca de peça (óleo, filtros, velas...).</p>
      ) : (
        <div className="flex flex-col gap-3">
          {kit.paraComprar.length ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha" aria-label="Para comprar">
              <p className="flex items-center gap-2 font-bold">
                <TriangleAlert size={18} className="text-atraso" aria-hidden="true" /> Falta no estoque
              </p>
              <ul className="flex flex-col gap-2.5">
                {kit.paraComprar.map((l) => {
                  const compra = l.compra!;
                  const loja = catalogo.fornecedores.find((f) => f.id === compra.produto.fornecedorId);
                  return (
                    <li key={l.chave} className="flex flex-wrap items-center gap-3">
                      <FotoProduto produto={compra.produto} tamanhos="48px" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-linha" />
                      <div className="min-w-0 flex-1 basis-48 text-[14px]">
                        <p className="font-semibold">
                          {l.titulo}: faltam {textoQuantidade(l.faltam, l.unidade)}
                        </p>
                        <p className="text-tinta-2">
                          {quantidadeComUnidade(compra.produto, compra.quantidade)} de {compra.produto.nome}
                          {loja ? `, ${loja.nome}` : ''} · <strong className="num text-tinta">{formatarMoeda(compra.total)}</strong>
                          {compra.promocao ? <Chip tom="oleo" className="ml-1.5 align-middle">{compra.promocao.titulo}</Chip> : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linha pt-3">
                <p className="text-[14px] text-tinta-2">
                  Total <strong className="largo num text-[18px] text-tinta">{formatarMoeda(kit.total)}</strong>
                </p>
                <Botao variante="primario" onClick={porNoCarrinho} disabled={carregando && !catalogo.produtos.length}>
                  <ShoppingCart size={17} aria-hidden="true" /> Pôr no carrinho
                </Botao>
              </div>
            </div>
          ) : kit.semProduto.length ? null : (
            <p className="flex items-center gap-2 rounded-2xl bg-ok-claro px-4 py-3 font-semibold text-ok">
              <PackageCheck size={18} aria-hidden="true" /> O estoque cobre o kit da semana.
            </p>
          )}

          {kit.semProduto.length ? (
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-papel px-4 py-3 text-[14px] text-tinta-2 ring-1 ring-linha">
              {kit.semProduto.map((l) => (
                <li key={l.chave}>
                  {l.semEspecificacao
                    ? `${l.titulo}: cadastre o óleo do manual desses carros para o app saber qual separar.`
                    : `${l.titulo}: faltam ${textoQuantidade(l.faltam, l.unidade)} e a loja ainda não tem.`}
                </li>
              ))}
            </ul>
          ) : null}

          {cobertas.length ? (
            <p className="text-[13.5px] text-tinta-3">
              No estoque: {cobertas.map((l) => `${l.titulo} (${textoQuantidade(l.precisa, l.unidade)} de ${textoQuantidade(l.tem, l.unidade)})`).join(', ')}.
            </p>
          ) : null}

          <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha" aria-label="Carros do kit">
            {kit.carros.map((c) => (
              <li key={c.agendamentoId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[14px]">
                <span className="num w-24 shrink-0 font-semibold first-letter:uppercase">
                  {diaCurto(c.data).split(',')[0]} {c.hora}
                </span>
                {c.placa ? <Placa placa={c.placa} /> : null}
                <span className="min-w-0 flex-1 truncate">
                  {c.nome}
                  {c.carro ? <span className="text-tinta-3">, {c.carro}</span> : null}
                </span>
                <span className="w-full text-[13px] text-tinta-3 sm:w-auto">
                  {c.servicos.map((s) => infoServico(s).nome).join(', ')}
                  {c.avaliar.length ? `${c.servicos.length ? '; ' : ''}avaliar ${c.avaliar.map((s) => infoServico(s).nome.toLowerCase()).join(', ')}` : ''}
                </span>
                {c.pedido ? <Chip tom="ok">pedido {c.pedido}</Chip> : null}
                {c.semOleo && c.veiculoId ? (
                  <Link href={`/oficina/carro?id=${c.veiculoId}#oleo`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-caneta hover:underline">
                    <Wrench size={13} aria-hidden="true" /> óleo do manual
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>

          {semPedido.length && recentes.length ? (
            <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-papel-2 px-4 py-3">
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-[14px]">
                <span className="font-semibold">Já pediu o kit? Marque o pedido</span>
                <select className={classeEntrada} value={codigo} onChange={(e) => setCodigo(e.target.value)}>
                  <option value="">Escolha o pedido</option>
                  {recentes.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.codigo}, {formatarData(dataLocal(p.quando))}, {formatarMoeda(p.total)}
                    </option>
                  ))}
                </select>
              </label>
              <Botao onClick={marcarPedido} disabled={!codigo}>
                Marcar
              </Botao>
            </div>
          ) : null}
        </div>
      )}
    </Secao>
  );
}
