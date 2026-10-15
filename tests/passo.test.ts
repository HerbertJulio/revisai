import { describe, expect, it } from 'vitest';
import {
  alternarServico,
  definirMaoDeObra,
  definirPeca,
  documentoDoRascunho,
  incluirAvulsa,
  interpretar,
  linhaDaPeca,
  linhasAvulsas,
  passosDo,
  rascunhoDoDocumento,
  rascunhoVazio,
  totaisDoRascunho,
  type ContextoFala,
  type Rascunho
} from '@/lib/passo';

const agora = '2026-10-15T12:00:00.000Z';
const ctx: ContextoFala = {
  carros: [
    { id: 'v1', placa: 'FLM2C24', modelo: 'Onix Plus', dono: 'Fernanda Lima' },
    { id: 'v2', placa: 'PTG3F12', modelo: 'Onix', dono: 'Patrícia Gomes' },
    { id: 'v3', placa: 'RBA5G44', modelo: 'Gol', dono: 'Roberto Alves' }
  ],
  clientes: [{ id: 'c1', nome: 'Roberto Alves', telefone: '21990001007' }],
  anoMaximo: 2027
};

function resposta(passo: Parameters<typeof interpretar>[0], texto: string, r: Rascunho = rascunhoVazio(agora), c: ContextoFala = ctx) {
  const i = interpretar(passo, texto, r, c);
  if (i.tipo !== 'resposta') throw new Error(`esperava resposta, veio ${i.tipo}`);
  return i;
}

describe('as perguntas do passo a passo', () => {
  it('a ordem das perguntas muda com o tipo e com o carro novo', () => {
    const r = rascunhoVazio(agora);
    expect(passosDo(r)).toEqual(['tipo', 'carro', 'km', 'servicos', 'valores', 'conferir']);
    const orc = { ...r, tipo: 'orcamento' as const, carroNovo: { marca: '', modelo: 'Gol', ano: '' }, servicos: ['troca_oleo', 'alinhamento'] as Rascunho['servicos'] };
    expect(passosDo(orc)).toEqual(['tipo', 'modalidade', 'carro', 'placa', 'km', 'dono', 'servicos', 'peca:troca_oleo', 'valores', 'conferir']);
    expect(passosDo(orc, { tipo: true, carro: true })).toEqual(['modalidade', 'placa', 'km', 'dono', 'servicos', 'peca:troca_oleo', 'valores', 'conferir']);
  });

  it('serviços, peças, mão de obra e itens avulsos viram linhas', () => {
    let r = alternarServico(rascunhoVazio(agora), 'troca_oleo');
    expect(r.servicos).toEqual(['troca_oleo', 'filtro_oleo']);
    r = definirMaoDeObra(r, 'troca_oleo', 60);
    r = definirPeca(r, 'troca_oleo', { descricao: 'Óleo 5W-30', quantidade: 4, unidade: 'L', valorUnitario: 55, produto: { nome: 'Óleo 5W-30' } });
    // a peça vem antes da mão de obra
    expect(r.linhas.map((l) => l.tipo)).toEqual(['peca', 'servico']);
    r = definirPeca(r, 'troca_oleo', { descricao: 'Óleo 0W-20', quantidade: 3.5, unidade: 'L', valorUnitario: 60, produto: null });
    expect(r.linhas).toHaveLength(2);
    expect(linhaDaPeca(r, 'troca_oleo')?.descricao).toBe('Óleo 0W-20');
    r = incluirAvulsa(r, 'Troca da bomba d’água', 250);
    expect(linhasAvulsas(r)).toHaveLength(1);
    expect(totaisDoRascunho({ ...r, desconto: '10' }).total).toBe(510);
    r = definirMaoDeObra(r, 'troca_oleo', null);
    expect(r.linhas.filter((l) => l.tipo === 'servico' && l.servico)).toHaveLength(0);
    r = alternarServico(r, 'troca_oleo');
    expect(r.servicos).toEqual(['filtro_oleo']);
    expect(linhaDaPeca(r, 'troca_oleo')).toBeUndefined();
  });

  it('o documento sai do rascunho e volta para editar', () => {
    let r: Rascunho = { ...rascunhoVazio(agora), tipo: 'orcamento', modalidade: 'pago', vistoria: '80', abater: false, desconto: '15,50', diagnostico: ' Pastilha no fim ' };
    r = alternarServico(r, 'pastilhas');
    r = definirPeca(r, 'pastilhas', { descricao: 'Pastilhas', quantidade: 1, unidade: 'un', valorUnitario: 190, produto: null });
    r = definirPeca(r, 'discos', { descricao: 'Discos', quantidade: 1, unidade: 'un', valorUnitario: 400, produto: null });
    r = alternarServico(r, 'discos');
    const d = documentoDoRascunho(r, 'v3', 134800, '2026-10-15');
    expect(d).toMatchObject({ tipo: 'orcamento', veiculoId: 'v3', km: 134800, modalidade: 'pago', vistoria: { valor: 80, abater: false }, desconto: 15.5, diagnostico: 'Pastilha no fim', validadeDias: 10 });
    expect(d.linhas.map((l) => l.descricao)).toEqual(['Pastilhas']);
    const volta = rascunhoDoDocumento({ ...d, id: 'd1', numero: 4, situacao: 'rascunho', criadoEm: agora, atualizadoEm: agora }, agora);
    expect(volta).toMatchObject({ editandoId: 'd1', passo: 'conferir', vistoria: '80', abater: false, desconto: '15,5', servicos: ['pastilhas'] });
  });
});

