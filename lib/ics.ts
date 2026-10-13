// Arquivo de calendário (.ics) com os vencimentos, para o cliente salvar lembretes no celular.

import { somarDias } from './datas';

export interface EventoCalendario {
  uid: string;
  titulo: string;
  data: string;
  descricao?: string;
}

function escapar(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Quebra linhas longas como pede a RFC 5545 (75 octetos). */
function dobrar(linha: string): string {
  const bytes = new TextEncoder().encode(linha);
  if (bytes.length <= 75) return linha;
  const partes: string[] = [];
  let atual = '';
  let tamanho = 0;
  for (const ch of linha) {
    const n = new TextEncoder().encode(ch).length;
    if (tamanho + n > (partes.length ? 74 : 75)) {
      partes.push(atual);
      atual = '';
      tamanho = 0;
    }
    atual += ch;
    tamanho += n;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

function carimbo(agora: Date): string {
  return agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function gerarIcs(eventos: EventoCalendario[], agora: Date = new Date()): string {
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Revisai//Manutencao//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of eventos) {
    const inicio = e.data.replace(/-/g, '');
    const fim = somarDias(e.data, 1).replace(/-/g, '');
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${carimbo(agora)}`,
      `DTSTART;VALUE=DATE:${inicio}`,
      `DTEND;VALUE=DATE:${fim}`,
      `SUMMARY:${escapar(e.titulo)}`,
      ...(e.descricao ? [`DESCRIPTION:${escapar(e.descricao)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapar(e.titulo)}`,
      'TRIGGER:-P7D',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}
