import 'server-only';

// O envio de e-mail pela API HTTP do Resend (https://resend.com/docs/api-reference/emails/send-email).
// Sem RESEND_API_KEY e AVISOS_REMETENTE, não manda nada e não reclama: o resto continua igual.

export interface Email {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  /** Evita mandar o mesmo e-mail duas vezes (o Resend guarda por 24 horas). */
  chave?: string;
}

export type ResultadoDoEnvio = { ok: true; id: string | null } | { ok: false; motivo: 'desligado' | 'erro'; erro?: string };

export function emailLigado(): boolean {
  return !!(process.env.RESEND_API_KEY ?? '').trim() && !!(process.env.AVISOS_REMETENTE ?? '').trim();
}

export async function enviarEmail(e: Email, buscar: typeof fetch = fetch): Promise<ResultadoDoEnvio> {
  const chave = (process.env.RESEND_API_KEY ?? '').trim();
  const remetente = (process.env.AVISOS_REMETENTE ?? '').trim();
  if (!chave || !remetente) return { ok: false, motivo: 'desligado' };
  try {
    const r = await buscar('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${chave}`,
        'content-type': 'application/json',
        ...(e.chave ? { 'idempotency-key': e.chave.slice(0, 256) } : {})
      },
      body: JSON.stringify({ from: remetente, to: [e.para], subject: e.assunto, html: e.html, text: e.texto }),
      signal: AbortSignal.timeout(10_000)
    });
    const corpo = (await r.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!r.ok) return { ok: false, motivo: 'erro', erro: corpo?.message ?? `HTTP ${r.status}` };
    return { ok: true, id: corpo?.id ?? null };
  } catch (erro) {
    return { ok: false, motivo: 'erro', erro: String((erro as Error)?.message ?? erro) };
  }
}

/** Texto seguro dentro do HTML do e-mail. */
export function escaparHtml(t: string | null | undefined): string {
  return (t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export interface CopiaDaAprovacao {
  oficina: string;
  cliente: string;
  numero: number;
  carro: string;
  placa: string;
  itens: { descricao: string; quantidade: number; unidade: string; valor: number | null }[];
  recusados: string[];
  total: number;
  validade: string;
  canal: string;
  quando: string;
  nome?: string | null;
  ip?: string | null;
  aparelho?: string | null;
  conferencia: string;
  versao: string;
  link?: string | null;
}

const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** O comprovante da aprovação, em texto e em HTML (tudo escapado). */
export function emailDaAprovacao(c: CopiaDaAprovacao): Omit<Email, 'para' | 'chave'> {
  const oi = c.cliente ? `Olá, ${c.cliente}!` : 'Olá!';
  const carro = [c.carro, c.placa ? `placa ${c.placa}` : ''].filter(Boolean).join(', ');
  const linhaItem = (i: CopiaDaAprovacao['itens'][number]) =>
    `${i.descricao}${i.quantidade !== 1 || i.unidade === 'L' ? ` (${qtd.format(i.quantidade)} ${i.unidade})` : ''}${i.valor != null ? `: ${real.format(i.valor)}` : ''}`;
  const prova = [
    `Aprovado em ${c.quando}, ${c.canal.toLowerCase()}.`,
    [c.nome ? `Nome: ${c.nome}.` : '', c.ip ? `IP: ${c.ip}.` : '', c.aparelho ? `Aparelho: ${c.aparelho}.` : ''].filter(Boolean).join(' ')
  ].filter(Boolean);
  const texto = [
    oi,
    '',
    `Este é o comprovante da aprovação do orçamento nº ${c.numero} da ${c.oficina}${carro ? `, para o ${carro}` : ''}.`,
    '',
    'Itens aprovados:',
    ...c.itens.map((i) => `- ${linhaItem(i)}`),
    ...(c.recusados.length ? ['', `Ficou para depois: ${c.recusados.join(', ')}.`] : []),
    '',
    `Total aprovado: ${real.format(c.total)}. Válido até ${c.validade}.`,
    '',
    ...prova,
    `Código de conferência: ${c.conferencia}`,
    `Resumo completo (SHA-256): ${c.versao}`,
    ...(c.link ? ['', `Ver o orçamento: ${c.link}`] : []),
    '',
    'Guarde este e-mail: ele mostra o que foi combinado com a oficina.'
  ].join('\n');
  const e = escaparHtml;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f2f4f3;font-family:Arial,Helvetica,sans-serif;color:#1b1f22">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;color:#6b4600;font-weight:bold">Comprovante de aprovação</p>
<h1 style="margin:0 0 12px;font-size:22px">Orçamento nº ${c.numero} · ${e(c.oficina)}</h1>
<p style="margin:0 0 16px">${e(oi)} Este é o comprovante do que você aprovou${carro ? ` para o ${e(carro)}` : ''}.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
${c.itens.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #cbd1ce">${e(i.descricao)}${i.quantidade !== 1 || i.unidade === 'L' ? ` <span style="color:#6b747a">(${e(qtd.format(i.quantidade))} ${e(i.unidade)})</span>` : ''}</td><td style="padding:6px 0;border-bottom:1px solid #cbd1ce;text-align:right;white-space:nowrap">${i.valor != null ? e(real.format(i.valor)) : ''}</td></tr>`).join('\n')}
<tr><td style="padding:10px 0;font-weight:bold">Total aprovado</td><td style="padding:10px 0;text-align:right;font-weight:bold;font-size:18px">${e(real.format(c.total))}</td></tr>
</table>
${c.recusados.length ? `<p style="margin:8px 0;font-size:14px;color:#4b545a">Ficou para depois: ${e(c.recusados.join(', '))}.</p>` : ''}
<p style="margin:8px 0;font-size:14px;color:#4b545a">Válido até ${e(c.validade)}.</p>
<div style="margin:16px 0;padding:12px;border-radius:8px;background:#f2f4f3;font-size:13px;line-height:1.5">
${prova.map((p) => `<div>${e(p)}</div>`).join('')}
<div>Código de conferência: <strong style="font-family:monospace">${e(c.conferencia)}</strong></div>
<div style="color:#6b747a;word-break:break-all">SHA-256: ${e(c.versao)}</div>
</div>
${c.link ? `<p style="margin:0 0 16px"><a href="${e(c.link)}" style="color:#2546c2">Ver o orçamento</a></p>` : ''}
<p style="margin:0;font-size:12px;color:#6b747a">Guarde este e-mail: ele mostra o que foi combinado com a oficina.</p>
</div></body></html>`;
  return { assunto: `Comprovante da aprovação do orçamento nº ${c.numero} · ${c.oficina}`, texto, html };
}
