'use client';

// O pedido da oficina: produtos, quantidades, preço de promoção e o envio para a equipe.

import { Check } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { enviarPedido } from '@/app/acoes';
import { Folha } from '@/components/Folha';
import { Botao, Campo, classeArea, classeEntrada } from '@/components/ui';
import { precoNaQuantidade } from '@/lib/catalogo';
import { chaveDoProduto, precoComparavel } from '@/lib/precos';
import { formatarMoeda, formatarTelefone, normalizarTelefone } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { nomeComMarca, Passo } from './comum';

export function Carrinho({ aberto, aoFechar, aoAcompanhar }: { aberto: boolean; aoFechar: () => void; aoAcompanhar?: (codigo: string) => void }) {
  const { catalogo, produto, carregando } = useCatalogo();
  const hoje = useHoje();
  const carrinho = useOficina((s) => s.carrinho);
  const definir = useOficina((s) => s.definirQuantidade);
  const limpar = useOficina((s) => s.limparCarrinho);
  const oficina = useOficina((s) => s.oficina);
  const salvarOficina = useOficina((s) => s.salvarOficina);
  const registrarPedido = useOficina((s) => s.registrarPedido);
  const garantirAparelhoId = useOficina((s) => s.garantirAparelhoId);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

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
    setErro(sairam.length === 1 ? 'Um produto saiu da loja e foi tirado do pedido.' : `${sairam.length} produtos saíram da loja e foram tirados do pedido.`);
  }, [sairam.length]);

  function enviar() {
    setErro(null);
    if (!oficina.nome.trim()) return setErro('Escreva o nome da oficina.');
    if (!normalizarTelefone(oficina.whatsapp)) return setErro('Escreva o WhatsApp da oficina, com DDD. É por ele que o fornecedor fala com você.');
    iniciar(async () => {
      let r: Awaited<ReturnType<typeof enviarPedido>>;
      try {
        r = await enviarPedido({
          oficina: { nome: oficina.nome, whatsapp: oficina.whatsapp, cidade: oficina.cidade, uf: oficina.uf },
          itens: linhas.map((l) => ({ produtoId: l.p.id, quantidade: l.quantidade })),
          observacao: obs,
          aparelhoId: garantirAparelhoId(),
          endereco: oficina.endereco
        });
      } catch {
        setErro('Não deu para falar com o servidor. Confira a internet e tente de novo. Se o app ficou aberto muito tempo, recarregue a página.');
        return;
      }
      if (!r.ok) return setErro(r.erro);
      registrarPedido({
        codigo: r.codigo,
        quando: new Date().toISOString(),
        itens: linhas.map((l) => ({
          produtoId: l.p.id,
          nome: l.p.nome,
          quantidade: l.quantidade,
          precoUnitario: l.preco,
          fornecedorId: l.p.fornecedorId,
          fornecedor: catalogo.fornecedores.find((f) => f.id === l.p.fornecedorId)?.nome,
          chave: chaveDoProduto(l.p),
          precoComparavel: precoComparavel(l.p, l.preco)
        })),
        total: r.total ?? Math.round(total * 100) / 100
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
            A loja chama você no WhatsApp {formatarTelefone(oficina.whatsapp)} para combinar a entrega. Dá para acompanhar o pedido e pagar por Pix aqui na Loja, em Pedidos. Os preços seguem as promoções de hoje.
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
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p>
              Total <strong className="largo num text-[19px]">{formatarMoeda(total)}</strong>
            </p>
            <Botao variante="primario" tamanho="grande" onClick={enviar} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </Botao>
          </div>
        ) : undefined
      }
    >
      {linhas.length === 0 ? (
        <p className="text-tinta-2">Nada no pedido ainda. Toque em Pôr nos produtos ou nas sugestões dos avisos.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="divide-y divide-linha">
            {linhas.map((l) => (
              <li key={l.p.id} className="flex flex-wrap items-center gap-3 py-3">
                <FotoProduto produto={l.p} tamanhos="48px" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-linha" />
                <div className="min-w-0 flex-1">
                  <p className="leading-snug font-semibold">{nomeComMarca(l.p)}</p>
                  <p className="text-[13.5px] text-tinta-3">
                    {formatarMoeda(l.preco)} cada
                    {l.promocao ? `, promoção ${l.promocao.titulo.toLowerCase()}` : ''}
                  </p>
                </div>
                <Passo valor={l.quantidade} aoMudar={(n) => definir(l.p.id, n)} rotulo={l.p.nome} />
                <span className="num w-24 text-right font-semibold">{formatarMoeda(l.preco * l.quantidade)}</span>
                <button type="button" className="text-[13px] font-semibold text-tinta-3 hover:text-atraso" onClick={() => definir(l.p.id, 0)}>
                  Tirar
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 rounded-xl bg-papel-2 p-4 sm:grid-cols-2">
            <p className="text-[14px] font-semibold sm:col-span-2">Para o fornecedor falar com você</p>
            <Campo rotulo="Oficina" htmlFor="ped-nome">
              <input id="ped-nome" className={classeEntrada} value={oficina.nome} onChange={(e) => salvarOficina({ nome: e.target.value })} />
            </Campo>
            <Campo rotulo="WhatsApp" htmlFor="ped-whats">
              <input id="ped-whats" className={classeEntrada} value={oficina.whatsapp} onChange={(e) => salvarOficina({ whatsapp: e.target.value })} inputMode="tel" />
            </Campo>
            <Campo rotulo="Endereço para entrega" htmlFor="ped-end" className="sm:col-span-2">
              <input id="ped-end" className={classeEntrada} value={oficina.endereco} onChange={(e) => salvarOficina({ endereco: e.target.value })} maxLength={160} autoComplete="street-address" placeholder="Rua, número, bairro" />
            </Campo>
            <Campo rotulo="Observação" htmlFor="ped-obs" className="sm:col-span-2" dica="Ex.: entregar até sexta, pagar no PIX.">
              <textarea id="ped-obs" rows={2} className={classeArea} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} />
            </Campo>
          </div>
          {erro ? (
            <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
              {erro}
            </p>
          ) : null}
          <button type="button" className="self-start text-[14px] font-semibold text-tinta-3 hover:text-atraso" onClick={limpar}>
            Esvaziar pedido
          </button>
        </div>
      )}
    </Folha>
  );
}
