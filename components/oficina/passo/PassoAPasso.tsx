'use client';

// O passo a passo da ordem de serviço e do orçamento: uma pergunta por tela, com a voz falando
// a pergunta e ouvindo a resposta (ou tudo no toque). No fim, a ordem fica registrada (ou em
// andamento) e o orçamento vai para o cliente pelo WhatsApp.

import { ArrowLeft, Car, Check, ClipboardList, FileText, Mic, MicOff, Search, Sparkles, Square, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { montarOrdemComIA, transcreverAudio } from '@/app/oficina/acoes-agente';
import { IconeServico } from '@/components/icones';
import { Placa } from '@/components/pecas';
import { Alternar, Botao, Campo, classeEntrada } from '@/components/ui';
import { pontosDoVeiculo } from '@/lib/agenda';
import { formatarData } from '@/lib/datas';
import { tituloDoDocumento } from '@/lib/documentos';
import { escolherPorFala, modeloFalado } from '@/lib/fala';
import { formatarKm, formatarPlaca, lerNumero, normalizarPlaca, normalizarTelefone, placaValida, SEM_NOME } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { SERVICOS, SERVICOS_RAPIDOS, servico as infoServico, servicoExiste } from '@/lib/manutencao';
import { mensagemDaCota } from '@/lib/plano';
import {
  alternarServico,
  definirPeca,
  documentoDoRascunho,
  incluirAvulsa,
  incluirServicos,
  interpretar,
  linhaDaPeca,
  linhasAvulsas,
  mudarLinha,
  passosDo,
  placaDoRascunho,
  rascunhoDoDocumento,
  rascunhoVazio,
  servicoDoPasso,
  tirarLinha,
  type PassoId,
  type Rascunho,
  type Subpergunta
} from '@/lib/passo';
import { useOficina } from '@/lib/store';
import type { Id, ServicoId, TipoDocumento } from '@/lib/tipos';
import { FRASES, perguntaDaPeca, type FraseId } from '@/lib/voz-frases';
import { useConcluirOrdem, useLinkDoOrcamento } from '../documentos';
import { novoId, useGravador } from '../ordem/gravador';
import { useAtualizarUso, useOfertaDoPro, usePlano } from '../plano';
import { Conferir, type ResumoDoCarro } from './Conferir';
import { Final, type Resultado } from './Final';
import { useOpcoesDePeca } from './opcoes';
import { EscolhaDePeca, escolhaDaOpcao } from './Pecas';
import { Valores } from './Valores';
import { prepararFrases, useVoz } from './voz';

const CHAVE = 'revisai:passo';
const VALIDADE_MS = 24 * 60 * 60_000;
const MARCAS = ['Chevrolet', 'Volkswagen', 'Fiat', 'Hyundai', 'Toyota', 'Renault', 'Jeep', 'Honda', 'Nissan', 'Ford', 'Peugeot', 'Citroën', 'Caoa Chery', 'BYD', 'Mitsubishi', 'Kia'];

function lerGuardado(): Rascunho | null {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { r: Rascunho; em: number } | null;
    if (!g || g.r?.versao !== 1 || Date.now() - g.em > VALIDADE_MS) return null;
    return g.r;
  } catch {
    return null;
  }
}

function guardar(r: Rascunho | null) {
  try {
    if (r) localStorage.setItem(CHAVE, JSON.stringify({ r, em: Date.now() }));
    else localStorage.removeItem(CHAVE);
  } catch {}
}

function temConteudo(r: Rascunho): boolean {
  return !!(r.veiculoId || r.carroNovo || r.servicos.length || r.linhas.length);
}

/** A pergunta de cada passo (a voz natural usa o id; a tela mostra o texto). */
function perguntaDo(passo: PassoId, sub: Subpergunta | null, tipo: TipoDocumento | null): { id: FraseId; texto: string } {
  if (sub) return { id: sub, texto: FRASES[sub] };
  const t = tipo ?? 'ordem';
  const s = servicoDoPasso(passo);
  if (s) return perguntaDaPeca(infoServico(s).categoria!, t);
  switch (passo) {
    case 'servicos':
      return t === 'ordem' ? { id: 'servicos_ordem', texto: FRASES.servicos_ordem } : { id: 'servicos_orcamento', texto: FRASES.servicos_orcamento };
    case 'valores':
      return t === 'ordem' ? { id: 'valores_ordem', texto: FRASES.valores_ordem } : { id: 'valores_orcamento', texto: FRASES.valores_orcamento };
    case 'conferir':
      return t === 'ordem' ? { id: 'conferir_ordem', texto: FRASES.conferir_ordem } : { id: 'conferir_orcamento', texto: FRASES.conferir_orcamento };
    default:
      return { id: passo as FraseId, texto: FRASES[passo as FraseId] };
  }
}

/** Um título curto para cada passo, na tela (a pergunta falada é mais longa). */
function tituloDo(passo: PassoId, sub: Subpergunta | null, r: Rascunho): string {
  if (sub === 'vistoria') return 'Quanto custa a vistoria?';
  if (sub === 'modelo') return 'Qual é o modelo do carro?';
  if (sub === 'telefone') return 'Qual é o WhatsApp do dono?';
  const s = servicoDoPasso(passo);
  if (s) return perguntaDaPeca(infoServico(s).categoria!, r.tipo ?? 'ordem').texto;
  const ordem = r.tipo !== 'orcamento';
  switch (passo) {
    case 'tipo':
      return 'Ordem de serviço ou orçamento?';
    case 'modalidade':
      return 'Orçamento frio ou pago?';
    case 'carro':
      return 'Qual é o carro?';
    case 'placa':
      return 'Qual é a placa?';
    case 'km':
      return 'Quantos km no painel?';
    case 'dono':
      return 'Quem é o dono do carro?';
    case 'servicos':
      return ordem ? 'O que foi feito no carro?' : 'O que precisa fazer no carro?';
    case 'valores':
      return 'Valores';
    case 'conferir':
      return ordem ? 'Confira a ordem de serviço' : 'Confira o orçamento';
  }
  return '';
}

