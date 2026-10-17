// O texto que vai numa variável de modelo do WhatsApp (e de outros avisos que saem com o nome do
// Revisaí) pode ter sido escrito por qualquer pessoa: nome de oficina, de cliente, de produto, o
// serviço pedido pelo link. Sem link, e-mail ou número de telefone, a mensagem oficial do
// Revisaí não serve de isca para golpe.

const TLDS =
  'com|net|org|br|io|app|me|ly|link|site|online|shop|store|xyz|info|top|click|club|vip|live|pro|biz|co|us|tk|ml|ga|cf|gq|pw|cc|ru|cn|in|to|gg|sh|tv|ws|page|dev|website|space|fun|icu|buzz|cam|rest|bar|sbs|cfd|lat';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK_COM_ESQUEMA = /\b(?:https?:\/\/|www\.)\S+/gi;
const DOMINIO_CONHECIDO = new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/\\S*)?`, 'gi');
const DOMINIO_COM_CAMINHO = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*/gi;
const NUMERO_LONGO = /[+(]?\d[\d\s().-]{6,}\d/g;

/** Tira links, e-mails e números de telefone (8 dígitos ou mais) e corta no tamanho. */
export function textoSeguro(texto: string, max: number): string {
  let s = (texto ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(EMAIL, '[e-mail]');
  s = s.replace(LINK_COM_ESQUEMA, '[link]');
  s = s.replace(DOMINIO_CONHECIDO, '[link]');
  s = s.replace(DOMINIO_COM_CAMINHO, '[link]');
  s = s.replace(NUMERO_LONGO, (m) => (m.replace(/\D/g, '').length >= 8 ? '[número]' : m));
  return s.slice(0, max).trim() || '-';
}
