'use client';

import { Camera, Pencil, Plus, Rocket, Search } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { enviarFoto, impulsionar, salvarProduto } from '@/app/fornecedor/acoes';
import { combina, paraBusca } from '@/lib/loja/comum';
import { AvisoErro } from './comum';
import { TrocaExibicao, useExibicao } from '@/components/exibicao';
import { Folha } from '@/components/Folha';
import { FotoProduto } from '@/components/oficina/FotoProduto';
import { useReferencias } from '@/components/oficina/referencias';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Vazio, classeArea, classeEntrada } from '@/components/ui';
import { CATEGORIAS, nomeCategoria } from '@/lib/catalogo';
import { formatarMoeda, lerNumero } from '@/lib/formatos';
import { reduzirFoto } from '@/lib/imagem-cliente';
import type { LinhaImpulso, LinhaProduto, LinhaPromocao } from '@/lib/marketplace-dados';
import { DIAS_IMPULSO, PRECO_IMPULSO, type DiasImpulso } from '@/lib/planos-fornecedor';
import { nomeDaReferencia, referenciasDaCategoria, textoDoPrazo } from '@/lib/referencias';
import type { Categoria } from '@/lib/tipos';

type Unidade = LinhaProduto['unidade'];

interface Rascunho {
  id?: number;
  categoria: Categoria;
  nome: string;
  marca: string;
  descricao: string;
  unidade: Unidade;
  conteudo: string;
  preco: string;
  km: string;
  meses: string;
  referenciaId: string;
  ativo: boolean;
  viscosidade: string;
  base: '' | 'mineral' | 'semissintetico' | 'sintetico';
  api: string;
  acea: string;
  normas: string;
  medida: string;
  amperagem: string;
  tipo: string;
}

const UNIDADES: { id: Unidade; nome: string }[] = [
  { id: 'un', nome: 'Unidade' },
  { id: 'L', nome: 'Litros (frasco ou galão)' },
  { id: 'jogo', nome: 'Jogo' },
  { id: 'par', nome: 'Par' },
  { id: 'kit', nome: 'Kit' }
];

function texto(v: unknown): string {
  return typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? String(v) : '';
}

function rascunhoDe(p?: LinhaProduto): Rascunho {
  const e = p?.especificacao ?? {};
  return {
    id: p?.id,
    categoria: p?.categoria ?? 'oleo_motor',
    nome: p?.nome ?? '',
    marca: p?.marca ?? '',
    descricao: p?.descricao ?? '',
    unidade: p?.unidade ?? 'un',
    conteudo: p?.conteudo != null ? String(p.conteudo).replace('.', ',') : '',
    preco: p ? String(p.preco).replace('.', ',') : '',
    km: p?.intervalo_km != null ? String(p.intervalo_km) : '',
    meses: p?.intervalo_meses != null ? String(p.intervalo_meses) : '',
    referenciaId: p?.referencia_id != null ? String(p.referencia_id) : '',
    ativo: p?.ativo ?? true,
    viscosidade: texto(e.viscosidade),
    base: (texto(e.base) as Rascunho['base']) || '',
    api: texto(e.api),
    acea: texto(e.acea),
    normas: texto(e.normas),
    medida: texto(e.medida),
    amperagem: texto(e.amperagem),
    tipo: texto(e.tipo)
  };
}

function lista(t: string): string[] | undefined {
  const l = t
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return l.length ? l : undefined;
}

type FiltroProduto = 'todos' | 'na_loja' | 'fora' | 'sem_foto' | 'promocao' | 'impulso';

interface ContextoFiltro {
  promoDe: (p: LinhaProduto) => LinhaPromocao | undefined;
  impulsoDe: (p: LinhaProduto) => LinhaImpulso | undefined;
}

