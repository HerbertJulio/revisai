import 'server-only';

// O que o agente faz com cada mensagem que chega no WhatsApp: ligar o número à oficina pelo código,
// juntar áudios, fotos e textos no rascunho e montar a ordem quando o mecânico escreve fechar.
// Número desconhecido recebe uma instrução por dia e nada fica guardado; o agente é do Pro.

import { createHmac } from 'node:crypto';
import { textoDoResumo } from './resumo';
import { anexarMidia, anexarTexto, contextoDoTelefone, descartarAberto, processarRascunho, rascunhoAberto, ultimaMontada, vincularTelefone } from './rascunhos';
import { baixarMidia, comando, responder, type ConfigWhatsApp, type MensagemRecebida } from './whatsapp-cloud';
import { permitidoPara } from '../limite';
import { chaveDoSistema } from '../supabase-servidor';

const SITE = process.env.SITE_URL?.trim() || 'https://revisai.howlks.com';

export const AJUDA = `Sou o assistente de ordens de serviço do Revisaí.
1. Mande áudios contando o que fez no carro: placa, quilometragem, o que trocou (com a marca) e o que encontrou.
2. Mande fotos do que encontrou (pastilha, pneu, vazamento, painel).
3. Quando terminar, escreva *fechar*. Eu monto a ordem e o texto para o cliente.
Escreva *texto* para receber de novo a mensagem do cliente, ou *cancelar* para jogar fora o que mandou.`;

export const NAO_LIGADO = `Este WhatsApp não está ligado a uma oficina no Revisaí. Para ligar, abra o Revisaí, vá em Ajustes, Agente no WhatsApp, e mande aqui o código de 8 números que aparecer.`;

export const SO_PRO = `O agente no WhatsApp faz parte do Revisaí Pro. A oficina pode testar o Pro por 30 dias em Ajustes, na parte Plano. Enquanto isso, a ordem por voz funciona no app.`;

const CODIGO_ERRADO = 'Esse código não vale. Gere outro no Revisaí, em Ajustes, Agente no WhatsApp (ele vale 15 minutos e uma vez só).';
const TENTATIVAS = 'Muitas tentativas de código seguidas. Espere 15 minutos e gere um código novo no app.';

/** Nas chaves dos limites o número vai embaralhado (com a chave do sistema): o banco não guarda o telefone. */
function marca(telefone: string): string {
  return createHmac('sha256', chaveDoSistema() ?? 'revisai').update(telefone).digest('hex').slice(0, 32);
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tratarTodas(c: ConfigWhatsApp, mensagens: MensagemRecebida[]) {
  for (const m of mensagens) {
    try {
      await tratar(c, m);
    } catch (e) {
      console.error('[whatsapp] mensagem', m.id, e);
    }
  }
}

async function conectar(c: ConfigWhatsApp, m: MensagemRecebida, codigo: string) {
  const inicio = Date.now();
  const quem = marca(m.de);
  // por número e no total: ninguém fica tentando códigos
  if (!(await permitidoPara(`wa:conectar:${quem}`, 5, 15)) || !(await permitidoPara('wa:conectar', 300, 15))) {
    if (await permitidoPara(`wa:conectar-aviso:${quem}`, 1, 15)) await responder(c, m.de, TENTATIVAS);
    return;
  }
  const v = /^55\d{10,11}$/.test(m.de) ? await vincularTelefone(m.de, codigo) : null;
  // a resposta leva sempre o mesmo tempo, com código certo ou errado
  await espera(Math.max(0, 700 - (Date.now() - inicio)));
  await responder(c, m.de, v ? `Pronto! Este WhatsApp está ligado à ${v.oficina || 'sua oficina'}.\n\n${AJUDA}` : CODIGO_ERRADO);
}

async function tratar(c: ConfigWhatsApp, m: MensagemRecebida) {
  // teto geral contra enxurrada de mensagens
  if (!(await permitidoPara('wa:geral', 900, 1))) return;
  const cmd = m.tipo === 'texto' ? comando(m.texto) : null;
  if (cmd && typeof cmd === 'object') return conectar(c, m, cmd.conectar);

  const ctx = await contextoDoTelefone(m.de);
  const quem = marca(m.de);
  if (!ctx) {
    // número desconhecido: uma instrução curta por dia, e nada fica guardado
    if (await permitidoPara(`wa:desconhecido:${quem}`, 1, 1440)) await responder(c, m.de, NAO_LIGADO);
    return;
  }
  if (ctx.plano === 'gratis') {
    if (await permitidoPara(`wa:gratis:${quem}`, 1, 1440)) await responder(c, m.de, SO_PRO);
    return;
  }
  if (!(await permitidoPara(`wa:numero:${quem}`, 150, 10))) return;

  if (cmd === 'ajuda') return void (await responder(c, m.de, AJUDA));
  if (cmd === 'cancelar') {
    const ok = await descartarAberto(m.de, ctx.oficinaId);
    return void (await responder(c, m.de, ok ? 'Joguei fora o que você tinha mandado. Pode começar outra ordem.' : 'Não tinha nada aberto.'));
  }
  if (cmd === 'texto') {
    const o = await ultimaMontada(m.de, ctx.oficinaId);
    return void (await responder(c, m.de, o ? o.mensagemCliente : 'Ainda não montei nenhuma ordem. Mande os áudios e as fotos e escreva fechar.'));
  }
  const r = await rascunhoAberto(m.de, ctx.oficinaId);
  if (!r) return void (await responder(c, m.de, 'Não consegui abrir a ordem agora. Tente de novo em instantes.'));

  if (cmd === 'fechar') {
    if (!r.midias.length && !r.textos.length) return void (await responder(c, m.de, 'Mande primeiro os áudios e as fotos do serviço. Depois escreva fechar.'));
    await responder(c, m.de, 'Montando a ordem de serviço. Leva uns segundos.');
    const res = await processarRascunho(r.id, ctx.oficina);
    if (!res.ok) {
      if (res.semCota) return void (await responder(c, m.de, `${res.erro} O que você mandou continua guardado. Quando liberar, escreva *fechar* de novo.`));
      return void (await responder(c, m.de, `${res.erro} O que você mandou continua guardado. Escreva *fechar* de novo para tentar outra vez.`));
    }
    await responder(c, m.de, `${textoDoResumo(res.ordem)}\n\nConfira e confirme no app: ${SITE}/oficina/ordem`);
    await responder(c, m.de, res.ordem.mensagemCliente);
    return;
  }

  if (m.tipo === 'texto') {
    await anexarTexto(r, m.id, m.texto);
    return;
  }
  if (m.tipo === 'audio' || m.tipo === 'imagem') {
    const midia = await baixarMidia(c, m.midiaId, m.tipo);
    if (!midia) return void (await responder(c, m.de, 'Não consegui receber esse arquivo. Mande de novo: áudio de até 16 MB ou foto de até 5 MB (JPG, PNG ou WebP).'));
    const primeira = await anexarMidia(r, m.id, m.tipo === 'audio' ? 'audio' : 'foto', midia.bytes, midia.mime, m.tipo === 'imagem' ? m.legenda : null);
    if (primeira) await responder(c, m.de, 'Recebi. Pode mandar mais áudios e fotos. Quando terminar, escreva *fechar*.');
    return;
  }
  await responder(c, m.de, 'Por aqui eu entendo áudio, foto e texto. ' + AJUDA);
}
