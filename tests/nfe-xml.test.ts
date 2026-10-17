import { describe, expect, it } from 'vitest';
import {
  casarItem,
  casarNota,
  categoriaSugerida,
  chaveValida,
  cnpjDaChave,
  contasDaNota,
  custoPorUnidade,
  fatorSugerido,
  fornecedoresDosItens,
  idDaParcela,
  lerNotaFiscal,
  litrosNoNome,
  notaJaLancada,
  palavrasDoProduto,
  semelhanca,
  unidadesNoNome,
  type NotaFiscal
} from '../lib/nfe-xml';
import type { ItemEstoque, MovimentoEstoque } from '../lib/tipos';

// ---------------------------------------------------------------- um leitor de XML pequeno para o Node
// (no navegador a leitura usa o DOMParser; aqui, o mínimo do DOM que lib/nfe-xml.ts usa)

class El {
  children: El[] = [];
  private textos: (string | El)[] = [];
  constructor(
    public tagName: string,
    private atributos: Record<string, string>
  ) {}
  get localName() {
    return this.tagName.includes(':') ? this.tagName.split(':')[1] : this.tagName;
  }
  get textContent(): string {
    return this.textos.map((t) => (typeof t === 'string' ? t : t.textContent)).join('');
  }
  getAttribute(n: string) {
    return this.atributos[n] ?? null;
  }
  getElementsByTagNameNS(_ns: string, nome: string): El[] {
    const r: El[] = [];
    const visitar = (e: El) => {
      for (const c of e.children) {
        if (nome === '*' || c.localName === nome) r.push(c);
        visitar(c);
      }
    };
    visitar(this);
    return r;
  }
  add(x: string | El) {
    this.textos.push(x);
    if (typeof x !== 'string') this.children.push(x);
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodificar(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e] ?? m)
  );
}

