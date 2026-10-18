'use client';

// O valor FIPE na página do carro: o da última consulta, com o botão de atualizar. Sem o código
// FIPE, a pessoa acha o carro na tabela (marca, modelo e ano) ou digita o código.

import { RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Secao, classeEntrada } from '@/components/ui';
import {
  escolherPreco,
  esquemaOpcaoFipe,
  esquemaPrecoFipe,
  filtrarModelos,
  fipeDesatualizada,
  fipeDoPreco,
  lerCodigoFipe,
  marcaFipeDoCarro,
  nomeDaReferencia,
  nomeDoAnoFipe,
  type OpcaoFipe,
  type PrecoFipe
} from '@/lib/fipe';
import { formatarData, dataLocal } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { Id, Veiculo } from '@/lib/tipos';

type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

async function pedirFipe(q: string): Promise<Resposta<{ opcoes?: OpcaoFipe[]; precos?: PrecoFipe[] }>> {
  try {
    const r = await fetch(`/api/veiculos/fipe?${q}`);
    const corpo = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string; opcoes?: unknown[]; precos?: unknown[] };
    if (!r.ok || !corpo.ok) return { ok: false, erro: corpo.erro ?? 'A tabela FIPE não respondeu agora. Tente de novo.' };
    return {
      ok: true,
      dados: {
        opcoes: corpo.opcoes?.map((x) => esquemaOpcaoFipe.safeParse(x).data).filter((x): x is OpcaoFipe => !!x),
        precos: corpo.precos?.map((x) => esquemaPrecoFipe.safeParse(x).data).filter((x): x is PrecoFipe => !!x)
      }
    };
  } catch {
    return { ok: false, erro: 'Sem internet agora. Tente de novo depois.' };
  }
}

/** Grava o preço escolhido no carro (e o ano do modelo, se o carro ainda não tinha). */
function gravarPreco(veiculoId: Id, p: PrecoFipe) {
  const s = useOficina.getState();
  const v = s.veiculos[veiculoId];
  if (!v) return;
  s.salvarVeiculo({ ...v, fipe: fipeDoPreco(p), ...(v.anoModelo == null && p.anoModelo ? { anoModelo: p.anoModelo } : {}) });
}

