'use client';

// As respostas que o cliente deu pelos links (aprovou ou recusou o orçamento, assinou o
// checklist) chegam ao app da oficina: o banco avisa em tempo real e, de reserva, o app olha a
// cada 2 minutos enquanto a tela está aberta. Um aparelho só pega cada resposta (link_processado),
// aplica nos dados e mostra um aviso.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { useToast } from '@/components/Toasts';
import { aprovacaoDoLink } from '@/lib/aprovacao';
import { lerResposta, type RespostaDoLink } from '@/lib/links-publicos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { useContextoDaConta, type ContextoDaConta } from './conta';
import { mandarCopiaDaAprovacao } from './copia';

const RESERVA_MS = 120_000;

interface LinhaComResposta {
  id: string;
  tipo: string;
  ref: string;
  resposta: unknown;
  respondido_em: string | null;
}

type Aviso = (texto: string) => void;

let ctxAtual: ContextoDaConta | null = null;
let ligados = 0;
let canal: RealtimeChannel | null = null;
let reserva: ReturnType<typeof setInterval> | null = null;
let espera: ReturnType<typeof setTimeout> | null = null;
let ocupado = false;
let deNovo = false;
const avisos = new Set<Aviso>();
const ouvintes = new Set<() => void>();

function avisar(texto: string) {
  for (const a of avisos) {
    a(texto);
    break;
  }
}

