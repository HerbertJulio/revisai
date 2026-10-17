'use client';

// Os filtros da loja, com quantos produtos cada opção traz. No computador ficam na lateral;
// no celular abrem numa folha pelo botão Filtros.

import { useState, type ReactNode } from 'react';
import { IconeServico } from '@/components/icones';
import { lerNumero } from '@/lib/formatos';
import { servicosDaCategoria } from '@/lib/manutencao';
import type { Categoria } from '@/lib/tipos';
import type { Facetas, FiltrosLoja, Opcao } from '@/lib/vitrine';

const VISIVEIS = 6;
const CATEGORIAS_VISIVEIS = 8;

/** `comPrecos` falso (quem não entrou na conta): sem os filtros de promoção e de preço. */
export function PainelFiltros({ filtros, facetas, aoMudar, comPrecos = true }: { filtros: FiltrosLoja; facetas: Facetas; aoMudar: (f: FiltrosLoja) => void; comPrecos?: boolean }) {
  const [todasCategorias, setTodasCategorias] = useState(false);
  // a categoria escolhida fica sempre à vista, mesmo fora das primeiras
  const categorias = todasCategorias
    ? facetas.categorias
    : facetas.categorias.filter((c, i) => i < CATEGORIAS_VISIVEIS || c.valor === filtros.categoria);
  const deOleo = filtros.categoria === 'oleo_motor' || filtros.viscosidades.length > 0 || filtros.bases.length > 0 || filtros.normas.length > 0;
  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const totalCategorias = facetas.categorias.reduce((s, c) => s + c.n, 0);

  return (
    <div className="flex flex-col gap-6">
      <Grupo titulo="Categoria">
        <ul className="-mx-2 flex flex-col">
          <li>
            <OpcaoCategoria ativa={!filtros.categoria} n={totalCategorias} aoEscolher={() => aoMudar({ ...filtros, categoria: null, viscosidades: [], bases: [], normas: [] })}>
              Todas
            </OpcaoCategoria>
          </li>
          {categorias.map((c) => (
            <li key={c.valor}>
              <OpcaoCategoria
                ativa={filtros.categoria === c.valor}
                n={c.n}
                categoria={c.valor}
                aoEscolher={() => aoMudar({ ...filtros, categoria: filtros.categoria === c.valor ? null : c.valor, viscosidades: [], bases: [], normas: [] })}
              >
                {c.nome}
              </OpcaoCategoria>
            </li>
          ))}
        </ul>
        {facetas.categorias.length > CATEGORIAS_VISIVEIS ? (
          <button type="button" onClick={() => setTodasCategorias(!todasCategorias)} className="self-start text-[13.5px] font-semibold text-caneta hover:underline">
            {todasCategorias ? 'Ver menos' : `Ver mais ${facetas.categorias.length - CATEGORIAS_VISIVEIS}`}
          </button>
        ) : null}
      </Grupo>

      <Grupo titulo={comPrecos ? 'Ofertas' : 'Lojas'}>
        {comPrecos ? (
          <Caixa marcada={filtros.promocao} n={facetas.promocao} aoMudar={(v) => aoMudar({ ...filtros, promocao: v })}>
            Em promoção
          </Caixa>
        ) : null}
        <Caixa marcada={filtros.destaque} n={facetas.destaque} aoMudar={(v) => aoMudar({ ...filtros, destaque: v })}>
          Lojas destaque
        </Caixa>
      </Grupo>

      {deOleo && facetas.viscosidades.length ? (
        <Grupo titulo="Viscosidade">
          <div className="flex flex-wrap gap-1.5">
            {facetas.viscosidades.map((o) => {
              const sel = filtros.viscosidades.includes(o.valor);
              return (
                <button
                  key={o.valor}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => aoMudar({ ...filtros, viscosidades: alternar(filtros.viscosidades, o.valor) })}
                  className={`num h-8 rounded-lg border px-2.5 text-[13px] font-semibold ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
                >
                  {o.nome}
                  <span className={`ml-1 text-[11.5px] ${sel ? 'text-papel/70' : 'text-tinta-3'}`}>{o.n}</span>
                </button>
              );
            })}
          </div>
        </Grupo>
      ) : null}
      {deOleo && facetas.bases.length > 1 ? (
        <Grupo titulo="Base">
          <Lista opcoes={facetas.bases} marcadas={filtros.bases} aoMudar={(v) => aoMudar({ ...filtros, bases: alternar(filtros.bases, v) })} />
        </Grupo>
      ) : null}
      {deOleo && facetas.normas.length ? (
        <Grupo titulo="Norma da montadora">
          <Lista opcoes={facetas.normas} marcadas={filtros.normas} aoMudar={(v) => aoMudar({ ...filtros, normas: alternar(filtros.normas, v) })} />
        </Grupo>
      ) : null}

      {facetas.marcas.length > 1 ? (
        <Grupo titulo="Marca">
          <Lista opcoes={facetas.marcas} marcadas={filtros.marcas} aoMudar={(v) => aoMudar({ ...filtros, marcas: alternar(filtros.marcas, v) })} />
        </Grupo>
      ) : null}

      {facetas.fornecedores.length > 1 || filtros.fornecedores.length ? (
        <Grupo titulo="Fornecedor">
          <Lista opcoes={facetas.fornecedores} marcadas={filtros.fornecedores} aoMudar={(v) => aoMudar({ ...filtros, fornecedores: alternar(filtros.fornecedores, v) })} />
        </Grupo>
      ) : null}

      {comPrecos ? (
        <Grupo titulo="Preço por unidade">
          <FaixaDePreco filtros={filtros} faixa={facetas.faixa} aoMudar={aoMudar} />
        </Grupo>
      ) : null}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-[14px] font-bold">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function OpcaoCategoria({ ativa, n, categoria, aoEscolher, children }: { ativa: boolean; n: number; categoria?: Categoria; aoEscolher: () => void; children: ReactNode }) {
  const servico = categoria ? servicosDaCategoria(categoria)[0] : undefined;
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={aoEscolher}
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[14px] ${ativa ? 'bg-tinta font-semibold text-papel' : 'text-tinta-2 hover:bg-papel-2 hover:text-tinta'}`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center ${ativa ? 'text-papel' : 'text-tinta-3'}`} aria-hidden="true">
        {servico ? <IconeServico servico={servico} size={16} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className={`num text-[12.5px] ${ativa ? 'text-papel/70' : 'text-tinta-3'}`}>{n}</span>
    </button>
  );
}

function Caixa({ marcada, n, aoMudar, children }: { marcada: boolean; n: number; aoMudar: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={`flex min-h-8 cursor-pointer items-center gap-2.5 text-[14px] ${n === 0 && !marcada ? 'text-tinta-3' : 'text-tinta'}`}>
      <input type="checkbox" checked={marcada} onChange={(e) => aoMudar(e.target.checked)} className="h-[18px] w-[18px] shrink-0 accent-[var(--tinta)]" disabled={n === 0 && !marcada} />
      <span className="min-w-0 flex-1">{children}</span>
      <span className="num text-[12.5px] text-tinta-3">{n}</span>
    </label>
  );
}

function Lista<T extends string | number>({ opcoes, marcadas, aoMudar }: { opcoes: Opcao<T>[]; marcadas: T[]; aoMudar: (v: T) => void }) {
  const [todas, setTodas] = useState(false);
  // as marcadas sempre aparecem, mesmo que tenham ficado sem produto com os outros filtros
  const faltando = marcadas.filter((m) => !opcoes.some((o) => o.valor === m)).map((m) => ({ valor: m, nome: String(m), n: 0 }));
  const lista = [...opcoes, ...faltando];
  const visiveis = todas ? lista : lista.slice(0, VISIVEIS);
  return (
    <>
      {visiveis.map((o) => (
        <Caixa key={String(o.valor)} marcada={marcadas.includes(o.valor)} n={o.n} aoMudar={() => aoMudar(o.valor)}>
          {o.nome}
        </Caixa>
      ))}
      {lista.length > VISIVEIS ? (
        <button type="button" onClick={() => setTodas(!todas)} className="self-start text-[13.5px] font-semibold text-caneta hover:underline">
          {todas ? 'Ver menos' : `Ver mais ${lista.length - VISIVEIS}`}
        </button>
      ) : null}
    </>
  );
}

function FaixaDePreco({ filtros, faixa, aoMudar }: { filtros: FiltrosLoja; faixa: Facetas['faixa']; aoMudar: (f: FiltrosLoja) => void }) {
  const aplicar = (campo: 'precoMin' | 'precoMax', texto: string) => {
    const n = lerNumero(texto.replace(/r\$/i, ''));
    const valor = n != null && n >= 0 ? Math.round(n * 100) / 100 : null;
    if (valor !== filtros[campo]) aoMudar({ ...filtros, [campo]: valor });
  };
  return (
    <div className="flex items-center gap-2">
      <Preco
        rotulo="Preço mínimo"
        valor={filtros.precoMin}
        dica={faixa ? String(faixa.min) : 'Mín.'}
        aoAplicar={(t) => aplicar('precoMin', t)}
      />
      <span className="text-tinta-3" aria-hidden="true">
        a
      </span>
      <Preco
        rotulo="Preço máximo"
        valor={filtros.precoMax}
        dica={faixa ? String(faixa.max) : 'Máx.'}
        aoAplicar={(t) => aplicar('precoMax', t)}
      />
    </div>
  );
}

function Preco({ rotulo, valor, dica, aoAplicar }: { rotulo: string; valor: number | null; dica: string; aoAplicar: (t: string) => void }) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="sr-only">{rotulo}</span>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-tinta-3" aria-hidden="true">
        R$
      </span>
      <input
        key={valor ?? 'vazio'}
        defaultValue={valor != null ? String(valor).replace('.', ',') : ''}
        placeholder={dica}
        inputMode="decimal"
        onBlur={(e) => aoAplicar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') aoAplicar((e.target as HTMLInputElement).value);
        }}
        className="num h-10 w-full min-w-0 rounded-[10px] border border-linha bg-papel pr-2 pl-8 text-[16px] outline-none placeholder:text-tinta-3 focus:border-caneta focus:ring-3 focus:ring-caneta/20 sm:text-[14px]"
      />
    </label>
  );
}
