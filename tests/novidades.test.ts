import { describe, expect, it } from 'vitest';
import type { AlertaDaOficina, RespostaDoAlerta } from '@/lib/alertas-dados';
import type { PedidoAcompanhado } from '@/lib/entregas-dados';
import { fotografar, novidades } from '@/lib/novidades';

const resposta = (id: string, fornecedor: string, tipo: RespostaDoAlerta['tipo'] = 'aceita') => ({ id, fornecedor, tipo }) as RespostaDoAlerta;
const alerta = (respostas: RespostaDoAlerta[]) => ({ id: 'a', titulo: 'Tecfil PSL 315', respostas }) as AlertaDaOficina;
const pedido = (status: string, pagamento = 'pendente') =>
  ({ codigo: 'K7P2MX', partes: [{ fornecedorId: 2, fornecedor: 'Central de Filtros', status, pagamento }] }) as unknown as PedidoAcompanhado;

describe('novidades da loja', () => {
  it('na primeira olhada não avisa nada', () => {
    expect(novidades(null, [alerta([resposta('r1', 'Central de Filtros')])], [pedido('novo')])).toEqual([]);
  });

  it('avisa resposta nova (não recusa), saída, entrega e Pix confirmado', () => {
    const antes = fotografar([alerta([])], [pedido('confirmado')]);
    expect(novidades(antes, [alerta([resposta('r1', 'Central de Filtros'), resposta('r2', 'Distribuidora', 'recusa')])], [pedido('saiu_entrega', 'confirmado')])).toEqual([
      'A Central de Filtros respondeu o seu alerta de Tecfil PSL 315.',
      'O pedido K7P2MX da Central de Filtros saiu para entrega.',
      'A Central de Filtros confirmou o pagamento do pedido K7P2MX.'
    ]);
    const depois = fotografar([alerta([resposta('r1', 'Central de Filtros')])], [pedido('saiu_entrega', 'confirmado')]);
    expect(novidades(depois, [alerta([resposta('r1', 'Central de Filtros')])], [pedido('entregue', 'confirmado')])).toEqual(['O pedido K7P2MX da Central de Filtros foi entregue.']);
  });
});
