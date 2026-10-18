import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { servicoDePushValido } = await import('../lib/avisos/push');

describe('serviços de push aceitos', () => {
  it('aceita os dos navegadores', () => {
    for (const u of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGx',
      'https://wns2-by3p.notify.windows.com/w/?token=abc'
    ]) {
      expect(servicoDePushValido(u, false)).toBe(true);
    }
  });

  it('recusa qualquer outro endereço, porta ou credencial', () => {
    for (const u of [
      'https://exemplo.com/push',
      'https://169.254.169.254/latest/meta-data',
      'https://fcm.googleapis.com.exemplo.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://usuario:senha@fcm.googleapis.com/x',
      'http://fcm.googleapis.com/x',
      'http://127.0.0.1:9999/push',
      'não é endereço'
    ]) {
      expect(servicoDePushValido(u, false)).toBe(false);
    }
  });

  it('em desenvolvimento aceita um serviço local para os testes', () => {
    expect(servicoDePushValido('http://127.0.0.1:9999/push', true)).toBe(true);
    expect(servicoDePushValido('http://10.0.0.5/push', true)).toBe(false);
  });
});
