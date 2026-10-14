// O relato do mecânico: o que ele falou (o áudio passado para texto) ou escreveu. É o texto que
// a IA usa para preencher a ordem de serviço, e fica guardado junto com ela.

export const MAX_RELATO = 20_000;

/** O erro de quando o áudio não tem fala que dê para entender (o app oferece gravar de novo). */
export const SEM_FALA = 'Não deu para entender o áudio. Grave de novo, com o celular mais perto da boca.';

/** Apara a resposta da transcrição. Volta vazio quando não houve fala que desse para entender. */
export function limparTranscricao(texto: string): string {
  let t = String(texto ?? '').trim();
  t = t.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
  t = t.replace(/^(transcri[çc][ãa]o|texto)\s*:\s*/i, '').trim();
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  const semMarcas = t.replace(/\[(inaud[íi]vel|sem fala)\]/gi, '').replace(/[\s.,;:!?…-]+/g, '');
  if (!semMarcas) return '';
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, MAX_RELATO);
}

/** Junta um trecho novo ao que já foi falado, com uma linha em branco entre os dois. */
export function juntarRelato(atual: string, novo: string): string {
  const a = atual.trim();
  const b = novo.trim();
  return (a && b ? `${a}\n\n${b}` : a || b).slice(0, MAX_RELATO);
}
