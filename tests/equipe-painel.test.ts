import { describe, expect, it } from 'vitest';
import { cnpjValido } from '@/lib/cnpj';
import { formatarCnae, lerDadosCnpj } from '@/lib/equipe/cnpj-dados';
import { descricaoDoEvento, mudancas, nomeDaTabela, valorLegivel } from '@/lib/equipe/historico';
import {
  lerEquipe,
  lerEventos,
  lerMetricasAssinatura,
  lerOficinasEquipe,
  lerPainelMarketplace,
  lerUsoDeAlertas,
  oficinaDoPedidoDeAlertas,
  planoNoDia,
  porcento,
  quantidadeDoPedidoDeAlertas,
  variacao
} from '@/lib/equipe/tipos';

// Resposta da BrasilAPI (/api/cnpj/v1/{cnpj}) como ela vem, com dados de uma loja inventada.
const RESPOSTA_BRASILAPI = {
  uf: 'RJ',
  cep: '25953000',
  qsa: [
    { pais: null, nome_socio: 'JOAO DA SILVA', codigo_pais: null, faixa_etaria: 'Entre 41 a 50 anos', cnpj_cpf_do_socio: '***123456**', qualificacao_socio: 'Sócio-Administrador' },
    { pais: null, nome_socio: 'MARIA SOUZA', codigo_pais: null, faixa_etaria: 'Entre 31 a 40 anos', cnpj_cpf_do_socio: '***654321**', qualificacao_socio: 'Sócio' }
  ],
  cnpj: '11222333000181',
  pais: null,
  email: null,
  porte: 'MICRO EMPRESA',
  bairro: 'CENTRO',
  numero: '120',
  ddd_fax: '',
  municipio: 'TERESOPOLIS',
  logradouro: 'DELFIM MOREIRA',
  cnae_fiscal: 4530703,
  codigo_pais: null,
  complemento: 'LOJA 2',
  codigo_porte: 1,
  razao_social: 'AUTOPECAS SERRA LTDA',
  nome_fantasia: 'SERRA AUTOPECAS',
  capital_social: 50000,
  ddd_telefone_1: '2127420000',
  ddd_telefone_2: '',
  opcao_pelo_mei: false,
  descricao_porte: '',
  codigo_municipio: 5873,
  cnaes_secundarios: [
    { codigo: 4520001, descricao: 'Serviços de manutenção e reparação mecânica de veículos automotores' },
    { codigo: 4732600, descricao: 'Comércio varejista de lubrificantes' }
  ],
  natureza_juridica: 'Sociedade Empresária Limitada',
  situacao_especial: '',
  opcao_pelo_simples: true,
  situacao_cadastral: 2,
  data_opcao_pelo_mei: null,
  data_exclusao_do_mei: null,
  cnae_fiscal_descricao: 'Comércio a varejo de peças e acessórios novos para veículos automotores',
  codigo_municipio_ibge: 3305802,
  data_inicio_atividade: '2012-05-14',
  data_situacao_especial: null,
  data_opcao_pelo_simples: '2012-05-14',
  data_situacao_cadastral: '2012-05-14',
  nome_cidade_no_exterior: '',
  codigo_natureza_juridica: 2062,
  data_exclusao_do_simples: null,
  motivo_situacao_cadastral: 0,
  ente_federativo_responsavel: '',
  identificador_matriz_filial: 1,
  qualificacao_do_responsavel: 49,
  descricao_situacao_cadastral: 'ATIVA',
  descricao_tipo_de_logradouro: 'RUA',
  descricao_motivo_situacao_cadastral: 'SEM MOTIVO',
  descricao_identificador_matriz_filial: 'MATRIZ'
};

