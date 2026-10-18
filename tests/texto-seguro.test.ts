import { describe, expect, it } from 'vitest';
import { textoSeguro } from '../lib/avisos/texto-seguro';

describe('texto nas mensagens oficiais', () => {
  it('tira links, e-mails e telefones', () => {
    expect(textoSeguro('SEU PIX FOI BLOQUEADO acesse golpe.example/desbloquear agora', 200)).toBe('SEU PIX FOI BLOQUEADO acesse [link] agora');
    expect(textoSeguro('Veja https://bit.ly/abc ou www.site.com.br', 200)).toBe('Veja [link] ou [link]');
    expect(textoSeguro('fale em banco-seguro.com', 200)).toBe('fale em [link]');
    expect(textoSeguro('mande para golpista@mail.com', 200)).toBe('mande para [e-mail]');
    expect(textoSeguro('ligue (21) 99999-0000 ou +55 21 98888 7777', 200)).toBe('ligue [número] ou [número]');
  });

  it('deixa o texto comum como está', () => {
    expect(textoSeguro('Pedido NVF9VX de R$ 1.234,56 para a Oficina do João', 200)).toBe('Pedido NVF9VX de R$ 1.234,56 para a Oficina do João');
    expect(textoSeguro('Troca de óleo 5W30 em 17/10/2026 às 08:00, placa RBA5G44', 200)).toBe('Troca de óleo 5W30 em 17/10/2026 às 08:00, placa RBA5G44');
    expect(textoSeguro('  linhas\n\nquebradas  ', 200)).toBe('linhas quebradas');
    expect(textoSeguro('', 10)).toBe('-');
    expect(textoSeguro('abcdefghij', 5)).toBe('abcde');
  });
});
