'use client';

// O pedido da oficina: produtos, quantidades, o preço (promoção ou o combinado com a oficina), cada
// loja com o prazo de entrega, o pedido mínimo e o cashback para usar, e o envio para as lojas. Só
// com a conta: o pedido sai pela oficina escolhida e o banco calcula os preços e confere o saldo.

import { Check, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { enviarPedido } from '@/app/acoes';
import { useConta } from '@/components/conta/ProvedorConta';
import { EscolhaDePagamento } from '@/components/fornecedor/EscolhaDePagamento';
import { Folha } from '@/components/Folha';
import { Botao, Campo, classeArea, classeEntrada } from '@/components/ui';
import type { FormaDePagamento } from '@/lib/loja/credito-dados';
import { textoDoPrazoDeEntrega } from '@/lib/loja/dados';
import { chaveDoProduto, precoComparavel } from '@/lib/precos';
import { formatarMoeda, formatarTelefone, normalizarTelefone } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import { abaixoDoMinimo, cashbackParaUsar, infoDoProduto, prazoDoProduto, precoParaOficina } from '@/lib/vitrine';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { BotaoEntrar, nomeComMarca, Passo, SeloEstoqueDaLoja } from './comum';
import { saldoNaLoja, useCondicoes } from './condicoes';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function Carrinho({ aberto, aoFechar, aoAcompanhar }: { aberto: boolean; aoFechar: () => void; aoAcompanhar?: (codigo: string) => void }) {
  const { catalogo, extras, produto, carregando, comPrecos } = useCatalogo();
  const condicoes = useCondicoes();
  const { conta, oficina: daConta } = useConta();
  const hoje = useHoje();
  const carrinho = useOficina((s) => s.carrinho);
  const definir = useOficina((s) => s.definirQuantidade);
  const limpar = useOficina((s) => s.limparCarrinho);
  const oficina = useOficina((s) => s.oficina);
  const salvarOficina = useOficina((s) => s.salvarOficina);
  const registrarPedido = useOficina((s) => s.registrarPedido);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<{ texto: string; entrar?: boolean } | null>(null);
  const [enviado, setEnviado] = useState<{ codigo: string; cashback: number } | null>(null);
  // as lojas em que a oficina quer usar o cashback
  const [usarCashback, setUsarCashback] = useState<Record<string, boolean>>({});
  // como pagar cada loja que deu crédito à oficina (sem escolha, Pix)
  const [pagamentos, setPagamentos] = useState<Record<string, FormaDePagamento>>({});
  const [enviando, iniciar] = useTransition();
  // o WhatsApp do cadastro da oficina vale mais; o do formulário entra quando a conta não tem
  const whatsappDaConta = daConta?.whatsapp ? normalizarTelefone(daConta.whatsapp) : null;

  const linhas = carrinho
    .map((c) => {
      const p = produto(c.produtoId);
      if (!p) return null;
      const { preco, promocao, especial } = precoParaOficina(p, catalogo.promocoes, hoje, c.quantidade, condicoes.condicoes);
      return { p, quantidade: c.quantidade, preco, promocao, especial, estoque: infoDoProduto(extras, p.id)?.estoque ?? null };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  // cada loja do pedido: as linhas, a soma, o mínimo e o cashback que dá para usar
  const lojas = useMemo(() => {
    const grupos: { fornecedorId: number; nome: string; linhas: typeof linhas; subtotal: number }[] = [];
    for (const l of linhas) {
      let g = grupos.find((x) => x.fornecedorId === l.p.fornecedorId);
      if (!g) {
        g = { fornecedorId: l.p.fornecedorId, nome: catalogo.fornecedores.find((f) => f.id === l.p.fornecedorId)?.nome ?? 'Loja', linhas: [], subtotal: 0 };
        grupos.push(g);
      }
      g.linhas.push(l);
      g.subtotal = r2(g.subtotal + l.preco * l.quantidade);
    }
    const abaixo = abaixoDoMinimo(
      grupos.map((g) => ({ fornecedorId: g.fornecedorId, total: g.subtotal })),
      extras
    );
    return grupos.map((g) => {
      const saldo = saldoNaLoja(condicoes, g.fornecedorId);
      const disponivel = comPrecos ? cashbackParaUsar(saldo, g.subtotal) : 0;
      return {
        ...g,
        // o prazo da entrega é o do item que demora mais
        prazo: textoDoPrazoDeEntrega(
          g.linhas.reduce<number | null>((maior, l) => {
            const h = prazoDoProduto(extras, l.p.id, g.fornecedorId);
            return h != null && (maior == null || h > maior) ? h : maior;
          }, null)
        ),
        minimo: abaixo.find((a) => a.fornecedorId === g.fornecedorId) ?? null,
        saldo,
        disponivel,
        usado: disponivel > 0 && usarCashback[String(g.fornecedorId)] ? disponivel : 0
      };
    });
  }, [linhas, catalogo, extras, condicoes, comPrecos, usarCashback]);

  const total = r2(lojas.reduce((s, g) => s + g.subtotal, 0));
  const cashbackUsado = r2(lojas.reduce((s, g) => s + g.usado, 0));
  // sem os preços (não carregaram), o banco confere o mínimo no envio
  const abaixoDoMinimoDaLoja = comPrecos ? lojas.filter((g) => g.minimo) : [];
  // produtos que saíram da loja desde que entraram no pedido
  const sairam = carregando ? [] : carrinho.filter((c) => !produto(c.produtoId));
  useEffect(() => {
    if (!sairam.length) return;
    for (const c of sairam) definir(c.produtoId, 0);
    setErro({ texto: sairam.length === 1 ? 'Um produto saiu da loja e foi tirado do pedido.' : `${sairam.length} produtos saíram da loja e foram tirados do pedido.` });
  }, [sairam.length]);

  function enviar() {
    setErro(null);
    if (!conta) return setErro({ texto: 'Entre na sua conta para enviar o pedido.', entrar: true });
    if (!whatsappDaConta && !normalizarTelefone(oficina.whatsapp)) return setErro({ texto: 'Escreva o WhatsApp da oficina, com DDD. É por ele que a loja fala com você.' });
    if (abaixoDoMinimoDaLoja.length) return setErro({ texto: `O pedido não chega ao mínimo da ${abaixoDoMinimoDaLoja[0].nome}. Ponha mais itens dela ou tire os dela do pedido.` });
    const cashback = Object.fromEntries(lojas.filter((g) => g.usado > 0).map((g) => [String(g.fornecedorId), g.usado]));
    const faturadas = Object.fromEntries(lojas.filter((g) => pagamentos[String(g.fornecedorId)] === 'faturado').map((g) => [String(g.fornecedorId), 'faturado' as const]));
    iniciar(async () => {
      let r: Awaited<ReturnType<typeof enviarPedido>>;
      try {
        r = await enviarPedido({
          itens: linhas.map((l) => ({ produtoId: l.p.id, quantidade: l.quantidade })),
          observacao: obs,
          contato: { whatsapp: oficina.whatsapp, cidade: oficina.cidade, uf: oficina.uf, endereco: oficina.endereco },
          cashback,
          pagamentos: faturadas
        });
      } catch {
        setErro({ texto: 'Não deu para falar com o servidor. Confira a internet e tente de novo. Se o app ficou aberto muito tempo, recarregue a página.' });
        return;
      }
      if (!r.ok) {
        // o saldo pode ter mudado (outro aparelho, estorno): busca de novo
        if (Object.keys(cashback).length) void condicoes.atualizar();
        return setErro({ texto: r.erro, entrar: !!r.semConta });
      }
      // o pedido fica guardado com os preços que o banco calculou
      const doCatalogo = new Map(linhas.map((l) => [l.p.id, l.p]));
      registrarPedido({
        codigo: r.codigo,
        quando: new Date().toISOString(),
        itens: r.itens.map((i) => {
          const p = doCatalogo.get(i.produtoId);
          return {
            produtoId: i.produtoId,
            nome: i.nome || p?.nome || 'Produto',
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
            fornecedorId: i.fornecedorId,
            fornecedor: i.fornecedor || catalogo.fornecedores.find((f) => f.id === i.fornecedorId)?.nome,
            ...(p ? { chave: chaveDoProduto(p), precoComparavel: precoComparavel(p, i.precoUnitario) } : {}),
            ...(i.combinado ? { combinado: true } : {})
          };
        }),
        total: r.total
      });
      setObs('');
      setUsarCashback({});
      setPagamentos({});
      setEnviado({ codigo: r.codigo, cashback: r.cashback });
      void condicoes.atualizar();
    });
  }

  function fechar() {
    setEnviado(null);
    setErro(null);
    aoFechar();
  }

  if (enviado) {
    return (
      <Folha
        aberta={aberto}
        aoFechar={fechar}
        titulo="Pedido enviado"
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Botao variante="fantasma" onClick={fechar}>
              Fechar
            </Botao>
            {aoAcompanhar ? (
              <Botao
                variante="primario"
                onClick={() => {
                  const codigo = enviado.codigo;
                  fechar();
                  aoAcompanhar(codigo);
                }}
              >
                Acompanhar o pedido
              </Botao>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-col items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ok-claro text-ok">
            <Check size={26} />
          </span>
          <p>
            Pedido <strong className="largo num tracking-wider">{enviado.codigo}</strong> recebido.
          </p>
          {enviado.cashback > 0 ? (
            <p className="text-ok">
              <strong className="num">{formatarMoeda(enviado.cashback)}</strong> do seu cashback já saíram do valor a pagar.
            </p>
          ) : null}
          <p className="text-tinta-2">
            A loja chama você no WhatsApp {formatarTelefone(whatsappDaConta ?? oficina.whatsapp)} para combinar a entrega. Dá para acompanhar o pedido e pagar por Pix aqui na Loja, em Pedidos. Os preços seguem as promoções de hoje.
          </p>
        </div>
      </Folha>
    );
  }

  return (
    <Folha
      aberta={aberto}
      aoFechar={fechar}
      titulo="Seu pedido"
      descricao={linhas.length ? `${linhas.length} ${linhas.length === 1 ? 'produto' : 'produtos'}${lojas.length > 1 ? ` de ${lojas.length} lojas` : ''}` : undefined}
      rodape={
        linhas.length ? (
          conta ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              {comPrecos ? (
                <p className="flex flex-col">
                  <span>
                    Total <strong className="largo num text-[19px]">{formatarMoeda(r2(total - cashbackUsado))}</strong>
                  </span>
                  {cashbackUsado > 0 ? <span className="num text-[13px] text-ok">{formatarMoeda(cashbackUsado)} de cashback já descontados</span> : null}
                </p>
              ) : (
                <span />
              )}
              <Botao variante="primario" tamanho="grande" onClick={enviar} disabled={enviando || abaixoDoMinimoDaLoja.length > 0}>
                {enviando ? 'Enviando…' : 'Enviar pedido'}
              </Botao>
            </div>
          ) : (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <p className="max-w-[36ch] text-[14px] text-tinta-2">Para ver os preços e enviar o pedido, entre na sua conta.</p>
              <BotaoEntrar />
            </div>
          )
        ) : undefined
      }
    >
      {linhas.length === 0 ? (
        <p className="text-tinta-2">{conta ? 'Nada no pedido ainda. Toque em Pôr nos produtos ou nas sugestões dos avisos.' : 'Nada no pedido. Entre na sua conta para comprar das lojas.'}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {lojas.map((g) => (
            <section key={g.fornecedorId} className="flex flex-col gap-2" aria-label={`Itens da ${g.nome}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-bold">{g.nome}</p>
                {g.prazo ? <p className="text-[13px] text-tinta-3">{g.prazo}</p> : null}
              </div>
              <ul className="divide-y divide-linha">
                {g.linhas.map((l) => (
                  <li key={l.p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <FotoProduto produto={l.p} tamanhos="48px" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-linha" />
                    <div className="min-w-0 flex-1">
                      <p className="leading-snug font-semibold">{nomeComMarca(l.p)}</p>
                      {comPrecos ? (
                        <p className="text-[13.5px] text-tinta-3">
                          {formatarMoeda(l.preco)} cada
                          {l.especial ? <span className="font-semibold text-caneta">, preço combinado com você</span> : l.promocao ? `, promoção ${l.promocao.titulo.toLowerCase()}` : ''}
                        </p>
                      ) : null}
                      {l.estoque != null && l.estoque > 0 && l.quantidade > l.estoque ? (
                        <p className="text-[13px] font-semibold text-oleo-tinta">A loja informou só {l.estoque} no estoque. Ela confirma o que tem.</p>
                      ) : (
                        <SeloEstoqueDaLoja estoque={l.estoque} pequeno />
                      )}
                    </div>
                    <Passo valor={l.quantidade} aoMudar={(n) => definir(l.p.id, n)} rotulo={l.p.nome} />
                    {comPrecos ? <span className="num w-24 text-right font-semibold">{formatarMoeda(l.preco * l.quantidade)}</span> : null}
                    <button type="button" className="text-[13px] font-semibold text-tinta-3 hover:text-atraso" onClick={() => definir(l.p.id, 0)}>
                      Tirar
                    </button>
                  </li>
                ))}
              </ul>
              {comPrecos && lojas.length > 1 ? (
                <p className="num text-right text-[14px] text-tinta-2">
                  Na {g.nome}: <strong className="text-tinta">{formatarMoeda(g.subtotal)}</strong>
                </p>
              ) : null}
              {comPrecos && g.minimo ? (
                <p className="rounded-xl bg-oleo-claro px-3.5 py-2.5 text-[14px] text-oleo-tinta" role="status">
                  O pedido mínimo da {g.nome} é de <strong className="num">{formatarMoeda(g.minimo.minimo)}</strong>. Faltam <strong className="num">{formatarMoeda(g.minimo.falta)}</strong>: ponha mais itens dela ou tire os dela do pedido.
                </p>
              ) : null}
              {comPrecos && g.disponivel > 0 ? (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-ok-claro px-3.5 py-2.5 text-[14px] text-ok">
                  <input
                    type="checkbox"
                    checked={!!usarCashback[String(g.fornecedorId)]}
                    onChange={(e) => setUsarCashback((a) => ({ ...a, [String(g.fornecedorId)]: e.target.checked }))}
                    className="h-[18px] w-[18px] shrink-0 accent-[var(--ok)]"
                  />
                  <Wallet size={17} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    Usar <strong className="num">{formatarMoeda(g.disponivel)}</strong> do seu cashback na {g.nome}
                    {g.saldo > g.disponivel ? <span className="num"> (você tem {formatarMoeda(g.saldo)})</span> : null}
                  </span>
                </label>
              ) : comPrecos && g.saldo < 0 ? (
                <p className="text-[13px] text-tinta-3">
                  Seu cashback na {g.nome} está em <span className="num">{formatarMoeda(g.saldo)}</span> porque um pagamento foi desfeito. Os próximos créditos cobrem isso primeiro.
                </p>
              ) : null}
            </section>
          ))}
          {conta && comPrecos ? (
            <EscolhaDePagamento
              lojas={lojas.map((g) => ({ id: g.fornecedorId, nome: g.nome, subtotal: r2(g.subtotal - g.usado) }))}
              total={total}
              valor={pagamentos}
              aoMudar={setPagamentos}
            />
          ) : null}
          {conta ? (
            <div className="grid gap-3 rounded-xl bg-papel-2 p-4 sm:grid-cols-2">
              <p className="text-[14px] font-semibold sm:col-span-2">Para a loja falar com você</p>
              <p className="-mt-2 text-[13px] text-tinta-3 sm:col-span-2">
                O pedido sai em nome de <strong className="text-tinta-2">{daConta?.nome ?? oficina.nome}</strong>
                {whatsappDaConta ? `, com o WhatsApp ${formatarTelefone(whatsappDaConta)} do cadastro da oficina` : ''}.
              </p>
              {whatsappDaConta ? null : (
                <Campo rotulo="WhatsApp" htmlFor="ped-whats">
                  <input id="ped-whats" className={classeEntrada} value={oficina.whatsapp} onChange={(e) => salvarOficina({ whatsapp: e.target.value })} inputMode="tel" />
                </Campo>
              )}
              <Campo rotulo="Endereço para entrega" htmlFor="ped-end" className="sm:col-span-2">
                <input id="ped-end" className={classeEntrada} value={oficina.endereco} onChange={(e) => salvarOficina({ endereco: e.target.value })} maxLength={160} autoComplete="street-address" placeholder="Rua, número, bairro" />
              </Campo>
              <Campo rotulo="Observação" htmlFor="ped-obs" className="sm:col-span-2" dica="Ex.: entregar até sexta, pagar no PIX.">
                <textarea id="ped-obs" rows={2} className={classeArea} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} />
              </Campo>
            </div>
          ) : null}
          {erro ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
              <p>{erro.texto}</p>
              {erro.entrar ? <BotaoEntrar rotulo="Entrar" pequeno /> : null}
            </div>
          ) : null}
          <button type="button" className="self-start text-[14px] font-semibold text-tinta-3 hover:text-atraso" onClick={limpar}>
            Esvaziar pedido
          </button>
        </div>
      )}
    </Folha>
  );
}