describe('CNPJ das lojas em análise', () => {
  it('lê a resposta da BrasilAPI', () => {
    expect(cnpjValido(RESPOSTA_BRASILAPI.cnpj)).toBe(true);
    const d = lerDadosCnpj(RESPOSTA_BRASILAPI);
    expect(d).toMatchObject({
      cnpj: '11222333000181',
      razaoSocial: 'AUTOPECAS SERRA LTDA',
      nomeFantasia: 'SERRA AUTOPECAS',
      situacao: 'ATIVA',
      ativa: true,
      abertura: '2012-05-14',
      atividade: { codigo: '4530-7/03', descricao: 'Comércio a varejo de peças e acessórios novos para veículos automotores' },
      municipio: 'TERESOPOLIS',
      uf: 'RJ',
      porte: 'MICRO EMPRESA',
      socios: ['JOAO DA SILVA', 'MARIA SOUZA'],
      ligadaAPecas: true
    });
    expect(d?.endereco).toBe('RUA DELFIM MOREIRA, 120, LOJA 2, CENTRO, CEP 25953-000');
    expect(d?.outrasAtividades.map((a) => a.codigo)).toEqual(['4520-0/01', '4732-6/00']);
  });

  it('situação pelo número quando a descrição não vem, e atividade fora de peças', () => {
    const d = lerDadosCnpj({
      ...RESPOSTA_BRASILAPI,
      descricao_situacao_cadastral: null,
      situacao_cadastral: 8,
      cnae_fiscal: 5611201,
      cnae_fiscal_descricao: 'Restaurantes e similares',
      cnaes_secundarios: [{ codigo: 0, descricao: '' }]
    });
    expect(d?.situacao).toBe('BAIXADA');
    expect(d?.ativa).toBe(false);
    expect(d?.outrasAtividades).toEqual([]);
    expect(d?.ligadaAPecas).toBe(false);
  });

  it('recusa o que não é resposta de CNPJ', () => {
    expect(lerDadosCnpj(null)).toBeNull();
    expect(lerDadosCnpj({ message: 'CNPJ 11222333000181 não encontrado.', type: 'not_found' })).toBeNull();
    expect(lerDadosCnpj('texto')).toBeNull();
    expect(formatarCnae(4530703)).toBe('4530-7/03');
    expect(formatarCnae('0111301')).toBe('0111-3/01');
  });
});

describe('histórico da equipe', () => {
  const [evento] = lerEventos([
    {
      id: 41,
      quando: '2026-10-16T21:10:00Z',
      email: 'fin@revisai.com.br',
      papel: 'financeiro',
      acao: 'update',
      tabela: 'public.oficinas',
      registro: '3f0c',
      antes: { id: '3f0c', nome: 'Auto Center', pro_ate: '2026-10-01', fundador: false, atualizado_em: '2026-10-01T10:00:00Z' },
      depois: { id: '3f0c', nome: 'Auto Center', pro_ate: '2027-01-01', fundador: true, atualizado_em: '2026-10-16T21:10:00Z' },
      ip: '200.1.2.3'
    }
  ]).itens;

  it('mostra só o que mudou, em português', () => {
    expect(descricaoDoEvento(evento)).toBe('Mudou a oficina');
    expect(mudancas(evento)).toEqual([
      { campo: 'pro_ate', rotulo: 'Pro até', de: '01/10/2026', para: '01/01/2027' },
      { campo: 'fundador', rotulo: 'Fundador', de: 'não', para: 'sim' }
    ]);
  });

  it('criar e apagar mostram os campos preenchidos; ações sem tabela têm nome próprio', () => {
    const criou = mudancas({ antes: null, depois: { id: 9, oficina_id: 'x', quantidade: 20, valor: 49.9, observacao: null, criado_em: '2026-10-16T21:00:00Z' } });
    expect(criou.map((m) => [m.rotulo, m.para?.replace(/\s/g, ' ')])).toEqual([
      ['Id da oficina', 'x'],
      ['Valor', 'R$ 49,90'],
      ['Quantidade', '20']
    ]);
    expect(descricaoDoEvento({ acao: 'insert', tabela: 'public.alertas_creditos' })).toBe('Criou o pacote de alertas');
    expect(descricaoDoEvento({ acao: 'aparelho_novo', tabela: 'privado.equipe_aparelhos' })).toBe('Entrou de um aparelho novo');
    expect(descricaoDoEvento({ acao: 'consultou_acessos', tabela: 'privado.acessos' })).toBe('Consultou os registros de acesso');
    expect(nomeDaTabela('public.qualquer')).toBe('public.qualquer');
    expect(valorLegivel('x'.repeat(200))?.length).toBe(120);
    expect(valorLegivel(null)).toBeNull();
  });
});

