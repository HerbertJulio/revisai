import { describe, expect, it, vi } from 'vitest';
import { credenciaisGuardadas, credenciaisParaGuardar, cifrar, decifrar } from '@/lib/fiscal/cripto';
import { lerNotaFiscal, notasDaOrdem, podeCancelar, resumoDaNota, resumoMudou, type NotaFiscal } from '@/lib/fiscal/dados';
import {
  configParaSalvar,
  dataEmissaoBrasilia,
  descricaoDoServico,
  esquemaAjustesFiscais,
  formatarEndereco,
  lerConfigFiscal,
  lerEndereco,
  montarNfe,
  montarNfse,
  novaReferencia,
  partesDaOrdem,
  pecasDaOrdem,
  problemaDoTomador,
  rotaDaReferencia,
  situacaoDoIcms,
  type ConfigFiscal
} from '@/lib/fiscal/payload';
import { ErroFiscal, type Tomador } from '@/lib/fiscal/tipos';
import type { Documento, ItemEstoque, LinhaDocumento } from '@/lib/tipos';

vi.mock('server-only', () => ({}));

function linha(p: Partial<LinhaDocumento>): LinhaDocumento {
  return { id: Math.random().toString(36).slice(2), tipo: 'servico', descricao: 'x', quantidade: 1, unidade: 'un', valorUnitario: 0, ...p };
}

const DOC: Documento = {
  id: 'os-1',
  numero: 12,
  tipo: 'ordem',
  situacao: 'concluida',
  veiculoId: 'v1',
  km: 1,
  data: '2026-10-17',
  linhas: [
    linha({ id: 'l1', tipo: 'servico', servico: 'troca_oleo', descricao: 'Troca de óleo', valorUnitario: 80 }),
    linha({ id: 'l2', tipo: 'peca', servico: 'troca_oleo', descricao: 'Óleo 5W30', quantidade: 4, unidade: 'L', valorUnitario: 40, estoqueId: 'e1' }),
    linha({ id: 'l3', tipo: 'peca', descricao: 'Filtro de óleo', valorUnitario: 40, estoqueId: 'e2' }),
    linha({ id: 'l4', tipo: 'servico', descricao: 'Alinhamento', valorUnitario: 120 }),
    linha({ id: 'l5', tipo: 'peca', descricao: 'Pastilha', valorUnitario: 300, recusada: true })
  ],
  desconto: 40,
  criadoEm: '',
  atualizadoEm: ''
};

const ESTOQUE = {
  e1: { id: 'e1', nome: 'Óleo', ncm: '27101932', codigo: 'OL-5W30' },
  e2: { id: 'e2', nome: 'Filtro', ncm: '8421.23.00', ean: '7891234567895' }
} as unknown as Record<string, ItemEstoque>;

const CONFIG: ConfigFiscal = lerConfigFiscal({
  provedor: 'focus',
  provedor_empresa_id: '123',
  cnpj: '11222333000181',
  razao_social: 'Auto Center Ltda',
  regime: 'simples',
  inscricao_municipal: '12345',
  inscricao_estadual: '87654321',
  codigo_municipio: '3304557',
  padrao_nfse: 'nacional',
  codigo_servico: '14.01',
  codigo_tributacao_nacional: '140101',
  codigo_tributacao_municipal: null,
  aliquota_iss: '2.00',
  cnae: '4520001',
  opcoes: { pecasComSubstituicao: true, pisCofins: '49' },
  ambiente: 'homologacao',
  certificado_valido_ate: null,
  atualizado_em: '2026-10-17T10:00:00Z'
})!;

const TOMADOR: Tomador = {
  nome: ' Ana Souza ',
  documento: '529.982.247-25',
  email: 'ana@exemplo.com',
  endereco: { logradouro: 'Rua das Flores', numero: '10', bairro: 'Centro', municipio: 'Rio de Janeiro', uf: 'RJ', cep: '20000000', codigoMunicipio: '3304557' }
};

const AGORA = new Date('2026-10-17T15:30:00Z');

