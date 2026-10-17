import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chaveDoSistema, clienteSistema, configSupabase } from './supabase-servidor';

// A equipe entra com conta própria (código no e-mail e app autenticador) e o painel fala com o
// banco como a pessoa que entrou (lib/equipe/sessao.ts). Não existe mais senha da equipe.
// Ficam aqui só os nomes antigos que outros módulos ainda usam para falar com o banco como o
// próprio servidor, até cada um passar a usar clienteSistema direto.

export interface ConfigEquipe {
  /** A chave do sistema (SISTEMA_CHAVE, ou EQUIPE_CHAVE enquanto a troca não for feita). */
  chave: string;
  url: string;
  chavePublica: string;
}

/** @deprecated Use chaveDoSistema() e configSupabase() de lib/supabase-servidor. */
export function configEquipe(): ConfigEquipe | null {
  const c = configSupabase();
  const chave = chaveDoSistema();
  return c && chave ? { chave, url: c.url, chavePublica: c.chave } : null;
}

/**
 * @deprecated Use clienteSistema() de lib/supabase-servidor. O banco não aceita mais a chave da
 * equipe: este cliente é o do sistema e nunca deve ser usado no painel da equipe.
 */
export function clienteEquipe(): SupabaseClient | null {
  return clienteSistema();
}
