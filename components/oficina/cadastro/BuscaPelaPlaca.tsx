'use client';

// "Buscar pela placa" no cadastro do carro: pergunta ao servidor, mostra o carro que veio e só
// preenche os campos quando a pessoa confirma. Sem conta, ou sem o serviço ligado no servidor,
// o botão explica por que não dá.

import { CarFront, Info, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Botao } from '@/components/ui';
import { mesDeBrasilia } from '@/lib/fipe';
import { formatarMoeda } from '@/lib/formatos';
import { esquemaDadosPlaca, esquemaUsoDePlacas, placaParaConsulta, resumoDaPlaca, textoDoUso, type DadosPlaca, type UsoDePlacas } from '@/lib/placa';

export interface Disponibilidade {
  disponivel: boolean;
  motivo?: 'conta' | 'desligada';
  mensagem?: string;
  uso?: UsoDePlacas | null;
}

// uma pergunta por oficina enquanto a página está aberta (o cadastro abre e fecha várias vezes)
const perguntas = new Map<string, Promise<Disponibilidade>>();

function perguntar(oficinaId: string): Promise<Disponibilidade> {
  let p = perguntas.get(oficinaId);
  if (!p) {
    p = fetch('/api/veiculos/placa', { cache: 'no-store' })
      .then((r) => r.json() as Promise<Disponibilidade & { ok?: boolean }>)
      .then((r) => ({ disponivel: !!r.disponivel, motivo: r.motivo, mensagem: r.mensagem, uso: esquemaUsoDePlacas.safeParse(r.uso).data ?? null }))
      .catch(() => {
        perguntas.delete(oficinaId);
        return { disponivel: true, uso: null } as Disponibilidade;
      });
    perguntas.set(oficinaId, p);
  }
  return p;
}

const SEM_CONTA = 'A busca pela placa precisa da conta da oficina (é de graça). Com a conta, os dados do carro vêm sozinhos.';

/** O que a busca entrega para o formulário: os dados do carro e a FIPE que veio junto. */
export interface CarroDaPlaca {
  dados: DadosPlaca;
  fipe: { codigo: string; valor: number | null; referencia: string; consultadoEm: string } | null;
}

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'buscando' }
  | { tipo: 'achou'; dados: DadosPlaca }
  | { tipo: 'usado' }
  | { tipo: 'erro'; texto: string; conta?: boolean };

