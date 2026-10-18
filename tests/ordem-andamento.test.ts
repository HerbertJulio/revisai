import { describe, expect, it } from 'vitest';
import { dadosDoAndamento, enderecoDaFoto, etapaAtual, lerAndamentoDoLink, mensagemDoAndamento, passosDoAndamento, podeMudarPara, proximaEtapa, registrarEtapa } from '@/lib/andamento';
import type { Documento } from '@/lib/tipos';

const OFICINA = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function ordem(extra: Partial<Documento> = {}): Documento {
  return {
    id: 'os1',
    numero: 7,
    tipo: 'ordem',
    situacao: 'aberta',
    veiculoId: 'v1',
    km: 90000,
    data: '2026-10-16',
    desconto: null,
    linhas: [
      { id: 'a', tipo: 'peca', servico: 'pastilhas', descricao: 'Pastilha dianteira', quantidade: 1, unidade: 'un', valorUnitario: 140 },
      { id: 'b', tipo: 'servico', servico: 'pastilhas', descricao: 'Troca das pastilhas', quantidade: 1, unidade: 'un', valorUnitario: 80 },
      { id: 'c', tipo: 'outro', descricao: 'Lavagem', quantidade: 1, unidade: 'un', valorUnitario: 30 }
    ],
    criadoEm: '2026-10-16T12:00:00.000Z',
    atualizadoEm: '2026-10-16T12:00:00.000Z',
    ...extra
  };
}

describe('etapas do serviço', () => {
  it('sem marca: ordem nova acabou de chegar; vinda do orçamento, em serviço; concluída, pronta', () => {
    expect(etapaAtual(ordem())).toBe('recebido');
    expect(etapaAtual(ordem({ orcamentoId: 'o1' }))).toBe('em_servico');
    expect(etapaAtual(ordem({ situacao: 'concluida' }))).toBe('pronto');
    expect(etapaAtual(ordem({ situacao: 'concluida', etapa: 'em_servico' }))).toBe('pronto');
    expect(etapaAtual(ordem({ situacao: 'concluida', etapa: 'entregue' }))).toBe('entregue');
    expect(etapaAtual(ordem({ situacao: 'cancelada', etapa: 'em_servico' }))).toBeNull();
    expect(etapaAtual({ tipo: 'orcamento', situacao: 'enviado' })).toBe('aguardando_aprovacao');
  });

  it('as regras: só a ordem anda, entregue só depois de concluir, concluída não volta', () => {
    expect(podeMudarPara(ordem(), 'aguardando_pecas')).toEqual({ ok: true });
    expect(podeMudarPara(ordem({ etapa: 'em_servico' }), 'aguardando_pecas')).toEqual({ ok: true });
    expect(podeMudarPara(ordem(), 'entregue')).toMatchObject({ ok: false, motivo: 'Conclua a ordem antes de marcar como entregue.' });
    expect(podeMudarPara(ordem({ situacao: 'concluida' }), 'entregue')).toEqual({ ok: true });
    expect(podeMudarPara(ordem({ situacao: 'concluida' }), 'em_servico').ok).toBe(false);
    expect(podeMudarPara(ordem({ situacao: 'cancelada' }), 'pronto').ok).toBe(false);
    expect(podeMudarPara(ordem({ tipo: 'orcamento', situacao: 'enviado' }), 'em_servico').ok).toBe(false);
    expect(podeMudarPara(ordem(), 'voando' as never).ok).toBe(false);
  });

  it('a próxima etapa pula a aprovação na ordem e para antes de entregar sem concluir', () => {
    expect(proximaEtapa(ordem())).toBe('diagnostico');
    expect(proximaEtapa(ordem({ etapa: 'diagnostico' }))).toBe('aguardando_pecas');
    expect(proximaEtapa(ordem({ etapa: 'pronto' }))).toBeNull();
    expect(proximaEtapa(ordem({ situacao: 'concluida' }))).toBe('entregue');
    expect(proximaEtapa(ordem({ situacao: 'concluida', etapa: 'entregue' }))).toBeNull();
  });

  it('registrar: guarda a linha do tempo com nota e fotos; a mesma etapa sem nada novo não muda', () => {
    const d = ordem();
    const r1 = registrarEtapa(d, 'diagnostico', '2026-10-16T13:00:00Z', { nota: '  Pastilha no fim  ' })!;
    expect(r1).toEqual({ etapa: 'diagnostico', andamento: [{ etapa: 'diagnostico', quando: '2026-10-16T13:00:00Z', nota: 'Pastilha no fim' }] });
    const d2 = { ...d, ...r1 };
    expect(registrarEtapa(d2, 'diagnostico', '2026-10-16T13:05:00Z')).toBeNull();
    const r2 = registrarEtapa(d2, 'diagnostico', '2026-10-16T13:05:00Z', { fotoIds: ['f1'] })!;
    expect(r2.andamento).toHaveLength(2);
    expect(registrarEtapa(d2, 'entregue', '2026-10-16T14:00:00Z')).toBeNull();
  });

  it('os passos do desenho: feitas, a atual e as que faltam (sem a aprovação numa ordem direta)', () => {
    const passos = passosDoAndamento(ordem({ etapa: 'aguardando_pecas', andamento: [{ etapa: 'aguardando_pecas', quando: '2026-10-16T15:00:00Z' }] }));
    expect(passos.map((p) => `${p.etapa}:${p.estado}`)).toEqual(['recebido:feita', 'diagnostico:feita', 'aguardando_pecas:atual', 'em_servico:falta', 'pronto:falta', 'entregue:falta']);
    expect(passos[2].quando).toBe('2026-10-16T15:00:00Z');
    expect(passosDoAndamento(ordem({ orcamentoId: 'o1' })).some((p) => p.etapa === 'aguardando_aprovacao')).toBe(true);
  });
});

