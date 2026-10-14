'use client';

import { ArrowLeft, Check, MessageCircle, Printer, Search, TriangleAlert, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { IconeServico } from '@/components/icones';
import { EtiquetaTroca, Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { calcularVencimento, estimarRodagem, pontosDoVeiculo } from '@/lib/agenda';
import { nomeCategoria, type Produto } from '@/lib/catalogo';
import type { ProdutoComPrazo } from '@/lib/manutencao';
import {
  NOMES_TIPO_INTERVALO,
  nomeDaReferencia,
  origemDaReferencia,
  prazoDaReferencia,
  referenciasDaCategoria,
  textoDoPrazo,
  type ProdutoProprio,
  type Referencia
} from '@/lib/referencias';
import { dataValida, diasEntre, formatarData, formatarDataCurta } from '@/lib/datas';
import { formatarKm, formatarMoeda, formatarPlaca, lerNumero, normalizarPlaca } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { SERVICOS, SERVICOS_RAPIDOS, intervaloSugerido, rotuloIntervalo, servico, servicoExiste, usaUsoSevero } from '@/lib/manutencao';
import { exigenciaDoCarro, oleoAtende } from '@/lib/oleos';
import { recomendarParaItem } from '@/lib/recomendacao';
import { useOficina } from '@/lib/store';
import type { ItemServico, ServicoId, Veiculo } from '@/lib/tipos';
import { useCartaoDoCarro } from './acoes';
import { useCatalogo } from './catalogo';
import { useReferencias } from './referencias';
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

interface Detalhe {
  /** O que foi escolhido na lista: 'loja:12', 'ref:3', 'meu:<id>', 'outro' ou '' (não anotar). */
  escolha: string;
  produtoTexto: string;
  /** Guardar o produto escrito em "Seus produtos", com o prazo deste registro. */
  guardar: boolean;
  km: string;
  meses: string;
  origem: string;
  editado: boolean;
}

const OUTRO = 'outro';

type Escolhido =
  | { tipo: 'loja'; produto: Produto }
  | { tipo: 'ref'; referencia: Referencia }
  | { tipo: 'meu'; proprio: ProdutoProprio }
  | { tipo: 'outro' }
  | null;

export function Registrar() {
  const params = useSearchParams();
  const router = useRouter();
  const hoje = useHoje();
  const toast = useToast();
  const { catalogo, produto: acharProduto } = useCatalogo();
  const { referencias } = useReferencias();
  const proprios = useOficina((s) => s.produtosProprios);
  const salvarProprio = useOficina((s) => s.salvarProdutoProprio);
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const atendimentos = useOficina((s) => s.atendimentos);
  const leituras = useOficina((s) => s.leituras);
  const prefs = useOficina((s) => s.preferencias);
  const salvarCliente = useOficina((s) => s.salvarCliente);
  const salvarVeiculo = useOficina((s) => s.salvarVeiculo);
  const registrarAtendimento = useOficina((s) => s.registrarAtendimento);

  const inicial = params.get('carro');
  const [veiculoId, setVeiculoId] = useState<string | null>(inicial && veiculos[inicial] ? inicial : null);
  const [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState('');
  const [rCliente, setRCliente] = useState<RascunhoCliente>(CLIENTE_VAZIO);
  const [rCarro, setRCarro] = useState<RascunhoVeiculo>(VEICULO_VAZIO);
  const [data, setData] = useState(hoje);
  const [km, setKm] = useState('');
  const [severo, setSevero] = useState<boolean | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [valor, setValor] = useState('');
  const [obs, setObs] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [feito, setFeito] = useState<{ atendimentoId: string; veiculoId: string } | null>(null);

  const veiculo: Veiculo | null = veiculoId ? veiculos[veiculoId] ?? null : null;
  const cliente = veiculo ? clientes[veiculo.clienteId] : undefined;

  // como o carro fica para as sugestões de prazo (o uso severo pode ser trocado aqui)
  const carroBase = useMemo(() => {
    if (veiculo) return { ...veiculo, usoSevero: severo ?? veiculo.usoSevero ?? null };
    const v = veiculoDoRascunho(rCarro, 'novo');
    return { ...v, usoSevero: severo ?? v.usoSevero ?? null };
  }, [veiculo, rCarro, severo]);
  const usoSevero = usaUsoSevero(carroBase, prefs);

  const pontos = useMemo(() => (veiculo ? pontosDoVeiculo(veiculo.id, Object.values(atendimentos), Object.values(leituras)) : []), [veiculo, atendimentos, leituras]);
  const ultimoPonto = pontos[pontos.length - 1];

  // o último produto usado em cada serviço deste carro
  const ultimosProdutos = useMemo(() => {
    const m = new Map<ServicoId, ItemServico>();
    if (!veiculo) return m;
    const lista = Object.values(atendimentos)
      .filter((a) => a.veiculoId === veiculo.id)
      .sort((a, b) => (a.data < b.data ? 1 : -1));
    for (const a of lista) for (const i of a.itens) if (!m.has(i.servico)) m.set(i.servico, i);
    return m;
  }, [veiculo, atendimentos]);

  const [selecionados, setSelecionados] = useState<ServicoId[]>(() =>
    (params.get('servicos') ?? '')
      .split(',')
      .filter((s): s is ServicoId => servicoExiste(s))
  );
  const [detalhes, setDetalhes] = useState<Partial<Record<ServicoId, Detalhe>>>({});

  function escolhido(escolha: string): Escolhido {
    if (escolha === OUTRO) return { tipo: 'outro' };
    const [tipo, valor] = escolha.split(':');
    if (tipo === 'loja') {
      const produto = acharProduto(Number(valor));
      return produto ? { tipo: 'loja', produto } : null;
    }
    if (tipo === 'ref') {
      const referencia = referencias.find((r) => r.id === Number(valor));
      return referencia ? { tipo: 'ref', referencia } : null;
    }
    if (tipo === 'meu') {
      const proprio = proprios[valor ?? ''];
      return proprio ? { tipo: 'meu', proprio } : null;
    }
    return null;
  }

  /** O prazo que vem do produto escolhido (a loja, a base do fabricante ou o cadastro da oficina). */
  function prazoDoProduto(e: Escolhido, severoAgora: boolean): ProdutoComPrazo | null {
    if (!e || e.tipo === 'outro') return null;
    if (e.tipo === 'meu') return { intervaloKm: e.proprio.intervaloKm, intervaloMeses: e.proprio.intervaloMeses, origem: 'Prazo do seu produto' };
    if (e.tipo === 'ref') {
      const prazo = prazoDaReferencia(e.referencia, severoAgora);
      return prazo ? { intervaloKm: prazo.km, intervaloMeses: prazo.meses, origem: origemDaReferencia(e.referencia) } : null;
    }
    const p = e.produto;
    if (p.intervaloKm == null && p.intervaloMeses == null && p.referenciaId != null) {
      const r = referencias.find((x) => x.id === p.referenciaId);
      const prazo = r ? prazoDaReferencia(r, severoAgora) : null;
      if (r && prazo) return { intervaloKm: prazo.km, intervaloMeses: prazo.meses, especificacao: p.especificacao, origem: origemDaReferencia(r) };
    }
    return p;
  }

  function sugestao(s: ServicoId, escolha: string, severoAgora = usoSevero) {
    return intervaloSugerido(s, { veiculo: { ...carroBase, usoSevero: severoAgora }, prefs, produto: prazoDoProduto(escolhido(escolha), severoAgora) });
  }

  function escolhaAnterior(anterior: ItemServico['produto']): { escolha: string; texto: string } {
    if (!anterior) return { escolha: '', texto: '' };
    if (anterior.id != null && acharProduto(anterior.id)) return { escolha: `loja:${anterior.id}`, texto: '' };
    if (anterior.referenciaId != null && referencias.some((r) => r.id === anterior.referenciaId)) return { escolha: `ref:${anterior.referenciaId}`, texto: '' };
    if (anterior.proprioId && proprios[anterior.proprioId]) return { escolha: `meu:${anterior.proprioId}`, texto: '' };
    return anterior.nome ? { escolha: OUTRO, texto: anterior.nome } : { escolha: '', texto: '' };
  }

  function detalheInicial(s: ServicoId): Detalhe {
    const { escolha, texto } = escolhaAnterior(ultimosProdutos.get(s)?.produto);
    const sug = sugestao(s, escolha);
    return {
      escolha,
      produtoTexto: texto,
      guardar: false,
      km: sug.km != null ? String(sug.km) : '',
      meses: sug.meses != null ? String(sug.meses) : '',
      origem: sug.origem,
      editado: false
    };
  }

  // os detalhes de cada serviço marcado (criados na hora, com o prazo sugerido)
  const det = (s: ServicoId): Detalhe => detalhes[s] ?? detalheInicial(s);

  function alternar(s: ServicoId) {
    if (selecionados.includes(s)) {
      setSelecionados(selecionados.filter((x) => x !== s));
      return;
    }
    const novos = [...selecionados, s];
    for (const j of servico(s).junto ?? []) if (!novos.includes(j)) novos.push(j);
    setSelecionados(novos);
  }

  function mudarDetalhe(s: ServicoId, mudanca: Partial<Detalhe>) {
    setDetalhes((d) => ({ ...d, [s]: { ...det(s), ...mudanca } }));
  }

  function escolherProduto(s: ServicoId, valorSelect: string) {
    const atual = det(s);
    if (valorSelect === OUTRO) {
      mudarDetalhe(s, { escolha: OUTRO });
      return;
    }
    const mudanca: Partial<Detalhe> = { escolha: valorSelect, produtoTexto: '', guardar: false };
    if (!atual.editado) {
      const sug = sugestao(s, valorSelect);
      Object.assign(mudanca, { km: sug.km != null ? String(sug.km) : '', meses: sug.meses != null ? String(sug.meses) : '', origem: sug.origem });
    }
    mudarDetalhe(s, mudanca);
  }

  function mudarSevero(v: boolean) {
    setSevero(v);
    setDetalhes((d) => {
      const r = { ...d };
      for (const s of selecionados) {
        const atual = d[s] ?? detalheInicial(s);
        if (atual.editado) continue;
        const sug = sugestao(s, atual.escolha, v);
        r[s] = { ...atual, km: sug.km != null ? String(sug.km) : '', meses: sug.meses != null ? String(sug.meses) : '', origem: sug.origem };
      }
      return r;
    });
  }

  const kmNum = lerNumero(km);
  const rodagem = estimarRodagem(
    kmNum ? [...pontos, { data, km: kmNum }] : pontos,
    veiculo ?? { kmMes: lerNumero(rCarro.kmMes) },
    prefs.kmMesPadrao,
    hoje
  );

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (t.length < 2) return [];
    const placa = normalizarPlaca(t);
    const digitos = t.replace(/\D/g, '');
    return Object.values(veiculos)
      .filter((v) => {
        const c = clientes[v.clienteId];
        return (
          (placa.length >= 2 && v.placa.includes(placa)) ||
          (c?.nome.toLowerCase().includes(t) ?? false) ||
          (digitos.length >= 4 && (c?.telefone.includes(digitos) ?? false)) ||
          v.modelo.toLowerCase().includes(t)
        );
      })
      .slice(0, 6);
  }, [busca, veiculos, clientes]);

  function salvar() {
    const e: Record<string, string> = {};
    let alvoVeiculo = veiculoId;
    if (!veiculo && !novo) e.carro = 'Escolha o carro ou cadastre um cliente novo.';
    if (novo) {
      for (const [k, v] of Object.entries(errosCliente(rCliente))) e[`cliente.${k}`] = v!;
      for (const [k, v] of Object.entries(errosVeiculo(rCarro))) e[`carro.${k}`] = v!;
      const repetido = Object.values(veiculos).find((v) => v.placa === normalizarPlaca(rCarro.placa));
      if (repetido) e['carro.placa'] = `A placa ${formatarPlaca(repetido.placa)} já está cadastrada. Busque por ela acima.`;
    }
    if (!kmNum || kmNum <= 0) e.km = 'Anote a quilometragem do painel.';
    else if (kmNum > 2_000_000) e.km = 'Confira a quilometragem.';
    if (!data || !dataValida(data)) e.data = 'Escolha a data.';
    else if (data > hoje) e.data = 'A data não pode ser depois de hoje.';
    if (!selecionados.length) e.servicos = 'Marque pelo menos um serviço.';
    for (const s of selecionados) {
      const d = det(s);
      const k = lerNumero(d.km);
      const m = lerNumero(d.meses);
      if (!k && !m) e[`prazo.${s}`] = 'Informe o prazo em km, em meses ou nos dois.';
      else if ((k != null && (k < 100 || k > 300000)) || (m != null && (m < 1 || m > 180))) e[`prazo.${s}`] = 'Confira o prazo.';
    }
    setErros(e);
    if (Object.keys(e).length) {
      toast({ texto: 'Falta preencher alguns campos.', tom: 'erro' });
      requestAnimationFrame(() => document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    if (novo) {
      const clienteId = salvarCliente(clienteDoRascunho(rCliente));
      alvoVeiculo = salvarVeiculo({ ...veiculoDoRascunho(rCarro, clienteId), usoSevero: severo ?? rCarro.usoSevero });
    } else if (veiculo && severo != null && severo !== (veiculo.usoSevero ?? null)) {
      salvarVeiculo({ ...veiculo, usoSevero: severo });
    }

    const itens: ItemServico[] = selecionados.map((s) => {
      const d = det(s);
      const e = escolhido(d.escolha);
      const intervaloKm = lerNumero(d.km) || null;
      const intervaloMeses = lerNumero(d.meses) || null;
      let produto: ItemServico['produto'] = null;
      if (e?.tipo === 'loja') {
        const p = e.produto;
        produto = { id: p.id, nome: p.nome, categoria: p.categoria, especificacao: p.especificacao, ...(p.referenciaId != null ? { referenciaId: p.referenciaId } : {}) };
      } else if (e?.tipo === 'ref') {
        const r = e.referencia;
        produto = { nome: nomeDaReferencia(r), categoria: r.categoria, referenciaId: r.id, ...(r.tipo ? { especificacao: { tipo: r.tipo } } : {}) };
      } else if (e?.tipo === 'meu') {
        const m = e.proprio;
        produto = { nome: [m.marca, m.nome].filter(Boolean).join(' '), categoria: m.categoria, proprioId: m.id };
      } else if (e?.tipo === 'outro' && d.produtoTexto.trim()) {
        const nome = d.produtoTexto.trim().slice(0, 120);
        const categoria = servico(s).categoria ?? 'outros';
        if (d.guardar) {
          const proprioId = salvarProprio({ categoria, marca: '', nome, intervaloKm, intervaloMeses });
          produto = { nome, categoria, proprioId };
        } else produto = { nome };
      }
      return { servico: s, produto, intervaloKm, intervaloMeses };
    });
    const atendimentoId = registrarAtendimento({ veiculoId: alvoVeiculo!, data, km: kmNum!, itens, valor: lerNumero(valor), observacao: obs.trim() || undefined });

    // o óleo usado não vira o "óleo do manual" (a norma da montadora pode faltar); só anota a base usada
    const oleo = itens.find((i) => i.servico === 'troca_oleo')?.produto?.especificacao;
    const atual = useOficina.getState().veiculos[alvoVeiculo!];
    if (oleo?.base && atual?.oleo?.viscosidades?.length && atual.oleo.base !== oleo.base) {
      salvarVeiculo({ ...atual, oleo: { ...atual.oleo, base: oleo.base } });
    }

    setFeito({ atendimentoId, veiculoId: alvoVeiculo! });
    window.scrollTo({ top: 0 });
  }

  function reiniciar() {
    setFeito(null);
    setVeiculoId(null);
    setNovo(false);
    setBusca('');
    setRCliente(CLIENTE_VAZIO);
    setRCarro(VEICULO_VAZIO);
    setData(hoje);
    setKm('');
    setSevero(null);
    setSelecionados([]);
    setDetalhes({});
    setValor('');
    setObs('');
    setErros({});
    router.replace('/oficina/registrar');
  }

  if (feito) return <Feito {...feito} aoRegistrarOutro={reiniciar} />;

  const lista = verTodos ? SERVICOS.map((s) => s.id) : [...new Set([...SERVICOS_RAPIDOS, ...selecionados])];
  const textoCarro = veiculo ? `${veiculo.marca} ${veiculo.modelo} ${veiculo.motor ?? ''} ${veiculo.ano ?? ''}` : `${rCarro.marca} ${rCarro.modelo} ${rCarro.motor} ${rCarro.ano}`;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <button type="button" onClick={() => router.back()} className="mb-2 inline-flex items-center gap-1 text-[14px] font-semibold text-tinta-3 hover:text-tinta">
          <ArrowLeft size={16} /> Voltar
        </button>
        <h1 className="largo text-[28px] sm:text-[32px]">Registrar serviço</h1>
        <p className="mt-1 text-tinta-2">O próximo vencimento de cada item já sai calculado.</p>
      </header>

      {/* 1. carro */}
      <Bloco numero={1} titulo="Carro">
        {veiculo ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel-2 px-4 py-3">
            <span className="self-center">
              <Placa placa={veiculo.placa} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{cliente?.nome}</p>
              <p className="truncate text-[14px] text-tinta-2">{[veiculo.marca, veiculo.modelo, veiculo.motor, veiculo.ano].filter(Boolean).join(' ')}</p>
            </div>
            <Botao tamanho="pequeno" onClick={() => setVeiculoId(null)}>
              Trocar
            </Botao>
          </div>
        ) : novo ? (
          <div className="flex flex-col gap-5">
            <CamposCliente valor={rCliente} aoMudar={setRCliente} erros={prefixo(erros, 'cliente.')} />
            <CamposVeiculo valor={rCarro} aoMudar={setRCarro} erros={prefixo(erros, 'carro.')} />
            <Botao tamanho="pequeno" className="self-start" onClick={() => setNovo(false)}>
              Buscar um cliente já cadastrado
            </Botao>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
              <input
                className={`${classeEntrada} pl-10`}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Placa, nome ou telefone"
                aria-label="Buscar carro"
                autoComplete="off"
              />
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
            ) : busca.trim().length >= 2 ? (
              <p className="text-[14px] text-tinta-3">Nenhum carro com esse nome ou placa.</p>
            ) : null}
            <Botao
              className="self-start"
              onClick={() => {
                setNovo(true);
                const placa = normalizarPlaca(busca);
                if (/^[A-Z]{3}\d/.test(placa)) setRCarro({ ...VEICULO_VAZIO, placa });
                else if (busca.trim()) setRCliente({ ...CLIENTE_VAZIO, nome: busca.trim() });
              }}
            >
              <UserPlus size={18} /> Cliente novo
            </Botao>
            {erros.carro ? (
              <p className="text-sm text-atraso" role="alert">
                {erros.carro}
              </p>
            ) : null}
          </div>
        )}
      </Bloco>

      {/* 2. data e km */}
      <Bloco numero={2} titulo="Quando e com quantos km">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data do serviço" htmlFor="r-data" erro={erros.data}>
            <input id="r-data" type="date" className={classeEntrada} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo
            rotulo="Quilometragem do painel"
            htmlFor="r-km"
            erro={erros.km}
            dica={ultimoPonto ? `Último registro: ${formatarKm(ultimoPonto.km)} em ${formatarData(ultimoPonto.data)}.` : 'O número do odômetro, sem pontos se preferir.'}
          >
            <input id="r-km" className={`${classeEntrada} largo num font-bold`} value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" placeholder="45.000" autoComplete="off" />
          </Campo>
        </div>
        {kmNum && ultimoPonto && kmNum < ultimoPonto.km ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-oleo-tinta">
            <TriangleAlert size={16} aria-hidden="true" /> Está abaixo do último registro ({formatarKm(ultimoPonto.km)}). Confira o painel.
          </p>
        ) : kmNum && ultimoPonto && data >= ultimoPonto.data && (kmNum - ultimoPonto.km) / Math.max(1, diasEntre(ultimoPonto.data, data)) > 250 ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-oleo-tinta">
            <TriangleAlert size={16} aria-hidden="true" /> São {formatarKm(kmNum - ultimoPonto.km)} a mais desde {formatarData(ultimoPonto.data)}. Confira se não sobrou um zero.
          </p>
        ) : null}
        <div className="mt-4 rounded-xl border border-linha px-4 py-2">
          <Alternar
            id="r-severo"
            ligado={usoSevero}
            aoMudar={mudarSevero}
            rotulo="Uso severo"
            descricao="Trânsito pesado, trajetos curtos, aplicativo ou táxi, poeira, reboque. Os prazos de óleo, filtros e revisão caem pela metade."
          />
        </div>
      </Bloco>

      {/* 3. serviços */}
      <Bloco numero={3} titulo="O que foi feito">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {lista.map((s) => {
            const sel = selecionados.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={sel}
                onClick={() => alternar(s)}
                className={`flex min-h-[52px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[14.5px] leading-tight font-semibold transition-colors ${
                  sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel hover:border-tinta-3'
                }`}
              >
                <IconeServico servico={s} size={19} className={sel ? 'text-oleo' : 'text-tinta-3'} />
                <span className="min-w-0">{servico(s).nome}</span>
                {sel ? <Check size={16} className="ml-auto shrink-0" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setVerTodos((v) => !v)} className="mt-3 text-[14.5px] font-semibold text-caneta hover:underline">
          {verTodos ? 'Mostrar só os mais comuns' : `Ver todos os ${SERVICOS.length} serviços`}
        </button>
        {erros.servicos ? (
          <p className="mt-2 text-sm text-atraso" role="alert">
            {erros.servicos}
          </p>
        ) : null}

        {selecionados.length ? (
          <div className="mt-5 flex flex-col gap-3">
            {selecionados.map((s) => (
              <DetalheServico
                key={s}
                s={s}
                d={det(s)}
                veiculo={carroBase}
                anteriorNome={ultimosProdutos.get(s)?.produto?.nome}
                base={kmNum ? { data, km: kmNum } : null}
                kmDia={rodagem.kmDia}
                hoje={hoje}
                erro={erros[`prazo.${s}`]}
                aoEscolherProduto={(v) => escolherProduto(s, v)}
                aoMudar={(m) => mudarDetalhe(s, m)}
                produtos={catalogo.produtos.filter((p) => p.categoria === servico(s).categoria)}
                referencias={servico(s).categoria ? referenciasDaCategoria(referencias, servico(s).categoria!) : []}
                proprios={Object.values(proprios).filter((p) => p.categoria === servico(s).categoria)}
                escolhido={escolhido(det(s).escolha)}
                recomendados={recomendarParaItem(s, carroBase, ultimosProdutos.get(s)?.produto, catalogo, hoje, 3).map((r) => r.produto.id)}
                textoCarro={textoCarro}
              />
            ))}
          </div>
        ) : null}
      </Bloco>

      {/* 4. valor */}
      <Bloco numero={4} titulo="Valor e observações" opcional>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Campo rotulo="Valor cobrado (R$)" htmlFor="r-valor">
            <input id="r-valor" className={classeEntrada} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" autoComplete="off" />
          </Campo>
          <Campo rotulo="Observações" htmlFor="r-obs">
            <textarea id="r-obs" rows={2} className={classeArea} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: cliente pediu para olhar o barulho na suspensão." />
          </Campo>
        </div>
      </Bloco>

      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-linha bg-fundo/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 lg:bottom-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] text-tinta-2">
            {selecionados.length === 0 ? 'Nenhum serviço marcado' : selecionados.length === 1 ? '1 serviço marcado' : `${selecionados.length} serviços marcados`}
          </p>
          <Botao variante="primario" tamanho="grande" onClick={salvar}>
            Registrar serviço
          </Botao>
        </div>
      </div>
    </div>
  );
}

