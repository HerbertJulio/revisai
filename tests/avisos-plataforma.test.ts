import { createECDH, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// O banco de mentira do processador: entrega os lotes e guarda as chamadas.
const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
let lotes: unknown[][] = [];
let vapid: { publica: string; privada: string } | null = null;
const banco = {
  rpc: async (fn: string, args: Record<string, unknown> = {}) => {
    chamadas.push({ fn, args });
    if (fn === 'avisos_reservar') return { data: lotes.shift() ?? [], error: null };
    if (fn === 'vapid_obter') return { data: vapid, error: null };
    if (fn === 'vapid_guardar') {
      vapid ??= { publica: String(args.p_publica), privada: String(args.p_privada) };
      return { data: vapid, error: null };
    }
    return { data: true, error: null };
  }
};
vi.mock('@/lib/supabase-servidor', () => ({ clienteSistema: () => banco }));

const { TIPOS_AVISO, cargaDoPush, emailDoAviso, esperaDaTentativa, mensagemDoAviso } = await import('@/lib/avisos/mensagens');
const { avisoConcluido, emailsDoAviso, lerLote, pushesDoAviso } = await import('@/lib/avisos/lote');
const { agenteResumido, lerRelato, limparRota, limparTexto } = await import('@/lib/avisos/erros');
const { modeloDoAviso } = await import('@/lib/avisos/whatsapp');
const { processarAvisos } = await import('@/lib/avisos/processar');

const ece = createRequire(import.meta.url)('http_ece') as { decrypt(corpo: Buffer, p: Record<string, unknown>): Buffer };

const espacos = (t: string) => t.replace(/\s/g, ' ');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  chamadas.length = 0;
  lotes = [];
});

