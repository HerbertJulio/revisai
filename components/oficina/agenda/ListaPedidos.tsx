'use client';

// Os pedidos de horário que chegaram pelo link: aceitar (o horário entra na agenda e o cliente
// recebe a confirmação pelo WhatsApp) ou recusar com um recado curto.

import { CalendarCheck, Check, MessageCircle, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, classeArea, classeBotao, Vazio } from '@/components/ui';
import { mensagemConfirmacao, mensagemRecusa, quandoPorExtenso } from '@/lib/agendamento';
import { formatarDiaHora } from '@/lib/datas';
import { formatarTelefone, normalizarTelefone } from '@/lib/formatos';
import { conflitos } from '@/lib/horarios';
import { useOficina } from '@/lib/store';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useAgendamentos, useConfigAgenda, useLinkDeAgendamento } from './comum';
import { responderPedido, usePedidosOnline, type PedidoOnline } from './pedidos';

function novoUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const ROTULO: Record<PedidoOnline['situacao'], { texto: string; tom: 'oleo' | 'ok' | 'neutro' | 'atraso' }> = {
  novo: { texto: 'Esperando', tom: 'oleo' },
  aceito: { texto: 'Aceito', tom: 'ok' },
  recusado: { texto: 'Recusado', tom: 'neutro' },
  cancelado: { texto: 'Cancelado', tom: 'neutro' }
};

