// A reputação da loja nos últimos 90 dias, como o banco calcula para todas as lojas.

import { Chip } from '@/components/ui';
import { corDaReputacao, type Reputacao } from '@/lib/loja/dados';

const COR = {
  nova: { nome: 'Loja nova', tom: 'caneta' },
  boa: { nome: 'Boa reputação', tom: 'ok' },
  atencao: { nome: 'Reputação em atenção', tom: 'oleo' },
  ruim: { nome: 'Reputação baixa', tom: 'atraso' }
} as const;

function porcento(n: number | null): string {
  if (n == null) return '0%';
  return `${String(Math.round(n * 10) / 10).replace('.', ',')}%`;
}

function tempo(horas: number | null): string {
  if (horas == null) return 'sem pedidos confirmados';
  if (horas < 1) return 'menos de 1 hora';
  if (horas < 48) return `${Math.round(horas)} ${Math.round(horas) === 1 ? 'hora' : 'horas'}`;
  return `${Math.round(horas / 24)} dias`;
}

export function CartaoReputacao({ reputacao, compacto = false }: { reputacao: Reputacao | null; compacto?: boolean }) {
  const r = reputacao ?? { nova: true, pedidos: 0, canceladosPct: null, atrasoPct: null, horasParaConfirmar: null };
  const cor = COR[corDaReputacao(r)];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tom={cor.tom}>{cor.nome}</Chip>
        <span className="text-[13.5px] text-tinta-3">
          {r.pedidos} {r.pedidos === 1 ? 'pedido' : 'pedidos'} nos últimos 90 dias
        </span>
      </div>
      {r.nova ? (
        <p className="text-[14.5px] text-tinta-2">A reputação aparece a partir de 5 pedidos. Responda rápido, confirme só o que tem e marque a entrega: é isso que conta.</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-papel-2 px-3.5 py-3">
            <dt className="text-[13px] text-tinta-3">Cancelados pela loja</dt>
            <dd className="num text-[20px] font-extrabold">{porcento(r.canceladosPct)}</dd>
          </div>
          <div className="rounded-xl bg-papel-2 px-3.5 py-3">
            <dt className="text-[13px] text-tinta-3">Chegaram com atraso</dt>
            <dd className="num text-[20px] font-extrabold">{porcento(r.atrasoPct)}</dd>
          </div>
          <div className="rounded-xl bg-papel-2 px-3.5 py-3">
            <dt className="text-[13px] text-tinta-3">Tempo médio para confirmar</dt>
            <dd className="text-[17px] font-extrabold">{tempo(r.horasParaConfirmar)}</dd>
          </div>
        </dl>
      )}
      {compacto ? null : (
        <p className="text-[13px] text-tinta-3">
          Boa reputação: até 2% de cancelamentos e até 10% de atrasos. Atraso é o pedido que chega mais de 3 dias depois de confirmado (ou que ainda não chegou). Cancelamento pela oficina não conta contra a loja.
        </p>
      )}
    </div>
  );
}
