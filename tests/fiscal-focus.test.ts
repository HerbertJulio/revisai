import { describe, expect, it } from 'vitest';
import { BASES_FOCUS, CABECALHO_AVISO, corpoDaNfe, corpoDaNfseMunicipal, corpoDaNfsen, criarFocus, mensagemDaFocus, notaDaFocus } from '@/lib/fiscal/focus';
import { criarTesteFiscal, eventoTeste } from '@/lib/fiscal/teste';
import { ErroFiscal, type CredenciaisFiscais, type EmpresaFiscal, type NovaNfe, type NovaNfse } from '@/lib/fiscal/tipos';

// O adaptador da Focus NFe contra respostas no formato da documentação (doc.focusnfe.com.br):
// criar_empresa, atualizar_empresa, criar_webhook, emitir_dps_nacional, emitir_nfse, emitir_nfe,
// consultar_nfse_nacional, consultar_nfe, cancelar_nfse_nacional e cancelar_nfe.

interface Chamada {
  metodo: string;
  url: string;
  autorizacao: string | null;
  corpo: unknown;
}

function falso(respostas: { metodo: string; url: string | RegExp; status: number; corpo: unknown }[]) {
  const chamadas: Chamada[] = [];
  const fila = [...respostas];
  const f = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? 'GET';
    const h = new Headers(init?.headers);
    chamadas.push({ metodo, url, autorizacao: h.get('authorization'), corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    const i = fila.findIndex((r) => r.metodo === metodo && (typeof r.url === 'string' ? r.url === url : r.url.test(url)));
    if (i < 0) throw new Error(`chamada inesperada: ${metodo} ${url}`);
    const [r] = fila.splice(i, 1);
    const texto = typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo);
    return new Response(texto, { status: r.status, headers: { 'content-type': typeof r.corpo === 'string' ? 'text/html' : 'application/json' } });
  }) as typeof fetch;
  return { f, chamadas, faltam: () => fila.length };
}

const basic = (t: string) => `Basic ${Buffer.from(`${t}:`).toString('base64')}`;

const EMPRESA: EmpresaFiscal = {
  cnpj: '11222333000181',
  razaoSocial: 'Auto Center Ltda',
  nomeFantasia: 'Auto Center',
  regime: 'simples',
  inscricaoMunicipal: '12345',
  inscricaoEstadual: '087654321',
  email: 'fiscal@autocenter.com',
  telefone: '21999990000',
  endereco: { logradouro: 'Rua A', numero: '1', bairro: 'Centro', municipio: 'Rio de Janeiro', uf: 'RJ', cep: '20000000', codigoMunicipio: '3304557' },
  padraoNfse: 'nacional',
  ambiente: 'homologacao'
};

const CRED: CredenciaisFiscais = { empresaId: '123', tokens: { producao: 'tok-prod', homologacao: 'tok-homol' } };

// o exemplo de resposta da documentação (criar_empresa)
const EMPRESA_CRIADA = {
  id: 123,
  nome: 'Auto Center Ltda',
  cnpj: '11222333000181',
  regime_tributario: '1',
  cep: '20000-000',
  habilita_nfe: true,
  habilita_nfsen_producao: true,
  habilita_nfsen_homologacao: true,
  certificado_valido_ate: '2025-04-01T15:03:25-03:00',
  certificado_valido_de: '2024-04-01T15:03:25-03:00',
  certificado_cnpj: '11222333000181',
  token_producao: 'tok-prod',
  token_homologacao: 'tok-homol'
};

const NFSE: NovaNfse = {
  referencia: 'rv-nfsen-7f3a9c2e-abcdefghjkmn',
  ambiente: 'homologacao',
  padrao: 'nacional',
  dataEmissao: '2026-10-17T12:30:00-03:00',
  competencia: '2026-10-17',
  prestador: { cnpj: '11222333000181', regime: 'simples', inscricaoMunicipal: '12345', codigoMunicipio: '3304557' },
  tomador: { nome: 'Ana Souza', documento: '52998224725', email: 'ana@exemplo.com', telefone: '(21) 98888-7777', endereco: null },
  servico: { descricao: 'Mão de obra da OS nº 12', valor: 180, itemListaServico: '14.01', codigoTributacaoNacional: '140101', codigoTributacaoMunicipal: null, aliquotaIss: 2, cnae: '4520001' },
  ibsCbs: null
};

