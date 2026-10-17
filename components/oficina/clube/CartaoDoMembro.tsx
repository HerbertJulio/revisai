'use client';

// O cartão do membro do clube de manutenção, pelo link que a oficina manda: o plano, os serviços
// incluídos que ainda restam no ano, os descontos, até quando está em dia e a mensalidade em
// aberto com o Pix e o botão "Já paguei".

import { BadgeCheck, Check, Wrench } from 'lucide-react';
import { useState } from 'react';
import { avisarMensalidadePaga } from '@/app/(cliente)/clube/[token]/acoes';
import { CabecalhoDaOficina, FalarComAOficina, Rodape } from '@/components/cliente/comum';
import { Placa } from '@/components/pecas';
import { Botao, Chip, classeEntrada } from '@/components/ui';
import { nomeDaCompetencia, type DadosDoCartao } from '@/lib/clube';
import { formatarData, formatarDiaHora } from '@/lib/datas';
import { formatarMoeda, formatarNumero } from '@/lib/formatos';
import type { OficinaDoLink } from '@/lib/links-publicos';
import { CodigoPix } from '../cobranca-cliente/PaginaPagamento';

const SITUACOES: Record<DadosDoCartao['situacao'], { nome: string; tom: 'ok' | 'oleo' | 'atraso' }> = {
  ativo: { nome: 'Ativo', tom: 'ok' },
  pausado: { nome: 'Pausado', tom: 'oleo' },
  cancelado: { nome: 'Cancelado', tom: 'atraso' }
};

