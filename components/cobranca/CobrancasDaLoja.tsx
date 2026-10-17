'use client';

// As cobranças do Revisaí para a loja: o Pix de cada mês (QR e copia e cola), a situação e a
// nota fiscal. Para o painel da loja (lib/cobranca/loja.ts busca as linhas).

import { Check, Copy, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';
import { QrCode } from '@/components/QrCode';
import { Botao, Chip, classeBotao } from '@/components/ui';
import { NOMES_SITUACAO_PAGAMENTO, type LinhaPagamento } from '@/lib/cobranca/tipos';
import { dataLocal, formatarData } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';

function nomeDoMes(referencia: string | null): string {
  if (!referencia || !/^\d{4}-\d{2}$/.test(referencia)) return 'Mensalidade e comissão';
  const [a, m] = referencia.split('-').map(Number);
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 15)));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a}`;
}

function CopiarPix({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Botao
      variante="escuro"
      tamanho="pequeno"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          setCopiado(false);
        }
      }}
    >
      {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copiado ? 'Copiado' : 'Copiar o Pix'}
    </Botao>
  );
}

export function CobrancasDaLoja({ pagamentos }: { pagamentos: LinhaPagamento[] }) {
  if (!pagamentos.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[21px]">Cobranças do Revisaí</h2>
        <p className="mt-1 text-[15px] text-tinta-2">A comissão das vendas e a mensalidade de cada mês, com a nota fiscal.</p>
      </div>
      <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
        {pagamentos.map((p) => {
          const aberto = p.situacao === 'pendente' || p.situacao === 'atrasado';
          return (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {nomeDoMes(p.referencia)}: {formatarMoeda(p.valor)}
                  </p>
                  <p className="text-[13.5px] text-tinta-3">
                    {p.situacao === 'pago' && p.pago_em ? `Pago em ${formatarData(dataLocal(p.pago_em))}` : p.vencimento ? `Vence em ${formatarData(p.vencimento)}` : ''}
                  </p>
                  {p.nota_situacao === 'emitida' && p.nota_url ? (
                    <a href={p.nota_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-caneta hover:underline">
                      <FileText size={15} aria-hidden="true" /> Nota fiscal{p.nota_numero ? ` nº ${p.nota_numero}` : ''}
                    </a>
                  ) : null}
                </div>
                <Chip tom={p.situacao === 'pago' ? 'ok' : p.situacao === 'atrasado' ? 'atraso' : p.situacao === 'pendente' ? 'oleo' : 'neutro'}>{NOMES_SITUACAO_PAGAMENTO[p.situacao]}</Chip>
              </div>
              {aberto && (p.pix_copia_cola || p.link_pagamento) ? (
                <div className="grid gap-3 rounded-xl bg-papel-2 p-3 sm:grid-cols-[150px_1fr] sm:items-center">
                  {p.pix_copia_cola ? <QrCode texto={p.pix_copia_cola} rotulo={`QR Code do Pix de ${nomeDoMes(p.referencia)}`} className="mx-auto h-[150px] w-[150px] rounded-lg" /> : null}
                  <div className="flex flex-wrap gap-2">
                    {p.pix_copia_cola ? <CopiarPix texto={p.pix_copia_cola} /> : null}
                    {p.link_pagamento ? (
                      <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
                        <ExternalLink size={16} aria-hidden="true" /> Abrir a cobrança
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