describe('cadastro fiscal', () => {
  const valido = {
    cnpj: '11.222.333/0001-81',
    razaoSocial: 'Auto Center Ltda',
    regime: 'simples',
    inscricaoMunicipal: '12345',
    email: 'fiscal@autocenter.com',
    endereco: { cep: '20000-000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', municipio: 'Rio de Janeiro', uf: 'rj', codigoMunicipio: '3304557' },
    aliquotaIss: '2,5',
    cnae: '4520-0/01'
  };

  it('confere e completa com os padrões da manutenção de veículos', () => {
    const r = esquemaAjustesFiscais.safeParse(valido);
    expect(r.success).toBe(true);
    const a = r.data!;
    expect(a).toMatchObject({ cnpj: '11222333000181', codigoServico: '14.01', codigoTributacaoNacional: '140101', aliquotaIss: 2.5, cnae: '4520001', ambiente: 'homologacao', padraoNfse: 'nacional', pecasComSubstituicao: true, pisCofins: '49' });
    expect(a.endereco).toMatchObject({ cep: '20000000', uf: 'RJ', complemento: null });
    const salvo = configParaSalvar(a, 'focus', '123');
    expect(salvo).toMatchObject({ provedor: 'focus', provedorEmpresaId: '123', codigoMunicipio: '3304557', opcoes: { pecasComSubstituicao: true, pisCofins: '49', ibsCbs: null, email: 'fiscal@autocenter.com' } });
  });

  it('explica o que está errado', () => {
    const erro = (v: object) => esquemaAjustesFiscais.safeParse({ ...valido, ...v }).error?.issues[0]?.message;
    expect(erro({ cnpj: '11.222.333/0001-82' })).toMatch(/CNPJ/);
    expect(erro({ aliquotaIss: '7' })).toMatch(/ISS/);
    expect(erro({ cnae: '452' })).toMatch(/CNAE/);
    expect(erro({ endereco: { ...valido.endereco, codigoMunicipio: '' } })).toMatch(/IBGE/);
    expect(erro({ padraoNfse: 'municipal', inscricaoMunicipal: '' })).toMatch(/inscrição municipal/);
    expect(erro({ ibsCbsSituacao: '000' })).toMatch(/IBS\/CBS/);
  });

  it('lê a linha do banco', () => {
    expect(CONFIG).toMatchObject({ provedor: 'focus', regime: 'simples', aliquotaIss: 2, padraoNfse: 'nacional', ambiente: 'homologacao' });
    expect(CONFIG.opcoes.ibsCbs).toBeNull();
    expect(lerConfigFiscal({ provedor: 'outro' })).toBeNull();
  });
});

describe('endereço e tomador', () => {
  it('escreve e lê de volta o endereço do cliente', () => {
    const e = { logradouro: 'Rua das Flores', numero: '10', complemento: 'fundos', bairro: 'Centro', municipio: 'Rio de Janeiro', uf: 'RJ', cep: '20000000' };
    const t = formatarEndereco(e);
    expect(t).toBe('Rua das Flores, 10, fundos - Centro, Rio de Janeiro/RJ, CEP 20000-000');
    expect(lerEndereco(t)).toEqual(e);
    expect(lerEndereco('Rua A, 5 - Niterói/RJ')).toEqual({ logradouro: 'Rua A', numero: '5', municipio: 'Niterói', uf: 'RJ' });
    expect(lerEndereco('')).toEqual({});
  });

  it('confere o tomador; na NF-e o endereço é obrigatório', () => {
    expect(problemaDoTomador(TOMADOR, true)).toBeNull();
    expect(problemaDoTomador({ ...TOMADOR, documento: '123' }, false)).toMatch(/CPF ou o CNPJ/);
    expect(problemaDoTomador({ ...TOMADOR, endereco: null }, false)).toBeNull();
    expect(problemaDoTomador({ ...TOMADOR, endereco: null }, true)).toMatch(/endereço/);
    expect(problemaDoTomador({ ...TOMADOR, email: 'x' }, false)).toMatch(/e-mail/);
  });
});

