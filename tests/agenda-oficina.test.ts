import { describe, expect, it } from 'vitest';
import {
  ROTULO_SITUACAO,
  emAberto,
  enderecoDaOficina,
  linkDaOrdem,
  mensagemConfirmacao,
  mensagemLembrete,
  mensagemRecusa,
  ordemDoAgendamento,
  ordenarAgendamentos,
  passoPrincipal,
  podeMudar,
  proximasSituacoes,
  quandoPorExtenso,
  quemE,
  servicosDoTexto
} from '@/lib/agendamento';
import { mensagemDoAviso, tipoAvisoValido } from '@/lib/avisos/mensagens';
import { linkDeAgendamento, MENSAGEM_PADRAO, montarMensagem } from '@/lib/whatsapp';
import type { ItemAviso } from '@/lib/avisos';
import type { Agendamento } from '@/lib/registros-oficina';
import type { Cliente, Documento, Veiculo } from '@/lib/tipos';

const AGORA = '2026-10-17T12:00:00.000Z';

function agendamento(extra: Partial<Agendamento> = {}): Agendamento {
  return { id: 'a1', data: '2026-10-19', hora: '08:30', duracaoMin: 30, servico: 'Troca de óleo', situacao: 'marcado', origem: 'oficina', criadoEm: AGORA, atualizadoEm: AGORA, ...extra };
}

const cliente: Cliente = { id: 'c1', nome: 'Maria Souza', telefone: '21987654321', criadoEm: AGORA };
const veiculo: Veiculo = { id: 'v1', clienteId: 'c1', placa: 'ABC1D23', marca: 'Chevrolet', modelo: 'Onix', ano: 2019, criadoEm: AGORA };
const oficina = { nome: 'Oficina do Zé', endereco: 'Rua A, 10, Centro', cidade: 'Guapimirim', uf: 'RJ' };

function ordem(extra: Partial<Documento> = {}): Documento {
  return {
    id: 'o1',
    numero: 1,
    tipo: 'ordem',
    situacao: 'aberta',
    veiculoId: 'v1',
    km: null,
    data: '2026-10-19',
    linhas: [],
    desconto: null,
    criadoEm: '2026-10-19T11:40:00.000Z',
    atualizadoEm: '2026-10-19T11:40:00.000Z',
    ...extra
  };
}

