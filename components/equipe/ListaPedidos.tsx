'use client';

import { MessageCircle } from 'lucide-react';
import { useMemo, useOptimistic, useState, useTransition, type ReactNode } from 'react';
import { mudarSituacaoPedido } from '@/app/admin/acoes';
import { useToast } from '@/components/Toasts';
import { classeBotao, Vazio } from '@/components/ui';
import {
  contarPor,
  mensagemPedido,
  porFornecedor,
  quandoFoi,
  SITUACOES_PEDIDO,
  situacaoDoPedido,
  type Pedido,
  type SituacaoPedido
} from '@/lib/equipe-dados';
import { formatarMoeda, formatarTelefone } from '@/lib/formatos';
import { SITUACOES_PAGAMENTO, SITUACOES_PARTE } from '@/lib/marketplace-dados';
import { linkWhatsApp } from '@/lib/whatsapp';
import { CampoBusca, ChipSituacao, combina, Filtro, LinhaDeFiltros, MostrarMais, paraBusca, POR_PAGINA, SeletorSituacao } from './comum';

type FiltroPedido = SituacaoPedido | 'todos';

const situacao = (id: SituacaoPedido) => SITUACOES_PEDIDO.find((s) => s.id === id) ?? SITUACOES_PEDIDO[0];

export function ListaPedidos({
  pedidos,
  agora,
  comFiltros = true,
  vazio,
  podeMudar = true
}: {
  pedidos: Pedido[];
  agora: number;
  comFiltros?: boolean;
  /** O que mostrar quando não há pedidos (no resumo, por exemplo). */
  vazio?: ReactNode;
  /** O papel da pessoa muda a situação (o suporte); os outros só veem. */
  podeMudar?: boolean;
}) {
  const toast = useToast();
  const [, iniciar] = useTransition();
  const [lista, aplicar] = useOptimistic(pedidos, (atual: Pedido[], m: { id: number; status: SituacaoPedido }) =>
    atual.map((p) => (p.id === m.id ? { ...p, status: m.status } : p))
  );
  const contagem = useMemo(() => contarPor(lista, situacaoDoPedido), [lista]);
  const [filtro, setFiltro] = useState<FiltroPedido>(() => ((contarPor(pedidos, situacaoDoPedido).novo ?? 0) > 0 ? 'novo' : 'todos'));
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const textos = useMemo(
    () => new Map(lista.map((p) => [p.id, paraBusca(p.codigo, p.oficina_nome, p.oficina_cidade, p.oficina_whatsapp, ...p.itens.map((i) => `${i.nome} ${i.fornecedor}`))])),
    [lista]
  );
  const filtrados = !comFiltros
    ? lista
    : (filtro === 'todos' ? lista : lista.filter((p) => situacaoDoPedido(p) === filtro)).filter((p) => !busca.trim() || combina(textos.get(p.id) ?? '', busca));
  const visiveis = comFiltros ? filtrados.slice(0, limite) : filtrados;

  function filtrar(f: FiltroPedido) {
    setFiltro(f);
    setLimite(POR_PAGINA);
  }

  function mudar(p: Pedido, status: SituacaoPedido, comDesfazer = false) {
    const anterior = p.status;
    if (anterior === status) return;
    iniciar(async () => {
      aplicar({ id: p.id, status });
      const r = await mudarSituacaoPedido(p.id, status);
      if (!r.ok) {
        toast({ texto: r.erro, tom: 'erro' });
        return;
      }
      if (comDesfazer) {
        toast({
          texto: `Pedido ${p.codigo} foi para ${situacao(status).nome.toLowerCase()}.`,
          acao: { rotulo: 'Desfazer', fazer: () => mudar({ ...p, status }, anterior) }
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {comFiltros ? (
        <div className="flex flex-col gap-3">
          {lista.length > 5 ? (
            <CampoBusca
              valor={busca}
              aoMudar={(v) => {
                setBusca(v);
                setLimite(POR_PAGINA);
              }}
              rotulo="Buscar pedidos"
              dica="Buscar por código, oficina, cidade ou produto"
            />
          ) : null}
          <LinhaDeFiltros rotulo="Filtrar pedidos por situação">
            {SITUACOES_PEDIDO.map((s) => (
              <Filtro key={s.id} ativo={filtro === s.id} aoClicar={() => filtrar(s.id)} n={contagem[s.id] ?? 0}>
                {s.plural}
              </Filtro>
            ))}
            <Filtro ativo={filtro === 'todos'} aoClicar={() => filtrar('todos')} n={lista.length}>
              Todos
            </Filtro>
          </LinhaDeFiltros>
        </div>
      ) : null}

      {visiveis.length ? (
        <div className="flex flex-col gap-3">
          {visiveis.map((p) => (
            <CartaoPedido key={p.id} pedido={p} agora={agora} aoMudar={podeMudar ? mudar : null} />
          ))}
          <MostrarMais total={filtrados.length} mostrando={visiveis.length} aoMostrar={() => setLimite((l) => l + POR_PAGINA)} />
        </div>
      ) : lista.length ? (
        busca.trim() ? (
          <Vazio titulo="Nenhum pedido encontrado">Confira o que foi digitado ou procure em todas as situações.</Vazio>
        ) : (
          <Vazio titulo="Nenhum pedido nesta situação">Escolha outra situação acima para ver os demais.</Vazio>
        )
      ) : vazio ? (
        vazio
      ) : (
        <Vazio titulo="Nenhum pedido ainda">Quando uma oficina enviar um pedido pela loja, ele aparece aqui com os itens e o WhatsApp dela.</Vazio>
      )}
    </div>
  );
}

const parte = (id: string) => SITUACOES_PARTE.find((s) => s.id === id);
const pagamento = (id: string) => SITUACOES_PAGAMENTO.find((s) => s.id === id);

function CartaoPedido({
  pedido: p,
  agora,
  aoMudar
}: {
  pedido: Pedido;
  agora: number;
  /** null quando o papel só vê. */
  aoMudar: ((p: Pedido, s: SituacaoPedido, comDesfazer?: boolean) => void) | null;
}) {
  const s = situacao(situacaoDoPedido(p));
  // com as lojas cuidando das partes, a situação vem delas; a equipe só muda a do pedido antigo
  const daEquipe = !p.partes?.length;
  const grupos = porFornecedor(p.itens);
  const whatsapp = linkWhatsApp(p.oficina_whatsapp, mensagemPedido(p));
  const local = [p.oficina_cidade, p.oficina_uf].filter(Boolean).join(', ');

  return (
    <article className="rounded-2xl bg-papel ring-1 ring-linha" aria-label={`Pedido ${p.codigo}`}>
      <header className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="largo num text-[19px] font-extrabold tracking-wider">{p.codigo}</span>
            <ChipSituacao nome={s.nome} tom={s.tom} />
          </div>
          <p className="mt-1 font-semibold break-words">{p.oficina_nome}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[14px] text-tinta-3">
            {local ? <span>{local}</span> : null}
            <span>{quandoFoi(p.criado_em, agora)}</span>
          </p>
        </div>
        <p className="num shrink-0 text-[19px] font-extrabold">{formatarMoeda(p.total)}</p>
      </header>

      <div className="mt-3 flex flex-col gap-3 border-t border-linha px-4 py-3 sm:px-5">
        {grupos.map((g) => (
          <div key={g.fornecedor}>
            <p className="text-[13px] font-semibold text-tinta-3">{g.fornecedor}</p>
            <ul className="mt-1 flex flex-col">
              {g.itens.map((i) => (
                <li key={i.produto_id} className="flex items-baseline gap-3 py-1">
                  <span className="num w-9 shrink-0 text-right font-bold">{i.quantidade}×</span>
                  <span className="min-w-0 flex-1 leading-snug">
                    {i.nome}
                    <span className="block text-[13px] text-tinta-3">
                      {formatarMoeda(i.preco_unitario)} cada{i.promocao ? ', preço de promoção' : ''}
                    </span>
                  </span>
                  <span className="num shrink-0 font-semibold">{formatarMoeda(i.preco_unitario * i.quantidade)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {p.observacao ? <p className="rounded-xl bg-papel-2 px-3 py-2 text-[14px] text-tinta-2">{p.observacao}</p> : null}
        {p.partes?.length ? (
          <ul className="flex flex-col gap-1.5" aria-label="Situação em cada loja">
            {p.partes.map((x) => {
              const s = parte(x.status);
              const pg = pagamento(x.pagamento);
              return (
                <li key={x.fornecedorId} className="flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="font-semibold">{x.fornecedor}</span>
                  <ChipSituacao nome={s?.nome ?? x.status} tom={s?.tom ?? 'neutro'} />
                  {pg ? <ChipSituacao nome={pg.nome} tom={pg.tom} /> : null}
                  <span className="num text-tinta-3">{formatarMoeda(x.subtotal)}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-linha px-4 py-3 sm:px-5">
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={classeBotao('whatsapp', 'pequeno')}
            onClick={() => {
              if (daEquipe && p.status === 'novo' && aoMudar) aoMudar(p, 'em_contato', true);
            }}
          >
            <MessageCircle size={16} aria-hidden="true" />
            Chamar {formatarTelefone(p.oficina_whatsapp)}
          </a>
        ) : null}
        {aoMudar && daEquipe ? (
          <SeletorSituacao valor={p.status} opcoes={SITUACOES_PEDIDO} aoMudar={(v) => aoMudar(p, v)} rotulo={`Situação do pedido ${p.codigo}`} />
        ) : (
          <span className="ml-auto">
            <ChipSituacao nome={s.nome} tom={s.tom} />
          </span>
        )}
      </footer>
    </article>
  );
}
