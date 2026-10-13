// Catálogo de exemplo. É a origem do seed do banco (npm run seed) e o que aparece
// quando o Supabase não está configurado. Fornecedores fictícios e preços ilustrativos.

import type { Catalogo, Fornecedor, Produto, Promocao } from './catalogo';

const fornecedores: Fornecedor[] = [
  { id: 1, nome: 'Distribuidora de Lubrificantes', cidade: 'Rio de Janeiro', uf: 'RJ', demonstracao: true },
  { id: 2, nome: 'Central de Filtros', cidade: 'Duque de Caxias', uf: 'RJ', demonstracao: true },
  { id: 3, nome: 'Freios & Suspensão', cidade: 'Niterói', uf: 'RJ', demonstracao: true },
  { id: 4, nome: 'Pneus & Baterias', cidade: 'Nova Iguaçu', uf: 'RJ', demonstracao: true }
];

type Novo = Omit<Produto, 'marca' | 'descricao' | 'intervaloKm' | 'intervaloMeses' | 'especificacao'> &
  Partial<Pick<Produto, 'marca' | 'descricao' | 'intervaloKm' | 'intervaloMeses' | 'especificacao'>>;

function p(n: Novo): Produto {
  return { marca: null, descricao: null, intervaloKm: null, intervaloMeses: null, especificacao: {}, ...n };
}

const APLICACAO = 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.';