function lerXml(xml: string) {
  const raiz = new El('#document', {});
  const pilha: El[] = [raiz];
  let i = 0;
  const erro = () => {
    const doc = new El('#document', {});
    doc.add(new El('parsererror', {}));
    return doc;
  };
  while (i < xml.length) {
    if (xml.startsWith('<?', i)) i = xml.indexOf('?>', i) + 2;
    else if (xml.startsWith('<!--', i)) i = xml.indexOf('-->', i) + 3;
    else if (xml.startsWith('<![CDATA[', i)) {
      const fim = xml.indexOf(']]>', i);
      pilha.at(-1)!.add(xml.slice(i + 9, fim));
      i = fim + 3;
    } else if (xml.startsWith('</', i)) {
      const fim = xml.indexOf('>', i);
      const nome = xml.slice(i + 2, fim).trim();
      const atual = pilha.pop();
      if (!atual || atual.tagName !== nome) return embrulhar(erro());
      i = fim + 1;
    } else if (xml[i] === '<') {
      const fim = xml.indexOf('>', i);
      if (fim < 0) return embrulhar(erro());
      let corpo = xml.slice(i + 1, fim);
      const fecha = corpo.endsWith('/');
      if (fecha) corpo = corpo.slice(0, -1);
      const nome = corpo.match(/^[^\s/>]+/)?.[0] ?? '';
      const atributos: Record<string, string> = {};
      for (const a of corpo.slice(nome.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) atributos[a[1]] = decodificar(a[3] ?? a[4] ?? '');
      const el = new El(nome, atributos);
      pilha.at(-1)!.add(el);
      if (!fecha) pilha.push(el);
      i = fim + 1;
    } else {
      const fim = xml.indexOf('<', i);
      const t = xml.slice(i, fim < 0 ? xml.length : fim);
      if (pilha.length > 1) pilha.at(-1)!.add(decodificar(t));
      else if (t.trim()) return embrulhar(erro());
      i = fim < 0 ? xml.length : fim;
    }
  }
  return embrulhar(pilha.length === 1 ? raiz : erro());
}

function embrulhar(raiz: El) {
  return {
    documentElement: raiz.children[0] ?? null,
    getElementsByTagName: (n: string) => raiz.getElementsByTagNameNS('*', n),
    getElementsByTagNameNS: (ns: string, n: string) => raiz.getElementsByTagNameNS(ns, n)
  };
}

const ler = (xml: string) => lerNotaFiscal(xml, lerXml);

// ---------------------------------------------------------------- a nota de exemplo

const CHAVE = '33261012345678000195550010000123451123456780';

function det(n: number, prod: string, imposto = '') {
  return `<det nItem="${n}"><prod>${prod}</prod><imposto><vTotTrib>0.00</vTotTrib>${imposto}</imposto></det>`;
}

const NOTA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${CHAVE}" versao="4.00">
      <ide>
        <cUF>33</cUF><cNF>12345678</cNF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>12345</nNF>
        <dhEmi>2026-10-10T10:20:30-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3301900</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis>
        <cDV>0</cDV><tpAmb>1</tpAmb><finNFe>1</finNFe><indFinal>0</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>1.0</verProc>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ><xNome>DISTRIBUIDORA SERRA COMERCIO DE PECAS LTDA</xNome><xFant>DISTRIBUIDORA SERRA</xFant>
        <enderEmit><xLgr>RUA DAS OFICINAS</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>3301900</cMun><xMun>GUAPIMIRIM</xMun><UF>RJ</UF><CEP>25940000</CEP></enderEmit>
        <IE>12345678</IE><CRT>3</CRT>
      </emit>
      <dest><CNPJ>11222333000181</CNPJ><xNome>AUTO CENTER TESTE</xNome><indIEDest>9</indIEDest></dest>
      ${det(
        1,
        '<cProd>LUB-5W30-20</cProd><cEAN>7891000315507</cEAN><xProd>OLEO MOTOR LUBRAX 5W30 SINTETICO BALDE 20L</xProd><NCM>27101932</NCM><CFOP>5102</CFOP><uCom>BD</uCom><qCom>2.0000</qCom><vUnCom>620.0000000000</vUnCom><vProd>1240.00</vProd><cEANTrib>7891000315507</cEANTrib><uTrib>L</uTrib><qTrib>40.0000</qTrib><vUnTrib>31.0000000000</vUnTrib><vDesc>40.00</vDesc><indTot>1</indTot>',
        '<ICMS><ICMS10><orig>0</orig><CST>10</CST><vICMSST>60.00</vICMSST></ICMS10></ICMS>'
      )}
      ${det(
        2,
        '<cProd>PSL55</cProd><cEAN>SEM GTIN</cEAN><xProd>FILTRO OLEO TECFIL PSL55</xProd><NCM>84212300</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>18.5000000000</vUnCom><vProd>185.00</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>10.0000</qTrib><vUnTrib>18.5000000000</vUnTrib><vFrete>5.00</vFrete><indTot>1</indTot>',
        '<IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>185.00</vBC><pIPI>5.0000</pIPI><vIPI>9.25</vIPI></IPITrib></IPI>'
      )}
      ${det(
        3,
        '<cProd>BKR6E</cProd><cEAN>7891234567895</cEAN><xProd>VELA IGNICAO NGK BKR6E JOGO C/4</xProd><NCM>85111000</NCM><CFOP>5405</CFOP><uCom>JG</uCom><qCom>3.0000</qCom><vUnCom>96.0000000000</vUnCom><vProd>288.00</vProd><indTot>1</indTot>'
      )}
      ${det(
        4,
        '<cProd>ARL4152</cProd><cEAN></cEAN><xProd>FILTRO DE AR TECFIL ARL4152 &amp; VEDACAO</xProd><NCM>84213100</NCM><CFOP>5102</CFOP><uCom>PC</uCom><qCom>4.0000</qCom><vUnCom>32.9000000000</vUnCom><vProd>131.60</vProd><indTot>1</indTot>'
      )}
      <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vST>60.00</vST><vProd>1844.60</vProd><vFrete>5.00</vFrete><vDesc>40.00</vDesc><vIPI>9.25</vIPI><vNF>1878.85</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete></transp>
      <cobr>
        <fat><nFat>12345</nFat><vOrig>1878.85</vOrig><vDesc>0.00</vDesc><vLiq>1878.85</vLiq></fat>
        <dup><nDup>001</nDup><dVenc>2026-11-09</dVenc><vDup>939.43</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-12-09</dVenc><vDup>939.42</vDup></dup>
      </cobr>
      <pag><detPag><tPag>15</tPag><vPag>1878.85</vPag></detPag></pag>
      <infAdic><infCpl>PEDIDO 998 <![CDATA[entregar pela manhã]]></infCpl></infAdic>
    </infNFe>
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo/><SignatureValue>abc</SignatureValue></Signature>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${CHAVE}</chNFe><dhRecbto>2026-10-10T10:21:00-03:00</dhRecbto><nProt>133260000012345</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

function nota(): NotaFiscal {
  const r = ler(NOTA);
  if (!r.ok) throw new Error(r.erro);
  return r.nota;
}

function item(id: string, extra: Partial<ItemEstoque> = {}): ItemEstoque {
  return { id, nome: id, categoria: 'outros', unidade: 'un', quantidade: 0, minimo: 0, custo: null, preco: null, criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z', ...extra };
}

describe('leitura do XML da NF-e', () => {
  it('lê a chave, o número, a data, o fornecedor, os produtos e as duplicatas', () => {
    const n = nota();
    expect(n.chave).toBe(CHAVE);
    expect(n.numero).toBe('12345');
    expect(n.serie).toBe('1');
    expect(n.modelo).toBe('55');
    expect(n.emissao).toBe('2026-10-10');
    expect(n.emitente).toEqual({ cnpj: '12345678000195', nome: 'Distribuidora Serra', razaoSocial: 'Distribuidora Serra Comercio de Pecas Ltda' });
    expect(n.total).toBe(1878.85);
    expect(n.itens).toHaveLength(4);
    expect(n.duplicatas).toEqual([
      { numero: '001', vencimento: '2026-11-09', valor: 939.43 },
      { numero: '002', vencimento: '2026-12-09', valor: 939.42 }
    ]);
  });

  it('cada produto traz código, código de barras, NCM, CFOP, unidade, quantidade e valores', () => {
    const [oleo, filtro, vela, ar] = nota().itens;
    expect(oleo).toMatchObject({ numero: 1, codigo: 'LUB-5W30-20', ean: '7891000315507', ncm: '27101932', cfop: '5102', unidade: 'BD', quantidade: 2, valorUnitario: 620, valorTotal: 1240 });
    // desconto de 40 e ICMS-ST de 60 entram no custo
    expect(oleo.custoTotal).toBe(1260);
    // "SEM GTIN" não é código de barras; frete e IPI entram no custo
    expect(filtro).toMatchObject({ codigo: 'PSL55', ean: null, unidade: 'UN', quantidade: 10, valorUnitario: 18.5, custoTotal: 199.25 });
    expect(vela).toMatchObject({ ean: '7891234567895', unidade: 'JG', quantidade: 3, custoTotal: 288, cfop: '5405' });
    // as entidades do XML viram texto
    expect(ar.descricao).toBe('FILTRO DE AR TECFIL ARL4152 & VEDACAO');
    expect(ar.ean).toBeNull();
  });

  it('aceita a NF-e sem o nfeProc em volta e com prefixo no nome das tags', () => {
    const sem = NOTA.replace(/^[\s\S]*?(<NFe )/, '$1').replace(/<protNFe[\s\S]*$/, '');
    const r = ler(sem);
    expect(r.ok && r.nota.itens.length).toBe(4);
    const comPrefixo = `<nfe:NFe xmlns:nfe="http://www.portalfiscal.inf.br/nfe"><nfe:infNFe Id="NFe${CHAVE}"><nfe:ide><nfe:nNF>9</nfe:nNF><nfe:dhEmi>2026-10-01T08:00:00-03:00</nfe:dhEmi></nfe:ide><nfe:emit><nfe:CNPJ>12345678000195</nfe:CNPJ><nfe:xNome>LOJA X</nfe:xNome></nfe:emit><nfe:det nItem="1"><nfe:prod><nfe:cProd>1</nfe:cProd><nfe:xProd>PECA</nfe:xProd><nfe:uCom>UN</nfe:uCom><nfe:qCom>1</nfe:qCom><nfe:vUnCom>10</nfe:vUnCom><nfe:vProd>10.00</nfe:vProd></nfe:prod></nfe:det></nfe:infNFe></nfe:NFe>`;
    const p = ler(comPrefixo);
    expect(p.ok && p.nota.numero).toBe('9');
    expect(p.ok && p.nota.total).toBe(10);
    expect(p.ok && p.nota.duplicatas).toEqual([]);
  });

  it('usa a chave do protocolo quando o Id está estragado', () => {
    const r = ler(NOTA.replace(`Id="NFe${CHAVE}"`, 'Id="NFe123"'));
    expect(r.ok && r.nota.chave).toBe(CHAVE);
  });

  it('explica o que está errado no arquivo', () => {
    expect(ler('isto não é xml')).toEqual({ ok: false, erro: expect.stringContaining('não é um XML') });
    expect(ler('<a><b></a>')).toEqual({ ok: false, erro: expect.stringContaining('cortado ou estragado') });
    expect(ler('<resNFe><chNFe>1</chNFe></resNFe>')).toEqual({ ok: false, erro: expect.stringContaining('só o resumo') });
    expect(ler('<CTe><infCte/></CTe>')).toEqual({ ok: false, erro: expect.stringContaining('não é de uma NF-e') });
    const semChave = NOTA.replaceAll(CHAVE, CHAVE.slice(0, 43) + '9');
    expect(ler(semChave)).toEqual({ ok: false, erro: expect.stringContaining('chave de acesso') });
    const semProdutos = NOTA.replace(/<det [\s\S]*<\/det>/, '');
    expect(ler(semProdutos)).toEqual({ ok: false, erro: 'A nota não tem produtos.' });
  });
});

describe('chave de acesso', () => {
  it('confere o dígito e tira o CNPJ do emitente', () => {
    expect(chaveValida(CHAVE)).toBe(true);
    expect(chaveValida('35260998765432000110550020000007771876543216')).toBe(true);
    expect(chaveValida(CHAVE.slice(0, 43) + '1')).toBe(false);
    expect(chaveValida('123')).toBe(false);
    expect(cnpjDaChave(CHAVE)).toBe('12345678000195');
    expect(cnpjDaChave('x')).toBeNull();
  });
});

describe('achar o produto da nota no estoque', () => {
  const movimentos: MovimentoEstoque[] = [
    { id: 'm1', itemId: 'filtro', quando: '2026-09-01T10:00:00.000Z', tipo: 'entrada', quantidade: 5, origem: { tipo: 'nota', id: '33260912345678000195550010000111111123456789', rotulo: 'NF-e nº 11111' } },
    { id: 'm2', itemId: 'outro-filtro', quando: '2026-09-01T10:00:00.000Z', tipo: 'entrada', quantidade: 5, origem: { tipo: 'nota', id: '35260998765432000110550020000007771876543216' } },
    { id: 'm3', itemId: 'filtro', quando: '2026-09-02T10:00:00.000Z', tipo: 'saida', quantidade: -1, origem: { tipo: 'ordem', id: 'os1' } }
  ];

  it('sabe de quais fornecedores cada item já veio', () => {
    const f = fornecedoresDosItens(movimentos);
    expect([...(f.get('filtro') ?? [])]).toEqual(['12345678000195']);
    expect([...(f.get('outro-filtro') ?? [])]).toEqual(['98765432000110']);
  });

  it('código de barras primeiro, depois o código do mesmo fornecedor, depois o nome parecido', () => {
    const estoque = [
      item('oleo', { nome: 'Óleo Lubrax 5W-30 Sintético', ean: '7891000315507', unidade: 'L', categoria: 'oleo_motor' }),
      item('filtro', { nome: 'Filtro de óleo', codigoFornecedor: 'PSL55' }),
      item('outro-filtro', { nome: 'Filtro qualquer', codigoFornecedor: 'BKR6E' }),
      item('vela', { nome: 'Vela NGK BKR6E', marca: 'NGK' }),
      item('pastilha', { nome: 'Pastilha de freio dianteira' })
    ];
    const c = casarNota(nota(), estoque, movimentos);
    expect(c[0]).toEqual({ itemId: 'oleo', como: 'ean', confianca: 1 });
    expect(c[1]).toEqual({ itemId: 'filtro', como: 'codigo', confianca: 1 });
    // o mesmo código, mas de outro fornecedor, não vale: a vela vai pelo nome
    expect(c[2].itemId).toBe('vela');
    expect(c[2].como).toBe('nome');
    // nada parecido: produto novo
    expect(c[3]).toEqual({ itemId: null, como: null, confianca: 0 });
  });

  it('o código do fornecedor sem histórico de nota daquele fornecedor não casa sozinho', () => {
    const n = nota();
    const r = casarItem(n.itens[1], n.emitente.cnpj, [item('x', { nome: 'Pastilha', codigoFornecedor: 'PSL55' })], new Map());
    expect(r.itemId).toBeNull();
  });

  it('o código de barras guardado no código do fabricante também vale', () => {
    const n = nota();
    const r = casarItem(n.itens[2], n.emitente.cnpj, [item('v', { nome: 'Vela', codigo: '7891234567895' })], new Map());
    expect(r).toEqual({ itemId: 'v', como: 'ean', confianca: 1 });
  });

  it('o nome parecido entende as abreviações das notas', () => {
    expect([...palavrasDoProduto('OLEO 5W-30 SINT 1LT')]).toEqual(['oleo', '5w30', 'sintetico', '1l']);
    expect(palavrasDoProduto('Filtro de óleo PSL 55').has('psl55')).toBe(true);
    expect(semelhanca('FILTRO OLEO TECFIL PSL55', 'Filtro de óleo Tecfil PSL 55')).toBeGreaterThan(0.8);
    expect(semelhanca('OLEO MOTOR LUBRAX 5W30 SINT 1L', 'Lubrax Óleo 5W-30 Sintético 1 L')).toBeGreaterThan(0.8);
    expect(semelhanca('PASTILHA FREIO DIANT COBREQ N1234', 'Filtro de ar')).toBeLessThan(0.2);
    expect(semelhanca('', 'x')).toBe(0);
  });
});

describe('embalagem para a unidade do estoque', () => {
  it('o óleo conta em litros pelo nome da embalagem', () => {
    expect(fatorSugerido({ unidade: 'BD', descricao: 'OLEO 5W30 BALDE 20L' }, 'L')).toBe(20);
    expect(fatorSugerido({ unidade: 'UN', descricao: 'OLEO 5W30 SINT 1L' }, 'L')).toBe(1);
    expect(fatorSugerido({ unidade: 'GL', descricao: 'OLEO 15W40 GALAO 4 LITROS' }, 'L')).toBe(4);
    expect(fatorSugerido({ unidade: 'FR', descricao: 'ADITIVO 500ML' }, 'L')).toBe(0.5);
    expect(fatorSugerido({ unidade: 'CX', descricao: 'OLEO 5W30 CX 12X1L' }, 'L')).toBe(12);
    expect(fatorSugerido({ unidade: 'LT', descricao: 'OLEO A GRANEL' }, 'L')).toBe(1);
    expect(fatorSugerido({ unidade: 'ML', descricao: 'FLUIDO' }, 'L')).toBe(0.001);
    expect(fatorSugerido({ unidade: 'UN', descricao: 'OLEO SEM MEDIDA' }, 'L')).toBe(1);
  });

  it('peças em jogo, par, dúzia ou caixa contam cada uma', () => {
    expect(fatorSugerido({ unidade: 'JG', descricao: 'VELA NGK JOGO C/4' }, 'un')).toBe(4);
    expect(fatorSugerido({ unidade: 'KIT', descricao: 'PASTILHA KIT 2 PCS' }, 'un')).toBe(2);
    expect(fatorSugerido({ unidade: 'PAR', descricao: 'AMORTECEDOR DIANT' }, 'un')).toBe(2);
    expect(fatorSugerido({ unidade: 'DZ', descricao: 'ABRACADEIRA' }, 'un')).toBe(12);
    expect(fatorSugerido({ unidade: 'CX', descricao: 'LAMPADA H4' }, 'un')).toBe(1);
    expect(fatorSugerido({ unidade: 'UN', descricao: 'FILTRO C/4' }, 'un')).toBe(1);
    expect(litrosNoNome('PNEU 175/70 R14')).toBeNull();
    expect(unidadesNoNome('JOGO COM 4')).toBe(4);
    expect(unidadesNoNome('PASTILHA')).toBeNull();
  });

  it('o custo por unidade do estoque é o custo de verdade dividido pelo que entra', () => {
    const [oleo, filtro] = nota().itens;
    // 2 baldes de 20 L: 40 L por R$ 1.260,00
    expect(custoPorUnidade(oleo, 20)).toBe(31.5);
    expect(custoPorUnidade(filtro, 1)).toBe(19.93);
    expect(custoPorUnidade({ custoTotal: 0, quantidade: 1 }, 1)).toBeNull();
  });
});

describe('categoria do produto novo', () => {
  it('pelo nome e, sem pista no nome, pelo NCM', () => {
    expect(categoriaSugerida('OLEO MOTOR LUBRAX 5W30 SINTETICO BALDE 20L', '27101932')).toBe('oleo_motor');
    expect(categoriaSugerida('OLEO CAMBIO ATF DEXRON', '27101932')).toBe('fluido_cambio');
    expect(categoriaSugerida('FILTRO OLEO TECFIL PSL55', null)).toBe('filtro_oleo');
    expect(categoriaSugerida('FILTRO DE AR TECFIL ARL4152', null)).toBe('filtro_ar');
    expect(categoriaSugerida('FILTRO AR CONDICIONADO ACP123', null)).toBe('filtro_cabine');
    expect(categoriaSugerida('FILTRO COMBUSTIVEL GI04', null)).toBe('filtro_combustivel');
    expect(categoriaSugerida('VELA IGNICAO NGK BKR6E', null)).toBe('vela');
    expect(categoriaSugerida('KIT CORREIA DENTADA', null)).toBe('correia_dentada');
    expect(categoriaSugerida('PASTILHA FREIO DIANT', null)).toBe('pastilha_freio');
    expect(categoriaSugerida('FLUIDO DOT 4 500ML', null)).toBe('fluido_freio');
    expect(categoriaSugerida('ADITIVO RADIADOR', null)).toBe('arrefecimento');
    expect(categoriaSugerida('BATERIA 60AH MOURA', null)).toBe('bateria');
    expect(categoriaSugerida('PECA SEM NOME CONHECIDO', '87088000')).toBe('amortecedor');
    expect(categoriaSugerida('PECA SEM NOME CONHECIDO', '99999999')).toBe('outros');
  });
});

describe('contas a pagar e nota repetida', () => {
  it('cada duplicata vira uma conta a pagar do fornecedor, com o vencimento da nota', () => {
    const contas = contasDaNota(nota(), new Date('2026-10-12T12:00:00.000Z'));
    expect(contas).toHaveLength(2);
    expect(contas[0]).toEqual({
      id: idDaParcela(CHAVE, 0),
      tipo: 'pagar',
      descricao: 'NF-e nº 12345 de Distribuidora Serra (parcela 1 de 2)',
      valor: 939.43,
      vencimento: '2026-11-09',
      pagoEm: null,
      forma: null,
      categoria: 'fornecedor',
      parcela: { numero: 1, total: 2, grupo: `nfe-${CHAVE}` },
      favorecido: 'Distribuidora Serra',
      observacao: `Duplicata 001. Chave da nota: ${CHAVE}.`,
      criadoEm: '2026-10-12T12:00:00.000Z'
    });
    expect(contas[1]).toMatchObject({ vencimento: '2026-12-09', valor: 939.42, parcela: { numero: 2, total: 2 } });
    expect(contas.every((c) => c.id!.length <= 100)).toBe(true);
  });

  it('a nota que já entrou no estoque ou nas contas não entra de novo', () => {
    const mov: MovimentoEstoque = { id: 'x', itemId: 'oleo', quando: '2026-10-11T09:00:00.000Z', tipo: 'entrada', quantidade: 40, origem: { tipo: 'nota', id: CHAVE } };
    expect(notaJaLancada(CHAVE, [mov])).toBe('2026-10-11T09:00:00.000Z');
    expect(notaJaLancada(CHAVE, [], [{ id: idDaParcela(CHAVE, 1), criadoEm: '2026-10-12T00:00:00.000Z' }])).toBe('2026-10-12T00:00:00.000Z');
    expect(notaJaLancada(CHAVE, [{ ...mov, origem: { tipo: 'pedido', id: CHAVE } }], [{ id: 'outra', criadoEm: '' }])).toBeNull();
  });
});
