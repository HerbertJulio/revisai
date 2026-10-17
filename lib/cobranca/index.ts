import 'server-only';

/*
  Cobrança do Revisaí: a assinatura do Pro e a cobrança mensal das lojas, por gateway.
  Sem nenhum gateway configurado, a tela da assinatura mostra "Assinatura pelo WhatsApp da
  equipe" (o fluxo manual de /planos#assinar) e nada quebra.

  Asaas (Pix todo mês, cartão de crédito, boleto; e a nota fiscal de serviço, NFS-e):
    ASAAS_API_KEY          chave da API (Integrações > Chaves de API). Liga o Asaas.
    ASAAS_AMBIENTE         sandbox (padrão) ou producao.
    ASAAS_WEBHOOK_TOKEN    o "token de autenticação" cadastrado no webhook do Asaas, que volta no
                           cabeçalho asaas-access-token. Sem ele, os avisos do Asaas são recusados.
                           Endereço do webhook: https://<site>/api/pagamentos/asaas

  Nota fiscal (emitida pelo Asaas quando o pagamento confirma):
    NFSE_CODIGO_SERVICO    código do serviço na prefeitura (ex.: o item 01.03 da LC 116, ou o código
                           municipal). Liga a nota.
    NFSE_ID_SERVICO        id do serviço municipal no Asaas, quando a prefeitura pede (opcional).
    NFSE_NOME_SERVICO      descrição do serviço (padrão: "Licença de uso de software (SaaS) — Revisaí Pro").
    NFSE_ISS               alíquota do ISS em % (padrão: 2).

  Efí (Pix Automático; e o Pix com vencimento das lojas quando o Asaas não estiver ligado):
    EFI_CLIENT_ID, EFI_CLIENT_SECRET   credenciais da aplicação na Efí (API Pix).
    EFI_CERTIFICADO_BASE64             o certificado .p12 da aplicação, em base64.
    EFI_CERTIFICADO_SENHA              a senha do certificado (vazio quando não tem).
    EFI_AMBIENTE                       homologacao (padrão) ou producao.
    EFI_CHAVE_PIX                      a chave Pix da conta Efí que recebe.
    EFI_WEBHOOK_SEGREDO                segredo que vai no endereço do webhook cadastrado na Efí
                                       (Pix, recorrência e cobrança da recorrência):
                                       https://<site>/api/pagamentos/efi?s=<segredo>&ignorar=
                                       (a Efí acrescenta /pix no fim; a rota aceita os dois jeitos).
                                       Cadastre com x-skip-mtls-checking: true (a Vercel não pede
                                       certificado do cliente); o segredo é a conferência.

  Só no computador (nunca em produção):
    COBRANCA_PROVEDOR=teste            liga o gateway de mentira (lib/cobranca/teste.ts).
    COBRANCA_TESTE_SEGREDO             o cabeçalho x-teste-segredo dos avisos (padrão: segredo-de-teste).
*/

import { criarAsaas, type ConfigAsaas } from './asaas';
import { criarEfi, type ConfigEfi } from './efi';
import { criarTeste, SEGREDO_TESTE_PADRAO } from './teste';
import type { Metodo, NomeProvedor, Provedor } from './tipos';

type Ambiente = Record<string, string | undefined>;

export const NOME_DO_SERVICO = 'Licença de uso de software (SaaS) — Revisaí Pro';

function valor(env: Ambiente, nome: string): string | null {
  const v = (env[nome] ?? '').trim();
  return v ? v : null;
}