export function BuscaPelaPlaca({ placa, aoUsar, className = '' }: { placa: string; aoUsar: (c: CarroDaPlaca) => void; className?: string }) {
  const { oficina } = useConta();
  const [disp, setDisp] = useState<Disponibilidade | null>(oficina ? null : { disponivel: false, motivo: 'conta', mensagem: SEM_CONTA });
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [uso, setUso] = useState<UsoDePlacas | null>(null);
  const valida = !!placaParaConsulta(placa);

  useEffect(() => {
    if (!oficina) return;
    let vivo = true;
    void perguntar(oficina.id).then((d) => {
      if (!vivo) return;
      setDisp(d);
      if (d.uso) setUso(d.uso);
    });
    return () => {
      vivo = false;
    };
  }, [oficina]);

  // a placa mudou: o carro que estava na tela era de outra placa
  const [placaAnterior, setPlacaAnterior] = useState(placa);
  if (placa !== placaAnterior) {
    setPlacaAnterior(placa);
    if (estado.tipo !== 'parado' && estado.tipo !== 'buscando') setEstado({ tipo: 'parado' });
  }

  async function buscar() {
    if (disp && !disp.disponivel) {
      setEstado({ tipo: 'erro', texto: disp.mensagem ?? SEM_CONTA, conta: disp.motivo === 'conta' });
      return;
    }
    if (!valida) {
      setEstado({ tipo: 'erro', texto: 'Escreva a placa inteira primeiro (ABC1D23 ou ABC-1234).' });
      return;
    }
    setEstado({ tipo: 'buscando' });
    try {
      const r = await fetch('/api/veiculos/placa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placa }) });
      const corpo = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string; motivo?: string; dados?: unknown; uso?: unknown };
      const novoUso = esquemaUsoDePlacas.safeParse(corpo.uso);
      if (novoUso.success) setUso(novoUso.data);
      const dados = esquemaDadosPlaca.safeParse(corpo.dados);
      if (r.ok && corpo.ok && dados.success) {
        setEstado({ tipo: 'achou', dados: dados.data });
        return;
      }
      if (corpo.motivo === 'conta' || corpo.motivo === 'desligada') setDisp({ disponivel: false, motivo: corpo.motivo, mensagem: corpo.erro });
      setEstado({ tipo: 'erro', texto: corpo.erro ?? 'Não deu para buscar agora. Tente de novo.', conta: corpo.motivo === 'conta' });
    } catch {
      setEstado({ tipo: 'erro', texto: 'Sem internet agora. Preencha à mão ou tente de novo depois.' });
    }
  }

  function usar(d: DadosPlaca) {
    aoUsar({ dados: d, fipe: d.fipe ? { codigo: d.fipe.codigo, valor: d.fipe.valor, referencia: mesDeBrasilia(), consultadoEm: new Date().toISOString() } : null });
    setEstado({ tipo: 'usado' });
  }

  const indisponivel = disp != null && !disp.disponivel;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:min-h-11">
        <Botao
          tamanho="pequeno"
          onClick={buscar}
          disabled={estado.tipo === 'buscando'}
          aria-describedby={indisponivel ? 'placa-indisponivel' : undefined}
          className={indisponivel ? 'opacity-70' : ''}
        >
          <Search size={15} aria-hidden="true" /> {estado.tipo === 'buscando' ? 'Buscando…' : 'Buscar pela placa'}
        </Botao>
        {indisponivel ? (
          <span id="placa-indisponivel" className="text-[13px] text-tinta-3">
            {disp.motivo === 'conta' ? 'Precisa da conta da oficina.' : 'Ainda não ligada neste servidor.'}
          </span>
        ) : uso && estado.tipo !== 'achou' ? (
          <span className="text-[13px] text-tinta-3">{textoDoUso(uso)}</span>
        ) : null}
      </div>

      {estado.tipo === 'achou' ? <CarroAchado dados={estado.dados} aoUsar={() => usar(estado.dados)} aoRecusar={() => setEstado({ tipo: 'parado' })} /> : null}

      {estado.tipo === 'usado' ? (
        <p className="text-[13.5px] text-ok" role="status">
          Preenchido pela placa. Confira os campos antes de salvar.
        </p>
      ) : null}

      {estado.tipo === 'erro' ? (
        <div className="flex items-start gap-2 rounded-xl bg-papel-2 px-3 py-2.5 text-[13.5px] text-tinta-2" role="alert">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            {estado.texto}{' '}
            {estado.conta ? (
              <Link href="/entrar?para=/oficina" className="font-semibold text-caneta hover:underline">
                Entrar ou criar a conta
              </Link>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CarroAchado({ dados, aoUsar, aoRecusar }: { dados: DadosPlaca; aoUsar: () => void; aoRecusar: () => void }) {
  const r = resumoDaPlaca(dados);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-caneta-claro px-3.5 py-3 text-[14px]" role="status" aria-label="Carro achado pela placa">
      <div className="flex items-start gap-2.5">
        <CarFront size={19} className="mt-0.5 shrink-0 text-caneta" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-bold">{r.titulo || 'Carro sem nome no documento'}</p>
          {r.detalhe ? <p className="text-tinta-2">{r.detalhe}</p> : null}
          {dados.fipe?.valor ? (
            <p className="text-tinta-2">
              FIPE {dados.fipe.codigo}: <span className="num font-semibold text-tinta">{formatarMoeda(dados.fipe.valor)}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao tamanho="pequeno" variante="escuro" onClick={aoUsar}>
          Usar estes dados
        </Botao>
        <Botao tamanho="pequeno" variante="fantasma" onClick={aoRecusar}>
          Não é este
        </Botao>
      </div>
    </div>
  );
}