/** Os painéis que mostram a situação dos links escutam aqui (alguém respondeu, alguém viu). */
export function ouvirLinks(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function linksMudaram() {
  for (const f of ouvintes) f();
}

function agendar(ms: number) {
  if (espera) clearTimeout(espera);
  espera = setTimeout(() => {
    espera = null;
    void buscar();
  }, ms);
}

async function notificarExtensoes(f: 'aprovar' | 'recusar', orcamentoId: Id, ordemId: Id | null, recusadas: Id[]) {
  // carregado na hora para não criar um ciclo entre as extensões e esta parte
  const ext = await import('../extensoes');
  if (f === 'aprovar' && ordemId) ext.aoAprovarOrcamento(orcamentoId, ordemId, recusadas);
  if (f === 'recusar') ext.aoRecusarOrcamento(orcamentoId);
}

/** Uma resposta antiga de algo que não existe mais no aparelho (apagado) sai da fila. */
function abandonada(l: LinhaComResposta): boolean {
  return !!l.respondido_em && Date.now() - new Date(l.respondido_em).getTime() > 86_400_000;
}

async function pegar(ctx: ContextoDaConta, id: string): Promise<boolean> {
  const { data, error } = await ctx.sb.rpc('link_processado', { p_id: id });
  if (error) {
    console.error('[links] processado', error);
    return false;
  }
  return data === true;
}

async function aplicarOrcamento(ctx: ContextoDaConta, l: LinhaComResposta, r: RespostaDoLink) {
  const s = useOficina.getState();
  const doc = s.documentos[l.ref];
  if (!doc || doc.tipo !== 'orcamento') {
    if (abandonada(l)) await pegar(ctx, l.id);
    return;
  }
  if (!(await pegar(ctx, l.id))) return;
  const st = useOficina.getState();
  const atual = st.documentos[doc.id];
  if (!atual) return;
  if (r.acao === 'recusar') {
    if (atual.situacao !== 'aprovado') {
      st.recusarOrcamento(atual.id);
      await notificarExtensoes('recusar', atual.id, null, []);
    }
    avisar(`O cliente recusou o orçamento nº ${atual.numero} pelo link.`);
    return;
  }
  const recusadas = r.recusadas.filter((id) => atual.linhas.some((x) => x.id === id));
  const jaTinha = atual.ordemId && st.documentos[atual.ordemId] ? atual.ordemId : null;
  const ordemId = jaTinha ?? st.aprovarOrcamento(atual.id, recusadas);
  if (!ordemId) {
    avisar(`O cliente respondeu o orçamento nº ${atual.numero}, mas os itens mudaram. Confira o orçamento.`);
    return;
  }
  const aprovacao = aprovacaoDoLink(r);
  const depois = useOficina.getState().documentos[atual.id];
  if (depois) useOficina.getState().salvarDocumento({ ...depois, aprovacao });
  if (!jaTinha) await notificarExtensoes('aprovar', atual.id, ordemId, recusadas);
  avisar(`O cliente aprovou o orçamento nº ${atual.numero} pelo link${recusadas.length ? ', sem alguns itens' : ''}. A ordem de serviço já está aberta.`);
  void mandarCopiaDaAprovacao(atual.id);
}

async function aplicarChecklist(ctx: ContextoDaConta, l: LinhaComResposta, r: RespostaDoLink) {
  const c = useOficina.getState().checklists[l.ref];
  if (!c) {
    if (abandonada(l)) await pegar(ctx, l.id);
    return;
  }
  if (r.acao !== 'assinar' || !r.imagem) {
    await pegar(ctx, l.id);
    return;
  }
  if (!(await pegar(ctx, l.id))) return;
  const atual = useOficina.getState().checklists[l.ref];
  if (!atual) return;
  useOficina.getState().salvarRegistro('checklists', { ...atual, assinatura: { nome: r.nome || 'Cliente', imagem: r.imagem, quando: r.quando } });
  avisar('O cliente assinou o checklist de entrada pelo link.');
}

async function buscar(): Promise<void> {
  const ctx = ctxAtual;
  if (!ctx || useOficina.getState().contaOficinaId !== ctx.oficinaId) return;
  if (ocupado) {
    deNovo = true;
    return;
  }
  ocupado = true;
  try {
    do {
      deNovo = false;
      const { data, error } = await ctx.sb
        .from('links_publicos')
        .select('id, tipo, ref, resposta, respondido_em')
        .eq('oficina_id', ctx.oficinaId)
        .not('resposta', 'is', null)
        .is('processado_em', null)
        .order('respondido_em', { ascending: true })
        .limit(30);
      if (error) {
        console.error('[links] respostas', error);
        return;
      }
      for (const l of (data ?? []) as LinhaComResposta[]) {
        const r = lerResposta(l.resposta);
        if (!r) continue;
        try {
          if (l.tipo === 'orcamento') await aplicarOrcamento(ctx, l, r);
          else if (l.tipo === 'checklist') await aplicarChecklist(ctx, l, r);
        } catch (e) {
          console.error('[links] aplicar', e);
        }
      }
    } while (deNovo && ctxAtual === ctx);
  } finally {
    ocupado = false;
    linksMudaram();
  }
}

function ligar(ctx: ContextoDaConta) {
  desligar();
  ctxAtual = ctx;
  try {
    canal = ctx.sb
      .channel(`links-${ctx.oficinaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'links_publicos', filter: `oficina_id=eq.${ctx.oficinaId}` }, () => {
        linksMudaram();
        agendar(400);
      })
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') agendar(0);
      });
  } catch {
    // sem tempo real, a reserva segura
    canal = null;
  }
  reserva = setInterval(() => {
    if (document.visibilityState === 'visible') agendar(0);
  }, RESERVA_MS);
  document.addEventListener('visibilitychange', aoVoltar);
  agendar(0);
}

function aoVoltar() {
  if (document.visibilityState === 'visible') agendar(0);
}

function desligar() {
  if (canal && ctxAtual) void ctxAtual.sb.removeChannel(canal);
  canal = null;
  if (reserva) clearInterval(reserva);
  reserva = null;
  if (espera) clearTimeout(espera);
  espera = null;
  document.removeEventListener('visibilitychange', aoVoltar);
  ctxAtual = null;
}

/** Liga a escuta das respostas enquanto algum painel da oficina estiver na tela. */
export function useRespostasDosLinks(): void {
  const ctx = useContextoDaConta();
  const toast = useToast();
  useEffect(() => {
    if (!ctx) return;
    const aviso: Aviso = (texto) => toast({ texto });
    avisos.add(aviso);
    ligados++;
    if (ctxAtual?.oficinaId !== ctx.oficinaId || ctxAtual.sb !== ctx.sb) ligar(ctx);
    return () => {
      avisos.delete(aviso);
      ligados--;
      if (ligados <= 0) {
        ligados = 0;
        desligar();
      }
    };
  }, [ctx, toast]);
}

/** Olha as respostas agora (depois de mandar um link, por exemplo). */
export function buscarRespostasAgora(): void {
  if (ctxAtual) agendar(0);
}
