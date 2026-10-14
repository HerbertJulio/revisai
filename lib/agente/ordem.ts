// A ordem de serviço guardada no aparelho, depois que o mecânico confere o rascunho da IA.
// Áudios e fotos ficam no IndexedDB à parte (lib/midia.ts); aqui só a referência.

import type { Id } from '../tipos';
import type { OrdemIA } from './esquema';

export interface MidiaDaOrdem {
  id: string;
  tipo: 'audio' | 'foto';
  mime: string;
  legenda?: string;
}

export interface OrdemServico {
  id: Id;
  criadoEm: string;
  origem: 'app' | 'whatsapp';
  veiculoId: Id | null;
  atendimentoId: Id | null;
  ia: OrdemIA;
  midias: MidiaDaOrdem[];
  modelo?: string;
}
