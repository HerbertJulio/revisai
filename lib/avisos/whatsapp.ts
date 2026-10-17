import 'server-only';

// Avisos por WhatsApp com modelos (templates) aprovados na Meta. Fora da janela de 24 horas
// da conversa, a Meta só aceita modelo. Cada tipo de aviso pode ter o próprio modelo
// (WHATSAPP_MODELO_PEDIDO_NOVO, WHATSAPP_MODELO_ALERTA_NOVO...) ou usar o geral
// (WHATSAPP_MODELO_AVISO), sempre com duas variáveis no corpo: {{1}} o título e {{2}} o texto.
// Sem o token, o número ou o modelo, não manda nada.

import type { MensagemAviso, TipoAviso } from './mensagens';

export interface ConfigWhatsAppAvisos {
  token: string;
  numeroId: string;
  versao: string;
  url: string;
  idioma: string;
}

export function configWhatsAppAvisos(): ConfigWhatsAppAvisos | null {
  const token = (process.env.WHATSAPP_TOKEN ?? '').trim();
  const numeroId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim();
  if (!token || !numeroId) return null;
  return {
    token,
    numeroId,
    versao: process.env.WHATSAPP_API_VERSAO?.trim() || 'v23.0',
    url: (process.env.AVISOS_WHATSAPP_URL?.trim() || 'https://graph.facebook.com').replace(/\/+$/, ''),
    idioma: process.env.WHATSAPP_MODELO_IDIOMA?.trim() || 'pt_BR'
  };
}

// Pedido novo e alerta novo já vão para o WhatsApp da loja pelos modelos próprios da área da loja
// (WHATSAPP_MODELO_LOJA_PEDIDO e WHATSAPP_MODELO_LOJA_ALERTA). Com eles ligados, a fila não manda
// de novo: a loja receberia a mesma mensagem duas vezes.
const JA_AVISADOS_PELA_LOJA: Partial<Record<TipoAviso, string>> = {
  pedido_novo: 'WHATSAPP_MODELO_LOJA_PEDIDO',
  alerta_novo: 'WHATSAPP_MODELO_LOJA_ALERTA'
};

/** O nome do modelo deste tipo de aviso (ou o geral), ou null quando não há. */
export function modeloDoAviso(tipo: TipoAviso): string | null {
  const daLoja = JA_AVISADOS_PELA_LOJA[tipo];
  if (daLoja && (process.env[daLoja] ?? '').trim()) return null;
  const proprio = (process.env[`WHATSAPP_MODELO_${tipo.toUpperCase()}`] ?? '').trim();
  const geral = (process.env.WHATSAPP_MODELO_AVISO ?? '').trim();
  return proprio || geral || null;
}

/** Variável de modelo da Meta: sem quebra de linha, sem espaços seguidos e nunca vazia. */
function parametro(t: string, max: number): string {
  return t.replace(/\s+/g, ' ').trim().slice(0, max) || '-';
}

export type ResultadoWhatsApp = 'ok' | 'tentar' | 'erro';

export async function enviarWhatsApp(c: ConfigWhatsAppAvisos, para: string, modelo: string, m: MensagemAviso): Promise<ResultadoWhatsApp> {
  try {
    const r = await fetch(`${c.url}/${c.versao}/${c.numeroId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: para,
        type: 'template',
        template: {
          name: modelo,
          language: { code: c.idioma },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: parametro(m.titulo, 60) },
                { type: 'text', text: parametro(m.corpo, 600) }
              ]
            }
          ]
        }
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (r.ok) return 'ok';
    if (r.status === 429 || r.status >= 500) return 'tentar';
    console.error('[avisos] whatsapp recusado', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return 'erro';
  } catch (e) {
    console.error('[avisos] whatsapp falhou', e instanceof Error ? e.message : e);
    return 'tentar';
  }
}