export function PainelFipe({ veiculoId }: { veiculoId: Id }) {
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const toast = useToast();
  const [atualizando, setAtualizando] = useState(false);
  const [folha, setFolha] = useState<null | { opcoes: PrecoFipe[] } | 'buscar'>(null);
  if (!veiculo) return null;
  const fipe = veiculo.fipe ?? null;

  async function atualizar() {
    if (!veiculo?.fipe) return setFolha('buscar');
    setAtualizando(true);
    const r = await pedirFipe(`acao=preco&codigo=${encodeURIComponent(veiculo.fipe.codigo)}`);
    setAtualizando(false);
    if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
    const { escolhido, opcoes } = escolherPreco(r.dados.precos ?? [], veiculo);
    if (escolhido) {
      gravarPreco(veiculo.id, escolhido);
      toast({ texto: `Valor FIPE de ${nomeDaReferencia(escolhido.referencia)}: ${formatarMoeda(escolhido.valor)}.` });
    } else if (opcoes.length) setFolha({ opcoes });
    else toast({ texto: 'A FIPE não tem preço para esse código.', tom: 'erro' });
  }

  return (
    <Secao
      titulo="Valor FIPE"
      descricao="O preço médio do carro na tabela FIPE do mês."
      acao={
        fipe ? (
          <Botao tamanho="pequeno" onClick={atualizar} disabled={atualizando}>
            <RefreshCw size={15} aria-hidden="true" className={atualizando ? 'animate-spin' : ''} /> {atualizando ? 'Atualizando…' : 'Atualizar'}
          </Botao>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
        {fipe ? (
          <div className="min-w-0">
            <p className="largo num text-[26px] leading-tight font-extrabold" data-testid="valor-fipe">
              {fipe.valor != null ? formatarMoeda(fipe.valor) : 'Sem valor'}
            </p>
            <p className="text-[13.5px] text-tinta-2">
              {/^\d{4}-\d{2}$/.test(fipe.referencia) ? `Tabela de ${nomeDaReferencia(fipe.referencia)}` : fipe.referencia}, código {fipe.codigo}. Consultado em {formatarData(dataLocal(fipe.consultadoEm))}.
            </p>
            {fipeDesatualizada(fipe) ? <p className="mt-1 text-[13.5px] font-semibold text-oleo-tinta">A tabela já virou o mês. Atualize para ver o valor de agora.</p> : null}
            <button type="button" onClick={() => setFolha('buscar')} className="mt-1 text-[13.5px] font-semibold text-caneta hover:underline">
              Não é este carro? Achar na tabela
            </button>
          </div>
        ) : (
          <>
            <p className="text-tinta-2">Ainda sem o valor FIPE deste carro.</p>
            <Botao tamanho="pequeno" onClick={() => setFolha('buscar')}>
              <Search size={15} aria-hidden="true" /> Achar na tabela FIPE
            </Botao>
          </>
        )}
      </div>
      <FolhaFipe
        veiculo={veiculo}
        aberta={folha != null}
        anos={folha && folha !== 'buscar' ? folha.opcoes : null}
        aoFechar={() => setFolha(null)}
        aoEscolher={(p) => {
          gravarPreco(veiculo.id, p);
          setFolha(null);
          toast({ texto: `Valor FIPE salvo: ${formatarMoeda(p.valor)}.` });
        }}
      />
    </Secao>
  );
}

type Passo = { tipo: 'marca' } | { tipo: 'modelo'; marca: OpcaoFipe } | { tipo: 'ano'; precos: PrecoFipe[] } | { tipo: 'anoDoModelo'; marca: OpcaoFipe; modelo: OpcaoFipe; anos: OpcaoFipe[] };

function FolhaFipe({ veiculo, aberta, anos, aoFechar, aoEscolher }: { veiculo: Veiculo; aberta: boolean; anos: PrecoFipe[] | null; aoFechar: () => void; aoEscolher: (p: PrecoFipe) => void }) {
  const [marcas, setMarcas] = useState<OpcaoFipe[] | null>(null);
  const [modelos, setModelos] = useState<OpcaoFipe[] | null>(null);
  const [passo, setPasso] = useState<Passo>({ tipo: 'marca' });
  const [busca, setBusca] = useState('');
  const [codigo, setCodigo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ao abrir: com os anos já na mão (o código tinha mais de um), começa por eles; senão, pela marca
  const [aberturaAnterior, setAberturaAnterior] = useState(false);
  if (aberta !== aberturaAnterior) {
    setAberturaAnterior(aberta);
    if (aberta) {
      setErro(null);
      setCodigo('');
      setBusca(veiculo.modelo);
      setPasso(anos?.length ? { tipo: 'ano', precos: anos } : { tipo: 'marca' });
    }
  }

  const comecarPelaMarca = aberta && !anos?.length;
  useEffect(() => {
    if (!comecarPelaMarca) return;
    let vivo = true;
    void (async () => {
      setCarregando(true);
      const r = await pedirFipe('acao=marcas');
      if (!vivo) return;
      setCarregando(false);
      if (!r.ok) return setErro(r.erro);
      const lista = r.dados.opcoes ?? [];
      setMarcas(lista);
      const doCarro = marcaFipeDoCarro(lista, veiculo.marca);
      if (doCarro) void escolherMarca(doCarro);
    })();
    return () => {
      vivo = false;
    };
    // só ao abrir: a marca do carro é a de quando abriu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comecarPelaMarca]);

  async function escolherMarca(m: OpcaoFipe) {
    setErro(null);
    setCarregando(true);
    const r = await pedirFipe(`acao=modelos&marca=${encodeURIComponent(m.codigo)}`);
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    setModelos(r.dados.opcoes ?? []);
    setPasso({ tipo: 'modelo', marca: m });
  }

  async function escolherModelo(marca: OpcaoFipe, modelo: OpcaoFipe) {
    setErro(null);
    setCarregando(true);
    const r = await pedirFipe(`acao=anos&marca=${encodeURIComponent(marca.codigo)}&modelo=${encodeURIComponent(modelo.codigo)}`);
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    setPasso({ tipo: 'anoDoModelo', marca, modelo, anos: r.dados.opcoes ?? [] });
  }

  async function escolherAnoDoModelo(marca: OpcaoFipe, modelo: OpcaoFipe, ano: OpcaoFipe) {
    setErro(null);
    setCarregando(true);
    const r = await pedirFipe(`acao=detalhe&marca=${encodeURIComponent(marca.codigo)}&modelo=${encodeURIComponent(modelo.codigo)}&ano=${encodeURIComponent(ano.codigo)}`);
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    const p = r.dados.precos?.[0];
    if (p) aoEscolher(p);
    else setErro('A FIPE não tem preço para esse ano.');
  }

  async function porCodigo() {
    const c = lerCodigoFipe(codigo);
    if (!c) return setErro('O código FIPE tem 7 números, como 004478-1.');
    setErro(null);
    setCarregando(true);
    const r = await pedirFipe(`acao=preco&codigo=${c}`);
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    const { escolhido, opcoes } = escolherPreco(r.dados.precos ?? [], veiculo);
    if (escolhido) aoEscolher(escolhido);
    else if (opcoes.length) setPasso({ tipo: 'ano', precos: opcoes });
    else setErro('A FIPE não tem preço para esse código.');
  }

  const modelosVisiveis = useMemo(() => {
    const lista = modelos ?? [];
    const filtrados = filtrarModelos(lista, busca);
    return (busca.trim() && filtrados.length ? filtrados : lista).slice(0, 40);
  }, [modelos, busca]);

  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Achar na tabela FIPE" descricao={[veiculo.marca, veiculo.modelo, veiculo.anoModelo ?? veiculo.ano].filter(Boolean).join(' ')}>
      <div className="flex flex-col gap-4" aria-busy={carregando}>
        {passo.tipo === 'ano' ? (
          <section className="flex flex-col gap-2">
            <h3 className="font-bold">Qual destes é o carro?</h3>
            <ul className="flex flex-col gap-2">
              {passo.precos.map((p) => (
                <li key={`${p.anoModelo}-${p.combustivel}-${p.zeroKm}`}>
                  <button type="button" onClick={() => aoEscolher(p)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left ring-1 ring-linha hover:ring-tinta-3">
                    <span className="min-w-0">
                      <span className="block font-semibold">{nomeDoAnoFipe(p)}</span>
                      <span className="block truncate text-[13px] text-tinta-3">{p.modelo}</span>
                    </span>
                    <span className="num shrink-0 font-bold">{formatarMoeda(p.valor)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <>
            <Campo rotulo="Marca" htmlFor="fipe-marca">
              <select
                id="fipe-marca"
                className={classeEntrada}
                value={passo.tipo === 'modelo' || passo.tipo === 'anoDoModelo' ? passo.marca.codigo : ''}
                onChange={(e) => {
                  const m = marcas?.find((x) => x.codigo === e.target.value);
                  if (m) void escolherMarca(m);
                }}
                disabled={!marcas}
              >
                <option value="">{marcas ? 'Escolha a marca' : 'Carregando…'}</option>
                {(marcas ?? []).map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </Campo>

            {passo.tipo === 'modelo' ? (
              <section className="flex flex-col gap-2">
                <label htmlFor="fipe-busca" className="text-sm font-semibold">
                  Modelo
                </label>
                <input id="fipe-busca" className={classeEntrada} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Onix 1.0, HB20, Gol…" autoComplete="off" />
                <ul className="flex max-h-72 flex-col divide-y divide-linha overflow-y-auto rounded-xl ring-1 ring-linha">
                  {modelosVisiveis.map((m) => (
                    <li key={m.codigo}>
                      <button type="button" onClick={() => escolherModelo(passo.marca, m)} className="w-full px-3.5 py-2.5 text-left text-[14.5px] hover:bg-papel-2">
                        {m.nome}
                      </button>
                    </li>
                  ))}
                </ul>
                {!modelosVisiveis.length ? <p className="text-[14px] text-tinta-2">Nenhum modelo dessa marca na FIPE.</p> : null}
              </section>
            ) : null}

            {passo.tipo === 'anoDoModelo' ? (
              <section className="flex flex-col gap-2">
                <p className="text-[14px] text-tinta-2">{passo.modelo.nome}</p>
                <h3 className="font-bold">Ano do modelo</h3>
                <div className="flex flex-wrap gap-2">
                  {passo.anos.map((a) => (
                    <button key={a.codigo} type="button" onClick={() => escolherAnoDoModelo(passo.marca, passo.modelo, a)} className="num h-10 rounded-full border border-linha px-3.5 text-[14px] font-semibold hover:border-tinta-3">
                      {a.nome.replace(/^32000/, 'Zero km')}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setPasso({ tipo: 'modelo', marca: passo.marca })} className="self-start text-[14px] font-semibold text-caneta hover:underline">
                  Trocar o modelo
                </button>
              </section>
            ) : null}

            <section className="flex flex-col gap-2 border-t border-linha pt-4">
              <label htmlFor="fipe-codigo" className="text-sm font-semibold">
                Ou o código FIPE
              </label>
              <div className="flex gap-2">
                <input id="fipe-codigo" className={`${classeEntrada} num`} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="004478-1" inputMode="numeric" autoComplete="off" />
                <Botao onClick={porCodigo} disabled={carregando}>
                  Buscar
                </Botao>
              </div>
            </section>
          </>
        )}
        {carregando ? <p className="text-[14px] text-tinta-3">Consultando a FIPE…</p> : null}
        {erro ? (
          <p className="text-[14px] text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </Folha>
  );
}
