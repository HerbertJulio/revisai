'use client';

// O motor da sincronização: sobe o que mudou no aparelho (em lotes) e busca o que mudou no
// banco desde a última marca. Acorda com o tempo real (sinal da oficina), com as mudanças
// locais, quando a internet volta, quando o app volta para a frente e, de reserva, de tempos em
// tempos (a cada 2 minutos com o tempo real ligado; a cada 15 segundos, com a tela aberta, quando
// o tempo real não conecta).

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { aplicarRecebidos, itemParaEnviar, partesDaChave, valorAtual, type Chave, type ItemEnviado, type ItemRecebido } from '@/lib/sincronia-dados';
import { useOficina } from '@/lib/store';

export type EstadoMotor = 'iniciando' | 'sincronizando' | 'em-dia' | 'sem-internet' | 'erro' | 'sem-sessao' | 'sem-permissao' | 'limite';

export interface InfoMotor {
  estado: EstadoMotor;
  erro: string | null;
}

export const LOTE = 200;
const PAGINA = 1000;
const RESERVA_COM_TEMPO_REAL_MS = 120_000;
const RESERVA_SEM_TEMPO_REAL_MS = 15_000;

interface ErroDoBanco {
  codigo: string;
  status: number;
  mensagem: string;
}

function lerErro(e: unknown): ErroDoBanco {
  const x = e as { code?: string; status?: number; message?: string };
  return { codigo: String(x?.code ?? ''), status: Number(x?.status ?? 0), mensagem: String(x?.message ?? e) };
}

/** O banco recusou o item em si (formato, tamanho, coleção): tentar de novo não adianta. */
function itemInvalido(e: ErroDoBanco): boolean {
  return e.codigo === '22023' || e.codigo === '22P02' || e.codigo === '23514';
}