describe('passos do agendamento', () => {
  it('marcado → confirmado → chegou → concluído; os finais só reabrem', () => {
    expect(passoPrincipal('marcado')).toBe('confirmado');
    expect(passoPrincipal('confirmado')).toBe('chegou');
    expect(passoPrincipal('chegou')).toBe('concluido');
    expect(passoPrincipal('concluido')).toBeNull();
    expect(podeMudar('marcado', 'chegou')).toBe(true);
    expect(podeMudar('marcado', 'concluido')).toBe(false);
    expect(podeMudar('cancelado', 'chegou')).toBe(false);
    expect(proximasSituacoes('faltou')).toEqual(['marcado']);
    expect(proximasSituacoes('concluido')).toEqual(['chegou']);
    expect(emAberto('chegou')).toBe(true);
    expect(emAberto('faltou')).toBe(false);
    expect(ROTULO_SITUACAO.concluido).toBe('Concluído');
  });

  it('ordena por dia e hora', () => {
    const lista = ordenarAgendamentos([agendamento({ id: 'b', hora: '10:00' }), agendamento({ id: 'c', data: '2026-10-18', hora: '17:00' }), agendamento({ id: 'a', hora: '08:00' })]);
    expect(lista.map((a) => a.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('quem é e o carro', () => {
  it('usa o cadastro quando há, ou o que foi digitado', () => {
    const doCadastro = quemE(agendamento({ clienteId: 'c1', veiculoId: 'v1' }), { c1: cliente }, { v1: veiculo });
    expect(doCadastro).toMatchObject({ nome: 'Maria Souza', telefone: '21987654321', placa: 'ABC1D23', carro: 'Onix 2019' });
    // só a placa digitada, de um carro que está cadastrado
    expect(quemE(agendamento({ placa: 'abc-1d23', nome: 'Maria' }), { c1: cliente }, { v1: veiculo }).veiculo?.id).toBe('v1');
    const avulso = quemE(agendamento({ nome: 'João', telefone: '21911112222', placa: 'XYZ9A99' }), {}, {});
    expect(avulso).toMatchObject({ nome: 'João', telefone: '21911112222', placa: 'XYZ9A99', carro: '', veiculo: null });
    // pediu pelo link para o carro da Maria: a confirmação vai para quem pediu
    expect(quemE(agendamento({ nome: 'Carlos', telefone: '5521988887777', placa: 'ABC1D23' }), { c1: cliente }, { v1: veiculo })).toMatchObject({
      nome: 'Carlos',
      telefone: '5521988887777',
      carro: 'Onix 2019',
      cliente: { id: 'c1' }
    });
  });

  it('acha os serviços no texto', () => {
    expect(servicosDoTexto('Troca de óleo e filtro de ar')).toEqual(['troca_oleo', 'filtro_ar']);
    expect(servicosDoTexto('Troca de óleo, Filtro de óleo')).toEqual(['troca_oleo', 'filtro_oleo']);
    expect(servicosDoTexto('Óleo do câmbio manual')).toEqual(['cambio_manual']);
    expect(servicosDoTexto('Filtro do ar-condicionado e higienização')).toEqual(['filtro_cabine', 'higienizacao']);
    expect(servicosDoTexto('Revisão dos freios')).toEqual(['revisao', 'pastilhas']);
    expect(servicosDoTexto('Alinhamento e balanceamento')).toEqual(['alinhamento']);
    expect(servicosDoTexto('troca_oleo')).toEqual(['troca_oleo']);
    expect(servicosDoTexto('Barulho na porta')).toEqual([]);
  });

  it('abre a ordem com o carro e os serviços', () => {
    expect(linkDaOrdem({ servico: 'Troca de óleo e filtro de ar' }, 'v1')).toBe('/oficina/nova?tipo=ordem&carro=v1&servicos=troca_oleo%2Cfiltro_ar');
    expect(linkDaOrdem({ servico: 'Barulho' }, null)).toBe('/oficina/nova?tipo=ordem');
  });

  it('acha a ordem aberta para o carro que chegou', () => {
    const a = agendamento({ veiculoId: 'v1', situacao: 'chegou' });
    expect(ordemDoAgendamento(a, [ordem()], { v1: veiculo })?.id).toBe('o1');
    // outra oficina do mesmo carro de antes do dia marcado, ou já ligada a outro agendamento, não
    expect(ordemDoAgendamento(a, [ordem({ data: '2026-10-10', criadoEm: '2026-10-10T12:00:00.000Z' })], { v1: veiculo })).toBeNull();
    expect(ordemDoAgendamento(a, [ordem()], { v1: veiculo }, new Set(['o1']))).toBeNull();
    expect(ordemDoAgendamento(a, [ordem({ agendamentoId: 'outro' })], { v1: veiculo })).toBeNull();
    // a ordem que aponta para o agendamento vale sempre
    expect(ordemDoAgendamento(a, [ordem({ id: 'o9', veiculoId: null, agendamentoId: 'a1' })], {})?.id).toBe('o9');
    // pela placa digitada, quando o carro foi cadastrado no passo a passo
    expect(ordemDoAgendamento(agendamento({ placa: 'ABC1D23' }), [ordem()], { v1: veiculo })?.id).toBe('o1');
    // mais de 3 dias depois, não
    expect(ordemDoAgendamento(a, [ordem({ data: '2026-10-23', criadoEm: '2026-10-23T12:00:00.000Z' })], { v1: veiculo })).toBeNull();
    expect(ordemDoAgendamento(a, [ordem({ situacao: 'cancelada' })], { v1: veiculo })).toBeNull();
  });
});

describe('mensagens do agendamento', () => {
  it('endereço sem repetir a cidade', () => {
    expect(enderecoDaOficina(oficina)).toBe('Rua A, 10, Centro, Guapimirim/RJ');
    expect(enderecoDaOficina({ ...oficina, endereco: 'Rua A, 10, Guapimirim' })).toBe('Rua A, 10, Guapimirim');
    expect(enderecoDaOficina({ endereco: '', cidade: 'Rio', uf: 'RJ' })).toBe('Rio/RJ');
  });

  it('dia por extenso, com hoje e amanhã', () => {
    expect(quandoPorExtenso('2026-10-19', '08:30')).toBe('segunda, 19/10, às 8h30');
    expect(quandoPorExtenso('2026-10-19', '14:00', '2026-10-18')).toBe('amanhã, segunda, 19/10, às 14h');
    expect(quandoPorExtenso('2026-10-19', '14:00', '2026-10-19')).toBe('hoje, segunda, 19/10, às 14h');
  });

  it('confirmação, lembrete da véspera e recusa', () => {
    const ctx = { cliente: 'Maria Souza', oficina, data: '2026-10-19', hora: '08:30', servico: 'Troca de óleo', carro: 'Onix', hoje: '2026-10-18' };
    expect(mensagemConfirmacao(ctx)).toBe(
      'Oi, Maria! Aqui é da Oficina do Zé. Seu horário está marcado para amanhã, segunda, 19/10, às 8h30 (troca de óleo do Onix). Endereço: Rua A, 10, Centro, Guapimirim/RJ. Se precisar mudar, é só responder esta mensagem.'
    );
    expect(mensagemLembrete(ctx)).toBe(
      'Oi, Maria! Passando para lembrar do seu horário amanhã, segunda, 19/10, às 8h30 na Oficina do Zé (troca de óleo do Onix). Endereço: Rua A, 10, Centro, Guapimirim/RJ. Pode confirmar? Se não puder vir, é só avisar por aqui.'
    );
    expect(mensagemRecusa({ ...ctx, hoje: undefined, motivo: 'Esse dia já está cheio', link: 'https://revisai.app/agendar/abc123xyz9' })).toBe(
      'Oi, Maria! Aqui é da Oficina do Zé. Não vamos conseguir atender no horário que você pediu, segunda, 19/10, às 8h30. Esse dia já está cheio. Se quiser, escolha outro horário aqui: https://revisai.app/agendar/abc123xyz9'
    );
    expect(mensagemConfirmacao({ ...ctx, cliente: '', servico: '', carro: '', oficina: { nome: '', endereco: '', cidade: '', uf: '' } })).toBe(
      'Oi! Aqui é da oficina. Seu horário está marcado para amanhã, segunda, 19/10, às 8h30. Se precisar mudar, é só responder esta mensagem.'
    );
  });
});

describe('aviso do pedido de horário', () => {
  it('diz quem pediu, quando e o serviço, e leva aos pedidos da agenda', () => {
    expect(tipoAvisoValido('agendamento_online')).toBe(true);
    expect(mensagemDoAviso('agendamento_online', { pedidoId: 'p1', cliente: 'Maria', data: '2026-10-19', hora: '08:30', servico: 'Troca de óleo' })).toEqual({
      titulo: 'Pedido de horário pelo link',
      corpo: 'Maria pediu o dia 19/10 às 08:30 (Troca de óleo). Aceite ou recuse na agenda.',
      url: '/oficina/agenda?aba=pedidos',
      marca: 'agenda-p1'
    });
    expect(mensagemDoAviso('agendamento_online', {})!.corpo).toBe('Um cliente pediu um horário. Aceite ou recuse na agenda.');
  });
});

describe('link de agendamento na mensagem dos avisos', () => {
  const item = { servico: 'troca_oleo', venc: { dataPrevista: '2026-10-25', diasRestantes: 8, motivo: 'tempo' } } as unknown as ItemAviso;
  const base = { cliente: 'Maria Souza', oficina: 'Oficina do Zé', veiculo: { modelo: 'Onix', placa: 'ABC1D23' }, itens: [item] };

  it('o link só existe com um código válido', () => {
    expect(linkDeAgendamento('https://revisai.app/', 'k7m2x9qp4t')).toBe('https://revisai.app/agendar/k7m2x9qp4t');
    expect(linkDeAgendamento('https://revisai.app', null)).toBeNull();
    expect(linkDeAgendamento('https://revisai.app', '../x')).toBeNull();
  });

  it('sem a variável, nada muda; com ela, vira o link ou a frase sai', () => {
    expect(montarMensagem(MENSAGEM_PADRAO, { ...base, agendar: 'https://revisai.app/agendar/k7m2x9qp4t' })).toBe(montarMensagem(MENSAGEM_PADRAO, base));
    const modelo = 'Oi, {cliente}! Lembrete: {lista}. Escolha o horário aqui: {agendar}\nAbraço, {oficina}.';
    expect(montarMensagem(modelo, { ...base, agendar: 'https://revisai.app/agendar/k7m2x9qp4t' })).toBe(
      'Oi, Maria! Lembrete: a troca de óleo do seu Onix vence no dia 25/10. Escolha o horário aqui: https://revisai.app/agendar/k7m2x9qp4t\nAbraço, Oficina do Zé.'
    );
    expect(montarMensagem('Oi, {cliente}! Lembrete: {lista}. Escolha o horário aqui: {agendar}.\nAbraço, {oficina}.', base)).toBe(
      'Oi, Maria! Lembrete: a troca de óleo do seu Onix vence no dia 25/10.\nAbraço, Oficina do Zé.'
    );
  });
});
