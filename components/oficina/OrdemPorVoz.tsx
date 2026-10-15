'use client';

// Ordem por voz: o mecânico toca no microfone e conta o que fez no carro. O áudio fica guardado no
// aparelho, vira texto e a IA preenche a ordem de serviço com esse texto (e com as fotos, se tiver).
// Ele confere os campos e confirma. As ordens que chegaram pelo WhatsApp também abrem aqui.

import { Camera, Car, Keyboard, Mic, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { encerrarRascunhoDoWhatsApp, montarOrdemComIA, transcreverAudio } from '@/app/oficina/acoes-agente';
import { Folha } from '@/components/Folha';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, classeArea, classeBotao } from '@/components/ui';
import { pontosDoVeiculo } from '@/lib/agenda';
import type { OrdemIA } from '@/lib/agente/esquema';
import type { MidiaDaOrdem } from '@/lib/agente/ordem';
import type { RascunhoParaApp } from '@/lib/agente/rascunhos';
import { juntarRelato, MAX_RELATO, SEM_FALA } from '@/lib/agente/relato';
import { dataLocal, formatarData } from '@/lib/datas';
import { formatarPlaca, lerNumero, normalizarPlaca } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { servico as servicoInfo } from '@/lib/manutencao';
import { apagarMidia, guardarMidia } from '@/lib/midia';
import { PRO } from '@/lib/plano';
import { useOficina } from '@/lib/store';
import { CLIENTE_VAZIO, VEICULO_VAZIO, clienteDoRascunho, errosCliente, errosVeiculo, veiculoDoRascunho } from './formularios';
import { Andamento, TrechoDoRelato, type Passo } from './ordem/Andamento';
import { BuscaCarro } from './ordem/BuscaCarro';
import { CaixaWhatsApp } from './ordem/CaixaWhatsApp';
import { BotaoDeFotos, MAX_FOTOS, Miniaturas } from './ordem/fotos';
import { MicrofoneGrande, arquivoDoClipe, novoId, tempo, type Clipe } from './ordem/gravador';
import { Pronto } from './ordem/Pronto';
import { CartaoDoRelato } from './ordem/Relato';
import { TelaDeRevisao, prazoSugerido, type Revisao } from './ordem/Revisao';
import { abrirMidias, encerrarSessao, esquecerSessao, lerSessao, salvarSessao, type FotoLocal, type Preenchido, type SessaoSalva } from './ordem/sessao';
import { useOfertaDoPro, usePlano } from './plano';

const SEM_INTERNET = 'Não deu para falar com o servidor. Confira a internet e tente de novo.';
const REFAZER = 'Preencher a ordem de novo? O que você mudou à mão na ficha pode ser trocado.';

type Trabalho =
  | { tipo: 'ouvindo'; clipe: Clipe }
  | { tipo: 'preenchendo'; clipe: Clipe | null }
  | { tipo: 'falhou'; acao: 'ouvir' | 'preencher'; mensagem: string; clipe: Clipe | null };

interface Feito {
  veiculoId: string;
  mensagem: string;
  atendimentoId: string | null;
}

function ultimoKm(id: string): number | null {
  const e = useOficina.getState();
  const pontos = pontosDoVeiculo(id, Object.values(e.atendimentos), Object.values(e.leituras));
  return pontos.length ? pontos[pontos.length - 1].km : null;
}

const idsDasFotos = (fotos: FotoLocal[]) => fotos.map((f) => f.id).join(',');

// cada vez que a tela abre. Uma tela que já saiu só termina o que a IA estava fazendo (e guarda)
// se nenhuma outra abriu depois; senão a nova continua de onde a ordem guardada parou.
let telasAbertas = 0;