const NFE: NovaNfe = {
  referencia: 'rv-nfe-7f3a9c2e-abcdefghjkmn',
  ambiente: 'producao',
  dataEmissao: '2026-10-17T12:30:00-03:00',
  emitente: { cnpj: '11222333000181', regime: 'simples', inscricaoEstadual: '87654321' },
  destinatario: {
    nome: 'Ana Souza',
    documento: '52998224725',
    email: 'ana@exemplo.com',
    endereco: { logradouro: 'Rua das Flores', numero: '10', bairro: 'Centro', municipio: 'Rio de Janeiro', uf: 'RJ', cep: '20000000' }
  },
  itens: [
    { numero: 1, codigo: 'OL-5W30', descricao: 'Óleo 5W30', ncm: '27101932', cfop: '5405', unidade: 'L', quantidade: 4, valorUnitario: 40, valorBruto: 160, valorDesconto: 16, icms: { situacao: '500', origem: 0 }, pis: '49', cofins: '49' }
  ],
  valorProdutos: 160,
  valorDesconto: 16,
  valorTotal: 144,
  formaPagamento: '17'
};

// a nota autorizada do exemplo de consultar_nfse_nacional
const NFSEN_AUTORIZADA = {
  cnpj_prestador: '12345678000123',
  ref: 'rv-nfsen-7f3a9c2e-abcdefghjkmn',
  numero_rps: '73895',
  serie_rps: '1',
  tipo_rps: '1',
  status: 'autorizado',
  numero: '74798',
  codigo_verificacao: 'ABC123',
  data_emissao: '2026-03-30T11:25:14-03:00',
  url: 'https://www.nfse.gov.br/consultapublica/?tpc=1&chave=42054072212345678000123000000007479826039913594189',
  caminho_xml_nota_fiscal: '/arquivos/12345678000123_1/202603/XMLsNFSe/NFS42054072212345678000123000000007479826039913594189-nfse.xml',
  url_danfse: 'https://focusnfe.s3.sa-east-1.amazonaws.com/arquivos/12345678000123_1/202603/DANFSEs/NFS42054072212345678000123000000007479826039913594189.pdf'
};

// a NF-e autorizada do exemplo de consultar_nfe
const NFE_AUTORIZADA = {
  cnpj_emitente: '12345678000123',
  ref: 'rv-nfe-7f3a9c2e-abcdefghjkmn',
  status: 'autorizado',
  status_sefaz: '100',
  mensagem_sefaz: 'Autorizado o uso da NF-e',
  chave_nfe: 'NFe41190612345678000123550010000000221923094166',
  numero: '22',
  serie: '1',
  caminho_xml_nota_fiscal: '/arquivos/12345678000123/201906/XMLs/41190612345678000123550010000000221923094166-nfe.xml',
  caminho_danfe: '/arquivos/12345678000123/201906/DANFEs/41190612345678000123550010000000221923094166.pdf'
};

const H = BASES_FOCUS.homologacao;
const P = BASES_FOCUS.producao;
const WEBHOOK = 'https://revisai.app/api/fiscal/focus';

