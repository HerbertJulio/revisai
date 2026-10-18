'use client';

// Programa de pontos: ligar, dizer quanto vale cada ponto e ver quem tem mais pontos. O cliente
// ganha pontos em cada ordem de serviço concluída e usa como desconto numa próxima (no detalhe
// da ordem). Só para o dono e o gerente.

import { Award, MessageCircle, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Secao, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import {
  configDaFidelidade,
  erroDaConfig,
  historicoDoCliente,
  mensagemDoSaldo,
  percentualDeVolta,
  ranking,
  saldosPorCliente,
  textoDaRegra,
  valorDosPontos,
  type ConfigFidelidade
} from '@/lib/fidelidade';
import { formatarMoeda, formatarNumero, formatarTelefone, lerNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useGestao } from '../cadastro/comum';

export function Fidelidade() {
  const gestao = useGestao();
  const preferencias = useOficina((s) => s.preferencias);
  const fidelidade = useOficina((s) => s.fidelidade);
  const clientes = useOficina((s) => s.clientes);
  const documentos = useOficina((s) => s.documentos);
  const oficina = useOficina((s) => s.oficina);
  const config = useMemo(() => configDaFidelidade(preferencias.fidelidade), [preferencias.fidelidade]);
  const saldos = useMemo(() => saldosPorCliente(Object.values(fidelidade), documentos), [fidelidade, documentos]);
  const lista = useMemo(() => ranking(saldos, clientes), [saldos, clientes]);
  const [aberto, setAberto] = useState<Id | null>(null);

  if (!gestao)
    return (
      <Vazio titulo="Só o dono e o gerente veem a fidelidade" acao={<Link href="/oficina/mais" className={classeBotao()}>Voltar</Link>}>
        Os pontos dos clientes viram desconto, então ficam com quem cuida do dinheiro da oficina.
      </Vazio>
    );

  const emAberto = lista.reduce((s, x) => s + x.saldo, 0);
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="largo text-[30px] sm:text-[34px]">Fidelidade</h1>
        <p className="mt-1 max-w-[62ch] text-tinta-2">O cliente junta pontos a cada serviço e usa como desconto na próxima vez. Quem volta mais, ganha mais.</p>
      </header>

      <Configuracao key={JSON.stringify(preferencias.fidelidade ?? null)} config={config} />

      <Secao
        titulo="Clientes com pontos"
        descricao={lista.length ? `${formatarNumero(lista.length)} ${lista.length === 1 ? 'cliente' : 'clientes'}, ${formatarNumero(emAberto)} pontos em aberto (${formatarMoeda(valorDosPontos(emAberto, config))} em desconto).` : undefined}
      >
        {lista.length ? (
          <ol className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {lista.map((x, i) => {
              const zap = x.cliente.telefone ? linkWhatsApp(x.cliente.telefone, mensagemDoSaldo({ cliente: x.cliente.nome, oficina: oficina.nome, saldo: x.saldo, config })) : null;
              return (
                <li key={x.clienteId} className="flex items-center gap-3 px-4 py-3">
                  <span className="num w-7 shrink-0 text-center font-extrabold text-tinta-3">{i + 1}</span>
                  <button type="button" onClick={() => setAberto(x.clienteId)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-bold">{x.cliente.nome}</span>
                    <span className="block text-[13px] text-tinta-3">
                      ganhou {formatarNumero(x.ganhos)}, usou {formatarNumero(x.usados)}
                      {x.ultimo ? `, último em ${formatarData(x.ultimo)}` : ''}
                    </span>
                  </button>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[18px] leading-tight font-extrabold">{formatarNumero(x.saldo)}</span>
                    <span className="num block text-[12.5px] text-tinta-3">{formatarMoeda(valorDosPontos(x.saldo, config))}</span>
                  </span>
                  {zap ? (
                    <a href={zap} target="_blank" rel="noopener noreferrer" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ok hover:bg-ok-claro" aria-label={`Mandar o saldo para ${x.cliente.nome} no WhatsApp`}>
                      <MessageCircle size={19} />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <Vazio titulo="Ninguém com pontos ainda">
            {config.ativo ? 'Os pontos aparecem aqui quando as ordens de serviço forem concluídas.' : 'Ligue o programa acima. Daí cada ordem de serviço concluída dá pontos ao dono do carro.'}
          </Vazio>
        )}
      </Secao>

      <FolhaCliente clienteId={aberto} config={config} aoFechar={() => setAberto(null)} />
    </div>
  );
}

function Configuracao({ config }: { config: ConfigFidelidade }) {
  const salvar = useOficina((s) => s.salvarPreferencias);
  const toast = useToast();
  const [ativo, setAtivo] = useState(config.ativo);
  const [pontosPorReal, setPontosPorReal] = useState(formatarNumero(config.pontosPorReal, 2));
  const [reaisPorPonto, setReaisPorPonto] = useState(formatarNumero(config.reaisPorPonto, 2));
  const [minimo, setMinimo] = useState(String(config.minimoResgate));
  const [erro, setErro] = useState<string | null>(null);
  const previa = configDaFidelidade({ ativo, pontosPorReal: lerNumero(pontosPorReal) ?? 0, reaisPorPonto: lerNumero(reaisPorPonto) ?? 0, minimoResgate: lerNumero(minimo) ?? 0 });

  function guardar() {
    const c = { pontosPorReal: lerNumero(pontosPorReal), reaisPorPonto: lerNumero(reaisPorPonto), minimoResgate: lerNumero(minimo) };
    const e = erroDaConfig(c);
    setErro(e);
    if (e) return;
    salvar({ fidelidade: { ativo, pontosPorReal: c.pontosPorReal!, reaisPorPonto: c.reaisPorPonto!, minimoResgate: c.minimoResgate! } });
    toast({ texto: ativo ? 'Programa de pontos ligado.' : 'Programa de pontos salvo (desligado).' });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label="Como funcionam os pontos">
      <Alternar
        id="fid-ativo"
        ligado={ativo}
        aoMudar={setAtivo}
        rotulo={
          <span className="inline-flex items-center gap-2">
            <Award size={18} aria-hidden="true" /> Programa de pontos
          </span>
        }
        descricao="Cada ordem de serviço concluída dá pontos ao dono do carro."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Pontos por real gasto" htmlFor="fid-por-real">
          <input id="fid-por-real" className={`${classeEntrada} num`} value={pontosPorReal} onChange={(e) => setPontosPorReal(e.target.value)} inputMode="decimal" />
        </Campo>
        <Campo rotulo="Quanto vale cada ponto (R$)" htmlFor="fid-valor">
          <input id="fid-valor" className={`${classeEntrada} num`} value={reaisPorPonto} onChange={(e) => setReaisPorPonto(e.target.value)} inputMode="decimal" />
        </Campo>
        <Campo rotulo="Mínimo para usar (pontos)" htmlFor="fid-minimo">
          <input id="fid-minimo" className={`${classeEntrada} num`} value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="numeric" />
        </Campo>
      </div>
      <p className="text-[14px] text-tinta-2">
        {textoDaRegra(previa)} Volta para o cliente {formatarNumero(percentualDeVolta(previa) * 100, 2)}% do que ele gasta.
      </p>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <Botao variante="primario" className="self-start" onClick={guardar}>
        Salvar
      </Botao>
    </section>
  );
}

function FolhaCliente({ clienteId, config, aoFechar }: { clienteId: Id | null; config: ConfigFidelidade; aoFechar: () => void }) {
  const cliente = useOficina((s) => (clienteId ? s.clientes[clienteId] : undefined));
  const fidelidade = useOficina((s) => s.fidelidade);
  const documentos = useOficina((s) => s.documentos);
  const salvarRegistro = useOficina((s) => s.salvarRegistro);
  const hoje = useHoje();
  const toast = useToast();
  const [pontos, setPontos] = useState('');
  const [motivo, setMotivo] = useState('');
  const historico = useMemo(() => (clienteId ? historicoDoCliente(Object.values(fidelidade), clienteId) : []), [fidelidade, clienteId]);
  const saldo = useMemo(() => (clienteId ? (saldosPorCliente(historico, documentos).get(clienteId)?.saldo ?? 0) : 0), [historico, documentos, clienteId]);

  function ajustar(sinal: 1 | -1) {
    if (!cliente) return;
    const n = Math.round(lerNumero(pontos) ?? 0);
    if (n <= 0) return toast({ texto: 'Escreva quantos pontos.', tom: 'erro' });
    if (sinal < 0 && n > saldo) return toast({ texto: `O cliente só tem ${formatarNumero(saldo)} pontos.`, tom: 'erro' });
    salvarRegistro('fidelidade', { clienteId: cliente.id, tipo: 'ajuste', pontos: sinal * n, documentoId: null, descricao: motivo.trim() || (sinal > 0 ? 'Pontos de presente' : 'Pontos tirados'), valor: null, data: hoje });
    setPontos('');
    setMotivo('');
    toast({ texto: `${sinal > 0 ? 'Deu' : 'Tirou'} ${formatarNumero(n)} pontos.` });
  }

  return (
    <Folha aberta={!!cliente} aoFechar={aoFechar} titulo={cliente?.nome ?? ''} descricao={cliente?.telefone ? formatarTelefone(cliente.telefone) : undefined}>
      {cliente ? (
        <div className="flex flex-col gap-5">
          <p>
            <span className="largo num text-[30px] font-extrabold">{formatarNumero(saldo)}</span> pontos, valem <strong className="num">{formatarMoeda(valorDosPontos(saldo, config))}</strong>.
          </p>
          <section className="flex flex-col gap-2" aria-label="Ajustar pontos">
            <h3 className="font-bold">Ajustar os pontos</h3>
            <div className="grid gap-2 sm:grid-cols-[110px_1fr_auto_auto]">
              <input className={`${classeEntrada} num`} value={pontos} onChange={(e) => setPontos(e.target.value)} inputMode="numeric" placeholder="Pontos" aria-label="Quantos pontos" />
              <input className={classeEntrada} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" aria-label="Motivo" />
              <Botao onClick={() => ajustar(1)}>
                <Plus size={16} aria-hidden="true" /> Dar
              </Botao>
              <Botao onClick={() => ajustar(-1)}>
                <Minus size={16} aria-hidden="true" /> Tirar
              </Botao>
            </div>
          </section>
          {historico.length ? (
            <section className="flex flex-col gap-2" aria-label="Histórico de pontos">
              <h3 className="font-bold">Histórico</h3>
              <ul className="flex flex-col divide-y divide-linha rounded-xl ring-1 ring-linha">
                {historico.map((m) => {
                  const cancelada = m.tipo === 'resgate' && m.documentoId && documentos[m.documentoId]?.situacao === 'cancelada';
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3.5 py-2 text-[14px]">
                      <span className={`num w-16 shrink-0 font-bold ${cancelada ? 'text-tinta-3 line-through' : m.pontos > 0 ? 'text-ok' : 'text-atraso'}`}>
                        {m.pontos > 0 ? '+' : ''}
                        {formatarNumero(m.pontos)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-tinta-2">
                        {m.descricao ?? (m.tipo === 'ganho' ? 'Serviço' : m.tipo === 'resgate' ? 'Desconto' : 'Ajuste')}
                        {cancelada ? ' (OS cancelada, os pontos voltaram)' : ''}
                      </span>
                      <span className="shrink-0 text-tinta-3">{formatarData(m.data)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Folha>
  );
}
