import { describe, expect, it } from 'vitest';
import type { ItemAviso } from '@/lib/avisos';
import { codificarCartao, decodificarCartao, type DadosCartao } from '@/lib/cartao';
import { formatarKm, formatarMoeda, formatarPlaca, formatarTelefone, lerNumero, normalizarTelefone, placaValida } from '@/lib/formatos';
import { gerarIcs } from '@/lib/ics';
import { linkWhatsApp, listaDeServicos, montarMensagem } from '@/lib/whatsapp';

describe('formatos', () => {
  it('placas antigas e Mercosul', () => {
    expect(placaValida('abc-1234')).toBe(true);
    expect(placaValida('RIO2A26')).toBe(true);
    expect(placaValida('AB12345')).toBe(false);
    expect(formatarPlaca('abc1234')).toBe('ABC-1234');
    expect(formatarPlaca('rio2a26')).toBe('RIO2A26');
  });

  it('telefones', () => {
    expect(normalizarTelefone('(21) 98765-4321')).toBe('5521987654321');
    expect(normalizarTelefone('+55 21 98765-4321')).toBe('5521987654321');
    expect(normalizarTelefone('1234')).toBeNull();
    expect(formatarTelefone('21987654321')).toBe('(21) 98765-4321');
  });

  it('números do jeito brasileiro', () => {
    expect(lerNumero('40.000')).toBe(40000);
    expect(lerNumero('3,75')).toBe(3.75);
    expect(lerNumero('41500 km')).toBe(41500);
    expect(lerNumero('')).toBeNull();
    expect(formatarKm(41500)).toBe('41.500 km');
    expect(formatarMoeda(39.9).replace(/\s/g, ' ')).toBe('R$ 39,90');
  });
});

const item = (servico: ItemAviso['servico'], dataPrevista: string, diasRestantes: number, motivo: 'tempo' | 'km' = 'tempo'): ItemAviso =>
  ({ servico, venc: { dataPrevista, diasRestantes, motivo } }) as unknown as ItemAviso;

describe('mensagem do WhatsApp', () => {
  it('lista sem repetir e concorda o verbo', () => {
    expect(listaDeServicos(['pastilhas', 'discos']).texto).toBe('a revisão dos freios');
    expect(listaDeServicos(['troca_oleo', 'filtro_oleo', 'filtro_ar']).texto).toBe('a troca de óleo, a troca do filtro de óleo e a troca do filtro de ar');
  });

  it('monta o texto com o modelo da oficina', () => {
    const texto = montarMensagem('', {
      cliente: 'Fernanda Lima',
      oficina: 'Auto Center Serra',
      veiculo: { modelo: 'Onix', placa: 'RIO2A26' },
      itens: [item('troca_oleo', '2026-10-22', 9), item('filtro_oleo', '2026-10-22', 9)]
    });
    expect(texto).toBe(
      'Oi, Fernanda! Aqui é da Auto Center Serra. Passando para lembrar que a troca de óleo e a troca do filtro de óleo do seu Onix vencem no dia 22/10. Quer marcar um horário? É só responder esta mensagem.'
    );
  });

  it('fala do atraso e da quilometragem', () => {
    const base = { cliente: 'João', oficina: 'Oficina', veiculo: { modelo: 'Gol', placa: 'ABC1234' } };
    expect(montarMensagem('{lista}', { ...base, itens: [item('troca_oleo', '2026-10-05', -8)] })).toBe('a troca de óleo do seu Gol venceu no dia 05/10');
    expect(montarMensagem('{lista}', { ...base, itens: [item('troca_oleo', '2026-10-25', 12, 'km')] })).toBe(
      'a troca de óleo do seu Gol deve vencer por volta do dia 25/10, pela quilometragem'
    );
    expect(montarMensagem('{placa}', { ...base, itens: [] })).toBe('ABC-1234');
  });

  it('link wa.me com o texto codificado', () => {
    expect(linkWhatsApp('(21) 98765-4321', 'Oi, tudo bem?')).toBe('https://wa.me/5521987654321?text=Oi%2C%20tudo%20bem%3F');
    expect(linkWhatsApp('123', 'x')).toBeNull();
  });
});

describe('cartão e calendário', () => {
  const cartao: DadosCartao = {
    v: 1,
    o: { n: 'Auto Center Serra', w: '21987654321', c: 'Guapimirim - RJ' },
    c: 'Fernanda',
    car: { m: 'Chevrolet Onix', p: 'RIO2A26', a: 2021 },
    i: [{ s: 'troca_oleo', d: '2027-04-13', k: 50000, f: '2026-10-13', fk: 40000 }],
    g: '2026-10-13'
  };

  it('o link do cartão vai e volta', () => {
    const codigo = codificarCartao(cartao);
    expect(codigo).not.toMatch(/[^A-Za-z0-9+\-$_]/);
    expect(decodificarCartao(codigo)).toEqual(cartao);
    expect(decodificarCartao('lixo')).toBeNull();
  });

  it('o cartão montado sempre abre, mesmo com dados fora do padrão', async () => {
    const { montarCartao, linkDoCartao } = await import('@/lib/cartao');
    const item = {
      servico: 'troca_oleo',
      base: { data: '2026-10-13', km: 40000.6 },
      venc: { dataPrevista: '2027-04-13', dataLimite: '2027-10-13', kmLimite: 50000.4 }
    } as never;
    const d = montarCartao(
      { nome: 'Auto Center Serra', whatsapp: '(21) 99999-0000 / 3333-4444', cidade: 'Guapimirim', uf: 'RJ', endereco: '' },
      { id: 'c', nome: 'Fernanda Lima', telefone: '', criadoEm: '' },
      { id: 'v', clienteId: 'c', placa: 'FLM2C24', marca: 'Chevrolet', modelo: 'Onix', ano: 2022, criadoEm: '' },
      [item],
      '2026-10-13'
    );
    const link = linkDoCartao('https://revisai.howlks.com', d);
    const lido = decodificarCartao(link.split('#')[1]);
    expect(lido).not.toBeNull();
    expect(lido?.i[0].k).toBe(50000);
    expect(lido?.o.w).toBeUndefined();
  });

  it('gera um .ics válido', () => {
    const ics = gerarIcs([{ uid: 'a@revisai', titulo: 'Troca de óleo do Onix, com uma descrição bem comprida para dobrar a linha', data: '2027-04-13' }], new Date('2026-10-13T12:00:00Z'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20270413');
    expect(ics).toContain('DTEND;VALUE=DATE:20270414');
    expect(ics).toContain('TRIGGER:-P7D');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
