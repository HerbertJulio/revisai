import 'server-only';

/*
  Notas fiscais da oficina (NFS-e da mão de obra e NF-e das peças), por um emissor de notas.
  Cada oficina é uma empresa no emissor; o certificado A1 e a senha vão direto para ele e o
  Revisaí não guarda nenhum dos dois. Sem emissor configurado, as telas explicam que as notas
  ainda não estão ligadas e nada quebra.

  Emissor escolhido: Focus NFe (https://doc.focusnfe.com.br). Várias empresas numa conta só,
  NFS-e Nacional (Emissor Nacional) e das prefeituras, NF-e modelo 55, REST/JSON, gatilhos
  (webhooks) e ambiente de homologação.

    FISCAL_PROVEDOR         focus (o padrão quando há FOCUS_NFE_TOKEN) ou teste (só no computador).
    FOCUS_NFE_TOKEN         o token principal da conta na Focus NFe (Token Master). Cadastra as
                            empresas; cada empresa ganha os tokens dela, guardados cifrados no banco.
    FISCAL_CHAVE            segredo com 32 caracteres ou mais que cifra os tokens das empresas no
                            banco (openssl rand -hex 32). Sem ele, a Focus fica desligada.
    FISCAL_WEBHOOK_SEGREDO  segredo que a Focus manda no cabeçalho X-Revisai-Fiscal de cada aviso.
                            Os gatilhos são criados sozinhos ao salvar o cadastro fiscal, apontando
                            para <SITE_URL>/api/fiscal/focus. Sem ele, não há gatilho: o app consulta
                            a nota enquanto ela processa.
    SITE_URL                o endereço do site (padrão https://revisai.howlks.com).

  Só no computador (nunca em produção):
    FISCAL_PROVEDOR=teste   liga o emissor de mentira (lib/fiscal/teste.ts).
    FISCAL_TESTE_SEGREDO    o cabeçalho x-teste-segredo dos avisos (padrão segredo-de-teste).
*/

import { createHash } from 'node:crypto';
import { criarFocus, type ConfigFocus } from './focus';
import { criarTesteFiscal, SEGREDO_FISCAL_TESTE_PADRAO } from './teste';
import type { NomeProvedorFiscal, ProvedorFiscal } from './tipos';

type Ambiente = Record<string, string | undefined>;

function valor(env: Ambiente, nome: string): string | null {
  const v = (env[nome] ?? '').trim();
  return v ? v : null;
}

export function siteUrl(env: Ambiente = process.env): string {
  return (valor(env, 'SITE_URL') ?? 'https://revisai.howlks.com').replace(/\/+$/, '');
}

/** A chave que cifra os tokens das empresas no banco (null sem FISCAL_CHAVE com 32 ou mais caracteres). */
export function chaveFiscal(env: Ambiente = process.env): Buffer | null {
  const s = valor(env, 'FISCAL_CHAVE');
  return s && s.length >= 32 ? createHash('sha256').update(`revisai-fiscal:${s}`).digest() : null;
}

export function configFocus(env: Ambiente = process.env): ConfigFocus | null {
  const token = valor(env, 'FOCUS_NFE_TOKEN');
  const escolhido = valor(env, 'FISCAL_PROVEDOR');
  if (!token || (escolhido && escolhido !== 'focus') || !chaveFiscal(env)) return null;
  return { tokenConta: token, segredoWebhook: valor(env, 'FISCAL_WEBHOOK_SEGREDO'), urlWebhook: `${siteUrl(env)}/api/fiscal/focus` };
}

/** O emissor de mentira só liga fora de produção, e só quando pedido. */
export function testeFiscalLigado(env: Ambiente = process.env): boolean {
  return env.FISCAL_PROVEDOR === 'teste' && env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production';
}

export function provedorFiscalDoAmbiente(env: Ambiente = process.env): ProvedorFiscal | null {
  if (testeFiscalLigado(env)) return criarTesteFiscal(valor(env, 'FISCAL_TESTE_SEGREDO') ?? SEGREDO_FISCAL_TESTE_PADRAO);
  const f = configFocus(env);
  return f ? criarFocus(f) : null;
}

let atual: ProvedorFiscal | null | undefined;

/** O emissor configurado neste servidor (null: as notas não estão ligadas). */
export function provedorFiscal(): ProvedorFiscal | null {
  if (atual === undefined) atual = provedorFiscalDoAmbiente();
  return atual;
}

/** O emissor de uma nota já emitida (pelo nome guardado nela), se ainda estiver ligado. */
export function provedorFiscalPorNome(nome: string): ProvedorFiscal | null {
  const p = provedorFiscal();
  return p && p.nome === nome ? p : null;
}

export function ehNomeFiscal(v: string): v is NomeProvedorFiscal {
  return v === 'focus' || v === 'teste';
}

export * from './tipos';