const produtos: Produto[] = [
  // Óleos e fluidos
  p({ id: 101, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 5W-30 sintético API SP dexos1 Gen 3', unidade: 'L', conteudo: 1, preco: 46.9,
    especificacao: { viscosidade: '5W-30', base: 'sintetico', api: 'SP', ilsac: 'GF-6A', normas: ['GM dexos1 Gen 3'] },
    descricao: 'Para motores GM que pedem dexos1, como o Onix 1.0 turbo.' }),
  p({ id: 102, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 0W-20 sintético API SP dexos1 Gen 3', unidade: 'L', conteudo: 1, preco: 52.9,
    especificacao: { viscosidade: '0W-20', base: 'sintetico', api: 'SP', ilsac: 'GF-6A', normas: ['GM dexos1 Gen 3'] },
    descricao: 'Para motores que pedem 0W-20 API SP ou dexos1, como o Onix aspirado e o Firefly.' }),
  p({ id: 103, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 5W-40 sintético VW 508 88', unidade: 'L', conteudo: 1, preco: 54.9,
    especificacao: { viscosidade: '5W-40', base: 'sintetico', api: 'SP', acea: ['A3/B4'], normas: ['VW 508 88'] },
    descricao: 'Para os motores TSI da Volkswagen (Polo, Virtus, Nivus, T-Cross).' }),
  p({ id: 104, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 0W-30 sintético ACEA C2 Fiat 9.55535-GS1', unidade: 'L', conteudo: 1, preco: 59.9,
    especificacao: { viscosidade: '0W-30', base: 'sintetico', acea: ['C2'], normas: ['Fiat 9.55535-GS1'] },
    descricao: 'Para os turbo T200 e T270 (Strada, Pulse, Fastback, Compass, Renegade).' }),
  p({ id: 105, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 5W-30 sintético API SP ACEA A5/B5', unidade: 'L', conteudo: 1, preco: 42.9,
    especificacao: { viscosidade: '5W-30', base: 'sintetico', api: 'SP', acea: ['A5/B5'] } }),
  p({ id: 106, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 0W-30 sintético API SP', unidade: 'L', conteudo: 1, preco: 49.9,
    especificacao: { viscosidade: '0W-30', base: 'sintetico', api: 'SP', ilsac: 'GF-6A' } }),
  p({ id: 107, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 10W-40 semissintético API SN', unidade: 'L', conteudo: 1, preco: 34.9,
    especificacao: { viscosidade: '10W-40', base: 'semissintetico', api: 'SN' } }),
  p({ id: 108, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 15W-40 semissintético API SL', unidade: 'L', conteudo: 1, preco: 31.9,
    especificacao: { viscosidade: '15W-40', base: 'semissintetico', api: 'SL' } }),
  p({ id: 109, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 20W-50 mineral API SL', unidade: 'L', conteudo: 1, preco: 26.9,
    especificacao: { viscosidade: '20W-50', base: 'mineral', api: 'SL' }, intervaloKm: 5000, intervaloMeses: 6,
    descricao: 'Para motores antigos que pedem óleo mineral. Prazo menor: 5.000 km ou 6 meses.' }),
  p({ id: 110, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Óleo 5W-30 sintético API SP dexos1 Gen 3', unidade: 'L', conteudo: 4, preco: 169.9,
    especificacao: { viscosidade: '5W-30', base: 'sintetico', api: 'SP', ilsac: 'GF-6A', normas: ['GM dexos1 Gen 3'] } }),
  p({ id: 111, fornecedorId: 1, categoria: 'oleo_motor', nome: 'Kit troca de óleo 5W-30 dexos1 Gen 3 (4 L e filtro)', unidade: 'kit', conteudo: 4, preco: 199.9,
    especificacao: { viscosidade: '5W-30', base: 'sintetico', api: 'SP', ilsac: 'GF-6A', normas: ['GM dexos1 Gen 3'] },
    descricao: 'Quatro litros e o filtro de óleo. ' + APLICACAO }),
  p({ id: 112, fornecedorId: 1, categoria: 'arrefecimento', nome: 'Líquido de arrefecimento pronto para uso (1 L)', unidade: 'un', conteudo: null, preco: 27.9,
    descricao: 'Não misture com outro tipo de aditivo.' }),
  p({ id: 113, fornecedorId: 1, categoria: 'fluido_cambio', nome: 'Fluido ATF para câmbio automático', unidade: 'L', conteudo: 1, preco: 69.9,
    descricao: 'Confira a norma do câmbio no manual.' }),
  p({ id: 114, fornecedorId: 1, categoria: 'fluido_cambio', nome: 'Óleo para câmbio manual 75W-80 GL-4', unidade: 'L', conteudo: 1, preco: 49.9 }),

  // Filtros, ignição e correias
  p({ id: 201, fornecedorId: 2, categoria: 'filtro_oleo', nome: 'Filtro de óleo blindado', unidade: 'un', conteudo: null, preco: 29.9, descricao: APLICACAO }),
  p({ id: 202, fornecedorId: 2, categoria: 'filtro_oleo', nome: 'Filtro de óleo refil (elemento)', unidade: 'un', conteudo: null, preco: 24.9, descricao: APLICACAO }),
  p({ id: 203, fornecedorId: 2, categoria: 'filtro_ar', nome: 'Filtro de ar do motor', unidade: 'un', conteudo: null, preco: 44.9, descricao: APLICACAO }),
  p({ id: 204, fornecedorId: 2, categoria: 'filtro_cabine', nome: 'Filtro de cabine com carvão ativado', unidade: 'un', conteudo: null, preco: 49.9, descricao: 'Segura também cheiros e gases. ' + APLICACAO }),
  p({ id: 205, fornecedorId: 2, categoria: 'filtro_cabine', nome: 'Filtro de cabine comum', unidade: 'un', conteudo: null, preco: 34.9, descricao: APLICACAO }),
  p({ id: 206, fornecedorId: 2, categoria: 'filtro_combustivel', nome: 'Filtro de combustível flex', unidade: 'un', conteudo: null, preco: 32.9, descricao: APLICACAO }),
  p({ id: 207, fornecedorId: 2, categoria: 'higienizacao_ar', nome: 'Higienizador de ar-condicionado em espuma', unidade: 'un', conteudo: null, preco: 39.9 }),
  p({ id: 208, fornecedorId: 2, categoria: 'vela', nome: 'Velas de ignição de níquel (jogo com 4)', unidade: 'jogo', conteudo: null, preco: 89.9,
    especificacao: { tipo: 'níquel' }, intervaloKm: 30000, intervaloMeses: 36, descricao: APLICACAO }),
  p({ id: 209, fornecedorId: 2, categoria: 'vela', nome: 'Vela de ignição de irídio', unidade: 'un', conteudo: null, preco: 89.9,
    especificacao: { tipo: 'irídio' }, intervaloKm: 60000, intervaloMeses: 60, descricao: 'Vida longa, de 40 a 100 mil km conforme o motor. ' + APLICACAO }),
  p({ id: 210, fornecedorId: 2, categoria: 'correia_dentada', nome: 'Kit correia dentada com tensor', unidade: 'kit', conteudo: null, preco: 289.9, descricao: APLICACAO }),
  p({ id: 211, fornecedorId: 2, categoria: 'correia_acessorios', nome: 'Correia de acessórios (poli-V)', unidade: 'un', conteudo: null, preco: 79.9, descricao: APLICACAO }),

  // Freios e suspensão
  p({ id: 301, fornecedorId: 3, categoria: 'pastilha_freio', nome: 'Pastilhas de freio dianteiras', unidade: 'jogo', conteudo: null, preco: 139.9, descricao: APLICACAO }),
  p({ id: 302, fornecedorId: 3, categoria: 'disco_freio', nome: 'Discos de freio dianteiros ventilados', unidade: 'par', conteudo: null, preco: 329.9, descricao: APLICACAO }),
  p({ id: 303, fornecedorId: 3, categoria: 'fluido_freio', nome: 'Fluido de freio DOT 4 (500 ml)', unidade: 'un', conteudo: null, preco: 34.9, especificacao: { tipo: 'DOT 4' } }),
  p({ id: 304, fornecedorId: 3, categoria: 'amortecedor', nome: 'Amortecedores dianteiros', unidade: 'par', conteudo: null, preco: 589.9, descricao: 'Troque sempre em pares. ' + APLICACAO }),

  // Pneus, baterias e palhetas
  p({ id: 401, fornecedorId: 4, categoria: 'pneu', nome: 'Pneu 175/70 R14', unidade: 'un', conteudo: null, preco: 359.9, especificacao: { medida: '175/70 R14' }, intervaloKm: 40000, intervaloMeses: 60 }),
  p({ id: 402, fornecedorId: 4, categoria: 'pneu', nome: 'Pneu 185/65 R15', unidade: 'un', conteudo: null, preco: 419.9, especificacao: { medida: '185/65 R15' }, intervaloKm: 40000, intervaloMeses: 60 }),
  p({ id: 403, fornecedorId: 4, categoria: 'pneu', nome: 'Pneu 195/55 R16', unidade: 'un', conteudo: null, preco: 489.9, especificacao: { medida: '195/55 R16' }, intervaloKm: 40000, intervaloMeses: 60 }),
  p({ id: 404, fornecedorId: 4, categoria: 'pneu', nome: 'Pneu 205/60 R16', unidade: 'un', conteudo: null, preco: 529.9, especificacao: { medida: '205/60 R16' }, intervaloKm: 40000, intervaloMeses: 60 }),
  p({ id: 405, fornecedorId: 4, categoria: 'bateria', nome: 'Bateria 45 Ah', unidade: 'un', conteudo: null, preco: 429.9, especificacao: { amperagem: 45 }, intervaloMeses: 24, descricao: 'Teste a cada revisão a partir de 2 anos.' }),
  p({ id: 406, fornecedorId: 4, categoria: 'bateria', nome: 'Bateria 60 Ah', unidade: 'un', conteudo: null, preco: 549.9, especificacao: { amperagem: 60 }, intervaloMeses: 24, descricao: 'Teste a cada revisão a partir de 2 anos.' }),
  p({ id: 407, fornecedorId: 4, categoria: 'palheta', nome: 'Palhetas dianteiras', unidade: 'par', conteudo: null, preco: 69.9, descricao: APLICACAO })
];

