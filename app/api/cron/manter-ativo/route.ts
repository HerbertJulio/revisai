import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { destravarParados, limparRascunhosVelhos } from '@/lib/agente/rascunhos';
import { refazerComErro } from '@/lib/agente/webhook';
import { processarAvisos } from '@/lib/avisos/processar';
import { agendarCobrancasRecorrentes, cancelarDeOficinasSaindo, reprocessarAvisos } from '@/lib/cobranca/servidor';
import { clienteSistema } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';
// tentar de novo as montagens do WhatsApp chama a IA: dá tempo para algumas
export const maxDuration = 120;

function autorizado(req: NextRequest, segredo: string): boolean {
  const veio = Buffer.from(req.headers.get('authorization') ?? '');
  const certo = Buffer.from(`Bearer ${segredo}`);
  return veio.length === certo.length && timingSafeEqual(veio, certo);
}

/**
 * A rotina diária, chamada pelo Vercel Cron (vercel.json) com o CRON_SECRET. Vence o que vence
 * no banco (rotina_diaria), solta as montagens do agente que caíram no meio e tenta de novo as
 * que deram erro, apaga a mídia dos rascunhos parados (a posição dos entregadores que ficou para trás sai na rotina do banco). Também
 * manda os avisos que ficaram na fila e apaga o que passou do prazo (erros, avisos enviados). Também
 * mantém ativo o projeto grátis do Supabase, que pausa depois de uma semana sem uso.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return NextResponse.json({ ok: false, erro: 'CRON_SECRET não configurado' }, { status: 503 });
  if (!autorizado(req, segredo)) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = clienteSistema();
  if (!sb) return NextResponse.json({ ok: false, erro: 'Supabase não configurado' }, { status: 503 });

  const inicio = Date.now();
  const erros: string[] = [];
  async function passo<T>(nome: string, f: () => Promise<T>): Promise<T | null> {
    try {
      return await f();
    } catch (e) {
      console.error(`[cron] ${nome}`, e);
      erros.push(nome);
      return null;
    }
  }
  async function rpc(nome: string): Promise<unknown> {
    const { data, error } = await sb!.rpc(nome);
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
    return data;
  }

  const rotina = await passo('rotina', () => rpc('rotina_diaria'));
  // cada passo da rotina do banco roda separado e anota o próprio erro (erro_<passo>) sem parar os outros
  if (rotina && typeof rotina === 'object') {
    for (const [chave, valor] of Object.entries(rotina as Record<string, unknown>)) {
      if (!chave.startsWith('erro')) continue;
      console.error(`[cron] rotina: ${chave}`, valor);
      erros.push(`rotina: ${chave}`);
    }
  }
  const plataforma = await passo('rotina da plataforma', () => rpc('plataforma_rotina'));
  const chaves = await passo('chaves da cota', () => rpc('limpar_uso_chaves'));
  const parados = await passo('montagens paradas', destravarParados);
  // deixa uns 40 segundos de folga para a última montagem e a limpeza
  const refeitos = await passo('montagens com erro', () => refazerComErro(inicio + 75_000));
  const rascunhos = await passo('rascunhos velhos', () => limparRascunhosVelhos());
  // cobrança: cancela no gateway quem pediu para sair, agenda o Pix Automático do mês e refaz os
  // avisos dos gateways que falharam
  const cobrancaSaindo = await passo('cobrança de quem saiu', cancelarDeOficinasSaindo);
  const cobrancaAgenda = await passo('cobranças do mês', agendarCobrancasRecorrentes);
  const cobrancaAvisos = await passo('avisos dos gateways', reprocessarAvisos);
  // os avisos que ficaram na fila (o banco chama o app na hora; aqui é a rede de segurança)
  const avisos = await passo('avisos', () => processarAvisos({ ateMs: 20_000 }));

  return NextResponse.json(
    {
      ok: erros.length === 0,
      rotina,
      chavesDaCotaLimpas: chaves,
      montagensParadas: parados,
      montagensRefeitas: refeitos,
      rascunhosLimpos: rascunhos?.rascunhos ?? null,
      plataforma,
      avisos,
      cobranca: { saindo: cobrancaSaindo, agenda: cobrancaAgenda, avisos: cobrancaAvisos },
      erros,
      ms: Date.now() - inicio
    },
    { status: rotina == null ? 502 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
