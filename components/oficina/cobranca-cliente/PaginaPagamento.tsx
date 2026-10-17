'use client';

// A página do Pix que a oficina manda ao cliente: o valor, o QR Code, o código para copiar e o
// botão "Já paguei", que avisa a oficina. O Pix vai direto para a conta da oficina.

import { BadgeCheck, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { avisarQuePaguei } from '@/app/(cliente)/pagar/[token]/acoes';
import { CabecalhoDaOficina, FalarComAOficina, Rodape } from '@/components/cliente/comum';
import { QrCode } from '@/components/QrCode';
import { Botao, classeEntrada } from '@/components/ui';
import type { DadosDoPagamento } from '@/lib/cobranca-cliente';
import { formatarData, formatarDiaHora } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import type { OficinaDoLink } from '@/lib/links-publicos';

export function CodigoPix({ codigo, valor }: { codigo: string; valor: number }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 4000);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <QrCode texto={codigo} rotulo={`QR Code do Pix de ${formatarMoeda(valor)}`} className="h-60 w-60 shrink-0 rounded-xl ring-1 ring-linha" />
      <div className="flex w-full min-w-0 flex-col gap-2">
        <p className="text-[14.5px] text-tinta-2">Abra o app do seu banco, escolha Pix e aponte a câmera para o QR Code. Ou copie o código e cole em &quot;Pix copia e cola&quot;.</p>
        <p className="num rounded-lg bg-papel-2 px-3 py-2 text-[12.5px] break-all text-tinta-2" aria-label="Pix copia e cola" data-pix={codigo}>
          {codigo}
        </p>
        <Botao variante="escuro" onClick={copiar} className="self-start">
          {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copiado ? 'Código copiado' : 'Copiar o código Pix'}
        </Botao>
      </div>
    </div>
  );
}

export function PaginaPagamento({
  token,
  dados,
  oficina,
  avisouEm,
  naoCaiu = false,
  hoje
}: {
  token: string;
  dados: DadosDoPagamento;
  oficina: OficinaDoLink;
  avisouEm: string | null;
  /** O cliente avisou antes e a oficina ainda não achou o Pix. */
  naoCaiu?: boolean;
  hoje: string;
}) {
  const [avisado, setAvisado] = useState<string | null>(avisouEm);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const vencido = !!dados.validade && hoje > dados.validade;

  async function paguei() {
    setOcupado(true);
    setErro(null);
    const r = await avisarQuePaguei(token, nome);
    setOcupado(false);
    if (r.ok) setAvisado(r.quando);
    else setErro(r.erro);
  }

  return (
    <article className="mx-auto flex max-w-xl flex-col gap-6">
      <CabecalhoDaOficina oficina={oficina} rotulo="Pagamento por Pix" />

      <section className="flex flex-col gap-1">
        {dados.cliente ? <p className="text-[17px]">Olá, {dados.cliente}!</p> : null}
        <p className="text-tinta-2">{dados.descricao || dados.titulo || 'Cobrança da oficina'}</p>
        <p className="largo num text-[40px] leading-tight font-extrabold" data-valor={dados.valor}>
          {formatarMoeda(dados.valor)}
        </p>
        {dados.recebedor ? (
          <p className="text-[14px] text-tinta-3">
            Para {dados.recebedor}
            {dados.chave ? ` · ${dados.chave}` : ''}
          </p>
        ) : null}
      </section>

      {dados.pago ? (
        <p className="flex items-start gap-2 rounded-2xl bg-ok-claro px-4 py-3.5 text-ok" role="status">
          <BadgeCheck size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Pagamento confirmado pela oficina</strong>
            {dados.pagoEm ? ` em ${formatarData(dados.pagoEm)}` : ''}. Obrigado!
          </span>
        </p>
      ) : (
        <>
          <CodigoPix codigo={dados.pix} valor={dados.valor} />
          {vencido ? <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14.5px] text-atraso">Este código venceu em {formatarData(dados.validade)}. Peça um novo para a oficina.</p> : null}
          {avisado ? (
            <p className="flex items-start gap-2 rounded-2xl bg-ok-claro px-4 py-3.5 text-ok" role="status">
              <Check size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Você avisou que pagou{avisado ? ` ${formatarDiaHora(avisado)}` : ''}.</strong> A oficina confere o Pix e confirma.
              </span>
            </p>
          ) : (
            <section className="flex flex-col gap-3 rounded-2xl bg-papel-2 px-4 py-4">
              {naoCaiu ? <p className="rounded-lg bg-oleo-claro px-3 py-2 text-[14px] text-oleo-tinta">A oficina ainda não achou o seu Pix na conta. Se já pagou, confira o comprovante e avise de novo.</p> : null}
              <p className="font-semibold">Já pagou? Avise a oficina.</p>
              <label className="flex flex-col gap-1.5 text-[14px]" htmlFor="paguei-nome">
                Seu nome (opcional)
                <input id="paguei-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="name" />
              </label>
              {erro ? (
                <p className="text-sm text-atraso" role="alert">
                  {erro}
                </p>
              ) : null}
              <Botao variante="primario" onClick={paguei} disabled={ocupado || vencido} className="self-start">
                <Check size={17} aria-hidden="true" /> Já paguei
              </Botao>
            </section>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <FalarComAOficina oficina={oficina} mensagem={`Olá! Sobre o Pix de ${formatarMoeda(dados.valor)}${dados.titulo ? ` (${dados.titulo})` : ''}.`} />
      </div>
      <Rodape>
        {dados.validade && !dados.pago ? `Este código vale até ${formatarData(dados.validade)}. ` : ''}O Pix vai direto para a conta da oficina. O Revisaí só mostra o código: não recebe nem guarda o pagamento.
      </Rodape>
    </article>
  );
}
