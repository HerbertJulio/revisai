'use client';

// O link de agendamento da oficina: ligar e desligar, quantos dias para a frente o cliente vê, a
// antecedência mínima, os serviços que ele escolhe e um recado. Os horários vêm da agenda. O
// endereço (/agendar/<código>) é sorteado pelo banco na primeira vez e fica guardado também nas
// preferências, para o link entrar nas mensagens dos avisos.

import type { SupabaseClient } from '@supabase/supabase-js';
import { Copy, Globe, Plus, QrCode as IconeQr, Settings2, Share2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { QrCode } from '@/components/QrCode';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { AGENDA_PADRAO, configDaAgenda, DIAS_CURTOS, gradeParaPublicar, horaCurta, type AgendaPreferencias } from '@/lib/horarios';
import { useOficina } from '@/lib/store';
import { linkDeAgendamento } from '@/lib/whatsapp';
import { useGestao } from './comum';

export const SERVICOS_PADRAO_ONLINE = ['Troca de óleo', 'Revisão', 'Alinhamento e balanceamento', 'Freios', 'Diagnóstico'];
const DIAS_A_FRENTE = [7, 14, 30, 60, 90];
const ANTECEDENCIAS = [0, 1, 2, 4, 12, 24, 48];

interface ConfigOnline {
  diasAFrente: number;
  antecedenciaHoras: number;
  servicos: string[];
  mensagem: string;
}

const ONLINE_PADRAO: ConfigOnline = { diasAFrente: 30, antecedenciaHoras: 2, servicos: SERVICOS_PADRAO_ONLINE, mensagem: '' };

function fusoDoAparelho(): string | undefined {
  try {
    const f = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return /^America\/[A-Za-z_]+$/.test(f) ? f : undefined;
  } catch {
    return undefined;
  }
}

function lerOnline(config: unknown): ConfigOnline {
  const c = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
  const numero = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
  return {
    diasAFrente: numero(c.diasAFrente, ONLINE_PADRAO.diasAFrente),
    antecedenciaHoras: numero(c.antecedenciaHoras, ONLINE_PADRAO.antecedenciaHoras),
    servicos: Array.isArray(c.servicos) ? c.servicos.filter((s): s is string => typeof s === 'string') : ONLINE_PADRAO.servicos,
    mensagem: typeof c.mensagem === 'string' ? c.mensagem : ''
  };
}

function configParaPublicar(agenda: Partial<AgendaPreferencias> | undefined, online: ConfigOnline) {
  return {
    ...gradeParaPublicar(configDaAgenda(agenda)),
    diasAFrente: online.diasAFrente,
    antecedenciaHoras: online.antecedenciaHoras,
    servicos: online.servicos,
    mensagem: online.mensagem.trim() || null,
    ...(fusoDoAparelho() ? { fuso: fusoDoAparelho() } : {})
  };
}

function erroDoBanco(e: { code?: string; message?: string } | null): string {
  if (!e) return 'Não deu para salvar agora.';
  if (e.code === '42501') return 'Só o dono ou o gerente mudam o link de agendamento.';
  if (e.code === '22023') return `Confira a configuração (${e.message ?? 'algo não vale'}).`;
  return 'Não deu para salvar agora. Confira a internet e tente de novo.';
}

/** Depois de mudar os horários da agenda: o link (se já existe) passa a mostrar os horários novos. */
export async function republicarLink(sb: SupabaseClient, oficinaId: string, agenda: AgendaPreferencias): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const { data, error } = await sb.from('agenda_publica').select('ativo, config').eq('oficina_id', oficinaId).maybeSingle();
    if (error) return { ok: false, erro: 'sem conexão com o banco' };
    if (!data) return { ok: true };
    const r = await sb.rpc('agenda_publicar', { p_oficina: oficinaId, p_ativo: data.ativo, p_config: configParaPublicar(agenda, lerOnline(data.config)) });
    return r.error ? { ok: false, erro: erroDoBanco(r.error) } : { ok: true };
  } catch {
    return { ok: false, erro: 'sem conexão' };
  }
}

/** "seg a sex 8h–18h, sáb 8h–12h": os horários da semana numa linha. */
export function resumoDaSemana(agenda: Partial<AgendaPreferencias> | undefined): string {
  const c = configDaAgenda(agenda);
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const grupos: { dias: number[]; texto: string }[] = [];
  for (const d of ordem) {
    const texto = c.semana[d].map((p) => `${horaCurta(p.inicio)}–${horaCurta(p.fim)}`).join(' e ');
    if (!texto) continue;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.texto === texto && ordem.indexOf(ultimo.dias.at(-1)!) === ordem.indexOf(d) - 1) ultimo.dias.push(d);
    else grupos.push({ dias: [d], texto });
  }
  if (!grupos.length) return 'Nenhum dia aberto';
  return grupos.map((g) => `${g.dias.length > 2 ? `${DIAS_CURTOS[g.dias[0]]} a ${DIAS_CURTOS[g.dias.at(-1)!]}` : g.dias.map((d) => DIAS_CURTOS[d]).join(' e ')} ${g.texto}`).join(', ');
}

