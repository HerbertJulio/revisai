import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Documento, Id } from '@/lib/tipos';

/**
 * Como cada parte nova do app da oficina se liga às telas que já existem, sem que uma parte
 * mexa no código da outra: cada arquivo desta pasta exporta uma `Extensao`, e o index junta todas.
 */
export interface Extensao {
  /** Telas novas (aparecem no menu "Mais"). `soGestao`: só para dono e gerente. */
  telas?: { href: string; rotulo: string; descricao: string; Icone: LucideIcon; soGestao?: boolean }[];
  /** Blocos no detalhe do orçamento ou da ordem (cada um decide quando aparece). */
  paineisDaOrdem?: ComponentType<{ doc: Documento }>[];
  /** Blocos na página do carro. */
  paineisDoCarro?: ComponentType<{ veiculoId: Id }>[];
  /** Blocos no início, abaixo do resumo do dia. */
  paineisDoInicio?: ComponentType[];
  /** Depois que a ordem foi concluída (o serviço já está registrado e o estoque baixado). */
  aoConcluir?: (documentoId: Id) => void;
  /** Depois que o orçamento foi aprovado (recusadas: as linhas que o cliente não quis). */
  aoAprovar?: (orcamentoId: Id, ordemId: Id, recusadas: Id[]) => void;
  /** Depois que o cliente recusou o orçamento inteiro. */
  aoRecusar?: (orcamentoId: Id) => void;
}
