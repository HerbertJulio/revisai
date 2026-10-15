'use client';

// Alerta de preço na loja da oficina: pedir um preço às lojas do estado, ver as respostas, fechar com
// a melhor (o pedido sai com o preço combinado) e comprar mais alertas quando os do mês acabam.

import { BellRing, Check, Copy, MapPin, MessageSquareQuote, Tag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { comprarAlertas, desistirDoAlerta, fecharComLoja, mandarAlerta } from '@/app/oficina/acoes-loja';
import { Folha } from '@/components/Folha';
import { QrCode } from '@/components/QrCode';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import {
  ALERTAS,
  faseDoAlerta,
  escolherAte,
  faixaParaFechar,
  PACOTES_ALERTAS,
  propostasEmOrdem,
  resumoDaResposta,
  textoDoPedidoDeAlerta,
  textoDoPreco,
  type AlertaDaOficina,
  type CotaAlertas,
  type FaseAlerta,
  type RespostaDoAlerta
} from '@/lib/alertas-dados';
import { nomeCategoria, precoNaQuantidade, quantidadeComUnidade, type Produto } from '@/lib/catalogo';
import { formatarDiaHora } from '@/lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, plural } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { litrosPorUnidade } from '@/lib/catalogo';
import { chaveDoProduto, ultimoPrecoPago } from '@/lib/precos';
import { useOficina } from '@/lib/store';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { usePlano } from '../plano';
import { codigoProGuardado, useAndamento } from './andamento';
import { nomeComMarca, Passo } from './comum';
import { usePrecosPagos } from './precos';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "R$ 24,90" vira "24,90" para o campo. */
function paraCampo(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

const FASES: Record<FaseAlerta, { nome: string; tom: 'oleo' | 'caneta' | 'ok' | 'atraso' | 'neutro' }> = {
  esperando: { nome: 'Esperando as lojas', tom: 'oleo' },
  escolher: { nome: 'Escolha uma proposta', tom: 'caneta' },
  fechado: { nome: 'Fechado', tom: 'ok' },
  cancelado: { nome: 'Cancelado', tom: 'neutro' },
  vencido: { nome: 'Terminou sem proposta', tom: 'neutro' }
};

export function faseVisivel(a: AlertaDaOficina, agora = Date.now()): FaseAlerta {
  return faseDoAlerta(a, propostasEmOrdem(a).length, agora);
}

/** "2 propostas, a melhor por R$ 23,50 cada" ou "Nenhuma resposta ainda". */
export function resumoDoAlerta(a: AlertaDaOficina): string {
  const propostas = propostasEmOrdem(a);
  if (a.status === 'fechado') return a.pedido ? `Pedido ${a.pedido} feito` : 'Pedido feito';
  if (!propostas.length) {
    const recusas = a.respostas.filter((r) => r.tipo === 'recusa').length;
    return recusas ? `${plural(recusas, 'loja disse', 'lojas disseram')} que não dá` : 'Nenhuma resposta ainda';
  }
  const melhor = propostas[0];
  return `${plural(propostas.length, 'proposta', 'propostas')}, a melhor ${textoDoPreco(melhor.preco!, melhor.produto)}`;
}

// ---------------------------------------------------------------- na ficha do produto

/** Embaixo da comparação de preço: pedir um preço menor às lojas (ou ver o alerta que já está aberto). */
export function BotaoPedirPreco({ produto, aoPedir, aoVerAlerta }: { produto: Produto; aoPedir: () => void; aoVerAlerta: (id: string) => void }) {
  const { alertas } = useAndamento();
  const uf = useOficina((s) => s.oficina.uf);
  const chave = chaveDoProduto(produto);
  const aberto = alertas.find((a) => {
    const f = faseVisivel(a);
    return (a.produtoId === produto.id || chave === chaveDoAlerta(a)) && (f === 'esperando' || f === 'escolher');
  });
  if (aberto)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-oleo-claro/60 px-3.5 py-3">
        <p className="min-w-0 flex-1 text-[14px]">
          <span className="font-semibold">Você pediu {textoDoPedidoDeAlerta(aberto)}.</span> <span className="text-tinta-2">{resumoDoAlerta(aberto)}.</span>
        </p>
        <Botao tamanho="pequeno" variante="escuro" onClick={() => aoVerAlerta(aberto.id)}>
          Ver o alerta
        </Botao>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-linha px-3.5 py-3">
      <p className="min-w-0 flex-1 text-[14px] text-tinta-2">
        <span className="font-semibold text-tinta">Achou caro?</span> Diga quanto quer pagar e as lojas {uf ? `do ${uf}` : 'do seu estado'} respondem em até {ALERTAS.horasParaResponder} horas.
      </p>
      <Botao tamanho="pequeno" onClick={aoPedir}>
        <BellRing size={16} aria-hidden="true" /> Pedir preço menor
      </Botao>
    </div>
  );
}

function chaveDoAlerta(a: AlertaDaOficina): string {
  return chaveDoProduto({ categoria: a.categoria, nome: a.titulo });
}

// ---------------------------------------------------------------- mandar o alerta

export function FolhaNovoAlerta({
  pedido,
  aoFechar,
  aoVerAlerta,
  aoComprar
}: {
  pedido: { produto: Produto; quantidade: number } | null;
  aoFechar: () => void;
  aoVerAlerta: (id: string) => void;
  aoComprar: () => void;
}) {
  const { catalogo } = useCatalogo();
  const hoje = useHoje();
  const pagos = usePrecosPagos();
  const oficina = useOficina((s) => s.oficina);
  const garantirAparelhoId = useOficina((s) => s.garantirAparelhoId);
  const marcarAlerta = useOficina((s) => s.marcarAlerta);
  const { cota, guardarAlerta, atualizar } = useAndamento();
  const plano = usePlano();
  const [aberto, setAberto] = useState<number | null>(null);
  // a cota aparece já no primeiro alerta
  useEffect(() => {
    if (pedido && !cota) void atualizar({ alertas: true });
  }, [pedido, cota, atualizar]);
  const [qtd, setQtd] = useState(1);
  const [preco, setPreco] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [semCota, setSemCota] = useState(false);
  const [enviado, setEnviado] = useState<{ lojas: number; alerta: AlertaDaOficina } | null>(null);
  const [enviando, iniciar] = useTransition();

  const p = pedido?.produto ?? null;
  const atual = p ? precoNaQuantidade(p, catalogo.promocoes, hoje, qtd).preco : 0;
  const pago = useMemo(() => (p ? ultimoPrecoPago(p, pagos) : null), [p, pagos]);
  const litros = p ? litrosPorUnidade(p) : null;
  // o que pagou, por embalagem deste produto (no óleo, o preço do litro vezes os litros)
  const pagoNaEmbalagem = pago ? r2(litros ? pago.comparavel * litros : pago.comparavel) : null;
  const fornecedor = p ? catalogo.fornecedores.find((f) => f.id === p.fornecedorId) : undefined;

  if (pedido && aberto !== pedido.produto.id) {
    const inicial = precoNaQuantidade(pedido.produto, catalogo.promocoes, hoje, pedido.quantidade).preco;
    const l = litrosPorUnidade(pedido.produto);
    const pg = ultimoPrecoPago(pedido.produto, pagos);
    const pgEmb = pg ? r2(l ? pg.comparavel * l : pg.comparavel) : null;
    setAberto(pedido.produto.id);
    setQtd(pedido.quantidade);
    setPreco(paraCampo(pgEmb && pgEmb < inicial ? pgEmb : r2(inicial * 0.95)));
    setMensagem('');
    setErro(null);
    setSemCota(false);
    setEnviado(null);
  }

  function fechar() {
    setAberto(null);
    aoFechar();
  }

  function mandar() {
    if (!p) return;
    setErro(null);
    setSemCota(false);
    const valor = lerNumero(preco);
    if (valor == null || valor <= 0) return setErro('Diga quanto quer pagar por unidade.');
    if (valor >= atual) return setErro(`A loja já vende por ${formatarMoeda(atual)}. Para esse preço é só pôr no pedido.`);
    if (!/^[A-Z]{2}$/.test(oficina.uf)) return setErro('Escolha o estado da oficina em Ajustes: o alerta vai para as lojas do seu estado.');
    iniciar(async () => {
      try {
        const r = await mandarAlerta({
          aparelhoId: garantirAparelhoId(),
          codigoPro: codigoProGuardado(),
          oficina: { nome: oficina.nome, whatsapp: oficina.whatsapp, cidade: oficina.cidade, uf: oficina.uf },
          produtoId: p.id,
          quantidade: qtd,
          precoAlvo: r2(valor),
          precoPago: pagoNaEmbalagem,
          mensagem
        });
        if (!r.ok) {
          setErro(r.erro);
          setSemCota(!!r.semCota);
          return;
        }
        marcarAlerta();
        guardarAlerta(r.alerta, r.cota);
        setEnviado({ lojas: r.lojas, alerta: r.alerta });
      } catch {
        setErro('Sem conexão com o servidor. Confira a internet e tente de novo.');
      }
    });
  }

  if (enviado)
    return (
      <Folha
        aberta={!!pedido}
        aoFechar={fechar}
        titulo="Alerta enviado"
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Botao variante="fantasma" onClick={fechar}>
              Fechar
            </Botao>
            <Botao
              variante="primario"
              onClick={() => {
                const id = enviado.alerta.id;
                fechar();
                aoVerAlerta(id);
              }}
            >
              Ver o alerta
            </Botao>
          </div>
        }
      >
        <div className="flex flex-col items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ok-claro text-ok">
            <Check size={26} aria-hidden="true" />
          </span>
          <p className="text-[17px]">
            O pedido de {textoDoPedidoDeAlerta(enviado.alerta)} foi para {plural(enviado.lojas, 'loja', 'lojas')} do {oficina.uf}.
          </p>
          <p className="text-tinta-2">
            As lojas têm até {formatarDiaHora(enviado.alerta.expiraEm)} para responder. As respostas aparecem aqui na Loja, em Em andamento. Você escolhe a melhor e o pedido sai com o preço combinado.
          </p>
        </div>
      </Folha>
    );

  return (
    <Folha
      aberta={!!pedido}
      aoFechar={fechar}
      titulo="Pedir preço menor"
      descricao={p ? `Para as lojas ${oficina.uf ? `do ${oficina.uf}` : 'do seu estado'} que vendem ${nomeCategoria(p.categoria).toLowerCase()}.` : undefined}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <LinhaDaCota cota={cota} teste={plano.tipo === 'teste'} />
          <div className="ml-auto flex gap-2">
            <Botao variante="fantasma" onClick={fechar}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={mandar} disabled={enviando}>
              <BellRing size={17} aria-hidden="true" /> {enviando ? 'Mandando…' : 'Mandar alerta'}
            </Botao>
          </div>
        </div>
      }
    >
      {p ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <FotoProduto produto={p} tamanhos="56px" className="h-14 w-14 shrink-0 rounded-xl ring-1 ring-linha" />
            <div className="min-w-0">
              <p className="leading-snug font-semibold">{nomeComMarca(p)}</p>
              <p className="text-[14px] text-tinta-2">
                Hoje {formatarMoeda(atual)} cada{fornecedor ? ` na ${fornecedor.nome}` : ''}
                {pagoNaEmbalagem ? `, você pagou ${formatarMoeda(pagoNaEmbalagem)}` : ''}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">Quantas {litros ? 'embalagens' : 'unidades'}</p>
              <div className="flex items-center gap-3">
                <Passo valor={qtd} aoMudar={setQtd} rotulo={p.nome} />
                <span className="text-[13.5px] text-tinta-3">{quantidadeComUnidade(p, qtd)}</span>
              </div>
            </div>
            <Campo rotulo="Quanto quer pagar em cada (R$)" htmlFor="al-preco" dica={litros ? `${formatarMoeda(r2((lerNumero(preco) ?? 0) / litros))} o litro.` : undefined}>
              <input id="al-preco" className={classeEntrada} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" autoComplete="off" />
            </Campo>
          </div>

          <div className="-mt-2 flex flex-wrap gap-2" role="group" aria-label="Sugestões de preço">
            {pagoNaEmbalagem && pagoNaEmbalagem < atual ? <Sugestao valor={pagoNaEmbalagem} rotulo="o que pagou" aoEscolher={setPreco} /> : null}
            <Sugestao valor={r2(atual * 0.95)} rotulo="5% menos" aoEscolher={setPreco} />
            <Sugestao valor={r2(atual * 0.9)} rotulo="10% menos" aoEscolher={setPreco} />
          </div>

          <Campo rotulo="Recado para as lojas (se quiser)" htmlFor="al-msg" dica="Ex.: preciso até sexta de manhã.">
            <textarea id="al-msg" rows={2} className={classeArea} value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={300} />
          </Campo>

          <p className="rounded-xl bg-papel-2 px-4 py-3 text-[14px] leading-relaxed text-tinta-2">
            Cada loja aceita, faz uma contraproposta (outro preço ou uma quantidade mínima) ou diz que não dá. Você escolhe e o pedido sai com o preço combinado. O nome e o WhatsApp da oficina só vão para a loja que você escolher.
          </p>

          {erro ? (
            <div className="flex flex-col items-start gap-2 rounded-lg bg-atraso-claro px-3 py-2.5 text-[14px] text-atraso" role="alert">
              <p>{erro}</p>
              {semCota ? (
                cota?.tipo === 'pro' ? (
                  <Botao tamanho="pequeno" variante="escuro" onClick={aoComprar}>
                    Comprar mais alertas
                  </Botao>
                ) : (
                  <Link href="/planos#assinar" className={classeBotao('escuro', 'pequeno')}>
                    Quero o Pro
                  </Link>
                )
              ) : /Ajustes/.test(erro) ? (
                <Link href="/oficina/ajustes" className="font-semibold underline">
                  Abrir os Ajustes
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Folha>
  );
}

function Sugestao({ valor, rotulo, aoEscolher }: { valor: number; rotulo: string; aoEscolher: (v: string) => void }) {
  return (
    <button type="button" onClick={() => aoEscolher(paraCampo(valor))} className="h-8 rounded-full border border-linha bg-papel px-3 text-[13px] font-semibold text-tinta-2 hover:border-tinta-3">
      <span className="num">{formatarMoeda(valor)}</span> <span className="font-normal text-tinta-3">{rotulo}</span>
    </button>
  );
}

/** "3 de 10 alertas do mês usados" (e os extras dos pacotes). */
export function LinhaDaCota({ cota, teste }: { cota: CotaAlertas | null; teste?: boolean }) {
  if (!cota) return null;
  const texto =
    cota.tipo === 'pro'
      ? `${cota.usados} de ${cota.limite} alertas do mês${cota.extras ? `, mais ${cota.extras} do pacote` : ''}`
      : `${teste ? 'No teste do Pro' : 'Sem o Pro'}, ${cota.usados} de ${cota.limite} alertas`;
  return <p className="num text-[13px] text-tinta-3">{texto}</p>;
}

// ---------------------------------------------------------------- respostas

export function FolhaAlerta({ alertaId, aoFechar, aoAcompanhar }: { alertaId: string | null; aoFechar: () => void; aoAcompanhar: (codigo: string) => void }) {
  const { alertas, atualizar, ajustarAlerta } = useAndamento();
  const toast = useToast();
  const garantirAparelhoId = useOficina((s) => s.garantirAparelhoId);
  const alerta = alertas.find((a) => a.id === alertaId) ?? null;
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [cancelando, iniciarCancelar] = useTransition();
  const [feito, setFeito] = useState<{ codigo: string; total: number; loja: string } | null>(null);
  const agora = Date.now();

  if (!alerta) return <Folha aberta={false} aoFechar={aoFechar} titulo="">{null}</Folha>;
  const fase = faseVisivel(alerta, agora);
  const propostas = propostasEmOrdem(alerta);
  const recusas = alerta.respostas.filter((r) => r.tipo === 'recusa');
  const podeEscolher = alerta.status === 'aberto' && agora < escolherAte(alerta.expiraEm);

  function fechar() {
    setEscolhida(null);
    setFeito(null);
    aoFechar();
  }

  function cancelar() {
    if (!alerta) return;
    iniciarCancelar(async () => {
      try {
        const r = await desistirDoAlerta(garantirAparelhoId(), alerta.id);
        if (!r.ok) {
          toast({ texto: r.erro, tom: 'erro' });
          void atualizar({ alertas: true });
          return;
        }
        ajustarAlerta(alerta.id, { status: 'cancelado' });
        toast({ texto: 'Alerta cancelado.' });
        void atualizar({ alertas: true });
        fechar();
      } catch {
        toast({ texto: 'Sem conexão. O alerta não foi cancelado.', tom: 'erro' });
      }
    });
  }

  if (feito)
    return (
      <Folha
        aberta
        aoFechar={fechar}
        titulo="Pedido feito"
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Botao variante="fantasma" onClick={fechar}>
              Fechar
            </Botao>
            <Botao
              variante="primario"
              onClick={() => {
                const codigo = feito.codigo;
                fechar();
                aoAcompanhar(codigo);
              }}
            >
              Acompanhar o pedido
            </Botao>
          </div>
        }
      >
        <div className="flex flex-col items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ok-claro text-ok">
            <Check size={26} aria-hidden="true" />
          </span>
          <p className="text-[17px]">
            Pedido <strong className="largo num tracking-wider">{feito.codigo}</strong> feito com a {feito.loja}, no total de <strong className="num">{formatarMoeda(feito.total)}</strong>.
          </p>
          <p className="text-tinta-2">A loja recebe o seu nome e WhatsApp para combinar a entrega. Dá para pagar por Pix e acompanhar a entrega em Pedidos.</p>
        </div>
      </Folha>
    );

  return (
    <Folha
      aberta
      aoFechar={fechar}
      titulo={alerta.titulo}
      descricao={`Você pediu ${textoDoPedidoDeAlerta(alerta)}.`}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {alerta.status === 'aberto' ? (
            <Botao variante="perigo" tamanho="pequeno" onClick={cancelar} disabled={cancelando}>
              {cancelando ? 'Cancelando…' : 'Cancelar o alerta'}
            </Botao>
          ) : (
            <span />
          )}
          <Botao variante="fantasma" onClick={fechar}>
            Fechar
          </Botao>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {fase === 'esperando' && propostas.length ? <Chip tom="caneta">Já pode escolher</Chip> : <Chip tom={FASES[fase].tom}>{FASES[fase].nome}</Chip>}
          <span className="text-[13.5px] text-tinta-3">
            {fase === 'esperando'
              ? `${propostas.length ? 'Outras lojas ainda podem responder' : 'As lojas respondem'} até ${formatarDiaHora(alerta.expiraEm)}`
              : fase === 'escolher'
                ? `Dá para escolher até ${formatarDiaHora(new Date(escolherAte(alerta.expiraEm)).toISOString())}`
                : `Pedido em ${formatarDiaHora(alerta.criadoEm)}`}
          </span>
        </div>

        {alerta.status === 'fechado' && alerta.pedido ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ok-claro px-4 py-3 text-ok">
            <p className="font-semibold">Pedido {alerta.pedido} feito com o preço combinado.</p>
            <Botao tamanho="pequeno" variante="escuro" onClick={() => aoAcompanhar(alerta.pedido!)}>
              Acompanhar
            </Botao>
          </div>
        ) : null}

        {propostas.length ? (
          <ul className="flex flex-col gap-3" aria-label="Propostas das lojas">
            {propostas.map((r, i) => (
              <li key={r.id}>
                <CartaoProposta
                  alerta={alerta}
                  resposta={r}
                  melhor={i === 0 && propostas.length > 1}
                  podeEscolher={podeEscolher}
                  aberta={escolhida === r.id}
                  aoAbrir={() => setEscolhida(escolhida === r.id ? null : r.id)}
                  aoFeito={(codigo, total) => setFeito({ codigo, total, loja: r.fornecedor })}
                />
              </li>
            ))}
          </ul>
        ) : alerta.status === 'aberto' && fase === 'esperando' ? (
          <p className="rounded-xl border border-dashed border-linha px-4 py-5 text-[15px] text-tinta-2">
            Nenhuma loja respondeu ainda. Quando responderem, as propostas aparecem aqui, da mais barata para a mais cara.
          </p>
        ) : null}

        {recusas.length ? (
          <div className="flex flex-col gap-1.5 text-[14px] text-tinta-2">
            <p>
              {plural(recusas.length, 'loja disse', 'lojas disseram')} que não tem esse preço agora{recusas.length <= 3 ? ` (${recusas.map((r) => r.fornecedor).join(', ')})` : ''}.
            </p>
            {recusas
              .filter((r) => r.mensagem)
              .map((r) => (
                <p key={r.id} className="flex items-start gap-1.5 text-tinta-3">
                  <MessageSquareQuote size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {r.fornecedor}: {r.mensagem}
                </p>
              ))}
          </div>
        ) : null}

        {alerta.mensagem ? <p className="text-[13.5px] text-tinta-3">Seu recado: {alerta.mensagem}</p> : null}
      </div>
    </Folha>
  );
}

function CartaoProposta({
  alerta,
  resposta: r,
  melhor,
  podeEscolher,
  aberta,
  aoAbrir,
  aoFeito
}: {
  alerta: AlertaDaOficina;
  resposta: RespostaDoAlerta;
  melhor: boolean;
  podeEscolher: boolean;
  aberta: boolean;
  aoAbrir: () => void;
  aoFeito: (codigo: string, total: number) => void;
}) {
  const oficina = useOficina((s) => s.oficina);
  const salvarOficina = useOficina((s) => s.salvarOficina);
  const garantirAparelhoId = useOficina((s) => s.garantirAparelhoId);
  const registrarPedido = useOficina((s) => s.registrarPedido);
  const { atualizar } = useAndamento();
  // a loja negociou esta quantidade: dá para pedir do mínimo dela até o que o alerta pediu
  const faixa = faixaParaFechar(alerta, r);
  const [escolhaQtd, setQtd] = useState(faixa.maximo);
  const qtd = Math.min(faixa.maximo, Math.max(faixa.minimo, escolhaQtd));
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const escolhida = r.status === 'escolhida';
  const preco = r.preco ?? 0;
  const outroProduto = !!r.produto && r.produto.id !== alerta.produtoId && chaveDoProduto(r.produto) !== chaveDoAlerta(alerta);

  function fazer() {
    setErro(null);
    if (!oficina.nome.trim()) return setErro('Escreva o nome da oficina em Ajustes.');
    if (r.preco == null || !r.produto) return setErro('Esta proposta não vale mais.');
    const vista = { preco: r.preco, produto: r.produto.id, minimo: r.quantidadeMinima ?? 1 };
    iniciar(async () => {
      try {
        const res = await fecharComLoja({
          aparelhoId: garantirAparelhoId(),
          alertaId: alerta.id,
          respostaId: r.id,
          quantidade: qtd,
          // o servidor confere se a loja não mudou a proposta depois que a oficina viu
          precoEsperado: vista.preco,
          produtoEsperado: vista.produto,
          minimoEsperado: vista.minimo,
          oficina: { nome: oficina.nome, whatsapp: oficina.whatsapp, cidade: oficina.cidade, uf: oficina.uf, endereco: oficina.endereco },
          observacao: obs
        });
        if (!res.ok) {
          setErro(res.erro);
          // a proposta pode ter mudado ou acabado: traz a versão nova para a oficina conferir
          void atualizar({ alertas: true });
          return;
        }
        registrarPedido(
          {
            codigo: res.codigo,
            quando: new Date().toISOString(),
            total: res.total,
            alertaId: alerta.id,
            itens: res.itens.map((i) => ({
              produtoId: i.produtoId,
              nome: i.nome,
              quantidade: i.quantidade,
              precoUnitario: i.precoUnitario,
              fornecedorId: i.fornecedorId,
              fornecedor: i.fornecedor,
              combinado: i.combinado,
              ...(r.produto ? { chave: chaveDoProduto({ categoria: r.produto.categoria, marca: r.produto.marca, nome: r.produto.nome }) } : {}),
              ...(r.produto && litrosPorUnidade(r.produto) ? { precoComparavel: r2(i.precoUnitario / litrosPorUnidade(r.produto)!) } : {})
            }))
          },
          { manterCarrinho: true }
        );
        void atualizar();
        aoFeito(res.codigo, res.total);
      } catch {
        setErro('Sem conexão com o servidor. Confira a internet e tente de novo.');
      }
    });
  }

  return (
    <article className={`flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ${escolhida ? 'ring-ok' : melhor ? 'ring-tinta' : 'ring-linha'}`} aria-label={`Proposta da ${r.fornecedor}`}>
      <div className="flex items-start gap-3">
        {r.produto ? <FotoProduto produto={r.produto} tamanhos="48px" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-linha" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{r.fornecedor}</p>
            {melhor ? <Chip tom="ok">Menor preço</Chip> : null}
            {escolhida ? <Chip tom="ok">Escolhida</Chip> : null}
          </div>
          <p className="text-[13.5px] text-tinta-3">
            {[r.cidade, outroProduto ? nomeComMarca(r.produto!) : ''].filter(Boolean).join(', ')}
          </p>
          <p className="mt-1 text-[15px] font-semibold">{resumoDaResposta(r, r.produto)}</p>
          {r.prazoEntrega ? (
            <p className="flex items-center gap-1.5 text-[13.5px] text-tinta-2">
              <MapPin size={14} aria-hidden="true" /> Entrega {r.prazoEntrega}
            </p>
          ) : null}
          {r.mensagem ? <p className="mt-1 text-[14px] text-tinta-2">“{r.mensagem}”</p> : null}
        </div>
        <p className="num text-right">
          <span className="block text-[18px] font-extrabold">{formatarMoeda(r2(preco * faixa.maximo))}</span>
          <span className="block text-[12px] text-tinta-3">por {formatarNumero(faixa.maximo)}</span>
        </p>
      </div>
      {podeEscolher && !escolhida ? (
        aberta ? (
          <div className="flex flex-col gap-3 rounded-xl bg-papel-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Passo valor={qtd} aoMudar={setQtd} minimo={faixa.minimo} maximo={faixa.maximo} rotulo={alerta.titulo} />
                <span className="text-[13px] text-tinta-3">
                  {faixa.minimo === faixa.maximo ? `Por esse preço, ${formatarNumero(faixa.maximo)}` : `Por esse preço, de ${formatarNumero(faixa.minimo)} a ${formatarNumero(faixa.maximo)}`}
                </span>
              </div>
              <p className="num font-bold">{formatarMoeda(r2(preco * qtd))}</p>
            </div>
            <Campo rotulo="Endereço para entrega" htmlFor={`end-${r.id}`}>
              <input id={`end-${r.id}`} className={classeEntrada} value={oficina.endereco} onChange={(e) => salvarOficina({ endereco: e.target.value })} maxLength={160} placeholder="Rua, número, bairro" />
            </Campo>
            <Campo rotulo="Observação para a loja" htmlFor={`obs-${r.id}`}>
              <input id={`obs-${r.id}`} className={classeEntrada} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} />
            </Campo>
            {erro ? (
              <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
                {erro}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Botao variante="fantasma" tamanho="pequeno" onClick={aoAbrir}>
                Voltar
              </Botao>
              <Botao variante="primario" onClick={fazer} disabled={enviando}>
                {enviando ? 'Fazendo o pedido…' : `Fazer o pedido de ${formatarMoeda(r2(preco * qtd))}`}
              </Botao>
            </div>
          </div>
        ) : (
          <Botao variante={melhor ? 'escuro' : 'secundario'} onClick={aoAbrir} className="self-start">
            <Tag size={16} aria-hidden="true" /> Fechar com esta loja
          </Botao>
        )
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------- lista

export function ListaDeAlertas({ aoAbrir, aoComprar }: { aoAbrir: (id: string) => void; aoComprar: () => void }) {
  const { alertas, cota } = useAndamento();
  const plano = usePlano();
  if (!alertas.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="t-alertas">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="t-alertas" className="text-[21px]">
            Alertas de preço
          </h2>
          <LinhaDaCota cota={cota} teste={plano.tipo === 'teste'} />
        </div>
        {cota?.tipo === 'pro' ? (
          <button type="button" onClick={aoComprar} className="text-[14.5px] font-semibold text-caneta hover:underline">
            Comprar mais alertas
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
        {alertas.map((a) => {
          const fase = faseVisivel(a);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => aoAbrir(a.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-papel-2 sm:px-5">
                <BellRing size={18} className="text-tinta-3" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.titulo}</span>
                  <span className="block truncate text-[13.5px] text-tinta-3">
                    {textoDoPedidoDeAlerta(a)}, {resumoDoAlerta(a).toLowerCase()}
                  </span>
                </span>
                <Chip tom={FASES[fase].tom}>{FASES[fase].nome}</Chip>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- pacotes

export function FolhaPacotes({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const oficina = useOficina((s) => s.oficina);
  const toast = useToast();
  const [escolha, setEscolha] = useState<number>(PACOTES_ALERTAS[0].quantidade);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ pix: string | null; valor: number } | null>(null);
  const [enviando, iniciar] = useTransition();

  function fechar() {
    setErro(null);
    setFeito(null);
    aoFechar();
  }

  function pedir() {
    setErro(null);
    const codigo = codigoProGuardado();
    if (!codigo) return setErro('Os pacotes são para quem tem o Pro. Ative o código em Ajustes, na parte Plano.');
    iniciar(async () => {
      try {
        const r = await comprarAlertas({ codigoPro: codigo, quantidade: escolha, oficina: { nome: oficina.nome, whatsapp: oficina.whatsapp, cidade: oficina.cidade, uf: oficina.uf } });
        if (!r.ok) return setErro(r.erro);
        setFeito({ pix: r.pix, valor: r.valor });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Código Pix copiado.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o código e copie.', tom: 'erro' });
    }
  }

  return (
    <Folha
      aberta={aberta}
      aoFechar={fechar}
      titulo={feito ? 'Pedido recebido' : 'Mais alertas de preço'}
      descricao={feito ? undefined : 'Os alertas do pacote não vencem: valem enquanto o seu Pro estiver em dia e são usados depois dos alertas do mês.'}
      rodape={
        feito ? (
          <Botao variante="primario" onClick={fechar}>
            Fechar
          </Botao>
        ) : (
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={fechar}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={pedir} disabled={enviando}>
              {enviando ? 'Pedindo…' : 'Pedir o pacote'}
            </Botao>
          </div>
        )
      }
    >
      {feito ? (
        feito.pix ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-tinta-2">Pague {formatarMoeda(feito.valor)} pelo Pix. A equipe confere e libera os alertas em seguida.</p>
            <QrCode texto={feito.pix} rotulo="QR Code do Pix do pacote" className="h-56 w-56 rounded-xl ring-1 ring-linha" />
            <Botao variante="escuro" onClick={() => void copiar(feito.pix!)}>
              <Copy size={16} aria-hidden="true" /> Copiar o código Pix
            </Botao>
          </div>
        ) : (
          <p className="text-tinta-2">A equipe do Revisaí chama você no WhatsApp para o pagamento e libera os alertas assim que receber.</p>
        )
      ) : (
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Pacotes">
          {PACOTES_ALERTAS.map((p) => (
            <button
              key={p.quantidade}
              type="button"
              role="radio"
              aria-checked={escolha === p.quantidade}
              onClick={() => setEscolha(p.quantidade)}
              className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 ${escolha === p.quantidade ? 'bg-papel ring-2 ring-tinta' : 'bg-papel ring-linha hover:ring-tinta-3'}`}
            >
              <span>
                <span className="block font-bold">{p.quantidade} alertas</span>
                <span className="num block text-[13.5px] text-tinta-3">{formatarMoeda(r2(p.preco / p.quantidade))} cada</span>
              </span>
              <span className="largo num text-[20px] font-extrabold">{formatarMoeda(p.preco)}</span>
            </button>
          ))}
          {erro ? (
            <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
              {erro}
            </p>
          ) : null}
        </div>
      )}
    </Folha>
  );
}