/** O cartão do link no topo dos pedidos: o endereço para copiar e compartilhar, e o botão de configurar. */
export function CartaoDoLink({ aoMudarHorarios }: { aoMudarHorarios: () => void }) {
  const { oficina } = useConta();
  const gestao = useGestao();
  const agenda = useOficina((s) => s.preferencias.agenda);
  const nome = useOficina((s) => s.oficina.nome);
  const toast = useToast();
  const [config, setConfig] = useState(false);
  const [qr, setQr] = useState(false);
  const [origem, setOrigem] = useState('');
  useEffect(() => setOrigem(window.location.origin), []);
  const link = agenda?.agendamentoOnline && origem ? linkDeAgendamento(origem, agenda.slug) : null;

  if (!oficina) {
    return (
      <section className="flex flex-col items-start gap-2 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha">
        <p className="flex items-center gap-2 font-bold">
          <Globe size={18} aria-hidden="true" /> Agendamento pelo link
        </p>
        <p className="text-[14.5px] text-tinta-2">Com a conta da oficina, o cliente escolhe um horário livre num link seu e o pedido chega aqui para você aceitar.</p>
        <Link href="/conta?ver=1" className={classeBotao('escuro', 'pequeno')}>
          Abrir a conta
        </Link>
      </section>
    );
  }

  const texto = `Marque seu horário na ${nome || 'oficina'}: ${link}`;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha" aria-label="Link de agendamento">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold">
            <Globe size={18} aria-hidden="true" /> Link de agendamento {link ? <span className="rounded-full bg-ok-claro px-2 py-0.5 text-[12.5px] text-ok">ligado</span> : <span className="rounded-full bg-papel-2 px-2 py-0.5 text-[12.5px] text-tinta-2">desligado</span>}
          </p>
          <p className="mt-0.5 text-[14px] text-tinta-2">{link ? 'O cliente escolhe um horário livre e o pedido chega aqui.' : 'Ligue para o cliente pedir horário sozinho, por um link seu.'}</p>
        </div>
        {gestao ? (
          <Botao tamanho="pequeno" variante={link ? 'secundario' : 'primario'} onClick={() => setConfig(true)}>
            <Settings2 size={15} aria-hidden="true" /> {link ? 'Configurar' : 'Ligar o link'}
          </Botao>
        ) : null}
      </div>
      {link ? (
        <>
          <p className="num rounded-lg bg-papel-2 px-3 py-2 text-[14px] break-all" data-link-agendamento>
            {link}
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao
              tamanho="pequeno"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(link)
                  .then(() => toast({ texto: 'Link copiado.' }))
                  .catch(() => toast({ texto: 'Não deu para copiar. Segure o link para copiar.', tom: 'erro' }));
              }}
            >
              <Copy size={15} aria-hidden="true" /> Copiar
            </Botao>
            <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
              <Share2 size={15} aria-hidden="true" /> Mandar no WhatsApp
            </a>
            {typeof navigator !== 'undefined' && 'share' in navigator ? (
              <Botao tamanho="pequeno" onClick={() => void navigator.share({ title: 'Agendar horário', text: texto, url: link }).catch(() => {})}>
                <Share2 size={15} aria-hidden="true" /> Compartilhar
              </Botao>
            ) : null}
            <Botao tamanho="pequeno" variante="fantasma" aria-expanded={qr} onClick={() => setQr((x) => !x)}>
              <IconeQr size={15} aria-hidden="true" /> QR Code
            </Botao>
          </div>
          {qr ? (
            <div className="flex flex-col items-start gap-1">
              <QrCode texto={link} rotulo="QR Code do link de agendamento" className="h-44 w-44 rounded-lg ring-1 ring-linha" />
              <p className="text-[13px] text-tinta-3">Imprima e deixe no balcão: o cliente aponta a câmera e marca.</p>
            </div>
          ) : null}
        </>
      ) : null}
      <FolhaLink aberta={config} aoFechar={() => setConfig(false)} aoMudarHorarios={aoMudarHorarios} />
    </section>
  );
}

function FolhaLink({ aberta, aoFechar, aoMudarHorarios }: { aberta: boolean; aoFechar: () => void; aoMudarHorarios: () => void }) {
  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Link de agendamento" descricao="O cliente vê só os horários livres e pede; você aceita ou recusa aqui.">
      {aberta ? <FormularioLink aoFechar={aoFechar} aoMudarHorarios={aoMudarHorarios} /> : null}
    </Folha>
  );
}