export function configAsaas(env: Ambiente = process.env): ConfigAsaas | null {
  const chave = valor(env, 'ASAAS_API_KEY');
  if (!chave) return null;
  const codigo = valor(env, 'NFSE_CODIGO_SERVICO');
  const iss = Number((valor(env, 'NFSE_ISS') ?? '2').replace(',', '.'));
  return {
    chave,
    ambiente: valor(env, 'ASAAS_AMBIENTE') === 'producao' ? 'producao' : 'sandbox',
    tokenWebhook: valor(env, 'ASAAS_WEBHOOK_TOKEN'),
    nota: codigo
      ? { codigoServico: codigo, idServico: valor(env, 'NFSE_ID_SERVICO'), nomeServico: valor(env, 'NFSE_NOME_SERVICO') ?? NOME_DO_SERVICO, iss: Number.isFinite(iss) ? iss : 2 }
      : null
  };
}

export function configEfi(env: Ambiente = process.env): ConfigEfi | null {
  const clienteId = valor(env, 'EFI_CLIENT_ID');
  const segredo = valor(env, 'EFI_CLIENT_SECRET');
  const certificado = valor(env, 'EFI_CERTIFICADO_BASE64');
  const chavePix = valor(env, 'EFI_CHAVE_PIX');
  if (!clienteId || !segredo || !certificado || !chavePix) return null;
  return {
    clienteId,
    segredo,
    certificado,
    senhaCertificado: env.EFI_CERTIFICADO_SENHA ?? '',
    ambiente: valor(env, 'EFI_AMBIENTE') === 'producao' ? 'producao' : 'homologacao',
    chavePix,
    segredoWebhook: valor(env, 'EFI_WEBHOOK_SEGREDO')
  };
}

/** O gateway de mentira só liga fora de produção, e só quando pedido. */
export function testeLigado(env: Ambiente = process.env): boolean {
  return env.COBRANCA_PROVEDOR === 'teste' && env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production';
}

export interface Gateways {
  teste: Provedor | null;
  asaas: Provedor | null;
  efi: Provedor | null;
}

export function gatewaysDoAmbiente(env: Ambiente = process.env): Gateways {
  const a = configAsaas(env);
  const e = configEfi(env);
  return {
    teste: testeLigado(env) ? criarTeste(valor(env, 'COBRANCA_TESTE_SEGREDO') ?? SEGREDO_TESTE_PADRAO) : null,
    asaas: a ? criarAsaas(a) : null,
    efi: e ? criarEfi(e) : null
  };
}

let gateways: Gateways | null = null;

function atuais(): Gateways {
  gateways ??= gatewaysDoAmbiente();
  return gateways;
}

/** O gateway que atende o jeito de pagar (o de teste atende tudo). */
export function provedorPara(metodo: Metodo, g: Gateways = atuais()): Provedor | null {
  if (g.teste) return g.teste;
  if (metodo === 'pix_automatico') return g.efi;
  return g.asaas;
}

/** Os jeitos de pagar disponíveis agora, na ordem da tela. */
export function metodosDisponiveis(g: Gateways = atuais()): Metodo[] {
  const ordem: Metodo[] = ['pix_automatico', 'pix', 'cartao', 'boleto'];
  return ordem.filter((m) => provedorPara(m, g)?.metodos.includes(m));
}

export function cobrancaLigada(g: Gateways = atuais()): boolean {
  return !!(g.teste || g.asaas || g.efi);
}

export function provedorPorNome(nome: string, g: Gateways = atuais()): Provedor | null {
  if (nome === 'teste') return g.teste;
  if (nome === 'asaas') return g.asaas;
  if (nome === 'efi') return g.efi;
  return null;
}

/** Quem emite a nota fiscal (a do próprio pagamento ou a avulsa). */
export function provedorDeNota(g: Gateways = atuais()): Provedor | null {
  if (g.teste) return g.teste;
  return g.asaas?.emiteNota ? g.asaas : null;
}

/** Quem gera o Pix da mensalidade das lojas. */
export function provedorAvulso(g: Gateways = atuais()): Provedor | null {
  return g.teste ?? g.asaas ?? g.efi;
}

export function ehNomeDeProvedor(v: string): v is NomeProvedor {
  return v === 'asaas' || v === 'efi' || v === 'teste';
}

export * from './tipos';
