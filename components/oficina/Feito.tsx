'use client';

// A tela depois de registrar o serviço: a próxima troca de cada item, a etiqueta do para-brisa,
// o cartão de manutenção e o pedido de avaliação para o cliente.

import { Check, MessageCircle, Printer } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconeServico } from '@/components/icones';
import { EtiquetaTroca } from '@/components/pecas';
import { Botao, classeBotao } from '@/components/ui';
import { calcularVencimento, estimarRodagem } from '@/lib/agenda';
import { formatarData } from '@/lib/datas';
import { formatarKm, formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { servico } from '@/lib/manutencao';
import { useOficina } from '@/lib/store';
import { useCartaoDoCarro } from './acoes';
import { BotaoAvaliacao } from './plano';

export function Feito({ atendimentoId, veiculoId, aoRegistrarOutro, titulo = 'Serviço registrado', extra }: { atendimentoId: string; veiculoId: string; aoRegistrarOutro: () => void; titulo?: string; extra?: ReactNode }) {
  const atendimento = useOficina((s) => s.atendimentos[atendimentoId]);
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const prefs = useOficina((s) => s.preferencias);
  const hoje = useHoje();
  const cartao = useCartaoDoCarro();
  if (!atendimento || !veiculo) return null;

  const rodagem = estimarRodagem([{ data: atendimento.data, km: atendimento.km }], veiculo, prefs.kmMesPadrao, hoje);
  const vencs = atendimento.itens.map((i) => ({
    i,
    v: calcularVencimento({ data: atendimento.data, km: atendimento.km }, { km: i.intervaloKm, meses: i.intervaloMeses }, [], rodagem.kmDia, hoje)
  }));
  const principal = vencs.find((x) => x.i.servico === 'troca_oleo') ?? vencs[0];
  const c = cartao(veiculoId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ok">
            <Check size={18} aria-hidden="true" /> {titulo}
          </p>
          <h1 className="largo mt-1 text-[28px] sm:text-[32px]">
            {cliente?.nome ?? 'Cliente'}, {veiculo.modelo}
          </h1>
          <p className="mt-1 text-tinta-2">
            {formatarData(atendimento.data)} com {formatarKm(atendimento.km)}
            {atendimento.valor ? `, ${formatarMoeda(atendimento.valor)}` : ''}.
          </p>
        </div>
        {principal ? (
          <div className="self-start rounded-3xl bg-vidro p-6 sm:p-8">
            <EtiquetaTroca
              data={principal.v.dataLimite ?? principal.v.dataPrevista}
              km={principal.v.kmLimite}
              situacao="avisar"
              titulo={principal.i.servico === 'troca_oleo' ? 'Próxima troca' : servico(principal.i.servico).nome}
              girar
              className="scale-110"
            />
          </div>
        ) : null}
      </div>

      <ul className="divide-y divide-linha rounded-xl border border-linha bg-papel">
        {vencs.map(({ i, v }) => (
          <li key={i.servico} className="flex items-center gap-3 px-4 py-3">
            <IconeServico servico={i.servico} className="text-tinta-2" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{servico(i.servico).nome}</p>
              {i.produto ? <p className="truncate text-[13.5px] text-tinta-3">{i.produto.nome}</p> : null}
            </div>
            <div className="num text-right text-[14px] text-tinta-2">
              <p>{[v.dataLimite ? formatarData(v.dataLimite) : '', v.kmLimite ? formatarKm(v.kmLimite) : ''].filter(Boolean).join(' ou ')}</p>
              {v.motivo === 'km' && v.dataPrevista && v.dataLimite && v.dataPrevista < v.dataLimite ? (
                <p className="text-[12.5px] text-tinta-3">pela rodagem, por volta de {formatarData(v.dataPrevista)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {extra}

      <div className="flex flex-wrap gap-2">
        <Link href={`/oficina/etiqueta?atendimento=${atendimentoId}`} className={classeBotao('escuro', 'grande')}>
          <Printer size={18} /> Imprimir etiqueta do para-brisa
        </Link>
        {c?.whatsapp ? (
          <a href={c.whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'grande')}>
            <MessageCircle size={18} /> Mandar cartão no WhatsApp
          </a>
        ) : null}
        <BotaoAvaliacao telefone={cliente?.telefone} nomeCliente={cliente?.nome ?? ''} carro={veiculo.modelo} />
        <Botao tamanho="grande" onClick={aoRegistrarOutro}>
          Fazer outra
        </Botao>
        <Link href="/oficina" className={classeBotao('fantasma', 'grande')}>
          Voltar aos avisos
        </Link>
      </div>
    </div>
  );
}