describe('Focus NFe: empresas e gatilhos', () => {
  it('cadastra a empresa com o token da conta e liga os gatilhos com o token da empresa', async () => {
    const { f, chamadas, faltam } = falso([
      { metodo: 'POST', url: `${P}/v2/empresas`, status: 200, corpo: EMPRESA_CRIADA },
      { metodo: 'GET', url: `${H}/v2/hooks`, status: 200, corpo: [{ id: 'Abc', url: `${WEBHOOK}?ambiente=homologacao`, event: 'nfe', cnpj: '11222333000181', authorization: null, authorization_header: null }] },
      {
        metodo: 'POST',
        url: `${H}/v2/hooks`,
        status: 200,
        corpo: { id: 'Vj5rmkBq', url: `${WEBHOOK}?ambiente=homologacao`, authorization: 'segredo', authorization_header: CABECALHO_AVISO, event: 'nfsen', cnpj: '11222333000181' }
      }
    ]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: 'segredo', urlWebhook: WEBHOOK, fetch: f });
    const r = await focus.cadastrarEmpresa(EMPRESA, null);
    expect(r).toEqual({ credenciais: { empresaId: '123', tokens: { producao: 'tok-prod', homologacao: 'tok-homol' } }, certificadoValidoAte: '2025-04-01T15:03:25-03:00' });
    expect(faltam()).toBe(0);
    expect(chamadas[0].autorizacao).toBe(basic('conta'));
    expect(chamadas[0].corpo).toEqual({
      nome: 'Auto Center Ltda',
      nome_fantasia: 'Auto Center',
      cnpj: '11222333000181',
      inscricao_municipal: 12345,
      inscricao_estadual: '087654321',
      regime_tributario: 1,
      email: 'fiscal@autocenter.com',
      telefone: '21999990000',
      logradouro: 'Rua A',
      numero: '1',
      bairro: 'Centro',
      municipio: 'Rio de Janeiro',
      uf: 'RJ',
      cep: '20000000',
      habilita_nfe: true,
      habilita_nfse: false,
      habilita_nfsen_producao: true,
      habilita_nfsen_homologacao: true,
      enviar_email_destinatario: true
    });
    // o gatilho da NF-e já existia: só o da NFS-e Nacional é criado
    expect(chamadas[1].autorizacao).toBe(basic('tok-homol'));
    expect(chamadas[2].corpo).toEqual({ cnpj: '11222333000181', event: 'nfsen', url: `${WEBHOOK}?ambiente=homologacao`, authorization: 'segredo', authorization_header: CABECALHO_AVISO });
  });

  it('atualiza a empresa existente e mantém os tokens quando a resposta vem sem eles', async () => {
    const { f, chamadas } = falso([
      { metodo: 'PUT', url: `${P}/v2/empresas/123`, status: 200, corpo: { ...EMPRESA_CRIADA, token_producao: '', token_homologacao: '' } },
      { metodo: 'GET', url: `${P}/v2/hooks`, status: 200, corpo: [] },
      { metodo: 'POST', url: `${P}/v2/hooks`, status: 200, corpo: { id: 'a' } },
      { metodo: 'POST', url: `${P}/v2/hooks`, status: 200, corpo: { id: 'b' } }
    ]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: 'segredo', urlWebhook: WEBHOOK, fetch: f });
    const r = await focus.cadastrarEmpresa({ ...EMPRESA, ambiente: 'producao', padraoNfse: 'municipal' }, CRED);
    expect(r.credenciais).toEqual(CRED);
    expect((chamadas[0].corpo as Record<string, unknown>).habilita_nfse).toBe(true);
    expect((chamadas[0].corpo as Record<string, unknown>).habilita_nfsen_producao).toBe(false);
    expect(chamadas.slice(2).map((c) => (c.corpo as { event: string }).event)).toEqual(['nfse', 'nfe']);
  });

  it('sem o segredo dos avisos, não cria gatilho; erro de validação vira a mensagem da Focus', async () => {
    const { f, chamadas } = falso([
      { metodo: 'POST', url: `${P}/v2/empresas`, status: 200, corpo: EMPRESA_CRIADA },
      {
        metodo: 'PUT',
        url: `${P}/v2/empresas/123`,
        status: 422,
        corpo: { codigo: 'erro_validacao', mensagem: 'Erro de validação', erros: [{ codigo: 'certificado_invalido', mensagem: 'Certificado não pertence ao CNPJ da empresa', campo: 'arquivo_certificado_base64' }] }
      }
    ]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    await focus.cadastrarEmpresa(EMPRESA, null);
    expect(chamadas).toHaveLength(1);
    const erro = await focus.enviarCertificado(CRED, EMPRESA.cnpj, 'MIIQ...base64', 'senha').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroFiscal);
    expect(erro.message).toBe('Certificado não pertence ao CNPJ da empresa');
    expect(chamadas[1].corpo).toEqual({ arquivo_certificado_base64: 'MIIQ...base64', senha_certificado: 'senha' });
  });

  it('o certificado aceito devolve a validade', async () => {
    const { f } = falso([{ metodo: 'PUT', url: `${P}/v2/empresas/123`, status: 200, corpo: { ...EMPRESA_CRIADA, certificado_valido_ate: '2027-10-01T10:00:00-03:00' } }]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    expect(await focus.enviarCertificado(CRED, EMPRESA.cnpj, 'MIIQ', 'senha')).toEqual({ validoAte: '2027-10-01T10:00:00-03:00' });
    await expect(focus.enviarCertificado({ empresaId: null }, EMPRESA.cnpj, 'MIIQ', 'senha')).rejects.toThrow(/cadastro fiscal/);
  });
});

