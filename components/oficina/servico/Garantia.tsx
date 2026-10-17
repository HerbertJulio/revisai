'use client';

// A garantia do serviço entregue: sai sozinha quando a ordem é concluída (um item por serviço e
// por peça, com os prazos padrão da oficina), dá para mudar antes de mandar e, com a conta, vai
// para o cliente por um link com o código para consultar pela placa.

import { ArrowLeft, MessageCircle, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CertificadoDeGarantia } from '@/components/cliente/CertificadoDeGarantia';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Vazio, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { formatarData, somarDias } from '@/lib/datas';
import { dadosDaGarantia, fimDaGarantia, garantiaDaOrdem, mensagemDaGarantia, situacaoDoItem, type ItemDaGarantia } from '@/lib/garantia';
import { hojeNoBrasil, type OficinaDoLink } from '@/lib/links-publicos';
import { useHoje } from '@/lib/ganchos';
import type { Garantia } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Documento, Id, Oficina } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoSemConta, CaixaDoServico, copiarTexto, janelaParaDepois } from './comum';
import { useContextoDaConta } from './conta';
import { publicarGarantia } from './publicar';

export function oficinaDoAparelho(o: Oficina): OficinaDoLink {
  return {
    nome: o.nome || 'Oficina',
    whatsapp: o.whatsapp || null,
    cidade: o.cidade || null,
    uf: o.uf || null,
    endereco: o.endereco || null,
    linkAvaliacao: o.linkAvaliacao || null,
    cnpj: o.cnpj ? o.cnpj.replace(/\D/g, '') : null
  };
}

/** Cria a garantia de uma ordem concluída que ficou sem (feita antes desta parte existir). */
function gerarGarantia(docId: Id, hoje: string): Id | null {
  const s = useOficina.getState();
  const doc = s.documentos[docId];
  if (!doc || doc.situacao !== 'concluida') return null;
  const veiculo = doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined;
  const g = garantiaDaOrdem(doc, { preferencias: s.preferencias, estoque: s.estoque, veiculo, hoje });
  if (!g) return null;
  const id = s.salvarRegistro('garantias', g);
  useOficina.getState().salvarDocumento({ ...useOficina.getState().documentos[docId], garantiaId: id });
  return id;
}

/** Manda o certificado pelo WhatsApp (com a conta, publica o link antes). */
function useMandarGarantia() {
  const ctx = useContextoDaConta();
  const toast = useToast();
  const nomeOficina = useOficina((s) => s.oficina.nome);
  return async (docId: Id) => {
    if (!ctx) return;
    const s = useOficina.getState();
    const doc = s.documentos[docId];
    const veiculo = doc?.veiculoId ? s.veiculos[doc.veiculoId] : undefined;
    const cliente = veiculo ? s.clientes[veiculo.clienteId] : undefined;
    const janela = cliente?.telefone ? janelaParaDepois() : null;
    const r = await publicarGarantia(docId, ctx);
    if (!r.ok || !r.link.url) {
      janela?.fechar();
      return toast({ texto: r.ok ? 'O link não ficou pronto.' : r.erro, tom: 'erro' });
    }
    const texto = mensagemDaGarantia({ oficina: nomeOficina, cliente: cliente?.nome ?? '', carro: veiculo?.modelo ?? '', link: r.link.url, codigo: r.link.codigo });
    const zap = cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null;
    if (janela && zap) janela.ir(zap);
    else toast({ texto: (await copiarTexto(texto)) ? 'Mensagem com o certificado copiada.' : 'Certificado publicado.' });
  };
}

