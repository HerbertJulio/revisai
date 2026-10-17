'use client';

// O motor da sincronização: sobe o que mudou no aparelho (em lotes) e busca o que mudou no
// banco desde a última marca. Acorda com o tempo real (sinal da oficina), com as mudanças
// locais, quando a internet volta, quando o app volta para a frente e, de reserva, a cada 2 minutos.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { aplicarRecebidos, itemParaEnviar, valorAtual, type ItemRecebido } from '@/lib/sincronia-dados';
import { useOficina } from '@/lib/store';

export type EstadoMotor = 'iniciando' | 'sincronizando' | 'em-dia' | 'sem-internet' | 'erro' | 'sem-sessao' | 'sem-permissao';

export interface InfoMotor {
  estado: EstadoMotor;
  erro: string | null;
}

const LOTE = 200;
const PAGINA = 1000;
const RESERVA_MS = 120_000;

function codigoDoErro(e: unknown): { codigo: string; status: number; mensagem: string } {
  const x = e as { code?: string; status?: number; message?: string };
  return { codigo: String(x?.code ?? ''), status: Number(x?.status ?? 0), mensagem: String(x?.message ?? e) };
}

export class MotorDeSincronia {
  private ocupado = false;
  private deNovo = false;
  private parado = false;
  private canal: RealtimeChannel | null = null;
  private espera: ReturnType<typeof setTimeout> | null = null;
  private reserva: ReturnType<typeof setInterval> | null = null;
  private desligar: (() => void)[] = [];

  constructor(
    private readonly sb: SupabaseClient,
    private readonly oficinaId: string,
    private readonly avisar: (info: InfoMotor) => void
  ) {}

  iniciar(): void {
    this.avisar({ estado: 'iniciando', erro: null });
    this.ligarTempoReal();
    this.reserva = setInterval(() => this.agendar(0), RESERVA_MS);
    const online = () => this.agendar(0);
    const visivel = () => {
      if (document.visibilityState === 'visible') this.agendar(0);
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visivel);
    // mudança local: espera um pouco para juntar várias num lote só
    let pendentesAntes = Object.keys(useOficina.getState().sinc.pendentes).length;
    const parar = useOficina.subscribe((s) => {
      const n = Object.keys(s.sinc.pendentes).length;
      if (n > pendentesAntes) this.agendar(1200);
      pendentesAntes = n;
    });
    this.desligar.push(() => window.removeEventListener('online', online), () => document.removeEventListener('visibilitychange', visivel), parar);
    this.agendar(0);
  }

  parar(): void {
    this.parado = true;
    if (this.espera) clearTimeout(this.espera);
    if (this.reserva) clearInterval(this.reserva);
    for (const f of this.desligar) f();
    if (this.canal) void this.sb.removeChannel(this.canal);
    this.canal = null;
  }

  /** Pede uma rodada (junta os pedidos que chegam perto um do outro). */
  agendar(ms: number): void {
    if (this.parado) return;
    if (this.espera) clearTimeout(this.espera);
    this.espera = setTimeout(() => {
      this.espera = null;
      void this.sincronizar();
    }, ms);
  }

  async sincronizar(): Promise<void> {
    if (this.parado) return;
    if (this.ocupado) {
      this.deNovo = true;
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.avisar({ estado: 'sem-internet', erro: null });
      return;
    }
    this.ocupado = true;
    this.avisar({ estado: 'sincronizando', erro: null });
    try {
      do {
        this.deNovo = false;
        await this.enviar();
        await this.buscar();
      } while (this.deNovo && !this.parado);
      this.avisar({ estado: 'em-dia', erro: null });
    } catch (e) {
      const { codigo, status, mensagem } = codigoDoErro(e);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) this.avisar({ estado: 'sem-internet', erro: null });
      else if (codigo === '28000' || status === 401 || codigo === 'PGRST301' || codigo === 'PGRST303') this.avisar({ estado: 'sem-sessao', erro: null });
      else if (codigo === '42501') this.avisar({ estado: 'sem-permissao', erro: mensagem });
      else {
        console.error('[sincronia]', e);
        this.avisar({ estado: 'erro', erro: mensagem });
        // tenta de novo daqui a pouco
        this.agendar(15_000);
      }
    } finally {
      this.ocupado = false;
    }
  }

  private ligarTempoReal(): void {
    try {
      this.canal = this.sb
        .channel(`oficina-${this.oficinaId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'oficinas_sinal', filter: `oficina_id=eq.${this.oficinaId}` }, () => this.agendar(300))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') this.agendar(0);
        });
    } catch {
      // sem tempo real, a reserva de 2 minutos segura
      this.canal = null;
    }
  }

  /** Só sobe o que está pendente (antes de trocar de oficina neste aparelho). */
  async enviarPendentes(): Promise<boolean> {
    try {
      await this.enviar();
      return true;
    } catch (e) {
      console.error('[sincronia] enviar pendentes', e);
      return false;
    }
  }

  private async enviar(): Promise<void> {
    for (let rodada = 0; rodada < 1000 && !this.parado; rodada++) {
      const s = useOficina.getState();
      if (s.contaOficinaId !== this.oficinaId) return;
      const chaves = Object.keys(s.sinc.pendentes).slice(0, LOTE);
      if (!chaves.length) return;
      const itens = chaves.map((k) => itemParaEnviar(s, k));
      const valores = chaves.map((k) => ({ chave: k, valor: valorAtual(s, k) }));
      const { error } = await this.sb.rpc('gravar_registros', { p_oficina: this.oficinaId, p_itens: itens });
      if (error) throw error;
      useOficina.getState().marcarEnviados(valores);
    }
  }

  private async buscar(): Promise<void> {
    let desde = useOficina.getState().sinc.marca ?? 0;
    let colecao = '';
    let id = '';
    // a próxima busca começa na marca da primeira página (o que estava aberto pode chegar depois)
    let primeiraMarca: number | null = null;
    for (let pagina = 0; pagina < 1000 && !this.parado; pagina++) {
      const { data, error } = await this.sb.rpc('ler_registros', { p_oficina: this.oficinaId, p_desde: desde, p_colecao: colecao, p_id: id, p_limite: PAGINA });
      if (error) throw error;
      const r = data as { itens: ItemRecebido[]; mais: boolean; marca: number };
      primeiraMarca ??= Number(r.marca);
      const s = useOficina.getState();
      if (s.contaOficinaId !== this.oficinaId) return;
      const parte = r.itens.length ? aplicarRecebidos(s, r.itens, s.sinc.pendentes) : {};
      s.aplicarDoBanco(parte, r.mais ? null : primeiraMarca);
      if (!r.mais || !r.itens.length) return;
      const ultimo = r.itens[r.itens.length - 1];
      desde = Number(ultimo.tx);
      colecao = ultimo.colecao;
      id = ultimo.id;
    }
  }
}
