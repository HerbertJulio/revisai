// Formatos brasileiros: placa, telefone, quilometragem e dinheiro.

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function apenasDigitos(t: string): string {
  return (t ?? '').replace(/\D+/g, '');
}

/** Placa só com letras e números, em maiúsculas: 'ABC1D23' ou 'ABC1234'. */
export function normalizarPlaca(p: string): string {
  return (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

/** Aceita o padrão antigo (ABC1234) e o Mercosul (ABC1D23). */
export function placaValida(p: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(p));
}

/** 'ABC-1234' no padrão antigo; 'ABC1D23' no Mercosul. */
export function formatarPlaca(p: string): string {
  const n = normalizarPlaca(p);
  if (/^[A-Z]{3}[0-9]{4}$/.test(n)) return `${n.slice(0, 3)}-${n.slice(3)}`;
  return n;
}

/** Telefone com DDI 55 ('5521987654321'), ou null se não parecer um celular/fixo brasileiro. */
export function normalizarTelefone(t: string): string | null {
  let d = apenasDigitos(t);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return d;
}

/** '(21) 98765-4321'. */
export function formatarTelefone(t: string): string {
  const n = normalizarTelefone(t);
  if (!n) return t;
  const ddd = n.slice(2, 4);
  const resto = n.slice(4);
  return resto.length === 9 ? `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}` : `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}

export function formatarKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '';
  return `${inteiro.format(Math.round(km))} km`;
}

export function formatarNumero(n: number | null | undefined, casas = 0): string {
  if (n == null || !Number.isFinite(n)) return '';
  return casas === 0 ? inteiro.format(Math.round(n)) : decimal.format(n);
}

export function formatarMoeda(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return real.format(n);
}

/** Lê números digitados no jeito brasileiro: '40.000', '3,75', '40000'. */
export function lerNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  if (!texto) return null;
  let t = String(texto).trim().replace(/\s|km|l$/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** O nome que o passo a passo usa quando o mecânico não sabe quem é o dono. */
export const SEM_NOME = 'Cliente sem nome';

export function primeiroNome(nome: string): string {
  const n = (nome ?? '').trim();
  if (!n || n === SEM_NOME) return '';
  return n.split(/\s+/)[0] ?? '';
}

/** A primeira letra maiúscula, só ela ("outubro de 2026" vira "Outubro de 2026"). */
export function inicialMaiuscula(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** A frase com a primeira letra minúscula, para entrar no meio de outra ("R$" e nomes ficam como estão). */
export function noMeioDaFrase(t: string): string {
  const s = t.trim();
  return /^[A-ZÀ-Ú][a-zà-ú]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function plural(n: number, um: string, varios: string): string {
  return `${formatarNumero(n)} ${n === 1 ? um : varios}`;
}
