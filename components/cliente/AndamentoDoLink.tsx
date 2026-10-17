// O andamento do serviço como o cliente acompanha: as etapas, a linha do tempo com as notas e as
// fotos da oficina, e o total quando o carro fica pronto.

import { Check, Clock3 } from 'lucide-react';
import { Placa } from '@/components/pecas';
import { formatarData } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import { ETAPAS, enderecoDaFoto, indiceDaEtapa, nomeDaEtapa, type DadosAndamentoLink } from '@/lib/andamento';
import type { OficinaDoLink } from '@/lib/links-publicos';
import { AcoesDoCliente, CabecalhoDaOficina, dataHora, FalarComAOficina, Rodape } from './comum';

export function AndamentoDoLink({ dados, oficina, atualizadoEm }: { dados: DadosAndamentoLink; oficina: OficinaDoLink; atualizadoEm: string }) {
  const iAtual = indiceDaEtapa(dados.etapa);
  const etapas = ETAPAS.filter((e) => e.id !== 'aguardando_aprovacao' || dados.linha.some((x) => x.etapa === e.id) || iAtual === indiceDaEtapa('aguardando_aprovacao'));
  const atual = ETAPAS[iAtual];
  const linha = [...dados.linha].reverse();
  const pronto = iAtual >= indiceDaEtapa('pronto');
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
      <CabecalhoDaOficina oficina={oficina} rotulo={`Ordem de serviço nº ${dados.numero}`} />
      <section className="flex flex-wrap items-center gap-3">
        {dados.carro.placa ? <Placa placa={dados.carro.placa} grande /> : null}
        <div className="min-w-0">
          <p className="font-bold">{dados.carro.nome}</p>
          <p className="text-[14px] text-tinta-2">Desde {formatarData(dados.data)}</p>
        </div>
      </section>

      {atual ? (
        <section className={`rounded-2xl px-5 py-4 ${pronto ? 'bg-ok-claro text-ok' : 'bg-caneta-claro text-caneta'}`} aria-live="polite">
          <p className="text-[13px] font-bold tracking-wide uppercase">Agora</p>
          <p className="largo text-[24px] leading-tight font-extrabold">{atual.nome}</p>
          <p className="mt-1 text-[15px]">{atual.paraCliente}</p>
          {dados.prazo && !pronto ? <p className="mt-1 text-[14px]">Previsão: {dados.prazo}</p> : null}
        </section>
      ) : null}

      <ol className="flex flex-col gap-0" aria-label="Etapas">
        {etapas.map((e, i) => {
          const idx = indiceDaEtapa(e.id);
          const feita = idx < iAtual;
          const agora = idx === iAtual;
          return (
            <li key={e.id} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${feita ? 'bg-ok text-sobre-ok' : agora ? 'bg-caneta text-papel' : 'bg-papel-2 text-tinta-3 ring-1 ring-linha'}`}
                  aria-hidden="true"
                >
                  {feita ? <Check size={15} /> : i + 1}
                </span>
                {i < etapas.length - 1 ? <span className={`w-0.5 flex-1 ${feita ? 'bg-ok' : 'bg-linha'}`} /> : null}
              </div>
              <p className={`pb-4 text-[15px] ${agora ? 'font-bold' : feita ? 'text-tinta' : 'text-tinta-3'}`}>
                {e.nome}
                <span className="sr-only">{feita ? ', feita' : agora ? ', agora' : ', ainda não'}</span>
              </p>
            </li>
          );
        })}
      </ol>

      {dados.servicos.length ? (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-[16px] font-bold">O que está sendo feito</h2>
          <p className="text-[15px] text-tinta-2">{dados.servicos.join(', ')}.</p>
        </section>
      ) : null}

      {linha.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[16px] font-bold">Linha do tempo</h2>
          <ul className="flex flex-col gap-3">
            {linha.map((x, i) => (
              <li key={`${x.quando}-${i}`} className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
                <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                  {nomeDaEtapa(x.etapa)}
                  <span className="inline-flex items-center gap-1 text-[13px] font-normal text-tinta-3">
                    <Clock3 size={13} aria-hidden="true" /> {dataHora(x.quando)}
                  </span>
                </p>
                {x.nota ? <p className="mt-1 text-[15px] text-tinta-2">{x.nota}</p> : null}
                {x.fotos?.length ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {x.fotos.map((f) => (
                      <a key={f} href={enderecoDaFoto(f)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-linha">
                        <img src={enderecoDaFoto(f)} alt={`Foto da etapa ${nomeDaEtapa(x.etapa).toLowerCase()}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pronto && dados.total ? (
        <p className="flex items-baseline justify-between rounded-2xl bg-tinta px-5 py-4 text-papel">
          <span className="font-semibold">Total</span>
          <span className="largo num text-[28px] font-extrabold">{formatarMoeda(dados.total)}</span>
        </p>
      ) : null}

      <AcoesDoCliente imprimir={null}>
        <FalarComAOficina
          oficina={oficina}
          destaque={pronto}
          rotulo={pronto ? 'Combinar a retirada' : 'Falar com a oficina'}
          mensagem={`Olá! Sobre o serviço do ${[dados.carro.nome, dados.carro.placa].filter(Boolean).join(', ')} (OS nº ${dados.numero}).`}
        />
      </AcoesDoCliente>
      <Rodape>Atualizado em {dataHora(atualizadoEm)}. Esta página mostra o que a {oficina.nome} registrou no serviço; abra de novo para ver as novidades.</Rodape>
    </article>
  );
}
