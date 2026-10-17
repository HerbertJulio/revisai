// Mensagens e regras da entrada da equipe (sem nada de servidor, para testar).

/** Número aleatório deste aparelho (só o hash vai para o banco, para avisar de aparelho novo). */
export const COOKIE_APARELHO = 'revisai_aparelho_equipe';
/** Marca de que a última entrada foi num aparelho novo (para o aviso no resumo). */
export const COOKIE_APARELHO_NOVO = 'revisai_equipe_aparelho_novo';

/** Mensagem do login (GoTrue) para a pessoa, sem dizer se o e-mail existe. */
export function mensagemDaEntrada(e: { message?: string; status?: number; code?: string } | null | undefined): string {
  const m = (e?.message ?? '').toLowerCase();
  if (e?.code === 'over_email_send_rate_limit' || e?.code === 'over_request_rate_limit' || m.includes('rate limit') || e?.status === 429)
    return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (e?.code === 'otp_expired' || m.includes('expired') || m.includes('invalid') || e?.code === 'mfa_verification_failed' || m.includes('code'))
    return 'Código errado ou vencido. Confira e tente de novo.';
  return 'Não deu para entrar agora. Tente de novo em instantes.';
}

export function emailValido(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) && v.trim().length <= 160;
}

/** O código de 6 números do e-mail ou do app (aceita espaços no meio). */
export function codigoLimpo(v: string): string | null {
  const c = String(v ?? '').replace(/\s+/g, '');
  return /^\d{6,10}$/.test(c) ? c : null;
}

/** Descrição curta do aparelho para o histórico ("Chrome no Windows"). */
export function descricaoDoAparelho(agente: string): string {
  const a = agente ?? '';
  const navegador = /Edg\//.test(a)
    ? 'Edge'
    : /OPR\//.test(a)
      ? 'Opera'
      : /Firefox\//.test(a)
        ? 'Firefox'
        : /Chrome\//.test(a)
          ? 'Chrome'
          : /Safari\//.test(a)
            ? 'Safari'
            : 'Navegador';
  const sistema = /Android/.test(a) ? 'Android' : /iPhone|iPad|iOS/.test(a) ? 'iPhone' : /Windows/.test(a) ? 'Windows' : /Mac OS X|Macintosh/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : 'outro sistema';
  return `${navegador} no ${sistema}`;
}
