import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { emailDaAprovacao, emailLigado, enviarEmail, escaparHtml } = await import('@/lib/email-envio');

afterEach(() => {
  vi.unstubAllEnvs();
});

const copia = {
  oficina: 'Auto <Center>',
  cliente: 'Ana',
  numero: 12,
  carro: 'VW Gol',
  placa: 'RBA5G44',
  itens: [
    { descricao: 'Óleo 5W30', quantidade: 4, unidade: 'L', valor: 183.6 },
    { descricao: 'Mão de obra "rápida"', quantidade: 1, unidade: 'un', valor: 60 }
  ],
  recusados: ['Palhetas'],
  total: 223.6,
  validade: '25/10/2026',
  canal: 'Pelo link do orçamento',
  quando: '16/10/2026 às 14:05',
  nome: 'Ana Souza',
  ip: '200.1.2.3',
  aparelho: 'Chrome no Android',
  conferencia: 'BA78 16BF 8F01 CFEA',
  versao: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  link: 'https://revisai.howlks.com/l/abc'
};

describe('a cópia da aprovação por e-mail', () => {
  it('sem a chave do Resend e o remetente, não manda nada e não reclama', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('AVISOS_REMETENTE', '');
    const buscar = vi.fn();
    expect(emailLigado()).toBe(false);
    expect(await enviarEmail({ para: 'ana@x.com', assunto: 'a', texto: 't', html: 'h' }, buscar as unknown as typeof fetch)).toEqual({ ok: false, motivo: 'desligado' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('manda pela API do Resend, com a chave no cabeçalho e a chave de repetição', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_teste');
    vi.stubEnv('AVISOS_REMETENTE', 'Revisaí <avisos@revisai.howlks.com>');
    const buscar = vi.fn(async () => new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));
    const r = await enviarEmail({ para: 'ana@x.com', assunto: 'Assunto', texto: 'Texto', html: '<p>Oi</p>', chave: 'aprovacao-1' }, buscar as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, id: 'email-1' });
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer re_teste', 'content-type': 'application/json', 'idempotency-key': 'aprovacao-1' });
    expect(JSON.parse(String(init.body))).toEqual({ from: 'Revisaí <avisos@revisai.howlks.com>', to: ['ana@x.com'], subject: 'Assunto', html: '<p>Oi</p>', text: 'Texto' });
  });

  it('erro da API ou da rede volta como erro', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_teste');
    vi.stubEnv('AVISOS_REMETENTE', 'avisos@revisai.howlks.com');
    const recusado = vi.fn(async () => new Response(JSON.stringify({ message: 'Domain not verified' }), { status: 403 }));
    expect(await enviarEmail({ para: 'a@x.com', assunto: 'a', texto: 't', html: 'h' }, recusado as unknown as typeof fetch)).toEqual({ ok: false, motivo: 'erro', erro: 'Domain not verified' });
    const caiu = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    expect(await enviarEmail({ para: 'a@x.com', assunto: 'a', texto: 't', html: 'h' }, caiu as unknown as typeof fetch)).toEqual({ ok: false, motivo: 'erro', erro: 'fetch failed' });
  });

  it('o comprovante leva itens, total, quando, por onde, IP, aparelho e o resumo, com o HTML escapado', () => {
    const e = emailDaAprovacao(copia);
    expect(e.assunto).toBe('Comprovante da aprovação do orçamento nº 12 · Auto <Center>');
    expect(e.texto).toContain('- Óleo 5W30 (4 L): R$');
    expect(e.texto).toContain('Ficou para depois: Palhetas.');
    expect(e.texto).toContain('Aprovado em 16/10/2026 às 14:05, pelo link do orçamento.');
    expect(e.texto).toContain('Nome: Ana Souza. IP: 200.1.2.3. Aparelho: Chrome no Android.');
    expect(e.texto).toContain('Código de conferência: BA78 16BF 8F01 CFEA');
    expect(e.texto).toContain(copia.versao);
    expect(e.html).toContain('Auto &lt;Center&gt;');
    expect(e.html).toContain('Mão de obra &quot;rápida&quot;');
    expect(e.html).not.toContain('<Center>');
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    // marcada no aparelho da oficina (WhatsApp ou na oficina), o aparelho não é o do cliente
    expect(emailDaAprovacao({ ...copia, ip: null, marcadoNaOficina: true }).texto).toContain('Nome: Ana Souza. Marcado no aparelho da oficina: Chrome no Android.');
  });
});