export function PainelDaGarantia({ doc }: { doc: Documento }) {
  const hoje = useHoje();
  const garantia = useOficina((s) => (doc.garantiaId ? s.garantias[doc.garantiaId] : undefined));
  const ctx = useContextoDaConta();
  const mandar = useMandarGarantia();
  const [ocupado, setOcupado] = useState(false);
  if (doc.tipo !== 'ordem' || doc.situacao !== 'concluida') return null;
  if (!garantia) {
    return (
      <CaixaDoServico titulo="Garantia" icone={<ShieldCheck size={18} aria-hidden="true" />}>
        <Botao tamanho="pequeno" className="self-start" onClick={() => gerarGarantia(doc.id, hoje)}>
          <Plus size={15} aria-hidden="true" /> Gerar o certificado de garantia
        </Botao>
      </CaixaDoServico>
    );
  }
  const fim = fimDaGarantia(garantia);
  return (
    <CaixaDoServico
      titulo="Garantia"
      icone={<ShieldCheck size={18} aria-hidden="true" />}
      acao={
        <Link href={`/oficina/garantias?id=${garantia.id}`} className={classeBotao('fantasma', 'pequeno')}>
          Ver e mudar
        </Link>
      }
    >
      <p className="text-[14px] text-tinta-2">
        {garantia.itens.length} {garantia.itens.length === 1 ? 'item' : 'itens'}, até {formatarData(fim)}
        {doc.links?.garantia?.codigo ? (
          <>
            {' '}
            · código <strong className="num tracking-[0.1em] text-tinta">{doc.links.garantia.codigo}</strong>
          </>
        ) : null}
      </p>
      {ctx ? (
        <Botao
          variante="whatsapp"
          tamanho="pequeno"
          className="self-start"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            await mandar(doc.id);
            setOcupado(false);
          }}
        >
          <MessageCircle size={15} aria-hidden="true" /> {doc.links?.garantia?.url ? 'Mandar o certificado de novo' : 'Mandar o certificado'}
        </Botao>
      ) : (
        <AvisoSemConta texto="Sem conta, imprima o certificado. Entre com sua conta para mandar o link ao cliente." />
      )}
    </CaixaDoServico>
  );
}

