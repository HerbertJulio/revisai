import { after, NextResponse, type NextRequest } from 'next/server';
import { textoDoResumo } from '@/lib/agente/resumo';
import {
  anexarMidia,
  anexarTexto,
  descartarAberto,
  processarRascunho,
  rascunhoAberto,
  ultimaMontada,
  vincularTelefone,
  vinculoDoTelefone
} from '@/lib/agente/rascunhos';
import { assinaturaValida, baixarMidia, comando, configWhatsApp, lerMensagens, responder, type ConfigWhatsApp, type MensagemRecebida } from '@/lib/agente/whatsapp-cloud';

export const dynamic = 'force-dynamic';
// a IA pode levar até um minuto; o processamento roda depois da resposta (after)
export const maxDuration = 120;

const SITE = process.env.SITE_URL?.trim() || 'https://revisai.howlks.com';

const AJUDA = `Sou o assistente de ordens de serviço do Revisaí.
1. Mande áudios contando o que fez no carro: placa, quilometragem, o que trocou (com a marca) e o que encontrou.
2. Mande fotos do que encontrou (pastilha, pneu, vazamento, painel).
3. Quando terminar, escreva *fechar*. Eu monto a ordem e o texto para o cliente.
Escreva *texto* para receber de novo a mensagem do cliente, ou *cancelar* para jogar fora o que mandou.`;

const NAO_LIGADO = `Este WhatsApp ainda não está ligado a uma oficina. No Revisaí, abra Ajustes, toque em Agente no WhatsApp e mande aqui o código de 6 dígitos que aparecer.`;

/** Verificação do webhook pela Meta (feita uma vez, ao cadastrar a URL). */
export async function GET(req: NextRequest) {
  const c = configWhatsApp();
  const p = req.nextUrl.searchParams;
  if (c && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === c.verificacao) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new NextResponse('Proibido', { status: 403 });
}

/** Mensagens que chegam no número do agente. Responde 200 na hora e trata depois. */
export async function POST(req: NextRequest) {
  const c = configWhatsApp();
  if (!c) return NextResponse.json({ erro: 'WhatsApp não configurado' }, { status: 503 });
  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers.get('x-hub-signature-256'), c.segredo)) return NextResponse.json({ erro: 'assinatura' }, { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const mensagens = lerMensagens(json);
  if (mensagens.length) after(() => tratarTodas(c, mensagens));
  return NextResponse.json({ ok: true });
}

async function tratarTodas(c: ConfigWhatsApp, mensagens: MensagemRecebida[]) {
  for (const m of mensagens) {
    try {
      await tratar(c, m);
    } catch (e) {
      console.error('[whatsapp] mensagem', m.id, e);
    }
  }
}

async function tratar(c: ConfigWhatsApp, m: MensagemRecebida) {
  const cmd = m.tipo === 'texto' ? comando(m.texto) : null;
  if (cmd && typeof cmd === 'object') {
    const v = await vincularTelefone(m.de, cmd.conectar);
    await responder(c, m.de, v ? `Pronto! Este WhatsApp está ligado à ${v.oficina ?? 'sua oficina'}.\n\n${AJUDA}` : 'Esse código não vale mais. Gere outro no Revisaí, em Ajustes, Agente no WhatsApp.');
    return;
  }
  const vinculo = await vinculoDoTelefone(m.de);
  if (!vinculo) {
    await responder(c, m.de, NAO_LIGADO);
    return;
  }
  if (cmd === 'ajuda') return void (await responder(c, m.de, AJUDA));
  if (cmd === 'cancelar') {
    const ok = await descartarAberto(m.de);
    return void (await responder(c, m.de, ok ? 'Joguei fora o que você tinha mandado. Pode começar outra ordem.' : 'Não tinha nada aberto.'));
  }
  if (cmd === 'texto') {
    const o = await ultimaMontada(m.de);
    return void (await responder(c, m.de, o ? o.mensagemCliente : 'Ainda não montei nenhuma ordem. Mande os áudios e as fotos e escreva fechar.'));
  }
  const r = await rascunhoAberto(m.de, vinculo.aparelhoId);
  if (!r) return void (await responder(c, m.de, 'Não consegui abrir a ordem agora. Tente de novo em instantes.'));

  if (cmd === 'fechar') {
    if (!r.midias.length && !r.textos.length) return void (await responder(c, m.de, 'Mande primeiro os áudios e as fotos do serviço. Depois escreva fechar.'));
    await responder(c, m.de, 'Montando a ordem de serviço. Leva uns segundos.');
    const res = await processarRascunho(r.id, vinculo.oficina);
    if (!res.ok) return void (await responder(c, m.de, `${res.erro} O que você mandou continua guardado. Escreva *fechar* de novo para tentar outra vez.`));
    await responder(c, m.de, `${textoDoResumo(res.ordem)}\n\nConfira e confirme no app: ${SITE}/oficina/ordem`);
    await responder(c, m.de, res.ordem.mensagemCliente);
    return;
  }

  if (m.tipo === 'texto') {
    await anexarTexto(r, m.id, m.texto);
    return;
  }
  if (m.tipo === 'audio' || m.tipo === 'imagem') {
    const midia = await baixarMidia(c, m.midiaId);
    if (!midia) return void (await responder(c, m.de, 'Não consegui baixar esse arquivo. Mande de novo, por favor.'));
    const primeira = await anexarMidia(r, m.id, m.tipo === 'audio' ? 'audio' : 'foto', midia.bytes, midia.mime || m.mime, m.tipo === 'imagem' ? m.legenda : null);
    if (primeira) await responder(c, m.de, 'Recebi. Pode mandar mais áudios e fotos. Quando terminar, escreva *fechar*.');
    return;
  }
  await responder(c, m.de, 'Por aqui eu entendo áudio, foto e texto. ' + AJUDA);
}
