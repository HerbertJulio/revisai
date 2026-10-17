// Emissor de notas de mentira, para testar as notas de ponta a ponta no computador
// (FISCAL_PROVEDOR=teste). Nunca liga em produção (o index confere). A nota fica processando até
// chegar o aviso, mandado à mão para /api/fiscal/teste com o cabeçalho x-teste-segredo:
//   { "id": "evt_1", "externo": "<referência da nota>", "situacao": "autorizada", "numero": "1" }
//   { "id": "evt_2", "externo": "<referência da nota>", "situacao": "erro", "mensagem": "Recusada" }

import { timingSafeEqual } from 'node:crypto';
import { rotaDaReferencia } from './payload';
import { ErroFiscal, type EventoFiscal, type ProvedorFiscal, type SituacaoNota } from './tipos';

export const SEGREDO_FISCAL_TESTE_PADRAO = 'segredo-de-teste';
const BASE = 'https://example.com/revisai-fiscal';

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function texto(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
}

const SITUACOES: SituacaoNota[] = ['processando', 'autorizada', 'erro', 'cancelada'];

export function eventoTeste(corpo: unknown): EventoFiscal | null {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const id = texto(c.id);
  const externo = texto(c.externo, 80);
  const situacao = SITUACOES.find((s) => s === c.situacao);
  if (!id || !externo || !situacao) return null;
  const rota = rotaDaReferencia(externo);
  const autorizada = situacao === 'autorizada' || situacao === 'cancelada';
  return {
    id: `teste:${id}`,
    tipo: rota === 'nfe' ? 'nfe' : 'nfse',
    nota: {
      externo,
      situacao,
      numero: texto(c.numero, 40) ?? (autorizada ? '1' : null),
      serie: texto(c.serie, 10),
      chave: texto(c.chave, 80),
      urlPdf: autorizada ? `${BASE}/${externo}.pdf` : null,
      urlXml: autorizada ? `${BASE}/${externo}.xml` : null,
      mensagem: texto(c.mensagem, 900)
    }
  };
}

export function criarTesteFiscal(segredo: string = SEGREDO_FISCAL_TESTE_PADRAO): ProvedorFiscal {
  return {
    nome: 'teste',

    async cadastrarEmpresa(e, atual) {
      return { credenciais: { empresaId: atual?.empresaId ?? `emp_teste_${e.cnpj}`, tokens: {} }, certificadoValidoAte: null };
    },

    async enviarCertificado(_c, _cnpj, arquivoBase64, senha) {
      if (arquivoBase64.length < 16) throw new ErroFiscal('O arquivo do certificado está vazio ou não é um certificado A1.');
      if (!senha) throw new ErroFiscal('Escreva a senha do certificado.');
      if (senha === 'senha-errada') throw new ErroFiscal('A senha não abre este certificado. Confira e mande de novo.');
      return { validoAte: new Date(Date.now() + 365 * 86_400_000).toISOString() };
    },

    async emitirNfse(n) {
      return { externo: n.referencia, situacao: 'processando' };
    },

    async emitirNfe(n) {
      return { externo: n.referencia, situacao: 'processando' };
    },

    async consultar(_tipo, externo) {
      // o emissor de mentira não guarda nada: quem muda a nota é o aviso
      return { externo, situacao: 'processando' };
    },

    async cancelar(_tipo, externo) {
      return { externo, situacao: 'cancelada', mensagem: 'Cancelada no emissor de teste.' };
    },

    validarWebhook(p) {
      return iguais(p.cabecalhos.get('x-teste-segredo') ?? '', segredo);
    },

    lerEvento(corpo) {
      return eventoTeste(corpo);
    }
  };
}
