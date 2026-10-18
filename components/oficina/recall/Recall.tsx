'use client';

// Campanhas de recall: a oficina anota a campanha (marca, modelos, anos), o app acha os carros dos
// clientes que entram nela e põe um lembrete no início para avisar o cliente. O reparo é na
// concessionária; a consulta oficial pela placa ou pelo chassi é a da Senatran, no gov.br.

import { BellRing, ExternalLink, MessageCircle, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { Menu } from '@/components/Menu';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Secao, Vazio, classeArea, classeEntrada } from '@/components/ui';
import { formatarData, dataLocal } from '@/lib/datas';
import { lerNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import {
  anoDoCarro,
  carrosDoRecall,
  fonteValida,
  idDoLembrete,
  lembreteDoRecall,
  LINK_CONSULTA_RECALL,
  LINK_SERVICO_RECALL,
  mensagemDoRecall,
  tituloDoRecall,
  type CarroNoRecall
} from '@/lib/recall';
import type { Lembrete, Recall as Campanha } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id, Veiculo } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';

const MARCAS = ['Chevrolet', 'Volkswagen', 'Fiat', 'Hyundai', 'Toyota', 'Renault', 'Jeep', 'Honda', 'Nissan', 'Ford', 'Peugeot', 'Citroën', 'Caoa Chery', 'BYD', 'Mitsubishi', 'Kia'];

/** Cria os lembretes que faltam dos carros de ano certo (não mexe nos que já existem). Devolve quantos criou. */
function lembrarCarros(r: Campanha, carros: CarroNoRecall[], hoje: string): number {
  const s = useOficina.getState();
  let n = 0;
  for (const c of carros) {
    if (s.lembretes[idDoLembrete(r.id, c.veiculo.id)]) continue;
    s.salvarRegistro('lembretes', lembreteDoRecall(r, c.veiculo, hoje));
    n++;
  }
  return n;
}

export function Recall() {
  const recalls = useOficina((s) => s.recalls);
  const veiculos = useOficina((s) => s.veiculos);
  const hoje = useHoje();
  const [editando, setEditando] = useState<Campanha | 'nova' | null>(null);
  const campanhas = useMemo(() => Object.values(recalls).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)), [recalls]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Recall</h1>
          <p className="mt-1 max-w-[62ch] text-tinta-2">Anote as campanhas de recall das montadoras. O app acha os carros dos seus clientes que entram nelas e põe o lembrete no início para você avisar.</p>
        </div>
        <Botao variante="primario" onClick={() => setEditando('nova')}>
          <Plus size={18} aria-hidden="true" /> Nova campanha
        </Botao>
      </header>

      <section className="flex flex-col gap-2 rounded-2xl bg-caneta-claro px-4 py-3.5 text-[14.5px]" aria-label="Consulta oficial">
        <p className="flex items-start gap-2 font-semibold text-caneta">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> A consulta oficial é pela placa ou pelo chassi, no gov.br (Senatran).
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <a href={LINK_CONSULTA_RECALL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-caneta hover:underline">
            Consultar recall de um carro <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a href={LINK_SERVICO_RECALL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-caneta hover:underline">
            Como funciona a consulta <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </section>

      <Secao titulo="Campanhas">
        {campanhas.length ? (
          <ul className="flex flex-col gap-3">
            {campanhas.map((r) => (
              <li key={r.id}>
                <CartaoCampanha recall={r} veiculos={veiculos} hoje={hoje} aoEditar={() => setEditando(r)} />
              </li>
            ))}
          </ul>
        ) : (
          <Vazio titulo="Nenhuma campanha anotada" acao={<Botao variante="primario" onClick={() => setEditando('nova')}>Anotar a primeira</Botao>}>
            Quando sair um recall (no site da montadora, no jornal ou no gov.br), anote a marca, os modelos e os anos. O app mostra quais carros dos seus clientes entram.
          </Vazio>
        )}
      </Secao>

      <FolhaCampanha campanha={editando} aoFechar={() => setEditando(null)} />
    </div>
  );
}