describe('respostas faladas', () => {
  it('tipo e modalidade, com a pergunta da vistoria quando falta o valor', () => {
    expect(resposta('tipo', 'é orçamento').rascunho.tipo).toBe('orcamento');
    const r = { ...rascunhoVazio(agora), tipo: 'orcamento' as const };
    expect(resposta('modalidade', 'frio', r)).toMatchObject({ seguir: true, rascunho: { modalidade: 'frio' } });
    const pago = resposta('modalidade', 'pago', r);
    expect(pago).toMatchObject({ seguir: false, perguntar: 'vistoria', rascunho: { modalidade: 'pago' } });
    expect(resposta('modalidade', 'oitenta reais', pago.rascunho, { ...ctx, subpergunta: 'vistoria' }).rascunho.vistoria).toBe('80');
    expect(resposta('modalidade', 'pago, cento e vinte', r).rascunho.vistoria).toBe('120');
  });

  it('o carro pela placa, pelo modelo único ou como carro novo', () => {
    expect(resposta('carro', 'placa RBA 5G44').rascunho.veiculoId).toBe('v3');
    expect(resposta('carro', 'o gol do roberto').rascunho.veiculoId).toBe('v3');
    // dois Onix: não escolhe sozinho
    expect(interpretar('carro', 'onix', rascunhoVazio(agora), ctx).tipo).toBe('nada');
    const novo = resposta('carro', 'um HB20 2021');
    expect(novo.rascunho).toMatchObject({ veiculoId: null, carroNovo: { marca: 'Hyundai', modelo: 'HB20', ano: '2021' } });
    const pelaPlaca = resposta('carro', 'ABC1D23');
    expect(pelaPlaca).toMatchObject({ perguntar: 'modelo', rascunho: { veiculoId: null, placa: 'ABC1D23' } });
    const modelo = resposta('carro', 'é um Kwid', pelaPlaca.rascunho, { ...ctx, subpergunta: 'modelo' });
    expect(modelo.rascunho).toMatchObject({ placa: 'ABC1D23', carroNovo: { marca: 'Renault', modelo: 'Kwid' } });
  });

  it('placa, km e dono', () => {
    expect(resposta('placa', 'a bê cê um dê dois três').rascunho.placa).toBe('ABC1D23');
    expect(resposta('placa', 'não tem placa').rascunho.semPlaca).toBe(true);
    expect(resposta('km', 'quarenta e cinco mil e duzentos').rascunho.km).toBe('45200');
    expect(resposta('km', 'não sei').rascunho.kmNaoSei).toBe(true);
    expect(resposta('dono', 'Roberto Alves').rascunho.dono).toEqual({ clienteId: 'c1', nome: 'Roberto Alves', telefone: '21990001007', semNome: false });
    const novo = resposta('dono', 'o dono é o Marcos');
    expect(novo).toMatchObject({ perguntar: 'telefone', rascunho: { dono: { nome: 'Marcos', clienteId: null } } });
    expect(resposta('dono', 'vinte e um nove nove oito oito sete sete seis seis cinco', novo.rascunho, { ...ctx, subpergunta: 'telefone' }).rascunho.dono.telefone).toBe('21998877665');
    expect(resposta('dono', 'não sei').rascunho.dono.semNome).toBe(true);
  });

  it('serviços falados entram na lista e no relato', () => {
    const r = resposta('servicos', 'troquei o óleo e o filtro de ar');
    expect(r.rascunho.servicos).toEqual(['troca_oleo', 'filtro_ar', 'filtro_oleo']);
    expect(r.rascunho.relato).toBe('troquei o óleo e o filtro de ar');
    expect(r.entendi).toBe('troca de óleo, filtro de ar do motor e filtro de óleo');
  });

  it('peça pela marca, quantidade e mão de obra', () => {
    const r = alternarServico(rascunhoVazio(agora), 'troca_oleo');
    const opcoes = [
      { id: 'estoque:1', texto: 'Lubrax Supera 5W-30' },
      { id: 'loja:2', texto: 'Mobil Super 5W-30' }
    ];
    expect(interpretar('peca:troca_oleo', '4 litros do lubrax', r, { ...ctx, opcoes })).toEqual({ tipo: 'peca', opcao: 'estoque:1', quantidade: 4, entendi: 'Lubrax Supera 5W-30' });
    expect(resposta('peca:troca_oleo', 'nenhum', r, { ...ctx, opcoes }).rascunho.linhas).toEqual([]);
    expect(interpretar('peca:troca_oleo', 'sei lá', r, { ...ctx, opcoes }).tipo).toBe('nada');
    const v = resposta('valores', 'oitenta reais', { ...r, servicos: ['troca_oleo'] });
    expect(v.rascunho.linhas[0]).toMatchObject({ tipo: 'servico', servico: 'troca_oleo', valorUnitario: 80 });
  });

  it('comandos valem em qualquer pergunta', () => {
    expect(interpretar('km', 'voltar', rascunhoVazio(agora), ctx)).toEqual({ tipo: 'comando', comando: 'voltar' });
    expect(interpretar('placa', 'pular', rascunhoVazio(agora), ctx)).toEqual({ tipo: 'comando', comando: 'pular' });
    expect(interpretar('conferir', 'pode seguir', rascunhoVazio(agora), ctx)).toEqual({ tipo: 'comando', comando: 'sim' });
    expect(interpretar('conferir', 'não', rascunhoVazio(agora), ctx)).toEqual({ tipo: 'comando', comando: 'nao' });
  });
});
