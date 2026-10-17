'use client';

// Entrada no estoque pelo XML da nota de compra: lê a nota aqui no aparelho, acha cada produto no
// estoque (ou cria o produto novo), converte a embalagem (balde de 20 L, jogo com 4) e, com a
// confirmação, dá a entrada com o custo de verdade. As duplicatas viram contas a pagar.

import { FileUp, PackageCheck, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, classeEntrada } from '@/components/ui';
import { CATEGORIAS } from '@/lib/catalogo';
import { dataLocal, formatarData } from '@/lib/datas';
import { textoQuantidade, unidadeDaCategoria } from '@/lib/estoque';
import { formatarMoeda, formatarNumero, lerNumero } from '@/lib/formatos';
import {
  casarNota,
  categoriaSugerida,
  contasDaNota,
  custoPorUnidade,
  fatorSugerido,
  formatarChave,
  lerNotaFiscal,
  nomeDoProduto,
  notaJaLancada,
  type ComoAchou,
  type ItemNota,
  type NotaFiscal
} from '@/lib/nfe-xml';
import { useOficina } from '@/lib/store';
import type { Categoria, Id, ItemEstoque, UnidadeEstoque } from '@/lib/tipos';

interface Linha {
  incluir: boolean;
  itemId: Id | null;
  como: ComoAchou | null;
  nome: string;
  categoria: Categoria;
  unidade: UnidadeEstoque;
  fator: string;
  quantidade: string;
  custo: string;
  mexeuQuantidade: boolean;
  mexeuCusto: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function textoNumero(n: number | null, casas = 2): string {
  return n == null || !Number.isFinite(n) ? '' : formatarNumero(n, casas);
}

/** Os números da linha depois de mudar o fator (o que a pessoa já mexeu fica). */
function recalcular(l: Linha, item: ItemNota): Linha {
  const fator = lerNumero(l.fator) ?? 0;
  const quantidade = l.mexeuQuantidade ? l.quantidade : textoNumero(r2(item.quantidade * fator), 3);
  const q = lerNumero(quantidade) ?? 0;
  const custo = l.mexeuCusto ? l.custo : textoNumero(q > 0 ? custoPorUnidade({ custoTotal: item.custoTotal, quantidade: q }, 1) : null);
  return { ...l, quantidade, custo };
}

function linhaInicial(item: ItemNota, casamento: { itemId: Id | null; como: ComoAchou | null }, estoque: Record<Id, ItemEstoque>): Linha {
  const alvo = casamento.itemId ? estoque[casamento.itemId] : undefined;
  const categoria = alvo?.categoria ?? categoriaSugerida(item.descricao, item.ncm);
  const unidade = alvo?.unidade ?? unidadeDaCategoria(categoria);
  const base: Linha = {
    incluir: true,
    itemId: alvo?.id ?? null,
    como: alvo ? casamento.como : null,
    nome: nomeDoProduto(item.descricao),
    categoria,
    unidade,
    fator: textoNumero(fatorSugerido(item, unidade), 3),
    quantidade: '',
    custo: '',
    mexeuQuantidade: false,
    mexeuCusto: false
  };
  return recalcular(base, item);
}

const COMO: Record<ComoAchou, { texto: string; tom: 'ok' | 'oleo' }> = {
  ean: { texto: 'Mesmo código de barras', tom: 'ok' },
  codigo: { texto: 'Mesmo código do fornecedor', tom: 'ok' },
  nome: { texto: 'Nome parecido, confira', tom: 'oleo' }
};

export function EntradaPelaNota() {
  const toast = useToast();
  const arquivo = useRef<HTMLInputElement>(null);
  const [nota, setNota] = useState<NotaFiscal | null>(null);

  async function abrir(f: File | undefined) {
    if (!f) return;
    if (f.size > 5_000_000) return toast({ texto: 'O arquivo é grande demais para uma nota fiscal.', tom: 'erro' });
    const r = lerNotaFiscal(await f.text());
    if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
    const s = useOficina.getState();
    const quando = notaJaLancada(r.nota.chave, Object.values(s.movimentos), Object.values(s.lancamentos));
    if (quando) return toast({ texto: `A NF-e nº ${r.nota.numero} de ${r.nota.emitente.nome} já entrou no estoque em ${formatarData(dataLocal(quando))}. Não dá para lançar a mesma nota duas vezes.`, tom: 'erro' });
    setNota(r.nota);
  }

  return (
    <>
      <input
        ref={arquivo}
        type="file"
        accept=".xml,text/xml,application/xml"
        className="sr-only"
        tabIndex={-1}
        aria-label="Arquivo XML da nota de compra"
        data-testid="arquivo-nota"
        onChange={(e) => {
          void abrir(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Botao onClick={() => arquivo.current?.click()}>
        <FileUp size={18} aria-hidden="true" /> Nota de compra (XML)
      </Botao>
      {nota ? <FolhaNota key={nota.chave} nota={nota} aoFechar={() => setNota(null)} /> : null}
    </>
  );
}

function FolhaNota({ nota, aoFechar }: { nota: NotaFiscal; aoFechar: () => void }) {
  const { oficina } = useConta();
  const gestao = !oficina || oficina.papel !== 'mecanico';
  const estoque = useOficina((s) => s.estoque);
  const toast = useToast();
  const itens = useMemo(() => Object.values(estoque).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [estoque]);
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const s = useOficina.getState();
    const casamentos = casarNota(nota, Object.values(s.estoque), Object.values(s.movimentos));
    return nota.itens.map((item, i) => linhaInicial(item, casamentos[i], s.estoque));
  });
  const [comContas, setComContas] = useState(gestao && nota.duplicatas.length > 0);
  const [erro, setErro] = useState<string | null>(null);

  function mudar(i: number, m: Partial<Linha>, recalc = true) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? (recalc ? recalcular({ ...l, ...m }, nota.itens[i]) : { ...l, ...m }) : l)));
  }

  function ligar(i: number, valor: string) {
    const item = valor ? estoque[valor] : undefined;
    const atual = linhas[i];
    const unidade = item?.unidade ?? unidadeDaCategoria(atual.categoria);
    mudar(i, {
      itemId: item?.id ?? null,
      como: null,
      unidade,
      categoria: item?.categoria ?? atual.categoria,
      fator: textoNumero(fatorSugerido(nota.itens[i], unidade), 3),
      mexeuQuantidade: false,
      mexeuCusto: false
    });
  }

  function confirmar() {
    setErro(null);
    const lancar = linhas.map((l, i) => ({ l, item: nota.itens[i] })).filter((x) => x.l.incluir);
    for (const { l, item } of lancar) {
      const q = lerNumero(l.quantidade);
      if (q == null || q <= 0) return setErro(`Confira a quantidade de ${item.descricao}.`);
      const c = lerNumero(l.custo);
      if (l.custo.trim() && (c == null || c < 0)) return setErro(`Confira o custo de ${item.descricao}.`);
      if (!l.itemId && l.nome.trim().length < 2) return setErro('Escreva o nome do produto novo.');
    }
    const s = useOficina.getState();
    // a mesma nota pode ter chegado por outro aparelho enquanto a tela estava aberta
    if (notaJaLancada(nota.chave, Object.values(s.movimentos), Object.values(s.lancamentos))) return setErro('Esta nota acabou de entrar no estoque por outro aparelho.');
    let novos = 0;
    for (const { l, item } of lancar) {
      const q = lerNumero(l.quantidade)!;
      const custo = lerNumero(l.custo);
      const codigos = { ...(item.ean ? { ean: item.ean } : {}), ...(item.ncm ? { ncm: item.ncm } : {}), ...(item.codigo ? { codigoFornecedor: item.codigo } : {}) };
      let itemId = l.itemId && s.estoque[l.itemId] ? l.itemId : null;
      if (itemId) {
        const atual = useOficina.getState().estoque[itemId];
        // o código de barras que já estava fica; o NCM e o código do fornecedor ficam os da última nota
        s.salvarItemEstoque({ ...atual, ...codigos, ...(atual.ean ? { ean: atual.ean } : {}) });
      } else {
        itemId = s.salvarItemEstoque({ nome: l.nome.trim(), categoria: l.categoria, unidade: l.unidade, quantidade: 0, minimo: 0, custo: null, preco: null, ...codigos });
        novos++;
      }
      s.moverEstoque({
        itemId,
        tipo: 'entrada',
        quantidade: q,
        custoUnitario: custo && custo > 0 ? custo : null,
        fornecedor: nota.emitente.nome,
        origem: { tipo: 'nota', id: nota.chave, rotulo: `NF-e nº ${nota.numero}` }
      });
    }
    let contas = 0;
    if (comContas && gestao) {
      for (const c of contasDaNota(nota)) {
        s.salvarRegistro('lancamentos', c);
        contas++;
      }
    }
    const partes = [`${lancar.length} ${lancar.length === 1 ? 'produto entrou' : 'produtos entraram'} no estoque`, novos ? `${novos} ${novos === 1 ? 'novo' : 'novos'}` : '', contas ? `${contas} ${contas === 1 ? 'conta a pagar lançada' : 'contas a pagar lançadas'}` : ''].filter(Boolean);
    toast({ texto: `NF-e nº ${nota.numero}: ${partes.join(', ')}.` });
    aoFechar();
  }

  const incluidas = linhas.filter((l) => l.incluir).length;
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={`NF-e nº ${nota.numero}, de ${nota.emitente.nome}`}
      descricao={`Emitida em ${formatarData(nota.emissao)}, ${formatarMoeda(nota.total)}. Confira cada produto: ligue ao que já tem no estoque ou deixe como novo.`}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={confirmar} disabled={!incluidas}>
            <PackageCheck size={17} aria-hidden="true" /> Dar entrada{incluidas ? ` (${incluidas})` : ''}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3" aria-label="Produtos da nota">
          {linhas.map((l, i) => {
            const item = nota.itens[i];
            const unidade = l.unidade === 'L' ? 'L' : 'un';
            const q = lerNumero(l.quantidade);
            return (
              <li key={item.numero} className={`flex flex-col gap-3 rounded-2xl px-3.5 py-3 ring-1 ring-linha ${l.incluir ? 'bg-papel' : 'bg-papel-2 opacity-70'}`} data-testid="linha-nota">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-tinta)]"
                    checked={l.incluir}
                    onChange={(e) => mudar(i, { incluir: e.target.checked }, false)}
                    aria-label={`Lançar ${item.descricao}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug font-bold">{item.descricao}</p>
                    <p className="text-[13px] text-tinta-3">
                      {formatarNumero(item.quantidade, 3)} {item.unidade} × {formatarMoeda(item.valorUnitario)}
                      {item.custoTotal !== item.valorTotal ? `, ${formatarMoeda(item.custoTotal)} com impostos e frete` : `, ${formatarMoeda(item.valorTotal)}`}
                      {item.ean ? ` · código de barras ${item.ean}` : ''} · cód. {item.codigo}
                    </p>
                  </div>
                </div>
                {l.incluir ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[13px] font-semibold sm:col-span-2">
                      <span className="flex flex-wrap items-center gap-2">
                        No estoque
                        {l.como ? <Chip tom={COMO[l.como].tom}>{COMO[l.como].texto}</Chip> : !l.itemId ? <Chip tom="caneta">Produto novo</Chip> : null}
                      </span>
                      <select className={classeEntrada} value={l.itemId ?? ''} onChange={(e) => ligar(i, e.target.value)} aria-label={`Produto do estoque para ${item.descricao}`}>
                        <option value="">Cadastrar como produto novo</option>
                        {itens.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.marca && !x.nome.toLowerCase().includes(x.marca.toLowerCase()) ? `${x.marca} ${x.nome}` : x.nome} ({textoQuantidade(x.quantidade, x.unidade)})
                          </option>
                        ))}
                      </select>
                    </label>
                    {!l.itemId ? (
                      <>
                        <label className="flex flex-col gap-1 text-[13px] font-semibold sm:col-span-2">
                          Nome do produto novo
                          <input className={classeEntrada} value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value }, false)} />
                        </label>
                        <label className="flex flex-col gap-1 text-[13px] font-semibold">
                          Categoria
                          <select
                            className={classeEntrada}
                            value={l.categoria}
                            onChange={(e) => {
                              const categoria = e.target.value as Categoria;
                              const unid = unidadeDaCategoria(categoria);
                              mudar(i, { categoria, unidade: unid, fator: textoNumero(fatorSugerido(item, unid), 3), mexeuQuantidade: false, mexeuCusto: false });
                            }}
                          >
                            {CATEGORIAS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[13px] font-semibold">
                          Conta em
                          <select
                            className={classeEntrada}
                            value={l.unidade}
                            onChange={(e) => {
                              const unid = e.target.value as UnidadeEstoque;
                              mudar(i, { unidade: unid, fator: textoNumero(fatorSugerido(item, unid), 3), mexeuQuantidade: false, mexeuCusto: false });
                            }}
                          >
                            <option value="un">Unidades</option>
                            <option value="L">Litros</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label className="flex flex-col gap-1 text-[13px] font-semibold">
                      1 {item.unidade} da nota = quantos {unidade === 'L' ? 'litros' : 'unidades'}
                      <input className={`${classeEntrada} num`} value={l.fator} onChange={(e) => mudar(i, { fator: e.target.value })} inputMode="decimal" />
                    </label>
                    <label className="flex flex-col gap-1 text-[13px] font-semibold">
                      Entra no estoque ({unidade === 'L' ? 'litros' : 'unidades'})
                      <input className={`${classeEntrada} num`} value={l.quantidade} onChange={(e) => mudar(i, { quantidade: e.target.value, mexeuQuantidade: true })} inputMode="decimal" />
                    </label>
                    <label className="flex flex-col gap-1 text-[13px] font-semibold sm:col-span-2">
                      Custo por {unidade === 'L' ? 'litro' : 'unidade'} (com impostos e frete)
                      <input className={`${classeEntrada} num`} value={l.custo} onChange={(e) => mudar(i, { custo: e.target.value, mexeuCusto: true })} inputMode="decimal" placeholder="0,00" />
                    </label>
                    {q != null && q > 0 ? (
                      <p className="text-[13px] text-tinta-2 sm:col-span-2">
                        Entram {textoQuantidade(q, l.unidade)}
                        {lerNumero(l.custo) ? ` a ${formatarMoeda(lerNumero(l.custo))} por ${unidade === 'L' ? 'litro' : 'unidade'}` : ''}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {nota.duplicatas.length && gestao ? (
          <label className="flex items-start gap-3 rounded-2xl bg-papel-2 px-3.5 py-3">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-tinta)]" checked={comContas} onChange={(e) => setComContas(e.target.checked)} />
            <span className="min-w-0">
              <span className="block font-semibold">
                Lançar {nota.duplicatas.length === 1 ? 'a duplicata' : `as ${nota.duplicatas.length} duplicatas`} em contas a pagar
              </span>
              <span className="block text-[13.5px] text-tinta-2">
                {nota.duplicatas.map((d) => `${formatarMoeda(d.valor)} em ${formatarData(d.vencimento)}`).join('; ')}. Para {nota.emitente.nome}.
              </span>
            </span>
          </label>
        ) : null}

        <p className="text-[12.5px] text-tinta-3">Chave {formatarChave(nota.chave)}</p>
        {erro ? (
          <p className="flex items-start gap-2 text-[14px] text-atraso" role="alert">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {erro}
          </p>
        ) : null}
      </div>
    </Folha>
  );
}