function semInternet(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export class MotorDeSincronia {
  private ocupado = false;
  private deNovo = false;
  private parado = false;
  private canal: RealtimeChannel | null = null;
  private tempoReal = false;
  private espera: ReturnType<typeof setTimeout> | null = null;
  private reserva: ReturnType<typeof setTimeout> | null = null;
  private desligar: (() => void)[] = [];
  private jaEmDia = false;
  private ultimoAviso = '';

  constructor(
    private readonly sb: SupabaseClient,
    private readonly oficinaId: string,
    private readonly avisarTela: (info: InfoMotor) => void
  ) {}

  /** Só avisa a tela quando o estado muda (a busca de reserva roda a cada poucos segundos). */
  private avisar(info: InfoMotor): void {
    const chave = `${info.estado}|${info.erro ?? ''}`;
    if (chave === this.ultimoAviso) return;
    this.ultimoAviso = chave;
    this.avisarTela(info);
  }

  iniciar(): void {
    this.avisar({ estado: 'iniciando', erro: null });
    this.ligarTempoReal();
    this.agendarReserva();
    const online = () => this.agendar(0);
    const offline = () => this.avisar({ estado: 'sem-internet', erro: null });
    const visivel = () => {
      if (document.visibilityState === 'visible') this.agendar(0);
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visivel);
    // mudança local: espera um pouco para juntar várias num lote só
    let pendentesAntes = Object.keys(useOficina.getState().sinc.pendentes).length;
    const parar = useOficina.subscribe((s) => {
      const n = Object.keys(s.sinc.pendentes).length;
      if (n > pendentesAntes) this.agendar(1200);
      pendentesAntes = n;
    });
    this.desligar.push(
      () => window.removeEventListener('online', online),
      () => window.removeEventListener('offline', offline),
      () => document.removeEventListener('visibilitychange', visivel),
      parar
    );
    this.agendar(0);
  }

  parar(): void {
    this.parado = true;
    if (this.espera) clearTimeout(this.espera);
    if (this.reserva) clearTimeout(this.reserva);
    for (const f of this.desligar) f();
    this.desligar = [];
    if (this.canal) void this.sb.removeChannel(this.canal).catch(() => {});
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

  private agendarReserva(): void {
    if (this.parado) return;
    if (this.reserva) clearTimeout(this.reserva);
    const ms = this.tempoReal ? RESERVA_COM_TEMPO_REAL_MS : RESERVA_SEM_TEMPO_REAL_MS;
    this.reserva = setTimeout(() => {
      this.reserva = null;
      // sem tempo real, só busca com a tela aberta (no fundo, o celular economiza bateria)
      if (this.tempoReal || typeof document === 'undefined' || document.visibilityState === 'visible') void this.sincronizar();
      this.agendarReserva();
    }, ms);
  }

  async sincronizar(): Promise<void> {
    if (this.parado) return;
    if (this.ocupado) {
      this.deNovo = true;
      return;
    }
    if (semInternet()) {
      this.avisar({ estado: 'sem-internet', erro: null });
      return;
    }
    this.ocupado = true;
    // a busca de reserva, já em dia e sem nada para subir, não pisca "salvando" na tela
    if (!this.jaEmDia || this.ultimoAviso !== 'em-dia|' || Object.keys(useOficina.getState().sinc.pendentes).length) this.avisar({ estado: 'sincronizando', erro: null });
    try {
      do {
        this.deNovo = false;
        await this.enviar();
        await this.buscar();
      } while (this.deNovo && !this.parado);
      if (!this.parado) {
        this.jaEmDia = true;
        this.avisar({ estado: 'em-dia', erro: null });
      }
    } catch (e) {
      await this.tratarErro(lerErro(e));
    } finally {
      this.ocupado = false;
    }
  }

  private async tratarErro(e: ErroDoBanco): Promise<void> {
    if (this.parado) return;
    if (semInternet()) return this.avisar({ estado: 'sem-internet', erro: null });
    const daSessao = e.codigo === '28000' || e.codigo === '42501' || e.codigo === 'PGRST301' || e.codigo === 'PGRST302' || e.codigo === 'PGRST303' || e.status === 401;
    if (daSessao) {
      // sem sessão a chamada vai como anônima e o banco nega: diferencia de "não é desta oficina"
      const { data } = await this.sb.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!data.session) return this.avisar({ estado: 'sem-sessao', erro: null });
      if (e.codigo === '42501') return this.avisar({ estado: 'sem-permissao', erro: e.mensagem });
    }
    if (e.codigo === 'P0001' && /limite/i.test(e.mensagem)) return this.avisar({ estado: 'limite', erro: e.mensagem });
    // falha de rede no meio da chamada vira TypeError ("Failed to fetch")
    if (/fetch|network|rede/i.test(e.mensagem) && !e.codigo) {
      this.avisar({ estado: 'sem-internet', erro: null });
      this.agendar(10_000);
      return;
    }
    console.error('[sincronia]', e);
    this.avisar({ estado: 'erro', erro: e.mensagem });
    // tenta de novo daqui a pouco
    this.agendar(15_000);
  }

  private ligarTempoReal(): void {
    try {
      this.canal = this.sb
        .channel(`oficina-${this.oficinaId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'oficinas_sinal', filter: `oficina_id=eq.${this.oficinaId}` }, () => this.agendar(300))
        .subscribe((status) => {
          const ligado = status === 'SUBSCRIBED';
          if (ligado !== this.tempoReal) {
            this.tempoReal = ligado;
            this.agendarReserva();
          }
          if (ligado) this.agendar(0);
        });
    } catch {
      // sem tempo real, a reserva curta segura
      this.canal = null;
      this.tempoReal = false;
    }
  }

  /** Só sobe o que está pendente (antes de trocar de oficina ou de sair neste aparelho). */
  async enviarPendentes(): Promise<boolean> {
    try {
      await this.enviar();
      return Object.keys(useOficina.getState().sinc.pendentes).length === 0;
    } catch (e) {
      console.error('[sincronia] enviar pendentes', e);
      return false;
    }
  }

  private async gravar(itens: ItemEnviado[]): Promise<void> {
    const { error } = await this.sb.rpc('gravar_registros', { p_oficina: this.oficinaId, p_itens: itens });
    if (error) throw error;
  }

  private async enviar(): Promise<void> {
    for (let rodada = 0; rodada < 2000 && !this.parado; rodada++) {
      const s = useOficina.getState();
      if (s.contaOficinaId !== this.oficinaId) return;
      const chaves = Object.keys(s.sinc.pendentes).slice(0, LOTE);
      if (!chaves.length) return;
      const itens = chaves.map((k) => itemParaEnviar(s, k));
      const valores = chaves.map((k) => ({ chave: k, valor: valorAtual(s, k) }));
      try {
        await this.gravar(itens);
        useOficina.getState().marcarEnviados(valores);
      } catch (e) {
        const erro = lerErro(e);
        if (!itemInvalido(erro)) throw e;
        // um item ruim não pode travar os outros: manda um por um e separa os recusados
        await this.enviarUmPorUm(chaves, itens, valores);
      }
    }
  }

  private async enviarUmPorUm(chaves: Chave[], itens: ItemEnviado[], valores: { chave: Chave; valor: unknown }[]): Promise<void> {
    const recusados: { chave: Chave; motivo: string }[] = [];
    for (let i = 0; i < itens.length && !this.parado; i++) {
      try {
        await this.gravar([itens[i]]);
        useOficina.getState().marcarEnviados([valores[i]]);
      } catch (e) {
        const erro = lerErro(e);
        if (!itemInvalido(erro)) throw e;
        const { colecao } = partesDaChave(chaves[i]);
        recusados.push({ chave: chaves[i], motivo: /grande/i.test(erro.mensagem) ? `Item grande demais (${colecao})` : `O banco recusou este item (${colecao}): ${erro.mensagem}` });
      }
    }
    if (recusados.length) useOficina.getState().rejeitarItens(recusados);
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