const FILTROS: { id: FiltroProduto; nome: string; passa: (p: LinhaProduto, c: ContextoFiltro) => boolean }[] = [
  { id: 'todos', nome: 'Todos', passa: () => true },
  { id: 'na_loja', nome: 'Na loja', passa: (p) => p.ativo },
  { id: 'fora', nome: 'Fora da loja', passa: (p) => !p.ativo },
  { id: 'sem_foto', nome: 'Sem foto', passa: (p) => !p.imagem_url },
  { id: 'promocao', nome: 'Em promoção', passa: (p, c) => !!c.promoDe(p) },
  { id: 'impulso', nome: 'Impulsionados', passa: (p, c) => !!c.impulsoDe(p) }
];

/** Como o produto está: fora da loja, promoção em vigor, impulso no ar ou pedido. */
function SelosDoProduto({ produto: p, promo, impulso }: { produto: LinhaProduto; promo?: LinhaPromocao; impulso?: LinhaImpulso }) {
  if (p.ativo && !promo && !impulso) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {!p.ativo ? <Chip tom="atraso">Fora da loja</Chip> : null}
      {promo ? <Chip tom="oleo">{promo.titulo}</Chip> : null}
      {impulso ? (
        <Chip tom={impulso.status === 'ativo' ? 'ok' : 'caneta'}>
          {impulso.status === 'ativo' ? `Patrocinado até ${impulso.fim?.split('-').reverse().slice(0, 2).join('/')}` : 'Impulso pedido'}
        </Chip>
      ) : null}
    </div>
  );
}

function AcoesDoProduto({
  produto: p,
  impulso,
  aoEditar,
  aoImpulsionar,
  podeImpulsionar
}: {
  produto: LinhaProduto;
  impulso?: LinhaImpulso;
  aoEditar: () => void;
  aoImpulsionar: () => void;
  podeImpulsionar: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Botao tamanho="pequeno" onClick={aoEditar}>
        <Pencil size={15} /> Editar
      </Botao>
      {podeImpulsionar && p.ativo && !impulso ? (
        <Botao tamanho="pequeno" onClick={aoImpulsionar}>
          <Rocket size={15} /> Impulsionar
        </Botao>
      ) : null}
    </div>
  );
}

