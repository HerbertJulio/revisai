// Assinaturas do Pro como o painel administrativo vê: formato das linhas e as contas da tela.
// Sem nada de servidor aqui, para dar para testar e usar nos componentes do navegador.

import { z } from 'zod';
import { formatarData } from './datas';
import { formatarMoeda } from './formatos';
import { formatarCodigo, PRO } from './plano';

export const COLUNAS_ASSINATURA = 'id, oficina_nome, oficina_whatsapp, meses, valor, ate, codigo, observacao, ativacoes, criado_em';

/** Quantos aparelhos podem ativar o mesmo código (celular, computador e um reserva). */
export const MAX_APARELHOS = 3;

export const MESES_PRO = [1, 3, 6, 12] as const;

const linha = z.object({
  id: z.coerce.number(),
  oficina_nome: z.string(),
  oficina_whatsapp: z.string().nullish().transform((v) => v ?? null),
  meses: z.coerce.number(),
  valor: z.coerce.number().nullish().transform((v) => v ?? null),
  ate: z.string(),
  codigo: z.string(),
  observacao: z.string().nullish().transform((v) => v ?? null),
  ativacoes: z.coerce.number().nullish().transform((v) => v ?? 0),
  criado_em: z.string()
});

export type Assinatura = z.infer<typeof linha>;

export function lerAssinaturas(dados: unknown): { itens: Assinatura[]; descartadas: number } {
  const lista = Array.isArray(dados) ? dados : [];
  const itens: Assinatura[] = [];
  for (const d of lista) {
    const r = linha.safeParse(d);
    if (r.success) itens.push(r.data);
  }
  return { itens, descartadas: lista.length - itens.length };
}

/** Preço sugerido: o de fundador enquanto houver vaga, depois o cheio. */
export function valorSugerido(meses: number, fundador: boolean): number {
  const mensal = fundador ? PRO.precoFundador : PRO.preco;
  return Math.round(mensal * meses * 100) / 100;
}

export function vagasDeFundador(assinaturas: Pick<Assinatura, 'oficina_nome'>[]): number {
  const oficinas = new Set(assinaturas.map((a) => a.oficina_nome.trim().toLowerCase()));
  return Math.max(0, PRO.vagasFundador - oficinas.size);
}

/** A mensagem que a equipe manda para a oficina com o código. */
export function mensagemDoCodigo(a: Pick<Assinatura, 'oficina_nome' | 'codigo' | 'ate'>): string {
  return [
    `Olá! Aqui é da equipe do Revisaí. O Pro da ${a.oficina_nome} está liberado.`,
    `Seu código: ${formatarCodigo(a.codigo)}`,
    'Abra o Revisaí, vá em Ajustes, na parte Plano, e digite o código. Vale em até 3 aparelhos da oficina.',
    `O Pro vale até ${formatarData(a.ate)}. Obrigado pela confiança!`
  ].join('\n');
}

export function resumoDaAssinatura(a: Pick<Assinatura, 'meses' | 'valor'>): string {
  const meses = a.meses === 1 ? '1 mês' : `${a.meses} meses`;
  return a.valor != null ? `${meses} por ${formatarMoeda(a.valor)}` : meses;
}
