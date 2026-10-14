'use client';

// A conferência: a ordem que a IA preencheu, campo por campo, para o mecânico corrigir e confirmar.

import { Camera, Check, Plus, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconeServico } from '@/components/icones';
import { Placa } from '@/components/pecas';
import { Botao, Campo, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { calcularVencimento, estimarRodagem, pontosDoVeiculo } from '@/lib/agenda';
import { URGENCIAS, type OrdemIA, type Urgencia } from '@/lib/agente/esquema';
import { formatarDataCurta } from '@/lib/datas';
import { formatarKm, formatarPlaca, lerNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { SERVICOS, intervaloSugerido, servico as infoServico } from '@/lib/manutencao';
import { useOficina } from '@/lib/store';
import type { Preferencias, ServicoId, Veiculo } from '@/lib/tipos';
import { CamposCliente, CamposVeiculo, type RascunhoCliente, type RascunhoVeiculo } from '../formularios';
import { BuscaCarro } from './BuscaCarro';
import { BotaoDeFotos } from './fotos';
import type { FotoLocal } from './sessao';

export interface ItemRevisao {
  servico: ServicoId;
  produto: string;
  observacao: string;
  km: string;
  meses: string;
}

export interface Revisao {
  veiculoId: string | null;
  novoCliente: RascunhoCliente;
  novoCarro: RascunhoVeiculo;
  km: string;
  itens: ItemRevisao[];
  diagnostico: string;
  recomendacoes: { texto: string; urgencia: Urgencia }[];
  /** Legenda de cada foto, pelo id da foto. */
  legendas: Record<string, string>;
  mensagem: string;
}

/** O próximo prazo sugerido para o serviço, do jeito que o campo mostra. */
export function prazoSugerido(s: ServicoId, carro: Pick<Veiculo, 'usoSevero' | 'intervaloOleo'> | null, prefs: Preferencias) {
  const sug = intervaloSugerido(s, { veiculo: carro ?? undefined, prefs, produto: null });
  return { km: sug.km != null ? String(sug.km) : '', meses: sug.meses != null ? String(sug.meses) : '' };
}

function prefixo(erros: Record<string, string>, p: string) {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(erros)) if (k.startsWith(p)) r[k.slice(p.length)] = v;
  return r;
}

export function TelaDeRevisao({
  ordem,
  rev,
  aoEditar,
  erros,
  fotos,
  aoIncluirFotos,
  aoTirarFoto,
  relato,
  aviso,
  saida,
  salvando,
  aoConfirmar
}: {
  ordem: OrdemIA;
  rev: Revisao;
  aoEditar: (r: Revisao) => void;
  erros: Record<string, string>;
  fotos: FotoLocal[];
  aoIncluirFotos: (novas: FotoLocal[]) => void;
  aoTirarFoto: (f: FotoLocal) => void;
  relato: ReactNode;
  aviso: ReactNode;
  saida: { rotulo: string; acao: () => void };
  salvando: boolean;
  aoConfirmar: () => void;
}) {
  const hoje = useHoje();
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const atendimentos = useOficina((s) => s.atendimentos);
  const leituras = useOficina((s) => s.leituras);
  const prefs = useOficina((s) => s.preferencias);

  const carroRev = rev.veiculoId ? veiculos[rev.veiculoId] : null;
  const kmNum = lerNumero(rev.km);
  const rodagem = carroRev
    ? estimarRodagem([...pontosDoVeiculo(carroRev.id, Object.values(atendimentos), Object.values(leituras)), ...(kmNum ? [{ data: hoje, km: kmNum }] : [])], carroRev, prefs.kmMesPadrao, hoje)
    : { kmDia: prefs.kmMesPadrao / 30 };
  const mudar = (m: Partial<Revisao>) => aoEditar({ ...rev, ...m });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 text-[14px] font-semibold text-caneta">
          <Sparkles size={16} aria-hidden="true" /> Preenchida pela IA com o que você falou
        </p>
        <h1 className="largo mt-1 text-[28px] sm:text-[32px]">Confira a ordem de serviço</h1>
        <p className="mt-1 text-tinta-2">Corrija o que precisar. Nada é registrado antes de você confirmar.</p>
      </header>

      {aviso}

      {ordem.duvidas.length ? (
        <div className="rounded-xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert size={16} aria-hidden="true" /> Confira
          </p>
          <ul className="mt-1 list-disc pl-5">
            {ordem.duvidas.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {relato}

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Carro</h2>
        {carroRev ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel-2 px-4 py-3">
            <Placa placa={carroRev.placa} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{clientes[carroRev.clienteId]?.nome}</p>
              <p className="truncate text-[14px] text-tinta-2">{[carroRev.marca, carroRev.modelo, carroRev.motor, carroRev.ano].filter(Boolean).join(' ')}</p>
            </div>
            <Botao tamanho="pequeno" onClick={() => mudar({ veiculoId: null })}>
              Trocar
            </Botao>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <BuscaCarro aoEscolher={(id) => mudar({ veiculoId: id })} />
            <p className="text-[14px] text-tinta-3">Ou cadastre o carro {ordem.placa ? `da placa ${formatarPlaca(ordem.placa)}` : 'novo'}:</p>
            <CamposCliente valor={rev.novoCliente} aoMudar={(c) => mudar({ novoCliente: c })} erros={prefixo(erros, 'cliente.')} />
            <CamposVeiculo valor={rev.novoCarro} aoMudar={(c) => mudar({ novoCarro: c })} erros={prefixo(erros, 'carro.')} />
          </div>
        )}
        <Campo rotulo="Quilometragem do painel" htmlFor="o-km" erro={erros.km} className="sm:max-w-xs">
          <input id="o-km" className={`${classeEntrada} largo num font-bold`} value={rev.km} onChange={(e) => mudar({ km: e.target.value })} inputMode="numeric" placeholder="45.000" />
        </Campo>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Serviços feitos</h2>
        {rev.itens.length ? (
          <ul className="flex flex-col gap-3">
            {rev.itens.map((it, i) => {
              const k = lerNumero(it.km);
              const m = lerNumero(it.meses);
              const venc = kmNum && (k || m) ? calcularVencimento({ data: hoje, km: kmNum }, { km: k || null, meses: m || null }, [], rodagem.kmDia, hoje) : null;
              const mudarItem = (mud: Partial<ItemRevisao>) => mudar({ itens: rev.itens.map((x, j) => (j === i ? { ...x, ...mud } : x)) });
              return (
                <li key={it.servico} className="rounded-xl border border-linha bg-papel">
                  <div className="flex items-center gap-3 border-b border-linha px-4 py-3">
                    <IconeServico servico={it.servico} className="text-tinta-2" />
                    <p className="flex-1 font-bold">{infoServico(it.servico).nome}</p>
                    {venc?.dataPrevista ? (
                      <p className="num text-right text-[13px] text-tinta-2">
                        Próxima <strong className="text-tinta">{formatarDataCurta(venc.dataPrevista)}</strong>
                        {venc.kmLimite ? (
                          <>
                            {' '}
                            ou <strong className="text-tinta">{formatarKm(venc.kmLimite)}</strong>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-full text-tinta-3 hover:bg-papel-2 hover:text-atraso"
                      onClick={() => mudar({ itens: rev.itens.filter((_, j) => j !== i) })}
                      aria-label={`Tirar ${infoServico(it.servico).nome}`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                    <Campo rotulo="Produto" htmlFor={`o-p-${i}`} className="col-span-2">
                      <input id={`o-p-${i}`} className={classeEntrada} value={it.produto} onChange={(e) => mudarItem({ produto: e.target.value })} placeholder="Marca e especificação" />
                    </Campo>
                    <Campo rotulo="Próxima em (km)" htmlFor={`o-k-${i}`}>
                      <input id={`o-k-${i}`} className={classeEntrada} value={it.km} onChange={(e) => mudarItem({ km: e.target.value })} inputMode="numeric" placeholder="sem km" />
                    </Campo>
                    <Campo rotulo="ou (meses)" htmlFor={`o-m-${i}`}>
                      <input id={`o-m-${i}`} className={classeEntrada} value={it.meses} onChange={(e) => mudarItem({ meses: e.target.value })} inputMode="numeric" placeholder="sem prazo" />
                    </Campo>
                    {it.observacao ? <p className="col-span-2 text-[13.5px] text-tinta-2 sm:col-span-4">{it.observacao}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14.5px] text-tinta-2">A IA não achou nenhum serviço feito no que você falou. Se foi só uma avaliação, a ordem fica guardada no carro com o diagnóstico.</p>
        )}
        <label className="flex items-center gap-2 self-start text-[14.5px] font-semibold text-caneta">
          <Plus size={16} aria-hidden="true" />
          <select
            className="bg-transparent outline-none"
            value=""
            onChange={(e) => {
              const s = e.target.value as ServicoId;
              if (s && !rev.itens.some((x) => x.servico === s)) mudar({ itens: [...rev.itens, { servico: s, produto: '', observacao: '', ...prazoSugerido(s, carroRev, prefs) }] });
            }}
            aria-label="Incluir serviço"
          >
            <option value="">Incluir serviço</option>
            {SERVICOS.filter((s) => !rev.itens.some((x) => x.servico === s.id)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Diagnóstico e recomendações</h2>
        <Campo rotulo="Diagnóstico" htmlFor="o-diag">
          <textarea id="o-diag" rows={4} className={classeArea} value={rev.diagnostico} onChange={(e) => mudar({ diagnostico: e.target.value })} />
        </Campo>
        {rev.recomendacoes.map((r, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-linha bg-papel p-3 sm:flex-row sm:items-start">
            <textarea
              rows={2}
              className={`${classeArea} flex-1`}
              value={r.texto}
              onChange={(e) => mudar({ recomendacoes: rev.recomendacoes.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
              aria-label={`Recomendação ${i + 1}`}
            />
            <select
              className={`${classeEntrada} sm:w-48`}
              value={r.urgencia}
              onChange={(e) => mudar({ recomendacoes: rev.recomendacoes.map((x, j) => (j === i ? { ...x, urgencia: e.target.value as Urgencia } : x)) })}
              aria-label={`Urgência da recomendação ${i + 1}`}
            >
              {URGENCIAS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button type="button" className="self-start text-[14.5px] font-semibold text-caneta hover:underline" onClick={() => mudar({ recomendacoes: [...rev.recomendacoes, { texto: '', urgencia: 'proxima_revisao' }] })}>
          Incluir recomendação
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Fotos</h2>
        {fotos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fotos.map((f, i) => (
              <li key={f.id} className="flex flex-col gap-2">
                <div className="relative">
                  <img src={f.url} alt={rev.legendas[f.id] || `Foto ${i + 1}`} className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-linha" />
                  <button
                    type="button"
                    onClick={() => aoTirarFoto(f)}
                    className="absolute top-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full bg-tinta/80 text-papel hover:bg-tinta"
                    aria-label={`Tirar a foto ${i + 1}`}
                  >
                    <X size={16} />
                  </button>
                </div>
                <input
                  className={`${classeEntrada} h-10 text-[14px]`}
                  value={rev.legendas[f.id] ?? ''}
                  onChange={(e) => mudar({ legendas: { ...rev.legendas, [f.id]: e.target.value } })}
                  placeholder="O que aparece na foto"
                  aria-label={`Legenda da foto ${i + 1}`}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <BotaoDeFotos quantas={fotos.length} aoIncluir={aoIncluirFotos} className={classeBotao('secundario', 'pequeno')}>
            <Camera size={16} aria-hidden="true" /> {fotos.length ? 'Mais fotos' : 'Incluir fotos'}
          </BotaoDeFotos>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Mensagem para o cliente</h2>
        <textarea rows={8} className={classeArea} value={rev.mensagem} onChange={(e) => mudar({ mensagem: e.target.value })} aria-label="Mensagem para o cliente" />
        <p className="text-[13px] text-tinta-3">Escrita pela IA a partir do que você falou. Depois de confirmar, é só mandar.</p>
      </section>

      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-linha bg-fundo/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 lg:bottom-4">
        <div className="flex items-center justify-between gap-3">
          <Botao variante="fantasma" onClick={saida.acao} disabled={salvando}>
            {saida.rotulo}
          </Botao>
          <Botao variante="primario" tamanho="grande" onClick={aoConfirmar} disabled={salvando}>
            <Check size={18} /> {salvando ? 'Salvando…' : 'Confirmar ordem'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