describe('texto dos avisos', () => {
  it('pedido novo e andamento do pedido', () => {
    const novo = mensagemDoAviso('pedido_novo', { parteId: 7, codigo: 'ABC123', subtotal: 80, itens: 1, cidade: 'Rio' });
    expect(novo).toMatchObject({ titulo: 'Pedido novo ABC123', url: '/fornecedor/pedidos', marca: 'pedido-7' });
    expect(espacos(novo!.corpo)).toBe('1 item · R$ 80,00 · Rio. Confirme o pedido no painel para a oficina pagar.');
    const saiu = mensagemDoAviso('pedido_situacao', { parteId: 7, codigo: 'ABC123', loja: 'Auto Peças Centro', status: 'saiu_entrega', previsao: 'hoje 15h' });
    expect(saiu).toMatchObject({ titulo: 'Pedido ABC123', corpo: 'Auto Peças Centro mandou o pedido para entrega. Previsão: hoje 15h.', url: '/oficina/loja', marca: 'pedido-7' });
    expect(mensagemDoAviso('pedido_situacao', { status: 'cancelado', motivo: 'Sem estoque' })!.corpo).toBe('A loja cancelou o pedido. Motivo: Sem estoque.');
  });

  it('alertas de preço', () => {
    const novo = mensagemDoAviso('alerta_novo', { alertaId: 'a1', titulo: 'Óleo 5W30', quantidade: 4, precoAlvo: 30, cidade: 'Boa Vista' });
    expect(novo!.titulo).toBe('Alerta de preço: Óleo 5W30');
    expect(espacos(novo!.corpo)).toBe('Uma oficina de Boa Vista quer comprar 4 por R$ 30,00 cada. Responda em até 48 horas.');
    const resposta = mensagemDoAviso('alerta_resposta', { alertaId: 'a1', titulo: 'Óleo 5W30', loja: 'Loja Dois', tipo: 'contraproposta', preco: 28, minimo: 2 });
    expect(espacos(resposta!.corpo)).toBe('Óleo 5W30: propôs R$ 28,00 (a partir de 2). Escolha a proposta na loja.');
    expect(resposta!.marca).toBe('alerta-a1');
  });

  it('link do cliente e suporte', () => {
    expect(mensagemDoAviso('link_resposta', { linkId: 'l1', tipoLink: 'checklist', cliente: 'Maria' })).toMatchObject({ titulo: 'Checklist assinado', corpo: 'Maria assinou o checklist de entrada.' });
    expect(mensagemDoAviso('link_resposta', { tipoLink: 'orcamento', acao: 'recusar', titulo: 'Freios' })!.corpo).toBe('O cliente recusou o orçamento (Freios).');
    expect(mensagemDoAviso('suporte_resposta', { area: 'loja', assunto: 'Pix', trecho: 'Pronto.' })).toMatchObject({ corpo: 'Pix: Pronto.', url: '/fornecedor#ajuda' });
    expect(mensagemDoAviso('suporte_resposta', { area: 'conta' })!.url).toBe('/conta?ver=1');
  });

  it('todo tipo tem texto mesmo sem dados; tipo desconhecido não', () => {
    for (const t of TIPOS_AVISO) {
      const m = mensagemDoAviso(t.id, {});
      expect(m?.titulo).toBeTruthy();
      expect(m?.url.startsWith('/')).toBe(true);
    }
    expect(mensagemDoAviso('qualquer', {})).toBeNull();
  });

  it('a carga do push é pequena; o e-mail escapa o HTML e leva às preferências', () => {
    const m = { titulo: '<script>x</script>'.repeat(20), corpo: 'a'.repeat(1000), url: '/oficina', marca: 'm' };
    const carga = cargaDoPush(m);
    expect(Buffer.byteLength(carga)).toBeLessThan(3000);
    expect(JSON.parse(carga)).toMatchObject({ url: '/oficina', marca: 'm' });
    const e = emailDoAviso({ ...m, titulo: 'Oi <b>"x"</b>' }, { empresa: 'Revisaí Ltda', site: 'https://revisai.teste' });
    expect(e.html).toContain('Oi &lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(e.html).not.toContain('<b>');
    expect(e.html).toContain('href="https://revisai.teste/oficina"');
    expect(e.html).toContain('https://revisai.teste/conta?ver=1#avisos');
    expect(e.texto).toContain('Revisaí Ltda');
  });

  it('a espera dobra a cada tentativa', () => {
    expect([1, 2, 3, 4].map(esperaDaTentativa)).toEqual([2, 4, 8, 16]);
  });
});

describe('lote e canais', () => {
  const pessoa = (extra: Record<string, unknown>) => ({ userId: 'u', email: 'a@b.dev', push: true, emailLigado: true, whatsapp: true, inscricoes: [], ...extra });

  it('lê o lote do banco e ignora o que não serve', () => {
    const lote = lerLote([{ id: '3', tipo: 'pedido_novo', dados: {}, tentativas: 2, para: { pessoas: [{ userId: 'u', email: 'x@y.dev' }], whatsapps: ['5521988887777'] } }, { tipo: 'sem id' }, null]);
    expect(lote).toHaveLength(1);
    expect(lote[0]).toMatchObject({ id: 3, tentativas: 2, para: { pessoas: [{ push: true, emailLigado: true, inscricoes: [] }], whatsapps: ['5521988887777'] } });
    expect(lerLote('nada')).toEqual([]);
  });

  it('e-mails e navegadores sem repetir, só de quem deixou ligado', () => {
    const i = { endpoint: 'https://push.teste/1', p256dh: 'p'.repeat(20), auth: 'a'.repeat(8) };
    const pessoas = lerLote([
      {
        id: 1,
        tipo: 'pedido_novo',
        para: {
          pessoas: [pessoa({ email: 'A@B.dev', inscricoes: [i] }), pessoa({ email: 'a@b.dev', inscricoes: [i] }), pessoa({ email: 'c@d.dev', emailLigado: false, push: false, inscricoes: [{ ...i, endpoint: 'https://push.teste/2' }] }), pessoa({ email: 'invalido' })]
        }
      }
    ])[0].para.pessoas;
    expect(emailsDoAviso(pessoas)).toEqual(['a@b.dev']);
    expect(pushesDoAviso(pessoas).map((x) => x.endpoint)).toEqual(['https://push.teste/1']);
  });

  it('concluído quando algum canal entregou ou quando não há o que repetir', () => {
    expect(avisoConcluido({ ok: 1, tentar: 3, erro: 0 })).toBe(true);
    expect(avisoConcluido({ ok: 0, tentar: 0, erro: 2 })).toBe(true);
    expect(avisoConcluido({ ok: 0, tentar: 0, erro: 0 })).toBe(true);
    expect(avisoConcluido({ ok: 0, tentar: 1, erro: 0 })).toBe(false);
  });

  it('modelo do WhatsApp: o do tipo, o geral, e nada quando a loja já recebe pelo modelo dela', () => {
    vi.stubEnv('WHATSAPP_MODELO_AVISO', 'aviso_geral');
    vi.stubEnv('WHATSAPP_MODELO_PEDIDO_SITUACAO', 'andamento_pedido');
    expect(modeloDoAviso('pedido_situacao')).toBe('andamento_pedido');
    expect(modeloDoAviso('pedido_novo')).toBe('aviso_geral');
    vi.stubEnv('WHATSAPP_MODELO_LOJA_PEDIDO', 'loja_pedido');
    expect(modeloDoAviso('pedido_novo')).toBeNull();
    expect(modeloDoAviso('alerta_novo')).toBe('aviso_geral');
  });
});

describe('erros dos navegadores', () => {
  it('tira e-mail, códigos, placas, números e consultas, e mantém linha e coluna', () => {
    const t = limparTexto(
      'Falhou para joao@exemplo.com em https://revisai.howlks.com/l/abc?token=XYZ&e=1 com eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJhLWZhbHNh placa ABC1D23 tel 21 98765-4321 id 3f2a1b9c-1d2e-4f5a-8b9c-0d1e2f3a4b5c chave ' +
        'k'.repeat(40) +
        ' at f (https://revisai.howlks.com/_next/static/chunks/app.js?v=3:12:34) e /oficina/ordens?id=9#x'
    );
    for (const proibido of ['joao@', 'XYZ', 'eyJ', 'ABC1D23', '98765', '3f2a1b9c', 'kkkk', '?v=3', '?id=9']) expect(t).not.toContain(proibido);
    expect(t).toContain('https://revisai.howlks.com/_next/static/chunks/app.js:12:34)');
    expect(t).toContain('/oficina/ordens');
  });

  it('a rota fica sem consulta e sem pedaços que são códigos', () => {
    expect(limparRota('/oficina/clientes/3f2a1b9c-1d2e-4f5a-8b9c-0d1e2f3a4b5c?x=1')).toBe('/oficina/clientes/:id');
    expect(limparRota('/l/AbCdEfGhIjKlMnOpQrStUvWx')).toBe('/l/:id');
    expect(limparRota('/fornecedor/pedidos/12345')).toBe('/fornecedor/pedidos/:id');
    expect(limparRota(null)).toBeNull();
  });

  it('lê o relato e recusa o que não serve', () => {
    expect(lerRelato(null)).toBeNull();
    expect(lerRelato({ mensagem: '   ' })).toBeNull();
    const r = lerRelato({ mensagem: 'Erro de a@b.dev', pilha: 'x\n'.repeat(100), rota: '/oficina?x=1', origem: 'outra', versao: 'v1.2 <x>' });
    expect(r).toMatchObject({ mensagem: 'Erro de [e-mail]', rota: '/oficina', origem: 'janela', versao: 'v1.2x' });
    expect(r!.pilha!.split('\n').length).toBeLessThanOrEqual(25);
  });

  it('o navegador sem a versão completa', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36';
    expect(agenteResumido(ua)).toBe('Chrome 130 · Android');
    expect(agenteResumido('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari 17 · iOS');
    expect(agenteResumido(null)).toBeNull();
  });
});

describe('processador da fila', () => {
  function navegador() {
    const chave = createECDH('prime256v1');
    chave.generateKeys();
    const auth = randomBytes(16).toString('base64url');
    return { chave, auth, p256dh: chave.getPublicKey().toString('base64url') };
  }

  interface Pedido {
    url: string;
    headers: Record<string, string>;
    corpo: Buffer;
  }

  function servicos(respostas: Record<string, number>) {
    const pedidos: Pedido[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { headers?: Record<string, string>; body?: Uint8Array | string }) => {
      pedidos.push({ url, headers: init.headers ?? {}, corpo: Buffer.from(init.body ?? '') });
      const status = Object.entries(respostas).find(([prefixo]) => url.startsWith(prefixo))?.[1] ?? 599;
      return new Response(status === 204 ? null : '{}', { status });
    });
    return pedidos;
  }

  it('manda por push, e-mail e WhatsApp, tira o navegador que sumiu e conclui', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_teste');
    vi.stubEnv('AVISOS_REMETENTE', 'Revisaí <avisos@exemplo.dev>');
    vi.stubEnv('AVISOS_RESEND_URL', 'https://resend.teste');
    vi.stubEnv('WHATSAPP_TOKEN', 'tk');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123');
    vi.stubEnv('AVISOS_WHATSAPP_URL', 'https://graph.teste');
    vi.stubEnv('WHATSAPP_MODELO_AVISO', 'aviso_geral');
    vi.stubEnv('WHATSAPP_MODELO_LOJA_PEDIDO', '');
    vi.stubEnv('SITE_URL', 'https://revisai.teste');
    const nav = navegador();
    const pedidos = servicos({ 'https://push.teste/ok': 201, 'https://push.teste/sumiu': 410, 'https://resend.teste/emails': 200, 'https://graph.teste/v23.0/123/messages': 200 });
    lotes = [
      [
        {
          id: 1,
          tipo: 'pedido_novo',
          dados: { parteId: 7, codigo: 'ABC123', itens: 1, subtotal: 80 },
          tentativas: 1,
          para: {
            pessoas: [
              {
                userId: 'u1',
                email: 'Dono@Loja.dev',
                push: true,
                emailLigado: true,
                whatsapp: true,
                inscricoes: [
                  { endpoint: 'https://push.teste/ok', p256dh: nav.p256dh, auth: nav.auth },
                  { endpoint: 'https://push.teste/sumiu', p256dh: nav.p256dh, auth: nav.auth }
                ]
              }
            ],
            whatsapps: ['5521988887777']
          }
        }
      ]
    ];
    const r = await processarAvisos();
    expect(r).toEqual({ lidos: 1, enviados: 1, paraDepois: 0, push: 1, emails: 1, whatsapps: 1 });
    expect(chamadas.find((c) => c.fn === 'avisos_concluir')!.args).toMatchObject({ p_id: 1, p_ok: true, p_push_invalidos: ['https://push.teste/sumiu'], p_push_ok: ['https://push.teste/ok'] });

    // o push vai cifrado e assinado; só o navegador abre
    const push = pedidos.find((p) => p.url === 'https://push.teste/ok')!;
    expect(push.headers['Content-Encoding']).toBe('aes128gcm');
    expect(push.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(push.headers.Authorization).toContain(`k=${vapid!.publica}`);
    const aberto = JSON.parse(ece.decrypt(push.corpo, { version: 'aes128gcm', privateKey: nav.chave, authSecret: nav.auth }).toString('utf8'));
    expect(aberto).toEqual({ titulo: 'Pedido novo ABC123', corpo: expect.stringContaining('Confirme o pedido'), url: '/fornecedor/pedidos', marca: 'pedido-7' });

    const email = JSON.parse(pedidos.find((p) => p.url === 'https://resend.teste/emails')!.corpo.toString());
    expect(email).toMatchObject({ from: 'Revisaí <avisos@exemplo.dev>', to: ['dono@loja.dev'], subject: 'Pedido novo ABC123' });
    expect(email.html).toContain('https://revisai.teste/fornecedor/pedidos');
    const zap = JSON.parse(pedidos.find((p) => p.url.startsWith('https://graph.teste'))!.corpo.toString());
    expect(zap).toMatchObject({ to: '5521988887777', type: 'template', template: { name: 'aviso_geral', language: { code: 'pt_BR' } } });
    expect(zap.template.components[0].parameters[0].text).toBe('Pedido novo ABC123');
  });

  it('falha passageira sem outro canal volta para a fila; tipo desconhecido sai', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('WHATSAPP_TOKEN', '');
    const nav = navegador();
    servicos({ 'https://push.teste/cheio': 503 });
    lotes = [
      [
        { id: 2, tipo: 'alerta_resposta', dados: {}, para: { pessoas: [{ userId: 'u', email: 'x@y.dev', inscricoes: [{ endpoint: 'https://push.teste/cheio', p256dh: nav.p256dh, auth: nav.auth }] }], whatsapps: [] } },
        { id: 3, tipo: 'tipo_velho', dados: {}, para: { pessoas: [], whatsapps: [] } }
      ]
    ];
    const r = await processarAvisos();
    expect(r).toMatchObject({ lidos: 2, enviados: 0, paraDepois: 1 });
    const concluidos = chamadas.filter((c) => c.fn === 'avisos_concluir').map((c) => c.args);
    expect(concluidos).toEqual([
      expect.objectContaining({ p_id: 2, p_ok: false, p_erro: 'falha passageira', p_push_invalidos: [], p_push_ok: [] }),
      { p_id: 3, p_ok: true, p_erro: 'tipo desconhecido' }
    ]);
  });
});