describe('Focus NFe: emissão', () => {
  it('NFS-e Nacional: DPS com o token de homologação da empresa, volta processando', async () => {
    const { f, chamadas } = falso([
      { metodo: 'POST', url: `${H}/v2/nfsen?ref=rv-nfsen-7f3a9c2e-abcdefghjkmn`, status: 202, corpo: { cnpj_prestador: '11222333000181', ref: 'rv-nfsen-7f3a9c2e-abcdefghjkmn', status: 'processando_autorizacao' } }
    ]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    const r = await focus.emitirNfse(NFSE, CRED);
    expect(r).toMatchObject({ externo: 'rv-nfsen-7f3a9c2e-abcdefghjkmn', situacao: 'processando' });
    expect(chamadas[0].autorizacao).toBe(basic('tok-homol'));
    expect(chamadas[0].corpo).toEqual({
      data_emissao: '2026-10-17T12:30:00-03:00',
      data_competencia: '2026-10-17',
      codigo_municipio_emissora: 3304557,
      cnpj_prestador: '11222333000181',
      codigo_opcao_simples_nacional: 3,
      regime_tributario_simples_nacional: 1,
      regime_especial_tributacao: 0,
      cpf_tomador: '52998224725',
      razao_social_tomador: 'Ana Souza',
      email_tomador: 'ana@exemplo.com',
      telefone_tomador: '21988887777',
      codigo_municipio_prestacao: 3304557,
      codigo_tributacao_nacional_iss: '140101',
      descricao_servico: 'Mão de obra da OS nº 12',
      valor_servico: 180,
      tributacao_iss: 1,
      tipo_retencao_iss: 1,
      percentual_aliquota_relativa_municipio: 2
    });
  });

  it('NFS-e Nacional do MEI e do regime normal, com IBS/CBS', () => {
    expect(corpoDaNfsen({ ...NFSE, prestador: { ...NFSE.prestador, regime: 'mei' } })).toMatchObject({ codigo_opcao_simples_nacional: 2 });
    expect(corpoDaNfsen({ ...NFSE, prestador: { ...NFSE.prestador, regime: 'mei' } })).not.toHaveProperty('regime_tributario_simples_nacional');
    const normal = corpoDaNfsen({ ...NFSE, prestador: { ...NFSE.prestador, regime: 'normal' }, ibsCbs: { situacao: '000', classificacao: '000001' }, tomador: { ...NFSE.tomador, documento: '11444777000161' } });
    expect(normal).toMatchObject({ codigo_opcao_simples_nacional: 1, cnpj_tomador: '11444777000161', ibs_cbs_situacao_tributaria: '000', ibs_cbs_classificacao_tributaria: '000001' });
    expect(normal).not.toHaveProperty('cpf_tomador');
  });

  it('NFS-e da prefeitura: layout ABRASF com prestador, tomador e serviço', async () => {
    const municipal: NovaNfse = { ...NFSE, padrao: 'municipal', referencia: 'rv-nfse-7f3a9c2e-abcdefghjkmn', tomador: { ...NFSE.tomador, endereco: { logradouro: 'Rua das Flores', numero: '123', bairro: 'Centro', municipio: 'São Paulo', uf: 'SP', cep: '01234567', codigoMunicipio: '3550308' } } };
    expect(corpoDaNfseMunicipal(municipal)).toEqual({
      data_emissao: '2026-10-17T12:30:00-03:00',
      natureza_operacao: '1',
      optante_simples_nacional: true,
      regime_especial_tributacao: '6',
      prestador: { cnpj: '11222333000181', inscricao_municipal: '12345', codigo_municipio: '3304557' },
      tomador: {
        cpf: '52998224725',
        razao_social: 'Ana Souza',
        email: 'ana@exemplo.com',
        telefone: '21988887777',
        endereco: { logradouro: 'Rua das Flores', numero: '123', bairro: 'Centro', codigo_municipio: '3550308', uf: 'SP', cep: '01234567' }
      },
      servico: { aliquota: 2, discriminacao: 'Mão de obra da OS nº 12', iss_retido: false, item_lista_servico: '1401', codigo_cnae: '4520001', valor_servicos: 180, codigo_municipio: '3304557' }
    });
    const { f, chamadas } = falso([
      { metodo: 'POST', url: `${H}/v2/nfse?ref=rv-nfse-7f3a9c2e-abcdefghjkmn`, status: 201, corpo: { cnpj_prestador: '11222333000181', ref: 'rv-nfse-7f3a9c2e-abcdefghjkmn', numero_rps: '1', serie_rps: '1', tipo_rps: '1', status: 'processando_autorizacao' } }
    ]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    expect((await focus.emitirNfse(municipal, CRED)).situacao).toBe('processando');
    expect(chamadas[0].url).toBe(`${H}/v2/nfse?ref=rv-nfse-7f3a9c2e-abcdefghjkmn`);
  });

  it('NF-e: venda de peças ao consumidor, em produção', async () => {
    const { f, chamadas } = falso([{ metodo: 'POST', url: `${P}/v2/nfe?ref=rv-nfe-7f3a9c2e-abcdefghjkmn`, status: 202, corpo: { cnpj_emitente: '11222333000181', ref: 'rv-nfe-7f3a9c2e-abcdefghjkmn', status: 'processando_autorizacao' } }]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    expect((await focus.emitirNfe(NFE, CRED)).situacao).toBe('processando');
    expect(chamadas[0].autorizacao).toBe(basic('tok-prod'));
    expect(chamadas[0].corpo).toEqual(corpoDaNfe(NFE));
    expect(corpoDaNfe(NFE)).toEqual({
      natureza_operacao: 'Venda de mercadoria',
      data_emissao: '2026-10-17T12:30:00-03:00',
      data_entrada_saida: '2026-10-17T12:30:00-03:00',
      tipo_documento: 1,
      finalidade_emissao: 1,
      cnpj_emitente: '11222333000181',
      regime_tributario_emitente: 1,
      inscricao_estadual_emitente: '87654321',
      local_destino: 1,
      consumidor_final: 1,
      presenca_comprador: 1,
      modalidade_frete: 9,
      nome_destinatario: 'Ana Souza',
      cpf_destinatario: '52998224725',
      indicador_inscricao_estadual_destinatario: 9,
      email_destinatario: 'ana@exemplo.com',
      logradouro_destinatario: 'Rua das Flores',
      numero_destinatario: '10',
      bairro_destinatario: 'Centro',
      municipio_destinatario: 'Rio de Janeiro',
      uf_destinatario: 'RJ',
      cep_destinatario: '20000000',
      pais_destinatario: 'Brasil',
      valor_produtos: 160,
      valor_desconto: 16,
      valor_total: 144,
      items: [
        {
          numero_item: 1,
          codigo_produto: 'OL-5W30',
          descricao: 'Óleo 5W30',
          cfop: '5405',
          codigo_ncm: '27101932',
          unidade_comercial: 'L',
          quantidade_comercial: 4,
          valor_unitario_comercial: 40,
          valor_bruto: 160,
          unidade_tributavel: 'L',
          quantidade_tributavel: 4,
          valor_unitario_tributavel: 40,
          valor_desconto: 16,
          icms_origem: 0,
          icms_situacao_tributaria: '500',
          pis_situacao_tributaria: '49',
          cofins_situacao_tributaria: '49'
        }
      ],
      formas_pagamento: [{ forma_pagamento: '17', valor_pagamento: 144 }]
    });
  });

  it('o pedido recusado vira a mensagem da Focus; sem o token do ambiente, não manda', async () => {
    const { f } = falso([{ metodo: 'POST', url: /\/v2\/nfsen\?ref=/, status: 422, corpo: { codigo: 'erro_validacao', mensagem: 'Erro de validação', erros: [{ codigo: 'E0014', mensagem: 'CPF do tomador inválido', campo: 'cpf_tomador' }] } }]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    const erro = await focus.emitirNfse(NFSE, CRED).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroFiscal);
    expect(erro).toMatchObject({ message: 'CPF do tomador inválido', status: 422, codigo: 'erro_validacao' });
    await expect(focus.emitirNfse(NFSE, { empresaId: '123', tokens: { producao: 'x' } })).rejects.toThrow(/ambiente/);
  });

  it('acesso negado e falta de resposta', async () => {
    const negado = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: falso([{ metodo: 'POST', url: /nfsen/, status: 401, corpo: 'HTTP Basic: Access denied.' }]).f });
    await expect(negado.emitirNfse(NFSE, CRED)).rejects.toMatchObject({ codigo: 'acesso_negado', status: 401 });
    const fora = criarFocus({
      tokenConta: 'conta',
      segredoWebhook: null,
      urlWebhook: WEBHOOK,
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch
    });
    await expect(fora.emitirNfse(NFSE, CRED)).rejects.toMatchObject({ codigo: 'sem_resposta', status: null });
  });
});

describe('Focus NFe: consulta e cancelamento', () => {
  it('NFS-e Nacional autorizada: número, PDF, XML e a chave de acesso', async () => {
    const { f, chamadas } = falso([{ metodo: 'GET', url: `${H}/v2/nfsen/rv-nfsen-7f3a9c2e-abcdefghjkmn`, status: 200, corpo: NFSEN_AUTORIZADA }]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    expect(await focus.consultar('nfse', 'rv-nfsen-7f3a9c2e-abcdefghjkmn', 'homologacao', CRED)).toEqual({
      externo: 'rv-nfsen-7f3a9c2e-abcdefghjkmn',
      situacao: 'autorizada',
      numero: '74798',
      serie: '1',
      chave: '42054072212345678000123000000007479826039913594189',
      urlPdf: NFSEN_AUTORIZADA.url_danfse,
      urlXml: `${H}${NFSEN_AUTORIZADA.caminho_xml_nota_fiscal}`,
      mensagem: null
    });
    expect(chamadas[0].autorizacao).toBe(basic('tok-homol'));
  });

  it('NF-e autorizada e recusada; nota desconhecida', async () => {
    const { f } = falso([
      { metodo: 'GET', url: `${P}/v2/nfe/rv-nfe-7f3a9c2e-abcdefghjkmn`, status: 200, corpo: NFE_AUTORIZADA },
      {
        metodo: 'GET',
        url: `${P}/v2/nfe/rv-nfe-x-recusada`,
        status: 200,
        corpo: {
          cnpj_emitente: '12345678000123',
          ref: 'rv-nfe-x-recusada',
          status: 'erro_autorizacao',
          status_sefaz: '598',
          mensagem_sefaz: 'Rejeição: Total da NF difere do somatório dos valores que compõe o valor total da NF',
          erros: [{ codigo: '', mensagem: 'Total da NF difere do somatório dos valores que compõe o valor total da NF' }]
        }
      },
      { metodo: 'GET', url: `${P}/v2/nfe/rv-nfe-x-sumiu`, status: 404, corpo: { codigo: 'nao_encontrado', mensagem: 'Nota fiscal não encontrada' } }
    ]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    expect(await focus.consultar('nfe', 'rv-nfe-7f3a9c2e-abcdefghjkmn', 'producao', CRED)).toEqual({
      externo: 'rv-nfe-7f3a9c2e-abcdefghjkmn',
      situacao: 'autorizada',
      numero: '22',
      serie: '1',
      chave: '41190612345678000123550010000000221923094166',
      urlPdf: `${P}${NFE_AUTORIZADA.caminho_danfe}`,
      urlXml: `${P}${NFE_AUTORIZADA.caminho_xml_nota_fiscal}`,
      mensagem: 'Autorizado o uso da NF-e'
    });
    expect(await focus.consultar('nfe', 'rv-nfe-x-recusada', 'producao', CRED)).toMatchObject({
      situacao: 'erro',
      mensagem: 'Total da NF difere do somatório dos valores que compõe o valor total da NF'
    });
    expect(await focus.consultar('nfe', 'rv-nfe-x-sumiu', 'producao', CRED)).toBeNull();
  });

  it('cancela com a justificativa; o fora do prazo e a justificativa curta viram erro', async () => {
    const { f, chamadas } = falso([
      { metodo: 'DELETE', url: `${H}/v2/nfsen/rv-nfsen-a-b`, status: 200, corpo: { status: 'cancelado' } },
      { metodo: 'DELETE', url: `${H}/v2/nfsen/rv-nfsen-a-c`, status: 200, corpo: { status: 'erro_cancelamento', erros: [{ codigo: 'V999', mensagem: 'NFSe fora do prazo de cancelamento permitido', correcao: null }] } },
      { metodo: 'DELETE', url: `${P}/v2/nfe/rv-nfe-a-d`, status: 400, corpo: { codigo: 'requisicao_invalida', mensagem: 'Parâmetro "justificativa" deve ter entre 15 e 255 caracteres.' } },
      { metodo: 'DELETE', url: `${P}/v2/nfe/rv-nfe-a-e`, status: 200, corpo: { status: 'cancelado', status_sefaz: '135', mensagem_sefaz: 'Evento registrado e vinculado a NF-e' } }
    ]);
    const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK, fetch: f });
    expect(await focus.cancelar('nfse', 'rv-nfsen-a-b', 'homologacao', 'Emissão em duplicidade', CRED)).toMatchObject({ situacao: 'cancelada' });
    expect(chamadas[0].corpo).toEqual({ justificativa: 'Emissão em duplicidade' });
    await expect(focus.cancelar('nfse', 'rv-nfsen-a-c', 'homologacao', 'Emissão em duplicidade', CRED)).rejects.toThrow('NFSe fora do prazo de cancelamento permitido');
    await expect(focus.cancelar('nfe', 'rv-nfe-a-d', 'producao', 'curta', CRED)).rejects.toThrow(/15 e 255/);
    expect(await focus.cancelar('nfe', 'rv-nfe-a-e', 'producao', 'Cliente desistiu da compra', CRED)).toMatchObject({ situacao: 'cancelada', mensagem: 'Evento registrado e vinculado a NF-e' });
  });
});

describe('Focus NFe: avisos (gatilhos)', () => {
  const focus = criarFocus({ tokenConta: 'conta', segredoWebhook: 'segredo-dos-avisos', urlWebhook: WEBHOOK });
  const pedido = (h: Record<string, string>) => ({ cabecalhos: new Headers(h), url: new URL(`${WEBHOOK}?ambiente=homologacao`), corpo: '{}' });

  it('aceita só o aviso com o segredo combinado', () => {
    expect(focus.validarWebhook(pedido({ [CABECALHO_AVISO]: 'segredo-dos-avisos' }))).toBe(true);
    expect(focus.validarWebhook(pedido({ authorization: 'segredo-dos-avisos' }))).toBe(true);
    expect(focus.validarWebhook(pedido({ [CABECALHO_AVISO]: 'outro' }))).toBe(false);
    expect(focus.validarWebhook(pedido({}))).toBe(false);
    const semSegredo = criarFocus({ tokenConta: 'conta', segredoWebhook: null, urlWebhook: WEBHOOK });
    expect(semSegredo.validarWebhook(pedido({ [CABECALHO_AVISO]: '' }))).toBe(false);
  });

  it('lê o aviso no formato da consulta, com os arquivos no servidor do ambiente', () => {
    const e = focus.lerEvento(NFSEN_AUTORIZADA, new URL(`${WEBHOOK}?ambiente=homologacao`));
    expect(e).toMatchObject({ tipo: 'nfse', nota: { externo: NFSEN_AUTORIZADA.ref, situacao: 'autorizada', numero: '74798', urlXml: `${H}${NFSEN_AUTORIZADA.caminho_xml_nota_fiscal}` } });
    expect(e?.id).toBe(`focus:${NFSEN_AUTORIZADA.ref}:autorizado:74798:`);
    const nfe = focus.lerEvento(NFE_AUTORIZADA, new URL(`${WEBHOOK}?ambiente=producao`));
    expect(nfe).toMatchObject({ tipo: 'nfe', nota: { urlPdf: `${P}${NFE_AUTORIZADA.caminho_danfe}` } });
    // sem o ambiente no endereço, os caminhos relativos ficam de fora (a consulta completa depois)
    expect(focus.lerEvento(NFE_AUTORIZADA)?.nota.urlXml).toBeNull();
    expect(focus.lerEvento({ ref: 'x', status: 'desconhecido' })).toBeNull();
    expect(focus.lerEvento('lixo')).toBeNull();
  });

  it('a mensagem de erro junta o que a Focus mandou', () => {
    expect(mensagemDaFocus({ codigo: 'nao_encontrado', mensagem: 'Empresa não encontrada' })).toBe('Empresa não encontrada');
    expect(mensagemDaFocus({ erros: [{ codigo: 'parametros_invalidos', mensagem: 'CNPJ inválido' }] })).toBe('CNPJ inválido');
    expect(mensagemDaFocus(null, 'padrão')).toBe('padrão');
    expect(notaDaFocus({ ref: 'r', status: 'negado' }, null)?.situacao).toBe('erro');
  });
});

describe('emissor de teste', () => {
  it('fica processando até o aviso, que precisa do segredo', async () => {
    const t = criarTesteFiscal('segredo-local');
    expect(await t.emitirNfse(NFSE, { empresaId: 'x' })).toEqual({ externo: NFSE.referencia, situacao: 'processando' });
    expect(t.validarWebhook({ cabecalhos: new Headers({ 'x-teste-segredo': 'segredo-local' }), url: new URL('http://x'), corpo: '' })).toBe(true);
    expect(t.validarWebhook({ cabecalhos: new Headers({ 'x-teste-segredo': 'outro' }), url: new URL('http://x'), corpo: '' })).toBe(false);
    expect(eventoTeste({ id: 'evt_1', externo: NFSE.referencia, situacao: 'autorizada', numero: 7 })).toEqual({
      id: 'teste:evt_1',
      tipo: 'nfse',
      nota: { externo: NFSE.referencia, situacao: 'autorizada', numero: '7', serie: null, chave: null, urlPdf: `https://example.com/revisai-fiscal/${NFSE.referencia}.pdf`, urlXml: `https://example.com/revisai-fiscal/${NFSE.referencia}.xml`, mensagem: null }
    });
    expect(eventoTeste({ id: 'evt_2', externo: 'rv-nfe-a-b', situacao: 'erro', mensagem: 'Recusada' })).toMatchObject({ tipo: 'nfe', nota: { situacao: 'erro', urlPdf: null, mensagem: 'Recusada' } });
    expect(eventoTeste({ id: 'evt_3', externo: 'x', situacao: 'outra' })).toBeNull();
    await expect(t.enviarCertificado({ empresaId: 'x' }, '1', 'curto', 'senha')).rejects.toThrow(/certificado/);
    expect((await t.enviarCertificado({ empresaId: 'x' }, '1', 'MIIQ'.repeat(10), 'senha')).validoAte).toMatch(/^\d{4}-/);
  });
});