export function GarantiasDoCarro({ veiculoId }: { veiculoId: Id }) {
  const garantias = useOficina((s) => s.garantias);
  const documentos = useOficina((s) => s.documentos);
  const hoje = useHoje();
  const lista = useMemo(
    () =>
      Object.values(garantias)
        .filter((g) => g.veiculoId === veiculoId)
        .sort((a, b) => (a.inicio < b.inicio ? 1 : -1)),
    [garantias, veiculoId]
  );
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="t-garantias-carro">
      <h2 id="t-garantias-carro" className="text-[21px]">
        Garantias
      </h2>
      <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
        {lista.map((g) => {
          const fim = fimDaGarantia(g);
          const vigente = fim >= hoje;
          const doc = documentos[g.documentoId];
          return (
            <li key={g.id}>
              <Link href={`/oficina/garantias?id=${g.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-papel-2 sm:px-5">
                <ShieldCheck size={17} className={vigente ? 'text-ok' : 'text-tinta-3'} aria-hidden="true" />
                <span className="font-semibold">{doc ? `OS nº ${doc.numero}` : 'Ordem de serviço'}</span>
                <span className="text-[13.5px] text-tinta-3">entregue em {formatarData(g.inicio)}</span>
                <span className={`ml-auto text-[13.5px] font-semibold ${vigente ? 'text-ok' : 'text-tinta-3'}`}>{vigente ? `até ${formatarData(fim)}` : 'terminou'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PaginaDasGarantias() {
  const id = useSearchParams().get('id');
  const garantia = useOficina((s) => (id ? s.garantias[id] : undefined));
  if (id && garantia) return <DetalheDaGarantia g={garantia} />;
  if (id) return <Vazio titulo="Garantia não encontrada" acao={<Link href="/oficina/garantias" className={classeBotao()}>Ver as garantias</Link>} />;
  return <ListaDeGarantias />;
}

function ListaDeGarantias() {
  const garantias = useOficina((s) => s.garantias);
  const veiculos = useOficina((s) => s.veiculos);
  const documentos = useOficina((s) => s.documentos);
  const hoje = useHoje();
  const lista = useMemo(() => Object.values(garantias).sort((a, b) => (a.inicio < b.inicio ? 1 : a.inicio > b.inicio ? -1 : a.criadoEm < b.criadoEm ? 1 : -1)), [garantias]);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="largo text-[30px] sm:text-[34px]">Garantias</h1>
        <p className="mt-1 max-w-[60ch] text-tinta-2">Cada ordem concluída gera o certificado de garantia do serviço e das peças. O cliente consulta pela placa e pelo código.</p>
      </header>
      {lista.length ? (
        <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {lista.slice(0, 100).map((g) => {
            const v = g.veiculoId ? veiculos[g.veiculoId] : undefined;
            const doc = documentos[g.documentoId];
            const fim = fimDaGarantia(g);
            return (
              <li key={g.id}>
                <Link href={`/oficina/garantias?id=${g.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-papel-2 sm:px-5">
                  {v ? <Placa placa={v.placa} /> : null}
                  <span className="font-semibold">{[v?.modelo, doc ? `OS nº ${doc.numero}` : ''].filter(Boolean).join(' · ') || 'Garantia'}</span>
                  <span className={`ml-auto text-[13.5px] font-semibold ${fim >= hoje ? 'text-ok' : 'text-tinta-3'}`}>{fim >= hoje ? `até ${formatarData(fim)}` : 'terminou'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo="Nenhuma garantia ainda">Quando uma ordem de serviço for concluída, o certificado aparece aqui.</Vazio>
      )}
    </div>
  );
}

function DetalheDaGarantia({ g }: { g: Garantia }) {
  const oficina = useOficina((s) => s.oficina);
  const doc = useOficina((s) => s.documentos[g.documentoId]);
  const veiculo = useOficina((s) => (g.veiculoId ? s.veiculos[g.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const ctx = useContextoDaConta();
  const mandar = useMandarGarantia();
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const dados = dadosDaGarantia(g, { numero: doc?.numero ?? null, cliente, veiculo });
  const host = typeof window !== 'undefined' ? window.location.host : 'revisai.howlks.com';

  return (
    <div className="flex flex-col gap-6">
      <div className="nao-imprimir flex flex-col gap-3">
        <Link href={doc ? `/oficina/ordens?aba=ordens&ver=${doc.id}` : '/oficina/garantias'} className="inline-flex items-center gap-1 self-start text-[14px] font-semibold text-tinta-3 hover:text-tinta">
          <ArrowLeft size={16} aria-hidden="true" /> {doc ? 'Voltar à ordem' : 'Garantias'}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => setEditando((x) => !x)}>
            <Pencil size={16} aria-hidden="true" /> {editando ? 'Fechar a edição' : 'Mudar a garantia'}
          </Botao>
          {ctx && doc ? (
            <Botao
              variante="whatsapp"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                await mandar(doc.id);
                setOcupado(false);
              }}
            >
              <MessageCircle size={17} aria-hidden="true" /> {doc.links?.garantia?.url ? 'Mandar de novo' : 'Mandar ao cliente'}
            </Botao>
          ) : null}
        </div>
        {!ctx ? <AvisoSemConta texto="Sem conta, imprima o certificado. Entre com sua conta para mandar o link ao cliente." /> : null}
        {editando ? <EditorDaGarantia g={g} aoSalvar={() => setEditando(false)} /> : null}
      </div>
      <CertificadoDeGarantia dados={dados} oficina={oficinaDoAparelho(oficina)} codigo={doc?.links?.garantia?.codigo ?? null} hoje={hojeNoBrasil()} enderecoDaConsulta={`${host}/garantia`} naOficina />
    </div>
  );
}

function EditorDaGarantia({ g, aoSalvar }: { g: Garantia; aoSalvar: () => void }) {
  const toast = useToast();
  const ctx = useContextoDaConta();
  const [itens, setItens] = useState<ItemDaGarantia[]>(g.itens);
  const [condicoes, setCondicoes] = useState(g.condicoes ?? '');
  const [inicio, setInicio] = useState(g.inicio);

  function mudar(i: number, parte: Partial<ItemDaGarantia>) {
    setItens((x) => x.map((it, n) => (n === i ? { ...it, ...parte } : it)));
  }

  async function salvar() {
    const limpos = itens.filter((i) => i.descricao.trim()).map((i) => ({ ...i, descricao: i.descricao.trim().slice(0, 160), dias: Math.max(0, Math.min(3650, Math.round(i.dias || 0))) }));
    if (!limpos.length) return toast({ texto: 'Deixe pelo menos um item na garantia.', tom: 'erro' });
    const atual = useOficina.getState().garantias[g.id];
    if (!atual) return;
    useOficina.getState().salvarRegistro('garantias', { ...atual, itens: limpos, condicoes: condicoes.trim().slice(0, 2000), inicio: /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : atual.inicio });
    aoSalvar();
    const doc = useOficina.getState().documentos[g.documentoId];
    if (ctx && doc?.links?.garantia?.url) {
      const r = await publicarGarantia(doc.id, ctx);
      toast(r.ok ? { texto: 'Garantia atualizada. O cliente já vê pelo link.' } : { texto: r.erro, tom: 'erro' });
    } else toast({ texto: 'Garantia atualizada.' });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha">
      <Campo rotulo="Início (entrega do carro)" htmlFor="g-inicio" className="max-w-[220px]">
        <input id="g-inicio" type="date" className={classeEntrada} value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </Campo>
      <ul className="flex flex-col gap-3">
        {itens.map((i, n) => (
          <li key={n} className="grid gap-2 sm:grid-cols-[1fr_120px_110px_auto] sm:items-end">
            <Campo rotulo={n === 0 ? 'Item' : <span className="sr-only">Item</span>} htmlFor={`g-desc-${n}`}>
              <input id={`g-desc-${n}`} className={classeEntrada} value={i.descricao} maxLength={160} onChange={(e) => mudar(n, { descricao: e.target.value })} />
            </Campo>
            <Campo rotulo={n === 0 ? 'Tipo' : <span className="sr-only">Tipo</span>} htmlFor={`g-tipo-${n}`}>
              <select id={`g-tipo-${n}`} className={classeEntrada} value={i.tipo} onChange={(e) => mudar(n, { tipo: e.target.value as ItemDaGarantia['tipo'] })}>
                <option value="servico">Serviço</option>
                <option value="peca">Peça</option>
              </select>
            </Campo>
            <Campo rotulo={n === 0 ? 'Dias' : <span className="sr-only">Dias</span>} htmlFor={`g-dias-${n}`}>
              <input id={`g-dias-${n}`} inputMode="numeric" className={`${classeEntrada} num`} value={String(i.dias)} onChange={(e) => mudar(n, { dias: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </Campo>
            <div className="flex items-center gap-2 pb-1">
              <span className="text-[12.5px] text-tinta-3">até {formatarData(somarDias(inicio || g.inicio, i.dias || 0))}</span>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-tinta-3 hover:bg-atraso-claro hover:text-atraso" aria-label={`Tirar ${i.descricao}`} onClick={() => setItens((x) => x.filter((_y, k) => k !== n))}>
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Botao tamanho="pequeno" variante="fantasma" className="self-start" onClick={() => setItens((x) => [...x, { descricao: '', tipo: 'servico', dias: 90, km: null }])}>
        <Plus size={15} aria-hidden="true" /> Item
      </Botao>
      <Campo rotulo="Condições" htmlFor="g-condicoes">
        <textarea id="g-condicoes" className={classeArea} rows={4} maxLength={2000} value={condicoes} onChange={(e) => setCondicoes(e.target.value)} />
      </Campo>
      <p className="text-[13px] text-tinta-3">Situação hoje: {itens.filter((i) => situacaoDoItem(inicio || g.inicio, i, hojeNoBrasil()).vigente).length} de {itens.length} na garantia.</p>
      <Botao variante="escuro" className="self-start" onClick={() => void salvar()}>
        Salvar a garantia
      </Botao>
    </div>
  );
}