describe('dados do painel', () => {
  it('oficinas, plano do dia e pedidos de pacote de alertas', () => {
    const { itens, descartadas } = lerOficinasEquipe([
      {
        id: '0b8e6f7a-1111-4222-8333-944445555666',
        nome: 'Auto Center',
        cidade: 'Rio',
        uf: 'RJ',
        whatsapp: '5521999990000',
        cnpj: null,
        proAte: '2026-12-01',
        testeAte: null,
        fundador: true,
        ativa: true,
        excluirEm: null,
        criado_em: '2026-10-01T10:00:00Z',
        plano: 'pro',
        membros: 2,
        dono: 'dono@x.com',
        clientes: '14',
        documentos: 3,
        ultimoUso: null,
        montagensMes: 0,
        compras: '120.50'
      },
      { id: 1 }
    ]);
    expect(descartadas).toBe(1);
    expect(itens[0]).toMatchObject({ clientes: 14, compras: 120.5, plano: 'pro' });
    expect(planoNoDia({ pro_ate: '2026-10-16', teste_ate: null }, '2026-10-16')).toBe('pro');
    expect(planoNoDia({ pro_ate: '2026-10-15', teste_ate: '2026-10-20' }, '2026-10-16')).toBe('teste');
    expect(planoNoDia({ pro_ate: null, teste_ate: null }, '2026-10-16')).toBe('gratis');

    const codigos = [{ codigo: 'ABCDEFGHJKLMNPQR', oficina_id: 'aaaaaaaa-1111-4222-8333-944445555666' }];
    expect(oficinaDoPedidoDeAlertas('Quer 20 alertas de preço extras (R$ 49,90). Código do Pro: ABCD-EFGH-JKLM-NPQR.', codigos)).toBe(codigos[0].oficina_id);
    expect(oficinaDoPedidoDeAlertas('Quer 20 alertas. Oficina: 0B8E6F7A-1111-4222-8333-944445555666.', codigos)).toBe('0b8e6f7a-1111-4222-8333-944445555666');
    expect(oficinaDoPedidoDeAlertas('Quer 20 alertas.', codigos)).toBeNull();
    expect(quantidadeDoPedidoDeAlertas('Quer 50 alertas de preço extras')).toBe(50);
    expect(lerUsoDeAlertas([{ oficinaId: 'a', noMes: 4, creditos: 20, gastos: 25 }])).toEqual({ a: { noMes: 4, creditos: 20, gastos: 25, extras: 0 } });
  });

  it('números do negócio, com contas de variação e porcentagem', () => {
    const m = lerMetricasAssinatura({
      pagantes: 3,
      comAssinatura: 1,
      mrr: '99.70',
      receitaMedia: 33.23,
      teste: 2,
      gratis: 5,
      receitaMes: 89.7,
      churnMes: { sairam: 1, base: 4 },
      conversao: { cadastradas: 10, testaram: 4, pro: 3 },
      serie: [{ mes: '2026-10', receita: 89.7, assinaturas: 1, oficinasNovas: 4 }]
    });
    expect(m?.mrr).toBe(99.7);
    expect(lerMetricasAssinatura({ pagantes: 'x' })).toBeNull();
    const p = lerPainelMarketplace({
      dias: 30,
      gmv: 4000,
      gmvAnterior: 0,
      comissao: 200,
      takeRate: 5,
      pedidos: 2,
      compradoras: 1,
      ticket: 2000,
      cancelamento: { partes: 3, canceladas: 1, pelaLoja: 1 },
      recompra: { '30': { base: 2, voltaram: 1 } },
      diasAtePrimeiraCompra: null,
      horasConfirmacaoEntrega: '26.5',
      lojas: []
    });
    expect(p?.horasConfirmacaoEntrega).toBe(26.5);
    expect(p?.recompra['30']).toEqual({ base: 2, voltaram: 1 });
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(50, 0)).toBeNull();
    expect(porcento(1, 3)).toBe(33.3);
    expect(porcento(1, 0)).toBe(0);
    const e = lerEquipe({ membros: [{ userId: 'u1', email: 'a@x.com', nome: null, papel: 'admin', ativo: true, criadoEm: '2026-10-01', ultimoAcesso: null }, { papel: 'chefe' }], convites: null });
    expect(e.membros).toHaveLength(1);
    expect(e.convites).toEqual([]);
  });
});