const promocoes: Promocao[] = [
  { id: 1, produtoId: 101, titulo: 'Semana do óleo', precoPromocional: 39.9, quantidadeMinima: 4, inicio: '2026-10-01', fim: '2026-10-31' },
  { id: 2, produtoId: 111, titulo: 'Kit com desconto', precoPromocional: 179.9, quantidadeMinima: 1, inicio: '2026-10-01', fim: '2026-11-30' },
  { id: 3, produtoId: 102, titulo: 'Lançamento 0W-20', precoPromocional: 46.9, quantidadeMinima: 1, inicio: '2026-10-01', fim: '2026-11-15' },
  { id: 4, produtoId: 201, titulo: 'Caixa com 10', precoPromocional: 22.9, quantidadeMinima: 10, inicio: '2026-10-01', fim: '2027-01-31' },
  { id: 5, produtoId: 203, titulo: 'Oferta da semana', precoPromocional: 36.9, quantidadeMinima: 1, inicio: '2026-10-01', fim: '2026-11-30' },
  { id: 6, produtoId: 301, titulo: 'Freio em dia', precoPromocional: 119.9, quantidadeMinima: 1, inicio: '2026-10-01', fim: '2026-12-15' },
  { id: 7, produtoId: 406, titulo: 'Bateria com desconto', precoPromocional: 499.9, quantidadeMinima: 1, inicio: '2026-10-01', fim: '2026-11-30' },
  { id: 8, produtoId: 402, titulo: 'Leve 4 pneus', precoPromocional: 389.9, quantidadeMinima: 4, inicio: '2026-10-01', fim: '2027-01-31' },
  { id: 9, produtoId: 103, titulo: 'Linha TSI', precoPromocional: 49.9, quantidadeMinima: 4, inicio: '2026-10-01', fim: '2026-12-31' },
  { id: 10, produtoId: 204, titulo: 'Verão sem cheiro', precoPromocional: 42.9, quantidadeMinima: 1, inicio: '2026-10-01', fim: '2027-02-28' }
];

export const CATALOGO_EXEMPLO: Catalogo = {
  origem: 'exemplo',
  atualizadoEm: '2026-10-13T00:00:00.000Z',
  fornecedores,
  produtos,
  promocoes
};
