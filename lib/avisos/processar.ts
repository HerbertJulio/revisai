import 'server-only';

// O processador da fila de avisos. Pega um lote no banco (sem pegar o que outro servidor já
// pegou), manda por push, e-mail e WhatsApp conforme o que cada pessoa ligou, e devolve o
// resultado ao banco. Chamado pelo próprio banco (pg_net) logo depois do evento e pela rotina
// diária, que pega o que ficou para trás.

import { clienteSistema } from '../supabase-servidor';
import { configEmail, enviarEmail } from './email';
import { linhaDaEmpresa, dadosDaEmpresa } from './empresa';
import { avisoConcluido, emailsDoAviso, lerLote, pushesDoAviso, type Contagem } from './lote';
import { cargaDoPush, emailDoAviso, mensagemDoAviso, tipoAvisoValido } from './mensagens';
import { chavesVapid, enviarPush } from './push';
import { configWhatsAppAvisos, enviarWhatsApp, modeloDoAviso } from './whatsapp';

export interface ResultadoDosAvisos {
  lidos: number;
  enviados: number;
  paraDepois: number;
  push: number;
  emails: number;
  whatsapps: number;
  erro?: string;
}

const VAZIO: ResultadoDosAvisos = { lidos: 0, enviados: 0, paraDepois: 0, push: 0, emails: 0, whatsapps: 0 };

/** Processa a fila até acabar ou até o tempo `ateMs` (para caber no limite da função na Vercel). */
export async function processarAvisos(opcoes: { lote?: number; ateMs?: number } = {}): Promise<ResultadoDosAvisos> {
  const sb = clienteSistema();
  if (!sb) return { ...VAZIO, erro: 'sem banco' };
  const fim = Date.now() + (opcoes.ateMs ?? 20_000);
  const total = { ...VAZIO };
  const email = configEmail();
  const whatsapp = configWhatsAppAvisos();
  const empresa = dadosDaEmpresa();
  const rodape = { empresa: linhaDaEmpresa(empresa), site: empresa.site };
  let chaves: Awaited<ReturnType<typeof chavesVapid>> | undefined;

  while (Date.now() < fim) {
    const { data, error } = await sb.rpc('avisos_reservar', { p_limite: opcoes.lote ?? 10 });
    if (error) {
      console.error('[avisos] reservar', error.message);
      return { ...total, erro: 'reservar' };
    }
    const lote = lerLote(data);
    if (!lote.length) break;

    for (const a of lote) {
      // acabou o tempo: o que sobrou do lote volta para a fila quando a reserva vencer (2 minutos)
      if (Date.now() >= fim) break;
      total.lidos++;
      const m = tipoAvisoValido(a.tipo) ? mensagemDoAviso(a.tipo, a.dados) : null;
      if (!m) {
        await sb.rpc('avisos_concluir', { p_id: a.id, p_ok: true, p_erro: 'tipo desconhecido' });
        continue;
      }
      const conta: Contagem = { ok: 0, tentar: 0, erro: 0 };
      const invalidos: string[] = [];
      const entregues: string[] = [];
      const erros: string[] = [];

      const pushes = pushesDoAviso(a.para.pessoas);
      if (pushes.length) {
        chaves ??= await chavesVapid();
        if (chaves) {
          const carga = cargaDoPush(m);
          for (const i of pushes) {
            const r = await enviarPush(i, carga, chaves);
            if (r === 'ok') {
              conta.ok++;
              total.push++;
              entregues.push(i.endpoint);
            } else if (r === 'sumiu') invalidos.push(i.endpoint);
            else if (r === 'tentar') conta.tentar++;
            else conta.erro++;
          }
        } else {
          conta.tentar++;
          erros.push('sem chaves de push');
        }
      }

      if (email) {
        const e = emailDoAviso(m, rodape);
        for (const para of emailsDoAviso(a.para.pessoas)) {
          const r = await enviarEmail(email, para, e.assunto, e.html, e.texto);
          if (r === 'ok') {
            conta.ok++;
            total.emails++;
          } else if (r === 'tentar') conta.tentar++;
          else {
            conta.erro++;
            erros.push('e-mail recusado');
          }
        }
      }

      const modelo = tipoAvisoValido(a.tipo) ? modeloDoAviso(a.tipo) : null;
      if (whatsapp && modelo) {
        for (const para of [...new Set(a.para.whatsapps)]) {
          // teto por número por dia: nenhum número recebe uma enxurrada de mensagens do Revisaí
          const { data: cabe } = await sb.rpc('limite_consumir', { p_chave: `wa-aviso:${para}`, p_max: 30, p_segundos: 86_400 });
          if (cabe === false) {
            erros.push('whatsapp no teto do dia');
            continue;
          }
          const r = await enviarWhatsApp(whatsapp, para, modelo, m);
          if (r === 'ok') {
            conta.ok++;
            total.whatsapps++;
          } else if (r === 'tentar') conta.tentar++;
          else {
            conta.erro++;
            erros.push('whatsapp recusado');
          }
        }
      }

      const ok = avisoConcluido(conta);
      const { error: e2 } = await sb.rpc('avisos_concluir', {
        p_id: a.id,
        p_ok: ok,
        p_erro: erros.length ? [...new Set(erros)].join(', ') : conta.tentar ? 'falha passageira' : null,
        p_push_invalidos: invalidos,
        p_push_ok: entregues
      });
      if (e2) console.error('[avisos] concluir', e2.message);
      if (ok) total.enviados++;
      else total.paraDepois++;
    }
  }
  return total;
}
