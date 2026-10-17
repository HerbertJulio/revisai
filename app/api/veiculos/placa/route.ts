import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { lerJson, mesmaOrigem } from '@/lib/avisos/http';
import { acessoDaOficina } from '@/lib/conta';
import { permitidoPara } from '@/lib/limite';
import { esquemaDadosPlaca, esquemaUsoDePlacas, mensagemDaCota, placaCanonica, placaParaConsulta, type DadosPlaca, type UsoDePlacas } from '@/lib/placa';
import { clienteSistema } from '@/lib/supabase-servidor';
import { configDaPlaca, consultarPlaca } from './provedores';

export const dynamic = 'force-dynamic';

// O carro pela placa, para a oficina com conta. Primeiro o que já está guardado (30 dias, não
// gasta a cota); senão gasta uma consulta do mês da oficina e pergunta ao provedor. Se o
// provedor falhar, a consulta volta para a cota.

const SEM_CACHE = { 'Cache-Control': 'no-store' };

function responder(corpo: object, status = 200) {
  return NextResponse.json(corpo, { status, headers: SEM_CACHE });
}

const SEM_CONTA = 'Para buscar pela placa, a oficina precisa ter conta. Entre ou crie a conta (é de graça) e a busca fica liberada.';
const DESLIGADA = 'A busca pela placa ainda não foi ligada neste servidor. Preencha à mão.';

async function usoDoMes(a: { sb: SupabaseClient; oficina: { id: string } }): Promise<UsoDePlacas | null> {
  const { data } = await a.sb.rpc('placas_uso_do_mes', { p_oficina: a.oficina.id });
  const r = esquemaUsoDePlacas.safeParse(data);
  return r.success ? r.data : null;
}

/** Se a busca está disponível para quem pergunta, e quanto da cota do mês já foi. */
export async function GET() {
  const acesso = await acessoDaOficina();
  if (!acesso.ok) return responder({ ok: true, disponivel: false, motivo: 'conta', mensagem: SEM_CONTA });
  const cfg = configDaPlaca();
  if (!cfg) return responder({ ok: true, disponivel: false, motivo: 'desligada', mensagem: DESLIGADA });
  return responder({ ok: true, disponivel: true, teste: cfg.provedor === 'teste', uso: await usoDoMes(acesso) });
}

const esquema = z.object({ placa: z.string().min(1).max(12) });

function lerGuardado(data: unknown): DadosPlaca | null {
  const dados = (data as { dados?: { v?: number; dados?: unknown } } | null)?.dados;
  if (!dados || dados.v !== 1) return null;
  const r = esquemaDadosPlaca.safeParse(dados.dados);
  return r.success ? r.data : null;
}

export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return responder({ ok: false, erro: 'Pedido de outro site.' }, 403);
  const acesso = await acessoDaOficina();
  if (!acesso.ok) return responder({ ok: false, motivo: 'conta', erro: SEM_CONTA }, 401);
  const cfg = configDaPlaca();
  if (!cfg) return responder({ ok: false, motivo: 'desligada', erro: DESLIGADA }, 503);
  const corpo = esquema.safeParse(await lerJson(req, 500));
  const placa = corpo.success ? placaParaConsulta(corpo.data.placa) : null;
  const chave = placa ? placaCanonica(placa) : null;
  if (!placa || !chave) return responder({ ok: false, erro: 'Placa no formato ABC1D23 ou ABC-1234.' }, 400);
  // contra abuso: até 30 buscas a cada 10 minutos por oficina, contando as que já estavam guardadas
  if (!(await permitidoPara(`placa:${acesso.oficina.id}`, 30, 10))) return responder({ ok: false, erro: 'Muitas buscas seguidas. Espere alguns minutos.' }, 429);

  const sistema = clienteSistema();
  if (sistema) {
    const { data, error } = await sistema.rpc('placas_cache_ler', { p_placa: chave });
    if (error) console.warn('[placa] ler guardado', error.message);
    const guardado = lerGuardado(data);
    if (guardado) return responder({ ok: true, dados: { ...guardado, placa }, guardada: true, uso: await usoDoMes(acesso) });
  }

  const { data: cota, error: erroCota } = await acesso.sb.rpc('placas_consumir', { p_oficina: acesso.oficina.id });
  if (erroCota) {
    if (erroCota.code === 'RV090') {
      let detalhe: Partial<UsoDePlacas> = {};
      try {
        detalhe = JSON.parse(erroCota.details ?? '{}') as Partial<UsoDePlacas>;
      } catch {}
      const plano = detalhe.plano ?? acesso.oficina.plano;
      const limite = Number(detalhe.limite) || (plano === 'gratis' ? 20 : 200);
      return responder({ ok: false, motivo: 'cota', erro: mensagemDaCota({ plano, limite }), uso: { plano, usado: limite, limite } }, 429);
    }
    console.error('[placa] cota', erroCota.code, erroCota.message);
    return responder({ ok: false, erro: 'Não deu para buscar agora. Tente de novo.' }, 500);
  }
  const uso = esquemaUsoDePlacas.safeParse(cota);

  const r = await consultarPlaca(placa, cfg);
  if (r.tipo === 'falhou') {
    // o provedor não cobra quando falha: a consulta volta para a cota da oficina
    const { error } = (await sistema?.rpc('placas_devolver', { p_oficina: acesso.oficina.id })) ?? { error: null };
    if (error) console.warn('[placa] devolver', error.message);
    return responder({ ok: false, motivo: 'falhou', erro: r.mensagem }, 502);
  }
  if (r.tipo === 'nao_achou') {
    return responder({ ok: false, motivo: 'nao_achou', erro: 'Não achamos essa placa. Confira as letras e os números, ou preencha à mão.', uso: uso.success ? uso.data : null }, 404);
  }
  if (sistema) {
    const { error } = await sistema.rpc('placas_cache_gravar', { p_placa: chave, p_dados: { v: 1, provedor: cfg.provedor, dados: r.dados } });
    if (error) console.warn('[placa] guardar', error.message);
  }
  return responder({ ok: true, dados: { ...r.dados, placa }, guardada: false, uso: uso.success ? uso.data : null });
}
