// Os dados da empresa que aparecem nos documentos legais, no rodapé do site e nos e-mails.
// Vêm das variáveis de ambiente; enquanto não forem preenchidas, aparece o aviso [a preencher].

export interface DadosDaEmpresa {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  emailPrivacidade: string;
  emailContato: string;
  /** O foro como entra no texto: "da comarca de Rio de Janeiro/RJ" (EMPRESA_FORO) ou "do domicílio da empresa". */
  foro: string;
  site: string;
  /** Algum dado ainda não foi preenchido. */
  incompleto: boolean;
}

export const A_PREENCHER = '[a preencher]';

function valor(nome: string): string {
  return (process.env[nome] ?? '').trim();
}

function formatarCnpj(v: string): string {
  const c = v.replace(/\D/g, '');
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : v;
}

export function dadosDaEmpresa(): DadosDaEmpresa {
  const razaoSocial = valor('EMPRESA_RAZAO_SOCIAL');
  const cnpj = valor('EMPRESA_CNPJ');
  const endereco = valor('EMPRESA_ENDERECO');
  const emailPrivacidade = valor('EMPRESA_EMAIL_PRIVACIDADE');
  const emailContato = valor('EMPRESA_EMAIL_CONTATO') || emailPrivacidade;
  const foro = valor('EMPRESA_FORO');
  return {
    razaoSocial: razaoSocial || A_PREENCHER,
    cnpj: cnpj ? formatarCnpj(cnpj) : A_PREENCHER,
    endereco: endereco || A_PREENCHER,
    emailPrivacidade: emailPrivacidade || A_PREENCHER,
    emailContato: emailContato || A_PREENCHER,
    foro: foro ? `da comarca de ${foro}` : 'do domicílio da empresa',
    site: (valor('SITE_URL') || 'https://revisai.howlks.com').replace(/\/+$/, ''),
    incompleto: !razaoSocial || !cnpj || !endereco || !emailPrivacidade
  };
}

/** Uma linha com a empresa, para o rodapé dos e-mails. */
export function linhaDaEmpresa(e: DadosDaEmpresa = dadosDaEmpresa()): string {
  const partes = [e.razaoSocial !== A_PREENCHER ? e.razaoSocial : 'Revisaí', e.cnpj !== A_PREENCHER ? `CNPJ ${e.cnpj}` : null, e.endereco !== A_PREENCHER ? e.endereco : null];
  return partes.filter(Boolean).join(' · ');
}
