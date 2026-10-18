import { afterAll, describe, expect, it } from 'vitest';
import { criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco } from './ajuda';

afterAll(fechar);

describe.skipIf(!temBanco)('convites', () => {
  it('aceitar um convite não muda o papel de quem já é da oficina', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const ger = await criarPessoa(b, pessoa('ger'));
      const o = await criarOficina(b, dono);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'gerente')`, [o, ger.email]);
      expect((await linhas(b, ger, 'select public.aceitar_convite() as n'))[0].n).toBe(1);
      // o gerente convida o e-mail do dono como mecânico: o dono continua dono ao aceitar
      await linhas(b, ger, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, dono.email]);
      expect((await linhas(b, dono, 'select public.aceitar_convite() as n'))[0].n).toBe(1);
      const papel = await linhas(b, dono, 'select papel from public.oficina_membros where oficina_id = $1 and user_id = auth.uid()', [o]);
      expect(papel).toEqual([{ papel: 'dono' }]);
    }));
});
