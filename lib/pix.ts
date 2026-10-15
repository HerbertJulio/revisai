// Código Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central) com o valor do pedido.
// O dinheiro vai direto para a chave do fornecedor; o Revisaí não passa pelo pagamento.

export type TipoChavePix = 'cnpj' | 'cpf' | 'email' | 'telefone' | 'aleatoria';

function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como o BR Code pede. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Só letras, números, espaço e pontuação simples, no tamanho que o BR Code aceita. */
function textoPix(t: string, max: number): string {
  return semAcento(t)
    .replace(/[^A-Za-z0-9 .,\-/]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** A chave como vai no código: telefone com +55, documento só com números, e-mail em minúsculas. */
export function normalizarChavePix(tipo: TipoChavePix, chave: string): string | null {
  const t = chave.trim();
  switch (tipo) {
    case 'cpf': {
      const d = t.replace(/\D/g, '');
      return d.length === 11 ? d : null;
    }
    case 'cnpj': {
      // desde julho de 2026 há CNPJ com letras: 12 letras ou números e 2 dígitos verificadores
      const d = t.toUpperCase().replace(/[^0-9A-Z]/g, '');
      return /^[0-9A-Z]{12}\d{2}$/.test(d) ? d : null;
    }
    case 'telefone': {
      let d = t.replace(/\D/g, '');
      if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
      return d.length === 10 || d.length === 11 ? `+55${d}` : null;
    }
    case 'email': {
      const e = t.toLowerCase();
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 77 ? e : null;
    }
    case 'aleatoria': {
      const a = t.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a) ? a : null;
    }
  }
}

/** Identificador do pagamento: até 25 letras e números ("***" quando não tem). */
export function txidPix(texto: string): string {
  const t = semAcento(texto).replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  return t || '***';
}

export interface DadosPix {
  chave: string;
  nome: string;
  cidade: string;
  valor?: number | null;
  txid?: string;
  descricao?: string;
}

/** Monta o BR Code. A chave já deve vir normalizada (normalizarChavePix). */
export function codigoPix(d: DadosPix): string {
  const descricao = d.descricao ? textoPix(d.descricao, Math.max(0, 99 - 4 - 18 - 4 - d.chave.length - 4)) : '';
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', d.chave) + (descricao ? campo('02', descricao) : '');
  const partes = [
    campo('00', '01'),
    campo('26', conta),
    campo('52', '0000'),
    campo('53', '986'),
    d.valor != null && d.valor > 0 ? campo('54', (Math.round(d.valor * 100) / 100).toFixed(2)) : '',
    campo('58', 'BR'),
    campo('59', textoPix(d.nome, 25) || 'RECEBEDOR'),
    campo('60', textoPix(d.cidade, 15) || 'BRASIL'),
    campo('62', campo('05', d.txid ? txidPix(d.txid) : '***'))
  ].join('');
  const semCrc = `${partes}6304`;
  return semCrc + crc16(semCrc);
}

/** A chave como a pessoa lê: CNPJ e CPF com pontos, celular com DDD. */
export function formatarChavePix(tipo: TipoChavePix, chave: string): string {
  const d = chave.replace(/\D/g, '');
  const cnpj = chave.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (tipo === 'cnpj' && cnpj.length === 14) return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
  if (tipo === 'cpf' && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (tipo === 'telefone') {
    const n = d.startsWith('55') ? d.slice(2) : d;
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  }
  return chave;
}
