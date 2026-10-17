'use client';

// O checklist de entrada como o cliente vê: como o carro chegou (km, combustível, itens, avarias
// no desenho e fotos). Sem assinatura, ele assina ali mesmo, com o nome.

import { Check, PenLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Placa } from '@/components/pecas';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { aparelhoDoAgente } from '@/lib/aprovacao';
import { enderecoDaFoto } from '@/lib/andamento';
import { combustivelEmTexto, ESTADOS_DO_ITEM, TIPOS_DE_AVARIA, type DadosChecklistLink } from '@/lib/checklist';
import { formatarKm } from '@/lib/formatos';
import { assinarChecklist } from '@/lib/links-acoes';
import type { OficinaDoLink, RespostaDoLink } from '@/lib/links-publicos';
import { QuadroDeAssinatura } from './Assinatura';
import { CarroDeCima } from './CarroDeCima';
import { AcoesDoCliente, CabecalhoDaOficina, dataHora, FalarComAOficina, Rodape } from './comum';

const COR_DO_ESTADO = { ok: 'bg-ok-claro text-ok', falta: 'bg-oleo-claro text-oleo-tinta', avaria: 'bg-atraso-claro text-atraso' } as const;

export function ChecklistDoLink({ token, dados, oficina, resposta }: { token: string; dados: DadosChecklistLink; oficina: OficinaDoLink; resposta: RespostaDoLink | null }) {
  const assinatura = resposta?.acao === 'assinar' && resposta.imagem ? { nome: resposta.nome, quando: resposta.quando, imagem: resposta.imagem, link: true } : dados.assinatura ? { ...dados.assinatura, link: false } : null;
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
      <CabecalhoDaOficina oficina={oficina} rotulo={`Checklist de entrada${dados.numero ? ` · OS nº ${dados.numero}` : ''}`} />
      <section className="flex flex-wrap items-center gap-3">
        {dados.carro.placa ? <Placa placa={dados.carro.placa} grande /> : null}
        <div className="min-w-0">
          <p className="font-bold">{dados.carro.nome}</p>
          <p className="text-[14px] text-tinta-2">Chegou em {dataHora(dados.quando)}</p>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
          <dt className="text-[13px] font-semibold text-tinta-3">Quilometragem</dt>
          <dd className="num font-semibold">{dados.km != null ? formatarKm(dados.km) : 'Não anotada'}</dd>
        </div>
        <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
          <dt className="text-[13px] font-semibold text-tinta-3">Combustível</dt>
          <dd className="font-semibold">{combustivelEmTexto(dados.combustivel)}</dd>
          {dados.combustivel != null ? (
            <div className="mt-1.5 flex gap-0.5" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-sm ${i < (dados.combustivel ?? 0) ? 'bg-oleo' : 'bg-papel-2 ring-1 ring-linha'}`} />
              ))}
            </div>
          ) : null}
        </div>
      </dl>

      {dados.itens.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-bold">Itens do carro</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {dados.itens.map((i) => (
              <li key={i.nome} className="flex items-center justify-between gap-2 rounded-xl bg-papel px-3.5 py-2.5 ring-1 ring-linha">
                <span>{i.nome}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${COR_DO_ESTADO[i.estado]}`}>{ESTADOS_DO_ITEM[i.estado]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-bold">Avarias</h2>
        {dados.avarias.length ? (
          <div className="grid items-start gap-4 sm:grid-cols-[200px_1fr]">
            <div className="text-tinta">
              <CarroDeCima marcas={dados.avarias.map((a, i) => ({ id: String(i), x: a.x, y: a.y }))} />
            </div>
            <ol className="flex flex-col gap-2">
              {dados.avarias.map((a, i) => (
                <li key={i} className="rounded-xl bg-papel px-3.5 py-2.5 ring-1 ring-linha">
                  <p className="font-semibold">
                    <span className="num mr-1.5 inline-grid h-6 w-6 place-items-center rounded-full bg-atraso text-[12px] text-white">{i + 1}</span>
                    {TIPOS_DE_AVARIA[a.tipo]}, {a.local}
                  </p>
                  {a.observacao ? <p className="mt-1 text-[14px] text-tinta-2">{a.observacao}</p> : null}
                  {a.fotos?.length ? <Fotos caminhos={a.fotos} rotulo={`Foto da avaria ${i + 1}`} /> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-tinta-2">Nenhuma avaria marcada.</p>
        )}
      </section>

      {dados.fotos.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-bold">Fotos</h2>
          <Fotos caminhos={dados.fotos} rotulo="Foto do carro na entrada" />
        </section>
      ) : null}

      {dados.observacao ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-[16px] font-bold">Observações</h2>
          <p className="text-[15px] whitespace-pre-line text-tinta-2">{dados.observacao}</p>
        </section>
      ) : null}

      {assinatura ? (
        <section className="flex flex-col gap-2 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha" aria-label="Assinatura">
          <p className="flex items-center gap-2 font-semibold text-ok">
            <Check size={18} aria-hidden="true" /> Assinado por {assinatura.nome || 'o cliente'} em {dataHora(assinatura.quando)}
            {assinatura.link ? ', pelo link' : ', na oficina'}
          </p>
          {/* a assinatura é um PNG em data URL guardado com o checklist */}
          <img src={assinatura.imagem} alt={`Assinatura de ${assinatura.nome || 'o cliente'}`} className="h-24 w-auto self-start rounded-lg bg-white ring-1 ring-linha" />
          {assinatura.link && resposta ? <p className="text-[13px] text-tinta-3">{[resposta.ip ? `IP ${resposta.ip}` : '', aparelhoDoAgente(resposta.agente)].filter(Boolean).join(', ')}</p> : null}
        </section>
      ) : (
        <Assinar token={token} />
      )}

      <AcoesDoCliente imprimir="Imprimir o checklist">
        <FalarComAOficina oficina={oficina} mensagem={`Olá! Sobre o checklist de entrada do ${[dados.carro.nome, dados.carro.placa].filter(Boolean).join(', ')}.`} />
      </AcoesDoCliente>
      <Rodape>Checklist feito pela {oficina.nome} quando o carro chegou. Feito com o Revisaí.</Rodape>
    </article>
  );
}

function Fotos({ caminhos, rotulo }: { caminhos: string[]; rotulo: string }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {caminhos.map((c, i) => (
        <a key={c} href={enderecoDaFoto(c)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-linha">
          <img src={enderecoDaFoto(c)} alt={`${rotulo} ${i + 1}`} loading="lazy" className="aspect-square w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

function Assinar({ token }: { token: string }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [imagem, setImagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function mandar() {
    setErro(null);
    if (nome.trim().length < 2) return setErro('Escreva o seu nome.');
    if (!imagem) return setErro('Assine no quadro.');
    setEnviando(true);
    try {
      const r = await assinarChecklist(token, { nome: nome.trim(), imagem });
      if (!r.ok) return setErro(r.erro);
      router.refresh();
    } catch {
      setErro('Não deu para mandar agora. Confira a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha print:hidden" aria-label="Assinar">
      <h2 className="flex items-center gap-2 text-[18px]">
        <PenLine size={19} aria-hidden="true" /> Confere? Então assine
      </h2>
      <p className="text-[14.5px] text-tinta-2">A assinatura confirma que o carro chegou como está descrito acima. Ela fica guardada com a data, a hora e o aparelho.</p>
      <Campo rotulo="Seu nome" htmlFor="nome-assinatura">
        <input id="nome-assinatura" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={80} />
      </Campo>
      <QuadroDeAssinatura aoMudar={setImagem} desativado={enviando} />
      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-3 py-2.5 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <Botao variante="escuro" tamanho="grande" disabled={enviando} onClick={() => void mandar()}>
        <Check size={18} aria-hidden="true" /> {enviando ? 'Mandando…' : 'Assinar o checklist'}
      </Botao>
    </section>
  );
}
