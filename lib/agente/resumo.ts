// O resumo da ordem que o agente manda de volta no WhatsApp.

import { formatarKm, formatarPlaca } from '../formatos';
import { servico } from '../manutencao';
import type { OrdemIA } from './esquema';

const URGENCIA: Record<OrdemIA['recomendacoes'][number]['urgencia'], string> = {
  agora: 'fazer agora',
  proxima_revisao: 'na próxima revisão',
  observar: 'observar'
};

export function textoDoResumo(o: OrdemIA): string {
  const carro = [o.placa ? formatarPlaca(o.placa) : null, [o.veiculo?.marca, o.veiculo?.modelo, o.veiculo?.ano].filter(Boolean).join(' ') || null, o.km ? formatarKm(o.km) : null]
    .filter(Boolean)
    .join(', ');
  const linhas = [
    '*Ordem de serviço montada*',
    carro ? `Carro: ${carro}` : 'Carro: não identificado (escolha no app)',
    o.servicos.length ? `Feito: ${o.servicos.map((s) => servico(s.servico).nome + (s.produto ? ` (${s.produto})` : '')).join('; ')}` : 'Nenhum serviço feito, só avaliação.',
    o.recomendacoes.length ? `Recomendado: ${o.recomendacoes.map((r) => `${r.texto} (${URGENCIA[r.urgencia]})`).join('; ')}` : null,
    o.duvidas.length ? `Conferir: ${o.duvidas.join('; ')}` : null,
    'A mensagem para o cliente vem logo abaixo.'
  ];
  return linhas.filter(Boolean).join('\n').slice(0, 3500);
}
