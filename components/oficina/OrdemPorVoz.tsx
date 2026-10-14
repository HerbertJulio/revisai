'use client';

import { Camera, Check, ImagePlus, Mic, MessageCircle, Plus, Search, Share2, Sparkles, Square, Trash2, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { encerrarRascunhoDoWhatsApp, montarOrdemComIA, rascunhosDoWhatsApp } from '@/app/oficina/acoes-agente';
import type { RascunhoParaApp } from '@/lib/agente/rascunhos';
import { IconeServico } from '@/components/icones';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { estimarRodagem, pontosDoVeiculo, calcularVencimento } from '@/lib/agenda';
import { URGENCIAS, type OrdemIA, type Urgencia } from '@/lib/agente/esquema';
import type { MidiaDaOrdem } from '@/lib/agente/ordem';
import { formatarData, formatarDataCurta } from '@/lib/datas';
import { formatarKm, formatarPlaca, lerNumero, normalizarPlaca } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { reduzirFoto } from '@/lib/imagem-cliente';
import { SERVICOS, intervaloSugerido, servico as infoServico } from '@/lib/manutencao';
import { guardarMidia } from '@/lib/midia';
import { useOficina } from '@/lib/store';
import type { ServicoId, Veiculo } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { PRO } from '@/lib/plano';
import { BotaoAvaliacao, useOfertaDoPro, usePlano } from './plano';
import {
  CLIENTE_VAZIO,
  CamposCliente,
  CamposVeiculo,
  VEICULO_VAZIO,
  clienteDoRascunho,
  errosCliente,
  errosVeiculo,
  veiculoDoRascunho,
  type RascunhoCliente,
  type RascunhoVeiculo
} from './formularios';

const MAX_SEGUNDOS = 120;
const MAX_AUDIOS = 4;
const MAX_FOTOS = 6;

interface Clipe {
  id: string;
  blob: Blob;
  url: string;
  segundos: number;
}

interface FotoLocal {
  id: string;
  arquivo: File;
  url: string;
}

interface ItemRevisao {
  servico: ServicoId;
  produto: string;
  observacao: string;
  km: string;
  meses: string;
}

interface Revisao {
  veiculoId: string | null;
  novoCliente: RascunhoCliente;
  novoCarro: RascunhoVeiculo;
  km: string;
  itens: ItemRevisao[];
  diagnostico: string;
  recomendacoes: { texto: string; urgencia: Urgencia }[];
  legendas: string[];
  mensagem: string;
}

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function mimeDeGravacao(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
}

function extensao(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function OrdemPorVoz() {
  const params = useSearchParams();
  const router = useRouter();
  const hoje = useHoje();
  const toast = useToast();
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const atendimentos = useOficina((s) => s.atendimentos);
  const leituras = useOficina((s) => s.leituras);
  const oficina = useOficina((s) => s.oficina);
  const prefs = useOficina((s) => s.preferencias);
  const salvarCliente = useOficina((s) => s.salvarCliente);
  const salvarVeiculo = useOficina((s) => s.salvarVeiculo);
  const registrarAtendimento = useOficina((s) => s.registrarAtendimento);
  const salvarOrdem = useOficina((s) => s.salvarOrdem);
  const aparelhoId = useOficina((s) => s.aparelhoId);
  const contarMontagem = useOficina((s) => s.contarMontagem);
  const plano = usePlano();
  const abrirPro = useOfertaDoPro();

  const inicial = params.get('carro');
  const [veiculoId, setVeiculoId] = useState<string | null>(inicial && veiculos[inicial] ? inicial : null);
  const [busca, setBusca] = useState('');
  const [clipes, setClipes] = useState<Clipe[]>([]);
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [anotacao, setAnotacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [montando, iniciar] = useTransition();
  const [ia, setIa] = useState<{ ordem: OrdemIA; modelo: string } | null>(null);
  const [rev, setRev] = useState<Revisao | null>(null);
  const [errosRev, setErrosRev] = useState<Record<string, string>>({});
  const [feito, setFeito] = useState<{ veiculoId: string; mensagem: string; atendimentoId: string | null } | null>(null);
  const [doWhatsApp, setDoWhatsApp] = useState<string | null>(null);

  const veiculo: Veiculo | null = veiculoId ? veiculos[veiculoId] ?? null : null;
  const cliente = veiculo ? clientes[veiculo.clienteId] : undefined;

  useEffect(
    () => () => {
      for (const c of clipes) URL.revokeObjectURL(c.url);
      for (const f of fotos) URL.revokeObjectURL(f.url);
    },
    // só ao sair da tela
    []
  );

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (t.length < 2) return [];
    const placa = normalizarPlaca(t);
    return Object.values(veiculos)
      .filter((v) => (placa.length >= 2 && v.placa.includes(placa)) || (clientes[v.clienteId]?.nome.toLowerCase().includes(t) ?? false) || v.modelo.toLowerCase().includes(t))
      .slice(0, 5);
  }, [busca, veiculos, clientes]);

  function ultimoKm(id: string): number | null {
    const pontos = pontosDoVeiculo(id, Object.values(atendimentos), Object.values(leituras));
    return pontos.length ? pontos[pontos.length - 1].km : null;
  }

  function prazo(s: ServicoId, carro: Pick<Veiculo, 'usoSevero' | 'intervaloOleo'> | null) {
    const sug = intervaloSugerido(s, { veiculo: carro ?? undefined, prefs, produto: null });
    return { km: sug.km != null ? String(sug.km) : '', meses: sug.meses != null ? String(sug.meses) : '' };
  }

  function montar() {
    setErro(null);
    if (!clipes.length && !fotos.length && !anotacao.trim()) return setErro('Grave um áudio, tire uma foto ou escreva o que foi feito.');
    if (!plano.podeDitar) {
      if (plano.liberado) return setErro(`Este aparelho chegou a ${PRO.ordensPro} ordens por voz neste mês. Fale com a equipe do Revisaí para liberar mais.`);
      return abrirPro('ordens');
    }
    const dados = new FormData();
    dados.set(
      'contexto',
      JSON.stringify({
        oficina: oficina.nome,
        hoje,
        carro: veiculo ? `${formatarPlaca(veiculo.placa)}, ${[veiculo.marca, veiculo.modelo, veiculo.motor, veiculo.ano].filter(Boolean).join(' ')}` : null,
        cliente: cliente?.nome ?? null,
        kmAnterior: veiculo ? ultimoKm(veiculo.id) : null,
        anotacao: anotacao.trim() || null
      })
    );
    clipes.forEach((c, i) => dados.append('audio', new File([c.blob], `audio-${i + 1}.${extensao(c.blob.type)}`, { type: c.blob.type || 'audio/webm' })));
    fotos.forEach((f) => dados.append('foto', f.arquivo));
    iniciar(async () => {
      let r: Awaited<ReturnType<typeof montarOrdemComIA>>;
      try {
        r = await montarOrdemComIA(dados);
      } catch {
        setErro('Não deu para falar com o servidor. Confira a internet e tente de novo.');
        return;
      }
      if (!r.ok) return setErro(r.erro);
      contarMontagem(hoje);
      abrirRevisao(r.ordem, r.modelo);
    });
  }

  function abrirDoWhatsApp(r: RascunhoParaApp, fotosDele: FotoLocal[], clipesDele: Clipe[]) {
    setFotos(fotosDele);
    setClipes(clipesDele);
    setDoWhatsApp(r.id);
    abrirRevisao(r.ordem, r.modelo ?? 'IA', fotosDele);
  }

  function abrirRevisao(o: OrdemIA, modelo: string, fotosDaOrdem: FotoLocal[] = fotos) {
    // o carro: o escolhido, ou o da placa que a IA ouviu
    const daPlaca = !veiculo && o.placa ? Object.values(veiculos).find((v) => v.placa === o.placa) : undefined;
    const alvo = veiculo ?? daPlaca ?? null;
    setIa({ ordem: o, modelo });
    setRev({
      veiculoId: alvo?.id ?? null,
      novoCliente: { ...CLIENTE_VAZIO, nome: o.cliente ?? '' },
      novoCarro: {
        ...VEICULO_VAZIO,
        placa: o.placa ?? '',
        marca: o.veiculo?.marca ?? '',
        modelo: o.veiculo?.modelo ?? '',
        motor: o.veiculo?.motor ?? '',
        ano: o.veiculo?.ano ? String(o.veiculo.ano) : ''
      },
      km: o.km ? String(o.km) : '',
      itens: o.servicos.map((s) => ({ servico: s.servico, produto: s.produto ?? '', observacao: s.observacao ?? '', ...prazo(s.servico, alvo) })),
      diagnostico: o.diagnostico,
      recomendacoes: o.recomendacoes,
      legendas: fotosDaOrdem.map((_, i) => o.fotos.find((f) => f.indice === i + 1)?.legenda ?? ''),
      mensagem: o.mensagemCliente
    });
    window.scrollTo({ top: 0 });
  }

  async function confirmar() {
    if (!rev || !ia) return;
    const e: Record<string, string> = {};
    const km = lerNumero(rev.km);
    if (!rev.veiculoId) {
      for (const [k, v] of Object.entries(errosCliente(rev.novoCliente))) e[`cliente.${k}`] = v!;
      for (const [k, v] of Object.entries(errosVeiculo(rev.novoCarro))) e[`carro.${k}`] = v!;
      const repetido = Object.values(veiculos).find((v) => v.placa === normalizarPlaca(rev.novoCarro.placa));
      if (repetido) e['carro.placa'] = `A placa ${formatarPlaca(repetido.placa)} já está cadastrada. Escolha o carro na busca.`;
    }
    if (rev.itens.length && (!km || km <= 0)) e.km = 'Anote a quilometragem do painel para calcular o próximo aviso.';
    setErrosRev(e);
    if (Object.keys(e).length) {
      toast({ texto: 'Falta conferir alguns campos.', tom: 'erro' });
      requestAnimationFrame(() => document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    let alvo = rev.veiculoId;
    if (!alvo) {
      const clienteId = salvarCliente(clienteDoRascunho(rev.novoCliente));
      alvo = salvarVeiculo(veiculoDoRascunho(rev.novoCarro, clienteId));
    }
    let atendimentoId: string | null = null;
    if (rev.itens.length) {
      atendimentoId = registrarAtendimento({
        veiculoId: alvo,
        data: hoje,
        km: km!,
        itens: rev.itens.map((i) => ({
          servico: i.servico,
          produto: i.produto.trim() ? { nome: i.produto.trim().slice(0, 120) } : null,
          intervaloKm: lerNumero(i.km) || null,
          intervaloMeses: lerNumero(i.meses) || null,
          ...(i.observacao.trim() ? { observacao: i.observacao.trim() } : {})
        })),
        observacao: rev.diagnostico.trim().slice(0, 1000) || undefined
      });
    }
    const midias: MidiaDaOrdem[] = [];
    for (const c of clipes) if (await guardarMidia(c.id, c.blob)) midias.push({ id: c.id, tipo: 'audio', mime: c.blob.type });
    for (const [i, f] of fotos.entries()) if (await guardarMidia(f.id, f.arquivo)) midias.push({ id: f.id, tipo: 'foto', mime: f.arquivo.type, legenda: rev.legendas[i] || undefined });
    salvarOrdem({
      origem: doWhatsApp ? 'whatsapp' : 'app',
      veiculoId: alvo,
      atendimentoId,
      ia: {
        ...ia.ordem,
        km: km ?? ia.ordem.km,
        servicos: rev.itens.map((i) => ({ servico: i.servico, produto: i.produto || null, observacao: i.observacao || null })),
        diagnostico: rev.diagnostico,
        recomendacoes: rev.recomendacoes.filter((r) => r.texto.trim()),
        fotos: rev.legendas.map((legenda, i) => ({ indice: i + 1, legenda })),
        mensagemCliente: rev.mensagem
      },
      midias,
      modelo: ia.modelo
    });
    if (doWhatsApp && aparelhoId) void encerrarRascunhoDoWhatsApp(aparelhoId, doWhatsApp, 'confirmada').catch(() => {});
    setFeito({ veiculoId: alvo, mensagem: rev.mensagem, atendimentoId });
    window.scrollTo({ top: 0 });
  }

  if (feito) return <Pronto {...feito} fotos={fotos} aoNova={() => router.replace('/oficina/ordem')} />;

  if (rev && ia) {
    const carroRev = rev.veiculoId ? veiculos[rev.veiculoId] : null;
    const kmNum = lerNumero(rev.km);
    const rodagem = carroRev ? estimarRodagem([...pontosDoVeiculo(carroRev.id, Object.values(atendimentos), Object.values(leituras)), ...(kmNum ? [{ data: hoje, km: kmNum }] : [])], carroRev, prefs.kmMesPadrao, hoje) : { kmDia: prefs.kmMesPadrao / 30 };
    return (
      <div className="flex flex-col gap-8">
        <header>
          <p className="flex items-center gap-2 text-[14px] font-semibold text-caneta">
            <Sparkles size={16} aria-hidden="true" /> Rascunho montado pela IA
          </p>
          <h1 className="largo mt-1 text-[28px] sm:text-[32px]">Confira a ordem de serviço</h1>
          <p className="mt-1 text-tinta-2">Corrija o que precisar. Nada é registrado antes de você confirmar.</p>
        </header>

        {ia.ordem.duvidas.length ? (
          <div className="rounded-xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta">
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert size={16} aria-hidden="true" /> Confira
            </p>
            <ul className="mt-1 list-disc pl-5">
              {ia.ordem.duvidas.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-[19px]">Carro</h2>
          {carroRev ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel-2 px-4 py-3">
              <Placa placa={carroRev.placa} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{clientes[carroRev.clienteId]?.nome}</p>
                <p className="truncate text-[14px] text-tinta-2">{[carroRev.marca, carroRev.modelo, carroRev.motor, carroRev.ano].filter(Boolean).join(' ')}</p>
              </div>
              <Botao tamanho="pequeno" onClick={() => setRev({ ...rev, veiculoId: null })}>
                Trocar
              </Botao>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <BuscaCarro aoEscolher={(id) => setRev({ ...rev, veiculoId: id })} />
              <p className="text-[14px] text-tinta-3">Ou cadastre o carro {ia.ordem.placa ? `da placa ${formatarPlaca(ia.ordem.placa)}` : 'novo'}:</p>
              <CamposCliente valor={rev.novoCliente} aoMudar={(c) => setRev({ ...rev, novoCliente: c })} erros={prefixo(errosRev, 'cliente.')} />
              <CamposVeiculo valor={rev.novoCarro} aoMudar={(c) => setRev({ ...rev, novoCarro: c })} erros={prefixo(errosRev, 'carro.')} />
            </div>
          )}
          <Campo rotulo="Quilometragem do painel" htmlFor="o-km" erro={errosRev.km} className="sm:max-w-xs">
            <input id="o-km" className={`${classeEntrada} largo num font-bold`} value={rev.km} onChange={(e) => setRev({ ...rev, km: e.target.value })} inputMode="numeric" placeholder="45.000" />
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
                const mudar = (mud: Partial<ItemRevisao>) => setRev({ ...rev, itens: rev.itens.map((x, j) => (j === i ? { ...x, ...mud } : x)) });
                return (
                  <li key={it.servico} className="rounded-xl border border-linha bg-papel">
                    <div className="flex items-center gap-3 border-b border-linha px-4 py-3">
                      <IconeServico servico={it.servico} className="text-tinta-2" />
                      <p className="flex-1 font-bold">{infoServico(it.servico).nome}</p>
                      {venc?.dataPrevista ? (
                        <p className="num text-right text-[13px] text-tinta-2">
                          Próxima <strong className="text-tinta">{formatarDataCurta(venc.dataPrevista)}</strong>
                          {venc.kmLimite ? <> ou <strong className="text-tinta">{formatarKm(venc.kmLimite)}</strong></> : null}
                        </p>
                      ) : null}
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-tinta-3 hover:bg-papel-2 hover:text-atraso" onClick={() => setRev({ ...rev, itens: rev.itens.filter((_, j) => j !== i) })} aria-label={`Tirar ${infoServico(it.servico).nome}`}>
                        <X size={18} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                      <Campo rotulo="Produto" htmlFor={`o-p-${i}`} className="col-span-2">
                        <input id={`o-p-${i}`} className={classeEntrada} value={it.produto} onChange={(e) => mudar({ produto: e.target.value })} placeholder="Marca e especificação" />
                      </Campo>
                      <Campo rotulo="Próxima em (km)" htmlFor={`o-k-${i}`}>
                        <input id={`o-k-${i}`} className={classeEntrada} value={it.km} onChange={(e) => mudar({ km: e.target.value })} inputMode="numeric" placeholder="sem km" />
                      </Campo>
                      <Campo rotulo="ou (meses)" htmlFor={`o-m-${i}`}>
                        <input id={`o-m-${i}`} className={classeEntrada} value={it.meses} onChange={(e) => mudar({ meses: e.target.value })} inputMode="numeric" placeholder="sem prazo" />
                      </Campo>
                      {it.observacao ? <p className="col-span-2 text-[13.5px] text-tinta-2 sm:col-span-4">{it.observacao}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[14.5px] text-tinta-2">A IA não ouviu nenhum serviço feito. Se foi só uma avaliação, a ordem fica guardada no carro com o diagnóstico.</p>
          )}
          <label className="flex items-center gap-2 self-start text-[14.5px] font-semibold text-caneta">
            <Plus size={16} aria-hidden="true" />
            <select
              className="bg-transparent outline-none"
              value=""
              onChange={(e) => {
                const s = e.target.value as ServicoId;
                if (s && !rev.itens.some((x) => x.servico === s)) setRev({ ...rev, itens: [...rev.itens, { servico: s, produto: '', observacao: '', ...prazo(s, carroRev) }] });
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
            <textarea id="o-diag" rows={4} className={classeArea} value={rev.diagnostico} onChange={(e) => setRev({ ...rev, diagnostico: e.target.value })} />
          </Campo>
          {rev.recomendacoes.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-linha bg-papel p-3 sm:flex-row sm:items-start">
              <textarea
                rows={2}
                className={`${classeArea} flex-1`}
                value={r.texto}
                onChange={(e) => setRev({ ...rev, recomendacoes: rev.recomendacoes.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
                aria-label={`Recomendação ${i + 1}`}
              />
              <select
                className={`${classeEntrada} sm:w-48`}
                value={r.urgencia}
                onChange={(e) => setRev({ ...rev, recomendacoes: rev.recomendacoes.map((x, j) => (j === i ? { ...x, urgencia: e.target.value as Urgencia } : x)) })}
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
          <button type="button" className="self-start text-[14.5px] font-semibold text-caneta hover:underline" onClick={() => setRev({ ...rev, recomendacoes: [...rev.recomendacoes, { texto: '', urgencia: 'proxima_revisao' }] })}>
            Incluir recomendação
          </button>
        </section>

        {fotos.length ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-[19px]">Fotos</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {fotos.map((f, i) => (
                <li key={f.id} className="flex flex-col gap-2">
                  <img src={f.url} alt={rev.legendas[i] || `Foto ${i + 1}`} className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-linha" />
                  <input
                    className={`${classeEntrada} h-10 text-[14px]`}
                    value={rev.legendas[i] ?? ''}
                    onChange={(e) => setRev({ ...rev, legendas: rev.legendas.map((x, j) => (j === i ? e.target.value : x)) })}
                    aria-label={`Legenda da foto ${i + 1}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-[19px]">Mensagem para o cliente</h2>
          <textarea rows={8} className={classeArea} value={rev.mensagem} onChange={(e) => setRev({ ...rev, mensagem: e.target.value })} aria-label="Mensagem para o cliente" />
          <p className="text-[13px] text-tinta-3">Escrita pela IA a partir do que você falou. Depois de confirmar, é só mandar.</p>
        </section>

        {ia.ordem.transcricao ? (
          <details className="rounded-xl bg-papel-2 px-4 py-3 text-[14px] text-tinta-2">
            <summary className="cursor-pointer font-semibold text-tinta">O que a IA entendeu dos áudios</summary>
            <p className="mt-2 whitespace-pre-line">{ia.ordem.transcricao}</p>
          </details>
        ) : null}

        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-linha bg-fundo/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 lg:bottom-4">
          <div className="flex items-center justify-between gap-3">
            <Botao variante="fantasma" onClick={() => setRev(null)}>
              Voltar
            </Botao>
            <Botao variante="primario" tamanho="grande" onClick={() => void confirmar()}>
              <Check size={18} /> Confirmar ordem
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="largo text-[28px] sm:text-[32px]">Ordem por voz</h1>
        <p className="mt-1 max-w-[62ch] text-tinta-2">
          Fale o que fez no carro, tire fotos do que encontrou e a IA monta a ordem de serviço e a mensagem para o cliente. Você confere antes de registrar.
        </p>
      </header>

      {aparelhoId ? <CaixaWhatsApp aparelhoId={aparelhoId} aoAbrir={abrirDoWhatsApp} /> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Carro</h2>
        {veiculo ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel-2 px-4 py-3">
            <Placa placa={veiculo.placa} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{cliente?.nome}</p>
              <p className="truncate text-[14px] text-tinta-2">{[veiculo.marca, veiculo.modelo, veiculo.motor, veiculo.ano].filter(Boolean).join(' ')}</p>
            </div>
            <Botao tamanho="pequeno" onClick={() => setVeiculoId(null)}>
              Trocar
            </Botao>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
              <input className={`${classeEntrada} pl-10`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Placa, nome ou modelo" aria-label="Buscar carro" autoComplete="off" />
            </div>
            {resultados.length ? (
              <ul className="divide-y divide-linha overflow-hidden rounded-xl border border-linha bg-papel">
                {resultados.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => setVeiculoId(v.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-papel-2">
                      <Placa placa={v.placa} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{clientes[v.clienteId]?.nome}</span>
                        <span className="block truncate text-[14px] text-tinta-2">{[v.marca, v.modelo, v.ano].filter(Boolean).join(' ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[13.5px] text-tinta-3">Se não escolher, fale a placa no áudio que a IA procura.</p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Áudios</h2>
        <Gravador clipes={clipes} aoMudar={setClipes} desabilitado={montando} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[19px]">Fotos</h2>
        <Fotos fotos={fotos} aoMudar={setFotos} desabilitado={montando} />
      </section>

      <Campo rotulo="Anotação" htmlFor="o-anot" dica="Opcional. Ex.: placa, quilometragem ou o que não deu para falar.">
        <textarea id="o-anot" rows={2} className={classeArea} value={anotacao} onChange={(e) => setAnotacao(e.target.value)} maxLength={1500} />
      </Campo>

      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-linha bg-fundo/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 lg:bottom-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] text-tinta-2">{montando ? 'A IA está ouvindo e olhando as fotos…' : `${clipes.length} ${clipes.length === 1 ? 'áudio' : 'áudios'}, ${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`}</p>
            {!plano.liberado && !montando ? (
              <p className="num text-[12.5px] text-tinta-3">
                {Math.min(plano.montagens, PRO.ordensGratis)} de {PRO.ordensGratis} ordens grátis usadas neste mês
              </p>
            ) : null}
          </div>
          <Botao variante="primario" tamanho="grande" onClick={montar} disabled={montando}>
            <Sparkles size={18} /> {montando ? 'Montando…' : 'Montar a ordem'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

/** Ordens que o mecânico mandou pelo WhatsApp e a IA já montou, esperando conferência. */
function CaixaWhatsApp({ aparelhoId, aoAbrir }: { aparelhoId: string; aoAbrir: (r: RascunhoParaApp, fotos: FotoLocal[], clipes: Clipe[]) => void }) {
  const toast = useToast();
  const [lista, setLista] = useState<RascunhoParaApp[]>([]);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    rascunhosDoWhatsApp(aparelhoId)
      .then((l) => vivo && setLista(l))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [aparelhoId]);

  async function abrir(r: RascunhoParaApp) {
    setAbrindo(r.id);
    const fotos: FotoLocal[] = [];
    const clipes: Clipe[] = [];
    try {
      for (const [indice, m] of r.midias.entries()) {
        const resp = await fetch('/api/agente/midia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aparelhoId, rascunhoId: r.id, indice }) });
        if (!resp.ok) continue;
        const blob = await resp.blob();
        const id = novoId();
        if (m.tipo === 'foto') {
          const arquivo = new File([blob], `foto-${indice + 1}`, { type: m.mime });
          fotos.push({ id, arquivo, url: URL.createObjectURL(arquivo) });
        } else clipes.push({ id, blob, url: URL.createObjectURL(blob), segundos: 0 });
      }
      aoAbrir(r, fotos, clipes);
    } catch {
      toast({ texto: 'Não deu para baixar os áudios e fotos. Confira a internet.', tom: 'erro' });
    } finally {
      setAbrindo(null);
    }
  }

  async function descartar(r: RascunhoParaApp) {
    if (!window.confirm('Jogar fora esta ordem do WhatsApp?')) return;
    const ok = await encerrarRascunhoDoWhatsApp(aparelhoId, r.id, 'descartada').catch(() => false);
    if (ok) setLista((l) => l.filter((x) => x.id !== r.id));
    else toast({ texto: 'Não deu para descartar agora.', tom: 'erro' });
  }

  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[19px]">Chegaram pelo WhatsApp</h2>
      <ul className="flex flex-col gap-2">
        {lista.map((r) => {
          const fotos = r.midias.filter((m) => m.tipo === 'foto').length;
          const audios = r.midias.length - fotos;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok-claro text-ok">
                <MessageCircle size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.ordem.placa ? formatarPlaca(r.ordem.placa) : 'Carro a escolher'}
                  {r.ordem.servicos.length ? `, ${r.ordem.servicos.map((s) => infoServico(s.servico).nome.toLowerCase()).join(', ')}` : ''}
                </p>
                <p className="text-[13.5px] text-tinta-3">
                  {formatarData(r.criadoEm.slice(0, 10))}, {audios} {audios === 1 ? 'áudio' : 'áudios'} e {fotos} {fotos === 1 ? 'foto' : 'fotos'}
                </p>
              </div>
              <Botao tamanho="pequeno" variante="escuro" onClick={() => void abrir(r)} disabled={abrindo != null}>
                {abrindo === r.id ? 'Abrindo…' : 'Conferir'}
              </Botao>
              <Botao tamanho="pequeno" variante="fantasma" onClick={() => void descartar(r)} aria-label="Descartar">
                <Trash2 size={16} />
              </Botao>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function prefixo(erros: Record<string, string>, p: string) {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(erros)) if (k.startsWith(p)) r[k.slice(p.length)] = v;
  return r;
}

function BuscaCarro({ aoEscolher }: { aoEscolher: (id: string) => void }) {
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const [busca, setBusca] = useState('');
  const t = busca.trim().toLowerCase();
  const placa = normalizarPlaca(t);
  const lista =
    t.length < 2
      ? []
      : Object.values(veiculos)
          .filter((v) => (placa.length >= 2 && v.placa.includes(placa)) || (clientes[v.clienteId]?.nome.toLowerCase().includes(t) ?? false))
          .slice(0, 5);
  return (
    <div className="flex flex-col gap-2">
      <input className={classeEntrada} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar um carro cadastrado" aria-label="Buscar carro cadastrado" autoComplete="off" />
      {lista.length ? (
        <ul className="divide-y divide-linha overflow-hidden rounded-xl border border-linha bg-papel">
          {lista.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => aoEscolher(v.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-papel-2">
                <Placa placa={v.placa} />
                <span className="truncate font-semibold">{clientes[v.clienteId]?.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Gravador({ clipes, aoMudar, desabilitado }: { clipes: Clipe[]; aoMudar: (c: Clipe[]) => void; desabilitado: boolean }) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const atuais = useRef(clipes);
  atuais.current = clipes;

  async function comecar() {
    setErro(null);
    if (clipes.length >= MAX_AUDIOS) return setErro(`No máximo ${MAX_AUDIOS} áudios por ordem.`);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setErro('Este navegador não grava áudio. Escreva a anotação ou use outro navegador.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setErro('Libere o microfone para o Revisaí nas permissões do navegador.');
    }
    const mime = mimeDeGravacao();
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
    const partes: Blob[] = [];
    const inicio = Date.now();
    rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (relogio.current) clearInterval(relogio.current);
      setGravando(false);
      const blob = new Blob(partes, { type: rec.mimeType || mime || 'audio/webm' });
      if (blob.size < 1500) return setErro('O áudio ficou vazio. Segure perto da boca e tente de novo.');
      aoMudar([...atuais.current, { id: novoId(), blob, url: URL.createObjectURL(blob), segundos: Math.round((Date.now() - inicio) / 1000) }]);
    };
    rec.start(1000);
    gravador.current = rec;
    setSegundos(0);
    setGravando(true);
    relogio.current = setInterval(() => {
      const s = Math.round((Date.now() - inicio) / 1000);
      setSegundos(s);
      if (s >= MAX_SEGUNDOS) rec.state === 'recording' && rec.stop();
    }, 250);
  }

  function parar() {
    if (gravador.current?.state === 'recording') gravador.current.stop();
  }

  function tirar(c: Clipe) {
    URL.revokeObjectURL(c.url);
    aoMudar(clipes.filter((x) => x.id !== c.id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha">
        {gravando ? (
          <button type="button" onClick={parar} className="grid h-16 w-16 place-items-center rounded-full bg-atraso text-white shadow-etiqueta" aria-label="Parar a gravação">
            <Square size={24} fill="currentColor" />
          </button>
        ) : (
          <button type="button" onClick={() => void comecar()} disabled={desabilitado} className="grid h-16 w-16 place-items-center rounded-full bg-oleo text-[#1b1f22] shadow-etiqueta disabled:opacity-50" aria-label="Gravar áudio">
            <Mic size={26} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {gravando ? (
            <p className="flex items-center gap-2 font-semibold text-atraso" aria-live="polite">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-atraso" aria-hidden="true" /> Gravando{' '}
              <span className="num">
                {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
              </span>
            </p>
          ) : (
            <p className="font-semibold">Toque para gravar</p>
          )}
          <p className="text-[13.5px] text-tinta-3">Fale a placa, a quilometragem, o que trocou (com a marca) e o que encontrou. Até 2 minutos por áudio.</p>
        </div>
      </div>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      {clipes.length ? (
        <ul className="flex flex-col gap-2">
          {clipes.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl bg-papel-2 px-3 py-2">
              <span className="num w-6 text-[14px] font-bold text-tinta-3">{i + 1}</span>
              <audio src={c.url} controls preload="metadata" className="h-10 min-w-0 flex-1" />
              <button type="button" onClick={() => tirar(c)} className="grid h-9 w-9 place-items-center rounded-full text-tinta-3 hover:text-atraso" aria-label={`Apagar áudio ${i + 1}`}>
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Fotos({ fotos, aoMudar, desabilitado }: { fotos: FotoLocal[]; aoMudar: (f: FotoLocal[]) => void; desabilitado: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);

  async function incluir(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    const espaco = MAX_FOTOS - fotos.length;
    if (espaco <= 0) return setErro(`No máximo ${MAX_FOTOS} fotos por ordem.`);
    setPreparando(true);
    const novas: FotoLocal[] = [];
    for (const f of Array.from(lista).slice(0, espaco)) {
      try {
        const reduzida = await reduzirFoto(f, 1280, 0.8);
        novas.push({ id: novoId(), arquivo: reduzida, url: URL.createObjectURL(reduzida) });
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para abrir uma das fotos.');
      }
    }
    setPreparando(false);
    aoMudar([...fotos, ...novas]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <label className={`${classeBotao('secundario')} cursor-pointer ${desabilitado ? 'pointer-events-none opacity-50' : ''}`}>
          <Camera size={18} aria-hidden="true" /> Tirar foto
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void incluir(e.target.files).then(() => (e.target.value = ''))} />
        </label>
        <label className={`${classeBotao('secundario')} cursor-pointer ${desabilitado ? 'pointer-events-none opacity-50' : ''}`}>
          <ImagePlus size={18} aria-hidden="true" /> Da galeria
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void incluir(e.target.files).then(() => (e.target.value = ''))} />
        </label>
        {preparando ? <span className="self-center text-[14px] text-tinta-3">Preparando…</span> : null}
      </div>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      {fotos.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {fotos.map((f, i) => (
            <li key={f.id} className="relative">
              <img src={f.url} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-xl object-cover ring-1 ring-linha" />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(f.url);
                  aoMudar(fotos.filter((x) => x.id !== f.id));
                }}
                className="absolute top-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-tinta/80 text-papel"
                aria-label={`Apagar foto ${i + 1}`}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Pronto({ veiculoId, mensagem, atendimentoId, fotos, aoNova }: { veiculoId: string; mensagem: string; atendimentoId: string | null; fotos: FotoLocal[]; aoNova: () => void }) {
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const toast = useToast();
  const whatsapp = cliente ? linkWhatsApp(cliente.telefone, mensagem) : null;
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);
  useEffect(() => {
    try {
      setPodeCompartilhar(!!fotos.length && !!navigator.canShare?.({ files: fotos.map((f) => f.arquivo) }));
    } catch {
      setPodeCompartilhar(false);
    }
  }, [fotos]);

  async function compartilhar() {
    try {
      await navigator.share({ text: mensagem, files: fotos.map((f, i) => new File([f.arquivo], `foto-${i + 1}.${f.arquivo.type.includes('webp') ? 'webp' : 'jpg'}`, { type: f.arquivo.type })) });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast({ texto: 'Não deu para compartilhar. Use o botão do WhatsApp.', tom: 'erro' });
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      toast({ texto: 'Mensagem copiada.' });
    } catch {
      toast({ texto: 'Não deu para copiar.', tom: 'erro' });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="flex items-center gap-2 font-semibold text-ok">
          <Check size={18} aria-hidden="true" /> Ordem registrada
        </p>
        <h1 className="largo mt-1 text-[28px] sm:text-[32px]">
          {cliente?.nome ?? 'Cliente'}, {veiculo?.modelo}
        </h1>
        <p className="mt-1 text-tinta-2">{atendimentoId ? 'Os serviços entraram no histórico e os próximos avisos já estão calculados.' : 'A ordem ficou guardada no carro.'} Fotos e áudios ficam neste aparelho.</p>
      </div>
      <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
        <p className="mb-2 text-[13px] font-semibold text-tinta-3">Mensagem para o cliente</p>
        <p className="text-[15px] whitespace-pre-line">{mensagem}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {podeCompartilhar ? (
          <Botao variante="whatsapp" tamanho="grande" onClick={() => void compartilhar()}>
            <Share2 size={18} /> Mandar com as fotos
          </Botao>
        ) : null}
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao(podeCompartilhar ? 'secundario' : 'whatsapp', 'grande')}>
            <MessageCircle size={18} aria-hidden="true" /> Mandar no WhatsApp
          </a>
        ) : null}
        <Botao tamanho="grande" onClick={() => void copiar()}>
          Copiar mensagem
        </Botao>
        <BotaoAvaliacao telefone={cliente?.telefone} nomeCliente={cliente?.nome ?? ''} carro={veiculo?.modelo ?? 'carro'} />
        {atendimentoId ? (
          <Link href={`/oficina/etiqueta?atendimento=${atendimentoId}`} className={classeBotao('secundario', 'grande')}>
            Etiqueta do para-brisa
          </Link>
        ) : null}
        <Link href={`/oficina/carro?id=${veiculoId}`} className={classeBotao('fantasma', 'grande')}>
          Ver o carro
        </Link>
        <Botao variante="fantasma" tamanho="grande" onClick={aoNova}>
          Nova ordem
        </Botao>
      </div>
      <p className="text-[13px] text-tinta-3">Registrada em {formatarData(new Date().toISOString().slice(0, 10))}. Para a foto ir junto no WhatsApp, use Mandar com as fotos no celular.</p>
    </div>
  );
}
