'use client';

import { ExternalLink, Search } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { decidirSugestaoDaBase } from '@/app/admin/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Vazio, classeEntrada } from '@/components/ui';
import { CATEGORIAS, nomeCategoria } from '@/lib/catalogo';
import { quandoFoi } from '@/lib/equipe-dados';
import type { LinhaReferencia } from '@/lib/marketplace-dados';
import { nomeDaReferencia, textoDoPrazo } from '@/lib/referencias';
import type { Categoria } from '@/lib/tipos';
import { Filtro, LinhaDeFiltros } from './comum';

type Grupo = 'sugestoes' | 'base' | 'fora';

const GRUPOS: { id: Grupo; nome: string }[] = [
  { id: 'sugestoes', nome: 'Sugestões' },
  { id: 'base', nome: 'Na base' },
  { id: 'fora', nome: 'Fora da base' }
];

const NOMES_CONFIANCA: Record<LinhaReferencia['confianca'], string> = {
  fabricante: 'Fabricante',
  imprensa: 'Imprensa',
  mercado: 'Mercado',
  oficina: 'Oficina',
  fornecedor: 'Fornecedor'
};

function grupoDe(r: LinhaReferencia): Grupo {
  if (!r.ativo) return 'fora';
  return r.aprovado ? 'base' : 'sugestoes';
}

export function BaseAdmin({ linhas, podeDecidir = true }: { linhas: LinhaReferencia[]; /** Só o suporte aprova e tira da base. */ podeDecidir?: boolean }) {
  const toast = useToast();
  const [grupo, setGrupo] = useState<Grupo>(linhas.some((r) => grupoDe(r) === 'sugestoes') ? 'sugestoes' : 'base');
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [busca, setBusca] = useState('');
  const [ocupado, iniciar] = useTransition();
  const agora = Date.now();
  const contagem = useMemo(() => {
    const c: Record<Grupo, number> = { sugestoes: 0, base: 0, fora: 0 };
    for (const r of linhas) c[grupoDe(r)]++;
    return c;
  }, [linhas]);

  const t = busca.trim().toLowerCase();
  const visiveis = linhas
    .filter((r) => grupoDe(r) === grupo && (!categoria || r.categoria === categoria))
    .filter((r) => !t || `${r.marca} ${r.linha} ${r.tipo ?? ''} ${r.observacao ?? ''}`.toLowerCase().includes(t))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || nomeDaReferencia(a).localeCompare(nomeDaReferencia(b), 'pt-BR'));

  function decidir(r: LinhaReferencia, aprovar: boolean) {
    iniciar(async () => {
      try {
        const res = await decidirSugestaoDaBase(r.id, aprovar);
        if (!res.ok) return toast({ texto: res.erro, tom: 'erro' });
        toast({ texto: aprovar ? `${nomeDaReferencia(r)} entrou na base.` : `${nomeDaReferencia(r)} saiu da base.` });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <LinhaDeFiltros rotulo="Filtrar a base">
        {GRUPOS.map((g) => (
          <Filtro key={g.id} ativo={grupo === g.id} aoClicar={() => setGrupo(g.id)} n={contagem[g.id]}>
            {g.nome}
          </Filtro>
        ))}
      </LinhaDeFiltros>
      <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
          <input className={`${classeEntrada} pl-10`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, linha ou tecnologia" aria-label="Buscar na base" />
        </div>
        <select className={classeEntrada} value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria | '')} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      {visiveis.length ? (
        <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {visiveis.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1 basis-72">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{nomeDaReferencia(r)}</p>
                  <Chip tom={r.confianca === 'fabricante' ? 'ok' : r.confianca === 'oficina' || r.confianca === 'fornecedor' ? 'oleo' : 'neutro'}>{NOMES_CONFIANCA[r.confianca]}</Chip>
                </div>
                <p className="text-[14px] text-tinta-2">
                  {nomeCategoria(r.categoria)}, {r.segue_manual ? 'segue o manual' : textoDoPrazo(r.intervalo_km, r.intervalo_meses)}
                  {r.intervalo_km_severo || r.intervalo_meses_severo ? `, severo ${textoDoPrazo(r.intervalo_km_severo, r.intervalo_meses_severo)}` : ''}
                </p>
                {r.observacao ? <p className="mt-1 text-[13.5px] text-tinta-3">{r.observacao}</p> : null}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-tinta-3">
                  {r.fonte_url ? (
                    <a href={r.fonte_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-caneta hover:underline">
                      {r.fonte_nome ?? 'Fonte'} <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : r.fonte_nome ? (
                    <span>{r.fonte_nome}</span>
                  ) : null}
                  <span>Incluída {quandoFoi(r.criado_em, agora)}</span>
                </p>
              </div>
              <div className="flex gap-2">
                {!podeDecidir ? null : grupo === 'sugestoes' ? (
                  <>
                    <Botao tamanho="pequeno" variante="escuro" onClick={() => decidir(r, true)} disabled={ocupado}>
                      Aprovar
                    </Botao>
                    <Botao tamanho="pequeno" variante="perigo" onClick={() => decidir(r, false)} disabled={ocupado}>
                      Recusar
                    </Botao>
                  </>
                ) : grupo === 'base' ? (
                  <Botao tamanho="pequeno" onClick={() => decidir(r, false)} disabled={ocupado}>
                    Tirar da base
                  </Botao>
                ) : (
                  <Botao tamanho="pequeno" onClick={() => decidir(r, true)} disabled={ocupado}>
                    Voltar para a base
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo={grupo === 'sugestoes' ? 'Nenhuma sugestão esperando' : 'Nada encontrado'}>
          {grupo === 'sugestoes' ? 'As oficinas sugerem produtos em Ajustes, em Seus produtos. Antes de aprovar, confira a fonte do prazo.' : 'Tente outra busca ou categoria.'}
        </Vazio>
      )}
    </div>
  );
}