function FormularioLink({ aoFechar, aoMudarHorarios }: { aoFechar: () => void; aoMudarHorarios: () => void }) {
  const { banco, oficina } = useConta();
  const agenda = useOficina((s) => s.preferencias.agenda);
  const toast = useToast();
  const [ativo, setAtivo] = useState(true);
  const [online, setOnline] = useState<ConfigOnline>(ONLINE_PADRAO);
  const [novoServico, setNovoServico] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const sb = banco();
    if (!sb || !oficina) return setCarregando(false);
    let vivo = true;
    void sb
      .from('agenda_publica')
      .select('ativo, config')
      .eq('oficina_id', oficina.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        if (data) {
          setAtivo(!!data.ativo);
          setOnline(lerOnline(data.config));
        }
        setCarregando(false);
      }, () => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [banco, oficina]);

  async function salvar() {
    const sb = banco();
    if (!sb || !oficina) return;
    if (ativo && !online.servicos.length) return setErro('Deixe pelo menos um serviço para o cliente escolher.');
    setErro(null);
    setSalvando(true);
    try {
      const { data, error } = await sb.rpc('agenda_publicar', { p_oficina: oficina.id, p_ativo: ativo, p_config: configParaPublicar(agenda, online) });
      if (error || typeof data !== 'string') return setErro(erroDoBanco(error));
      const atual = useOficina.getState().preferencias.agenda;
      useOficina.getState().salvarPreferencias({ agenda: { ...configBase(atual), agendamentoOnline: ativo, slug: data } });
      toast({ texto: ativo ? 'Link de agendamento ligado.' : 'Link de agendamento desligado.' });
      aoFechar();
    } catch {
      setErro('Sem conexão. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  function incluirServico() {
    const s = novoServico.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!s || online.servicos.some((x) => x.toLowerCase() === s.toLowerCase()) || online.servicos.length >= 20) return;
    setOnline({ ...online, servicos: [...online.servicos, s] });
    setNovoServico('');
  }

  if (carregando) return <p className="text-tinta-2" aria-busy="true">Carregando...</p>;
  return (
    <div className="flex flex-col gap-5">
      <Alternar id="ag-online" ligado={ativo} aoMudar={setAtivo} rotulo="Receber pedidos pelo link" descricao="Desligado, o link mostra que a agenda não está aberta." />
      <div className="flex flex-col gap-1.5 rounded-xl bg-papel-2 px-3.5 py-3">
        <p className="text-[13px] text-tinta-3">Horários (os mesmos da agenda)</p>
        <p className="font-semibold">{resumoDaSemana(agenda)}</p>
        <button
          type="button"
          className="self-start text-[14px] font-semibold text-caneta hover:underline"
          onClick={() => {
            aoFechar();
            aoMudarHorarios();
          }}
        >
          Mudar os horários
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Mostrar os próximos" htmlFor="ag-dias">
          <select id="ag-dias" className={classeEntrada} value={online.diasAFrente} onChange={(e) => setOnline({ ...online, diasAFrente: Number(e.target.value) })}>
            {DIAS_A_FRENTE.map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Antecedência mínima" htmlFor="ag-antecedencia">
          <select id="ag-antecedencia" className={classeEntrada} value={online.antecedenciaHoras} onChange={(e) => setOnline({ ...online, antecedenciaHoras: Number(e.target.value) })}>
            {ANTECEDENCIAS.map((h) => (
              <option key={h} value={h}>
                {h === 0 ? 'Nenhuma' : h < 24 ? `${h} ${h === 1 ? 'hora' : 'horas'}` : `${h / 24} ${h === 24 ? 'dia' : 'dias'}`}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Serviços que o cliente escolhe</p>
        <ul className="flex flex-wrap gap-1.5">
          {online.servicos.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-full bg-papel-2 py-1 pr-1 pl-3 text-[13.5px] font-semibold">
              {s}
              <button type="button" aria-label={`Tirar ${s}`} className="grid h-6 w-6 place-items-center rounded-full hover:bg-linha" onClick={() => setOnline({ ...online, servicos: online.servicos.filter((x) => x !== s) })}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className={classeEntrada}
            aria-label="Outro serviço"
            placeholder="Outro serviço"
            value={novoServico}
            maxLength={60}
            onChange={(e) => setNovoServico(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                incluirServico();
              }
            }}
          />
          <Botao onClick={incluirServico} disabled={!novoServico.trim()}>
            <Plus size={16} aria-hidden="true" /> Pôr
          </Botao>
        </div>
      </div>
      <Campo rotulo="Recado para o cliente" htmlFor="ag-recado" dica="Opcional. Aparece na página do link. Ex.: chegue 10 minutos antes.">
        <textarea id="ag-recado" rows={2} className={classeArea} value={online.mensagem} maxLength={300} onChange={(e) => setOnline({ ...online, mensagem: e.target.value })} />
      </Campo>
      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-linha pt-4">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void salvar()} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Botao>
      </div>
    </div>
  );
}

/** As preferências da agenda com o padrão no que faltar (para gravar o link junto). */
function configBase(a: Partial<AgendaPreferencias> | undefined): AgendaPreferencias {
  return { ...AGENDA_PADRAO, ...(a ?? {}) };
}
