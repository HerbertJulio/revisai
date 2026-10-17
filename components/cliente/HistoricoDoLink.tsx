// O histórico verificado do carro, para quem vai comprar: os serviços confirmados pela oficina.
// Quem confirma (nome, cidade e CNPJ) vem do cadastro da oficina no banco, não dos dados do link.

import { BadgeCheck, Wrench } from 'lucide-react';
import { Placa } from '@/components/pecas';
import { formatarCnpj } from '@/lib/cnpj';
import { formatarData } from '@/lib/datas';
import { formatarKm } from '@/lib/formatos';
import type { DadosHistoricoLink } from '@/lib/historico';
import { cidadeDaOficina, type OficinaDoLink } from '@/lib/links-publicos';
import { AcoesDoCliente, CabecalhoDaOficina, dataHora, FalarComAOficina, Rodape } from './comum';

export function HistoricoDoLink({ dados, oficina, atualizadoEm }: { dados: DadosHistoricoLink; oficina: OficinaDoLink; atualizadoEm: string }) {
  const local = cidadeDaOficina(oficina);
  const carro = [dados.carro.nome, dados.carro.motor, dados.carro.ano].filter(Boolean).join(' ');
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
      <CabecalhoDaOficina oficina={oficina} rotulo="Histórico de manutenção" />
      <section className="flex flex-wrap items-center gap-3">
        {dados.carro.placa ? <Placa placa={dados.carro.placa} grande /> : null}
        <p className="font-bold">{carro}</p>
      </section>

      <p className="flex items-start gap-2.5 rounded-2xl bg-ok-claro px-4 py-3.5 text-[15px] text-ok">
        <BadgeCheck size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Serviços confirmados pela oficina <strong>{oficina.nome}</strong>
          {local ? `, ${local}` : ''}
          {oficina.cnpj ? (
            <>
              , CNPJ <span className="num">{formatarCnpj(oficina.cnpj)}</span>
            </>
          ) : null}
          .
        </span>
      </p>

      {dados.servicos.length ? (
        <ol className="flex flex-col gap-3" aria-label="Serviços">
          {dados.servicos.map((s, i) => (
            <li key={`${s.data}-${i}`} className="rounded-2xl bg-papel ring-1 ring-linha">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-linha px-4 py-3">
                <p className="font-bold">{formatarData(s.data)}</p>
                {s.km ? <p className="num text-tinta-2">{formatarKm(s.km)}</p> : null}
                {s.os ? <p className="ml-auto text-[13px] text-tinta-3">OS nº {s.os}</p> : null}
              </div>
              <ul className="flex flex-col gap-1.5 px-4 py-3 text-[14.5px]">
                {s.itens.map((it, j) => (
                  <li key={j} className="flex items-start gap-2.5">
                    <Wrench size={16} className="mt-1 shrink-0 text-tinta-3" aria-hidden="true" />
                    <span>
                      <span className="font-semibold">{it.servico}</span>
                      {it.produto ? <span className="text-tinta-2">, {it.produto}</span> : null}
                    </span>
                  </li>
                ))}
                {s.pecas.length ? (
                  <li className="pt-1 text-[13.5px] text-tinta-2">
                    Peças: {s.pecas.map((p) => [p.descricao, p.marca ? `(${p.marca})` : ''].filter(Boolean).join(' ')).join('; ')}.
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-tinta-2">Ainda não há serviços registrados neste carro.</p>
      )}

      <AcoesDoCliente>
        <FalarComAOficina oficina={oficina} mensagem={`Olá! Vi o histórico de manutenção do ${[dados.carro.nome, dados.carro.placa].filter(Boolean).join(', ')}.`} />
      </AcoesDoCliente>
      <Rodape>
        Histórico atualizado em {dataHora(atualizadoEm)} pela {oficina.nome}
        {oficina.cnpj ? `, CNPJ ${formatarCnpj(oficina.cnpj)}` : ''}. Mostra só os serviços feitos nesta oficina. Feito com o Revisaí.
      </Rodape>
    </article>
  );
}
