'use client';

// O checklist de entrada no detalhe da ordem (ou do orçamento) e na página do carro.

import { ClipboardCheck, PenLine } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Botao, classeBotao } from '@/components/ui';
import { dataHora } from '@/components/cliente/comum';
import { combustivelEmTexto, pendenciasDoChecklist } from '@/lib/checklist';
import { formatarKm } from '@/lib/formatos';
import type { Checklist } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Documento, Id } from '@/lib/tipos';
import { CaixaDoServico } from './comum';

/** Cria o checklist (ligado à ordem e ao carro) e devolve o id. */
export function criarChecklist(ctx: { documentoId?: Id | null; veiculoId?: Id | null }): Id | null {
  const s = useOficina.getState();
  const doc = ctx.documentoId ? s.documentos[ctx.documentoId] : undefined;
  if (doc?.checklistId && s.checklists[doc.checklistId]) return doc.checklistId;
  const veiculoId = ctx.veiculoId ?? doc?.veiculoId ?? null;
  const veiculo = veiculoId ? s.veiculos[veiculoId] : undefined;
  const id = s.salvarRegistro('checklists', {
    documentoId: doc?.id ?? null,
    veiculoId,
    clienteId: veiculo?.clienteId ?? null,
    km: doc?.km ?? null,
    combustivel: null,
    itens: {},
    avarias: [],
    fotos: [],
    observacao: '',
    assinatura: null
  });
  if (doc) useOficina.getState().salvarDocumento({ ...useOficina.getState().documentos[doc.id], checklistId: id });
  return id;
}

function Resumo({ c }: { c: Checklist }) {
  const p = pendenciasDoChecklist(c);
  const partes = [
    c.km != null ? formatarKm(c.km) : null,
    c.combustivel != null ? combustivelEmTexto(c.combustivel) : null,
    p.avarias ? `${p.avarias} ${p.avarias === 1 ? 'avaria' : 'avarias'}` : 'sem avarias',
    p.faltam.length ? `falta: ${p.faltam.join(', ').toLowerCase()}` : null
  ].filter(Boolean);
  return (
    <>
      <p className="text-[14px] text-tinta-2">{partes.join(' · ')}</p>
      <p className={`flex items-center gap-1.5 text-[13.5px] font-semibold ${c.assinatura ? 'text-ok' : 'text-oleo-tinta'}`}>
        <PenLine size={14} aria-hidden="true" />
        {c.assinatura ? `Assinado por ${c.assinatura.nome} em ${dataHora(c.assinatura.quando)}` : 'Falta a assinatura do cliente'}
      </p>
    </>
  );
}

export function PainelDoChecklist({ doc }: { doc: Documento }) {
  const router = useRouter();
  const checklist = useOficina((s) => (doc.checklistId ? s.checklists[doc.checklistId] : undefined));
  if (doc.situacao === 'cancelada' || doc.situacao === 'recusado') return null;
  if (!checklist) {
    // depois de pronto não faz sentido o checklist de entrada; aprovado, ele é feito na ordem
    if (doc.situacao === 'concluida' || doc.situacao === 'aprovado' || !doc.veiculoId) return null;
    return (
      <CaixaDoServico titulo="Checklist de entrada" icone={<ClipboardCheck size={18} aria-hidden="true" />}>
        <p className="text-[14px] text-tinta-2">Como o carro chegou: km, combustível, itens, avarias com foto e a assinatura do cliente.</p>
        <Botao
          tamanho="pequeno"
          className="self-start"
          onClick={() => {
            const id = criarChecklist({ documentoId: doc.id });
            if (id) router.push(`/oficina/checklist?id=${id}`);
          }}
        >
          <ClipboardCheck size={15} aria-hidden="true" /> Fazer o checklist
        </Botao>
      </CaixaDoServico>
    );
  }
  return (
    <CaixaDoServico
      titulo="Checklist de entrada"
      icone={<ClipboardCheck size={18} aria-hidden="true" />}
      acao={
        <Link href={`/oficina/checklist?id=${checklist.id}`} className={classeBotao('fantasma', 'pequeno')}>
          Abrir
        </Link>
      }
    >
      <Resumo c={checklist} />
    </CaixaDoServico>
  );
}

export function ChecklistsDoCarro({ veiculoId }: { veiculoId: Id }) {
  const router = useRouter();
  const checklists = useOficina((s) => s.checklists);
  const lista = useMemo(
    () =>
      Object.values(checklists)
        .filter((c) => c.veiculoId === veiculoId)
        .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)),
    [checklists, veiculoId]
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="t-checklists">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="t-checklists" className="text-[21px]">
            Checklists de entrada
          </h2>
          <p className="mt-1 text-[15px] text-tinta-2">Como o carro chegou em cada visita, com fotos e a assinatura do cliente.</p>
        </div>
        <Botao
          tamanho="pequeno"
          onClick={() => {
            const id = criarChecklist({ veiculoId });
            if (id) router.push(`/oficina/checklist?id=${id}`);
          }}
        >
          <ClipboardCheck size={15} aria-hidden="true" /> Fazer
        </Botao>
      </div>
      {lista.length ? (
        <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {lista.slice(0, 10).map((c) => (
            <li key={c.id}>
              <Link href={`/oficina/checklist?id=${c.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-papel-2 sm:px-5">
                <span className="font-semibold">{dataHora(c.criadoEm)}</span>
                <Resumo c={c} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
