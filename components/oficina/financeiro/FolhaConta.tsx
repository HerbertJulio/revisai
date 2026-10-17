'use client';

// Conta a receber ou a pagar: lançar (de uma vez ou em parcelas), editar, receber ou pagar com a
// data e a forma, desfazer e apagar (a parcela ou o que falta do grupo).

import { Check, ClipboardList, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, classeArea, classeEntrada } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import {
  CATEGORIAS,
  dividirEmParcelas,
  ehFiadoEmAberto,
  errosDaConta,
  FORMAS,
  FORMAS_NA_HORA,
  MAX_PARCELAS,
  marcarPago,
  montarLancamentos,
  nomeDaForma,
  rotuloDoVencimento,
  vencimentosDasParcelas,
  type ErrosDaConta,
  type NovaConta
} from '@/lib/financeiro';
import { formatarMoeda, formatarNumero, lerNumero, SEM_NOME } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import type { FormaPagamento, Lancamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { gerarId, SeloDaConta, textoDaParcela } from './comum';
import { BotaoLembrete, textoDoLembrado } from './lembrete';

interface Rascunho {
  tipo: Lancamento['tipo'];
  descricao: string;
  valor: string;
  vencimento: string;
  parcelas: string;
  forma: FormaPagamento | '';
  categoria: string;
  clienteId: string;
  favorecido: string;
  observacao: string;
  jaPago: boolean;
  pagoEm: string;
  documentoId: string;
  pedidoCodigo: string;
}

function rascunhoNovo(hoje: string, inicial?: Partial<NovaConta>): Rascunho {
  const tipo = inicial?.tipo ?? 'receber';
  return {
    tipo,
    descricao: inicial?.descricao ?? '',
    valor: inicial?.valor ? formatarNumero(inicial.valor, 2) : '',
    vencimento: inicial?.vencimento ?? hoje,
    parcelas: String(inicial?.parcelas ?? 1),
    forma: inicial?.forma ?? '',
    categoria: inicial?.categoria ?? (tipo === 'receber' ? 'servico' : 'fornecedor'),
    clienteId: inicial?.clienteId ?? '',
    favorecido: inicial?.favorecido ?? '',
    observacao: inicial?.observacao ?? '',
    jaPago: !!inicial?.pagoEm,
    pagoEm: inicial?.pagoEm ?? hoje,
    documentoId: inicial?.documentoId ?? '',
    pedidoCodigo: inicial?.pedidoCodigo ?? ''
  };
}

function rascunhoDe(l: Lancamento): Rascunho {
  return {
    tipo: l.tipo,
    descricao: l.descricao,
    valor: formatarNumero(l.valor, 2),
    vencimento: l.vencimento,
    parcelas: '1',
    forma: l.forma ?? '',
    categoria: l.categoria,
    clienteId: l.clienteId ?? '',
    favorecido: l.favorecido ?? '',
    observacao: l.observacao ?? '',
    jaPago: !!l.pagoEm,
    pagoEm: l.pagoEm ?? '',
    documentoId: l.documentoId ?? '',
    pedidoCodigo: l.pedidoCodigo ?? ''
  };
}

/** Lançar uma conta nova (vazia ou já preenchida, como a do pedido da loja). */
export function FolhaNovaConta({ aberta, aoFechar, inicial }: { aberta: boolean; aoFechar: () => void; inicial?: Partial<NovaConta> | null }) {
  const hoje = useHoje();
  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo={inicial?.tipo === 'pagar' ? 'Conta a pagar' : inicial?.tipo === 'receber' ? 'Conta a receber' : 'Nova conta'} descricao="Em vezes, cada parcela vira uma conta com o seu vencimento.">
      {aberta ? <FormNovaConta key={JSON.stringify(inicial ?? {})} inicial={rascunhoNovo(hoje, inicial ?? undefined)} aoFechar={aoFechar} /> : null}
    </Folha>
  );
}

