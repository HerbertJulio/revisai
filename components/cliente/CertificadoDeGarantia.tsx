// O certificado de garantia como o cliente vê e imprime: o que tem garantia, até quando, as
// condições e o código para consultar pela placa. A oficina vem do banco (com o CNPJ).

import { ShieldCheck } from 'lucide-react';
import { Placa } from '@/components/pecas';
import { formatarData } from '@/lib/datas';
import { formatarPlaca } from '@/lib/formatos';
import { situacaoDoItem, type DadosGarantiaLink } from '@/lib/garantia';
import type { OficinaDoLink } from '@/lib/links-publicos';
import { AcoesDoCliente, CabecalhoDaOficina, FalarComAOficina, Rodape } from './comum';

export function CertificadoDeGarantia({
  dados,
  oficina,
  codigo,
  hoje,
  enderecoDaConsulta,
  naOficina = false
}: {
  dados: DadosGarantiaLink;
  oficina: OficinaDoLink;
  codigo: string | null;
  hoje: string;
  enderecoDaConsulta: string;
  /** Visto no app da oficina: sem o botão de falar com ela. */
  naOficina?: boolean;
}) {
  const carro = [dados.carro.nome, dados.carro.ano].filter(Boolean).join(' ');
  const itens = dados.itens.map((i) => ({ ...i, s: situacaoDoItem(dados.inicio, i, hoje) }));
  const vigentes = itens.filter((i) => i.s.vigente).length;
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
      <CabecalhoDaOficina oficina={oficina} rotulo={`Certificado de garantia${dados.numero ? ` · OS nº ${dados.numero}` : ''}`} />
      <section className="flex flex-wrap items-center gap-3">
        {dados.carro.placa ? <Placa placa={dados.carro.placa} grande /> : null}
        <div className="min-w-0">
          <p className="font-bold">{carro}</p>
          <p className="text-[14px] text-tinta-2">
            {dados.cliente ? `De ${dados.cliente}, ` : ''}entregue em {formatarData(dados.inicio)}
          </p>
        </div>
      </section>

      <p className={`flex items-start gap-2.5 rounded-2xl px-4 py-3.5 text-[15px] ${vigentes ? 'bg-ok-claro text-ok' : 'bg-papel-2 text-tinta-2'}`}>
        <ShieldCheck size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{vigentes ? (vigentes === itens.length ? 'A garantia está valendo.' : `${vigentes} de ${itens.length} itens ainda estão na garantia.`) : 'A garantia destes itens já terminou.'}</span>
      </p>

      <section className="flex flex-col gap-2" aria-label="Itens na garantia">
        <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {itens.map((i, n) => (
            <li key={n} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {i.descricao}
                  {i.marca ? <span className="font-normal text-tinta-2"> ({i.marca})</span> : null}
                </span>
                <span className="block text-[13px] text-tinta-3">
                  {i.tipo === 'servico' ? 'Serviço' : 'Peça'}, {i.dias} dias{i.km ? ` ou ${i.km.toLocaleString('pt-BR')} km` : ''}
                </span>
              </span>
              <span className={`text-right text-[14px] font-semibold ${i.s.vigente ? 'text-ok' : 'text-tinta-3'}`}>{i.s.vigente ? `Vale até ${formatarData(i.s.ate)}` : `Terminou em ${formatarData(i.s.ate)}`}</span>
            </li>
          ))}
        </ul>
      </section>

      {dados.condicoes ? (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-[16px] font-bold">Condições</h2>
          <p className="text-[14.5px] leading-relaxed whitespace-pre-line text-tinta-2">{dados.condicoes}</p>
        </section>
      ) : null}

      {codigo && dados.carro.placa ? (
        <section className="flex flex-col gap-1 rounded-2xl border-2 border-dashed border-linha px-4 py-3.5">
          <p className="text-[13px] font-semibold text-tinta-3">Para consultar esta garantia</p>
          <p className="text-[15px]">
            Placa <strong className="num">{formatarPlaca(dados.carro.placa)}</strong> e código <strong className="largo num tracking-[0.12em]">{codigo}</strong>
          </p>
          <p className="text-[13.5px] text-tinta-2">em {enderecoDaConsulta}</p>
        </section>
      ) : null}

      <AcoesDoCliente imprimir="Imprimir o certificado">
        {naOficina ? null : (
          <FalarComAOficina oficina={oficina} mensagem={`Olá! Sobre a garantia do serviço no ${[dados.carro.nome, dados.carro.placa].filter(Boolean).join(', ')}${dados.numero ? ` (OS nº ${dados.numero})` : ''}.`} />
        )}
      </AcoesDoCliente>
      <Rodape>Garantia dada pela {oficina.nome}. O Código de Defesa do Consumidor (art. 26) garante pelo menos 90 dias para serviços e produtos duráveis. Feito com o Revisaí.</Rodape>
    </article>
  );
}
