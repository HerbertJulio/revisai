// Ordem de serviço preenchida pela IA a partir do relato do mecânico (o áudio já em texto) e das
// fotos. O mecânico sempre confere antes de virar registro: a IA só monta o rascunho.

import { z } from 'zod';
import { SERVICOS } from '../manutencao';
import type { ServicoId } from '../tipos';

const IDS = SERVICOS.map((s) => s.id) as [ServicoId, ...ServicoId[]];

export const URGENCIAS = [
  { id: 'agora', nome: 'Fazer agora' },
  { id: 'proxima_revisao', nome: 'Na próxima revisão' },
  { id: 'observar', nome: 'Observar' }
] as const;
export type Urgencia = (typeof URGENCIAS)[number]['id'];

export const esquemaOrdem = z.object({
  placa: z.string().nullable().describe('Placa do carro (padrão brasileiro, só letras e números) se está no relato ou aparece numa foto; senão null.'),
  km: z.number().int().nullable().describe('Quilometragem do painel se está no relato ou aparece numa foto do painel; senão null.'),
  veiculo: z
    .object({
      marca: z.string().nullable(),
      modelo: z.string().nullable(),
      motor: z.string().nullable(),
      ano: z.number().int().nullable()
    })
    .nullable()
    .describe('O carro, se está no relato. Não adivinhe pelo modelo de peça.'),
  cliente: z.string().nullable().describe('Nome do dono do carro, se está no relato.'),
  servicos: z
    .array(
      z.object({
        servico: z.enum(IDS).describe('O serviço feito, sempre um id da lista.'),
        produto: z.string().nullable().describe('Marca e especificação do produto usado, se estão no relato. Ex.: "Mobil Super 5W-30 sintético".'),
        observacao: z.string().nullable()
      })
    )
    .describe('Só o que foi FEITO no carro agora. O que precisa ser feito depois vai em recomendacoes.'),
  diagnostico: z.string().describe('O que foi encontrado no carro, em linguagem técnica e clara, em até 6 frases.'),
  recomendacoes: z
    .array(
      z.object({
        texto: z.string(),
        urgencia: z.enum(['agora', 'proxima_revisao', 'observar'])
      })
    )
    .describe('O que o mecânico recomendou ou o que as fotos mostram que precisa de atenção.'),
  fotos: z
    .array(z.object({ indice: z.number().int(), legenda: z.string() }))
    .describe('Uma legenda curta para cada foto recebida, pelo índice (a primeira é 1).'),
  mensagemCliente: z.string().describe('Mensagem de WhatsApp para o dono do carro, pronta para enviar.'),
  transcricao: z.string().describe('O relato do mecânico: o que ele falou (o áudio em texto) ou escreveu.'),
  duvidas: z.array(z.string()).describe('O que não ficou claro e o mecânico precisa conferir.')
});

export type OrdemIA = z.infer<typeof esquemaOrdem>;

/** O que a IA devolve ao preencher: a ordem sem o relato, que já é nosso (o texto do áudio). */
export const esquemaPreenchimento = esquemaOrdem.omit({ transcricao: true });

/** Remove serviços repetidos e arruma a placa (a IA às vezes devolve com hífen ou espaço). */
export function limparOrdem(o: OrdemIA): OrdemIA {
  const vistos = new Set<ServicoId>();
  const placa = o.placa ? o.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
  return {
    ...o,
    placa: placa && /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa) ? placa : null,
    km: o.km != null && o.km > 0 && o.km < 2_000_000 ? o.km : null,
    servicos: o.servicos.filter((s) => (vistos.has(s.servico) ? false : (vistos.add(s.servico), true))),
    mensagemCliente: o.mensagemCliente.trim().slice(0, 2000)
  };
}
