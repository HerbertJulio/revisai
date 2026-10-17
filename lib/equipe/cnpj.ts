import 'server-only';
import { cnpjValido, soNumeros } from '@/lib/cnpj';
import { lerDadosCnpj, type DadosCnpj } from './cnpj-dados';

// Consulta os dados públicos do CNPJ na BrasilAPI (que repassa a base da Receita Federal).
// Se a consulta falhar, a equipe confere no site da Receita: nada aqui impede a análise.

export type ConsultaCnpj = { ok: true; dados: DadosCnpj } | { ok: false; erro: string };

const ENDERECO = 'https://brasilapi.com.br/api/cnpj/v1/';

export async function consultarCnpj(valor: string): Promise<ConsultaCnpj> {
  const cnpj = soNumeros(valor);
  if (!cnpjValido(cnpj)) return { ok: false, erro: 'O CNPJ não confere (os dígitos finais estão errados).' };
  try {
    const r = await fetch(`${ENDERECO}${cnpj}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 60 * 60 * 24 }
    });
    if (r.status === 404) return { ok: false, erro: 'A Receita não achou este CNPJ.' };
    if (r.status === 429) return { ok: false, erro: 'A consulta do CNPJ está ocupada agora. Atualize a página em alguns minutos.' };
    if (!r.ok) return { ok: false, erro: 'A consulta do CNPJ não respondeu agora. Confira no site da Receita.' };
    const dados = lerDadosCnpj(await r.json());
    return dados ? { ok: true, dados } : { ok: false, erro: 'A consulta do CNPJ voltou num formato diferente. Confira no site da Receita.' };
  } catch {
    return { ok: false, erro: 'Não deu para consultar o CNPJ agora. Confira no site da Receita.' };
  }
}
