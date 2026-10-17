import 'server-only';
import { createHash } from 'node:crypto';
import { lerConsultaDePlaca, montarDados, type RespostaDaPlaca } from '@/lib/placa';

// Quem responde a consulta da placa. PLACA_API_PROVEDOR escolhe ('consultadeplaca', o padrão
// quando há PLACA_API_TOKEN; ou 'teste', um provedor de mentira que só existe fora de produção,
// para testar a tela sem gastar consultas). A consultadeplaca.net (API v1) cobra por placa
// consultada, achando ou não; quando ela falha (fora do ar, sem saldo), nada é cobrado.

export type Provedor = 'consultadeplaca' | 'teste';

export interface ConfigDaPlaca {
  provedor: Provedor;
  token: string;
}

export type ResultadoDaConsulta = RespostaDaPlaca | { tipo: 'falhou'; mensagem: string };

/** O provedor ligado neste servidor (null: a busca pela placa não está disponível aqui). */
export function configDaPlaca(): ConfigDaPlaca | null {
  const nome = (process.env.PLACA_API_PROVEDOR ?? '').trim().toLowerCase();
  const token = (process.env.PLACA_API_TOKEN ?? '').trim();
  if (nome === 'teste') return process.env.NODE_ENV === 'production' ? null : { provedor: 'teste', token: '' };
  if ((nome === '' || nome === 'consultadeplaca') && token) return { provedor: 'consultadeplaca', token };
  return null;
}

/** O modo de teste está ligado (placa e FIPE de mentira, só fora de produção). */
export function emModoDeTeste(): boolean {
  return configDaPlaca()?.provedor === 'teste';
}

export async function consultarPlaca(placa: string, cfg: ConfigDaPlaca): Promise<ResultadoDaConsulta> {
  return cfg.provedor === 'teste' ? consultaDeTeste(placa) : consultaDePlacaNet(placa, cfg.token);
}

// ---------------------------------------------------------------- consultadeplaca.net

const URL_CONSULTA = 'https://consultadeplaca.net/api/v1/lookups';

/** A mesma placa no mesmo dia usa a mesma chave: repetir o pedido não cobra de novo. */
function chaveDeIdempotencia(placa: string): string {
  const dia = new Date().toISOString().slice(0, 10);
  const h = createHash('sha256').update(`revisai-placa:${placa}:${dia}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function consultaDePlacaNet(placa: string, token: string): Promise<ResultadoDaConsulta> {
  const chave = chaveDeIdempotencia(placa);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let res: Response;
    try {
      res = await fetch(URL_CONSULTA, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': chave },
        body: JSON.stringify({ plate: placa }),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store'
      });
    } catch (e) {
      console.warn('[placa] provedor não respondeu', e instanceof Error ? e.message : e);
      return { tipo: 'falhou', mensagem: 'O serviço de placas não respondeu. Tente de novo em instantes ou preencha à mão.' };
    }
    const json = (await res.json().catch(() => null)) as { code?: string } | null;
    if (res.ok) {
      const r = lerConsultaDePlaca(json, placa);
      if (r) return r;
      console.error('[placa] resposta fora do formato', res.status);
      return { tipo: 'falhou', mensagem: 'O serviço de placas respondeu de um jeito que o app não entende. Preencha à mão.' };
    }
    const codigo = json?.code ?? '';
    // o mesmo pedido ainda está andando do outro lado: espera e pergunta de novo
    if (res.status === 409 && codigo === 'idempotency_in_progress' && tentativa === 0) {
      await espera(2500);
      continue;
    }
    if (res.status === 422) return { tipo: 'falhou', mensagem: 'O serviço de placas não aceitou essa placa. Confira as letras e os números.' };
    if (res.status === 429) return { tipo: 'falhou', mensagem: 'Muitas consultas ao mesmo tempo. Tente de novo em um minuto.' };
    if (res.status === 402) {
      console.error('[placa] sem saldo no provedor', codigo);
      return { tipo: 'falhou', mensagem: 'A consulta de placa está sem crédito agora. Preencha à mão e avise o suporte do Revisaí.' };
    }
    if (res.status === 401 || res.status === 403) {
      console.error('[placa] o provedor recusou a chave', res.status, codigo);
      return { tipo: 'falhou', mensagem: 'A consulta de placa está fora do ar agora. Preencha à mão.' };
    }
    console.warn('[placa] provedor', res.status, codigo);
    return { tipo: 'falhou', mensagem: 'O serviço de placas não respondeu. Tente de novo em instantes ou preencha à mão.' };
  }
  return { tipo: 'falhou', mensagem: 'O serviço de placas está demorando. Tente de novo em instantes.' };
}

// ---------------------------------------------------------------- de mentira (fora de produção)

/** Os carros de mentira: a primeira letra da placa escolhe (A a F, G a L, M a R, S a Z). */
const CARROS_DE_TESTE = [
  { marca: 'CHEVROLET', modelo: 'ONIX', versao: '1.0MT LT', ano: 2019, anoModelo: 2020, cor: 'PRATA', combustivel: 'ALCOOL/GASOLINA', municipio: 'GUAPIMIRIM', uf: 'RJ', fipeCodigo: '004478-1', fipeValor: '58123.00' },
  { marca: 'VOLKSWAGEN', modelo: 'GOL', versao: '1.6 MSI', ano: 2018, anoModelo: 2018, cor: 'BRANCA', combustivel: 'FLEX', municipio: 'TERESOPOLIS', uf: 'RJ', fipeCodigo: '005340-3', fipeValor: '47250.00' },
  { marca: 'FIAT', modelo: 'ARGO', versao: '1.0 DRIVE', ano: 2021, anoModelo: 2022, cor: 'VERMELHA', combustivel: 'ALCOOL/GASOLINA', municipio: 'MAGE', uf: 'RJ', fipeCodigo: '001495-8', fipeValor: '69900.00' },
  { marca: 'HYUNDAI', modelo: 'HB20', versao: '1.0M COMFORT', ano: 2020, anoModelo: 2021, cor: 'PRETA', combustivel: 'FLEX', municipio: 'RIO DE JANEIRO', uf: 'RJ', fipeCodigo: '015137-8', fipeValor: '63400.00' }
];

function consultaDeTeste(placa: string): ResultadoDaConsulta {
  if (placa.startsWith('ZZZ')) return { tipo: 'nao_achou' };
  if (placa.startsWith('ERR')) return { tipo: 'falhou', mensagem: 'O serviço de placas não respondeu. Tente de novo em instantes ou preencha à mão.' };
  const letra = placa.charCodeAt(0) - 65;
  const carro = CARROS_DE_TESTE[Math.min(3, Math.max(0, Math.floor(letra / 6)))];
  return { tipo: 'achou', dados: montarDados(placa, carro) };
}