export function ProdutosFornecedor({
  produtos,
  promocoes,
  impulsos,
  uf,
  hoje,
  abrirNovo,
  podeImpulsionar
}: {
  produtos: LinhaProduto[];
  promocoes: LinhaPromocao[];
  impulsos: LinhaImpulso[];
  uf: string | null;
  hoje: string;
  abrirNovo: boolean;
  /** Impulso é pago: só o dono pede. */
  podeImpulsionar: boolean;
}) {
  const toast = useToast();
  const { referencias } = useReferencias();
  const [rascunho, setRascunho] = useState<Rascunho | null>(abrirNovo ? rascunhoDe() : null);
  const [erro, setErro] = useState<string | null>(null);
  const [impulso, setImpulso] = useState<{ produto: LinhaProduto; dias: DiasImpulso; regiao: 'uf' | 'brasil' } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroProduto>('todos');
  const [exibicao, setExibicao] = useExibicao('revisai:fornecedor:exibicao');

  const editando = rascunho?.id != null ? produtos.find((p) => p.id === rascunho.id) : undefined;
  const refs = rascunho ? referenciasDaCategoria(referencias, rascunho.categoria) : [];

  function abrir(p?: LinhaProduto) {
    setErro(null);
    setRascunho(rascunhoDe(p));
  }

  function mudar(m: Partial<Rascunho>) {
    if (rascunho) setRascunho({ ...rascunho, ...m });
  }

  function salvar() {
    if (!rascunho) return;
    setErro(null);
    const preco = lerNumero(rascunho.preco);
    const conteudo = rascunho.conteudo.trim() ? lerNumero(rascunho.conteudo) : null;
    const km = rascunho.km.trim() ? lerNumero(rascunho.km) : null;
    const meses = rascunho.meses.trim() ? lerNumero(rascunho.meses) : null;
    const amperagem = rascunho.amperagem.trim() ? lerNumero(rascunho.amperagem) : null;
    if (!preco || preco <= 0) return setErro('Informe o preço.');
    const especificacao = {
      ...(rascunho.categoria === 'oleo_motor'
        ? {
            viscosidade: rascunho.viscosidade.trim().toUpperCase() || undefined,
            base: rascunho.base || undefined,
            api: rascunho.api.trim().toUpperCase() || undefined,
            acea: lista(rascunho.acea.toUpperCase()),
            normas: lista(rascunho.normas)
          }
        : {}),
      ...(rascunho.categoria === 'pneu' ? { medida: rascunho.medida.trim() || undefined } : {}),
      ...(rascunho.categoria === 'bateria' && amperagem ? { amperagem: Math.round(amperagem) } : {}),
      ...(rascunho.tipo.trim() ? { tipo: rascunho.tipo.trim() } : {})
    };
    iniciar(async () => {
      try {
        const r = await salvarProduto({
          id: rascunho.id,
          categoria: rascunho.categoria,
          nome: rascunho.nome,
          marca: rascunho.marca,
          descricao: rascunho.descricao,
          unidade: rascunho.unidade,
          conteudo,
          preco,
          intervaloKm: km ? Math.round(km) : null,
          intervaloMeses: meses ? Math.round(meses) : null,
          referenciaId: rascunho.referenciaId ? Number(rascunho.referenciaId) : null,
          ativo: rascunho.ativo,
          especificacao: Object.fromEntries(Object.entries(especificacao).filter(([, v]) => v !== undefined))
        });
        if (!r.ok) return setErro(r.erro);
        if (rascunho.id) {
          toast({ texto: 'Produto salvo.' });
          setRascunho(null);
        } else {
          toast({ texto: 'Produto criado. Agora mande uma foto dele.' });
          setRascunho({ ...rascunho, id: r.id });
        }
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  async function escolherFoto(f: File | undefined) {
    if (!f || !rascunho?.id) return;
    setErro(null);
    setEnviandoFoto(true);
    try {
      const reduzida = await reduzirFoto(f);
      const dados = new FormData();
      dados.set('foto', reduzida);
      const r = await enviarFoto(rascunho.id, dados);
      if (!r.ok) setErro(r.erro);
      else toast({ texto: 'Foto atualizada. Ela aparece na loja em alguns minutos.' });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para enviar a foto.');
    } finally {
      setEnviandoFoto(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  function pedirImpulso() {
    if (!impulso) return;
    iniciar(async () => {
      try {
        const r = await impulsionar(impulso.produto.id, impulso.dias, impulso.regiao === 'uf' && uf ? uf : '');
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        toast({ texto: 'Pedido de impulso enviado. A equipe do Revisaí combina o pagamento e coloca no ar.' });
        setImpulso(null);
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  const promoDe = (p: LinhaProduto) => promocoes.find((x) => x.produto_id === p.id && x.ativo && x.inicio <= hoje && x.fim >= hoje);
  const impulsoDe = (p: LinhaProduto) => impulsos.find((x) => x.produto_id === p.id && (x.status === 'pedido' || (x.status === 'ativo' && (x.fim ?? '') >= hoje)));
  const contexto = { promoDe, impulsoDe };
  const regra = FILTROS.find((f) => f.id === filtro) ?? FILTROS[0];
  const visiveis = produtos.filter((p) => regra.passa(p, contexto) && (!busca.trim() || combina(paraBusca(p.nome, p.marca, nomeCategoria(p.categoria)), busca)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-tinta-2">
          Produto com foto, ficha técnica e prazo de troca entra nas recomendações certas para as oficinas.
        </p>
        <Botao variante="escuro" onClick={() => abrir()}>
          <Plus size={17} /> Produto
        </Botao>
      </div>

      {produtos.length ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Buscar nos seus produtos</span>
              <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, marca ou categoria"
                className="h-11 w-full min-w-0 rounded-[10px] border border-linha bg-papel pr-3 pl-10 text-[16px] outline-none placeholder:text-tinta-3 focus:border-caneta focus:ring-3 focus:ring-caneta/20 sm:text-[15px]"
              />
            </label>
            <TrocaExibicao exibicao={exibicao} aoExibir={setExibicao} />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar produtos">
            {FILTROS.map((f) => {
              const n = produtos.filter((p) => f.passa(p, contexto)).length;
              if (f.id !== 'todos' && n === 0) return null;
              const sel = filtro === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => setFiltro(f.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
                >
                  {f.nome}
                  <span className={`num text-[13px] ${sel ? 'text-papel/75' : 'text-tinta-3'}`}>{n}</span>
                </button>
              );
            })}
          </div>

          {visiveis.length === 0 ? (
            <Vazio titulo="Nenhum produto com esse filtro">Tente outra palavra ou escolha Todos.</Vazio>
          ) : exibicao === 'grade' ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {visiveis.map((p) => {
                const promo = promoDe(p);
                const imp = impulsoDe(p);
                return (
                  <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
                    <button type="button" onClick={() => abrir(p)} className="relative block" aria-label={`Foto de ${p.nome}`} tabIndex={-1}>
                      <FotoProduto produto={{ imagemUrl: p.imagem_url, categoria: p.categoria, nome: p.nome }} tamanhos="(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw" className="aspect-square w-full sm:aspect-[4/3]" />
                      {!p.imagem_url ? (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-papel/95 px-1.5 py-0.5 text-[11.5px] font-bold text-tinta-2 ring-1 ring-linha">
                          <Camera size={12} aria-hidden="true" /> Foto da categoria
                        </span>
                      ) : null}
                    </button>
                    <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                      <p className="text-[12px] font-semibold text-tinta-3 sm:text-[12.5px]">{nomeCategoria(p.categoria)}</p>
                      <p className="line-clamp-2 text-[14.5px] leading-snug font-bold sm:text-[15.5px]">{[p.marca, p.nome].filter(Boolean).join(' ')}</p>
                      <SelosDoProduto produto={p} promo={promo} impulso={imp} />
                      <p className="largo num mt-auto pt-1 text-[18px] font-extrabold sm:text-[19px]">{formatarMoeda(p.preco)}</p>
                      <AcoesDoProduto produto={p} impulso={imp} aoEditar={() => abrir(p)} aoImpulsionar={() => setImpulso({ produto: p, dias: 7, regiao: uf ? 'uf' : 'brasil' })} podeImpulsionar={podeImpulsionar} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
              {visiveis.map((p) => {
                const promo = promoDe(p);
                const imp = impulsoDe(p);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:gap-4 sm:px-4">
                    <button type="button" onClick={() => abrir(p)} className="shrink-0 overflow-hidden rounded-xl ring-1 ring-linha" aria-label={`Foto de ${p.nome}`} tabIndex={-1}>
                      <FotoProduto produto={{ imagemUrl: p.imagem_url, categoria: p.categoria, nome: p.nome }} tamanhos="72px" className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 leading-snug font-bold">{[p.marca, p.nome].filter(Boolean).join(' ')}</p>
                      <p className="text-[13px] text-tinta-3">{nomeCategoria(p.categoria)}</p>
                      <div className="mt-1">
                        <SelosDoProduto produto={p} promo={promo} impulso={imp} />
                      </div>
                    </div>
                    <p className="largo num shrink-0 text-[17px] font-extrabold sm:w-28 sm:text-right sm:text-[18px]">{formatarMoeda(p.preco)}</p>
                    <div className="w-full sm:flex sm:w-[232px] sm:justify-end">
                      <AcoesDoProduto produto={p} impulso={imp} aoEditar={() => abrir(p)} aoImpulsionar={() => setImpulso({ produto: p, dias: 7, regiao: uf ? 'uf' : 'brasil' })} podeImpulsionar={podeImpulsionar} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <Vazio titulo="Nenhum produto ainda" acao={<Botao onClick={() => abrir()}>Cadastrar o primeiro</Botao>}>
          Cadastre o que você vende para as oficinas: óleo, filtros, velas, pastilhas, baterias, pneus.
        </Vazio>
      )}

      <Folha
        aberta={rascunho != null}
        aoFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? 'Produto' : 'Novo produto'}
        descricao="A ficha técnica decide para quais carros o produto é recomendado."
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setRascunho(null)}>
              Fechar
            </Botao>
            <Botao variante="primario" onClick={salvar} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        }
      >
        {rascunho ? (
          <div className="grid gap-4 sm:grid-cols-6">
            {rascunho.id ? (
              <div className="flex items-center gap-4 sm:col-span-6">
                <FotoProduto
                  produto={{ imagemUrl: editando?.imagem_url ?? null, categoria: rascunho.categoria, nome: rascunho.nome || 'Produto' }}
                  tamanhos="120px"
                  className="h-24 w-32 shrink-0 rounded-xl ring-1 ring-linha"
                />
                <div className="flex flex-col gap-1.5">
                  <input ref={arquivo} type="file" accept="image/*" className="sr-only" id="foto-produto" onChange={(e) => void escolherFoto(e.target.files?.[0])} />
                  <label htmlFor="foto-produto" className="inline-flex h-10 cursor-pointer items-center gap-2 self-start rounded-[10px] border border-linha bg-papel px-3.5 text-[14px] font-semibold hover:border-tinta-3">
                    <Camera size={16} aria-hidden="true" /> {enviandoFoto ? 'Enviando…' : editando?.imagem_url ? 'Trocar foto' : 'Mandar foto'}
                  </label>
                  <p className="text-[13px] text-tinta-3">Foto do produto em fundo claro. O app reduz antes de enviar.</p>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-papel-2 px-4 py-3 text-[14px] text-tinta-2 sm:col-span-6">Depois de salvar, você manda a foto do produto.</p>
            )}
            <Campo rotulo="Categoria" htmlFor="pf-cat" className="sm:col-span-3">
              <select id="pf-cat" className={classeEntrada} value={rascunho.categoria} onChange={(e) => mudar({ categoria: e.target.value as Categoria, referenciaId: '' })}>
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Marca" htmlFor="pf-marca" className="sm:col-span-3">
              <input id="pf-marca" className={classeEntrada} value={rascunho.marca} onChange={(e) => mudar({ marca: e.target.value })} maxLength={80} />
            </Campo>
            <Campo rotulo="Nome do produto" htmlFor="pf-nome" className="sm:col-span-6" dica="Como a oficina procura. Ex.: Óleo 5W-30 sintético API SP dexos1 1 L">
              <input id="pf-nome" className={classeEntrada} value={rascunho.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={160} />
            </Campo>
            <Campo rotulo="Vende por" htmlFor="pf-un" className="sm:col-span-2">
              <select id="pf-un" className={classeEntrada} value={rascunho.unidade} onChange={(e) => mudar({ unidade: e.target.value as Unidade })}>
                {UNIDADES.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo={rascunho.unidade === 'L' ? 'Litros na embalagem' : 'Conteúdo (opcional)'} htmlFor="pf-cont" className="sm:col-span-2">
              <input id="pf-cont" className={classeEntrada} value={rascunho.conteudo} onChange={(e) => mudar({ conteudo: e.target.value })} inputMode="decimal" placeholder={rascunho.unidade === 'L' ? '1' : ''} />
            </Campo>
            <Campo rotulo="Preço (R$)" htmlFor="pf-preco" className="sm:col-span-2">
              <input id="pf-preco" className={`${classeEntrada} num font-bold`} value={rascunho.preco} onChange={(e) => mudar({ preco: e.target.value })} inputMode="decimal" placeholder="0,00" />
            </Campo>

            {rascunho.categoria === 'oleo_motor' ? (
              <>
                <Campo rotulo="Viscosidade" htmlFor="pf-visc" className="sm:col-span-2">
                  <input id="pf-visc" className={classeEntrada} value={rascunho.viscosidade} onChange={(e) => mudar({ viscosidade: e.target.value })} placeholder="5W-30" />
                </Campo>
                <Campo rotulo="Base" htmlFor="pf-base" className="sm:col-span-2">
                  <select id="pf-base" className={classeEntrada} value={rascunho.base} onChange={(e) => mudar({ base: e.target.value as Rascunho['base'] })}>
                    <option value="">Não informar</option>
                    <option value="mineral">Mineral</option>
                    <option value="semissintetico">Semissintético</option>
                    <option value="sintetico">Sintético</option>
                  </select>
                </Campo>
                <Campo rotulo="API" htmlFor="pf-api" className="sm:col-span-2">
                  <input id="pf-api" className={classeEntrada} value={rascunho.api} onChange={(e) => mudar({ api: e.target.value })} placeholder="SP" />
                </Campo>
                <Campo rotulo="ACEA" htmlFor="pf-acea" className="sm:col-span-3" dica="Separe por vírgula. Ex.: C2, A5/B5">
                  <input id="pf-acea" className={classeEntrada} value={rascunho.acea} onChange={(e) => mudar({ acea: e.target.value })} />
                </Campo>
                <Campo rotulo="Normas das montadoras" htmlFor="pf-normas" className="sm:col-span-3" dica="Ex.: GM dexos1 Gen 3, VW 508 88">
                  <input id="pf-normas" className={classeEntrada} value={rascunho.normas} onChange={(e) => mudar({ normas: e.target.value })} />
                </Campo>
              </>
            ) : null}
            {rascunho.categoria === 'pneu' ? (
              <Campo rotulo="Medida" htmlFor="pf-medida" className="sm:col-span-3">
                <input id="pf-medida" className={classeEntrada} value={rascunho.medida} onChange={(e) => mudar({ medida: e.target.value })} placeholder="185/65 R15" />
              </Campo>
            ) : null}
            {rascunho.categoria === 'bateria' ? (
              <Campo rotulo="Amperagem (Ah)" htmlFor="pf-amp" className="sm:col-span-3">
                <input id="pf-amp" className={classeEntrada} value={rascunho.amperagem} onChange={(e) => mudar({ amperagem: e.target.value })} inputMode="numeric" placeholder="60" />
              </Campo>
            ) : null}
            {rascunho.categoria !== 'oleo_motor' ? (
              <Campo rotulo="Tipo ou tecnologia" htmlFor="pf-tipo" className="sm:col-span-3" dica="Opcional. Ex.: irídio, cerâmica, AGM, refil">
                <input id="pf-tipo" className={classeEntrada} value={rascunho.tipo} onChange={(e) => mudar({ tipo: e.target.value })} maxLength={40} />
              </Campo>
            ) : null}

            <div className="flex flex-col gap-3 rounded-xl bg-papel-2 px-4 py-4 sm:col-span-6">
              <p className="font-semibold">Prazo de troca</p>
              {refs.length ? (
                <Campo rotulo="Ligar à base de prazos do fabricante" htmlFor="pf-ref">
                  <select id="pf-ref" className={classeEntrada} value={rascunho.referenciaId} onChange={(e) => mudar({ referenciaId: e.target.value })}>
                    <option value="">Nenhuma</option>
                    {refs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {nomeDaReferencia(r)} ({r.segueManual ? 'segue o manual' : textoDoPrazo(r.intervaloKm, r.intervaloMeses)})
                      </option>
                    ))}
                  </select>
                </Campo>
              ) : null}
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <Campo rotulo="Troca a cada (km)" htmlFor="pf-km">
                  <input id="pf-km" className={classeEntrada} value={rascunho.km} onChange={(e) => mudar({ km: e.target.value })} inputMode="numeric" placeholder="sem km" />
                </Campo>
                <Campo rotulo="ou (meses)" htmlFor="pf-meses">
                  <input id="pf-meses" className={classeEntrada} value={rascunho.meses} onChange={(e) => mudar({ meses: e.target.value })} inputMode="numeric" placeholder="sem prazo" />
                </Campo>
              </div>
              <p className="text-[13px] text-tinta-3">O que o fabricante do produto indica. Em branco, vale a base ligada acima ou o padrão do app. O manual do carro sempre manda quando pede menos.</p>
            </div>

            <Campo rotulo="Descrição" htmlFor="pf-desc" className="sm:col-span-6" dica="Aplicação, diferenciais, garantia.">
              <textarea id="pf-desc" rows={3} className={classeArea} value={rascunho.descricao} onChange={(e) => mudar({ descricao: e.target.value })} maxLength={600} />
            </Campo>
            <div className="rounded-xl border border-linha px-4 py-1 sm:col-span-6">
              <Alternar id="pf-ativo" ligado={rascunho.ativo} aoMudar={(v) => mudar({ ativo: v })} rotulo="À venda" descricao="Desligado, o produto some da loja das oficinas." />
            </div>
            {erro ? (
              <div className="sm:col-span-6">
                <AvisoErro>{erro}</AvisoErro>
              </div>
            ) : null}
          </div>
        ) : null}
      </Folha>

      <Folha
        aberta={impulso != null}
        aoFechar={() => setImpulso(null)}
        titulo="Impulsionar produto"
        descricao={impulso ? `${[impulso.produto.marca, impulso.produto.nome].filter(Boolean).join(' ')} aparece primeiro na categoria e ao lado da sugestão de compra, com o selo Patrocinado.` : undefined}
        rodape={
          impulso ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <p>
                Total <strong className="largo num text-[19px]">{formatarMoeda(PRECO_IMPULSO[impulso.dias])}</strong>
              </p>
              <Botao variante="primario" onClick={pedirImpulso} disabled={ocupado}>
                <Rocket size={17} /> Pedir impulso
              </Botao>
            </div>
          ) : undefined
        }
      >
        {impulso ? (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 font-semibold">Por quanto tempo</p>
              <div className="grid grid-cols-3 gap-2">
                {DIAS_IMPULSO.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={impulso.dias === d}
                    onClick={() => setImpulso({ ...impulso, dias: d })}
                    className={`rounded-xl border px-3 py-3 text-left ${impulso.dias === d ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel hover:border-tinta-3'}`}
                  >
                    <span className="block font-bold">{d} dias</span>
                    <span className={`num block text-[14px] ${impulso.dias === d ? 'text-papel/80' : 'text-tinta-3'}`}>{formatarMoeda(PRECO_IMPULSO[d])}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-semibold">Onde</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {uf ? (
                  <button
                    type="button"
                    aria-pressed={impulso.regiao === 'uf'}
                    onClick={() => setImpulso({ ...impulso, regiao: 'uf' })}
                    className={`rounded-xl border px-4 py-3 text-left font-semibold ${impulso.regiao === 'uf' ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel hover:border-tinta-3'}`}
                  >
                    Oficinas de {uf}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-pressed={impulso.regiao === 'brasil'}
                  onClick={() => setImpulso({ ...impulso, regiao: 'brasil' })}
                  className={`rounded-xl border px-4 py-3 text-left font-semibold ${impulso.regiao === 'brasil' ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel hover:border-tinta-3'}`}
                >
                  Brasil todo
                </button>
              </div>
            </div>
            <p className="text-[14px] text-tinta-2">
              A equipe do Revisaí confirma pelo WhatsApp, combina o pagamento e coloca no ar. O impulso só começa a contar quando entra no ar.
            </p>
          </div>
        ) : null}
      </Folha>
    </div>
  );
}