function FormNovaConta({ inicial, aoFechar }: { inicial: Rascunho; aoFechar: () => void }) {
  const toast = useToast();
  const salvar = useOficina((s) => s.salvarRegistro);
  const [r, setR] = useState<Rascunho>(inicial);
  const [erros, setErros] = useState<ErrosDaConta & { pagoEm?: string }>({});
  const valor = lerNumero(r.valor) ?? 0;
  const parcelas = Math.floor(lerNumero(r.parcelas) ?? 1);
  // no crédito, a maquininha paga de 30 em 30 dias; o resto vence todo mês no mesmo dia
  const intervalo = r.forma === 'credito' ? '30dias' : 'mensal';

  function conta(): NovaConta {
    return {
      tipo: r.tipo,
      descricao: r.descricao,
      valor,
      parcelas,
      vencimento: r.vencimento,
      intervalo,
      forma: r.forma || null,
      categoria: r.categoria,
      clienteId: r.tipo === 'receber' ? r.clienteId || null : null,
      documentoId: r.documentoId || null,
      favorecido: r.tipo === 'pagar' ? r.favorecido : undefined,
      pedidoCodigo: r.pedidoCodigo || null,
      observacao: r.observacao,
      pagoEm: parcelas === 1 && r.jaPago ? r.pagoEm || null : null
    };
  }

  function gravar() {
    const c = conta();
    const e: ErrosDaConta & { pagoEm?: string } = errosDaConta(c);
    if (c.pagoEm === null && parcelas === 1 && r.jaPago) e.pagoEm = 'Escolha o dia.';
    setErros(e);
    if (Object.keys(e).length) return;
    const itens = montarLancamentos(c, gerarId);
    for (const i of itens) salvar('lancamentos', i);
    toast({ texto: itens.length > 1 ? `${itens.length} parcelas lançadas.` : r.tipo === 'receber' ? 'Conta a receber lançada.' : 'Conta a pagar lançada.' });
    aoFechar();
  }

  const previa = parcelas > 1 && valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.vencimento) ? { valores: dividirEmParcelas(valor, parcelas), datas: vencimentosDasParcelas(r.vencimento, parcelas, intervalo) } : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 self-start rounded-[12px] bg-papel-2 p-1" role="radiogroup" aria-label="Tipo da conta">
        {(['receber', 'pagar'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={r.tipo === t}
            onClick={() => setR({ ...r, tipo: t, categoria: CATEGORIAS[t][0].id })}
            className={`h-9 rounded-[10px] px-3.5 text-[14.5px] font-semibold ${r.tipo === t ? 'bg-papel shadow-sm' : 'text-tinta-2'}`}
          >
            {t === 'receber' ? 'A receber' : 'A pagar'}
          </button>
        ))}
      </div>
      <CamposDaConta r={r} setR={setR} erros={erros} novo />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Em quantas vezes" htmlFor="c-parcelas" erro={erros.parcelas}>
          <select id="c-parcelas" className={classeEntrada} value={String(parcelas)} onChange={(e) => setR({ ...r, parcelas: e.target.value })}>
            {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'De uma vez' : intervalo === '30dias' ? `${n} vezes, a cada 30 dias` : `${n} vezes, todo mês`}
              </option>
            ))}
          </select>
        </Campo>
        {parcelas === 1 ? (
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex h-11 items-center gap-2.5 text-[15px] font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-[var(--tinta)]" checked={r.jaPago} onChange={(e) => setR({ ...r, jaPago: e.target.checked, pagoEm: r.pagoEm || inicial.vencimento })} />
              {r.tipo === 'receber' ? 'Já recebi' : 'Já paguei'}
            </label>
          </div>
        ) : null}
      </div>
      {parcelas === 1 && r.jaPago ? (
        <Campo rotulo={r.tipo === 'receber' ? 'Recebido em' : 'Pago em'} htmlFor="c-pago" erro={erros.pagoEm}>
          <input id="c-pago" type="date" className={classeEntrada} value={r.pagoEm} onChange={(e) => setR({ ...r, pagoEm: e.target.value })} />
        </Campo>
      ) : null}
      {previa ? (
        <ul className="flex flex-col divide-y divide-linha rounded-xl bg-papel-2 px-3.5 text-[14px]" aria-label="Parcelas">
          {previa.valores.map((v, i) => (
            <li key={i} className="flex justify-between py-1.5">
              <span className="text-tinta-2">
                {i + 1}ª parcela, {formatarData(previa.datas[i])}
              </span>
              <span className="num font-semibold">{formatarMoeda(v)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-linha pt-4">
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao variante="primario" onClick={gravar}>
          <Check size={17} aria-hidden="true" /> Lançar
        </Botao>
      </div>
    </div>
  );
}

function CamposDaConta({ r, setR, erros, novo = false }: { r: Rascunho; setR: (r: Rascunho) => void; erros: ErrosDaConta; novo?: boolean }) {
  const clientes = useOficina((s) => s.clientes);
  const lancamentos = useOficina((s) => s.lancamentos);
  const listaClientes = useMemo(() => Object.values(clientes).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [clientes]);
  const favorecidos = useMemo(() => [...new Set(Object.values(lancamentos).map((l) => l.favorecido?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [lancamentos]);
  const parcelas = Math.floor(lerNumero(r.parcelas) ?? 1);
  return (
    <>
      <Campo rotulo="Do que é" htmlFor="c-desc" erro={erros.descricao}>
        <input
          id="c-desc"
          className={classeEntrada}
          value={r.descricao}
          onChange={(e) => setR({ ...r, descricao: e.target.value })}
          placeholder={r.tipo === 'receber' ? 'Ex.: Serviço do Gol do Carlos' : 'Ex.: Aluguel de novembro'}
          maxLength={120}
          autoFocus={novo}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo={novo && parcelas > 1 ? 'Valor total' : 'Valor'} htmlFor="c-valor" erro={erros.valor}>
          <input id="c-valor" className={`${classeEntrada} num`} value={r.valor} onChange={(e) => setR({ ...r, valor: e.target.value })} inputMode="decimal" placeholder="0,00" />
        </Campo>
        <Campo rotulo={novo && parcelas > 1 ? '1º vencimento' : 'Vencimento'} htmlFor="c-venc" erro={erros.vencimento}>
          <input id="c-venc" type="date" className={classeEntrada} value={r.vencimento} onChange={(e) => setR({ ...r, vencimento: e.target.value })} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Forma" htmlFor="c-forma">
          <select id="c-forma" className={classeEntrada} value={r.forma} onChange={(e) => setR({ ...r, forma: e.target.value as FormaPagamento | '' })}>
            <option value="">Ainda não sei</option>
            {FORMAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Categoria" htmlFor="c-cat">
          <select id="c-cat" className={classeEntrada} value={r.categoria} onChange={(e) => setR({ ...r, categoria: e.target.value })}>
            {CATEGORIAS[r.tipo].map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
            {!CATEGORIAS[r.tipo].some((c) => c.id === r.categoria) ? <option value={r.categoria}>{r.categoria}</option> : null}
          </select>
        </Campo>
      </div>
      {r.tipo === 'receber' ? (
        <Campo rotulo="Cliente" htmlFor="c-cliente" dica={r.forma === 'fiado' ? 'No fiado, o lembrete vai para o WhatsApp do cliente.' : undefined}>
          <select id="c-cliente" className={classeEntrada} value={r.clienteId} onChange={(e) => setR({ ...r, clienteId: e.target.value })}>
            <option value="">Sem cliente</option>
            {listaClientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome === SEM_NOME ? 'Cliente sem nome' : c.nome}
              </option>
            ))}
          </select>
        </Campo>
      ) : (
        <Campo rotulo="Quem recebe" htmlFor="c-fav" dica="A loja, o dono do imóvel, o funcionário.">
          <input id="c-fav" className={classeEntrada} value={r.favorecido} onChange={(e) => setR({ ...r, favorecido: e.target.value })} list="c-favorecidos" maxLength={120} autoComplete="off" />
          <datalist id="c-favorecidos">
            {favorecidos.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Campo>
      )}
      <Campo rotulo="Observação" htmlFor="c-obs">
        <textarea id="c-obs" rows={2} className={classeArea} value={r.observacao} onChange={(e) => setR({ ...r, observacao: e.target.value })} maxLength={500} />
      </Campo>
    </>
  );
}

// ---------------------------------------------------------------- uma conta que já existe

export function FolhaDaConta({ id, aoFechar }: { id: Id | null; aoFechar: () => void }) {
  const l = useOficina((s) => (id ? s.lancamentos[id] : undefined));
  return (
    <Folha aberta={!!l} aoFechar={aoFechar} titulo={l ? l.descricao : ''} descricao={l ? `${l.tipo === 'receber' ? 'A receber' : 'A pagar'}${textoDaParcela(l) ? `, parcela ${textoDaParcela(l)}` : ''}` : undefined}>
      {l ? <DetalheDaConta key={l.id} lancamento={l} aoFechar={aoFechar} /> : null}
    </Folha>
  );
}

function DetalheDaConta({ lancamento: l, aoFechar }: { lancamento: Lancamento; aoFechar: () => void }) {
  const hoje = useHoje();
  const toast = useToast();
  const salvar = useOficina((s) => s.salvarRegistro);
  const apagar = useOficina((s) => s.apagarRegistro);
  const todos = useOficina((s) => s.lancamentos);
  const cliente = useOficina((s) => (l.clienteId ? s.clientes[l.clienteId] : undefined));
  const doc = useOficina((s) => (l.documentoId ? s.documentos[l.documentoId] : undefined));
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(l));
  const [erros, setErros] = useState<ErrosDaConta>({});
  const [dia, setDia] = useState(hoje);
  const [forma, setForma] = useState<FormaPagamento>(l.forma && FORMAS_NA_HORA.includes(l.forma) ? l.forma : l.forma === 'credito' || l.forma === 'boleto' ? l.forma : 'pix');
  const doGrupo = useMemo(() => (l.parcela?.grupo ? Object.values(todos).filter((x) => x.parcela?.grupo === l.parcela?.grupo) : [l]), [todos, l]);
  const abertasDoGrupo = doGrupo.filter((x) => !x.pagoEm);
  const recebe = l.tipo === 'receber';

  function gravar() {
    const valor = lerNumero(r.valor) ?? 0;
    const e = errosDaConta({ descricao: r.descricao, valor, vencimento: r.vencimento, parcelas: 1 });
    setErros(e);
    if (Object.keys(e).length) return;
    salvar('lancamentos', {
      ...l,
      tipo: r.tipo,
      descricao: r.descricao.trim(),
      valor: Math.round(valor * 100) / 100,
      vencimento: r.vencimento,
      forma: r.forma || null,
      categoria: r.categoria,
      clienteId: r.tipo === 'receber' ? r.clienteId || null : null,
      favorecido: r.tipo === 'pagar' ? r.favorecido.trim() || undefined : undefined,
      observacao: r.observacao.trim() || undefined
    });
    toast({ texto: 'Conta salva.' });
    aoFechar();
  }

  function quitar() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return toast({ texto: 'Escolha o dia.', tom: 'erro' });
    const antes = l;
    salvar('lancamentos', marcarPago(l, dia, forma));
    toast({
      texto: `${recebe ? 'Recebido' : 'Pago'}: ${formatarMoeda(l.valor)} no ${nomeDaForma(forma).toLowerCase()}.`,
      acao: { rotulo: 'Desfazer', fazer: () => useOficina.getState().salvarRegistro('lancamentos', antes) }
    });
    aoFechar();
  }

  function desfazer() {
    salvar('lancamentos', { ...l, pagoEm: null });
    toast({ texto: recebe ? 'Voltou para a receber.' : 'Voltou para a pagar.' });
  }

  function apagarConta(todasAbertas: boolean) {
    const alvo = todasAbertas ? abertasDoGrupo : [l];
    if (!window.confirm(todasAbertas ? `Apagar as ${alvo.length} parcelas em aberto?` : 'Apagar esta conta?')) return;
    for (const x of alvo) apagar('lancamentos', x.id);
    toast({ texto: alvo.length > 1 ? `${alvo.length} parcelas apagadas.` : 'Conta apagada.' });
    aoFechar();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="largo num text-[26px] leading-none font-extrabold">{formatarMoeda(l.valor)}</p>
          <p className="mt-1 text-[14px] text-tinta-2">
            {rotuloDoVencimento(l, hoje)}
            {l.pagoEm && l.forma ? `, no ${nomeDaForma(l.forma).toLowerCase()}` : ''}
            {cliente ? `. ${cliente.nome === SEM_NOME ? 'Cliente sem nome' : cliente.nome}` : ''}
            {l.favorecido ? `. ${l.favorecido}` : ''}
          </p>
          {l.lembradoEm ? <p className="text-[13px] text-tinta-3">{textoDoLembrado(l.lembradoEm)}</p> : null}
        </div>
        <SeloDaConta lancamento={l} hoje={hoje} />
      </div>

      {l.pagoEm ? (
        <Botao variante="secundario" className="self-start" onClick={desfazer}>
          <Undo2 size={16} aria-hidden="true" /> Desfazer o {recebe ? 'recebimento' : 'pagamento'}
        </Botao>
      ) : (
        <section className="flex flex-col gap-2" aria-label={recebe ? 'Receber' : 'Pagar'}>
          <h3 className="font-bold">{recebe ? 'Recebeu?' : 'Pagou?'}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="date" className={classeEntrada} value={dia} onChange={(e) => setDia(e.target.value)} aria-label={recebe ? 'Dia em que recebeu' : 'Dia em que pagou'} />
            <select className={classeEntrada} value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)} aria-label="Forma de pagamento">
              {FORMAS.filter((f) => f.id !== 'fiado').map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <Botao variante="primario" onClick={quitar} className="col-span-2 sm:col-span-1">
              <Check size={17} aria-hidden="true" /> {recebe ? 'Recebi' : 'Paguei'}
            </Botao>
          </div>
          {ehFiadoEmAberto(l) ? <BotaoLembrete itens={[l]} hoje={hoje} className="self-start" /> : null}
        </section>
      )}

      {doc ? (
        <Link href={`/oficina/ordens?aba=ordens&ver=${doc.id}`} className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-caneta hover:underline">
          <ClipboardList size={15} aria-hidden="true" /> Ver a {doc.tipo === 'ordem' ? 'OS' : 'ordem'} nº {doc.numero}
        </Link>
      ) : null}

      <section className="flex flex-col gap-4 border-t border-linha pt-4" aria-label="Editar">
        <CamposDaConta r={r} setR={setR} erros={erros} />
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="escuro" onClick={gravar}>
            Salvar as mudanças
          </Botao>
          <span className="flex-1" />
          {abertasDoGrupo.length > 1 && !l.pagoEm ? (
            <Botao variante="fantasma" onClick={() => apagarConta(true)}>
              Apagar as {abertasDoGrupo.length} em aberto
            </Botao>
          ) : null}
          <button type="button" onClick={() => apagarConta(false)} className="grid h-11 w-11 place-items-center rounded-[10px] text-tinta-3 hover:bg-papel-2 hover:text-atraso" aria-label="Apagar esta conta">
            <Trash2 size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
