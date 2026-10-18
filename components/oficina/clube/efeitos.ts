'use client';

// Quando a ordem é concluída: se o carro é de um membro ativo do clube e a ordem tem um serviço
// incluído no plano que ainda cabe no ano, o uso fica registrado no membro (uma vez por ordem).

import { membroDoCarro, usosDaOrdem } from '@/lib/clube';
import { hojeISO } from '@/lib/datas';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { cartaoMudou } from './cartao';

export function aoConcluirClube(documentoId: Id): void {
  const s = useOficina.getState();
  const doc = s.documentos[documentoId];
  if (!doc || doc.tipo !== 'ordem') return;
  const veiculo = doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined;
  const membro = membroDoCarro(Object.values(s.clubeMembros), veiculo);
  const plano = membro ? s.clubePlanos[membro.planoId] : undefined;
  if (!membro || !plano) return;
  const dia = doc.concluidoEm ? hojeISO(new Date(doc.concluidoEm)) : hojeISO();
  const novos = usosDaOrdem(doc, membro, plano, dia);
  if (!novos.length) return;
  s.salvarRegistro('clubeMembros', { ...membro, usos: [...membro.usos, ...novos] });
  cartaoMudou(membro.id);
}
