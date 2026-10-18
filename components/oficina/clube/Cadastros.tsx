'use client';

// Os planos do clube (mensalidade, serviços incluídos por ano e descontos) e os membros (o
// cliente, o carro, o plano, o dia do vencimento e a situação), com as folhas de cadastro.

import { IdCard, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Vazio, classeEntrada } from '@/components/ui';
import { beneficiosDoMembro, diaValido, nomeDoServico, pagoAte } from '@/lib/clube';
import { formatarData } from '@/lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, SEM_NOME } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { SERVICOS } from '@/lib/manutencao';
import type { ClubeMembro, ClubePlano } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

const SITUACOES: Record<ClubeMembro['situacao'], { nome: string; tom: 'ok' | 'oleo' | 'neutro' }> = {
  ativo: { nome: 'Ativo', tom: 'ok' },
  pausado: { nome: 'Pausado', tom: 'oleo' },
  cancelado: { nome: 'Cancelado', tom: 'neutro' }
};

// ---------------------------------------------------------------- planos

export function Planos() {
  const planos = useOficina((s) => s.clubePlanos);
  const membros = useOficina((s) => s.clubeMembros);
  const [editando, setEditando] = useState<Id | 'novo' | null>(null);
  const lista = useMemo(() => Object.values(planos).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.preco - b.preco), [planos]);
  const ativosPorPlano = useMemo(() => {
    const m = new Map<Id, number>();
    for (const x of Object.values(membros)) if (x.situacao === 'ativo') m.set(x.planoId, (m.get(x.planoId) ?? 0) + 1);
    return m;
  }, [membros]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] text-tinta-2">Cada plano tem a mensalidade, os serviços que entram sem cobrar a mão de obra e o desconto nas peças.</p>
        <Botao variante="primario" onClick={() => setEditando('novo')}>
          <Plus size={18} aria-hidden="true" /> Novo plano
        </Botao>
      </div>
      {lista.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha">
              <div className="flex flex-wrap items-center gap-2">
                <span className="largo text-[19px] font-extrabold">{p.nome}</span>
                {!p.ativo ? <Chip>Fora de venda</Chip> : null}
                <span className="num ml-auto text-[17px] font-extrabold">
                  {formatarMoeda(p.preco)}
                  <span className="text-[13px] font-semibold text-tinta-3">/mês</span>
                </span>
              </div>
              <p className="text-[14px] text-tinta-2">
                {[
                  ...p.beneficios.map((b) => `${b.quantidadePorAno}× ${nomeDoServico(b.servico).toLowerCase()} por ano`),
                  p.descontoPecas > 0 ? `${formatarNumero(p.descontoPecas, 2)}% nas peças` : '',
                  p.descontoServicos > 0 ? `${formatarNumero(p.descontoServicos, 2)}% na mão de obra` : ''
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Sem benefícios cadastrados'}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] text-tinta-3">{ativosPorPlano.get(p.id) ? `${ativosPorPlano.get(p.id)} membro(s) ativo(s)` : 'Nenhum membro ativo'}</span>
                <Botao tamanho="pequeno" variante="fantasma" onClick={() => setEditando(p.id)}>
                  <Pencil size={15} aria-hidden="true" /> Editar
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo="Nenhum plano ainda" acao={<Botao variante="primario" onClick={() => setEditando('novo')}>Criar o primeiro plano</Botao>}>
          Exemplo: plano Ouro de R$ 89,90 por mês, com duas trocas de óleo por ano sem a mão de obra e 10% de desconto nas peças.
        </Vazio>
      )}
      <Folha aberta={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === 'novo' ? 'Novo plano' : 'Editar o plano'}>
        {editando !== null ? <FormPlano id={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} /> : null}
      </Folha>
    </div>
  );
}

interface LinhaBeneficio {
  servico: string;
  quantidade: string;
}