function CartaoCampanha({ recall: r, veiculos, hoje, aoEditar }: { recall: Campanha; veiculos: Record<Id, Veiculo>; hoje: string; aoEditar: () => void }) {
  const lembretes = useOficina((s) => s.lembretes);
  const apagarRegistro = useOficina((s) => s.apagarRegistro);
  const toast = useToast();
  const carros = useMemo(() => carrosDoRecall(r, Object.values(veiculos)), [r, veiculos]);
  const certos = carros.filter((c) => c.situacao === 'sim');
  const semLembrete = certos.filter((c) => !lembretes[idDoLembrete(r.id, c.veiculo.id)]);
  const fonte = fonteValida(r.fonte);

  function apagar() {
    if (!window.confirm(`Apagar a campanha ${tituloDoRecall(r)}? Os lembretes que ainda não foram avisados saem junto.`)) return;
    for (const l of Object.values(useOficina.getState().lembretes)) if (l.recallId === r.id && l.situacao === 'aberto') apagarRegistro('lembretes', l.id);
    apagarRegistro('recalls', r.id);
    toast({ texto: 'Campanha apagada.' });
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" data-testid="campanha">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold">{tituloDoRecall(r)}</h3>
          <p className="text-[14.5px] text-tinta-2">{r.descricao}</p>
          <p className="mt-1 text-[13px] text-tinta-3">
            Anotada em {formatarData(dataLocal(r.criadoEm))}
            {fonte ? (
              <>
                {' · '}
                <a href={fonte} target="_blank" rel="noopener noreferrer" className="font-semibold text-caneta hover:underline">
                  Fonte
                </a>
              </>
            ) : null}
          </p>
        </div>
        <Menu
          itens={[
            { rotulo: 'Editar a campanha', icone: <Pencil size={17} />, fazer: aoEditar },
            { rotulo: 'Apagar a campanha', icone: <Trash2 size={17} />, fazer: apagar, perigo: true }
          ]}
        />
      </div>

      {carros.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tom={certos.length ? 'atraso' : 'neutro'}>
              {certos.length} {certos.length === 1 ? 'carro de cliente' : 'carros de clientes'}
            </Chip>
            {carros.length > certos.length ? <Chip>{carros.length - certos.length} sem o ano no cadastro</Chip> : null}
            {semLembrete.length ? (
              <Botao
                tamanho="pequeno"
                onClick={() => {
                  const n = lembrarCarros(r, semLembrete, hoje);
                  toast({ texto: `${n} ${n === 1 ? 'lembrete criado' : 'lembretes criados'}. Estão no início.` });
                }}
              >
                <BellRing size={15} aria-hidden="true" /> Lembrar {semLembrete.length === 1 ? 'este carro' : `os ${semLembrete.length}`}
              </Botao>
            ) : null}
          </div>
          <ul className="flex flex-col divide-y divide-linha rounded-xl ring-1 ring-linha">
            {carros.map((c) => (
              <CarroDaCampanha key={c.veiculo.id} recall={r} carro={c} lembrete={lembretes[idDoLembrete(r.id, c.veiculo.id)] ?? null} hoje={hoje} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[14px] text-tinta-3">Nenhum carro dos seus clientes entra nesta campanha.</p>
      )}
    </article>
  );
}

const SITUACAO: Record<Lembrete['situacao'], { nome: string; tom: 'oleo' | 'ok' | 'neutro' | 'caneta' }> = {
  aberto: { nome: 'Não avisado', tom: 'oleo' },
  avisado: { nome: 'Avisado', tom: 'caneta' },
  feito: { nome: 'Feito', tom: 'ok' },
  descartado: { nome: 'Descartado', tom: 'neutro' }
};

function CarroDaCampanha({ recall: r, carro: c, lembrete, hoje }: { recall: Campanha; carro: CarroNoRecall; lembrete: Lembrete | null; hoje: string }) {
  const cliente = useOficina((s) => s.clientes[c.veiculo.clienteId]);
  const oficina = useOficina((s) => s.oficina);
  const salvarRegistro = useOficina((s) => s.salvarRegistro);
  const toast = useToast();
  const v = c.veiculo;
  const ano = anoDoCarro(v);
  const zap = cliente?.telefone ? linkWhatsApp(cliente.telefone, mensagemDoRecall({ cliente: cliente.nome, oficina: oficina.nome, recall: r, veiculo: v })) : null;

  function avisado() {
    const atual = lembrete ?? (lembreteDoRecall(r, v, hoje) as Lembrete);
    salvarRegistro('lembretes', { ...atual, situacao: 'avisado', avisadoEm: new Date().toISOString() });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 text-[14.5px]" data-testid="carro-da-campanha">
      <Placa placa={v.placa} />
      <Link href={`/oficina/carro?id=${v.id}`} className="min-w-0 flex-1 basis-40 hover:underline">
        <span className="block truncate font-semibold">{[v.modelo, ano].filter(Boolean).join(' ')}</span>
        <span className="block truncate text-[13px] text-tinta-3">{cliente?.nome ?? 'Sem cliente'}</span>
      </Link>
      {c.situacao === 'sem_ano' ? <Chip>Confira o ano</Chip> : null}
      {lembrete ? <Chip tom={SITUACAO[lembrete.situacao].tom}>{SITUACAO[lembrete.situacao].nome}</Chip> : null}
      {c.situacao === 'sem_ano' && !lembrete ? (
        <Botao
          tamanho="pequeno"
          onClick={() => {
            salvarRegistro('lembretes', lembreteDoRecall(r, v, hoje));
            toast({ texto: 'Lembrete criado. Está no início.' });
          }}
        >
          Lembrar
        </Botao>
      ) : null}
      {zap ? (
        <a href={zap} target="_blank" rel="noopener noreferrer" onClick={avisado} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-ok px-3 text-sm font-semibold text-sobre-ok hover:brightness-110">
          <MessageCircle size={16} aria-hidden="true" /> Avisar
        </a>
      ) : (
        <span className="text-[13px] text-tinta-3">Sem WhatsApp</span>
      )}
    </li>
  );
}

function FolhaCampanha({ campanha, aoFechar }: { campanha: Campanha | 'nova' | null; aoFechar: () => void }) {
  const salvarRegistro = useOficina((s) => s.salvarRegistro);
  const apagarRegistro = useOficina((s) => s.apagarRegistro);
  const toast = useToast();
  const hoje = useHoje();
  const vazio = { marca: '', modelo: '', anoDe: '', anoAte: '', descricao: '', fonte: '' };
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<Campanha | 'nova' | null>(null);
  if (campanha !== anterior) {
    setAnterior(campanha);
    setErro(null);
    setF(
      campanha && campanha !== 'nova'
        ? { marca: campanha.marca, modelo: campanha.modelo, anoDe: campanha.anoDe ? String(campanha.anoDe) : '', anoAte: campanha.anoAte ? String(campanha.anoAte) : '', descricao: campanha.descricao, fonte: campanha.fonte ?? '' }
        : vazio
    );
  }

  function salvar() {
    setErro(null);
    const anoDe = f.anoDe.trim() ? lerNumero(f.anoDe) : null;
    const anoAte = f.anoAte.trim() ? lerNumero(f.anoAte) : null;
    if (f.marca.trim().length < 2) return setErro('Escreva a marca.');
    if (f.modelo.trim().length < 1) return setErro('Escreva o modelo (ou os modelos, separados por vírgula).');
    if (f.descricao.trim().length < 5) return setErro('Conte o defeito em poucas palavras.');
    const anoValido = (a: number | null) => a == null || (Number.isInteger(a) && a >= 1950 && a <= new Date().getFullYear() + 2);
    if (!anoValido(anoDe) || !anoValido(anoAte)) return setErro('Confira os anos.');
    if (anoDe != null && anoAte != null && anoDe > anoAte) return setErro('O ano inicial vem antes do final.');
    if (f.fonte.trim() && !fonteValida(f.fonte)) return setErro('O link da fonte precisa começar com https://.');
    const id = salvarRegistro('recalls', {
      ...(campanha && campanha !== 'nova' ? { id: campanha.id } : {}),
      marca: f.marca.trim(),
      modelo: f.modelo.trim(),
      anoDe,
      anoAte,
      descricao: f.descricao.trim(),
      fonte: fonteValida(f.fonte) ?? undefined
    });
    const s = useOficina.getState();
    const r = s.recalls[id];
    const carros = carrosDoRecall(r, Object.values(s.veiculos));
    // ao editar, os lembretes ainda não avisados de carros que saíram da campanha saem também
    const dentro = new Set(carros.map((c) => c.veiculo.id));
    for (const l of Object.values(s.lembretes)) if (l.recallId === id && l.situacao === 'aberto' && l.veiculoId && !dentro.has(l.veiculoId)) apagarRegistro('lembretes', l.id);
    const criados = lembrarCarros(r, carros.filter((c) => c.situacao === 'sim'), hoje);
    const total = carros.filter((c) => c.situacao === 'sim').length;
    toast({
      texto: total
        ? `Campanha salva. ${total} ${total === 1 ? 'carro de cliente entra' : 'carros de clientes entram'} nela${criados ? `; ${criados === 1 ? 'o lembrete está' : 'os lembretes estão'} no início` : ''}.`
        : 'Campanha salva. Nenhum carro dos seus clientes entra nela por enquanto.'
    });
    aoFechar();
  }

  return (
    <Folha
      aberta={campanha != null}
      aoFechar={aoFechar}
      titulo={campanha === 'nova' ? 'Nova campanha de recall' : 'Editar a campanha'}
      descricao="Do site da montadora, do jornal ou do gov.br."
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Marca" htmlFor="rc-marca">
          <input id="rc-marca" className={classeEntrada} value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} list="rc-marcas" autoComplete="off" />
        </Campo>
        <datalist id="rc-marcas">
          {MARCAS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Campo rotulo="Modelos" htmlFor="rc-modelo" dica="Separe por vírgula: Onix, Onix Plus.">
          <input id="rc-modelo" className={classeEntrada} value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} autoComplete="off" />
        </Campo>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <Campo rotulo="Do ano (modelo)" htmlFor="rc-de" dica="Em branco: desde sempre.">
            <input id="rc-de" className={`${classeEntrada} num`} value={f.anoDe} onChange={(e) => setF({ ...f, anoDe: e.target.value })} inputMode="numeric" maxLength={4} />
          </Campo>
          <Campo rotulo="Até o ano" htmlFor="rc-ate" dica="Em branco: até hoje.">
            <input id="rc-ate" className={`${classeEntrada} num`} value={f.anoAte} onChange={(e) => setF({ ...f, anoAte: e.target.value })} inputMode="numeric" maxLength={4} />
          </Campo>
        </div>
        <Campo rotulo="O que tem de errado" htmlFor="rc-desc" className="sm:col-span-2">
          <textarea id="rc-desc" className={classeArea} rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: possível falha no cinto de segurança traseiro." maxLength={280} />
        </Campo>
        <Campo rotulo="Link da campanha" htmlFor="rc-fonte" className="sm:col-span-2" dica="Opcional: a página da montadora ou do gov.br.">
          <input id="rc-fonte" className={classeEntrada} value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })} inputMode="url" placeholder="https://" autoComplete="off" />
        </Campo>
        {erro ? (
          <p className="text-[14px] text-atraso sm:col-span-2" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </Folha>
  );
}
