'use client';

// Compras formais ao fornecedor: monta o pedido, e ao receber dá entrada no estoque (com o custo)
// e abre a conta a pagar no financeiro. Só para o dono e o gerente. O motor está em lib/compras.ts
// e a gravação/recebimento no store (lib/store.ts).

import { Check, Plus, Trash2, Truck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Secao, Vazio, classeEntrada } from '@/components/ui';
import { itemDeCompraVazio, itensLimpos, nomeDaSituacao, podeReceber, problemaDaCompra, totalDaCompra } from '@/lib/compras';
import { formatarData } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import type { ItemPedidoCompra } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';

function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function Compras() {
  const hoje = useHoje();
  const pedidos = useOficina((s) => s.comprasPedidos);
  const estoque = useOficina((s) => s.estoque);
  const salvarRegistro = useOficina((s) => s.salvarRegistro);
  const apagarRegistro = useOficina((s) => s.apagarRegistro);
  const receberCompra = useOficina((s) => s.receberCompra);
  const toast = useToast();

  const [abrindo, setAbrindo] = useState(false);
  const [fornecedor, setFornecedor] = useState('');
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState<ItemPedidoCompra[]>([itemDeCompraVazio()]);
  const [erro, setErro] = useState<string | null>(null);
  const [recebendo, setRecebendo] = useState<string | null>(null);
  const [vencimento, setVencimento] = useState(hoje);

  const lista = useMemo(() => Object.values(pedidos).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.criadoEm.localeCompare(a.criadoEm))), [pedidos]);
  const itensDoEstoque = useMemo(() => Object.values(estoque).sort((a, b) => a.nome.localeCompare(b.nome)), [estoque]);

  function limpar() {
    setFornecedor('');
    setData(hoje);
    setObservacao('');
    setItens([itemDeCompraVazio()]);
    setErro(null);
    setAbrindo(false);
  }

  function mudarItem(i: number, patch: Partial<ItemPedidoCompra>) {
    setItens((atual) => atual.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function ligarEstoque(i: number, estoqueId: string) {
    const item = estoqueId ? estoque[estoqueId] : null;
    setItens((atual) =>
      atual.map((it, j) => {
        if (j !== i) return it;
        const custoUnitario = item && item.custo != null && !it.custoUnitario ? item.custo : it.custoUnitario;
        const descricao = item && !it.descricao.trim() ? [item.nome, item.marca].filter(Boolean).join(' ') : it.descricao;
        return { ...it, estoqueId: estoqueId || null, custoUnitario, descricao };
      })
    );
  }

  function salvar() {
    const problema = problemaDaCompra({ fornecedor, itens });
    if (problema) return setErro(problema);
    salvarRegistro('comprasPedidos', {
      fornecedor: fornecedor.trim(),
      situacao: 'rascunho',
      data,
      observacao: observacao.trim() || undefined,
      itens: itensLimpos(itens, novoId)
    });
    toast({ texto: 'Pedido de compra salvo.' });
    limpar();
  }

  function confirmarRecebimento(id: string) {
    const lanc = receberCompra(id, { vencimento });
    setRecebendo(null);
    if (lanc) toast({ texto: 'Recebido: entrada no estoque e conta a pagar criadas.' });
    else toast({ texto: 'Não deu para receber este pedido.', tom: 'erro' });
  }

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Compras"
        descricao="Pedidos de compra ao fornecedor. Ao receber, o app dá entrada no estoque e abre a conta a pagar."
        acao={
          !abrindo ? (
            <Botao variante="primario" onClick={() => setAbrindo(true)}>
              <Plus size={17} aria-hidden="true" /> Novo pedido
            </Botao>
          ) : null
        }
      >
        {abrindo ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
            className="flex flex-col gap-4 rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo rotulo="Fornecedor" htmlFor="compra-fornecedor">
                <input id="compra-fornecedor" className={classeEntrada} value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="De quem você comprou" autoFocus />
              </Campo>
              <Campo rotulo="Data do pedido" htmlFor="compra-data">
                <input id="compra-data" type="date" className={classeEntrada} value={data} onChange={(e) => setData(e.target.value)} />
              </Campo>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-tinta">Itens</p>
              {itens.map((it, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl bg-papel-2 p-3 sm:flex-row sm:items-end">
                  <Campo rotulo="Item" className="flex-1" htmlFor={`item-desc-${i}`}>
                    <input id={`item-desc-${i}`} className={classeEntrada} value={it.descricao} onChange={(e) => mudarItem(i, { descricao: e.target.value })} placeholder="Peça ou produto" />
                  </Campo>
                  <Campo rotulo="Do estoque" className="sm:w-44" htmlFor={`item-est-${i}`}>
                    <select id={`item-est-${i}`} className={classeEntrada} value={it.estoqueId ?? ''} onChange={(e) => ligarEstoque(i, e.target.value)}>
                      <option value="">Avulso (não entra)</option>
                      {itensDoEstoque.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Qtd" className="sm:w-20" htmlFor={`item-qtd-${i}`}>
                    <input id={`item-qtd-${i}`} inputMode="decimal" className={classeEntrada} value={it.quantidade || ''} onChange={(e) => mudarItem(i, { quantidade: Number(e.target.value) || 0 })} />
                  </Campo>
                  <Campo rotulo="Custo un." className="sm:w-28" htmlFor={`item-custo-${i}`}>
                    <input id={`item-custo-${i}`} inputMode="decimal" className={classeEntrada} value={it.custoUnitario || ''} onChange={(e) => mudarItem(i, { custoUnitario: Number(e.target.value) || 0 })} />
                  </Campo>
                  {itens.length > 1 ? (
                    <Botao variante="fantasma" aria-label="Tirar item" onClick={() => setItens((a) => a.filter((_, j) => j !== i))} className="sm:mb-0.5">
                      <Trash2 size={16} aria-hidden="true" />
                    </Botao>
                  ) : null}
                </div>
              ))}
              <Botao variante="secundario" tamanho="pequeno" onClick={() => setItens((a) => [...a, itemDeCompraVazio()])} className="self-start">
                <Plus size={15} aria-hidden="true" /> Mais um item
              </Botao>
            </div>

            <Campo rotulo="Observação" dica="Opcional." htmlFor="compra-obs">
              <input id="compra-obs" className={classeEntrada} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Nota do pedido" />
            </Campo>

            {erro ? (
              <p className="text-sm font-semibold text-atraso" role="alert">
                {erro}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="num text-[15px] font-bold">Total {formatarMoeda(totalDaCompra({ itens }))}</p>
              <div className="flex gap-2">
                <Botao variante="fantasma" onClick={limpar}>
                  Cancelar
                </Botao>
                <Botao type="submit" variante="primario">
                  Salvar pedido
                </Botao>
              </div>
            </div>
          </form>
        ) : null}
      </Secao>

      {lista.length === 0 && !abrindo ? (
        <Vazio titulo="Nenhuma compra ainda" acao={<Botao variante="primario" onClick={() => setAbrindo(true)}><Plus size={17} aria-hidden="true" /> Novo pedido</Botao>}>
          <p>Registre o que você compra do fornecedor. Quando a peça chegar, o recebimento dá entrada no estoque e já abre a conta a pagar.</p>
        </Vazio>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p) => {
            const tom = p.situacao === 'recebido' ? 'ok' : p.situacao === 'cancelado' ? 'atraso' : p.situacao === 'enviado' ? 'caneta' : 'neutro';
            return (
              <div key={p.id} className="flex flex-col gap-3 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[17px] font-bold">{p.fornecedor}</p>
                      <Chip tom={tom}>{nomeDaSituacao(p.situacao)}</Chip>
                    </div>
                    <p className="mt-0.5 text-[14px] text-tinta-2">
                      {formatarData(p.data)} · {p.itens.length === 1 ? '1 item' : `${p.itens.length} itens`}
                      {p.recebidoEm ? ` · recebido em ${formatarData(p.recebidoEm)}` : ''}
                    </p>
                  </div>
                  <p className="num text-[17px] font-extrabold">{formatarMoeda(totalDaCompra(p))}</p>
                </div>

                {recebendo === p.id ? (
                  <div className="flex flex-wrap items-end gap-2 border-t border-linha pt-3">
                    <Campo rotulo="Vence em" className="w-40" htmlFor={`venc-${p.id}`}>
                      <input id={`venc-${p.id}`} type="date" className={classeEntrada} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                    </Campo>
                    <Botao variante="primario" onClick={() => confirmarRecebimento(p.id)}>
                      <Check size={16} aria-hidden="true" /> Confirmar recebimento
                    </Botao>
                    <Botao variante="fantasma" onClick={() => setRecebendo(null)}>
                      <X size={16} aria-hidden="true" /> Agora não
                    </Botao>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 border-t border-linha pt-3">
                    {podeReceber(p) ? (
                      <Botao variante="escuro" onClick={() => { setRecebendo(p.id); setVencimento(hoje); }}>
                        <Truck size={16} aria-hidden="true" /> Receber
                      </Botao>
                    ) : null}
                    {p.situacao !== 'recebido' && p.situacao !== 'cancelado' ? (
                      <Botao
                        variante="fantasma"
                        onClick={() => salvarRegistro('comprasPedidos', { id: p.id, fornecedor: p.fornecedor, situacao: 'cancelado', data: p.data, observacao: p.observacao, itens: p.itens, recebidoEm: p.recebidoEm, lancamentoId: p.lancamentoId })}
                      >
                        Cancelar pedido
                      </Botao>
                    ) : null}
                    {p.situacao !== 'recebido' ? (
                      <Botao variante="fantasma" aria-label="Excluir" onClick={() => apagarRegistro('comprasPedidos', p.id)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </Botao>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
