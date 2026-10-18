// O segundo fator da equipe (app autenticador) vale por 12 horas. O banco usa a mesma regra em
// privado.eh_equipe; aqui é para o painel mandar confirmar o código antes de o banco recusar.
// Sem nada de servidor aqui, para dar para testar.

/** Os métodos de entrada da sessão, como vêm no token (amr). */
export interface SessaoComFatores {
  aal: 'aal1' | 'aal2';
  /** Quando a pessoa passou por cada método (segundos desde 1970). */
  metodos: { metodo: string; quando: number }[];
}

export const HORAS_DO_SEGUNDO_FATOR = 12;

/** O instante (ms) em que a pessoa passou pelo app autenticador nesta sessão, ou null. */
export function quandoPassouPeloApp(sessao: Pick<SessaoComFatores, 'metodos'>): number | null {
  const tempos = sessao.metodos.filter((m) => m.metodo === 'totp' && Number.isFinite(m.quando)).map((m) => m.quando * 1000);
  return tempos.length ? Math.max(...tempos) : null;
}

/** Passou pelo app autenticador nas últimas 12 horas. */
export function segundoFatorEmDia(sessao: SessaoComFatores, agora = Date.now()): boolean {
  const quando = quandoPassouPeloApp(sessao);
  return sessao.aal === 'aal2' && quando != null && agora - quando < HORAS_DO_SEGUNDO_FATOR * 3_600_000;
}
