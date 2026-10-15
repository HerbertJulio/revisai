'use client';

// Os pedidos da loja: a parte de cada pedido que é dela, o pagamento por Pix (a oficina avisa que
// pagou e a loja confirma) e a entrega (o link para o entregador, que mostra a posição para a oficina).

import { Check, Copy, KeyRound, MapPin, MessageCircle, Send, Truck } from 'lucide-react';
import { useOptimistic, useState, useTransition } from 'react';
import { confirmarPagamentoParte, marcarSaida, mudarSituacaoPedidoFornecedor, salvarChavePix } from '@/app/fornecedor/acoes';
import { ChipSituacao, Filtro, LinhaDeFiltros, SeletorSituacao } from '@/components/equipe/comum';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { formatarDiaHora, formatarHora } from '@/lib/datas';
import { contarPor, FUSO, quandoFoi } from '@/lib/equipe-dados';
import { haQuantoTempo, mensagemDoEntregador, mensagemSaiu } from '@/lib/entregas-dados';
import { formatarMoeda, formatarTelefone } from '@/lib/formatos';
import { SITUACOES_PAGAMENTO, SITUACOES_PARTE, type PedidoDoFornecedor, type SituacaoParte } from '@/lib/marketplace-dados';
import { formatarChavePix, type TipoChavePix } from '@/lib/pix';
import { valorDaComissao } from '@/lib/planos-fornecedor';
import { linkWhatsApp } from '@/lib/whatsapp';

type FiltroPedido = 'abertos' | SituacaoParte;

export interface PixAtual {
  tipo: TipoChavePix;
  chave: string;
  nome: string;
  cidade: string;
}

type Mudanca = { id: number; status?: SituacaoParte; pagamento?: PedidoDoFornecedor['pagamento'] };