describe('partes da ordem', () => {
  it('divide o desconto entre a mão de obra e as peças', () => {
    // peças 160 + 40 = 200; mão de obra 80 + 120 = 200; desconto 40 → 20 para cada
    expect(partesDaOrdem(DOC)).toEqual({ pecas: 200, servicos: 200, desconto: 40, descontoPecas: 20, descontoServicos: 20, valorNfse: 180, valorNfe: 180 });
    expect(partesDaOrdem({ linhas: [linha({ valorUnitario: 100 })], desconto: null }).valorNfe).toBe(0);
  });

  it('descreve o serviço e lista as peças com o NCM do estoque', () => {
    expect(descricaoDoServico(DOC, { modelo: 'Gol', placa: 'ABC1D23' })).toBe('Mão de obra da OS nº 12: Troca de óleo e Alinhamento. Veículo Gol, placa ABC1D23.');
    expect(pecasDaOrdem(DOC, ESTOQUE)).toEqual([
      { linhaId: 'l2', descricao: 'Óleo 5W30', quantidade: 4, valor: 160, ncm: '27101932', estoqueId: 'e1' },
      { linhaId: 'l3', descricao: 'Filtro de óleo', quantidade: 1, valor: 40, ncm: '84212300', estoqueId: 'e2' }
    ]);
  });

  it('a referência diz a rota e a data vai no horário de Brasília', () => {
    const ref = novaReferencia('nfsen', '7f3a9c2e-0000-4000-8000-000000000000', () => 0);
    expect(ref).toBe('rv-nfsen-7f3a9c2e-aaaaaaaaaaaa');
    expect(ref).toMatch(/^[A-Za-z0-9_-]{6,80}$/);
    expect(rotaDaReferencia(ref)).toBe('nfsen');
    expect(rotaDaReferencia('rv-nfe-x-y')).toBe('nfe');
    expect(rotaDaReferencia('outra')).toBeNull();
    expect(dataEmissaoBrasilia(AGORA)).toBe('2026-10-17T12:30:00-03:00');
  });
});

describe('NFS-e', () => {
  it('monta a nota da mão de obra com o tomador e os códigos do cadastro', () => {
    const n = montarNfse({ config: CONFIG, doc: DOC, tomador: TOMADOR, referencia: 'rv-nfsen-a-b', agora: AGORA, descricao: 'Mão de obra da OS nº 12' });
    expect(n).toEqual({
      referencia: 'rv-nfsen-a-b',
      ambiente: 'homologacao',
      padrao: 'nacional',
      dataEmissao: '2026-10-17T12:30:00-03:00',
      competencia: '2026-10-17',
      prestador: { cnpj: '11222333000181', regime: 'simples', inscricaoMunicipal: '12345', codigoMunicipio: '3304557' },
      tomador: { ...TOMADOR, nome: 'Ana Souza', documento: '52998224725' },
      servico: { descricao: 'Mão de obra da OS nº 12', valor: 180, itemListaServico: '14.01', codigoTributacaoNacional: '140101', codigoTributacaoMunicipal: null, aliquotaIss: 2, cnae: '4520001' },
      ibsCbs: null
    });
  });

  it('não monta sem mão de obra ou com o tomador errado', () => {
    const soPecas = { ...DOC, linhas: DOC.linhas.filter((l) => l.tipo === 'peca') };
    expect(() => montarNfse({ config: CONFIG, doc: soPecas, tomador: TOMADOR, referencia: 'r', agora: AGORA, descricao: '' })).toThrow(ErroFiscal);
    expect(() => montarNfse({ config: CONFIG, doc: DOC, tomador: { ...TOMADOR, nome: '' }, referencia: 'r', agora: AGORA, descricao: '' })).toThrow(/nome/);
    expect(() => montarNfse({ config: { ...CONFIG, codigoMunicipio: null }, doc: DOC, tomador: TOMADOR, referencia: 'r', agora: AGORA, descricao: '' })).toThrow(/IBGE/);
  });
});

