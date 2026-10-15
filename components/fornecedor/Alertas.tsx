'use client';

// Alertas de preço para a loja: oficinas do mesmo estado pedem um produto por um preço. A loja aceita,
// faz uma contraproposta (outro preço ou uma quantidade mínima) ou diz que não dá; a oficina escolhe.
// O nome e o WhatsApp da oficina só aparecem no pedido, quando ela fecha com a loja.

import { BellRing, Check, MessageSquareQuote, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { responderAlertaPreco } from '@/app/fornecedor/acoes';
import { Filtro, LinhaDeFiltros } from '@/components/equipe/comum';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { aceiteEquivalente, embalagemComparavel, resumoDaResposta, textoDoPedidoDeAlerta, textoDoPreco, type AlertaParaLoja, type Embalagem } from '@/lib/alertas-dados';
import { nomeCategoria } from '@/lib/catalogo';
import { formatarDiaHora } from '@/lib/datas';
import { FUSO } from '@/lib/equipe-dados';
import { haQuantoTempo } from '@/lib/entregas-dados';
import { formatarMoeda, lerNumero } from '@/lib/formatos';
import type { ProdutoDaLoja } from '@/lib/alertas';

type Aba = 'responder' | 'respondidos' | 'terminados';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** O produto da loja que mais parece o pedido: o mesmo (pela chave), o da mesma viscosidade ou medida, ou o primeiro da categoria. */
export function produtoParecido(a: Pick<AlertaParaLoja, 'categoria' | 'chave' | 'especificacao'>, produtos: ProdutoDaLoja[]): ProdutoDaLoja | null {
  const daCategoria = produtos.filter((p) => p.categoria === a.categoria);
  if (!daCategoria.length) return null;
  const mesmo = daCategoria.find((p) => a.chave && p.chave === a.chave);
  if (mesmo) return mesmo;
  const e = a.especificacao;
  const parecido = daCategoria.find(
    (p) =>
      (typeof e.viscosidade === 'string' && p.especificacao.viscosidade === e.viscosidade) ||
      (typeof e.medida === 'string' && p.especificacao.medida === e.medida) ||
      (typeof e.amperagem === 'number' && p.especificacao.amperagem === e.amperagem)
  );
  return parecido ?? [...daCategoria].sort((x, y) => x.preco - y.preco)[0];
}

export function AlertasDaLoja({ alertas, produtos, uf }: { alertas: AlertaParaLoja[]; produtos: ProdutoDaLoja[]; uf: string | null }) {
  const [aba, setAba] = useState<Aba>('responder');
  const grupos = useMemo(
    () => ({
      responder: alertas.filter((a) => a.resultado === 'aberto' && !a.minha),
      respondidos: alertas.filter((a) => a.resultado === 'aberto' && !!a.minha),
      terminados: alertas.filter((a) => a.resultado !== 'aberto')
    }),
    [alertas]
  );
  const visiveis = grupos[aba];

  if (!uf)
    return (
      <Vazio titulo="Falta o estado da sua loja">
        Os alertas vêm das oficinas do mesmo estado da loja. Peça para a equipe do Revisaí completar o cadastro.
      </Vazio>
    );
  if (!produtos.length)
    return (
      <Vazio
        titulo="Cadastre os seus produtos"
        acao={
          <Link href="/fornecedor/produtos?novo=1" className={classeBotao('escuro')}>
            Cadastrar produto
          </Link>
        }
      >
        Você recebe os alertas das categorias que vende. Com os produtos cadastrados, dá para responder com um toque.
      </Vazio>
    );

  return (
    <div className="flex flex-col gap-5">
      <LinhaDeFiltros rotulo="Filtrar alertas">
        <Filtro ativo={aba === 'responder'} aoClicar={() => setAba('responder')} n={grupos.responder.length}>
          Para responder
        </Filtro>
        <Filtro ativo={aba === 'respondidos'} aoClicar={() => setAba('respondidos')} n={grupos.respondidos.length}>
          Respondidos
        </Filtro>
        <Filtro ativo={aba === 'terminados'} aoClicar={() => setAba('terminados')} n={grupos.terminados.length}>
          Terminados
        </Filtro>
      </LinhaDeFiltros>
      {visiveis.length ? (
        <ul className="flex flex-col gap-3">
          {visiveis.map((a) => (
            <li key={a.id}>
              <CartaoAlerta alerta={a} produtos={produtos} />
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo={aba === 'responder' ? 'Nenhum alerta esperando você' : aba === 'respondidos' ? 'Nenhuma resposta esperando a oficina' : 'Nada por aqui ainda'}>
          {aba === 'responder'
            ? `Quando uma oficina do ${uf} pedir um preço de algo que você vende, o alerta aparece aqui. Responda rápido: a oficina escolhe entre as lojas que responderam.`
            : 'Os alertas que você respondeu aparecem aqui até a oficina escolher.'}
        </Vazio>
      )}
    </div>
  );
}

const RESULTADOS: Record<AlertaParaLoja['resultado'], { nome: string; tom: 'oleo' | 'caneta' | 'ok' | 'atraso' | 'neutro' }> = {
  aberto: { nome: 'Aberto', tom: 'oleo' },
  voce: { nome: 'Fechou com você', tom: 'ok' },
  outra: { nome: 'Fechou com outra loja', tom: 'neutro' },
  cancelado: { nome: 'Cancelado pela oficina', tom: 'neutro' },
  vencido: { nome: 'Terminou', tom: 'neutro' }
};

function CartaoAlerta({ alerta: a, produtos }: { alerta: AlertaParaLoja; produtos: ProdutoDaLoja[] }) {
  const toast = useToast();
  const daCategoria = produtos.filter((p) => p.categoria === a.categoria);
  // "aceito o seu preço" só com a mesma embalagem (óleo pelo litro, filtro com filtro); com outra, contraproposta
  const comparaveis = daCategoria.filter((p) => embalagemComparavel(a, p));
  const sugerido = produtoParecido(a, produtos);
  const [modo, setModo] = useState<null | 'aceita' | 'contraproposta'>(null);
  const [produtoId, setProdutoId] = useState<number | null>(sugerido?.id ?? null);
  const [preco, setPreco] = useState('');
  const [minimo, setMinimo] = useState(String(a.quantidade));
  const [prazo, setPrazo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const produto = daCategoria.find((p) => p.id === produtoId) ?? sugerido;
  const aceite = produto ? aceiteEquivalente(a, produto) : null;
  const aceiteSugerido = sugerido && embalagemComparavel(a, sugerido) ? aceiteEquivalente(a, sugerido) : null;
  const agora = Date.now();
  const aberto = a.resultado === 'aberto';
  const r = RESULTADOS[a.resultado];

  function abrir(m: 'aceita' | 'contraproposta') {
    setErro(null);
    setModo(m);
    if (m === 'aceita' && (!produto || !embalagemComparavel(a, produto))) setProdutoId(produtoParecido(a, comparaveis)?.id ?? null);
    if (m === 'contraproposta' && produto) {
      const base = aceiteEquivalente(a, produto);
      setPreco((a.minha?.preco ?? Math.min(produto.preco - 0.01, r2(base.preco * 1.04))).toFixed(2).replace('.', ','));
      setMinimo(String(a.minha?.quantidadeMinima ?? base.quantidadeMinima));
    }
    if (a.minha) {
      setPrazo(a.minha.prazoEntrega ?? '');
      setMensagem(a.minha.mensagem ?? '');
    }
  }

  function mandar(tipo: 'aceita' | 'contraproposta' | 'recusa') {
    setErro(null);
    let entrada: Record<string, unknown> = { alertaId: a.id, tipo, mensagem };
    if (tipo !== 'recusa') {
      if (!produto) return setErro('Escolha o produto.');
      entrada = { ...entrada, produtoId: produto.id, prazoEntrega: prazo };
      if (tipo === 'contraproposta') {
        const valor = lerNumero(preco);
        const qtd = Number(minimo);
        if (valor == null || valor <= 0) return setErro('Escreva o preço da proposta.');
        if (!Number.isInteger(qtd) || qtd < 1 || qtd > 999) return setErro('A quantidade mínima vai de 1 a 999.');
        entrada = { ...entrada, preco: r2(valor), quantidadeMinima: qtd };
      }
    }
    iniciar(async () => {
      try {
        const res = await responderAlertaPreco(entrada);
        if (!res.ok) return setErro(res.erro);
        setModo(null);
        toast({ texto: tipo === 'recusa' ? 'Resposta mandada.' : 'Proposta mandada. A oficina escolhe entre as lojas que responderam.' });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={`Alerta de ${a.titulo}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] text-tinta-3">
            {nomeCategoria(a.categoria)}, oficina em {[a.cidade, a.uf].filter(Boolean).join(', ')}, {haQuantoTempo(a.criadoEm, agora)}
          </p>
          <p className="text-[17px] font-bold">{a.titulo}</p>
          <p className="mt-0.5 text-[15px]">
            Pede <strong>{textoDoPedidoDeAlerta(a)}</strong>
          </p>
        </div>
        <Chip tom={r.tom}>{r.nome}</Chip>
      </div>

      {sugerido ? (
        <p className="text-[14px] text-tinta-2">
          Você vende {sugerido.chave === a.chave ? 'esse produto' : sugerido.nome} por {formatarMoeda(sugerido.preco)}
          {aceiteSugerido && aceiteSugerido.preco !== a.precoAlvo ? `. Aceitar sai ${textoDoPreco(aceiteSugerido.preco, sugerido as Embalagem)}, mínimo ${aceiteSugerido.quantidadeMinima}` : ''}.
        </p>
      ) : null}
      {a.mensagem ? (
        <p className="flex items-start gap-1.5 text-[14px] text-tinta-2">
          <MessageSquareQuote size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> “{a.mensagem}”
        </p>
      ) : null}

      {a.minha ? (
        <p className={`rounded-xl px-3.5 py-2.5 text-[14px] ${a.minha.status === 'escolhida' ? 'bg-ok-claro text-ok' : 'bg-papel-2 text-tinta-2'}`}>
          Sua resposta: {resumoDaResposta(a.minha, produtos.find((p) => p.id === a.minha?.produtoId) ?? null).toLowerCase()}
          {a.minha.prazoEntrega ? `, entrega ${a.minha.prazoEntrega}` : ''}.
          {a.resultado === 'voce' && a.pedido ? (
            <>
              {' '}
              <Link href="/fornecedor/pedidos" className="font-semibold underline">
                Pedido {a.pedido}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {aberto ? (
        modo ? (
          <div className="flex flex-col gap-3 rounded-xl bg-papel-2 p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Produto" htmlFor={`prod-${a.id}`}>
                <select id={`prod-${a.id}`} className={classeEntrada} value={produto?.id ?? ''} onChange={(e) => setProdutoId(Number(e.target.value))}>
                  {(modo === 'aceita' ? comparaveis : daCategoria).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({formatarMoeda(p.preco)})
                    </option>
                  ))}
                </select>
              </Campo>
              {modo === 'aceita' ? (
                <div className="flex flex-col justify-end gap-1 text-[14px]">
                  <p className="text-tinta-3">Você vende por</p>
                  <p className="font-bold">{aceite && produto ? `${textoDoPreco(aceite.preco, produto as Embalagem)}, mínimo ${aceite.quantidadeMinima}` : ''}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Preço de cada (R$)" htmlFor={`preco-${a.id}`}>
                    <input id={`preco-${a.id}`} className={classeEntrada} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" />
                  </Campo>
                  <Campo rotulo="Mínimo" htmlFor={`min-${a.id}`}>
                    <input id={`min-${a.id}`} className={classeEntrada} value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                  </Campo>
                </div>
              )}
              <Campo rotulo="Entrega" htmlFor={`prazo-${a.id}`} dica="Ex.: hoje à tarde, amanhã cedo.">
                <input id={`prazo-${a.id}`} className={classeEntrada} value={prazo} onChange={(e) => setPrazo(e.target.value)} maxLength={60} />
              </Campo>
              <Campo rotulo="Recado (se quiser)" htmlFor={`msg-${a.id}`}>
                <input id={`msg-${a.id}`} className={classeEntrada} value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={300} />
              </Campo>
            </div>
            {erro ? (
              <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
                {erro}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Botao variante="fantasma" tamanho="pequeno" onClick={() => setModo(null)}>
                Voltar
              </Botao>
              <Botao variante="primario" onClick={() => mandar(modo)} disabled={enviando}>
                {enviando ? 'Mandando…' : modo === 'aceita' ? 'Mandar o aceite' : 'Mandar a proposta'}
              </Botao>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Botao
              variante="escuro"
              tamanho="pequeno"
              onClick={() => abrir('aceita')}
              disabled={!comparaveis.length}
              title={comparaveis.length ? undefined : 'Você não tem a mesma embalagem. Mande uma contraproposta.'}
            >
              <Check size={16} aria-hidden="true" /> {a.minha ? 'Mudar para aceito' : 'Aceito'}
            </Botao>
            <Botao tamanho="pequeno" onClick={() => abrir('contraproposta')} disabled={!sugerido}>
              <BellRing size={16} aria-hidden="true" /> {a.minha?.tipo === 'contraproposta' ? 'Mudar a proposta' : 'Contraproposta'}
            </Botao>
            {a.minha?.tipo !== 'recusa' ? (
              <Botao variante="fantasma" tamanho="pequeno" onClick={() => mandar('recusa')} disabled={enviando}>
                <X size={16} aria-hidden="true" /> Não tenho esse preço
              </Botao>
            ) : null}
            <span className="ml-auto text-[13px] text-tinta-3">Responda até {formatarDiaHora(a.expiraEm, new Date(), FUSO)}</span>
            {sugerido && !comparaveis.length ? <p className="w-full text-[13px] text-tinta-3">Você não tem a mesma embalagem. Mande uma contraproposta com o seu produto e preço.</p> : null}
          </div>
        )
      ) : null}
      {!modo && erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
    </article>
  );
}
