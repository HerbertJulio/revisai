// O que o mecânico responde falando, no passo a passo: placa, quilometragem, nome, modelo,
// serviços e comandos ("voltar", "pular", "não sei"). Sem IA: o reconhecimento de fala do
// navegador devolve o texto e estas regras tiram dele o que a pergunta pede.

import { normalizarPlaca, placaValida } from './formatos';
import type { ServicoId } from './tipos';

export function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Minúsculas, sem acento, sem pontuação, espaços simples. */
export function limparFala(t: string): string {
  return semAcento((t ?? '').toLowerCase())
    .replace(/[^a-z0-9.,\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- números

const UNIDADES: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  meia: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900
};

const ESCALAS: Record<string, number> = { mil: 1000, milhao: 1_000_000, milhoes: 1_000_000 };

/** Um número escrito com algarismos no jeito brasileiro: "45.210", "45 210", "3,5". */
function numeroDeAlgarismos(t: string): number | null {
  const s = t.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+(,\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d+\.\d{1,2}$/.test(s)) return Number(s);
  return null;
}

/**
 * Lê um número falado: "quarenta e cinco mil duzentos e dez", "45 mil", "45.210", "45 210",
 * "cento e vinte mil". Devolve null se não achar número.
 */
export function numeroFalado(texto: string): number | null {
  let t = limparFala(texto).replace(/\b(km|quilometros?|kms|reais|real|rs)\b/g, ' ');
  // "45 210" (grupos de milhar separados por espaço)
  t = t.replace(/\b(\d{1,3})(?: (\d{3}))+\b/g, (m) => m.replace(/ /g, ''));
  const tokens = t.split(/\s+/).filter(Boolean);
  let total = 0;
  let grupo = 0;
  let achou = false;
  for (const tok of tokens) {
    if (tok === 'e') continue;
    const algarismos = numeroDeAlgarismos(tok);
    if (algarismos != null) {
      grupo += algarismos;
      achou = true;
      continue;
    }
    if (tok in UNIDADES) {
      grupo += UNIDADES[tok];
      achou = true;
      continue;
    }
    if (tok in ESCALAS) {
      total += (grupo || 1) * ESCALAS[tok];
      grupo = 0;
      achou = true;
      continue;
    }
    // palavra que não é número: se já começou o número, para aqui
    if (achou) break;
  }
  if (!achou) return null;
  const n = total + grupo;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const NAO_SEI = /\b(nao sei|nao lembro|nenhum|nenhuma|sem km|sem quilometragem|nao tem|nao marcou|nao sabe|pula|pular|sem placa|nao anotei)\b/;

export function disseNaoSei(texto: string): boolean {
  return NAO_SEI.test(limparFala(texto));
}

/** A quilometragem falada; 'nao_sei' quando ele diz que não sabe. */
export function kmFalado(texto: string): number | 'nao_sei' | null {
  if (disseNaoSei(texto)) return 'nao_sei';
  const n = numeroFalado(texto);
  if (n == null || n < 0 || n > 3_000_000) return null;
  return Math.round(n);
}

/** Um valor em reais falado: "cento e cinquenta", "150,50", "80 reais". */
export function valorFalado(texto: string): number | null {
  const n = numeroFalado(texto);
  return n == null || n < 0 || n > 1_000_000 ? null : n;
}

/** Telefone falado número por número ("vinte e um, nove oito sete...") ou com algarismos. */
export function telefoneFalado(texto: string): string | null {
  const t = limparFala(texto);
  let digitos = '';
  const toks = t.split(/[\s.,/-]+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (/^\d+$/.test(tok)) digitos += tok;
    else if (tok in DIGITOS) digitos += DIGITOS[tok];
    else if (tok in UNIDADES && UNIDADES[tok] >= 10 && UNIDADES[tok] < 100) {
      // "vinte e um" é 21
      const dezena = UNIDADES[tok];
      if (dezena % 10 === 0 && dezena >= 20 && toks[i + 1] === 'e' && toks[i + 2] in DIGITOS) {
        digitos += String(dezena + Number(DIGITOS[toks[i + 2]]));
        i += 2;
      } else digitos += String(dezena);
    }
  }
  if (digitos.startsWith('55') && digitos.length >= 12) digitos = digitos.slice(2);
  return digitos.length === 10 || digitos.length === 11 ? digitos : null;
}

// ---------------------------------------------------------------- placa

const LETRAS: Record<string, string> = {
  a: 'A',
  be: 'B',
  ce: 'C',
  de: 'D',
  e: 'E',
  efe: 'F',
  ge: 'G',
  gue: 'G',
  aga: 'H',
  i: 'I',
  jota: 'J',
  ca: 'K',
  ka: 'K',
  capa: 'K',
  ele: 'L',
  eme: 'M',
  ene: 'N',
  o: 'O',
  pe: 'P',
  que: 'Q',
  qui: 'Q',
  erre: 'R',
  esse: 'S',
  te: 'T',
  u: 'U',
  ve: 'V',
  dablio: 'W',
  dabliu: 'W',
  xis: 'X',
  ipsilon: 'Y',
  ze: 'Z'
};

const DIGITOS: Record<string, string> = { zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', meia: '6', sete: '7', oito: '8', nove: '9' };

// o que vem na posição: letra (L), algarismo (D) ou os dois (X, a quinta da placa Mercosul)
const MOLDE = ['L', 'L', 'L', 'D', 'X', 'D', 'D'] as const;

function cabe(c: string, pos: number): boolean {
  const quer = MOLDE[pos];
  if (!quer) return false;
  const letra = /[A-Z]/.test(c);
  const algarismo = /\d/.test(c);
  return quer === 'L' ? letra : quer === 'D' ? algarismo : letra || algarismo;
}

/** O que cada palavra pode ser na placa (uma lista vazia é pular a palavra). */
function leiturasDaPalavra(tok: string): string[][] {
  if (tok === 'e') return [['E'], []];
  if (tok === 'o') return [['O'], ['0']];
  if (tok in DIGITOS) return [[DIGITOS[tok]]];
  if (tok in LETRAS) return [[LETRAS[tok]]];
  if (/^[a-z0-9]+$/.test(tok)) return [tok.toUpperCase().split('')];
  return [[]];
}

function casar(toks: string[], i: number, placa: string): string | null {
  if (placa.length === 7) return placa;
  if (i >= toks.length) return null;
  for (const alt of leiturasDaPalavra(toks[i])) {
    if (placa.length + alt.length > 7 || !alt.every((c, k) => cabe(c, placa.length + k))) continue;
    const r = casar(toks, i + 1, placa + alt.join(''));
    if (r) return r;
  }
  return null;
}

/** A placa falada: "ABC 1D23", "a bê cê um dê dois três", "placa abc1234". */
export function placaFalada(texto: string): string | null {
  const t = limparFala(texto);
  const toks = t.split(/[\s.,/-]+/).filter(Boolean);
  // escrita junta ou em pedaços: "abc1d23", "ABC 1D23", "ABC-1234" (até três palavras seguidas)
  for (let i = 0; i < toks.length; i++) {
    let junto = '';
    for (let j = i; j < Math.min(toks.length, i + 3); j++) {
      junto += toks[j];
      if (junto.length === 7 && placaValida(junto)) return normalizarPlaca(junto);
      if (junto.length >= 7) break;
    }
  }
  for (let inicio = 0; inicio < toks.length; inicio++) {
    const r = casar(toks, inicio, '');
    if (r && placaValida(r)) return r;
  }
  return null;
}

// ---------------------------------------------------------------- nomes e modelos

const PREFIXOS_NOME = /^(o dono e|a dona e|dono e|dona e|o nome e|nome e|e o|e a|se chama|chama|cliente|o cliente e|a cliente e|e do|e da|do|da|o|a)\s+/;

/** "Seu Marcos da Silva" vira "Marcos da Silva"; null se ele diz que não sabe. */
export function nomeFalado(texto: string): string | null {
  const bruto = (texto ?? '').trim();
  if (!bruto || /\b(nao sei|sem nome|nao tem nome|nao quis falar|nao informou|ninguem|tanto faz)\b/.test(limparFala(bruto))) return null;
  let t = bruto.replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) {
    const limpo = semAcento(t.toLowerCase());
    const m = limpo.match(PREFIXOS_NOME);
    if (!m) break;
    t = t.slice(m[0].length);
  }
  t = t.replace(/^(seu|sr\.?|senhor|dona|sra\.?|senhora)\s+/i, '');
  const minusculas = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const nome = t
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .map((p, i) => (i > 0 && minusculas.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ');
  return nome.length >= 2 ? nome.slice(0, 80) : null;
}

/** Modelo e a marca que costuma ir com ele. */
const MODELOS: [RegExp, string, string][] = [
  [/\bonix\b/, 'Chevrolet', 'Onix'],
  [/\bprisma\b/, 'Chevrolet', 'Prisma'],
  [/\btracker\b/, 'Chevrolet', 'Tracker'],
  [/\bs ?10\b/, 'Chevrolet', 'S10'],
  [/\bspin\b/, 'Chevrolet', 'Spin'],
  [/\bcruze\b/, 'Chevrolet', 'Cruze'],
  [/\bmontana\b/, 'Chevrolet', 'Montana'],
  [/\bcobalt\b/, 'Chevrolet', 'Cobalt'],
  [/\bcelta\b/, 'Chevrolet', 'Celta'],
  [/\bcorsa\b/, 'Chevrolet', 'Corsa'],
  [/\bclassic\b/, 'Chevrolet', 'Classic'],
  [/\bagile\b/, 'Chevrolet', 'Agile'],
  [/\bhb ?20 ?s\b/, 'Hyundai', 'HB20S'],
  [/\bhb ?20\b/, 'Hyundai', 'HB20'],
  [/\bcreta\b/, 'Hyundai', 'Creta'],
  [/\btucson\b/, 'Hyundai', 'Tucson'],
  [/\bi ?30\b/, 'Hyundai', 'i30'],
  [/\bgol\b/, 'Volkswagen', 'Gol'],
  [/\bpolo\b/, 'Volkswagen', 'Polo'],
  [/\bvirtus\b/, 'Volkswagen', 'Virtus'],
  [/\bt ?cross\b/, 'Volkswagen', 'T-Cross'],
  [/\bnivus\b/, 'Volkswagen', 'Nivus'],
  [/\bsaveiro\b/, 'Volkswagen', 'Saveiro'],
  [/\bvoyage\b/, 'Volkswagen', 'Voyage'],
  [/\bfox\b/, 'Volkswagen', 'Fox'],
  [/\bup\b/, 'Volkswagen', 'up!'],
  [/\bamarok\b/, 'Volkswagen', 'Amarok'],
  [/\bjetta\b/, 'Volkswagen', 'Jetta'],
  [/\btaos\b/, 'Volkswagen', 'Taos'],
  [/\bstrada\b/, 'Fiat', 'Strada'],
  [/\btoro\b/, 'Fiat', 'Toro'],
  [/\bargo\b/, 'Fiat', 'Argo'],
  [/\bmobi\b/, 'Fiat', 'Mobi'],
  [/\buno\b/, 'Fiat', 'Uno'],
  [/\bpalio\b/, 'Fiat', 'Palio'],
  [/\bsiena\b/, 'Fiat', 'Siena'],
  [/\bgrand siena\b/, 'Fiat', 'Grand Siena'],
  [/\bcronos\b/, 'Fiat', 'Cronos'],
  [/\bpulse\b/, 'Fiat', 'Pulse'],
  [/\bfastback\b/, 'Fiat', 'Fastback'],
  [/\bfiorino\b/, 'Fiat', 'Fiorino'],
  [/\bcorolla cross\b/, 'Toyota', 'Corolla Cross'],
  [/\bcorolla\b/, 'Toyota', 'Corolla'],
  [/\byaris\b/, 'Toyota', 'Yaris'],
  [/\betios\b/, 'Toyota', 'Etios'],
  [/\bhilux\b/, 'Toyota', 'Hilux'],
  [/\bsw ?4\b/, 'Toyota', 'SW4'],
  [/\bcivic\b/, 'Honda', 'Civic'],
  [/\bfit\b/, 'Honda', 'Fit'],
  [/\bcity\b/, 'Honda', 'City'],
  [/\bhr ?v\b/, 'Honda', 'HR-V'],
  [/\bwr ?v\b/, 'Honda', 'WR-V'],
  [/\bka\b/, 'Ford', 'Ka'],
  [/\becosport\b/, 'Ford', 'EcoSport'],
  [/\branger\b/, 'Ford', 'Ranger'],
  [/\bfiesta\b/, 'Ford', 'Fiesta'],
  [/\bfocus\b/, 'Ford', 'Focus'],
  [/\bkwid\b/, 'Renault', 'Kwid'],
  [/\bsandero\b/, 'Renault', 'Sandero'],
  [/\blogan\b/, 'Renault', 'Logan'],
  [/\bduster\b/, 'Renault', 'Duster'],
  [/\boroch\b/, 'Renault', 'Oroch'],
  [/\bcaptur\b/, 'Renault', 'Captur'],
  [/\bcompass\b/, 'Jeep', 'Compass'],
  [/\brenegade\b/, 'Jeep', 'Renegade'],
  [/\bcommander\b/, 'Jeep', 'Commander'],
  [/\bkicks\b/, 'Nissan', 'Kicks'],
  [/\bversa\b/, 'Nissan', 'Versa'],
  [/\bmarch\b/, 'Nissan', 'March'],
  [/\bsentra\b/, 'Nissan', 'Sentra'],
  [/\bfrontier\b/, 'Nissan', 'Frontier'],
  [/\b2008\b/, 'Peugeot', '2008'],
  [/\b208\b/, 'Peugeot', '208'],
  [/\b3008\b/, 'Peugeot', '3008'],
  [/\bc ?3\b/, 'Citroën', 'C3'],
  [/\bc4 cactus\b/, 'Citroën', 'C4 Cactus'],
  [/\baircross\b/, 'Citroën', 'Aircross'],
  [/\btiggo ?(\d)?\b/, 'Caoa Chery', 'Tiggo'],
  [/\bdolphin\b/, 'BYD', 'Dolphin'],
  [/\bsong\b/, 'BYD', 'Song'],
  [/\byuan\b/, 'BYD', 'Yuan'],
  [/\bl ?200\b/, 'Mitsubishi', 'L200'],
  [/\bpajero\b/, 'Mitsubishi', 'Pajero'],
  [/\boutlander\b/, 'Mitsubishi', 'Outlander'],
  [/\bsportage\b/, 'Kia', 'Sportage'],
  [/\bcerato\b/, 'Kia', 'Cerato']
];

const MARCAS: [RegExp, string][] = [
  [/\b(chevrolet|chevrole|gm)\b/, 'Chevrolet'],
  [/\b(volkswagen|vw|volks)\b/, 'Volkswagen'],
  [/\bfiat\b/, 'Fiat'],
  [/\bhyundai\b/, 'Hyundai'],
  [/\btoyota\b/, 'Toyota'],
  [/\brenault\b/, 'Renault'],
  [/\bjeep\b/, 'Jeep'],
  [/\bhonda\b/, 'Honda'],
  [/\bnissan\b/, 'Nissan'],
  [/\bford\b/, 'Ford'],
  [/\bpeugeot\b/, 'Peugeot'],
  [/\bcitroen\b/, 'Citroën'],
  [/\b(caoa chery|chery)\b/, 'Caoa Chery'],
  [/\bbyd\b/, 'BYD'],
  [/\bmitsubishi\b/, 'Mitsubishi'],
  [/\bkia\b/, 'Kia']
];

export interface ModeloFalado {
  marca: string;
  modelo: string;
  ano: number | null;
}

/** "um onix 2019" vira Chevrolet Onix 2019; um modelo desconhecido fica como foi falado. */
export function modeloFalado(texto: string, anoMaximo = new Date().getFullYear() + 1): ModeloFalado | null {
  const t = limparFala(texto);
  if (!t) return null;
  let ano: number | null = null;
  const quatro = t.match(/\b(19[5-9]\d|20\d{2})\b/);
  if (quatro) ano = Number(quatro[1]);
  else {
    const m = t.match(/\b(dois mil(?: e [a-z]+(?: e [a-z]+)?)?|mil novecentos e [a-z ]+)\b/);
    const n = m ? numeroFalado(m[1]) : null;
    if (n && n >= 1950 && n <= anoMaximo) ano = n;
  }
  if (ano != null && (ano < 1950 || ano > anoMaximo)) ano = null;
  for (const [re, marca, modelo] of MODELOS) {
    const m = t.match(re);
    if (!m) continue;
    const numero = modelo === 'Tiggo' && m[1] ? ` ${m[1]}` : '';
    return { marca, modelo: `${modelo}${numero}`, ano };
  }
  let marca = '';
  let resto = t;
  for (const [re, nome] of MARCAS) {
    if (re.test(t)) {
      marca = nome;
      resto = t.replace(re, ' ');
      break;
    }
  }
  resto = resto
    .replace(/\b(19[5-9]\d|20\d{2})\b/g, ' ')
    .replace(/\b(dois mil(?: e [a-z]+(?: e [a-z]+)?)?|mil novecentos e [a-z ]+)\b/g, ' ')
    .replace(/^(e um|e uma|um|uma|o|a|e o|e a|carro|modelo)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!resto && !marca) return null;
  const modelo = resto
    .split(' ')
    .slice(0, 4)
    .map((p) => (p.length <= 3 && /\d/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
  return { marca, modelo, ano };
}

// ---------------------------------------------------------------- serviços e comandos

const SERVICOS_FALADOS: [RegExp, ServicoId][] = [
  [/\bfiltro (de |do )?oleo\b/, 'filtro_oleo'],
  [/\bfiltro (de |do )?ar condicionado\b|\bfiltro (de |da )?cabine\b|\bfiltro de polen\b/, 'filtro_cabine'],
  [/\bfiltro (de |do )?ar\b/, 'filtro_ar'],
  [/\bfiltro (de |do )?(combustivel|gasolina|alcool|etanol|diesel)\b/, 'filtro_combustivel'],
  [/\bfluido (de |do )?freio\b|\boleo (de |do )?freio\b/, 'fluido_freio'],
  [/\b(oleo|fluido) (do |de )?cambio automatico\b|\bcambio automatico\b|\batf\b/, 'cambio_automatico'],
  [/\b(oleo|fluido) (do |de )?cambio\b|\bcambio manual\b/, 'cambio_manual'],
  [/\b(troca de oleo|trocar o oleo|troquei o oleo|oleo do motor|oleo)\b/, 'troca_oleo'],
  [/\bvelas?\b/, 'velas'],
  [/\bcorreia dentada\b/, 'correia_dentada'],
  [/\bcorreia\b/, 'correia_acessorios'],
  [/\bpastilhas?\b/, 'pastilhas'],
  [/\bdiscos?\b/, 'discos'],
  [/\barrefecimento\b|\bradiador\b|\baditivo\b/, 'arrefecimento'],
  [/\balinhamento\b|\balinhei\b|\bbalanceamento\b|\bbalanceei\b/, 'alinhamento'],
  [/\brodizio\b/, 'rodizio'],
  [/\bpneus?\b/, 'pneus'],
  [/\bbateria\b/, 'bateria'],
  [/\bamortecedor(es)?\b/, 'amortecedores'],
  [/\bhigieniza(cao|r|ei)\b|\blimpeza do ar\b/, 'higienizacao'],
  [/\bpalhetas?\b|\blimpador\b/, 'palhetas'],
  [/\brevisao\b/, 'revisao'],
  [/\bgnv\b|\bkit gas\b/, 'gnv']
];

/** Os serviços que ele citou: "troquei o óleo, o filtro de ar e alinhei". */
export function servicosFalados(texto: string): ServicoId[] {
  let t = ` ${limparFala(texto)} `;
  const achados: { s: ServicoId; onde: number }[] = [];
  for (const [re, s] of SERVICOS_FALADOS) {
    const m = t.match(re);
    if (m && m.index != null) {
      if (!achados.some((a) => a.s === s)) achados.push({ s, onde: m.index });
      // o que já foi reconhecido não conta de novo ("filtro de óleo" não vira também troca de óleo);
      // troca por espaços do mesmo tamanho para as posições continuarem valendo
      t = t.replace(new RegExp(re.source, 'g'), (x) => ' '.repeat(x.length));
    }
  }
  // na ordem em que ele falou
  return achados.sort((a, b) => a.onde - b.onde).map((a) => a.s);
}

export type Comando = 'voltar' | 'pular' | 'continuar' | 'parar' | 'sim' | 'nao';

/** Comandos curtos que valem em qualquer pergunta. */
export function comandoFalado(texto: string): Comando | null {
  const t = limparFala(texto).replace(/[.,!?]/g, '');
  if (/^(voltar|volta|anterior|pergunta anterior)$/.test(t)) return 'voltar';
  if (/^(pular|pula|proxima|proximo|deixa pra la|depois)$/.test(t)) return 'pular';
  if (/^(continuar|continua|seguir|segue|pode seguir|ok|certo|isso|isso mesmo|confirmar|confirma|pronto|beleza|so isso|e so isso|terminei)$/.test(t)) return 'continuar';
  if (/^(parar|para|cancelar|cancela|sair|desligar a voz|silencio)$/.test(t)) return 'parar';
  if (/^(sim|s|claro|pode|pode ser|positivo|com certeza|uhum|aham)$/.test(t)) return 'sim';
  if (/^(nao|n|negativo|nao quero|agora nao)$/.test(t)) return 'nao';
  return null;
}

/** Frio ou pago, na pergunta do tipo de orçamento. */
export function modalidadeFalada(texto: string): 'frio' | 'pago' | null {
  const t = limparFala(texto);
  if (/\b(pago|paga|cobrar|cobra|cobrado|com custo|com vistoria paga)\b/.test(t)) return 'pago';
  if (/\b(frio|gratis|gratuito|sem custo|sem cobrar|de graca|nao cobra)\b/.test(t)) return 'frio';
  return null;
}

/** Ordem de serviço ou orçamento, na primeira pergunta. */
export function tipoFalado(texto: string): 'ordem' | 'orcamento' | null {
  const t = limparFala(texto);
  if (/\borcamento\b/.test(t)) return 'orcamento';
  if (/\b(ordem|os|servico|servico feito|ja fiz|fiz)\b/.test(t)) return 'ordem';
  return null;
}

/**
 * Escolhe a opção mais parecida com o que ele falou (marca, linha, viscosidade).
 * Só devolve quando uma opção ganha com folga, para não escolher errado.
 */
export function escolherPorFala<T extends { id: string; texto: string }>(texto: string, opcoes: T[]): T | null {
  const palavras = (s: string) =>
    new Set(
      limparFala(s)
        .replace(/(\d{1,2})\s*w\s*-?\s*(\d{2})/g, '$1w$2')
        .replace(/\bcinco w trinta\b/g, '5w30')
        .replace(/\bcinco w quarenta\b/g, '5w40')
        .replace(/\bdez w quarenta\b/g, '10w40')
        .replace(/\bquinze w quarenta\b/g, '15w40')
        .replace(/\bvinte w cinquenta\b/g, '20w50')
        .replace(/\bzero w vinte\b/g, '0w20')
        .split(/[\s.,/-]+/)
        .filter((p) => p.length >= 2 && !['de', 'do', 'da', 'um', 'uma', 'o', 'a', 'e', 'com', 'foi', 'usei', 'coloquei', 'botei'].includes(p))
    );
  const fala = palavras(texto);
  if (!fala.size) return null;
  const notas = opcoes
    .map((o) => {
      const p = palavras(o.texto);
      let n = 0;
      for (const w of fala) if (p.has(w)) n += /\d/.test(w) ? 2 : 1;
      return { o, n };
    })
    .sort((a, b) => b.n - a.n);
  if (!notas.length || notas[0].n === 0) return null;
  if (notas[1] && notas[1].n === notas[0].n) return null;
  return notas[0].o;
}
