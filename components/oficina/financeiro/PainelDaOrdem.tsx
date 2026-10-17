'use client';

// No detalhe da ordem de serviço (só para o dono e o gerente): o que já foi recebido, o que
// está em aberto, quanto falta receber e o botão Receber (à vista, no crédito parcelado da
// maquininha, no boleto ou no fiado com o dia de pagar). E quem fez o serviço, para a comissão.

import { Check, HandCoins, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, classeEntrada } from '@/components/ui';
import { formatarData, somarDias } from '@/lib/datas';
import { tituloDoDocumento } from '@/lib/documentos';
import { dividirEmParcelas, FORMAS, FORMAS_NA_HORA, montarRecebimento, nomeDaForma, pagamentoDaOrdem, rotuloDoVencimento, vencimentosDasParcelas } from '@/lib/financeiro';
import { formatarMoeda, formatarNumero, lerNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import type { FormaPagamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Documento } from '@/lib/tipos';
import { FolhaDentro, gerarId, textoDaParcela, useGestao } from './comum';
import { FolhaDaConta } from './FolhaConta';

export function PainelDaOrdem({ doc }: { doc: Documento }) {
  const gestao = useGestao();
  if (doc.tipo !== 'ordem' || !gestao || doc.situacao === 'cancelada') return null;
  return <Painel doc={doc} />;
}

function Painel({ doc }: { doc: Documento }) {
  const hoje = useHoje();
  const lancamentos = useOficina((s) => s.lancamentos);
  const p = useMemo(() => pagamentoDaOrdem(doc, Object.values(lancamentos)), [doc, lancamentos]);
  const [receber, setReceber] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const semValor = p.total <= 0 && !p.lancamentos.length;

  return (
    <section className="flex flex-col gap-3 rounded-xl px-3.5 py-3 ring-1 ring-linha" aria-label="Pagamento da ordem">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold">
          <HandCoins size={17} aria-hidden="true" /> Pagamento
        </h3>
        {p.falta <= 0 && p.lancamentos.length ? <Chip tom={p.aReceber > 0 ? 'oleo' : 'ok'}>{p.aReceber > 0 ? 'Tudo lançado' : 'Recebido'}</Chip> : null}
      </div>

      {semValor ? (
        <p className="text-[14px] text-tinta-3">A ordem ainda está sem valor.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 text-[13px]">
            <div className="rounded-lg bg-papel-2 px-2.5 py-2">
              <dt className="text-tinta-3">Recebido</dt>
              <dd className="num text-[16px] font-extrabold">{formatarMoeda(p.recebido)}</dd>
            </div>
            <div className="rounded-lg bg-papel-2 px-2.5 py-2">
              <dt className="text-tinta-3">Em aberto</dt>
              <dd className="num text-[16px] font-extrabold">{formatarMoeda(p.aReceber)}</dd>
            </div>
            <div className={`rounded-lg px-2.5 py-2 ${p.falta > 0 ? 'bg-oleo-claro text-oleo-tinta' : 'bg-papel-2'}`}>
              <dt className={p.falta > 0 ? '' : 'text-tinta-3'}>{p.falta < 0 ? 'Lançado a mais' : 'Falta receber'}</dt>
              <dd className="num text-[16px] font-extrabold">{formatarMoeda(Math.abs(p.falta))}</dd>
            </div>
          </dl>
          {p.lancamentos.length ? (
            <ul className="flex flex-col divide-y divide-linha text-[14px]">
              {p.lancamentos.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setAberta(l.id)} className="flex w-full items-center gap-2 py-1.5 text-left hover:text-caneta">
                    <span className="min-w-0 flex-1 truncate">
                      {nomeDaForma(l.forma)}
                      {textoDaParcela(l) ? <span className="text-tinta-3"> {textoDaParcela(l)}</span> : null}
                      <span className={`text-[12.5px] ${!l.pagoEm && l.vencimento < hoje ? 'font-semibold text-atraso' : 'text-tinta-3'}`}> · {rotuloDoVencimento(l, hoje)}</span>
                    </span>
                    <span className="num font-semibold">{formatarMoeda(l.valor)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {p.falta > 0 ? (
            <Botao variante="primario" className="self-start" onClick={() => setReceber(true)}>
              <HandCoins size={17} aria-hidden="true" /> Receber {formatarMoeda(p.falta)}
            </Botao>
          ) : (
            <button type="button" onClick={() => setReceber(true)} className="self-start text-[14px] font-semibold text-caneta hover:underline">
              Lançar outro recebimento
            </button>
          )}
        </>
      )}

      <QuemFez doc={doc} />

      <FolhaDentro>
        <FolhaReceber doc={doc} aberta={receber} valorSugerido={Math.max(0, p.falta)} aoFechar={() => setReceber(false)} />
        <FolhaDaConta id={aberta} aoFechar={() => setAberta(null)} />
      </FolhaDentro>
    </section>
  );
}

/** O mecânico responsável pela ordem (a comissão usa o de cada linha quando houver). */
function QuemFez({ doc }: { doc: Documento }) {
  const profissionais = useOficina((s) => s.profissionais);
  const salvarDocumento = useOficina((s) => s.salvarDocumento);
  const toast = useToast();
  const lista = useMemo(() => Object.values(profissionais).filter((p) => p.ativo || p.id === doc.profissionalId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [profissionais, doc.profissionalId]);
  if (!lista.length)
    return (
      <p className="flex items-center gap-2 border-t border-linha pt-3 text-[13.5px] text-tinta-3">
        <UserRound size={15} aria-hidden="true" />
        <span>
          Cadastre os mecânicos em{' '}
          <Link href="/oficina/agenda?aba=profissionais" className="font-semibold text-caneta hover:underline">
            Profissionais
          </Link>{' '}
          para marcar quem fez e ver a comissão.
        </span>
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-3">
      <label htmlFor={`quem-${doc.id}`} className="flex items-center gap-2 text-[14px] font-semibold">
        <UserRound size={16} aria-hidden="true" /> Quem fez
      </label>
      <select
        id={`quem-${doc.id}`}
        className={`${classeEntrada} h-10 w-auto min-w-[180px] flex-1 sm:flex-none`}
        value={doc.profissionalId ?? ''}
        onChange={(e) => {
          const atual = useOficina.getState().documentos[doc.id] ?? doc;
          salvarDocumento({ ...atual, profissionalId: e.target.value || null });
          const p = e.target.value ? profissionais[e.target.value] : null;
          toast({ texto: p ? `${tituloDoDocumento(doc)} feita por ${p.nome}.` : 'Sem responsável na ordem.' });
        }}
      >
        <option value="">Ninguém marcado</option>
        {lista.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
    </div>
  );
}

const FORMAS_DO_RECEBER = FORMAS.filter((f) => f.id !== 'outro');

function FolhaReceber({ doc, aberta, valorSugerido, aoFechar }: { doc: Documento; aberta: boolean; valorSugerido: number; aoFechar: () => void }) {
  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo={`Receber da ${tituloDoDocumento(doc)}`} descricao="Escolha como o cliente pagou. O que entra hoje vai para o caixa do dia.">
      {aberta ? <FormReceber doc={doc} valorSugerido={valorSugerido} aoFechar={aoFechar} /> : null}
    </Folha>
  );
}

function FormReceber({ doc, valorSugerido, aoFechar }: { doc: Documento; valorSugerido: number; aoFechar: () => void }) {
  const hoje = useHoje();
  const toast = useToast();
  const salvar = useOficina((s) => s.salvarRegistro);
  const clienteId = useOficina((s) => (doc.veiculoId ? (s.veiculos[doc.veiculoId]?.clienteId ?? null) : null));
  const [valorTexto, setValorTexto] = useState(valorSugerido > 0 ? formatarNumero(valorSugerido, 2) : '');
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [parcelas, setParcelas] = useState(1);
  const [antecipado, setAntecipado] = useState(false);
  const [vencimento, setVencimento] = useState(somarDias(hoje, 30));
  const [erro, setErro] = useState<string | null>(null);
  const valor = lerNumero(valorTexto) ?? 0;
  const naHora = FORMAS_NA_HORA.includes(forma);
  const vezes = naHora ? 1 : parcelas;

  const previa = useMemo(() => {
    if (!(valor > 0)) return null;
    if (naHora || (forma === 'credito' && antecipado)) return `Entra hoje: ${formatarMoeda(valor)} no ${nomeDaForma(forma).toLowerCase()}.`;
    const valores = dividirEmParcelas(valor, vezes);
    const datas = forma === 'credito' ? vencimentosDasParcelas(somarDias(hoje, 30), vezes, '30dias') : vencimentosDasParcelas(vencimento, vezes);
    const quem = forma === 'credito' ? 'da maquininha' : forma === 'fiado' ? 'no fiado' : 'no boleto';
    if (vezes === 1) return `Fica em aberto ${quem}: ${formatarMoeda(valor)} em ${formatarData(datas[0])}.`;
    return `${vezes} parcelas ${quem}: ${valores[0] === valores[valores.length - 1] ? `${vezes} de ${formatarMoeda(valores[0])}` : `a primeira de ${formatarMoeda(valores[0])} e as outras de ${formatarMoeda(valores[1])}`}, de ${formatarData(datas[0])} a ${formatarData(datas[datas.length - 1])}.`;
  }, [valor, naHora, forma, antecipado, vezes, vencimento, hoje]);

  function confirmar() {
    if (!(valor > 0)) return setErro('Escreva quanto o cliente pagou.');
    if (valor > 10_000_000) return setErro('Confira o valor.');
    if (!naHora && forma !== 'credito' && !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return setErro('Escolha o dia de pagar.');
    if (valor * 100 < vezes) return setErro('O valor é pequeno demais para tantas parcelas.');
    const itens = montarRecebimento({ valor, forma, parcelas: vezes, vencimento, antecipado, hoje, descricao: tituloDoDocumento(doc), categoria: 'servico', clienteId, documentoId: doc.id }, gerarId);
    for (const i of itens) salvar('lancamentos', i);
    toast({ texto: naHora || (forma === 'credito' && antecipado) ? `${formatarMoeda(valor)} no caixa de hoje.` : itens.length > 1 ? `${itens.length} parcelas lançadas.` : 'Lançado a receber.' });
    aoFechar();
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Valor" htmlFor="rec-valor" erro={erro}>
        <input id="rec-valor" className={`${classeEntrada} num text-[20px] font-bold`} value={valorTexto} onChange={(e) => (setValorTexto(e.target.value), setErro(null))} inputMode="decimal" placeholder="0,00" />
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">Como pagou</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {FORMAS_DO_RECEBER.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={forma === f.id}
              onClick={() => {
                setForma(f.id);
                if (FORMAS_NA_HORA.includes(f.id)) setParcelas(1);
              }}
              className={`h-11 rounded-[10px] border text-[14.5px] font-semibold ${forma === f.id ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
            >
              {f.nome}
            </button>
          ))}
        </div>
      </fieldset>
      {!naHora ? (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Em quantas vezes" htmlFor="rec-vezes">
            <select id="rec-vezes" className={classeEntrada} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? (forma === 'credito' ? 'À vista' : 'De uma vez') : `${n} vezes`}
                </option>
              ))}
            </select>
          </Campo>
          {forma === 'credito' ? null : (
            <Campo rotulo={parcelas > 1 ? '1º pagamento' : 'Dia de pagar'} htmlFor="rec-venc">
              <input id="rec-venc" type="date" className={classeEntrada} value={vencimento} min={hoje} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>
          )}
        </div>
      ) : null}
      {forma === 'credito' ? <Alternar id="rec-antecipa" ligado={antecipado} aoMudar={setAntecipado} rotulo="A maquininha antecipa" descricao="O dinheiro cai todo hoje, mesmo parcelado. Senão, a maquininha paga uma parcela a cada 30 dias." /> : null}
      {previa ? <p className="rounded-xl bg-papel-2 px-3.5 py-2.5 text-[14px] text-tinta-2">{previa}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-linha pt-4">
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao variante="primario" onClick={confirmar}>
          <Check size={17} aria-hidden="true" /> Receber
        </Botao>
      </div>
    </div>
  );
}
