import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { limparOrdem, esquemaOrdem } = await import('@/lib/agente/esquema');
const { textoDoPedido, INSTRUCOES_AGENTE } = await import('@/lib/agente/prompt');
const { textoDoResumo } = await import('@/lib/agente/resumo');
const { assinaturaValida, comando, lerMensagens } = await import('@/lib/agente/whatsapp-cloud');

const ordem = esquemaOrdem.parse({
  placa: 'abc-1d23',
  km: 45210,
  veiculo: { marca: 'Chevrolet', modelo: 'Onix', motor: '1.0 turbo', ano: 2021 },
  cliente: 'Marcos',
  servicos: [
    { servico: 'troca_oleo', produto: 'Lubrax 5W-30 dexos1', observacao: null },
    { servico: 'filtro_oleo', produto: null, observacao: null },
    { servico: 'troca_oleo', produto: null, observacao: 'repetido' }
  ],
  diagnostico: 'Pastilhas dianteiras com 2 mm.',
  recomendacoes: [{ texto: 'Trocar pastilhas dianteiras', urgencia: 'agora' }],
  fotos: [{ indice: 1, legenda: 'Pastilha dianteira' }],
  mensagemCliente: '  Olá, Marcos! Trocamos o óleo.  ',
  transcricao: 'troquei o óleo e o filtrinho',
  duvidas: []
});

describe('ordem montada pela IA', () => {
  it('arruma placa, tira serviço repetido e apara a mensagem', () => {
    const o = limparOrdem(ordem);
    expect(o.placa).toBe('ABC1D23');
    expect(o.servicos.map((s) => s.servico)).toEqual(['troca_oleo', 'filtro_oleo']);
    expect(o.mensagemCliente).toBe('Olá, Marcos! Trocamos o óleo.');
  });

  it('descarta placa e km impossíveis', () => {
    const o = limparOrdem({ ...ordem, placa: 'XYZ', km: -3 });
    expect(o.placa).toBeNull();
    expect(o.km).toBeNull();
  });

  it('o pedido para a IA leva o contexto e o resumo volta legível', () => {
    const t = textoDoPedido({ oficina: 'Auto Center Serra', hoje: '2026-10-14', carro: 'ABC1D23, Onix', quantidadeAudios: 2, quantidadeFotos: 1, kmAnterior: 40000 });
    expect(t).toContain('Auto Center Serra');
    expect(t).toContain('Vieram 2 áudios e 1 foto');
    expect(t).toContain('40000 km');
    expect(INSTRUCOES_AGENTE).toContain('troca_oleo');
    const r = textoDoResumo(limparOrdem(ordem));
    expect(r).toContain('ABC1D23');
    expect(r).toContain('Troca de óleo (Lubrax 5W-30 dexos1)');
    expect(r).toContain('fazer agora');
  });
});

describe('WhatsApp', () => {
  it('confere a assinatura da Meta', () => {
    const corpo = '{"object":"whatsapp_business_account"}';
    const assinatura = 'sha256=' + createHmac('sha256', 'segredo').update(corpo).digest('hex');
    expect(assinaturaValida(corpo, assinatura, 'segredo')).toBe(true);
    expect(assinaturaValida(corpo, assinatura, 'outro')).toBe(false);
    expect(assinaturaValida(corpo + ' ', assinatura, 'segredo')).toBe(false);
    expect(assinaturaValida(corpo, null, 'segredo')).toBe(false);
  });

  it('lê texto, áudio e foto do aviso do webhook', () => {
    const aviso = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  { from: '5521987654321', id: 'a', type: 'text', text: { body: 'fechar' } },
                  { from: '5521987654321', id: 'b', type: 'audio', audio: { id: 'm1', mime_type: 'audio/ogg; codecs=opus' } },
                  { from: '5521987654321', id: 'c', type: 'image', image: { id: 'm2', mime_type: 'image/jpeg', caption: 'pastilha' } },
                  { from: '5521987654321', id: 'd', type: 'sticker' },
                  { from: 'x', id: 'e', type: 'text', text: { body: 'oi' } }
                ]
              }
            }
          ]
        }
      ]
    };
    const l = lerMensagens(aviso);
    expect(l.map((m) => m.tipo)).toEqual(['texto', 'audio', 'imagem', 'outro']);
    expect(l[1]).toMatchObject({ midiaId: 'm1' });
    expect(l[2]).toMatchObject({ legenda: 'pastilha' });
    expect(lerMensagens({ object: 'page', entry: [] })).toEqual([]);
  });

  it('entende os comandos do mecânico sem confundir com relato', () => {
    expect(comando('conectar 123456')).toEqual({ conectar: '123456' });
    expect(comando('123456')).toEqual({ conectar: '123456' });
    expect(comando('Fechar')).toBe('fechar');
    expect(comando('pronto!')).toBe('fechar');
    expect(comando('pronto, troquei o óleo e o filtro')).toBeNull();
    expect(comando('texto para o cliente')).toBe('texto');
    expect(comando('arruma um texto pro cliente')).toBe('texto');
    expect(comando('Bom dia')).toBe('ajuda');
    expect(comando('bom dia, o Onix do Marcos está com a pastilha no talo')).toBeNull();
    expect(comando('cancelar')).toBe('cancelar');
  });
});

describe('erros da IA', () => {
  it('traduz o erro técnico para a oficina', async () => {
    const { motivoDoErro } = await import('@/lib/agente/ia');
    const auth = Object.assign(new Error('AI Gateway authentication failed: No authentication provided.\nOption 1'), { name: 'GatewayAuthenticationError', statusCode: 401 });
    expect(motivoDoErro(auth).mensagem).toMatch(/liberada/);
    expect(motivoDoErro(auth).tecnico).toBe('GatewayAuthenticationError 401: AI Gateway authentication failed: No authentication provided.');
    expect(motivoDoErro({ lastError: Object.assign(new Error('Too many'), { name: 'GatewayRateLimitError', statusCode: 429 }) }).mensagem).toMatch(/um minuto/);
    expect(motivoDoErro(Object.assign(new Error('Insufficient funds'), { statusCode: 402 })).mensagem).toMatch(/limite de uso/);
    expect(motivoDoErro(new Error('boom')).mensagem).toMatch(/não conseguiu/);
  });
});
