'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Botao, Vazio, classeBotao } from '@/components/ui';
import { calcularVencimento, estimarRodagem, pontosDoVeiculo } from '@/lib/agenda';
import { formatarData } from '@/lib/datas';
import { formatarKm, formatarPlaca, formatarTelefone } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { servico } from '@/lib/manutencao';
import { useOficina } from '@/lib/store';

type Formato = 'rolo' | 'a4';

/** Etiqueta de para-brisa com a próxima troca, em tamanho real (7 × 5 cm). */
export function Etiqueta() {
  const id = useSearchParams().get('atendimento') ?? '';
  const atendimento = useOficina((s) => s.atendimentos[id]);
  const veiculo = useOficina((s) => (atendimento ? s.veiculos[atendimento.veiculoId] : undefined));
  const atendimentos = useOficina((s) => s.atendimentos);
  const leituras = useOficina((s) => s.leituras);
  const oficina = useOficina((s) => s.oficina);
  const kmMesPadrao = useOficina((s) => s.preferencias.kmMesPadrao);
  const hoje = useHoje();
  const [formato, setFormato] = useState<Formato>('a4');

  if (!atendimento || !veiculo) {
    return <Vazio titulo="Serviço não encontrado" acao={<Link href="/oficina" className={classeBotao()}>Voltar aos avisos</Link>} />;
  }

  const item = atendimento.itens.find((i) => i.servico === 'troca_oleo') ?? atendimento.itens[0];
  const pontos = pontosDoVeiculo(veiculo.id, Object.values(atendimentos), Object.values(leituras));
  const { kmDia } = estimarRodagem(pontos, veiculo, kmMesPadrao, hoje);
  const venc = calcularVencimento({ data: atendimento.data, km: atendimento.km }, { km: item.intervaloKm, meses: item.intervaloMeses }, [], kmDia, hoje);
  const titulo = item.servico === 'troca_oleo' ? 'Próxima troca de óleo' : `Próxima: ${servico(item.servico).nome.toLowerCase()}`;
  // na etiqueta vai o limite de verdade (data e km), não a data estimada pela rodagem
  const proximaData = venc.dataLimite;

  const pagina =
    formato === 'rolo' ? '@page { size: 70mm 50mm; margin: 0; } @media print { .etiqueta-papel { margin: 0 !important; } }' : '@page { size: A4; margin: 15mm; }';

  return (
    <div className="flex flex-col gap-6">
      <style>{pagina}</style>
      <div className="nao-imprimir flex flex-col gap-4">
        <Link href={`/oficina/carro?id=${veiculo.id}`} className="inline-flex items-center gap-1 self-start text-[14px] font-semibold text-tinta-3 hover:text-tinta">
          <ArrowLeft size={16} /> Voltar ao carro
        </Link>
        <h1 className="largo text-[28px]">Etiqueta do para-brisa</h1>
        <p className="max-w-[60ch] text-tinta-2">
          Tamanho real de 7 por 5 cm. Imprima em papel adesivo ou numa folha comum e recorte na linha. No canto superior esquerdo do para-brisa, por dentro, ela não atrapalha a visão.
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['a4', 'Folha A4 (recortar)'],
              ['rolo', 'Impressora de etiqueta 70 × 50 mm']
            ] as const
          ).map(([f, nome]) => (
            <button
              key={f}
              type="button"
              aria-pressed={formato === f}
              onClick={() => setFormato(f)}
              className={`h-10 rounded-full border px-4 text-[14px] font-semibold ${formato === f ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2'}`}
            >
              {nome}
            </button>
          ))}
        </div>
      </div>

      <div className="nao-imprimir rounded-3xl bg-vidro p-8 sm:p-12">
        <RotuloImpresso {...{ titulo, oficina, veiculo, atendimento, item, venc, proximaData }} />
      </div>
      <div className="so-imprimir">
        <RotuloImpresso {...{ titulo, oficina, veiculo, atendimento, item, venc, proximaData }} impressao recorte={formato === 'a4'} />
      </div>

      <div className="nao-imprimir">
        <Botao variante="primario" tamanho="grande" onClick={() => window.print()}>
          <Printer size={18} /> Imprimir
        </Botao>
      </div>
    </div>
  );
}

function RotuloImpresso({
  titulo,
  oficina,
  veiculo,
  atendimento,
  item,
  venc,
  proximaData,
  impressao = false,
  recorte = false
}: {
  titulo: string;
  oficina: { nome: string; whatsapp: string };
  veiculo: { placa: string; modelo: string };
  atendimento: { data: string; km: number };
  item: { produto?: { nome: string } | null };
  venc: { kmLimite: number | null };
  proximaData: string | null;
  impressao?: boolean;
  recorte?: boolean;
}) {
  return (
    <div
      className={`etiqueta-papel flex flex-col overflow-hidden bg-white text-[#1b1f22] ${impressao ? '' : 'mx-auto -rotate-[1.2deg] rounded-[3mm] shadow-etiqueta'} ${recorte ? 'outline-dashed outline-1 outline-offset-[1.5mm] outline-[#888]' : ''}`}
      style={{ width: '70mm', height: '50mm', borderRadius: impressao ? '2mm' : undefined, border: impressao ? '0.3mm solid #1b1f22' : undefined }}
    >
      <div className="flex items-center justify-between bg-[#f2a900] px-[3mm] py-[1.2mm] text-[2.9mm] font-bold" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        <span>{titulo}</span>
        <span className="largo num tracking-[0.06em]">{formatarPlaca(veiculo.placa)}</span>
      </div>
      <div className="flex flex-1 flex-col justify-between px-[3mm] pt-[1.8mm] pb-[2mm]">
        <div className="flex items-end justify-between gap-[2mm]">
          <div>
            <p className="text-[2.3mm] font-semibold text-[#4b545a]">Data</p>
            <p className="meio-largo num text-[5.6mm] leading-none font-extrabold">{proximaData ? formatarData(proximaData) : '—'}</p>
          </div>
          {venc.kmLimite ? (
            <div className="text-right">
              <p className="text-[2.3mm] font-semibold text-[#4b545a]">ou km</p>
              <p className="meio-largo num text-[5.6mm] leading-none font-extrabold">{formatarKm(venc.kmLimite).replace(' km', '')}</p>
            </div>
          ) : null}
        </div>
        <p className="text-[2.4mm] leading-tight text-[#4b545a]">
          Feita em {formatarData(atendimento.data)} com {formatarKm(atendimento.km)}
          {item.produto ? `. ${item.produto.nome}` : ''}
        </p>
        <p className="truncate border-t border-[#cbd1ce] pt-[1mm] text-[2.5mm] font-bold">
          {oficina.nome || 'Oficina'}
          {oficina.whatsapp ? <span className="font-semibold text-[#4b545a]"> {formatarTelefone(oficina.whatsapp)}</span> : null}
        </p>
      </div>
    </div>
  );
}
