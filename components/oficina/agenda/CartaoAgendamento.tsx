'use client';

// Um horário da agenda: quem, qual carro, o serviço e a situação, com o próximo passo à mão
// (confirmou, chegou, concluir), o WhatsApp de confirmação e o lembrete da véspera.

import { BellRing, Check, ClipboardList, Globe, MessageCircle, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, type ItemMenu } from '@/components/Menu';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Chip, classeBotao } from '@/components/ui';
import { emAberto, linkDaOrdem, ROTULO_SITUACAO } from '@/lib/agendamento';
import { diasEntre } from '@/lib/datas';
import { duracaoTexto } from '@/lib/horarios';
import type { Agendamento, SituacaoAgendamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import { mudarSituacao, useMensagensDoHorario } from './comum';

const TOM: Record<SituacaoAgendamento, 'neutro' | 'oleo' | 'atraso' | 'ok' | 'caneta'> = {
  marcado: 'neutro',
  confirmado: 'caneta',
  chegou: 'oleo',
  concluido: 'ok',
  faltou: 'atraso',
  cancelado: 'neutro'
};

export function ChipSituacao({ situacao }: { situacao: SituacaoAgendamento }) {
  return <Chip tom={TOM[situacao]}>{ROTULO_SITUACAO[situacao]}</Chip>;
}

export function CartaoAgendamento({ a, hoje, aoEditar, mostrarDia = false }: { a: Agendamento; hoje: string; aoEditar: (id: string) => void; mostrarDia?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const profissional = useOficina((s) => (a.profissionalId ? s.profissionais[a.profissionalId] : undefined));
  const ordem = useOficina((s) => (a.documentoId ? s.documentos[a.documentoId] : undefined));
  const { quem, confirmacao, lembrete } = useMensagensDoHorario(a, hoje);
  const aberto = emAberto(a.situacao);
  const dias = diasEntre(hoje, a.data);
  const lembrar = aberto && a.situacao !== 'chegou' && (dias === 1 || dias === 0) && !!lembrete;
  const riscado = a.situacao === 'cancelado' || a.situacao === 'faltou';

  function chegou() {
    mudarSituacao(a, 'chegou');
    if (ordem) return;
    toast({ texto: 'Carro na oficina. Abra a ordem de serviço.' });
    router.push(linkDaOrdem(a, quem.veiculo?.id ?? null));
  }

  const menu: ItemMenu[] = [{ rotulo: 'Mudar', fazer: () => aoEditar(a.id) }];
  if (aberto) {
    if (a.situacao !== 'chegou') menu.push({ rotulo: 'Faltou', fazer: () => mudarSituacao(a, 'faltou') });
    menu.push({ rotulo: 'Cancelar o horário', fazer: () => mudarSituacao(a, 'cancelado'), perigo: true });
    if (a.situacao === 'confirmado') menu.push({ rotulo: 'Voltar para marcado', fazer: () => mudarSituacao(a, 'marcado') });
    if (a.situacao === 'chegou') menu.push({ rotulo: 'Ainda não chegou', fazer: () => mudarSituacao(a, 'confirmado') });
  } else if (a.situacao === 'concluido') menu.push({ rotulo: 'Reabrir', fazer: () => mudarSituacao(a, 'chegou') });
  else menu.push({ rotulo: 'Marcar de novo', fazer: () => mudarSituacao(a, 'marcado') });

  return (
    <article className={`flex flex-col gap-3 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha ${riscado ? 'opacity-70' : ''}`} aria-label={`${a.hora}, ${quem.nome}`}>
      <div className="flex items-start gap-3">
        <div className="w-14 shrink-0 pt-0.5">
          <p className={`largo num text-[20px] leading-none font-extrabold ${riscado ? 'line-through' : ''}`}>{a.hora}</p>
          <p className="mt-1 text-[12px] text-tinta-3">{duracaoTexto(a.duracaoMin)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {quem.placa ? <Placa placa={quem.placa} /> : null}
            <p className="min-w-0 truncate font-bold">{quem.nome}</p>
          </div>
          <p className="mt-0.5 text-[14px] text-tinta-2">
            {a.servico}
            {quem.carro ? <span className="text-tinta-3">, {quem.carro}</span> : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-tinta-3">
            <ChipSituacao situacao={a.situacao} />
            {mostrarDia ? <span className="num">{a.data.slice(8, 10)}/{a.data.slice(5, 7)}</span> : null}
            {a.origem === 'online' ? (
              <span className="inline-flex items-center gap-1">
                <Globe size={13} aria-hidden="true" /> pelo link
              </span>
            ) : null}
            {profissional ? (
              <span className="inline-flex items-center gap-1">
                <UserRound size={13} aria-hidden="true" /> {profissional.nome}
              </span>
            ) : null}
            {a.lembradoEm && aberto ? (
              <span className="inline-flex items-center gap-1">
                <BellRing size={13} aria-hidden="true" /> lembrado
              </span>
            ) : null}
          </div>
          {a.observacao ? <p className="mt-1 text-[13.5px] text-tinta-2">{a.observacao}</p> : null}
        </div>
        <Menu itens={menu} rotulo={`Mais opções do horário de ${quem.nome}`} />
      </div>

      {aberto || ordem ? (
        <div className="flex flex-wrap gap-2 border-t border-linha pt-3">
          {a.situacao === 'marcado' ? (
            <button type="button" className={classeBotao('secundario', 'pequeno')} onClick={() => mudarSituacao(a, 'confirmado')}>
              <Check size={15} aria-hidden="true" /> Cliente confirmou
            </button>
          ) : null}
          {a.situacao === 'marcado' || a.situacao === 'confirmado' ? (
            <button type="button" className={classeBotao(dias <= 0 ? 'escuro' : 'secundario', 'pequeno')} onClick={chegou}>
              Chegou
            </button>
          ) : null}
          {a.situacao === 'chegou' ? (
            <button
              type="button"
              className={classeBotao('primario', 'pequeno')}
              onClick={() => {
                mudarSituacao(a, 'concluido');
                toast({ texto: 'Horário concluído.' });
              }}
            >
              <Check size={15} aria-hidden="true" /> Concluir
            </button>
          ) : null}
          {ordem ? (
            <Link href={`/oficina/ordens?aba=ordens&ver=${ordem.id}`} className={classeBotao('secundario', 'pequeno')}>
              <ClipboardList size={15} aria-hidden="true" /> OS nº {ordem.numero}
            </Link>
          ) : a.situacao === 'chegou' ? (
            <Link href={linkDaOrdem(a, quem.veiculo?.id ?? null)} className={classeBotao('secundario', 'pequeno')}>
              <ClipboardList size={15} aria-hidden="true" /> Abrir a OS
            </Link>
          ) : null}
          {a.situacao === 'marcado' && confirmacao ? (
            <a href={confirmacao} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
              <MessageCircle size={15} aria-hidden="true" /> Confirmar
            </a>
          ) : null}
          {lembrar ? (
            <a
              href={lembrete!}
              target="_blank"
              rel="noopener noreferrer"
              className={classeBotao(a.lembradoEm ? 'secundario' : 'whatsapp', 'pequeno')}
              onClick={() => mudarSituacao(a, a.situacao, { lembradoEm: new Date().toISOString() })}
            >
              <BellRing size={15} aria-hidden="true" /> {a.lembradoEm ? 'Lembrar de novo' : 'Lembrar'}
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