export function CartaoDoMembro({ token, dados, oficina, avisouEm, naoCaiu = false, hoje }: { token: string; dados: DadosDoCartao; oficina: OficinaDoLink; avisouEm: string | null; naoCaiu?: boolean; hoje: string }) {
  const [avisado, setAvisado] = useState<string | null>(avisouEm);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const s = SITUACOES[dados.situacao];
  const atrasada = !!dados.aberta && dados.aberta.vencimento < hoje;

  async function paguei() {
    setOcupado(true);
    setErro(null);
    const r = await avisarMensalidadePaga(token, nome);
    setOcupado(false);
    if (r.ok) setAvisado(r.quando);
    else setErro(r.erro);
  }

  return (
    <article className="mx-auto flex max-w-xl flex-col gap-6">
      <CabecalhoDaOficina oficina={oficina} rotulo="Cartão do clube de manutenção" />

      <section className="flex flex-col gap-3 rounded-2xl bg-tinta px-5 py-5 text-papel">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[14px] text-papel/75">{dados.cliente ? `${dados.cliente}, membro desde ${formatarData(dados.desde)}` : `Membro desde ${formatarData(dados.desde)}`}</p>
            <h2 className="largo text-[30px] leading-tight">Clube {dados.plano.nome}</h2>
          </div>
          <Chip tom={s.tom}>{s.nome}</Chip>
        </div>
        {dados.carro?.placa || dados.carro?.modelo ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {dados.carro.placa ? <Placa placa={dados.carro.placa} /> : null}
            <span className="font-semibold">{dados.carro.modelo}</span>
          </div>
        ) : null}
        <p className="num text-[15px]">
          Mensalidade de <strong>{formatarMoeda(dados.plano.preco)}</strong>
          {dados.pagoAte ? <span className="text-papel/75"> · em dia até {formatarData(dados.pagoAte)}</span> : null}
        </p>
      </section>

      {dados.plano.descricao ? <p className="text-tinta-2">{dados.plano.descricao}</p> : null}

      <section className="flex flex-col gap-2" aria-labelledby="t-beneficios">
        <h2 id="t-beneficios" className="text-[19px]">
          O que o seu plano tem
        </h2>
        <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {dados.beneficios.map((b) => (
            <li key={b.nome} className="flex items-center gap-3 px-4 py-3">
              <Wrench size={17} className="shrink-0 text-tinta-3" aria-hidden="true" />
              <span className="min-w-0 flex-1">{b.nome}</span>
              <span className="num text-[14px] font-semibold">
                {b.restantes > 0 ? `restam ${formatarNumero(b.restantes)} de ${formatarNumero(b.quantidadePorAno)}` : `usou ${formatarNumero(b.quantidadePorAno)} de ${formatarNumero(b.quantidadePorAno)}`}
              </span>
            </li>
          ))}
          {dados.plano.descontoPecas > 0 ? (
            <li className="flex items-center gap-3 px-4 py-3">
              <BadgeCheck size={17} className="shrink-0 text-tinta-3" aria-hidden="true" />
              <span>{formatarNumero(dados.plano.descontoPecas, 2)}% de desconto nas peças</span>
            </li>
          ) : null}
          {dados.plano.descontoServicos > 0 ? (
            <li className="flex items-center gap-3 px-4 py-3">
              <BadgeCheck size={17} className="shrink-0 text-tinta-3" aria-hidden="true" />
              <span>{formatarNumero(dados.plano.descontoServicos, 2)}% de desconto na mão de obra</span>
            </li>
          ) : null}
        </ul>
        {dados.anoAte && dados.beneficios.length ? <p className="text-[13.5px] text-tinta-3">Os serviços incluídos contam até {formatarData(dados.anoAte)} e recomeçam depois.</p> : null}
      </section>

      {dados.aberta ? (
        <section className="flex flex-col gap-4" aria-labelledby="t-mensalidade">
          <div>
            <h2 id="t-mensalidade" className="text-[19px]">
              Mensalidade de {nomeDaCompetencia(dados.aberta.competencia)}
            </h2>
            <p className={`num text-[15px] ${atrasada ? 'font-semibold text-atraso' : 'text-tinta-2'}`}>
              {formatarMoeda(dados.aberta.valor)}, {atrasada ? 'venceu' : 'vence'} em {formatarData(dados.aberta.vencimento)}
            </p>
          </div>
          <CodigoPix codigo={dados.aberta.pix} valor={dados.aberta.valor} />
          {avisado ? (
            <p className="flex items-start gap-2 rounded-2xl bg-ok-claro px-4 py-3.5 text-ok" role="status">
              <Check size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Você avisou que pagou {formatarDiaHora(avisado)}.</strong> A oficina confere o Pix e confirma.
              </span>
            </p>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl bg-papel-2 px-4 py-4">
              {naoCaiu ? <p className="rounded-lg bg-oleo-claro px-3 py-2 text-[14px] text-oleo-tinta">A oficina ainda não achou o seu Pix na conta. Se já pagou, confira o comprovante e avise de novo.</p> : null}
              <p className="font-semibold">Já pagou? Avise a oficina.</p>
              <label className="flex flex-col gap-1.5 text-[14px]" htmlFor="clube-nome">
                Seu nome (opcional)
                <input id="clube-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="name" />
              </label>
              {erro ? (
                <p className="text-sm text-atraso" role="alert">
                  {erro}
                </p>
              ) : null}
              <Botao variante="primario" onClick={paguei} disabled={ocupado} className="self-start">
                <Check size={17} aria-hidden="true" /> Já paguei
              </Botao>
            </div>
          )}
        </section>
      ) : dados.situacao === 'ativo' ? (
        <p className="flex items-start gap-2 rounded-2xl bg-ok-claro px-4 py-3.5 text-ok">
          <BadgeCheck size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Nenhuma mensalidade em aberto.</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <FalarComAOficina oficina={oficina} mensagem={`Olá! Sou do clube ${dados.plano.nome}${dados.carro?.placa ? ` (placa ${dados.carro.placa})` : ''}.`} destaque />
      </div>
      <Rodape>A mensalidade é um Pix por mês, pago pelo código: não é débito automático. O Pix vai direto para a conta da oficina; o Revisaí não recebe nem guarda o pagamento.</Rodape>
    </article>
  );
}