export function OrdemPorVoz() {
  const params = useSearchParams();
  const router = useRouter();
  const hoje = useHoje();
  const toast = useToast();
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const salvarCliente = useOficina((s) => s.salvarCliente);
  const salvarVeiculo = useOficina((s) => s.salvarVeiculo);
  const registrarAtendimento = useOficina((s) => s.registrarAtendimento);
  const salvarOrdem = useOficina((s) => s.salvarOrdem);
  const aparelhoId = useOficina((s) => s.aparelhoId);
  const contarMontagem = useOficina((s) => s.contarMontagem);
  const plano = usePlano();
  const abrirPro = useOfertaDoPro();

  const doLink = params.get('carro');
  const carroDoLink = doLink && veiculos[doLink] ? doLink : null;

  const [carregado, setCarregado] = useState(false);
  const [retomada, setRetomada] = useState(false);
  const [veiculoId, setVeiculoId] = useState<string | null>(carroDoLink);
  const [clipes, setClipes] = useState<Clipe[]>([]);
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [relato, setRelato] = useState('');
  const [preenchido, setPreenchido] = useState<Preenchido | null>(null);
  const [trabalho, setTrabalho] = useState<Trabalho | null>(null);
  const [escrevendo, setEscrevendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [ia, setIa] = useState<{ ordem: OrdemIA; modelo: string } | null>(null);
  const [rev, setRev] = useState<Revisao | null>(null);
  const [mexeu, setMexeu] = useState(false);
  const [errosRev, setErrosRev] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<Feito | null>(null);
  const [doWhatsApp, setDoWhatsApp] = useState<string | null>(null);

  // o que as funções assíncronas leem (o estado da última tela) e o que não vira tela
  const atual = useRef({ relato, fotos, clipes, veiculoId, rev, mexeu, ia, preenchido, doWhatsApp, feito });
  atual.current = { relato, fotos, clipes, veiculoId, rev, mexeu, ia, preenchido, doWhatsApp, feito };
  const pronto = useRef(false);
  const montado = useRef(false);
  const minhaTela = useRef(0);
  const sessaoId = useRef(novoId());
  const contada = useRef(false);
  const criadoEm = useRef(new Date().toISOString());
  const encerrada = useRef(false);
  const geracao = useRef(0);

  const veiculo = veiculoId ? veiculos[veiculoId] ?? null : null;
  const dono = veiculo ? clientes[veiculo.clienteId] : undefined;
  /** Esta tela ainda é a última que abriu (a ordem guardada é dela). */
  const minha = () => minhaTela.current === telasAbertas;

  // ------------------------------------------------------------ a ordem guardada no aparelho

  function sessaoAtual(): SessaoSalva<Revisao> | null {
    const a = atual.current;
    if (!a.clipes.length && !a.fotos.length && !a.relato.trim() && !a.ia) return null;
    return {
      versao: 1,
      id: sessaoId.current,
      criadoEm: criadoEm.current,
      veiculoId: a.veiculoId,
      clipes: a.clipes.map((c) => ({ id: c.id, mime: c.blob.type, segundos: c.segundos, ouvido: c.ouvido })),
      fotos: a.fotos.map((f) => ({ id: f.id, mime: f.arquivo.type, nome: f.arquivo.name })),
      relato: a.relato,
      preenchido: a.preenchido,
      contada: contada.current,
      ia: a.ia,
      rev: a.ia ? a.rev : null,
      mexeu: a.mexeu
    };
  }

  function salvarAgora() {
    const a = atual.current;
    if (!pronto.current || encerrada.current || a.doWhatsApp || a.feito || !minha()) return;
    const s = sessaoAtual();
    void (s ? salvarSessao(s) : esquecerSessao(sessaoId.current));
  }

  async function carregar() {
    const vez = ++geracao.current;
    const s = await lerSessao<Revisao>();
    if (vez !== geracao.current) return;
    if (s && (s.clipes.length || s.fotos.length || s.relato.trim() || s.ia)) {
      const m = await abrirMidias(s);
      if (vez !== geracao.current) {
        for (const c of m.clipes) URL.revokeObjectURL(c.url);
        for (const f of m.fotos) URL.revokeObjectURL(f.url);
        return;
      }
      const carros = useOficina.getState().veiculos;
      setClipes(m.clipes);
      setFotos(m.fotos);
      setRelato(s.relato);
      setPreenchido(s.preenchido ?? null);
      setVeiculoId(s.veiculoId && carros[s.veiculoId] ? s.veiculoId : null);
      setIa(s.ia);
      setRev(s.ia && s.rev ? { ...s.rev, veiculoId: s.rev.veiculoId && carros[s.rev.veiculoId] ? s.rev.veiculoId : null } : null);
      setMexeu(!!s.mexeu);
      sessaoId.current = s.id;
      contada.current = s.contada;
      criadoEm.current = s.criadoEm;
      setRetomada(true);
    }
    pronto.current = true;
    setCarregado(true);
  }

  useEffect(() => {
    minhaTela.current = ++telasAbertas;
    montado.current = true;
    void carregar();
    return () => {
      // saindo da tela: guarda o que falta e solta os arquivos da memória. Se a IA ainda estiver
      // trabalhando, o resultado é guardado quando chegar e a ordem fica pronta para conferir.
      montado.current = false;
      salvarAgora();
      geracao.current++;
      for (const c of atual.current.clipes) URL.revokeObjectURL(c.url);
      for (const f of atual.current.fotos) URL.revokeObjectURL(f.url);
    };
    // só ao abrir e ao sair da tela
  }, []);

  useEffect(() => {
    if (!carregado) return;
    const t = setTimeout(salvarAgora, 500);
    return () => clearTimeout(t);
    // guarda meio segundo depois da última mudança
  }, [carregado, clipes, fotos, relato, preenchido, veiculoId, ia, rev, mexeu]);

  function limparEstado() {
    geracao.current++;
    for (const c of atual.current.clipes) URL.revokeObjectURL(c.url);
    for (const f of atual.current.fotos) URL.revokeObjectURL(f.url);
    atual.current = { ...atual.current, clipes: [], fotos: [], relato: '', rev: null, ia: null, preenchido: null, doWhatsApp: null, feito: null, mexeu: false };
    setClipes([]);
    setFotos([]);
    setRelato('');
    setPreenchido(null);
    setTrabalho(null);
    setEscrevendo(false);
    setIa(null);
    setRev(null);
    setMexeu(false);
    setErrosRev({});
    setSalvando(false);
    setFeito(null);
    setDoWhatsApp(null);
    setRetomada(false);
    setVeiculoId(null);
    sessaoId.current = novoId();
    contada.current = false;
    criadoEm.current = new Date().toISOString();
    encerrada.current = false;
  }

  /** Volta para o microfone e confere se ficou alguma ordem guardada no aparelho. */
  function recomecar() {
    limparEstado();
    pronto.current = false;
    setCarregado(false);
    void carregar();
    window.scrollTo({ top: 0 });
  }

  async function descartar() {
    if (encerrada.current) return;
    if (!window.confirm('Descartar esta ordem? O áudio, o texto e as fotos dela são apagados.')) return;
    const ids = [...atual.current.clipes.map((c) => c.id), ...atual.current.fotos.map((f) => f.id)];
    encerrada.current = true;
    await encerrarSessao(sessaoId.current, ids);
    limparEstado();
    setVeiculoId(carroDoLink);
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------ o plano

  function podeComecar(): boolean {
    if (contada.current || plano.podeDitar) return true;
    if (plano.liberado) toast({ texto: `Este aparelho chegou a ${PRO.ordensPro} ordens por voz neste mês. Fale com a equipe do Revisaí para liberar mais.`, tom: 'erro' });
    else abrirPro('ordens');
    return false;
  }

  // ------------------------------------------------------------ áudio → texto → ordem

  function tirarClipe(c: Clipe) {
    URL.revokeObjectURL(c.url);
    void apagarMidia(c.id);
    atual.current.clipes = atual.current.clipes.filter((x) => x.id !== c.id);
    setClipes((l) => l.filter((x) => x.id !== c.id));
  }

  /** Passa um áudio para texto e junta ao que já foi falado. Volta null se não deu. */
  async function ouvir(clipe: Clipe): Promise<string | null> {
    setTrabalho({ tipo: 'ouvindo', clipe });
    const dados = new FormData();
    dados.append('audio', arquivoDoClipe(clipe, atual.current.clipes.findIndex((c) => c.id === clipe.id) + 1));
    let r: Awaited<ReturnType<typeof transcreverAudio>>;
    try {
      r = await transcreverAudio(dados);
    } catch {
      r = { ok: false, erro: SEM_INTERNET };
    }
    // outra tela da ordem abriu enquanto isso: ela continua de onde a ordem guardada parou
    if (!minha()) return null;
    if (!r.ok) {
      // o áudio fica guardado (sem fala ou não, quem decide jogar fora é o mecânico)
      setTrabalho({ tipo: 'falhou', acao: 'ouvir', mensagem: r.erro, clipe });
      return null;
    }
    const texto = juntarRelato(atual.current.relato, r.texto);
    atual.current.relato = texto;
    atual.current.clipes = atual.current.clipes.map((c) => (c.id === clipe.id ? { ...c, ouvido: true } : c));
    setRelato(texto);
    setClipes((l) => l.map((c) => (c.id === clipe.id ? { ...c, ouvido: true } : c)));
    salvarAgora();
    return texto;
  }

  async function preencher(texto: string, clipe: Clipe | null): Promise<void> {
    setTrabalho({ tipo: 'preenchendo', clipe });
    const e = useOficina.getState();
    const { rev: antes, veiculoId: escolhido, fotos: todas } = atual.current;
    // a IA olha até 6 fotos (as do WhatsApp podem ser mais; todas ficam na ordem)
    const fotosDaIA = todas.slice(0, MAX_FOTOS);
    const id = antes?.veiculoId ?? escolhido;
    const carro = id ? e.veiculos[id] ?? null : null;
    const dados = new FormData();
    dados.set(
      'contexto',
      JSON.stringify({
        oficina: e.oficina.nome,
        hoje,
        carro: carro ? `${formatarPlaca(carro.placa)}, ${[carro.marca, carro.modelo, carro.motor, carro.ano].filter(Boolean).join(' ')}` : null,
        cliente: carro ? e.clientes[carro.clienteId]?.nome ?? null : null,
        kmAnterior: carro ? ultimoKm(carro.id) : null,
        transcricao: texto.trim().slice(0, MAX_RELATO) || null
      })
    );
    fotosDaIA.forEach((f) => dados.append('foto', f.arquivo));
    let r: Awaited<ReturnType<typeof montarOrdemComIA>>;
    try {
      r = await montarOrdemComIA(dados);
    } catch {
      r = { ok: false, erro: SEM_INTERNET };
    }
    if (!minha()) return;
    if (!r.ok) {
      setTrabalho({ tipo: 'falhou', acao: 'preencher', mensagem: r.erro, clipe });
      return;
    }
    if (!contada.current) {
      contada.current = true;
      contarMontagem(hoje);
    }
    const feitoCom = { relato: texto, fotos: idsDasFotos(todas) };
    atual.current.preenchido = feitoCom;
    setPreenchido(feitoCom);
    abrirRevisao(r.ordem, r.modelo, id, todas, antes);
    setTrabalho(null);
    setRetomada(false);
    salvarAgora();
  }

  /** A ficha com o que a IA preencheu. Num novo preenchimento, o que a IA não trouxe fica como estava. */
  function abrirRevisao(o: OrdemIA, modelo: string, alvoId: string | null, fotosDaOrdem: FotoLocal[], antes: Revisao | null) {
    const e = useOficina.getState();
    const preferido = alvoId ? e.veiculos[alvoId] ?? null : null;
    const daPlaca = !preferido && o.placa ? Object.values(e.veiculos).find((v) => v.placa === o.placa) ?? null : null;
    const alvo = preferido ?? daPlaca;
    const cli = antes?.novoCliente ?? CLIENTE_VAZIO;
    const car = antes?.novoCarro ?? VEICULO_VAZIO;
    const nova: Revisao = {
      veiculoId: alvo?.id ?? null,
      novoCliente: { ...cli, nome: o.cliente ?? cli.nome },
      novoCarro: {
        ...car,
        placa: o.placa ?? car.placa,
        marca: o.veiculo?.marca ?? car.marca,
        modelo: o.veiculo?.modelo ?? car.modelo,
        motor: o.veiculo?.motor ?? car.motor,
        ano: o.veiculo?.ano ? String(o.veiculo.ano) : car.ano
      },
      km: o.km ? String(o.km) : antes?.km ?? '',
      itens: o.servicos.map((s) => ({ servico: s.servico, produto: s.produto ?? '', observacao: s.observacao ?? '', ...prazoSugerido(s.servico, alvo, e.preferencias) })),
      diagnostico: o.diagnostico,
      recomendacoes: o.recomendacoes,
      legendas: Object.fromEntries(
        fotosDaOrdem.map((f, i) => [f.id, (i < MAX_FOTOS ? o.fotos.find((x) => x.indice === i + 1)?.legenda : undefined) || antes?.legendas[f.id] || ''])
      ),
      mensagem: o.mensagemCliente
    };
    atual.current.ia = { ordem: o, modelo };
    atual.current.rev = nova;
    atual.current.mexeu = false;
    setIa({ ordem: o, modelo });
    setRev(nova);
    setMexeu(false);
    setErrosRev({});
    if (montado.current) window.scrollTo({ top: 0 });
  }

  /** Preencher de novo troca o que foi mexido à mão: pergunta antes (e só com a tela aberta). */
  function podeRefazer(pergunta = REFAZER): boolean {
    if (!atual.current.rev || !atual.current.mexeu) return true;
    return montado.current && window.confirm(pergunta);
  }

  /**
   * O caminho inteiro: os áudios que ainda não viraram texto viram (na ordem) e o texto todo, com
   * as fotos, preenche a ordem. Para no primeiro erro, que aparece com o que dá para fazer.
   */
  async function processar(clipeDaVez: Clipe | null, pergunta = REFAZER) {
    for (const c of atual.current.clipes.filter((x) => !x.ouvido)) {
      if ((await ouvir(c)) == null) return;
    }
    if (!minha()) return;
    if (!atual.current.relato.trim() && !atual.current.fotos.length) {
      setTrabalho(null);
      return;
    }
    if (!podeRefazer(pergunta)) {
      setTrabalho(null);
      if (montado.current) toast({ texto: 'O que você falou entrou no texto. Toque em Preencher de novo quando quiser.' });
      return;
    }
    await preencher(atual.current.relato, clipeDaVez);
  }

  async function aoGravar(c: Clipe) {
    setGravando(false);
    setEscrevendo(false);
    setRetomada(false);
    atual.current.clipes = [...atual.current.clipes, c];
    setClipes((l) => [...l, c]);
    // o áudio fica guardado antes de qualquer coisa
    await guardarMidia(c.id, c.blob);
    salvarAgora();
    await processar(c, 'Preencher a ordem de novo com o que você falou? O que você mudou à mão na ficha pode ser trocado.');
  }

  function tentarDeNovo() {
    const t = trabalho;
    if (t?.tipo !== 'falhou') return;
    void processar(t.clipe);
  }

  /** Continua a ordem guardada de onde parou. */
  function continuar() {
    setRetomada(false);
    const pendentes = atual.current.clipes.some((c) => !c.ouvido);
    if (!pendentes && atual.current.ia && atual.current.rev) return;
    // só com fotos: as fotos ficam e falta falar o que foi feito
    if (!pendentes && !atual.current.relato.trim()) return;
    if (!podeComecar()) return;
    void processar(null);
  }

  function preencherDoTexto() {
    if (!atual.current.relato.trim()) {
      toast({ texto: 'Escreva o que foi feito no carro.', tom: 'erro' });
      return;
    }
    if (!podeComecar()) return;
    setEscrevendo(false);
    void processar(null);
  }

  // ------------------------------------------------------------ fotos

  function incluirFotos(novas: FotoLocal[]) {
    atual.current.fotos = [...atual.current.fotos, ...novas];
    setFotos((l) => [...l, ...novas]);
    if (atual.current.rev) {
      const r = atual.current.rev;
      setRev({ ...r, legendas: { ...r.legendas, ...Object.fromEntries(novas.map((f) => [f.id, ''])) } });
    }
  }

  function tirarFoto(f: FotoLocal) {
    URL.revokeObjectURL(f.url);
    if (!atual.current.doWhatsApp) void apagarMidia(f.id);
    atual.current.fotos = atual.current.fotos.filter((x) => x.id !== f.id);
    setFotos((l) => l.filter((x) => x.id !== f.id));
    if (atual.current.rev) {
      const { [f.id]: _fora, ...legendas } = atual.current.rev.legendas;
      setRev({ ...atual.current.rev, legendas });
    }
  }

  // ------------------------------------------------------------ WhatsApp

  function abrirDoWhatsApp(r: RascunhoParaApp, fotosDele: FotoLocal[], clipesDele: Clipe[]) {
    // a ordem por voz em andamento deste aparelho continua guardada e volta depois
    geracao.current++;
    for (const c of atual.current.clipes) URL.revokeObjectURL(c.url);
    for (const f of atual.current.fotos) URL.revokeObjectURL(f.url);
    const texto = r.ordem.transcricao ?? '';
    atual.current = { ...atual.current, clipes: clipesDele, fotos: fotosDele, relato: texto, doWhatsApp: r.id, rev: null, ia: null };
    setDoWhatsApp(r.id);
    setRetomada(false);
    setTrabalho(null);
    setClipes(clipesDele);
    setFotos(fotosDele);
    setRelato(texto);
    setPreenchido({ relato: texto, fotos: idsDasFotos(fotosDele) });
    setVeiculoId(null);
    contada.current = true;
    abrirRevisao(r.ordem, r.modelo ?? 'IA', null, fotosDele, null);
  }

  // ------------------------------------------------------------ confirmar

  async function confirmar() {
    if (!rev || !ia || encerrada.current) return;
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

    // daqui em diante a ordem não volta mais como em andamento, nem com dois toques
    encerrada.current = true;
    setSalvando(true);
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
    for (const f of fotos) if (await guardarMidia(f.id, f.arquivo)) midias.push({ id: f.id, tipo: 'foto', mime: f.arquivo.type, legenda: rev.legendas[f.id] || undefined });
    const vozId = salvarOrdem({
      origem: doWhatsApp ? 'whatsapp' : 'app',
      veiculoId: alvo,
      atendimentoId,
      ia: {
        ...ia.ordem,
        km: km ?? ia.ordem.km,
        servicos: rev.itens.map((i) => ({ servico: i.servico, produto: i.produto || null, observacao: i.observacao || null })),
        diagnostico: rev.diagnostico,
        recomendacoes: rev.recomendacoes.filter((r) => r.texto.trim()),
        fotos: fotos.map((f, i) => ({ indice: i + 1, legenda: rev.legendas[f.id] ?? '' })),
        mensagemCliente: rev.mensagem,
        transcricao: relato.trim()
      },
      midias,
      modelo: ia.modelo
    });
    // a ordem por voz também entra na lista de ordens de serviço, já concluída
    if (rev.itens.length) {
      const agora = new Date().toISOString();
      useOficina.getState().salvarDocumento({
        tipo: 'ordem',
        situacao: 'concluida',
        veiculoId: alvo,
        km: km ?? null,
        data: hoje,
        linhas: rev.itens.map((i, n) => (
          {
            id: `${vozId}-${n}`,
            tipo: i.produto.trim() ? ('peca' as const) : ('servico' as const),
            servico: i.servico,
            descricao: i.produto.trim().slice(0, 160) || servicoInfo(i.servico).nome,
            quantidade: 1,
            unidade: 'un' as const,
            valorUnitario: null,
            produto: i.produto.trim() ? { nome: i.produto.trim().slice(0, 120) } : null,
            intervaloKm: lerNumero(i.km) || null,
            intervaloMeses: lerNumero(i.meses) || null
          }
        )),
        desconto: null,
        diagnostico: rev.diagnostico.trim().slice(0, 800) || undefined,
        recomendacoes: rev.recomendacoes.filter((r) => r.texto.trim()),
        relato: relato.trim() || undefined,
        atendimentoId: atendimentoId ?? undefined,
        vozId,
        concluidoEm: agora
      });
    }
    if (doWhatsApp) {
      if (aparelhoId) void encerrarRascunhoDoWhatsApp(aparelhoId, doWhatsApp, 'confirmada').catch(() => {});
    } else await encerrarSessao(sessaoId.current);
    setSalvando(false);
    setFeito({ veiculoId: alvo, mensagem: rev.mensagem, atendimentoId });
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------ telas

  if (feito)
    return (
      <Pronto
        {...feito}
        fotos={fotos}
        audios={clipes.length}
        aoNova={() => {
          router.replace('/oficina/ordem');
          recomecar();
        }}
      />
    );

  const ocupado = trabalho != null && trabalho.tipo !== 'falhou';
  const pendentes = clipes.filter((c) => !c.ouvido).length;
  const mudou = pendentes > 0 || !preenchido || relato.trim() !== preenchido.relato.trim() || idsDasFotos(fotos) !== preenchido.fotos;

  if (rev && ia && !retomada && !ocupado) {
    const falhou = trabalho?.tipo === 'falhou' ? trabalho : null;
    return (
      <TelaDeRevisao
        ordem={ia.ordem}
        rev={rev}
        aoEditar={(r) => {
          setRev(r);
          setMexeu(true);
        }}
        erros={errosRev}
        fotos={fotos}
        aoIncluirFotos={incluirFotos}
        aoTirarFoto={tirarFoto}
        relato={
          <CartaoDoRelato
            clipes={clipes}
            pendentes={pendentes}
            relato={relato}
            aoMudar={setRelato}
            mudou={mudou}
            aoPreencher={() => void processar(null)}
            aoFalarMais={(c) => void aoGravar(c)}
          />
        }
        aviso={
          falhou ? (
            <div className="rounded-xl bg-atraso-claro px-4 py-3 text-[14.5px] text-atraso" role="alert">
              <p className="font-semibold">{falhou.mensagem}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Botao tamanho="pequeno" variante="primario" onClick={tentarDeNovo}>
                  <RotateCcw size={15} /> Tentar de novo
                </Botao>
                {falhou.acao === 'ouvir' && falhou.clipe ? (
                  <Botao
                    tamanho="pequeno"
                    onClick={() => {
                      if (falhou.clipe) tirarClipe(falhou.clipe);
                      setTrabalho(null);
                    }}
                  >
                    <Trash2 size={15} /> Jogar fora este áudio
                  </Botao>
                ) : null}
                <Botao tamanho="pequeno" variante="fantasma" onClick={() => setTrabalho(null)}>
                  Fechar
                </Botao>
              </div>
            </div>
          ) : null
        }
        saida={doWhatsApp ? { rotulo: 'Voltar', acao: recomecar } : { rotulo: 'Descartar', acao: () => void descartar() }}
        salvando={salvando}
        aoConfirmar={() => void confirmar()}
      />
    );
  }

  const temConteudo = clipes.length > 0 || relato.trim().length > 0 || ia != null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-172px-env(safe-area-inset-bottom))] w-full max-w-xl flex-col items-center gap-6 lg:min-h-[calc(100dvh-104px)]">
      <header className="text-center">
        <h1 className="largo text-[26px] sm:text-[30px]">Ordem por voz</h1>
        <p className="mx-auto mt-1 max-w-[46ch] text-tinta-2">Fale o que fez no carro. O áudio fica guardado, vira texto e a IA preenche a ordem de serviço para você conferir.</p>
      </header>

      {trabalho ? null : !escrevendo && !gravando && carregado && (retomada || temConteudo) ? (
        <EmAndamento
          criadoEm={criadoEm.current}
          hoje={hoje}
          clipes={clipes}
          fotos={fotos.length}
          relato={relato}
          preenchida={ia != null}
          aoContinuar={continuar}
          aoDescartar={() => void descartar()}
        />
      ) : null}

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-5">
        {trabalho ? (
          <TelaDoTrabalho
            trabalho={trabalho}
            relato={relato}
            aoTentar={tentarDeNovo}
            aoGravarDeNovo={() => {
              if (trabalho.tipo === 'falhou' && trabalho.clipe) tirarClipe(trabalho.clipe);
              setTrabalho(null);
            }}
            aoEscrever={() => {
              setTrabalho(null);
              setEscrevendo(true);
            }}
            linkManual={veiculoId ? `/oficina/nova?tipo=ordem&carro=${veiculoId}` : '/oficina/nova?tipo=ordem'}
          />
        ) : escrevendo ? (
          <div className="flex w-full flex-col gap-3">
            <label htmlFor="o-texto" className="text-[16px] font-bold">
              Escreva o que foi feito no carro
            </label>
            <textarea
              id="o-texto"
              rows={8}
              className={classeArea}
              value={relato}
              onChange={(e) => setRelato(e.target.value)}
              placeholder="Ex.: Onix ABC1D23, 45.210 km. Troquei o óleo Lubrax 5W-30 e o filtro. Pastilha da frente com 2 mm, trocar já."
              maxLength={MAX_RELATO}
              autoFocus
            />
            <div className="flex flex-wrap-reverse items-center justify-between gap-2">
              <Botao variante="fantasma" onClick={() => setEscrevendo(false)}>
                <Mic size={17} /> Voltar ao microfone
              </Botao>
              <Botao variante="primario" tamanho="grande" onClick={preencherDoTexto} disabled={!relato.trim()}>
                <Sparkles size={18} /> Preencher a ordem
              </Botao>
            </div>
          </div>
        ) : (
          <>
            {veiculo ? (
              <div className="flex max-w-full items-center gap-2.5 rounded-full bg-papel py-1.5 pr-1.5 pl-2.5 ring-1 ring-linha">
                <Placa placa={veiculo.placa} />
                <span className="min-w-0 truncate text-[14.5px] font-semibold">{[dono?.nome, veiculo.modelo].filter(Boolean).join(', ')}</span>
                {gravando ? null : (
                  <button type="button" onClick={() => setVeiculoId(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-tinta-3 hover:bg-papel-2 hover:text-tinta" aria-label="Tirar o carro escolhido">
                    <X size={16} />
                  </button>
                )}
              </div>
            ) : null}
            <MicrofoneGrande aoGravar={(c) => void aoGravar(c)} podeComecar={podeComecar} aoMudar={setGravando} desabilitado={!carregado} />
          </>
        )}
      </div>

      {!trabalho && !escrevendo && !gravando ? (
        <div className="flex w-full flex-col items-center gap-3">
          <Miniaturas fotos={fotos} aoTirar={tirarFoto} />
          <div className="flex flex-wrap justify-center gap-1.5">
            {veiculo ? null : (
              <button type="button" onClick={() => setEscolhendo(true)} className={classeBotao('secundario', 'pequeno')}>
                <Car size={16} aria-hidden="true" /> Escolher carro
              </button>
            )}
            <BotaoDeFotos quantas={fotos.length} aoIncluir={incluirFotos} className={classeBotao('secundario', 'pequeno')}>
              <Camera size={16} aria-hidden="true" /> {fotos.length ? 'Mais fotos' : 'Fotos'}
            </BotaoDeFotos>
            <button type="button" onClick={() => setEscrevendo(true)} className={classeBotao('secundario', 'pequeno')}>
              <Keyboard size={16} aria-hidden="true" /> Escrever
            </button>
          </div>
          {!plano.liberado ? (
            <p className="num text-[13px] text-tinta-3">
              {Math.min(plano.montagens, PRO.ordensGratis)} de {PRO.ordensGratis} ordens grátis usadas neste mês
            </p>
          ) : null}
        </div>
      ) : null}

      {aparelhoId && !trabalho && !escrevendo && !gravando ? <CaixaWhatsApp aparelhoId={aparelhoId} aoAbrir={abrirDoWhatsApp} /> : null}

      <Folha aberta={escolhendo} aoFechar={() => setEscolhendo(false)} titulo="Escolher o carro" descricao="Se não escolher, é só falar a placa: a IA procura o carro no cadastro.">
        <BuscaCarro
          focar
          aoEscolher={(id) => {
            setVeiculoId(id);
            setEscolhendo(false);
          }}
        />
      </Folha>
    </div>
  );
}

/** A ordem começada e ainda não confirmada (guardada no aparelho). */
function EmAndamento({
  criadoEm,
  hoje,
  clipes,
  fotos,
  relato,
  preenchida,
  aoContinuar,
  aoDescartar
}: {
  criadoEm: string;
  hoje: string;
  clipes: Clipe[];
  fotos: number;
  relato: string;
  preenchida: boolean;
  aoContinuar: () => void;
  aoDescartar: () => void;
}) {
  const dia = dataLocal(criadoEm);
  const hora = new Date(criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const quando = dia === hoje ? `hoje às ${hora}` : `em ${formatarData(dia)}`;
  const partes: string[] = [];
  if (clipes.length) partes.push(clipes.length === 1 ? `1 áudio de ${tempo(clipes[0].segundos)}` : `${clipes.length} áudios`);
  if (fotos) partes.push(fotos === 1 ? '1 foto' : `${fotos} fotos`);
  const pendentes = clipes.filter((c) => !c.ouvido).length;
  const falta = pendentes
    ? pendentes === 1
      ? 'Um áudio ainda não virou texto.'
      : `${pendentes} áudios ainda não viraram texto.`
    : preenchida
      ? 'A ordem já está preenchida, falta conferir.'
      : relato.trim()
        ? 'Falta a IA preencher a ordem.'
        : 'Falta contar o que foi feito.';
  return (
    <section className="w-full rounded-2xl bg-papel p-4 ring-1 ring-linha sm:p-5" aria-labelledby="em-andamento">
      <h2 id="em-andamento" className="text-[17px]">
        Ordem começada {quando}
      </h2>
      <p className="mt-0.5 text-[14px] text-tinta-2">
        {partes.length ? `${partes.join(' e ')}. ` : ''}
        {falta}
      </p>
      {relato.trim() ? (
        <div className="mt-3">
          <TrechoDoRelato texto={relato.length > 220 ? relato.slice(0, 220).replace(/\s\S*$/, '') + '…' : relato} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Botao variante="escuro" onClick={aoContinuar}>
          Continuar
        </Botao>
        <Botao variante="fantasma" onClick={aoDescartar}>
          Descartar
        </Botao>
      </div>
      {preenchida ? null : <p className="mt-2 text-[13px] text-tinta-3">Se tocar no microfone, o que você falar entra junto nesta ordem.</p>}
    </section>
  );
}

/** O áudio virando texto e o texto virando ordem, com o que fazer se algo falhar. */
function TelaDoTrabalho({
  trabalho,
  relato,
  aoTentar,
  aoGravarDeNovo,
  aoEscrever,
  linkManual
}: {
  trabalho: Trabalho;
  relato: string;
  aoTentar: () => void;
  aoGravarDeNovo: () => void;
  aoEscrever: () => void;
  linkManual: string;
}) {
  const falhou = trabalho.tipo === 'falhou' ? trabalho : null;

  if (falhou?.mensagem === SEM_FALA) {
    return (
      <div className="flex w-full flex-col items-center gap-4 text-center" role="alert">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-atraso-claro text-atraso">
          <Mic size={34} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[18px] font-bold">Não deu para entender o áudio</p>
          <p className="mx-auto mt-1 max-w-[36ch] text-tinta-2">Grave de novo com o celular mais perto da boca, ou escreva o que foi feito.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Botao variante="primario" tamanho="grande" onClick={aoGravarDeNovo}>
            <Mic size={18} /> Gravar de novo
          </Botao>
          <Botao tamanho="grande" onClick={aoEscrever}>
            <Keyboard size={18} /> Escrever
          </Botao>
        </div>
        <button type="button" onClick={aoTentar} className="text-[14px] font-semibold text-caneta hover:underline">
          Tentar passar o mesmo áudio para texto
        </button>
      </div>
    );
  }

  const clipe = trabalho.clipe;
  const ouvindo = trabalho.tipo === 'ouvindo';
  const errouOuvir = falhou?.acao === 'ouvir';
  const preenchendo = trabalho.tipo === 'preenchendo';
  const errouPreencher = falhou?.acao === 'preencher';
  const passos: Passo[] = [];
  if (clipe) {
    passos.push({ id: 'audio', titulo: 'Áudio guardado', detalhe: `${tempo(clipe.segundos)} de gravação, guardado neste aparelho.`, estado: 'feito' });
    passos.push({
      id: 'texto',
      titulo: ouvindo ? 'Passando o áudio para texto' : errouOuvir ? 'O áudio não virou texto' : 'Áudio em texto',
      estado: ouvindo ? 'agora' : errouOuvir ? 'erro' : 'feito',
      detalhe: !ouvindo && !errouOuvir && relato.trim() ? <TrechoDoRelato texto={relato} /> : undefined
    });
  }
  passos.push({
    id: 'ordem',
    titulo: preenchendo ? 'Preenchendo a ordem de serviço' : errouPreencher ? 'A ordem não foi preenchida' : 'Preencher a ordem de serviço',
    estado: preenchendo ? 'agora' : errouPreencher ? 'erro' : 'depois',
    detalhe: !clipe && relato.trim() ? <TrechoDoRelato texto={relato} /> : undefined
  });

  return (
    <Andamento passos={passos}>
      {falhou ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-atraso-claro p-4" role="alert">
          <p className="text-[15px] font-semibold text-atraso">{falhou.mensagem}</p>
          <div className="flex flex-wrap gap-2">
            <Botao variante="primario" onClick={aoTentar}>
              <RotateCcw size={16} /> Tentar de novo
            </Botao>
            {errouOuvir ? (
              <Botao onClick={aoGravarDeNovo}>
                <Mic size={16} /> Gravar de novo
              </Botao>
            ) : null}
            <Botao onClick={aoEscrever}>
              <Keyboard size={16} /> Escrever
            </Botao>
            <Link href={linkManual} className={classeBotao('fantasma')}>
              Registrar à mão
            </Link>
          </div>
        </div>
      ) : null}
    </Andamento>
  );
}