function prefixo(erros: Record<string, string>, p: string) {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(erros)) if (k.startsWith(p)) r[k.slice(p.length)] = v;
  return r;
}

function Bloco({ numero, titulo, opcional, children }: { numero: number; titulo: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`bloco-${numero}`}>
      <h2 id={`bloco-${numero}`} className="flex items-center gap-3 text-[19px]">
        <span className="num grid h-7 w-7 place-items-center rounded-full bg-tinta text-[14px] text-papel">{numero}</span>
        {titulo}
        {opcional ? <span className="text-[14px] font-normal text-tinta-3">opcional</span> : null}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function DetalheServico({
  s,
  d,
  veiculo,
  anteriorNome,
  base,
  kmDia,
  hoje,
  erro,
  aoEscolherProduto,
  aoMudar,
  produtos,
  referencias,
  proprios,
  escolhido,
  recomendados,
  textoCarro
}: {
  s: ServicoId;
  d: Detalhe;
  veiculo: Pick<Veiculo, 'oleo'>;
  anteriorNome?: string;
  base: { data: string; km: number } | null;
  kmDia: number;
  hoje: string;
  erro?: string;
  aoEscolherProduto: (v: string) => void;
  aoMudar: (m: Partial<Detalhe>) => void;
  produtos: Produto[];
  referencias: Referencia[];
  proprios: ProdutoProprio[];
  escolhido: Escolhido;
  recomendados: number[];
  textoCarro: string;
}) {
  const info = servico(s);
  const kmI = lerNumero(d.km);
  const mesesI = lerNumero(d.meses);
  const venc = base && (kmI || mesesI) ? calcularVencimento(base, { km: kmI || null, meses: mesesI || null }, [], kmDia, hoje) : null;
  const produto = escolhido?.tipo === 'loja' ? escolhido.produto : undefined;
  const referencia = escolhido?.tipo === 'ref' ? escolhido.referencia : undefined;
  const outro = escolhido?.tipo === 'outro';
  const exigido = s === 'troca_oleo' ? exigenciaDoCarro(veiculo.oleo, null) : null;
  const compat = produto && exigido ? oleoAtende(produto.especificacao, exigido) : null;
  const ordenados = [...produtos].sort((a, b) => Number(recomendados.includes(b.id)) - Number(recomendados.includes(a.id)));

  return (
    <div className="rounded-xl border border-linha bg-papel">
      <div className="flex items-center gap-3 border-b border-linha px-4 py-3">
        <IconeServico servico={s} className="text-tinta-2" />
        <p className="flex-1 font-bold">{info.nome}</p>
        {venc?.dataPrevista ? (
          <p className="num text-right text-[13.5px] text-tinta-2">
            Próxima: <strong className="text-tinta">{formatarDataCurta(venc.dataPrevista)}</strong>
            {venc.kmLimite ? (
              <>
                {' '}
                ou <strong className="text-tinta">{formatarKm(venc.kmLimite)}</strong>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        {info.categoria ? (
          <Campo
            rotulo={s === 'troca_oleo' ? 'Óleo usado' : 'Produto usado'}
            htmlFor={`p-${s}`}
            className="sm:col-span-2"
            dica={anteriorNome && !escolhido ? `Da última vez: ${anteriorNome}.` : undefined}
          >
            <select id={`p-${s}`} className={classeEntrada} value={d.escolha} onChange={(e) => aoEscolherProduto(e.target.value)}>
              <option value="">Não anotar</option>
              {proprios.length ? (
                <optgroup label="Seus produtos">
                  {proprios.map((m) => (
                    <option key={m.id} value={`meu:${m.id}`}>
                      {[m.marca, m.nome].filter(Boolean).join(' ')} ({textoDoPrazo(m.intervaloKm, m.intervaloMeses)})
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {ordenados.length ? (
                <optgroup label="Na loja">
                  {ordenados.map((p) => (
                    <option key={p.id} value={`loja:${p.id}`}>
                      {recomendados.includes(p.id) ? '★ ' : ''}
                      {p.nome}
                      {p.unidade === 'L' && (p.conteudo ?? 1) > 1 ? ` (${p.conteudo} L)` : ''}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {referencias.length ? (
                <optgroup label="Prazo de fabricantes">
                  {referencias.map((r) => (
                    <option key={r.id} value={`ref:${r.id}`}>
                      {nomeDaReferencia(r)} ({r.segueManual ? 'segue o manual' : textoDoPrazo(r.intervaloKm, r.intervaloMeses)})
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <option value={OUTRO}>Outro produto (escrever)</option>
            </select>
          </Campo>
        ) : null}
        {referencia ? <NotaReferencia r={referencia} /> : null}
        {outro ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Campo rotulo="Qual produto" htmlFor={`pt-${s}`} dica={`Marca e especificação. Ex.: ${s === 'troca_oleo' ? '5W-30 sintético API SP' : nomeCategoria(info.categoria ?? 'outros')}`}>
              <input id={`pt-${s}`} className={classeEntrada} value={d.produtoTexto} onChange={(e) => aoMudar({ produtoTexto: e.target.value })} autoComplete="off" maxLength={120} />
            </Campo>
            {d.produtoTexto.trim().length >= 3 ? (
              <label className="flex items-center gap-2 text-[14px] text-tinta-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-tinta)]" checked={d.guardar} onChange={(e) => aoMudar({ guardar: e.target.checked })} />
                Guardar em Seus produtos com este prazo, para escolher da próxima vez
              </label>
            ) : null}
          </div>
        ) : null}
        {compat && !compat.atende ? (
          <p className="flex items-start gap-2 rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso sm:col-span-2" role="status">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Este óleo não bate com o cadastro do carro: {compat.faltas.join(', ')}.
          </p>
        ) : null}
        {s === 'troca_oleo' && !exigido ? (
          <p className="text-[13.5px] text-tinta-3 sm:col-span-2">
            O óleo do manual deste carro não está cadastrado. {textoCarro.trim() ? 'Depois de salvar, cadastre na página do carro para ver as recomendações.' : ''} Com ★ estão os recomendados.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:max-w-md">
          <Campo rotulo="Próxima em (km)" htmlFor={`k-${s}`} erro={erro}>
            <input
              id={`k-${s}`}
              className={classeEntrada}
              value={d.km}
              onChange={(e) => aoMudar({ km: e.target.value, editado: true })}
              inputMode="numeric"
              placeholder="sem km"
              autoComplete="off"
            />
          </Campo>
          <Campo rotulo="ou em (meses)" htmlFor={`m-${s}`}>
            <input
              id={`m-${s}`}
              className={classeEntrada}
              value={d.meses}
              onChange={(e) => aoMudar({ meses: e.target.value, editado: true })}
              inputMode="numeric"
              placeholder="sem prazo"
              autoComplete="off"
            />
          </Campo>
        </div>
        <p className="text-[13px] leading-snug text-tinta-3 sm:col-span-2">
          {d.editado ? 'Prazo escolhido por você.' : `${d.origem}: ${rotuloIntervalo({ km: kmI || null, meses: mesesI || null })}.`} {info.dica}
        </p>
      </div>
    </div>
  );
}

function NotaReferencia({ r }: { r: Referencia }) {
  const tipo = r.tipoIntervalo ? NOMES_TIPO_INTERVALO[r.tipoIntervalo] : null;
  return (
    <div className="rounded-lg bg-papel-2 px-3 py-2.5 text-[13.5px] leading-snug text-tinta-2 sm:col-span-2">
      <p>
        <span className="font-semibold text-tinta">{origemDaReferencia(r)}</span>
        {r.segueManual ? ', que manda seguir o manual do carro.' : `, ${textoDoPrazo(r.intervaloKm, r.intervaloMeses)}${tipo && tipo !== 'troca' ? ` (${tipo})` : ''}.`}
        {r.intervaloKmSevero || r.intervaloMesesSevero ? ` No uso severo, ${textoDoPrazo(r.intervaloKmSevero ?? r.intervaloKm, r.intervaloMesesSevero ?? r.intervaloMeses)}.` : ''}
      </p>
      {r.observacao ? <p className="mt-1">{r.observacao}</p> : null}
      {r.fonteUrl ? (
        <a href={r.fonteUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-caneta hover:underline">
          Ver a fonte{r.fonteNome ? ` (${r.fonteNome})` : ''}
        </a>
      ) : null}
    </div>
  );
}

function Feito({ atendimentoId, veiculoId, aoRegistrarOutro }: { atendimentoId: string; veiculoId: string; aoRegistrarOutro: () => void }) {
  const atendimento = useOficina((s) => s.atendimentos[atendimentoId]);
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const prefs = useOficina((s) => s.preferencias);
  const hoje = useHoje();
  const cartao = useCartaoDoCarro();
  if (!atendimento || !veiculo) return null;

  const rodagem = estimarRodagem([{ data: atendimento.data, km: atendimento.km }], veiculo, prefs.kmMesPadrao, hoje);
  const vencs = atendimento.itens.map((i) => ({
    i,
    v: calcularVencimento({ data: atendimento.data, km: atendimento.km }, { km: i.intervaloKm, meses: i.intervaloMeses }, [], rodagem.kmDia, hoje)
  }));
  const principal = vencs.find((x) => x.i.servico === 'troca_oleo') ?? vencs[0];
  const c = cartao(veiculoId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ok">
            <Check size={18} aria-hidden="true" /> Serviço registrado
          </p>
          <h1 className="largo mt-1 text-[28px] sm:text-[32px]">
            {cliente?.nome ?? 'Cliente'}, {veiculo.modelo}
          </h1>
          <p className="mt-1 text-tinta-2">
            {formatarData(atendimento.data)} com {formatarKm(atendimento.km)}
            {atendimento.valor ? `, ${formatarMoeda(atendimento.valor)}` : ''}.
          </p>
        </div>
        {principal ? (
          <div className="self-start rounded-3xl bg-vidro p-6 sm:p-8">
            <EtiquetaTroca
              data={principal.v.dataLimite ?? principal.v.dataPrevista}
              km={principal.v.kmLimite}
              situacao="avisar"
              titulo={principal.i.servico === 'troca_oleo' ? 'Próxima troca' : servico(principal.i.servico).nome}
              girar
              className="scale-110"
            />
          </div>
        ) : null}
      </div>

      <ul className="divide-y divide-linha rounded-xl border border-linha bg-papel">
        {vencs.map(({ i, v }) => (
          <li key={i.servico} className="flex items-center gap-3 px-4 py-3">
            <IconeServico servico={i.servico} className="text-tinta-2" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{servico(i.servico).nome}</p>
              {i.produto ? <p className="truncate text-[13.5px] text-tinta-3">{i.produto.nome}</p> : null}
            </div>
            <div className="num text-right text-[14px] text-tinta-2">
              <p>{[v.dataLimite ? formatarData(v.dataLimite) : '', v.kmLimite ? formatarKm(v.kmLimite) : ''].filter(Boolean).join(' ou ')}</p>
              {v.motivo === 'km' && v.dataPrevista && v.dataLimite && v.dataPrevista < v.dataLimite ? (
                <p className="text-[12.5px] text-tinta-3">pela rodagem, por volta de {formatarData(v.dataPrevista)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Link href={`/oficina/etiqueta?atendimento=${atendimentoId}`} className={classeBotao('escuro', 'grande')}>
          <Printer size={18} /> Imprimir etiqueta do para-brisa
        </Link>
        {c?.whatsapp ? (
          <a href={c.whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'grande')}>
            <MessageCircle size={18} /> Mandar cartão no WhatsApp
          </a>
        ) : null}
        <Botao tamanho="grande" onClick={aoRegistrarOutro}>
          Registrar outro
        </Botao>
        <Link href="/oficina" className={classeBotao('fantasma', 'grande')}>
          Voltar aos avisos
        </Link>
      </div>
    </div>
  );
}
