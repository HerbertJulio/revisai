// O texto de cada aviso (push, e-mail e WhatsApp), a partir do que o banco pôs na fila.
// Sem nada de servidor aqui, para testar e para a tela de preferências usar os mesmos nomes.

import { formatarDataCurta } from '../datas';
import { formatarMoeda } from '../formatos';

export const TIPOS_AVISO = [
  { id: 'pedido_novo', nome: 'Pedido novo', para: 'loja', descricao: 'Uma oficina fez um pedido na sua loja.' },
  { id: 'alerta_novo', nome: 'Alerta de preço novo', para: 'loja', descricao: 'Uma oficina do seu estado pediu preço de algo que você vende.' },
  { id: 'pagamento_informado', nome: 'Pagamento informado', para: 'loja', descricao: 'A oficina avisou que pagou o Pix de um pedido.' },
  { id: 'pedido_situacao', nome: 'Andamento dos pedidos', para: 'oficina', descricao: 'A loja confirmou, mandou, entregou ou cancelou um pedido.' },
  { id: 'alerta_resposta', nome: 'Resposta de alerta', para: 'oficina', descricao: 'Uma loja aceitou ou fez proposta no seu alerta de preço.' },
  { id: 'link_resposta', nome: 'Resposta do cliente', para: 'oficina', descricao: 'O cliente aprovou ou recusou um orçamento, ou assinou o checklist.' },
  { id: 'agendamento_online', nome: 'Pedido de horário', para: 'oficina', descricao: 'Um cliente pediu um horário pelo link de agendamento.' },
  { id: 'suporte_resposta', nome: 'Resposta do suporte', para: 'todos', descricao: 'A equipe do Revisaí respondeu o seu pedido de ajuda.' }
] as const;

export type TipoAviso = (typeof TIPOS_AVISO)[number]['id'];

export function tipoAvisoValido(t: string): t is TipoAviso {
  return TIPOS_AVISO.some((x) => x.id === t);
}

/** Para onde o toque no aviso leva (dentro do app). */
export const ROTAS_AVISO: Record<TipoAviso, string> = {
  pedido_novo: '/fornecedor/pedidos',
  alerta_novo: '/fornecedor/alertas',
  pagamento_informado: '/fornecedor/pedidos',
  pedido_situacao: '/oficina/loja',
  alerta_resposta: '/oficina/loja',
  link_resposta: '/oficina/ordens',
  agendamento_online: '/oficina/agenda?aba=pedidos',
  suporte_resposta: '/conta?ver=1'
};

export interface MensagemAviso {
  titulo: string;
  corpo: string;
  /** Caminho no app (começa com /). */
  url: string;
  /** Avisos com a mesma marca se substituem no aparelho (o mesmo pedido, o mesmo alerta). */
  marca: string;
}

type Dados = Record<string, unknown>;