function FormPlano({ id, aoFechar }: { id: Id | null; aoFechar: () => void }) {
  const toast = useToast();
  const atual = useOficina((s) => (id ? s.clubePlanos[id] : undefined));
  const temMembros = useOficina((s) => !!id && Object.values(s.clubeMembros).some((m) => m.planoId === id));
  const [nome, setNome] = useState(atual?.nome ?? '');
  const [preco, setPreco] = useState(atual ? formatarNumero(atual.preco, 2) : '');
  const [descricao, setDescricao] = useState(atual?.descricao ?? '');
  const [beneficios, setBeneficios] = useState<LinhaBeneficio[]>(atual?.beneficios.map((b) => ({ servico: b.servico, quantidade: String(b.quantidadePorAno) })) ?? [{ servico: 'troca_oleo', quantidade: '2' }]);
  const [pecas, setPecas] = useState(atual ? formatarNumero(atual.descontoPecas, 2) : '10');
  const [servicos, setServicos] = useState(atual ? formatarNumero(atual.descontoServicos, 2) : '0');
  const [ativo, setAtivo] = useState(atual?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    const valor = lerNumero(preco);
    const dPecas = lerNumero(pecas || '0');
    const dServicos = lerNumero(servicos || '0');
    if (nome.trim().length < 2) return setErro('Escreva o nome do plano.');
    if (valor == null || valor <= 0 || valor > 100_000) return setErro('Escreva a mensalidade.');
    if (dPecas == null || dPecas < 0 || dPecas > 100 || dServicos == null || dServicos < 0 || dServicos > 100) return setErro('Os descontos vão de 0 a 100%.');
    const lista: ClubePlano['beneficios'] = [];
    for (const b of beneficios) {
      const q = Math.round(lerNumero(b.quantidade) ?? 0);
      if (!b.servico || q <= 0) continue;
      const igual = lista.find((x) => x.servico === b.servico);
      if (igual) igual.quantidadePorAno += q;
      else lista.push({ servico: b.servico, quantidadePorAno: Math.min(q, 52) });
    }
    useOficina.getState().salvarRegistro('clubePlanos', {
      ...(atual ?? {}),
      ...(id ? { id } : {}),
      nome: nome.trim().slice(0, 80),
      preco: r2(valor),
      descricao: descricao.trim().slice(0, 400) || undefined,
      beneficios: lista,
      descontoPecas: r2(dPecas),
      descontoServicos: r2(dServicos),
      ativo
    });
    toast({ texto: id ? 'Plano salvo.' : 'Plano criado. Agora é só adicionar os membros.' });
    aoFechar();
  }

  function apagar() {
    if (!id || temMembros) return;
    if (!window.confirm('Apagar este plano?')) return;
    useOficina.getState().apagarRegistro('clubePlanos', id);
    aoFechar();
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Nome do plano" htmlFor="plano-nome">
        <input id="plano-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Ouro" />
      </Campo>
      <Campo rotulo="Mensalidade (R$)" htmlFor="plano-preco">
        <input id="plano-preco" className={`${classeEntrada} num`} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" />
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Serviços incluídos por ano (sem cobrar a mão de obra)</legend>
        {beneficios.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_44px] gap-2">
            <select
              aria-label={`Serviço incluído ${i + 1}`}
              className={classeEntrada}
              value={b.servico}
              onChange={(e) => setBeneficios((x) => x.map((y, j) => (j === i ? { ...y, servico: e.target.value } : y)))}
            >
              {SERVICOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <input
              aria-label={`Quantas vezes por ano: ${nomeDoServico(b.servico)}`}
              className={`${classeEntrada} num`}
              value={b.quantidade}
              onChange={(e) => setBeneficios((x) => x.map((y, j) => (j === i ? { ...y, quantidade: e.target.value } : y)))}
              inputMode="numeric"
            />
            <button type="button" onClick={() => setBeneficios((x) => x.filter((_y, j) => j !== i))} className="grid h-11 w-11 place-items-center rounded-[10px] text-tinta-3 hover:bg-papel-2 hover:text-atraso" aria-label={`Tirar ${nomeDoServico(b.servico)}`}>
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setBeneficios((x) => [...x, { servico: 'alinhamento', quantidade: '1' }])} className="self-start text-[14px] font-semibold text-caneta hover:underline">
          + Outro serviço incluído
        </button>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Desconto nas peças (%)" htmlFor="plano-pecas">
          <input id="plano-pecas" className={`${classeEntrada} num`} value={pecas} onChange={(e) => setPecas(e.target.value)} inputMode="decimal" />
        </Campo>
        <Campo rotulo="Desconto na mão de obra (%)" htmlFor="plano-servicos">
          <input id="plano-servicos" className={`${classeEntrada} num`} value={servicos} onChange={(e) => setServicos(e.target.value)} inputMode="decimal" />
        </Campo>
      </div>
      <Campo rotulo="O que dizer ao cliente (opcional)" htmlFor="plano-desc">
        <input id="plano-desc" className={classeEntrada} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={400} placeholder="Ex.: Manutenção em dia o ano todo" />
      </Campo>
      <Alternar id="plano-ativo" ligado={ativo} aoMudar={setAtivo} rotulo="À venda" descricao="Fora de venda, o plano continua valendo para quem já é membro." />
      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-linha pt-4">
        {id && !temMembros ? (
          <Botao variante="perigo" className="mr-auto" onClick={apagar}>
            Apagar
          </Botao>
        ) : null}
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao variante="primario" onClick={salvar}>
          Salvar o plano
        </Botao>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- membros

export function Membros({ aoMandarCartao, ocupado }: { aoMandarCartao: (m: ClubeMembro) => void; ocupado: Id | null }) {
  const hoje = useHoje();
  const membros = useOficina((s) => s.clubeMembros);
  const planos = useOficina((s) => s.clubePlanos);
  const clientes = useOficina((s) => s.clientes);
  const veiculos = useOficina((s) => s.veiculos);
  const cobrancas = useOficina((s) => s.clubeCobrancas);
  const [editando, setEditando] = useState<Id | 'novo' | null>(null);
  const lista = useMemo(
    () =>
      Object.values(membros).sort(
        (a, b) => ['ativo', 'pausado', 'cancelado'].indexOf(a.situacao) - ['ativo', 'pausado', 'cancelado'].indexOf(b.situacao) || (clientes[a.clienteId]?.nome ?? '').localeCompare(clientes[b.clienteId]?.nome ?? '', 'pt-BR')
      ),
    [membros, clientes]
  );
  const temPlano = Object.values(planos).some((p) => p.ativo);
  const listaCobrancas = useMemo(() => Object.values(cobrancas), [cobrancas]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] text-tinta-2">Quem faz parte do clube, com o carro, o plano e o dia de pagar.</p>
        <Botao variante="primario" onClick={() => setEditando('novo')} disabled={!temPlano}>
          <Plus size={18} aria-hidden="true" /> Novo membro
        </Botao>
      </div>
      {!temPlano ? <p className="text-[14px] text-tinta-3">Crie um plano primeiro, na aba Planos.</p> : null}
      {lista.length ? (
        <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {lista.map((m) => {
            const plano = planos[m.planoId];
            const cliente = clientes[m.clienteId];
            const veiculo = m.veiculoId ? veiculos[m.veiculoId] : undefined;
            const s = SITUACOES[m.situacao];
            const ate = pagoAte(m, listaCobrancas);
            const beneficios = plano ? beneficiosDoMembro(m, plano, hoje) : [];
            return (
              <li key={m.id} className="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : 'Cliente sem nome'}</span>
                  <Chip tom={s.tom}>{s.nome}</Chip>
                  <span className="ml-auto text-[14px] font-semibold">{plano?.nome ?? 'Plano apagado'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-tinta-2">
                  {veiculo ? <Placa placa={veiculo.placa} /> : null}
                  <span>{veiculo ? veiculo.modelo : 'Todos os carros do cliente'}</span>
                  <span>· desde {formatarData(m.inicio)}</span>
                  <span>· vence todo dia {diaValido(m.diaVencimento)}</span>
                  {ate ? <span>· em dia até {formatarData(ate)}</span> : null}
                </div>
                {beneficios.length ? <p className="text-[13px] text-tinta-3">{beneficios.map((b) => `${b.nome}: ${b.restantes} de ${b.quantidadePorAno}`).join(' · ')}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Botao tamanho="pequeno" onClick={() => aoMandarCartao(m)} disabled={ocupado === m.id || m.situacao === 'cancelado'}>
                    <IdCard size={15} aria-hidden="true" /> {m.cartao?.url ? 'Mandar o cartão de novo' : 'Mandar o cartão'}
                  </Botao>
                  <Botao tamanho="pequeno" variante="fantasma" onClick={() => setEditando(m.id)}>
                    <Pencil size={15} aria-hidden="true" /> Editar
                  </Botao>
                </div>
              </li>
            );
          })}
        </ul>
      ) : temPlano ? (
        <Vazio titulo="Nenhum membro ainda">Adicione o cliente, o carro e o plano. A mensalidade é gerada todo mês no dia que você escolher.</Vazio>
      ) : null}
      <Folha aberta={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === 'novo' ? 'Novo membro' : 'Editar o membro'}>
        {editando !== null ? <FormMembro id={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} /> : null}
      </Folha>
    </div>
  );
}

function FormMembro({ id, aoFechar }: { id: Id | null; aoFechar: () => void }) {
  const toast = useToast();
  const hoje = useHoje();
  const atual = useOficina((s) => (id ? s.clubeMembros[id] : undefined));
  const clientes = useOficina((s) => s.clientes);
  const veiculos = useOficina((s) => s.veiculos);
  const planos = useOficina((s) => s.clubePlanos);
  const membros = useOficina((s) => s.clubeMembros);
  const listaClientes = useMemo(() => Object.values(clientes).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [clientes]);
  const listaPlanos = useMemo(() => Object.values(planos).filter((p) => p.ativo || p.id === atual?.planoId), [planos, atual?.planoId]);
  const [clienteId, setClienteId] = useState<Id>(atual?.clienteId ?? '');
  const [veiculoId, setVeiculoId] = useState<Id>(atual?.veiculoId ?? '');
  const [planoId, setPlanoId] = useState<Id>(atual?.planoId ?? listaPlanos[0]?.id ?? '');
  const [inicio, setInicio] = useState(atual?.inicio ?? hoje);
  const [dia, setDia] = useState(String(atual?.diaVencimento ?? diaValido(Number(hoje.slice(8, 10)))));
  const [situacao, setSituacao] = useState<ClubeMembro['situacao']>(atual?.situacao ?? 'ativo');
  const [erro, setErro] = useState<string | null>(null);
  const carros = useMemo(() => Object.values(veiculos).filter((v) => v.clienteId === clienteId), [veiculos, clienteId]);

  function salvar() {
    if (!clienteId || !clientes[clienteId]) return setErro('Escolha o cliente.');
    if (!planoId || !planos[planoId]) return setErro('Escolha o plano.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return setErro('Escolha a data de entrada.');
    const d = Math.round(lerNumero(dia) ?? 0);
    if (d < 1 || d > 28) return setErro('O dia de pagar vai de 1 a 28 (todo mês tem).');
    const outro = Object.values(membros).find((m) => m.id !== id && m.situacao === 'ativo' && m.clienteId === clienteId && (m.veiculoId ?? '') === veiculoId);
    if (situacao === 'ativo' && outro) return setErro('Este cliente já é membro ativo com este carro. Edite o que já existe.');
    useOficina.getState().salvarRegistro('clubeMembros', {
      ...(atual ?? {}),
      ...(id ? { id } : {}),
      clienteId,
      veiculoId: veiculoId || null,
      planoId,
      inicio,
      diaVencimento: d,
      situacao,
      usos: atual?.usos ?? []
    });
    toast({ texto: id ? 'Membro salvo.' : 'Membro adicionado. A mensalidade entra quando gerar as do mês.' });
    aoFechar();
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Cliente" htmlFor="membro-cliente">
        <select id="membro-cliente" className={classeEntrada} value={clienteId} onChange={(e) => (setClienteId(e.target.value), setVeiculoId(''))}>
          <option value="">Escolha o cliente</option>
          {listaClientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Carro" htmlFor="membro-carro" dica="O plano vale para o carro escolhido, ou para todos os carros do cliente.">
        <select id="membro-carro" className={classeEntrada} value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} disabled={!clienteId}>
          <option value="">Todos os carros do cliente</option>
          {carros.map((v) => (
            <option key={v.id} value={v.id}>
              {[v.modelo, v.placa].filter(Boolean).join(' · ')}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Plano" htmlFor="membro-plano">
        <select id="membro-plano" className={classeEntrada} value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
          {listaPlanos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} ({formatarMoeda(p.preco)}/mês)
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Entrou em" htmlFor="membro-inicio">
          <input id="membro-inicio" type="date" className={classeEntrada} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Campo rotulo="Dia de pagar" htmlFor="membro-dia" dica="De 1 a 28.">
          <input id="membro-dia" className={`${classeEntrada} num`} value={dia} onChange={(e) => setDia(e.target.value)} inputMode="numeric" />
        </Campo>
      </div>
      {id ? (
        <Campo rotulo="Situação" htmlFor="membro-situacao" dica="Pausado ou cancelado não gera mensalidade nem dá desconto.">
          <select id="membro-situacao" className={classeEntrada} value={situacao} onChange={(e) => setSituacao(e.target.value as ClubeMembro['situacao'])}>
            <option value="ativo">Ativo</option>
            <option value="pausado">Pausado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Campo>
      ) : null}
      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-linha pt-4">
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao variante="primario" onClick={salvar}>
          {id ? 'Salvar' : 'Adicionar ao clube'}
        </Botao>
      </div>
    </div>
  );
}