describe('NF-e', () => {
  it('monta a nota das peças: NCM, CFOP 5405 com CSOSN 500 e o desconto nas peças', () => {
    const n = montarNfe({ config: CONFIG, doc: DOC, tomador: TOMADOR, escolhas: [{ linhaId: 'l3', ncm: '84212300', cfop: '5102' }], estoque: ESTOQUE, referencia: 'rv-nfe-a-b', agora: AGORA });
    expect(n.valorProdutos).toBe(200);
    expect(n.valorDesconto).toBe(20);
    expect(n.valorTotal).toBe(180);
    expect(n.formaPagamento).toBe('17');
    expect(n.emitente).toEqual({ cnpj: '11222333000181', regime: 'simples', inscricaoEstadual: '87654321' });
    expect(n.itens).toEqual([
      { numero: 1, codigo: 'OL-5W30', descricao: 'Óleo 5W30', ncm: '27101932', cfop: '5405', unidade: 'L', quantidade: 4, valorUnitario: 40, valorBruto: 160, valorDesconto: 16, icms: { situacao: '500', origem: 0 }, pis: '49', cofins: '49' },
      { numero: 2, codigo: '7891234567895', descricao: 'Filtro de óleo', ncm: '84212300', cfop: '5102', unidade: 'UN', quantidade: 1, valorUnitario: 40, valorBruto: 40, valorDesconto: 4, icms: { situacao: '102', origem: 0 }, pis: '49', cofins: '49' }
    ]);
  });

  it('no regime normal sem substituição, calcula o ICMS com a alíquota do cadastro', () => {
    const normal = { ...CONFIG, regime: 'normal' as const, opcoes: { ...CONFIG.opcoes, pecasComSubstituicao: false, aliquotaIcms: 18 } };
    const n = montarNfe({ config: normal, doc: { ...DOC, desconto: 0 }, tomador: TOMADOR, escolhas: [], estoque: ESTOQUE, referencia: 'r', agora: AGORA });
    expect(n.itens[0].icms).toEqual({ situacao: '00', origem: 0, base: 160, aliquota: 18, valor: 28.8 });
    expect(situacaoDoIcms('normal', '5405')).toBe('60');
    expect(situacaoDoIcms('mei', '5102')).toBe('102');
    expect(() => montarNfe({ config: { ...normal, opcoes: { ...normal.opcoes, aliquotaIcms: null } }, doc: DOC, tomador: TOMADOR, escolhas: [], estoque: ESTOQUE, referencia: 'r', agora: AGORA })).toThrow(/alíquota do ICMS/);
  });

  it('pede o NCM, o preço e o endereço', () => {
    const semNcm = { e1: { id: 'e1' }, e2: { id: 'e2' } } as unknown as Record<string, ItemEstoque>;
    expect(() => montarNfe({ config: CONFIG, doc: DOC, tomador: TOMADOR, escolhas: [], estoque: semNcm, referencia: 'r', agora: AGORA })).toThrow(/NCM/);
    const semPreco = { ...DOC, linhas: [...DOC.linhas, linha({ tipo: 'peca', valorUnitario: null, descricao: 'Correia' })] };
    expect(() => montarNfe({ config: CONFIG, doc: semPreco, tomador: TOMADOR, escolhas: [], estoque: ESTOQUE, referencia: 'r', agora: AGORA })).toThrow(/sem preço/);
    expect(() => montarNfe({ config: CONFIG, doc: DOC, tomador: { ...TOMADOR, endereco: null }, escolhas: [], estoque: ESTOQUE, referencia: 'r', agora: AGORA })).toThrow(/endereço/);
  });
});

describe('notas no app', () => {
  const base = {
    id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
    documento_id: 'os-1',
    tipo: 'nfse',
    provedor: 'teste',
    externo: 'rv-nfsen-a-b',
    ambiente: 'homologacao',
    situacao: 'autorizada',
    numero: '42',
    url_pdf: 'https://example.com/n.pdf',
    valor: '180.00',
    tomador: { nome: 'Ana' },
    autorizada_em: '2026-10-17T15:00:00Z',
    criado_em: '2026-10-17T14:59:00Z',
    atualizado_em: '2026-10-17T15:00:00Z'
  };

  it('lê a nota, escolhe a mais nova de cada tipo e resume na ordem', () => {
    const n = lerNotaFiscal(base)!;
    expect(n).toMatchObject({ tipo: 'nfse', situacao: 'autorizada', numero: '42', valor: 180, urlPdf: 'https://example.com/n.pdf', serie: null });
    const antiga = lerNotaFiscal({ ...base, id: 'x', situacao: 'erro', criado_em: '2026-10-17T14:00:00Z' })!;
    const nfe = lerNotaFiscal({ ...base, id: 'y', tipo: 'nfe', numero: '7' })!;
    const outra = lerNotaFiscal({ ...base, id: 'z', documento_id: 'os-2' })!;
    const doc = notasDaOrdem([antiga, n, nfe, outra], 'os-1');
    expect(doc.nfse?.id).toBe(n.id);
    expect(doc.nfe?.id).toBe('y');
    const resumo = resumoDaNota(doc);
    expect(resumo).toEqual({ situacao: 'autorizada', numero: '42', url: 'https://example.com/n.pdf', chave: null, mensagem: null });
    expect(resumoDaNota({ nfe })?.numero).toBe('7');
    expect(resumoDaNota({})).toBeNull();
    expect(resumoMudou(resumo, { ...resumo! })).toBe(false);
    expect(resumoMudou(resumo, { ...resumo!, situacao: 'cancelada' })).toBe(true);
    expect(resumoMudou(undefined, null)).toBe(false);
    expect(lerNotaFiscal({ ...base, situacao: 'outra' })).toBeNull();
  });

  it('o cancelamento: a NF-e em até 24 horas, a NFS-e enquanto autorizada', () => {
    const nfe: Pick<NotaFiscal, 'tipo' | 'situacao' | 'autorizadaEm'> = { tipo: 'nfe', situacao: 'autorizada', autorizadaEm: '2026-10-17T15:00:00Z' };
    expect(podeCancelar(nfe, new Date('2026-10-18T14:59:00Z'))).toBe(true);
    expect(podeCancelar(nfe, new Date('2026-10-18T15:01:00Z'))).toBe(false);
    expect(podeCancelar({ ...nfe, tipo: 'nfse' }, new Date('2026-12-01T00:00:00Z'))).toBe(true);
    expect(podeCancelar({ ...nfe, situacao: 'processando' })).toBe(false);
  });
});

