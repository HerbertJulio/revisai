'use client';

// As oficinas que já compraram da loja e as condições de cada uma: desconto na loja toda, desconto
// num produto ou preço fixo num produto. A oficina vê o preço dela na loja do Revisaí.

import { BadgePercent, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { removerCondicaoDaOficina, salvarCondicaoDaOficina } from '@/app/fornecedor/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Vazio, classeEntrada } from '@/components/ui';
import { formatarMoeda, lerNumero } from '@/lib/formatos';
import { combina, paraBusca, quandoFoi } from '@/lib/loja/comum';
import type { ClienteDaLoja, CondicaoDaOficina, LinhaProdutoDaLoja } from '@/lib/loja/dados';
import { AvisoErro, CampoBusca } from './comum';

function nomeDoProduto(p: Pick<LinhaProdutoDaLoja, 'marca' | 'nome'>): string {
  return [p.marca, p.nome].filter(Boolean).join(' ');
}

function textoDaCondicao(c: CondicaoDaOficina, produtos: Map<number, LinhaProdutoDaLoja>): string {
  const valor = c.preco != null ? `por ${formatarMoeda(c.preco)}` : `${String(c.descontoPercentual).replace('.', ',')}% de desconto`;
  if (c.produtoId == null) return `${valor} na loja toda`;
  const p = produtos.get(c.produtoId);
  return `${p ? nomeDoProduto(p) : `Produto ${c.produtoId}`} ${valor}`;
}

export function ClientesDaLoja({ clientes, condicoes, produtos }: { clientes: ClienteDaLoja[]; condicoes: CondicaoDaOficina[]; produtos: LinhaProdutoDaLoja[] }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<ClienteDaLoja | null>(null);
  const porProduto = new Map(produtos.map((p) => [p.id, p]));
  const agora = Date.now();
  const visiveis = clientes.filter((c) => !busca.trim() || combina(paraBusca(c.nome, c.cidade, c.uf), busca));

  if (!clientes.length)
    return (
      <Vazio titulo="Nenhuma oficina comprou ainda">
        Quando uma oficina fizer o primeiro pedido, ela aparece aqui e você pode combinar um preço especial ou um desconto para ela.
      </Vazio>
    );

  return (
    <div className="flex flex-col gap-4">
      {clientes.length > 8 ? <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar oficina" dica="Nome ou cidade" /> : null}
      <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
        {visiveis.map((c) => {
          const delas = condicoes.filter((x) => x.oficinaId === c.oficinaId);
          return (
            <li key={c.oficinaId} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.nome}</p>
                <p className="text-[13.5px] text-tinta-3">
                  {[[c.cidade, c.uf].filter(Boolean).join(', '), `${c.pedidos} ${c.pedidos === 1 ? 'pedido' : 'pedidos'}, ${formatarMoeda(c.total)}`, `último ${quandoFoi(c.ultimo, agora)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {delas.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {delas.slice(0, 4).map((x) => (
                      <Chip key={x.id} tom="caneta">
                        {textoDaCondicao(x, porProduto)}
                      </Chip>
                    ))}
                    {delas.length > 4 ? <Chip>+{delas.length - 4}</Chip> : null}
                  </div>
                ) : null}
              </div>
              <Botao tamanho="pequeno" onClick={() => setAberto(c)}>
                <BadgePercent size={15} aria-hidden="true" /> {delas.length ? 'Condições' : 'Combinar condição'}
              </Botao>
            </li>
          );
        })}
      </ul>
      <Folha
        aberta={aberto != null}
        aoFechar={() => setAberto(null)}
        titulo={aberto ? `Condições para ${aberto.nome}` : 'Condições'}
        descricao="O melhor preço vale no pedido: promoção, alerta de preço ou a condição combinada aqui."
      >
        {aberto ? <Condicoes cliente={aberto} condicoes={condicoes.filter((x) => x.oficinaId === aberto.oficinaId)} produtos={produtos} porProduto={porProduto} /> : null}
      </Folha>
    </div>
  );
}

function Condicoes({ cliente, condicoes, produtos, porProduto }: { cliente: ClienteDaLoja; condicoes: CondicaoDaOficina[]; produtos: LinhaProdutoDaLoja[]; porProduto: Map<number, LinhaProdutoDaLoja> }) {
  const toast = useToast();
  const naLoja = condicoes.find((c) => c.produtoId == null);
  const [desconto, setDesconto] = useState(naLoja?.descontoPercentual != null ? String(naLoja.descontoPercentual).replace('.', ',') : '');
  const ativos = produtos.filter((p) => p.ativo);
  const [produtoId, setProdutoId] = useState<string>(ativos[0] ? String(ativos[0].id) : '');
  const [tipo, setTipo] = useState<'preco' | 'desconto'>('preco');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function gravar(entrada: { produtoId: number | null; tipo: 'preco' | 'desconto'; valor: number | null }, depois?: () => void) {
    setErro(null);
    if (!entrada.valor || entrada.valor <= 0) return setErro('Informe o valor.');
    iniciar(async () => {
      try {
        const r = await salvarCondicaoDaOficina({ oficinaId: cliente.oficinaId, produtoId: entrada.produtoId, tipo: entrada.tipo, valor: entrada.valor });
        if (!r.ok) return setErro(r.erro);
        toast({ texto: 'Condição salva.' });
        depois?.();
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function tirar(id: number) {
    iniciar(async () => {
      try {
        const r = await removerCondicaoDaOficina(id);
        if (!r.ok) return setErro(r.erro);
        toast({ texto: 'Condição tirada.' });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  const doProduto = condicoes.filter((c) => c.produtoId != null);
  const escolhido = porProduto.get(Number(produtoId));

  return (
    <div className="flex flex-col gap-5">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <section className="flex flex-col gap-3 rounded-xl bg-papel-2/60 p-4">
        <p className="font-semibold">Desconto na loja toda</p>
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Desconto (%)" htmlFor="cond-loja" className="w-36">
            <input id="cond-loja" className={`${classeEntrada} num`} value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" placeholder="5" />
          </Campo>
          <Botao variante="escuro" onClick={() => gravar({ produtoId: null, tipo: 'desconto', valor: lerNumero(desconto) })} disabled={ocupado}>
            Salvar
          </Botao>
          {naLoja ? (
            <Botao variante="perigo" onClick={() => (tirar(naLoja.id), setDesconto(''))} disabled={ocupado}>
              Tirar
            </Botao>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="font-semibold">Por produto</p>
        {doProduto.length ? (
          <ul className="divide-y divide-linha rounded-xl ring-1 ring-linha">
            {doProduto.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14.5px]">
                <span className="min-w-0">{textoDaCondicao(c, porProduto)}</span>
                <button type="button" onClick={() => tirar(c.id)} disabled={ocupado} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-tinta-3 hover:bg-atraso-claro hover:text-atraso" aria-label="Tirar a condição">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-tinta-3">Nenhum produto com condição especial para esta oficina.</p>
        )}
        {ativos.length ? (
          <div className="grid gap-3 rounded-xl bg-papel-2/60 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <Campo rotulo="Produto" htmlFor="cond-produto">
              <select id="cond-produto" className={classeEntrada} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                {ativos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomeDoProduto(p)} ({formatarMoeda(p.preco)})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Tipo" htmlFor="cond-tipo">
              <select id="cond-tipo" className={classeEntrada} value={tipo} onChange={(e) => setTipo(e.target.value as 'preco' | 'desconto')}>
                <option value="preco">Preço fixo</option>
                <option value="desconto">Desconto (%)</option>
              </select>
            </Campo>
            <Campo rotulo={tipo === 'preco' ? 'Preço (R$)' : 'Desconto (%)'} htmlFor="cond-valor" className="sm:w-32">
              <input id="cond-valor" className={`${classeEntrada} num`} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={tipo === 'preco' && escolhido ? String(escolhido.preco).replace('.', ',') : '10'} />
            </Campo>
            <Botao variante="escuro" onClick={() => gravar({ produtoId: Number(produtoId), tipo, valor: lerNumero(valor) }, () => setValor(''))} disabled={ocupado || !produtoId}>
              Combinar
            </Botao>
          </div>
        ) : null}
      </section>
    </div>
  );
}