function texto(d: Dados, chave: string): string {
  const v = d[chave];
  return typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

function numero(d: Dados, chave: string): number | null {
  const v = typeof d[chave] === 'string' ? Number(d[chave]) : d[chave];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

const SITUACOES: Record<string, string> = {
  confirmado: 'confirmou o pedido',
  saiu_entrega: 'mandou o pedido para entrega',
  entregue: 'marcou o pedido como entregue',
  cancelado: 'cancelou o pedido'
};

/** O aviso pronto para mostrar, ou null se o tipo é desconhecido. */
export function mensagemDoAviso(tipo: string, dados: Dados): MensagemAviso | null {
  const d = dados ?? {};
  const codigo = texto(d, 'codigo');
  switch (tipo) {
    case 'pedido_novo': {
      const itens = numero(d, 'itens') ?? 0;
      const subtotal = numero(d, 'subtotal');
      const cidade = texto(d, 'cidade');
      const partes = [itens ? plural(itens, 'item', 'itens') : null, subtotal != null ? formatarMoeda(subtotal) : null, cidade || null].filter(Boolean);
      return {
        titulo: codigo ? `Pedido novo ${codigo}` : 'Pedido novo',
        corpo: `${partes.length ? `${partes.join(' · ')}. ` : ''}Confirme o pedido no painel para a oficina pagar.`,
        url: ROTAS_AVISO.pedido_novo,
        marca: `pedido-${texto(d, 'parteId') || codigo}`
      };
    }
    case 'pedido_situacao': {
      const loja = texto(d, 'loja') || 'A loja';
      const status = texto(d, 'status');
      const acao = SITUACOES[status] ?? 'mudou o pedido';
      const extra =
        status === 'saiu_entrega' && texto(d, 'previsao')
          ? ` Previsão: ${texto(d, 'previsao')}.`
          : status === 'cancelado' && texto(d, 'motivo')
            ? ` Motivo: ${texto(d, 'motivo')}.`
            : status === 'confirmado'
              ? ' O Pix já aparece no pedido.'
              : '';
      return {
        titulo: codigo ? `Pedido ${codigo}` : 'Pedido da loja',
        corpo: `${loja} ${acao}.${extra}`,
        url: ROTAS_AVISO.pedido_situacao,
        marca: `pedido-${texto(d, 'parteId') || codigo}`
      };
    }
    case 'alerta_novo': {
      const qtd = numero(d, 'quantidade');
      const alvo = numero(d, 'precoAlvo');
      const cidade = texto(d, 'cidade');
      const titulo = texto(d, 'titulo') || 'um produto';
      const quem = cidade ? `Uma oficina de ${cidade}` : 'Uma oficina do seu estado';
      return {
        titulo: `Alerta de preço: ${titulo}`.slice(0, 120),
        corpo: `${quem} quer comprar${qtd ? ` ${qtd}` : ''} por ${alvo != null ? `${formatarMoeda(alvo)} cada` : 'um preço menor'}. Responda em até 48 horas.`,
        url: ROTAS_AVISO.alerta_novo,
        marca: `alerta-${texto(d, 'alertaId')}`
      };
    }
    case 'alerta_resposta': {
      const loja = texto(d, 'loja') || 'Uma loja';
      const preco = numero(d, 'preco');
      const minimo = numero(d, 'minimo');
      const proposta = texto(d, 'tipo') === 'aceita' ? `aceitou por ${preco != null ? formatarMoeda(preco) : 'o seu preço'}` : `propôs ${preco != null ? formatarMoeda(preco) : 'outro preço'}`;
      return {
        titulo: `${loja} respondeu seu alerta`.slice(0, 120),
        corpo: `${texto(d, 'titulo') || 'Alerta de preço'}: ${proposta}${minimo && minimo > 1 ? ` (a partir de ${minimo})` : ''}. Escolha a proposta na loja.`,
        url: ROTAS_AVISO.alerta_resposta,
        marca: `alerta-${texto(d, 'alertaId')}`
      };
    }
    case 'pagamento_informado': {
      const subtotal = numero(d, 'subtotal');
      return {
        titulo: codigo ? `Pagamento informado no pedido ${codigo}` : 'Pagamento informado',
        corpo: `A oficina avisou que pagou${subtotal != null ? ` ${formatarMoeda(subtotal)}` : ''} por Pix. Confira no banco e confirme no painel.`,
        url: ROTAS_AVISO.pagamento_informado,
        marca: `pedido-${texto(d, 'parteId') || codigo}`
      };
    }
    case 'link_resposta': {
      const acao = texto(d, 'acao');
      const tipoLink = texto(d, 'tipoLink');
      const quem = texto(d, 'cliente') || 'O cliente';
      const sobre = texto(d, 'titulo');
      if (acao === 'paguei' && (tipoLink === 'pagamento' || tipoLink === 'clube')) {
        return {
          titulo: 'Cliente avisou que pagou',
          corpo: `${quem} avisou que pagou${sobre ? ` (${sobre})` : ''}. Confira o Pix e confirme.`,
          url: tipoLink === 'clube' ? '/oficina/clube' : ROTAS_AVISO.link_resposta,
          marca: `link-${texto(d, 'linkId')}`
        };
      }
      const corpo =
        tipoLink === 'checklist'
          ? `${quem} assinou o checklist de entrada${sobre ? ` (${sobre})` : ''}.`
          : acao === 'aprovar'
            ? `${quem} aprovou o orçamento${sobre ? ` (${sobre})` : ''}. Já dá para abrir a ordem de serviço.`
            : `${quem} recusou o orçamento${sobre ? ` (${sobre})` : ''}.`;
      return {
        titulo: tipoLink === 'checklist' ? 'Checklist assinado' : acao === 'aprovar' ? 'Orçamento aprovado' : 'Orçamento recusado',
        corpo,
        url: ROTAS_AVISO.link_resposta,
        marca: `link-${texto(d, 'linkId')}`
      };
    }
    case 'agendamento_online': {
      const quem = texto(d, 'cliente') || 'Um cliente';
      const data = texto(d, 'data');
      const hora = texto(d, 'hora');
      const servico = texto(d, 'servico');
      const quando = /^\d{4}-\d{2}-\d{2}$/.test(data) ? `o dia ${formatarDataCurta(data)}${/^\d{2}:\d{2}$/.test(hora) ? ` às ${hora}` : ''}` : 'um horário';
      return {
        titulo: 'Pedido de horário pelo link',
        corpo: `${quem} pediu ${quando}${servico ? ` (${servico})` : ''}. Aceite ou recuse na agenda.`,
        url: ROTAS_AVISO.agendamento_online,
        marca: `agenda-${texto(d, 'pedidoId')}`
      };
    }
    case 'suporte_resposta': {
      const area = texto(d, 'area');
      return {
        titulo: 'A equipe do Revisaí respondeu',
        corpo: `${texto(d, 'assunto') || 'Seu pedido de ajuda'}: ${texto(d, 'trecho')}`.slice(0, 240),
        url: area === 'oficina' ? '/oficina/ajustes#ajuda' : area === 'loja' ? '/fornecedor#ajuda' : ROTAS_AVISO.suporte_resposta,
        marca: `suporte-${texto(d, 'chamadoId')}`
      };
    }
    default:
      return null;
  }
}

/** O que vai para o serviço de push (o service worker mostra). Pequeno: até 4 KB. */
export function cargaDoPush(m: MensagemAviso): string {
  return JSON.stringify({ titulo: m.titulo.slice(0, 120), corpo: m.corpo.slice(0, 300), url: m.url, marca: m.marca.slice(0, 64) });
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface Rodape {
  empresa: string;
  site: string;
}

/** O e-mail do aviso: assunto, HTML simples (abre bem em qualquer leitor) e o texto puro. */
export function emailDoAviso(m: MensagemAviso, rodape: Rodape): { assunto: string; html: string; texto: string } {
  const link = `${rodape.site}${m.url}`;
  const preferencias = `${rodape.site}/conta?ver=1#avisos`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#1b1f22">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;color:#6b6f72">Revisaí</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapar(m.titulo)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">${escapar(m.corpo)}</p>
<a href="${escapar(link)}" style="display:inline-block;background:#1b1f22;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Abrir no Revisaí</a>
</div>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6b6f72">Você recebe este aviso porque usa o Revisaí. Para escolher quais avisos chegam por e-mail, abra <a href="${escapar(preferencias)}" style="color:#6b6f72">as preferências de avisos</a>.<br>${escapar(rodape.empresa)}</p>
</body></html>`;
  const textoPuro = `${m.titulo}\n\n${m.corpo}\n\nAbrir: ${link}\n\nPara escolher quais avisos chegam por e-mail: ${preferencias}\n${rodape.empresa}`;
  return { assunto: m.titulo, html, texto: textoPuro };
}

/** Espera antes de tentar de novo (minutos): 2, 4, 8, 16. */
export function esperaDaTentativa(tentativa: number): number {
  return 2 ** Math.min(Math.max(tentativa, 1), 6);
}
