// O tempo real da loja da oficina: quando uma loja confirma, sai para entrega, responde um alerta
// ou o entregador anda, o banco avisa pelo canal do Supabase (só as linhas que a pessoa pode ver,
// filtradas pela oficina). Cada aviso pede uma busca nova; avisos em sequência viram uma busca só.
// Sem servidor de tempo real, a reserva de 2 minutos do andamento segura.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type EstadoDoCanal = 'conectando' | 'ligado' | 'caiu';

/** As tabelas que avisam a oficina (todas têm a coluna oficina_id). */
export const TABELAS_DA_OFICINA = ['pedidos_fornecedores', 'alertas_respostas', 'alertas_preco'] as const;
export type TabelaDaOficina = (typeof TABELAS_DA_OFICINA)[number];

type ClienteDoCanal = Pick<SupabaseClient, 'channel' | 'removeChannel'>;

/**
 * Liga o canal da oficina. Devolve a função que desliga. `aoEstado` diz se o canal está ligado
 * (para buscar de novo quando volta depois de cair: o que mudou no meio não chegou).
 */
export function assinarLojaDaOficina(sb: ClienteDoCanal, oficinaId: string, aoMudar: (tabela: TabelaDaOficina) => void, aoEstado?: (e: EstadoDoCanal) => void): () => void {
  let canal: RealtimeChannel | null = null;
  try {
    let c = sb.channel(`loja-oficina-${oficinaId}`);
    for (const tabela of TABELAS_DA_OFICINA) {
      c = c.on('postgres_changes', { event: '*', schema: 'public', table: tabela, filter: `oficina_id=eq.${oficinaId}` }, () => aoMudar(tabela));
    }
    canal = c.subscribe((status) => {
      if (status === 'SUBSCRIBED') aoEstado?.('ligado');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') aoEstado?.('caiu');
    });
  } catch {
    aoEstado?.('caiu');
  }
  return () => {
    if (canal) void sb.removeChannel(canal);
    canal = null;
  };
}

/** Junta avisos em sequência numa chamada só, `ms` depois do último. */
export function juntarAvisos(fazer: () => void, ms = 800): { avisar(): void; parar(): void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  return {
    avisar() {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fazer();
      }, ms);
    },
    parar() {
      if (t) clearTimeout(t);
      t = null;
    }
  };
}

/** A reserva quando o tempo real falha: com o app aberto e coisa andando, busca a cada 2 minutos. */
export const INTERVALO_RESERVA_MS = 120_000;