export function ListaPedidos({ hoje, aoVerNaAgenda }: { hoje: string; aoVerNaAgenda: (data: string) => void }) {
  const { pedidos, novos, carregado, erro, comConta } = usePedidosOnline();
  const [recusar, setRecusar] = useState<PedidoOnline | null>(null);
  const respondidos = pedidos.filter((p) => p.situacao !== 'novo');

  if (!comConta) return null;
  return (
    <div className="flex flex-col gap-4">
      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      {!carregado ? (
        <p className="text-tinta-2" aria-busy="true">
          Buscando os pedidos...
        </p>
      ) : novos.length ? (
        <ul className="flex flex-col gap-3" aria-label="Pedidos esperando resposta">
          {novos.map((p) => (
            <li key={p.id}>
              <CartaoPedido p={p} hoje={hoje} aoRecusar={() => setRecusar(p)} aoVerNaAgenda={aoVerNaAgenda} />
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo="Nenhum pedido esperando">Quando um cliente pedir um horário pelo link, o pedido aparece aqui (e chega o aviso, se estiver ligado).</Vazio>
      )}
      {respondidos.length ? (
        <details className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
          <summary className="cursor-pointer font-semibold text-tinta-2">Respondidos nos últimos 30 dias ({respondidos.length})</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {respondidos.map((p) => (
              <li key={p.id}>
                <CartaoPedido p={p} hoje={hoje} aoRecusar={() => setRecusar(p)} aoVerNaAgenda={aoVerNaAgenda} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <FolhaRecusa pedido={recusar} hoje={hoje} aoFechar={() => setRecusar(null)} />
    </div>
  );
}

function CartaoPedido({ p, hoje, aoRecusar, aoVerNaAgenda }: { p: PedidoOnline; hoje: string; aoRecusar: () => void; aoVerNaAgenda: (data: string) => void }) {
  const { banco } = useConta();
  const toast = useToast();
  const config = useConfigAgenda();
  const agendamentos = useAgendamentos();
  const oficina = useOficina((s) => s.oficina);
  const agendamento = useOficina((s) => (p.agendamentoId ? s.agendamentos[p.agendamentoId] : undefined));
  const [ocupado, setOcupado] = useState(false);
  const rotulo = ROTULO[p.situacao];

  const avisos = useMemo(
    () => (p.situacao === 'novo' ? conflitos(config, { data: p.data, hora: p.hora, duracaoMin: p.duracaoMin }, agendamentos).filter((c) => c.tipo !== 'fora') : []),
    [p, config, agendamentos]
  );

  const confirmacao = p.situacao === 'aceito' && p.data >= hoje ? linkWhatsApp(p.telefone, mensagemConfirmacao({ cliente: p.nome, oficina, data: agendamento?.data ?? p.data, hora: agendamento?.hora ?? p.hora, servico: p.servico, hoje })) : null;

  async function aceitar() {
    const sb = banco();
    if (!sb) return;
    setOcupado(true);
    const id = novoUuid();
    const r = await responderPedido(sb, p.id, 'aceito', id);
    setOcupado(false);
    if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
    const s = useOficina.getState();
    // outro aparelho aceitou antes: o horário dele chega pela sincronização
    if (r.agendamentoId === id) {
      const veiculo = p.placa ? Object.values(s.veiculos).find((v) => v.placa === p.placa) : undefined;
      const cliente = veiculo ? s.clientes[veiculo.clienteId] : Object.values(s.clientes).find((c) => normalizarTelefone(c.telefone) === p.telefone);
      s.salvarRegistro('agendamentos', {
        id,
        data: p.data,
        hora: p.hora,
        duracaoMin: p.duracaoMin,
        clienteId: cliente?.id ?? null,
        veiculoId: veiculo?.id ?? null,
        nome: p.nome,
        telefone: p.telefone,
        placa: p.placa ?? undefined,
        servico: p.servico,
        observacao: p.observacao ?? undefined,
        profissionalId: null,
        situacao: 'confirmado',
        origem: 'online',
        pedidoOnlineId: p.id
      });
    }
    toast({ texto: 'Pedido aceito: o horário está na agenda. Mande a confirmação para o cliente.' });
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha" aria-label={`Pedido de ${p.nome}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="largo text-[18px] font-extrabold first-letter:uppercase">{quandoPorExtenso(p.data, p.hora, hoje)}</p>
          <p className="text-[13px] text-tinta-3">Pedido {formatarDiaHora(p.criadoEm)}</p>
        </div>
        <Chip tom={rotulo.tom}>{rotulo.texto}</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.placa ? <Placa placa={p.placa} /> : null}
        <p className="font-bold">{p.nome}</p>
        <a href={linkWhatsApp(p.telefone, '') ?? '#'} target="_blank" rel="noopener noreferrer" className="num text-[14px] text-caneta hover:underline">
          {formatarTelefone(p.telefone)}
        </a>
      </div>
      <p className="text-[14.5px] text-tinta-2">
        {p.servico}
        {p.observacao ? <span className="block text-[14px] text-tinta-3">“{p.observacao}”</span> : null}
      </p>
      {avisos.length ? (
        <div className="flex flex-col gap-1 rounded-xl bg-oleo-claro px-3 py-2 text-[13.5px] text-oleo-tinta">
          {avisos.map((a) => (
            <p key={a.tipo} className="flex items-start gap-2">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {a.texto}
            </p>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-linha pt-3">
        {p.situacao === 'novo' ? (
          <>
            <Botao variante="primario" tamanho="pequeno" onClick={() => void aceitar()} disabled={ocupado}>
              <Check size={15} aria-hidden="true" /> {ocupado ? 'Aceitando...' : 'Aceitar'}
            </Botao>
            <Botao tamanho="pequeno" onClick={aoRecusar} disabled={ocupado}>
              <X size={15} aria-hidden="true" /> Recusar
            </Botao>
          </>
        ) : null}
        {confirmacao ? (
          <a href={confirmacao} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
            <MessageCircle size={15} aria-hidden="true" /> Mandar a confirmação
          </a>
        ) : null}
        {p.situacao === 'aceito' ? (
          <Botao tamanho="pequeno" variante="fantasma" onClick={() => aoVerNaAgenda(agendamento?.data ?? p.data)}>
            <CalendarCheck size={15} aria-hidden="true" /> Ver na agenda
          </Botao>
        ) : null}
      </div>
    </article>
  );
}

function FolhaRecusa({ pedido, hoje, aoFechar }: { pedido: PedidoOnline | null; hoje: string; aoFechar: () => void }) {
  return (
    <Folha aberta={!!pedido} aoFechar={aoFechar} titulo="Recusar o pedido" descricao={pedido ? `${pedido.nome}, ${quandoPorExtenso(pedido.data, pedido.hora, hoje)}` : undefined}>
      {pedido ? <FormularioRecusa key={pedido.id} pedido={pedido} hoje={hoje} aoFechar={aoFechar} /> : null}
    </Folha>
  );
}

function FormularioRecusa({ pedido, hoje, aoFechar }: { pedido: PedidoOnline; hoje: string; aoFechar: () => void }) {
  const { banco } = useConta();
  const toast = useToast();
  const oficina = useOficina((s) => s.oficina);
  const link = useLinkDeAgendamento();
  const [motivo, setMotivo] = useState('Esse horário não está mais livre.');
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState(pedido.situacao !== 'novo');
  const mensagem = mensagemRecusa({ cliente: pedido.nome, oficina, data: pedido.data, hora: pedido.hora, hoje, motivo, link });
  const whatsapp = linkWhatsApp(pedido.telefone, mensagem);

  async function recusar() {
    const sb = banco();
    if (!sb) return;
    setOcupado(true);
    const r = await responderPedido(sb, pedido.id, 'recusado');
    setOcupado(false);
    if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
    setFeito(true);
  }

  if (feito) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-tinta-2">Pedido recusado. Avise o cliente pelo WhatsApp (a mensagem já vai pronta{link ? ', com o link para escolher outro horário' : ''}).</p>
        <p className="rounded-xl bg-ok-claro px-4 py-3 text-[14.5px] leading-relaxed">{mensagem}</p>
        <div className="flex justify-end gap-2 border-t border-linha pt-4">
          <Botao onClick={aoFechar}>Fechar</Botao>
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp')} onClick={aoFechar}>
              <MessageCircle size={17} aria-hidden="true" /> Avisar no WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Recado curto" htmlFor="ag-motivo" dica="Vai na mensagem do WhatsApp para o cliente.">
        <textarea id="ag-motivo" rows={2} maxLength={200} className={classeArea} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <div className="flex justify-end gap-2 border-t border-linha pt-4">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="perigo" onClick={() => void recusar()} disabled={ocupado}>
          {ocupado ? 'Recusando...' : 'Recusar o pedido'}
        </Botao>
      </div>
    </div>
  );
}
