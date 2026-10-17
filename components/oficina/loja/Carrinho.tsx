'use client';

// O pedido da oficina: produtos, quantidades, preço de promoção e o envio para as lojas. Só com a
// conta: o pedido sai pela oficina escolhida e o banco calcula os preços.

import { Check } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { enviarPedido } from '@/app/acoes';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { Botao, Campo, classeArea, classeEntrada } from '@/components/ui';
import { precoNaQuantidade } from '@/lib/catalogo';
import { chaveDoProduto, precoComparavel } from '@/lib/precos';
import { formatarMoeda, formatarTelefone, normalizarTelefone } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { BotaoEntrar, nomeComMarca, Passo } from './comum';

export function Carrinho({ aberto, aoFechar, aoAcompanhar }: { aberto: boolean; aoFechar: () => void; aoAcompanhar?: (codigo: string) => void }) {
  const { catalogo, produto, carregando, comPrecos } = useCatalogo();
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
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  // o WhatsApp do cadastro da oficina vale mais; o do formulário entra quando a conta não tem
  const whatsappDaConta = daConta?.whatsapp ? normalizarTelefone(daConta.whatsapp) : null;

  const linhas = carrinho
    .map((c) => {
      const p = produto(c.produtoId);
      if (!p) return null;
      const { preco, promocao } = precoNaQuantidade(p, catalogo.promocoes, hoje, c.quantidade);
      return { p, quantidade: c.quantidade, preco, promocao };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const total = linhas.reduce((s, l) => s + l.preco * l.quantidade, 0);
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
    iniciar(async () => {
      let r: Awaited<ReturnType<typeof enviarPedido>>;
      try {
        r = await enviarPedido({
          itens: linhas.map((l) => ({ produtoId: l.p.id, quantidade: l.quantidade })),
          observacao: obs,
          contato: { whatsapp: oficina.whatsapp, cidade: oficina.cidade, uf: oficina.uf, endereco: oficina.endereco }
        });
      } catch {
        setErro({ texto: 'Não deu para falar com o servidor. Confira a internet e tente de novo. Se o app ficou aberto muito tempo, recarregue a página.' });
        return;
      }
      if (!r.ok) return setErro({ texto: r.erro, entrar: !!r.semConta });
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
      setEnviado(r.codigo);
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
                  const codigo = enviado;
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
            Pedido <strong className="largo num tracking-wider">{enviado}</strong> recebido.
          </p>
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
      descricao={linhas.length ? `${linhas.length} ${linhas.length === 1 ? 'produto' : 'produtos'}` : undefined}
      rodape={
        linhas.length ? (
          conta ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <p>{comPrecos ? <>Total <strong className="largo num text-[19px]">{formatarMoeda(total)}</strong></> : null}</p>
              <Botao variante="primario" tamanho="grande" onClick={enviar} disabled={enviando}>
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
          <ul className="divide-y divide-linha">
            {linhas.map((l) => (
              <li key={l.p.id} className="flex flex-wrap items-center gap-3 py-3">
                <FotoProduto produto={l.p} tamanhos="48px" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-linha" />
                <div className="min-w-0 flex-1">
                  <p className="leading-snug font-semibold">{nomeComMarca(l.p)}</p>
                  {comPrecos ? (
                    <p className="text-[13.5px] text-tinta-3">
                      {formatarMoeda(l.preco)} cada
                      {l.promocao ? `, promoção ${l.promocao.titulo.toLowerCase()}` : ''}
                    </p>
                  ) : null}
                </div>
                <Passo valor={l.quantidade} aoMudar={(n) => definir(l.p.id, n)} rotulo={l.p.nome} />
                {comPrecos ? <span className="num w-24 text-right font-semibold">{formatarMoeda(l.preco * l.quantidade)}</span> : null}
                <button type="button" className="text-[13px] font-semibold text-tinta-3 hover:text-atraso" onClick={() => definir(l.p.id, 0)}>
                  Tirar
                </button>
              </li>
            ))}
          </ul>
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