export function PassoAPasso() {
  const params = useSearchParams();
  const router = useRouter();
  const hoje = useHoje();
  const plano = usePlano();
  const ofertaPro = useOfertaDoPro();
  const prefs = useOficina((s) => s.preferencias);
  const salvarPrefs = useOficina((s) => s.salvarPreferencias);
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const atendimentos = useOficina((s) => s.atendimentos);
  const leituras = useOficina((s) => s.leituras);
  const documentos = useOficina((s) => s.documentos);
  const oficina = useOficina((s) => s.oficina);
  const concluir = useConcluirOrdem();
  const linkDoOrcamento = useLinkDoOrcamento();

  const tipoDoLink = params.get('tipo');
  const carroDoLink = params.get('carro');
  const editar = params.get('editar');
  const fixos = useMemo(
    () => ({ tipo: tipoDoLink === 'ordem' || tipoDoLink === 'orcamento' || !!editar, carro: (!!carroDoLink && !!veiculos[carroDoLink]) || !!editar }),
    // só o que veio no link quando a tela abriu
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [r, setR] = useState<Rascunho>(() => {
    const agora = new Date().toISOString();
    const doc = editar ? useOficina.getState().documentos[editar] : undefined;
    if (doc) return rascunhoDoDocumento(doc, agora);
    let novo = rascunhoVazio(agora, prefs.validadeOrcamento);
    if (tipoDoLink === 'ordem' || tipoDoLink === 'orcamento') novo = { ...novo, tipo: tipoDoLink };
    if (carroDoLink && useOficina.getState().veiculos[carroDoLink]) novo = { ...novo, veiculoId: carroDoLink };
    const servicos = (params.get('servicos') ?? '').split(',').filter((s): s is ServicoId => servicoExiste(s));
    if (servicos.length) novo = incluirServicos(novo, servicos);
    return { ...novo, passo: passosDo(novo, fixos)[0] };
  });
  const [retomar, setRetomar] = useState<Rascunho | null>(null);
  const [sub, setSub] = useState<Subpergunta | null>(null);
  const [entendi, setEntendi] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [iniciado, setIniciado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const vozAtiva = prefs.vozGuia && iniciado && !resultado;
  const voz = useVoz(vozAtiva);
  const rRef = useRef(r);
  rRef.current = r;
  const subRef = useRef(sub);
  subRef.current = sub;
  const seguirDepois = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geracao = useRef(0);

  // rascunho pela metade de outra vez
  useEffect(() => {
    if (editar || tipoDoLink || carroDoLink) return;
    const g = lerGuardado();
    if (g && temConteudo(g)) setRetomar(g);
  }, []);

  useEffect(() => {
    if (!resultado && !r.editandoId && temConteudo(r)) guardar(r);
  }, [r, resultado]);

  const lista = passosDo(r, fixos);
  const indice = Math.max(0, lista.indexOf(r.passo));
  const passo = lista[indice];
  const s = servicoDoPasso(passo);
  const veiculo = r.veiculoId ? veiculos[r.veiculoId] : undefined;
  const dono = veiculo ? clientes[veiculo.clienteId] : undefined;
  const opcoes = useOpcoesDePeca(s ?? 'revisao', veiculo, r.tipo ?? 'ordem', hoje, r.carroNovo);
  const opcoesRef = useRef(opcoes);
  opcoesRef.current = opcoes;

  const ctxFala = useMemo(
    () => ({
      carros: Object.values(veiculos).map((v) => ({ id: v.id, placa: v.placa, modelo: v.modelo, dono: clientes[v.clienteId]?.nome === SEM_NOME ? '' : (clientes[v.clienteId]?.nome ?? '') })),
      clientes: Object.values(clientes).map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone })),
      anoMaximo: Number(hoje.slice(0, 4)) + 1
    }),
    [veiculos, clientes, hoje]
  );

  // as vozes das próximas perguntas vão chegando enquanto ele responde
  useEffect(() => {
    if (!prefs.vozGuia) return;
    const ids = lista.slice(indice, indice + 3).map((p) => perguntaDo(p, null, r.tipo).id);
    prepararFrases([...new Set<FraseId>(['repetir', ...ids])]);
  }, [indice, prefs.vozGuia]);

  function cancelarSeguir() {
    if (seguirDepois.current) clearTimeout(seguirDepois.current);
    seguirDepois.current = null;
  }

  function irPara(p: PassoId, base: Rascunho = rRef.current) {
    cancelarSeguir();
    setSub(null);
    setEntendi(null);
    setErro(null);
    setR({ ...base, passo: p });
    window.scrollTo({ top: 0 });
  }

  function validar(x: Rascunho, p: PassoId): string | null {
    switch (p) {
      case 'tipo':
        return x.tipo ? null : 'Escolha ordem de serviço ou orçamento.';
      case 'modalidade':
        if (!x.modalidade) return 'Escolha frio ou pago.';
        if (x.modalidade === 'pago' && !(lerNumero(x.vistoria) ?? 0)) return 'Escreva quanto custa a vistoria.';
        return null;
      case 'carro':
        return x.veiculoId || x.carroNovo?.modelo.trim() ? null : 'Escolha o carro ou escreva o modelo do carro novo.';
      case 'placa': {
        if (x.semPlaca) return null;
        if (!placaValida(x.placa)) return 'Placa no formato ABC1D23 ou ABC-1234. Se não souber, toque em Sem placa.';
        return null;
      }
      case 'km': {
        if (x.kmNaoSei) return null;
        const k = lerNumero(x.km);
        return k != null && k > 0 && k < 3_000_000 ? null : 'Escreva os km do painel. Se não souber, toque em Não sei.';
      }
      case 'dono':
        if (x.dono.telefone.trim() && !normalizarTelefone(x.dono.telefone)) return 'Confira o WhatsApp, com DDD.';
        return x.dono.semNome || x.dono.clienteId || x.dono.nome.trim().length >= 2 ? null : 'Escreva o nome do dono, ou toque em Não sei o nome.';
      case 'servicos':
        return x.servicos.length || linhasAvulsas(x).length ? null : 'Marque pelo menos um serviço.';
      default:
        return null;
    }
  }

  function avancar(base: Rascunho = rRef.current) {
    const p = base.passo;
    const e = validar(base, p);
    if (e) {
      setErro(e);
      setR(base);
      return;
    }
    const l = passosDo(base, fixos);
    const i = l.indexOf(p);
    const proximo = l[i + 1];
    if (proximo) irPara(proximo, base);
  }

  function voltar() {
    voz.parar();
    if (sub) {
      setSub(null);
      return;
    }
    if (indice === 0) {
      router.back();
      return;
    }
    irPara(lista[indice - 1]);
  }

  /** Mudança feita na tela: para a voz (ele está tocando, não falando). */
  function mudar(novo: Rascunho) {
    cancelarSeguir();
    voz.parar();
    setErro(null);
    setR(novo);
  }

  // ---------------------------------------------------------------- voz

  function responder(texto: string): boolean {
    const atual = rRef.current;
    const p = atual.passo;
    const op = opcoesRef.current;
    const todas = [...op.principais, ...op.outras];
    const i = interpretar(p, texto, atual, { ...ctxFala, opcoes: todas.map((o) => ({ id: o.chave, texto: o.textoFala })), subpergunta: subRef.current });
    if (i.tipo === 'nada') return false;
    if (i.tipo === 'comando') {
      if (i.comando === 'voltar') voltar();
      else if (i.comando === 'pular' || i.comando === 'continuar') {
        if (subRef.current) {
          setSub(null);
          avancar(atual);
        } else avancar(atual);
      } else if (i.comando === 'parar') salvarPrefs({ vozGuia: false });
      else if (p === 'conferir') {
        if (i.comando === 'sim') void finalizar(atual.tipo === 'orcamento' ? 'enviar' : 'concluir', false);
        else void finalizar(atual.tipo === 'orcamento' ? 'rascunho' : 'aberta', false);
      }
      return true;
    }
    if (i.tipo === 'peca') {
      const o = todas.find((x) => x.chave === i.opcao);
      const sv = servicoDoPasso(p);
      if (!o || !sv) return false;
      const q = i.quantidade ?? linhaDaPeca(atual, sv)?.quantidade ?? escolhaDaOpcao(o, 1).quantidade;
      const novo = definirPeca(atual, sv, escolhaDaOpcao(o, i.quantidade ?? (linhaDaPeca(atual, sv) ? q : padraoDaPeca(sv))));
      setR(novo);
      setEntendi(i.entendi);
      seguirDepois.current = setTimeout(() => avancar(rRef.current), 1100);
      return true;
    }
    setR(i.rascunho);
    rRef.current = i.rascunho;
    setEntendi(i.entendi);
    if (i.perguntar) setSub(i.perguntar);
    // a pergunta extra (vistoria, modelo, WhatsApp) fecha junto com a troca de passo, para a
    // pergunta do passo não ser feita de novo
    else if (i.seguir) seguirDepois.current = setTimeout(() => avancar(rRef.current), 1000);
    return true;
  }

  function padraoDaPeca(sv: ServicoId): number {
    return infoServico(sv).categoria === 'oleo_motor' ? (veiculo?.oleo?.capacidadeL ?? 4) : sv === 'velas' || sv === 'pneus' ? 4 : 1;
  }

  async function escutar(vivo: () => boolean) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const t = await voz.ouvir();
      if (!vivo() || !t) return;
      if (responder(t)) return;
      if (tentativa === 0) {
        await voz.falar('repetir');
        if (!vivo()) return;
      }
    }
  }

  useEffect(() => {
    if (!vozAtiva) return;
    const minha = ++geracao.current;
    const vivo = () => geracao.current === minha;
    const atual = rRef.current;
    // a placa do carro novo já veio na primeira resposta: confirma e segue
    if (atual.passo === 'placa' && !sub && placaValida(atual.placa)) {
      setEntendi(`Placa ${formatarPlaca(atual.placa)}`);
      seguirDepois.current = setTimeout(() => avancar(rRef.current), 900);
      return;
    }
    const q = perguntaDo(atual.passo, sub, atual.tipo);
    void (async () => {
      await voz.falar(q.id, q.id === 'peca_ordem' || q.id === 'peca_orcamento' ? undefined : q.texto);
      if (!vivo()) return;
      await escutar(vivo);
    })();
    return () => {
      geracao.current++;
      voz.parar();
    };
  }, [r.passo, sub, vozAtiva]);

  function ouvirAgora() {
    if (!iniciado) setIniciado(true);
    voz.destravar();
    cancelarSeguir();
    const minha = ++geracao.current;
    void escutar(() => geracao.current === minha);
  }

  function comecar() {
    if (iniciado) return;
    voz.destravar();
    setIniciado(true);
  }

  // ---------------------------------------------------------------- salvar

  function resumoDoCarro(): ResumoDoCarro {
    if (veiculo) return { placa: veiculo.placa, titulo: [veiculo.marca, veiculo.modelo, veiculo.ano].filter(Boolean).join(' '), dono: dono?.nome === SEM_NOME ? 'Cliente sem nome' : (dono?.nome ?? ''), telefone: dono?.telefone ?? '', veiculo };
    const c = r.carroNovo;
    return { placa: placaDoRascunho(r), titulo: [c?.marca, c?.modelo, c?.ano].filter(Boolean).join(' '), dono: r.dono.semNome ? 'Cliente sem nome' : r.dono.nome, telefone: r.dono.telefone, veiculo: undefined };
  }

  /** Cria o cliente e o carro novos (ou acha o carro pela placa) e devolve o id do carro. */
  function garantirCarro(x: Rascunho): Id | null {
    const st = useOficina.getState();
    if (x.veiculoId && st.veiculos[x.veiculoId]) {
      // o WhatsApp escrito na conferência entra no cadastro do cliente
      const c = st.clientes[st.veiculos[x.veiculoId].clienteId];
      const tel = normalizarTelefone(x.dono.telefone);
      if (c && tel && !normalizarTelefone(c.telefone)) st.salvarCliente({ ...c, telefone: tel });
      return x.veiculoId;
    }
    if (!x.carroNovo) return null;
    const placa = placaDoRascunho(x);
    const repetido = placa ? Object.values(st.veiculos).find((v) => v.placa === placa) : undefined;
    if (repetido) return repetido.id;
    const tel = normalizarTelefone(x.dono.telefone) ?? x.dono.telefone.trim();
    const clienteId =
      x.dono.clienteId && st.clientes[x.dono.clienteId]
        ? x.dono.clienteId
        : st.salvarCliente({ nome: x.dono.semNome || !x.dono.nome.trim() ? SEM_NOME : x.dono.nome.trim(), telefone: tel });
    const ano = lerNumero(x.carroNovo.ano);
    return st.salvarVeiculo({ clienteId, placa, marca: x.carroNovo.marca.trim(), modelo: x.carroNovo.modelo.trim(), ano: ano && ano >= 1950 && ano <= 2100 ? Math.round(ano) : null });
  }

  async function finalizar(acao: 'concluir' | 'aberta' | 'enviar' | 'rascunho', comToque = true) {
    if (salvando) return;
    const x = rRef.current;
    if (acao === 'enviar') {
      const tel = normalizarTelefone(x.dono.telefone) ?? normalizarTelefone(dono?.telefone ?? '');
      if (!tel) {
        setErro('Escreva o WhatsApp do cliente para mandar o orçamento, ou toque em Só salvar.');
        return;
      }
    }
    setSalvando(true);
    voz.parar();
    try {
      const veiculoId = garantirCarro(x);
      if (!veiculoId) {
        setErro('Escolha o carro antes de salvar.');
        return;
      }
      const km = x.kmNaoSei ? null : lerNumero(x.km);
      const campos = documentoDoRascunho(x, veiculoId, km != null && km > 0 ? Math.round(km) : null, hoje);
      const st = useOficina.getState();
      const anterior = x.editandoId ? st.documentos[x.editandoId] : undefined;
      const situacao = campos.tipo === 'ordem' ? (anterior?.situacao === 'concluida' ? 'concluida' : 'aberta') : anterior && anterior.situacao !== 'rascunho' ? anterior.situacao : 'rascunho';
      const id = st.salvarDocumento({ ...campos, ...(anterior ? { id: anterior.id, data: anterior.data } : {}), situacao });
      guardar(null);
      if (acao === 'concluir') {
        const c = concluir(id, hoje);
        if (c.erro) {
          setErro(c.erro);
          return;
        }
        setResultado({ tipo: 'concluida', documentoId: id, atendimentoId: c.atendimentoId, veiculoId });
        void voz.falar('pronto_ordem');
      } else if (acao === 'aberta') {
        setResultado({ tipo: 'aberta', documentoId: id, veiculoId });
      } else if (acao === 'enviar') {
        st.marcarEnviado(id);
        const l = linkDoOrcamento(id);
        if (l?.whatsapp && comToque) window.open(l.whatsapp, '_blank', 'noopener,noreferrer');
        setResultado({ tipo: 'orcamento', documentoId: id, veiculoId, enviado: comToque && !!l?.whatsapp });
      } else setResultado({ tipo: 'orcamento', documentoId: id, veiculoId, enviado: false });
      window.scrollTo({ top: 0 });
    } finally {
      setSalvando(false);
    }
  }

  function descartar() {
    if (temConteudo(r) && !window.confirm('Sair e jogar fora o que foi preenchido?')) return;
    voz.parar();
    guardar(null);
    router.push('/oficina/ordens');
  }

  function recomecar() {
    guardar(null);
    setResultado(null);
    setRetomar(null);
    const novo = rascunhoVazio(new Date().toISOString(), prefs.validadeOrcamento);
    setR({ ...novo, passo: passosDo(novo)[0] });
    router.replace('/oficina/nova');
  }

  if (resultado) return <Final resultado={resultado} aoNova={recomecar} />;

  const pergunta = tituloDo(passo, sub, r);
  const doc = r.editandoId ? documentos[r.editandoId] : undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5" onPointerDownCapture={comecar}>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={voltar} className="-ml-2 inline-flex h-10 items-center gap-1 rounded-[10px] px-2 text-[14.5px] font-semibold text-tinta-2 hover:bg-papel-2 hover:text-tinta">
            <ArrowLeft size={18} aria-hidden="true" /> Voltar
          </button>
          <p className="text-[13.5px] font-semibold text-tinta-3">
            {doc ? `Editando ${tituloDoDocumento(doc).toLowerCase()}, ` : ''}
            {indice + 1} de {lista.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                voz.destravar();
                setIniciado(true);
                salvarPrefs({ vozGuia: !prefs.vozGuia });
              }}
              aria-pressed={prefs.vozGuia}
              className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold ${prefs.vozGuia ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta-2'}`}
            >
              {prefs.vozGuia ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />} Voz
            </button>
            <button type="button" onClick={descartar} className="grid h-10 w-10 place-items-center rounded-full text-tinta-2 hover:bg-papel-2" aria-label="Sair">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {lista.map((p, i) => (
            <span key={p} className={`h-1.5 flex-1 rounded-full ${i < indice ? 'bg-tinta' : i === indice ? 'bg-oleo' : 'bg-linha'}`} />
          ))}
        </div>
      </header>

      {retomar && passo === lista[0] ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-caneta-claro px-4 py-3 text-caneta">
          <p className="min-w-0 flex-1 text-[14.5px] font-semibold">
            {retomar.tipo === 'orcamento' ? 'Um orçamento' : 'Uma ordem'} ficou pela metade{retomar.criadoEm ? ` (${formatarData(retomar.criadoEm.slice(0, 10))})` : ''}.
          </p>
          <Botao
            tamanho="pequeno"
            variante="escuro"
            onClick={() => {
              setR(retomar);
              setRetomar(null);
            }}
          >
            Continuar
          </Botao>
          <Botao
            tamanho="pequeno"
            variante="fantasma"
            onClick={() => {
              guardar(null);
              setRetomar(null);
            }}
          >
            Começar outra
          </Botao>
        </div>
      ) : null}

      {passo !== 'tipo' && passo !== 'carro' && (veiculo || r.carroNovo) ? <ChipDoCarro carro={resumoDoCarro()} km={r.kmNaoSei ? null : lerNumero(r.km)} passo={passo} /> : null}

      <section className="flex flex-col gap-4" aria-labelledby="pergunta">
        <div className="flex items-start gap-3">
          <h1 id="pergunta" className="largo min-w-0 flex-1 text-[26px] leading-tight sm:text-[30px]">
            {pergunta}
          </h1>
          {voz.podeOuvir ? <BotaoOuvir estado={voz.estado} aoOuvir={ouvirAgora} aoParar={voz.parar} /> : null}
        </div>
        <Escuta estado={voz.estado} parcial={voz.parcial} entendi={entendi} erro={voz.erro} />

        {passo === 'tipo' ? (
          <PassoTipo r={r} aoEscolher={(t) => avancar({ ...r, tipo: t, modalidade: t === 'orcamento' ? r.modalidade : null })} />
        ) : passo === 'modalidade' ? (
          <PassoModalidade r={r} aoMudar={mudar} />
        ) : passo === 'carro' ? (
          sub === 'modelo' || r.carroNovo ? (
            <CarroNovo r={r} aoMudar={mudar} aoBuscar={() => mudar({ ...r, carroNovo: null, placa: '' })} />
          ) : (
            <PassoCarro hoje={hoje} aoEscolher={(id) => avancar({ ...r, veiculoId: id, carroNovo: null })} aoNovo={(texto) => mudar({ ...r, veiculoId: null, carroNovo: carroDoTexto(texto, hoje) })} />
          )
        ) : passo === 'placa' ? (
          <PassoPlaca r={r} aoMudar={mudar} aoUsarCarro={(id) => avancar({ ...r, veiculoId: id, carroNovo: null, passo: 'carro' })} />
        ) : passo === 'km' ? (
          <PassoKm r={r} aoMudar={mudar} ultimo={veiculo ? ultimoKm(veiculo.id, atendimentos, leituras) : null} />
        ) : passo === 'dono' ? (
          <PassoDono r={r} aoMudar={mudar} pedirTelefone={sub === 'telefone'} />
        ) : passo === 'servicos' ? (
          <PassoServicos r={r} aoMudar={mudar} hoje={hoje} veiculoTexto={resumoDoCarro().titulo} donoTexto={resumoDoCarro().dono} kmAnterior={veiculo ? ultimoKm(veiculo.id, atendimentos, leituras)?.km ?? null : null} oficina={oficina.nome} podeDitar={plano.podeDitar} aoPro={() => ofertaPro('ordens')} aoEntendi={setEntendi} aoAvancar={avancar} />
        ) : s ? (
          <EscolhaDePeca
            s={s}
            veiculo={veiculo}
            tipo={r.tipo ?? 'ordem'}
            opcoes={opcoes}
            linha={linhaDaPeca(r, s)}
            aoEscolher={(e) => mudar(definirPeca(r, s, e))}
            aoMudarLinha={(m) => {
              const l = linhaDaPeca(r, s);
              if (l) mudar(mudarLinha(r, l.id, m));
            }}
          />
        ) : passo === 'valores' ? (
          <Valores r={r} aoMudar={mudar} />
        ) : (
          <Conferir r={r} carro={resumoDoCarro()} hoje={hoje} aoMudar={mudar} aoEditar={(p) => irPara(p)} />
        )}

        {erro ? (
          <p className="rounded-xl bg-atraso-claro px-4 py-2.5 text-[14.5px] text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
      </section>

      {passo === 'tipo' ? null : (
        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-linha bg-fundo/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border lg:bottom-4">
          {passo === 'conferir' ? (
            r.tipo === 'orcamento' ? (
              <div className="flex flex-wrap-reverse items-center justify-end gap-2">
                <Botao variante="fantasma" onClick={() => void finalizar('rascunho')} disabled={salvando}>
                  Só salvar
                </Botao>
                <Botao variante="whatsapp" tamanho="grande" onClick={() => void finalizar('enviar')} disabled={salvando}>
                  Mandar para o cliente
                </Botao>
              </div>
            ) : (
              <div className="flex flex-wrap-reverse items-center justify-end gap-2">
                {doc?.situacao === 'concluida' ? null : (
                  <Botao variante="secundario" onClick={() => void finalizar('aberta')} disabled={salvando}>
                    Ainda em andamento
                  </Botao>
                )}
                <Botao variante="primario" tamanho="grande" onClick={() => void finalizar(doc?.situacao === 'concluida' ? 'aberta' : 'concluir')} disabled={salvando}>
                  <Check size={19} aria-hidden="true" /> {doc?.situacao === 'concluida' ? 'Salvar' : 'Serviço pronto, registrar'}
                </Botao>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[14px] text-tinta-2">{rodapeDo(passo, r)}</p>
              <Botao variante="primario" tamanho="grande" onClick={() => (sub ? (setSub(null), avancar()) : avancar())}>
                {s && !linhaDaPeca(r, s) ? 'Pular' : 'Continuar'}
              </Botao>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function rodapeDo(passo: PassoId, r: Rascunho): string {
  if (passo === 'servicos') {
    const n = r.servicos.length + linhasAvulsas(r).length;
    return n === 0 ? 'Nenhum serviço marcado' : n === 1 ? '1 serviço' : `${n} serviços`;
  }
  return '';
}

function carroDoTexto(texto: string, hoje: string): Rascunho['carroNovo'] {
  const m = texto.trim() ? modeloFalado(texto, Number(hoje.slice(0, 4)) + 1) : null;
  return { marca: m?.marca ?? '', modelo: m?.modelo ?? texto.trim(), ano: m?.ano ? String(m.ano) : '' };
}

function ultimoKm(veiculoId: Id, atendimentos: Record<Id, { veiculoId: Id; data: string; km: number }>, leituras: Record<Id, { veiculoId: Id; data: string; km: number }>) {
  const pontos = pontosDoVeiculo(veiculoId, Object.values(atendimentos) as never, Object.values(leituras) as never);
  return pontos[pontos.length - 1] ?? null;
}

// ---------------------------------------------------------------- peças da tela

function BotaoOuvir({ estado, aoOuvir, aoParar }: { estado: ReturnType<typeof useVoz>['estado']; aoOuvir: () => void; aoParar: () => void }) {
  const ouvindo = estado === 'ouvindo';
  return (
    <button
      type="button"
      onClick={ouvindo ? aoParar : aoOuvir}
      aria-label={ouvindo ? 'Parar de ouvir' : 'Responder falando'}
      className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-etiqueta transition-colors ${ouvindo ? 'bg-atraso text-white' : 'bg-oleo text-[#1b1f22]'}`}
    >
      {ouvindo ? <span aria-hidden="true" className="anel-serrilhado anel-girando absolute -inset-1.5 text-atraso/50" /> : null}
      {ouvindo ? <Square size={20} fill="currentColor" strokeWidth={0} /> : <Mic size={24} />}
    </button>
  );
}

function Escuta({ estado, parcial, entendi, erro }: { estado: ReturnType<typeof useVoz>['estado']; parcial: string; entendi: string | null; erro: string | null }) {
  if (erro)
    return (
      <p className="flex items-center gap-2 text-[14px] text-atraso" role="alert">
        <MicOff size={16} aria-hidden="true" /> {erro}
      </p>
    );
  if (estado === 'falando') return <Ondas texto="Falando…" />;
  if (estado === 'ouvindo') return <p className="min-h-6 text-[15px] text-tinta-2" aria-live="polite">{parcial ? `“${parcial}”` : 'Pode falar…'}</p>;
  if (estado === 'pensando') return <p className="text-[15px] text-tinta-2">Entendendo…</p>;
  if (entendi)
    return (
      <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-ok-claro px-3 py-1 text-[14px] font-semibold text-ok" aria-live="polite">
        <Check size={15} aria-hidden="true" /> {entendi}
      </p>
    );
  return null;
}

function Ondas({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 text-[14px] text-tinta-3">
      <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="onda w-1 rounded-full bg-oleo" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </span>
      {texto}
    </p>
  );
}

function ChipDoCarro({ carro, km, passo }: { carro: ResumoDoCarro; km: number | null; passo: PassoId }) {
  if (passo === 'conferir') return null;
  return (
    <div className="flex max-w-full items-center gap-2.5 self-start rounded-full bg-papel py-1.5 pr-3.5 pl-2 ring-1 ring-linha">
      {carro.placa ? <Placa placa={carro.placa} /> : <Car size={18} className="ml-1 text-tinta-3" aria-hidden="true" />}
      <span className="min-w-0 truncate text-[14px] font-semibold">{[carro.titulo, carro.dono, km ? formatarKm(km) : ''].filter(Boolean).join(', ')}</span>
    </div>
  );
}

function CartaoGrande({ titulo, texto, Icone, aoEscolher, marcado = false }: { titulo: string; texto: string; Icone: typeof FileText; aoEscolher: () => void; marcado?: boolean }) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={marcado}
      className={`flex items-center gap-4 rounded-2xl bg-papel px-5 py-5 text-left transition-[box-shadow] active:scale-[0.99] ${marcado ? 'ring-3 ring-tinta' : 'ring-1 ring-linha hover:ring-tinta-3'}`}
    >
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${marcado ? 'bg-tinta text-oleo' : 'bg-oleo-claro text-oleo-tinta'}`}>
        <Icone size={26} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="largo block text-[20px] font-extrabold">{titulo}</span>
        <span className="block text-[14.5px] text-tinta-2">{texto}</span>
      </span>
    </button>
  );
}

function PassoTipo({ r, aoEscolher }: { r: Rascunho; aoEscolher: (t: TipoDocumento) => void }) {
  return (
    <div className="grid gap-3">
      <CartaoGrande titulo="Ordem de serviço" texto="O serviço já foi feito ou está sendo feito." Icone={ClipboardList} marcado={r.tipo === 'ordem'} aoEscolher={() => aoEscolher('ordem')} />
      <CartaoGrande titulo="Orçamento" texto="Depois da vistoria, para o cliente aprovar antes." Icone={FileText} marcado={r.tipo === 'orcamento'} aoEscolher={() => aoEscolher('orcamento')} />
    </div>
  );
}

function PassoModalidade({ r, aoMudar }: { r: Rascunho; aoMudar: (r: Rascunho) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <CartaoGrande titulo="Frio" texto="Sem custo para o cliente." Icone={FileText} marcado={r.modalidade === 'frio'} aoEscolher={() => aoMudar({ ...r, modalidade: 'frio' })} />
      <CartaoGrande titulo="Pago" texto="A vistoria é cobrada. Dá para abater do serviço se ele aprovar." Icone={FileText} marcado={r.modalidade === 'pago'} aoEscolher={() => aoMudar({ ...r, modalidade: 'pago' })} />
      {r.modalidade === 'pago' ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha">
          <Campo rotulo="Valor da vistoria" htmlFor="m-vistoria">
            <span className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3">R$</span>
              <input id="m-vistoria" className={`${classeEntrada} num h-12 max-w-44 pl-10 text-[20px] font-bold`} value={r.vistoria} onChange={(e) => aoMudar({ ...r, vistoria: e.target.value })} inputMode="decimal" placeholder="0,00" autoComplete="off" autoFocus />
            </span>
          </Campo>
          <Alternar id="m-abater" ligado={r.abater} aoMudar={(v) => aoMudar({ ...r, abater: v })} rotulo="Abater do serviço se o cliente aprovar" descricao="A vistoria paga sai do total da ordem de serviço." />
        </div>
      ) : null}
    </div>
  );
}

function PassoCarro({ hoje, aoEscolher, aoNovo }: { hoje: string; aoEscolher: (id: Id) => void; aoNovo: (texto: string) => void }) {
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const atendimentos = useOficina((s) => s.atendimentos);
  const documentos = useOficina((s) => s.documentos);
  const [busca, setBusca] = useState('');
  const t = busca.trim().toLowerCase();
  const placa = normalizarPlaca(t);

  const recentes = useMemo(() => {
    const quando = new Map<Id, string>();
    for (const a of Object.values(atendimentos)) if (a.data > (quando.get(a.veiculoId) ?? '')) quando.set(a.veiculoId, a.data);
    for (const d of Object.values(documentos)) if (d.veiculoId && d.data > (quando.get(d.veiculoId) ?? '')) quando.set(d.veiculoId, d.data);
    return Object.values(veiculos)
      .sort((a, b) => ((quando.get(b.id) ?? b.criadoEm.slice(0, 10)) > (quando.get(a.id) ?? a.criadoEm.slice(0, 10)) ? 1 : -1))
      .slice(0, 6);
  }, [veiculos, atendimentos, documentos]);

  const achados =
    t.length < 2
      ? recentes
      : Object.values(veiculos)
          .filter((v) => (placa.length >= 2 && v.placa.includes(placa)) || (clientes[v.clienteId]?.nome.toLowerCase().includes(t) ?? false) || v.modelo.toLowerCase().includes(t))
          .slice(0, 8);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={19} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
        <input className={`${classeEntrada} h-13 pl-11 text-[17px]`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Placa, modelo ou nome do dono" aria-label="Buscar carro" autoComplete="off" />
      </div>
      {achados.length ? (
        <>
          {t.length < 2 ? <p className="text-[13.5px] font-semibold text-tinta-3">Os últimos que passaram aqui</p> : null}
          <ul className="grid gap-2 sm:grid-cols-2">
            {achados.map((v) => {
              const c = clientes[v.clienteId];
              return (
                <li key={v.id}>
                  <button type="button" onClick={() => aoEscolher(v.id)} className="flex w-full items-center gap-3 rounded-2xl bg-papel px-3.5 py-3 text-left ring-1 ring-linha hover:ring-tinta-3">
                    {v.placa ? <Placa placa={v.placa} /> : <Car size={20} className="text-tinta-3" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{[v.modelo, v.ano].filter(Boolean).join(' ')}</span>
                      <span className="block truncate text-[13.5px] text-tinta-2">{c?.nome === SEM_NOME ? 'Cliente sem nome' : c?.nome}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : t.length >= 2 ? (
        <p className="text-[14.5px] text-tinta-2">Nenhum carro com esse nome ou placa.</p>
      ) : null}
      <button type="button" onClick={() => aoNovo(placaValida(busca) ? '' : busca)} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-linha px-4 py-3.5 text-left hover:border-tinta-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-oleo-claro text-oleo-tinta">
          <Car size={22} aria-hidden="true" />
        </span>
        <span>
          <span className="block font-bold">Carro novo</span>
          <span className="block text-[13.5px] text-tinta-2">{t.length >= 2 && !placaValida(busca) ? `Cadastrar “${busca.trim()}”` : 'Ainda não passou aqui'}</span>
        </span>
      </button>
    </div>
  );
}

function CarroNovo({ r, aoMudar, aoBuscar }: { r: Rascunho; aoMudar: (r: Rascunho) => void; aoBuscar: () => void }) {
  const c = r.carroNovo ?? { marca: '', modelo: '', ano: '' };
  const set = (m: Partial<typeof c>) => aoMudar({ ...r, veiculoId: null, carroNovo: { ...c, ...m } });
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha">
      {r.placa ? (
        <p className="flex items-center gap-2 text-[14px] text-tinta-2">
          <Placa placa={r.placa} /> carro novo
        </p>
      ) : null}
      <Campo rotulo="Modelo" htmlFor="n-modelo" dica="Ex.: Onix 1.0, HB20, Strada.">
        <input
          id="n-modelo"
          className={`${classeEntrada} h-12 text-[18px]`}
          value={c.modelo}
          onChange={(e) => set({ modelo: e.target.value })}
          onBlur={() => {
            const m = c.modelo.trim() ? modeloFalado(c.modelo) : null;
            if (m && (!c.marca || !c.ano)) set({ marca: c.marca || m.marca, ano: c.ano || (m.ano ? String(m.ano) : ''), modelo: m.modelo || c.modelo });
          }}
          autoComplete="off"
          autoFocus
        />
      </Campo>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Campo rotulo="Marca" htmlFor="n-marca">
          <input id="n-marca" className={classeEntrada} value={c.marca} onChange={(e) => set({ marca: e.target.value })} list="n-marcas" autoComplete="off" />
          <datalist id="n-marcas">
            {MARCAS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Ano" htmlFor="n-ano">
          <input id="n-ano" className={`${classeEntrada} num`} value={c.ano} onChange={(e) => set({ ano: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" placeholder="2020" />
        </Campo>
      </div>
      <button type="button" onClick={aoBuscar} className="self-start text-[14px] font-semibold text-caneta hover:underline">
        Buscar um carro já cadastrado
      </button>
    </div>
  );
}

function PassoPlaca({ r, aoMudar, aoUsarCarro }: { r: Rascunho; aoMudar: (r: Rascunho) => void; aoUsarCarro: (id: Id) => void }) {
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const placa = normalizarPlaca(r.placa);
  const repetido = placaValida(placa) ? Object.values(veiculos).find((v) => v.placa === placa) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <label className="sr-only" htmlFor="p-placa">
        Placa
      </label>
      <div className="self-start overflow-hidden rounded-xl border-[3px] border-[#1b1f22] bg-white shadow-etiqueta">
        <div className="h-3 bg-placa" />
        <input
          id="p-placa"
          className="largo num w-[min(78vw,320px)] bg-white px-4 py-2 text-center text-[40px] font-extrabold tracking-[0.08em] text-[#1b1f22] uppercase outline-none placeholder:text-[#1b1f22]/25"
          value={r.placa}
          onChange={(e) => aoMudar({ ...r, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8), semPlaca: false })}
          placeholder="ABC1D23"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
        />
      </div>
      {repetido ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-caneta-claro px-4 py-3 text-caneta">
          <p className="min-w-0 flex-1 text-[14.5px]">
            Essa placa já está cadastrada: {repetido.modelo}, de {clientes[repetido.clienteId]?.nome}.
          </p>
          <Botao tamanho="pequeno" variante="escuro" onClick={() => aoUsarCarro(repetido.id)}>
            Usar esse carro
          </Botao>
        </div>
      ) : null}
      <button type="button" onClick={() => aoMudar({ ...r, placa: '', semPlaca: !r.semPlaca })} aria-pressed={r.semPlaca} className={`self-start rounded-full px-4 py-2 text-[14.5px] font-semibold ${r.semPlaca ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta-2'}`}>
        Sem placa ou não sei
      </button>
    </div>
  );
}

function PassoKm({ r, aoMudar, ultimo }: { r: Rascunho; aoMudar: (r: Rascunho) => void; ultimo: { data: string; km: number } | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <input
          className="largo num h-16 w-[min(70vw,280px)] rounded-xl border border-linha bg-papel px-4 text-[34px] font-extrabold outline-none focus:border-caneta focus:ring-3 focus:ring-caneta/20 disabled:opacity-45"
          value={r.km}
          onChange={(e) => aoMudar({ ...r, km: e.target.value.replace(/[^\d.]/g, '').slice(0, 9), kmNaoSei: false })}
          inputMode="numeric"
          placeholder="45.000"
          aria-label="Quilometragem"
          autoComplete="off"
          disabled={r.kmNaoSei}
          autoFocus
        />
        <span className="text-[20px] font-bold text-tinta-3">km</span>
      </div>
      {ultimo ? (
        <p className="text-[14px] text-tinta-3">
          Último registro: {formatarKm(ultimo.km)} em {formatarData(ultimo.data)}.
        </p>
      ) : null}
      <button type="button" onClick={() => aoMudar({ ...r, km: '', kmNaoSei: !r.kmNaoSei })} aria-pressed={r.kmNaoSei} className={`self-start rounded-full px-4 py-2 text-[14.5px] font-semibold ${r.kmNaoSei ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta-2'}`}>
        Não sei a quilometragem
      </button>
      {r.kmNaoSei ? <p className="text-[13.5px] text-tinta-3">Sem a quilometragem, a próxima troca é avisada só pela data.</p> : null}
    </div>
  );
}

function PassoDono({ r, aoMudar, pedirTelefone }: { r: Rascunho; aoMudar: (r: Rascunho) => void; pedirTelefone: boolean }) {
  const clientes = useOficina((s) => s.clientes);
  const t = r.dono.nome.trim().toLowerCase();
  const sugeridos = !r.dono.clienteId && t.length >= 2 ? Object.values(clientes).filter((c) => c.nome !== SEM_NOME && c.nome.toLowerCase().includes(t)).slice(0, 4) : [];
  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Nome" htmlFor="d-nome">
        <input
          id="d-nome"
          className={`${classeEntrada} h-12 text-[18px]`}
          value={r.dono.semNome ? '' : r.dono.nome}
          onChange={(e) => aoMudar({ ...r, dono: { ...r.dono, clienteId: null, nome: e.target.value, semNome: false } })}
          placeholder={r.dono.semNome ? 'Cliente sem nome' : ''}
          autoComplete="off"
          autoFocus={!pedirTelefone}
        />
      </Campo>
      {sugeridos.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Clientes já cadastrados">
          {sugeridos.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => aoMudar({ ...r, dono: { clienteId: c.id, nome: c.nome, telefone: c.telefone, semNome: false } })} className="inline-flex items-center gap-1.5 rounded-full bg-papel px-3 py-1.5 text-[14px] font-semibold ring-1 ring-linha hover:ring-tinta-3">
                <UserRound size={15} aria-hidden="true" /> {c.nome}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {r.dono.clienteId ? <p className="text-[14px] text-ok">Cliente já cadastrado. O carro novo entra na ficha dele.</p> : null}
      <Campo rotulo="WhatsApp" htmlFor="d-tel" dica="Opcional, mas é por ele que saem os avisos e o orçamento.">
        <input id="d-tel" className={classeEntrada} value={r.dono.telefone} onChange={(e) => aoMudar({ ...r, dono: { ...r.dono, telefone: e.target.value } })} inputMode="tel" placeholder="(21) 98765-4321" autoComplete="off" autoFocus={pedirTelefone} />
      </Campo>
      <button
        type="button"
        onClick={() => aoMudar({ ...r, dono: { ...r.dono, clienteId: null, nome: '', semNome: !r.dono.semNome } })}
        aria-pressed={r.dono.semNome}
        className={`self-start rounded-full px-4 py-2 text-[14.5px] font-semibold ${r.dono.semNome ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta-2'}`}
      >
        Não sei o nome
      </button>
    </div>
  );
}

function PassoServicos({
  r,
  aoMudar,
  hoje,
  veiculoTexto,
  donoTexto,
  kmAnterior,
  oficina,
  podeDitar,
  aoPro,
  aoEntendi,
  aoAvancar
}: {
  r: Rascunho;
  aoMudar: (r: Rascunho) => void;
  hoje: string;
  veiculoTexto: string;
  donoTexto: string;
  kmAnterior: number | null;
  oficina: string;
  podeDitar: boolean;
  aoPro: () => void;
  aoEntendi: (t: string) => void;
  aoAvancar: (r: Rascunho) => void;
}) {
  const [todos, setTodos] = useState(false);
  const [outro, setOutro] = useState('');
  const [ia, setIa] = useState<'ouvindo' | 'preenchendo' | null>(null);
  const [erroIa, setErroIa] = useState<string | null>(null);
  const contarMontagem = useOficina((s) => s.contarMontagem);
  const plano = usePlano();
  const atualizarUso = useAtualizarUso();
  // falar de novo no mesmo documento não gasta outra ordem da cota (até 5 vezes)
  const sessaoVoz = useRef(novoId());
  const rRef = useRef(r);
  rRef.current = r;
  const lista = todos ? SERVICOS.map((x) => x.id) : [...new Set([...SERVICOS_RAPIDOS, ...r.servicos])];

  const gravador = useGravador((clipe) => void preencher(clipe.blob));

  async function preencher(blob: Blob) {
    setErroIa(null);
    setIa('ouvindo');
    try {
      const dados = new FormData();
      dados.append('audio', new File([blob], `relato-${novoId()}.webm`, { type: blob.type || 'audio/webm' }));
      const texto = await transcreverAudio(dados);
      if (!texto.ok) {
        setErroIa(texto.erro);
        if ('semConta' in texto && texto.semConta) aoPro();
        if ('semCota' in texto && texto.semCota) atualizarUso();
        return;
      }
      atualizarUso();
      setIa('preenchendo');
      const contexto = { oficina, hoje, carro: veiculoTexto || null, cliente: donoTexto || null, kmAnterior, transcricao: texto.texto, anotacao: null };
      const f = new FormData();
      f.append('contexto', JSON.stringify(contexto));
      f.append('sessao', sessaoVoz.current);
      const o = await montarOrdemComIA(f);
      if (!o.ok) {
        setErroIa(o.erro);
        if (o.semConta) aoPro();
        if (o.semCota) {
          atualizarUso();
          if (!plano.liberado) aoPro();
        }
        return;
      }
      atualizarUso();
      // cópia no aparelho; quem conta de verdade é o banco
      contarMontagem(hoje);
      let novo = incluirServicos(rRef.current, o.ordem.servicos.map((x) => x.servico));
      // o produto que ele falou vira a peça quando der para reconhecer depois, no passo da peça
      for (const x of o.ordem.servicos) {
        if (!x.produto || !infoServico(x.servico).categoria || linhaDaPeca(novo, x.servico)) continue;
        novo = definirPeca(novo, x.servico, { descricao: x.produto, quantidade: infoServico(x.servico).categoria === 'oleo_motor' ? 4 : 1, unidade: infoServico(x.servico).categoria === 'oleo_motor' ? 'L' : 'un', valorUnitario: null, produto: { nome: x.produto, categoria: infoServico(x.servico).categoria ?? undefined } });
      }
      novo = {
        ...novo,
        relato: [novo.relato, texto.texto].filter(Boolean).join('\n\n'),
        diagnostico: novo.diagnostico || o.ordem.diagnostico || '',
        recomendacoes: o.ordem.recomendacoes.length ? o.ordem.recomendacoes.map((x) => ({ texto: x.texto, urgencia: x.urgencia })) : novo.recomendacoes
      };
      aoMudar(novo);
      aoEntendi(o.ordem.servicos.length ? `${o.ordem.servicos.length} ${o.ordem.servicos.length === 1 ? 'serviço' : 'serviços'} entendidos` : 'Nenhum serviço reconhecido');
      if (o.ordem.servicos.length) aoAvancar(novo);
    } catch {
      setErroIa('Sem internet para a IA agora. Marque os serviços tocando.');
    } finally {
      setIa(null);
    }
  }

  function incluirOutro() {
    if (outro.trim().length < 2) return;
    // se o texto for um serviço conhecido, marca o serviço
    const conhecido = escolherPorFala(outro, SERVICOS.map((x) => ({ id: x.id, texto: x.nome })));
    if (conhecido && !r.servicos.includes(conhecido.id as ServicoId)) aoMudar(alternarServico(r, conhecido.id as ServicoId));
    else aoMudar(incluirAvulsa(r, outro, null));
    setOutro('');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-2xl bg-tinta px-4 py-3.5 text-papel sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-bold">Contar tudo falando</p>
          <p className="text-[13.5px] text-papel/75">{ia === 'ouvindo' ? 'Passando o áudio para texto…' : ia === 'preenchendo' ? 'A IA está marcando os serviços…' : gravador.gravando ? 'Fale o que fez e toque para terminar.' : 'A IA marca os serviços e as peças que você falar.'}</p>
        </div>
        {gravador.gravando ? (
          <button type="button" onClick={gravador.parar} className="inline-flex h-11 items-center gap-2 self-start rounded-[10px] bg-atraso px-4 font-semibold text-white">
            <Square size={16} fill="currentColor" strokeWidth={0} /> Terminar
          </button>
        ) : (
          <button
            type="button"
            disabled={ia != null}
            onClick={() => {
              if (!podeDitar) {
                // no Pro, o limite é o uso justo do mês: só avisa
                if (plano.liberado && !plano.semConta) return setErroIa(mensagemDaCota('montagem', { plano: plano.tipo, limite: plano.limiteOrdens }));
                return aoPro();
              }
              void gravador.comecar();
            }}
            className="inline-flex h-11 items-center gap-2 self-start rounded-[10px] bg-oleo px-4 font-semibold text-[#1b1f22] disabled:opacity-60"
          >
            <Sparkles size={17} aria-hidden="true" /> {ia ? 'Preenchendo…' : 'Falar'}
          </button>
        )}
      </div>
      {erroIa || gravador.erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erroIa ?? gravador.erro}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {lista.map((sv) => {
          const sel = r.servicos.includes(sv);
          return (
            <button
              key={sv}
              type="button"
              aria-pressed={sel}
              onClick={() => aoMudar(alternarServico(r, sv))}
              className={`flex min-h-[64px] items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left text-[15px] leading-tight font-semibold transition-colors ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel hover:border-tinta-3'}`}
            >
              <IconeServico servico={sv} size={22} className={sel ? 'text-oleo' : 'text-tinta-3'} />
              <span className="min-w-0 flex-1">{infoServico(sv).nome}</span>
              {sel ? <Check size={17} className="shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => setTodos((v) => !v)} className="self-start text-[14.5px] font-semibold text-caneta hover:underline">
        {todos ? 'Mostrar só os mais comuns' : `Ver todos os ${SERVICOS.length} serviços`}
      </button>

      {linhasAvulsas(r).length ? (
        <ul className="flex flex-wrap gap-2">
          {linhasAvulsas(r).map((l) => (
            <li key={l.id} className="inline-flex items-center gap-1 rounded-full bg-papel py-1 pr-1 pl-3 text-[14px] font-semibold ring-1 ring-linha">
              {l.descricao}
              <button type="button" onClick={() => aoMudar(tirarLinha(r, l.id))} className="grid h-7 w-7 place-items-center rounded-full text-tinta-3 hover:bg-papel-2" aria-label={`Tirar ${l.descricao}`}>
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input className={classeEntrada} value={outro} onChange={(e) => setOutro(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && incluirOutro()} placeholder="Outro serviço (ex.: troca da bomba d'água)" aria-label="Outro serviço" maxLength={160} />
        <Botao onClick={incluirOutro} disabled={outro.trim().length < 2}>
          Incluir
        </Botao>
      </div>
    </div>
  );
}