describe('tokens das empresas cifrados', () => {
  const chave = Buffer.alloc(32, 7);

  it('cifra e decifra; outra chave não abre', () => {
    const c = cifrar('token-secreto', chave);
    expect(c).toMatch(/^v1\./);
    expect(c).not.toContain('token-secreto');
    expect(decifrar(c, chave)).toBe('token-secreto');
    expect(decifrar(c, Buffer.alloc(32, 8))).toBeNull();
    expect(decifrar('lixo', chave)).toBeNull();
  });

  it('as credenciais vão e voltam do banco', () => {
    const guardar = credenciaisParaGuardar({ empresaId: '123', tokens: { producao: 'tp', homologacao: 'th' } }, chave);
    expect(JSON.stringify(guardar)).not.toContain('"tp"');
    expect(credenciaisGuardadas(JSON.parse(JSON.stringify(guardar)), chave)).toEqual({ empresaId: '123', tokens: { producao: 'tp', homologacao: 'th' } });
    expect(credenciaisGuardadas(guardar, null)).toEqual({ empresaId: '123', tokens: { producao: null, homologacao: null } });
    expect(credenciaisGuardadas(null, chave)).toBeNull();
  });
});

describe('emissor configurado pelo ambiente', () => {
  it('Focus com token e chave; teste só fora de produção; sem nada, desligado', async () => {
    const { configFocus, provedorFiscalDoAmbiente, testeFiscalLigado, chaveFiscal } = await import('@/lib/fiscal');
    const chave = 'x'.repeat(32);
    expect(provedorFiscalDoAmbiente({})).toBeNull();
    expect(configFocus({ FOCUS_NFE_TOKEN: 'tok' })).toBeNull();
    expect(configFocus({ FOCUS_NFE_TOKEN: 'tok', FISCAL_CHAVE: chave, SITE_URL: 'https://revisai.app/' })).toEqual({ tokenConta: 'tok', segredoWebhook: null, urlWebhook: 'https://revisai.app/api/fiscal/focus' });
    expect(provedorFiscalDoAmbiente({ FOCUS_NFE_TOKEN: 'tok', FISCAL_CHAVE: chave })?.nome).toBe('focus');
    expect(provedorFiscalDoAmbiente({ FISCAL_PROVEDOR: 'teste', NODE_ENV: 'development' })?.nome).toBe('teste');
    expect(testeFiscalLigado({ FISCAL_PROVEDOR: 'teste', NODE_ENV: 'production' })).toBe(false);
    expect(testeFiscalLigado({ FISCAL_PROVEDOR: 'teste', VERCEL_ENV: 'production' })).toBe(false);
    expect(provedorFiscalDoAmbiente({ FISCAL_PROVEDOR: 'teste', NODE_ENV: 'production', FOCUS_NFE_TOKEN: 'tok', FISCAL_CHAVE: chave })).toBeNull();
    expect(chaveFiscal({ FISCAL_CHAVE: 'curta' })).toBeNull();
    expect(chaveFiscal({ FISCAL_CHAVE: chave })?.length).toBe(32);
  });
});