export function PedidosFornecedor({ pedidos, loja, pix }: { pedidos: PedidoDoFornecedor[]; loja: string; pix: PixAtual | null }) {
  const toast = useToast();
  const [filtro, setFiltro] = useState<FiltroPedido>('abertos');
  const [lista, mudarOtimista] = useOptimistic(pedidos, (atual, m: Mudanca) =>
    atual.map((p) => (p.id === m.id ? { ...p, ...(m.status ? { status: m.status } : {}), ...(m.pagamento ? { pagamento: m.pagamento } : {}) } : p))
  );
  const [, iniciar] = useTransition();
  const agora = Date.now();
  const contagem = contarPor(lista, (p) => p.status);
  const abertos = lista.filter((p) => p.status === 'novo' || p.status === 'em_contato' || p.status === 'confirmado' || p.status === 'saiu_entrega');
  const visiveis = filtro === 'abertos' ? abertos : lista.filter((p) => p.status === filtro);

  function mudar(p: PedidoDoFornecedor, status: SituacaoParte) {
    iniciar(async () => {
      mudarOtimista({ id: p.id, status });
      try {
        const r = await mudarSituacaoPedidoFornecedor(p.id, status);
        if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. A situação não mudou.', tom: 'erro' });
      }
    });
  }

  function pagamento(p: PedidoDoFornecedor, confirmado: boolean) {
    iniciar(async () => {
      mudarOtimista({ id: p.id, pagamento: confirmado ? 'confirmado' : 'pendente' });
      try {
        const r = await confirmarPagamentoParte(p.id, confirmado);
        if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
        else toast({ texto: confirmado ? 'Pagamento confirmado. A oficina vê no app.' : 'Pagamento voltou para a combinar.' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Nada mudou.', tom: 'erro' });
      }
    });
  }

  function mensagem(p: PedidoDoFornecedor): string {
    const itens = p.itens.map((i) => `${i.quantidade}x ${i.nome}`).join('; ');
    return `Olá, ${p.oficina.nome}! Aqui é da ${loja}. Recebi o seu pedido ${p.codigo} pelo Revisaí (${itens}), total ${formatarMoeda(p.subtotal)}. Vamos combinar a entrega?`;
  }

  return (
    <div className="flex flex-col gap-5">
      <ChavePix pix={pix} />
      <LinhaDeFiltros rotulo="Filtrar pedidos">
        <Filtro ativo={filtro === 'abertos'} aoClicar={() => setFiltro('abertos')} n={abertos.length}>
          Em aberto
        </Filtro>
        {SITUACOES_PARTE.map((s) => (
          <Filtro key={s.id} ativo={filtro === s.id} aoClicar={() => setFiltro(s.id)} n={contagem[s.id] ?? 0}>
            {s.nome}
          </Filtro>
        ))}
      </LinhaDeFiltros>
      {visiveis.length ? (
        <ul className="flex flex-col gap-3">
          {visiveis.map((p) => {
            const s = SITUACOES_PARTE.find((x) => x.id === p.status)!;
            const pg = SITUACOES_PAGAMENTO.find((x) => x.id === p.pagamento)!;
            const whatsapp = linkWhatsApp(p.oficina.whatsapp, mensagem(p));
            const terminado = p.status === 'entregue' || p.status === 'cancelado';
            return (
              <li key={p.id}>
                <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={`Pedido ${p.codigo}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="largo num font-extrabold tracking-wider">{p.codigo}</p>
                        <ChipSituacao nome={s.nome} tom={s.tom} />
                        {p.itens.some((i) => i.combinado) ? <ChipSituacao nome="Preço do alerta" tom="caneta" /> : null}
                      </div>
                      <p className="mt-0.5 font-semibold">{p.oficina.nome}</p>
                      <p className="text-[13.5px] text-tinta-3">
                        {[[p.oficina.cidade, p.oficina.uf].filter(Boolean).join(', '), formatarTelefone(p.oficina.whatsapp), quandoFoi(p.criadoEm, agora)].filter(Boolean).join(', ')}
                      </p>
                      {p.oficina.endereco ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[13.5px] text-tinta-2">
                          <MapPin size={14} aria-hidden="true" /> {p.oficina.endereco}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="num text-[18px] font-extrabold">{formatarMoeda(p.subtotal)}</p>
                      <p className="text-[12.5px] text-tinta-3">comissão {formatarMoeda(valorDaComissao(p.subtotal, p.comissaoPercentual))}</p>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-1 rounded-xl bg-papel-2 px-3 py-2.5 text-[14px]">
                    {p.itens.map((i) => (
                      <li key={i.produto_id} className="flex justify-between gap-3">
                        <span>
                          <span className="num font-semibold">{i.quantidade}x</span> {i.nome}
                          {i.combinado ? <span className="text-caneta"> (preço combinado)</span> : null}
                        </span>
                        <span className="num text-tinta-2">{formatarMoeda(i.preco_unitario * i.quantidade)}</span>
                      </li>
                    ))}
                  </ul>
                  {p.observacao ? <p className="text-[14px] text-tinta-2">Observação da oficina: {p.observacao}</p> : null}

                  {p.status !== 'cancelado' ? (
                    <div className="flex flex-wrap items-center gap-2 text-[14px]">
                      <ChipSituacao nome={pg.nome} tom={pg.tom} />
                      {p.pagamento === 'informado' && p.pagamentoEm ? <span className="text-tinta-3">{formatarDiaHora(p.pagamentoEm, new Date(), FUSO)}. Confira no extrato.</span> : null}
                      {p.pagamento !== 'confirmado' ? (
                        <Botao tamanho="pequeno" variante={p.pagamento === 'informado' ? 'escuro' : 'secundario'} onClick={() => pagamento(p, true)}>
                          <Check size={15} aria-hidden="true" /> Confirmar pagamento
                        </Botao>
                      ) : (
                        <button type="button" onClick={() => pagamento(p, false)} className="text-[13px] font-semibold text-tinta-3 hover:text-atraso">
                          Desfazer
                        </button>
                      )}
                    </div>
                  ) : null}

                  {!terminado ? <SaidaParaEntrega pedido={p} loja={loja} /> : null}

                  {p.status === 'novo' || p.status === 'em_contato' ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-oleo-claro/60 px-3.5 py-2.5">
                      <Botao tamanho="pequeno" variante="escuro" onClick={() => mudar(p, 'confirmado')}>
                        <Check size={15} aria-hidden="true" /> Confirmar pedido
                      </Botao>
                      <span className="text-[13.5px] text-tinta-2">
                        {pix ? 'Tem o produto e o preço? Ao confirmar, a oficina vê o seu Pix e pode pagar pelo app.' : 'Tem o produto e o preço? Confirme para a oficina saber.'}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    {whatsapp ? (
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={classeBotao('whatsapp', 'pequeno')}
                        onClick={() => p.status === 'novo' && mudar(p, 'em_contato')}
                      >
                        <MessageCircle size={16} aria-hidden="true" /> Chamar no WhatsApp
                      </a>
                    ) : null}
                    <SeletorSituacao
                      valor={p.status}
                      opcoes={SITUACOES_PARTE.filter((x) => x.id !== 'saiu_entrega' || p.status === 'saiu_entrega')}
                      aoMudar={(v) => mudar(p, v)}
                      rotulo={`Situação do pedido ${p.codigo}`}
                    />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo={filtro === 'abertos' ? 'Nenhum pedido em aberto' : 'Nenhum pedido aqui'}>Quando uma oficina pedir um produto seu pela loja do Revisaí, o pedido aparece aqui com o WhatsApp dela.</Vazio>
      )}
    </div>
  );
}

/** "Saiu para entrega": gera o link do entregador. A posição aparece para a oficina no mapa. */
function SaidaParaEntrega({ pedido: p, loja }: { pedido: PedidoDoFornecedor; loja: string }) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [previsao, setPrevisao] = useState(p.entrega.previsao ?? '');
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [entregando, iniciarEntrega] = useTransition();
  const saiu = p.status === 'saiu_entrega';
  const agora = Date.now();

  function gerar() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await marcarSaida(p.id, previsao);
        if (!r.ok) return setErro(r.erro);
        setAberto(false);
        setLink(`${window.location.origin}/entrega/${r.token}`);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function entregue() {
    iniciarEntrega(async () => {
      try {
        const r = await mudarSituacaoPedidoFornecedor(p.id, 'entregue');
        if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
        else toast({ texto: 'Pedido entregue.' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor.', tom: 'erro' });
      }
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Link copiado.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o link e copie.', tom: 'erro' });
    }
  }

  if (link) {
    const paraEntregador = mensagemDoEntregador({ loja, codigo: p.codigo, oficina: p.oficina.nome, endereco: p.oficina.endereco, link });
    const avisarOficina = linkWhatsApp(p.oficina.whatsapp, mensagemSaiu({ loja, codigo: p.codigo, oficina: p.oficina.nome, previsao: previsao.trim() || null, total: p.subtotal }));
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-ok-claro/60 p-3.5">
        <p className="text-[14.5px] font-semibold">Mande este link para quem vai entregar. Com ele aberto no celular, a oficina vê a entrega no mapa.</p>
        <p className="num rounded-lg bg-papel px-3 py-2 text-[13px] break-all text-tinta-2">{link}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(paraEntregador)}`} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
            <Send size={15} aria-hidden="true" /> Mandar para o entregador
          </a>
          <Botao tamanho="pequeno" onClick={() => void copiar(link)}>
            <Copy size={15} aria-hidden="true" /> Copiar o link
          </Botao>
          <a href={link} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
            Eu mesmo vou entregar
          </a>
          {avisarOficina ? (
            <a href={avisarOficina} target="_blank" rel="noopener noreferrer" className={classeBotao('fantasma', 'pequeno')}>
              <MessageCircle size={15} aria-hidden="true" /> Avisar a oficina
            </a>
          ) : null}
        </div>
        <button type="button" onClick={() => setLink(null)} className="self-start text-[13px] font-semibold text-tinta-3 hover:text-tinta">
          Fechar
        </button>
      </div>
    );
  }

  if (saiu && !aberto)
    return (
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <Truck size={17} className="text-ok" aria-hidden="true" />
        <span>
          Saiu{p.entrega.saiuEm ? ` às ${formatarHora(p.entrega.saiuEm, FUSO)}` : ''}
          {p.entrega.previsao ? `, chega ${p.entrega.previsao}` : ''}
          {p.entrega.posicaoEm ? `. Posição do entregador ${haQuantoTempo(p.entrega.posicaoEm, agora)}` : '. O entregador ainda não abriu o link'}.
        </span>
        <Botao tamanho="pequeno" variante="escuro" onClick={entregue} disabled={entregando}>
          <Check size={15} aria-hidden="true" /> Entregue
        </Botao>
        <button type="button" onClick={() => setAberto(true)} className="text-[13px] font-semibold text-caneta hover:underline">
          Link novo para o entregador
        </button>
      </div>
    );

  if (!aberto)
    return (
      <Botao tamanho="pequeno" onClick={() => setAberto(true)} className="self-start">
        <Truck size={15} aria-hidden="true" /> Saiu para entrega
      </Botao>
    );

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel-2 p-3.5">
      <Campo rotulo="Quando chega" htmlFor={`prev-${p.id}`} dica="Ex.: hoje até 16h. A oficina vê no app.">
        <input id={`prev-${p.id}`} className={classeEntrada} value={previsao} onChange={(e) => setPrevisao(e.target.value)} maxLength={40} />
      </Campo>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Botao variante="fantasma" tamanho="pequeno" onClick={() => setAberto(false)}>
          Voltar
        </Botao>
        <Botao variante="primario" tamanho="pequeno" onClick={gerar} disabled={enviando}>
          {enviando ? 'Gerando…' : saiu ? 'Gerar link novo' : 'Marcar a saída e gerar o link'}
        </Botao>
      </div>
      {saiu ? <p className="text-[13px] text-tinta-3">O link antigo para de funcionar.</p> : null}
    </div>
  );
}

const TIPOS_PIX: { id: TipoChavePix; nome: string; dica: string }[] = [
  { id: 'cnpj', nome: 'CNPJ', dica: '00.000.000/0000-00' },
  { id: 'cpf', nome: 'CPF', dica: '000.000.000-00' },
  { id: 'telefone', nome: 'Celular', dica: '(21) 99999-0000' },
  { id: 'email', nome: 'E-mail', dica: 'vendas@loja.com.br' },
  { id: 'aleatoria', nome: 'Chave aleatória', dica: 'Como aparece no app do banco' }
];

/** A chave Pix da loja: com ela, a oficina paga o pedido pelo app, com o valor certo. */
function ChavePix({ pix }: { pix: PixAtual | null }) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<TipoChavePix>(pix?.tipo ?? 'cnpj');
  const [chave, setChave] = useState(pix ? formatarChavePix(pix.tipo, pix.chave) : '');
  const [nome, setNome] = useState(pix?.nome ?? '');
  const [cidade, setCidade] = useState(pix?.cidade ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await salvarChavePix({ tipo, chave, nome, cidade });
        if (!r.ok) return setErro(r.erro);
        setEditando(false);
        toast({ texto: 'Chave Pix salva. As oficinas já podem pagar pelo app.' });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  if (!editando)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-oleo-claro text-oleo-tinta">
            <KeyRound size={19} aria-hidden="true" />
          </span>
          <p className="min-w-0 text-[14.5px]">
            {pix ? (
              <>
                <span className="font-semibold">Pix pelo app ligado.</span>{' '}
                <span className="text-tinta-2">
                  {TIPOS_PIX.find((t) => t.id === pix.tipo)?.nome} {formatarChavePix(pix.tipo, pix.chave)}, em nome de {pix.nome}.
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">Receba por Pix pelo app.</span> <span className="text-tinta-2">A oficina paga com o QR Code do valor do pedido, direto na sua conta, e você confirma aqui.</span>
              </>
            )}
          </p>
        </div>
        <Botao tamanho="pequeno" variante={pix ? 'secundario' : 'escuro'} onClick={() => setEditando(true)}>
          {pix ? 'Mudar a chave' : 'Cadastrar a chave Pix'}
        </Botao>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
      <p className="font-bold">Chave Pix da loja</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Tipo da chave" htmlFor="pix-tipo">
          <select id="pix-tipo" className={classeEntrada} value={tipo} onChange={(e) => setTipo(e.target.value as TipoChavePix)}>
            {TIPOS_PIX.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Chave" htmlFor="pix-chave">
          <input id="pix-chave" className={classeEntrada} value={chave} onChange={(e) => setChave(e.target.value)} placeholder={TIPOS_PIX.find((t) => t.id === tipo)?.dica} autoComplete="off" />
        </Campo>
        <Campo rotulo="Nome de quem recebe" htmlFor="pix-nome" dica="Como está no banco. Vai no QR Code (até 25 letras).">
          <input id="pix-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
        </Campo>
        <Campo rotulo="Cidade" htmlFor="pix-cidade">
          <input id="pix-cidade" className={classeEntrada} value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} />
        </Campo>
      </div>
      {erro ? (
        <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Botao variante="fantasma" onClick={() => setEditando(false)}>
          Cancelar
        </Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar a chave'}
        </Botao>
      </div>
    </div>
  );
}