describe('o link do andamento', () => {
  it('leva as etapas, só as fotos guardadas no Storage e o total só quando fica pronto', () => {
    const d = ordem({
      etapa: 'em_servico',
      fotos: [
        { id: 'f1', caminho: `${OFICINA}/andamento/0123456789abcdef.webp` },
        { id: 'f2', dataUrl: 'data:image/jpeg;base64,AAAA' }
      ],
      andamento: [{ etapa: 'em_servico', quando: '2026-10-16T15:00:00Z', nota: 'Trocando', fotoIds: ['f1', 'f2'] }]
    });
    const dados = dadosDoAndamento(d, { id: 'c1', nome: 'Ana Souza', telefone: '', criadoEm: '' }, { id: 'v1', clienteId: 'c1', placa: 'RBA5G44', marca: 'VW', modelo: 'Gol', criadoEm: '' });
    expect(dados.linha).toEqual([{ etapa: 'em_servico', quando: '2026-10-16T15:00:00Z', nota: 'Trocando', fotos: [`${OFICINA}/andamento/0123456789abcdef.webp`] }]);
    expect(dados.total).toBeNull();
    expect(dados.servicos).toEqual(['Pastilhas de freio', 'Lavagem']);
    expect(dados.cliente).toBe('Ana');
    expect(lerAndamentoDoLink(JSON.parse(JSON.stringify(dados)))).toEqual(dados);
    const pronto = dadosDoAndamento({ ...d, situacao: 'concluida' }, undefined, undefined);
    expect(pronto.total).toBe(250);
    expect(pronto.etapa).toBe('pronto');
    // um caminho de fora da pasta da oficina não passa na leitura
    expect(lerAndamentoDoLink({ ...dados, linha: [{ etapa: 'pronto', quando: 'x', fotos: ['../../segredo.jpg'] }] })).toBeNull();
    expect(enderecoDaFoto(`${OFICINA}/andamento/0123456789abcdef.webp`)).toBe(`/l/foto/${OFICINA}/andamento/0123456789abcdef.webp`);
  });

  it('a primeira mensagem com o link', () => {
    expect(mensagemDoAndamento({ oficina: 'Auto Center Serra', cliente: 'Ana Souza', carro: 'Gol', placa: 'ABC1234', link: 'https://x/l/t' })).toBe(
      'Oi, Ana! Aqui é da Auto Center Serra. Por este link você acompanha o serviço do seu Gol, placa ABC-1234, com as fotos, até ficar pronto: https://x/l/t'
    );
  });
});
