// O que cada papel da equipe pode fazer no painel. As mesmas regras estão no banco
// (privado.eh_equipe nas políticas e nas funções); aqui é para mostrar só o que a pessoa pode
// usar e responder rápido. Admin vale por todos os papéis. Sem nada de servidor aqui.

import type { PapelEquipe } from '@/lib/conta-dados';

/** Admin vale por todos os papéis. Sem lista, qualquer papel da equipe. */
export function temPapel(papel: PapelEquipe, papeis?: readonly PapelEquipe[]): boolean {
  return !papeis?.length || papel === 'admin' || papeis.includes(papel);
}

const TODOS: readonly PapelEquipe[] = [];

export const PODE = {
  ver: TODOS,
  mudarPedido: ['suporte'],
  mudarCadastro: ['suporte', 'financeiro'],
  criarLoja: ['suporte'],
  editarLoja: ['suporte', 'financeiro'],
  mudarContrato: ['financeiro'],
  convidarNaLoja: ['suporte'],
  decidirLoja: ['suporte', 'financeiro'],
  decidirImpulso: ['suporte', 'financeiro'],
  decidirBase: ['suporte'],
  verAssinaturas: ['financeiro', 'suporte'],
  criarCodigo: ['financeiro'],
  liberarAlertas: ['financeiro'],
  mudarPlano: ['financeiro'],
  numerosDeAssinatura: ['financeiro'],
  numeros: ['financeiro', 'suporte'],
  suporte: ['suporte'],
  titulares: ['suporte'],
  equipe: ['admin'],
  historico: ['admin'],
  acessos: ['admin']
} as const satisfies Record<string, readonly PapelEquipe[]>;

export type Permissao = keyof typeof PODE;

export function pode(papel: PapelEquipe, permissao: Permissao): boolean {
  return temPapel(papel, PODE[permissao]);
}

/** O nome do papel para a tela ("Admin", "Suporte", "Financeiro"). */
export function nomeDoPapelEquipe(papel: string): string {
  return papel === 'admin' ? 'Admin' : papel === 'suporte' ? 'Suporte' : papel === 'financeiro' ? 'Financeiro' : papel === 'sistema' ? 'Sistema' : papel;
}
