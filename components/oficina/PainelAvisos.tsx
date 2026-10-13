'use client';

import { BadgePercent, BellRing, CalendarCheck, Car, Clock3, MessageCircle, Plus, Send, UserX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Folha } from '@/components/Folha';
import { IconeServico } from '@/components/icones';
import { Menu } from '@/components/Menu';
import { Carimbo, EtiquetaTroca, Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { itensParaComprar, type Etapa, type GrupoAviso } from '@/lib/avisos';
import { desconto, quantidadeComUnidade } from '@/lib/catalogo';
import { dataLocal, diasEntre, formatarDataCurta, somarDias } from '@/lib/datas';
import { formatarKm, formatarMoeda } from '@/lib/formatos';
import { useDadosAvisos, useGrupos } from '@/lib/ganchos';
import { servico } from '@/lib/manutencao';
import { calcularDemanda, recomendarParaItem, type Recomendacao } from '@/lib/recomendacao';
import { dataPorExtenso, diaCurto, rotuloPrazo, rotuloRodagem, saudacao } from '@/lib/rotulos';
import { notificar, pedirPermissao } from '@/lib/notificacao';
import { useOficina } from '@/lib/store';
import { linkWhatsApp, montarMensagem } from '@/lib/whatsapp';
import { useCartaoDoCarro, useContatar } from './acoes';
import { useCatalogo } from './catalogo';

type Aba = 'avisar' | 'aguardando' | 'agendado' | 'proximos';

const ABAS: { id: Aba; rotulo: string; etapas: Etapa[] }[] = [
  { id: 'avisar', rotulo: 'Avisar', etapas: ['avisar'] },
  { id: 'aguardando', rotulo: 'Aguardando resposta', etapas: ['aguardando'] },
  { id: 'agendado', rotulo: 'Agendados', etapas: ['agendado'] },
  { id: 'proximos', rotulo: 'Próximos', etapas: ['futuro', 'adiado'] }
];

export function PainelAvisos() {
  const { grupos, resumo, hoje } = useGrupos(60);
  const [aba, setAba] = useState<Aba>('avisar');
  // carros que acabaram de mudar de etapa ficam um instante onde estavam, para ver o carimbo
  const [fixos, setFixos] = useState<Record<string, Aba>>({});
  const totalCarros = useOficina((s) => Object.keys(s.veiculos).length);
  const exemplo = useOficina((s) => s.exemplo);
  const removerExemplo = useOficina((s) => s.removerExemplo);
  const recusados = grupos.filter((g) => g.etapa === 'recusou');

  const contagem: Record<Aba, number> = {
    avisar: resumo.avisar,
    aguardando: resumo.aguardando,
    agendado: resumo.agendados,
    proximos: grupos.filter((g) => g.etapa === 'futuro' || g.etapa === 'adiado').length
  };

  const visiveis = grupos.filter((g) => {
    const fixo = fixos[g.veiculo.id];
    if (fixo) return fixo === aba;
    return ABAS.find((a) => a.id === aba)!.etapas.includes(g.etapa);
  });

  function fixar(veiculoId: string) {
    setFixos((f) => ({ ...f, [veiculoId]: aba }));
    setTimeout(() => setFixos(({ [veiculoId]: _, ...resto }) => resto), 1700);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[15px] text-tinta-3 first-letter:uppercase">{dataPorExtenso(hoje)}</p>
          <h1 className="largo mt-1 text-[30px] sm:text-[34px]">Avisos</h1>
        </div>
        <Link href="/oficina/registrar" className={classeBotao('primario', 'normal', 'max-lg:hidden')}>
          <Plus size={18} /> Registrar serviço
        </Link>
      </header>

      <ResumoDoDia />

      {exemplo ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-linha bg-papel px-4 py-3 text-[14px]">
          <p className="text-tinta-2">Você está vendo clientes de exemplo. Os seus clientes aparecem junto quando você registrar serviços.</p>
          <Botao tamanho="pequeno" onClick={removerExemplo}>
            Apagar exemplo
          </Botao>
        </div>
      ) : null}

      {totalCarros === 0 ? (
        <Vazio
          titulo="Registre o primeiro serviço"
          acao={
            <Link href="/oficina/registrar" className={classeBotao('primario')}>
              <Plus size={18} /> Registrar serviço
            </Link>
          }
        >
          Troca de óleo, filtros, revisão, pneus. A cada serviço, o Revisaí calcula quando o carro precisa voltar e mostra aqui com antecedência.
        </Vazio>
      ) : (
        <>
          <div role="tablist" aria-label="Etapas" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {ABAS.map((a) => {
              const sel = a.id === aba;
              const n = contagem[a.id];
              return (
                <button
                  key={a.id}
                  role="tab"
                  type="button"
                  aria-selected={sel}
                  onClick={() => setAba(a.id)}
                  className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold transition-colors ${
                    sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'
                  }`}
                >
                  {a.rotulo}
                  <span
                    className={`num grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12.5px] ${
                      a.id === 'avisar' && n > 0 ? 'bg-oleo text-[#1b1f22]' : sel ? 'bg-papel/15 text-papel' : 'bg-papel-2 text-tinta-2'
                    }`}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-4" role="tabpanel">
            {visiveis.length === 0 ? <AbaVazia aba={aba} irPara={setAba} /> : null}
            {visiveis.map((g) => (
              <CartaoGrupo key={g.veiculo.id} grupo={g} hoje={hoje} aoContatar={() => fixar(g.veiculo.id)} />
            ))}
          </div>

          {aba === 'proximos' && recusados.length > 0 ? (
            <details className="rounded-xl border border-linha bg-papel px-4 py-3">
              <summary className="font-semibold text-tinta-2">Clientes que não quiseram agora ({recusados.length})</summary>
              <div className="mt-3 flex flex-col gap-3">
                {recusados.map((g) => (
                  <CartaoGrupo key={g.veiculo.id} grupo={g} hoje={hoje} aoContatar={() => {}} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function AbaVazia({ aba, irPara }: { aba: Aba; irPara: (a: Aba) => void }) {
  if (aba === 'avisar') {
    return (
      <Vazio titulo="Ninguém para avisar agora" acao={<Botao onClick={() => irPara('proximos')}>Ver os próximos</Botao>}>
        Quando um serviço entrar na antecedência que você escolheu em Ajustes, o cliente aparece aqui.
      </Vazio>
    );
  }
  if (aba === 'aguardando') return <Vazio titulo="Nenhum cliente aguardando resposta">Quem você avisar pelo WhatsApp fica aqui até responder.</Vazio>;
  if (aba === 'agendado') return <Vazio titulo="Nenhum horário agendado">Quando o cliente marcar, toque em Agendar no aviso dele.</Vazio>;
  return <Vazio titulo="Nada vencendo nos próximos 60 dias" />;
}

function ResumoDoDia() {
  const { resumo, hoje } = useGrupos(30);
  const dados = useDadosAvisos();
  const { catalogo } = useCatalogo();
  const mostradoEm = useOficina((s) => s.resumoMostradoEm);
  const marcar = useOficina((s) => s.marcarResumo);
  const nome = useOficina((s) => s.oficina.nome);
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel'>('indisponivel');
  const [hora, setHora] = useState(9);

  useEffect(() => {
    setHora(new Date().getHours());
    setPermissao(typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission);
  }, []);

  const promocao = useMemo(() => {
    const linhas = calcularDemanda(itensParaComprar(dados, hoje, 30), catalogo, hoje, 30).sort(
      (a, b) => (a.servico === 'troca_oleo' ? -1 : 0) - (b.servico === 'troca_oleo' ? -1 : 0)
    );
    for (const linha of linhas) {
      const r = linha.recomendacao;
      if (r?.oferta) return { frase: servico(linha.servico).frase, fim: r.oferta.fim };
    }
    return null;
  }, [dados, catalogo, hoje]);

  if (mostradoEm === hoje || (resumo.avisar === 0 && resumo.agendadosHoje === 0)) return null;

  const frases: string[] = [];
  if (resumo.atrasados > 0) frases.push(`${resumo.atrasados} ${resumo.atrasados === 1 ? 'está com serviço atrasado' : 'estão com serviço atrasado'}`);
  if (resumo.agendadosHoje > 0) frases.push(`${resumo.agendadosHoje} ${resumo.agendadosHoje === 1 ? 'carro agendado' : 'carros agendados'} para hoje`);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-asfalto px-5 py-5 text-white ring-1 ring-white/5 sm:px-6" aria-label="Resumo do dia">
      <p className="text-[14px] text-white/70">
        {saudacao(hora)}
        {nome ? `, ${nome}` : ''}
      </p>
      <p className="meio-largo mt-1 text-[23px] leading-tight font-extrabold">
        {resumo.avisar > 0 ? `Hoje ${resumo.avisar === 1 ? 'é 1 cliente' : `são ${resumo.avisar} clientes`} para avisar.` : 'Nenhum cliente novo para avisar.'}
      </p>
      {frases.length ? <p className="mt-1 text-white/80">{frases.join(' e ')}.</p> : null}
      {promocao ? (
        <p className="mt-3 flex items-start gap-2 text-[14.5px] text-white/90">
          <BadgePercent size={18} className="mt-0.5 shrink-0 text-oleo" aria-hidden="true" />
          <span>
            Tem promoção na loja até {formatarDataCurta(promocao.fim)} para {promocao.frase}.
          </span>
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao variante="primario" onClick={() => marcar(hoje)}>
          Entendi
        </Botao>
        {permissao === 'default' ? (
          <Botao
            variante="claro"
            onClick={async () => {
              const r = await pedirPermissao();
              setPermissao(r);
              if (r === 'granted') void notificar('Revisaí', 'Pronto. É assim que o resumo do dia vai aparecer quando você abrir o app.');
            }}
          >
            <BellRing size={17} /> Avisar neste aparelho
          </Botao>
        ) : null}
        {promocao ? (
          <Link href="/oficina/loja" className={classeBotao('claro')}>
            Ver a loja
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function CartaoGrupo({ grupo, hoje, aoContatar }: { grupo: GrupoAviso; hoje: string; aoContatar: () => void }) {
  const { veiculo, cliente, itens, etapa } = grupo;
  const oficina = useOficina((s) => s.oficina);
  const modelo = useOficina((s) => s.preferencias.mensagem);
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const contatar = useContatar();
  const cartao = useCartaoDoCarro();
  const toast = useToast();
  const { catalogo } = useCatalogo();
  const router = useRouter();
  const [agendar, setAgendar] = useState(false);
  const [carimboNovo, setCarimboNovo] = useState(false);
  const montado = useRef(false);

  const ultimo = grupo.ultimoContato;
  const ultimoId = ultimo?.id;
  useEffect(() => {
    if (montado.current && ultimoId) setCarimboNovo(true);
    montado.current = true;
  }, [ultimoId]);

  const mensagem = montarMensagem(modelo, { cliente: cliente?.nome ?? '', oficina: oficina.nome, veiculo, itens });
  const whatsapp = cliente ? linkWhatsApp(cliente.telefone, mensagem) : null;
  const primeiro = itens[0];

  const oferta = useMemo(() => {
    const ordem = [...itens].sort((a, b) => (a.servico === 'troca_oleo' ? -1 : b.servico === 'troca_oleo' ? 1 : 0));
    for (const item of ordem) {
      if (!servico(item.servico).categoria) continue;
      if (item.servico === 'troca_oleo' && !veiculo.oleo?.viscosidades?.length && !item.produto?.especificacao?.viscosidade) {
        return { semOleo: true as const };
      }
      const r = recomendarParaItem(item.servico, veiculo, item.produto, catalogo, hoje, 1)[0];
      if (r) return { servico: item.servico, r };
    }
    return null;
  }, [itens, veiculo, catalogo, hoje]);

  const registrar = `/oficina/registrar?carro=${veiculo.id}&servicos=${itens.map((i) => i.servico).join(',')}`;
  const carimbo =
    etapa === 'aguardando' && ultimo
      ? { texto: 'Avisado', data: formatarDataCurta(dataLocal(ultimo.quando)) }
      : etapa === 'agendado' && ultimo?.data
        ? { texto: 'Agendado', data: formatarDataCurta(ultimo.data) }
        : null;

  const tomBorda = grupo.situacao === 'atrasado' ? 'before:bg-atraso' : grupo.situacao === 'avisar' ? 'before:bg-oleo' : 'before:bg-linha';

  return (
    <article
      className={`relative overflow-hidden rounded-2xl bg-papel ring-1 ring-linha before:absolute before:inset-y-0 before:left-0 before:w-1.5 ${tomBorda}`}
      aria-label={`${cliente?.nome ?? 'Cliente'}, ${veiculo.modelo} ${veiculo.placa}`}
    >
      <div className="relative flex gap-6 py-4 pr-4 pl-5 sm:pl-6">
        <div className="min-w-0 flex-1">
        <div className="max-sm:min-h-[104px] max-sm:pr-[124px]">
          <div className="flex flex-wrap items-center gap-2">
            <Placa placa={veiculo.placa} />
            <span className="truncate text-[14px] text-tinta-2">
              {[veiculo.marca, veiculo.modelo, veiculo.motor].filter(Boolean).join(' ')}
              {veiculo.ano ? ` ${veiculo.ano}` : ''}
            </span>
          </div>
          <h3 className="mt-2 text-[20px]">{cliente?.nome ?? 'Cliente sem nome'}</h3>
          <p className="mt-0.5 text-[13.5px] leading-snug text-tinta-3">
            Hoje com uns {formatarKm(Math.round(grupo.kmHoje / 100) * 100)}. {rotuloRodagem(grupo.rodagem.kmMes, grupo.rodagem.origem)}.
          </p>
        </div>

        <ul className="mt-3 divide-y divide-linha border-t border-linha">
          {itens.map((item) => {
            const p = rotuloPrazo(item.venc, item.situacao);
            const cor = item.situacao === 'atrasado' ? 'text-atraso' : item.situacao === 'avisar' ? 'text-oleo-tinta' : 'text-tinta-2';
            return (
              <li key={item.servico} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-papel-2 text-tinta-2">
                  <IconeServico servico={item.servico} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{servico(item.servico).nome}</p>
                  <p className="num truncate text-[13px] text-tinta-3">{p.detalhe}</p>
                </div>
                <span className={`num shrink-0 text-right text-[14px] font-bold ${cor}`}>{p.principal}</span>
              </li>
            );
          })}
        </ul>

        {grupo.reavisar && ultimo ? (
          <p className="mt-2 flex items-center gap-2 text-[14px] text-tinta-2">
            <Clock3 size={16} aria-hidden="true" /> Avisado há {diasEntre(dataLocal(ultimo.quando), hoje)} dias e sem resposta. Vale mandar de novo.
          </p>
        ) : null}
        {etapa === 'adiado' && ultimo?.data ? <p className="mt-2 text-[14px] text-tinta-2">Adiado até {diaCurto(ultimo.data)}.</p> : null}
        {etapa === 'agendado' && ultimo?.data ? (
          <p className={`mt-2 text-[14px] font-semibold ${ultimo.data < hoje ? 'text-atraso' : 'text-caneta'}`}>
            {ultimo.data === hoje ? 'Agendado para hoje' : ultimo.data < hoje ? `Era para ${diaCurto(ultimo.data)}. Registre o serviço ou remarque.` : `Agendado para ${diaCurto(ultimo.data)}`}
            {ultimo.observacao ? `. ${ultimo.observacao}` : ''}
          </p>
        ) : null}
        </div>
        <div className="max-sm:absolute max-sm:top-3 max-sm:right-3 max-sm:origin-top-right max-sm:scale-[0.8] sm:relative sm:pt-1">
          <EtiquetaTroca data={primeiro ? primeiro.venc.dataLimite ?? primeiro.venc.dataPrevista : null} km={primeiro?.venc.kmLimite ?? null} situacao={grupo.situacao} girar />
          {carimbo ? <Carimbo texto={carimbo.texto} data={carimbo.data} novo={carimboNovo} className="pointer-events-none absolute -bottom-5 -left-7" /> : null}
        </div>
      </div>

      {oferta && 'r' in oferta && oferta.r ? (
        <Oferta r={oferta.r} frase={servico(oferta.servico).frase} aoAdicionar={() => {
          adicionar(oferta.r.produto.id, oferta.r.quantidade);
          toast({ texto: `${quantidadeComUnidade(oferta.r.produto, oferta.r.quantidade)} no pedido.` });
        }} />
      ) : null}
      {oferta && 'semOleo' in oferta ? (
        <Link href={`/oficina/carro?id=${veiculo.id}#oleo`} className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-papel-2 px-3 py-2.5 text-[14px] text-tinta-2 hover:text-tinta sm:mx-5">
          <BadgePercent size={18} aria-hidden="true" />
          Cadastre o óleo do manual deste carro para ver o produto certo e as promoções.
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-linha bg-papel-2/60 px-4 py-3 sm:px-5">
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={classeBotao(etapa === 'avisar' ? 'whatsapp' : 'secundario')}
            onClick={() => {
              if (etapa === 'avisar' || etapa === 'futuro' || etapa === 'adiado' || etapa === 'recusou') {
                contatar(grupo, 'avisado', undefined, 'Mensagem aberta no WhatsApp. Marcado como avisado.');
                aoContatar();
              }
            }}
          >
            <MessageCircle size={18} /> {etapa === 'aguardando' || grupo.reavisar ? 'Avisar de novo' : 'WhatsApp'}
          </a>
        ) : (
          <Link href={`/oficina/carro?id=${veiculo.id}`} className={classeBotao('secundario')}>
            Cadastrar telefone
          </Link>
        )}
        <Botao onClick={() => setAgendar(true)}>
          <CalendarCheck size={18} /> {etapa === 'agendado' ? 'Remarcar' : 'Agendar'}
        </Botao>
        <Link href={registrar} className={classeBotao('secundario', 'normal', 'max-sm:hidden')}>
          Registrar serviço
        </Link>
        <div className="ml-auto">
          <Menu
            itens={[
              { rotulo: 'Registrar serviço feito', fazer: () => router.push(registrar), icone: <Plus size={17} /> },
              ...(etapa !== 'aguardando'
                ? [{ rotulo: 'Marcar como avisado', fazer: () => { contatar(grupo, 'avisado'); aoContatar(); }, icone: <MessageCircle size={17} /> }]
                : []),
              { rotulo: 'Adiar uma semana', fazer: () => { contatar(grupo, 'adiado', { data: somarDias(hoje, 7) }, 'Adiado por uma semana.'); aoContatar(); }, icone: <Clock3 size={17} /> },
              { rotulo: 'Adiar um mês', fazer: () => { contatar(grupo, 'adiado', { data: somarDias(hoje, 30) }, 'Adiado por um mês.'); aoContatar(); }, icone: <Clock3 size={17} /> },
              {
                rotulo: 'Mandar o cartão de manutenção',
                fazer: () => {
                  const c = cartao(veiculo.id);
                  if (c?.whatsapp) window.open(c.whatsapp, '_blank', 'noopener');
                  else if (c) void navigator.clipboard?.writeText(c.link).then(() => toast({ texto: 'Link do cartão copiado.' }));
                },
                icone: <Send size={17} />
              },
              { rotulo: 'Ver carro e histórico', fazer: () => router.push(`/oficina/carro?id=${veiculo.id}`), icone: <Car size={17} /> },
              ...(etapa !== 'recusou'
                ? [{ rotulo: 'Cliente não quer agora', fazer: () => { contatar(grupo, 'recusou'); aoContatar(); }, icone: <UserX size={17} />, perigo: true }]
                : [])
            ]}
          />
        </div>
      </div>

      <FolhaAgendar
        aberta={agendar}
        aoFechar={() => setAgendar(false)}
        hoje={hoje}
        nome={cliente?.nome ?? ''}
        aoAgendar={(data, observacao) => {
          contatar(grupo, 'agendado', { data, observacao: observacao || undefined }, `Agendado para ${diaCurto(data)}.`);
          setAgendar(false);
          aoContatar();
        }}
      />
    </article>
  );
}

function Oferta({ r, frase, aoAdicionar }: { r: Recomendacao; frase: string; aoAdicionar: () => void }) {
  const promo = r.promocao ?? r.oferta;
  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-oleo-claro px-3 py-2.5 sm:mx-5">
      <BadgePercent size={20} className="shrink-0 text-oleo-tinta" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-[14px] leading-snug">
        <p>
          <span className="text-tinta-2">Para {frase}</span> <span className="font-semibold">{r.produto.nome}</span>
        </p>
        <p className="text-tinta-2">
          {quantidadeComUnidade(r.produto, r.quantidade)} por <strong className="text-tinta">{formatarMoeda(r.total)}</strong>
          {r.promocao ? ` com ${desconto(r.produto.preco, r.promocao.precoPromocional)}% de desconto, até ${formatarDataCurta(r.promocao.fim)}` : ''}
          {!r.promocao && promo ? `. Em promoção a partir de ${promo.quantidadeMinima} ${promo.quantidadeMinima === 1 ? 'unidade' : 'unidades'}` : ''}
        </p>
      </div>
      <Botao tamanho="pequeno" variante="escuro" onClick={aoAdicionar}>
        Pôr no pedido
      </Botao>
    </div>
  );
}

function FolhaAgendar({
  aberta,
  aoFechar,
  hoje,
  nome,
  aoAgendar
}: {
  aberta: boolean;
  aoFechar: () => void;
  hoje: string;
  nome: string;
  aoAgendar: (data: string, observacao: string) => void;
}) {
  const [data, setData] = useState(somarDias(hoje, 1));
  const [obs, setObs] = useState('');
  const atalhos = [1, 2, 3, 7].map((d) => somarDias(hoje, d));
  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Agendar"
      descricao={nome ? `Quando ${nome.split(' ')[0]} vai trazer o carro?` : 'Quando o cliente vai trazer o carro?'}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={() => data && aoAgendar(data, obs.trim())} disabled={!data}>
            Agendar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {atalhos.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setData(d)}
              className={`h-10 rounded-full border px-4 text-[14px] font-semibold first-letter:uppercase ${d === data ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel'}`}
            >
              {diaCurto(d)}
            </button>
          ))}
        </div>
        <Campo rotulo="Dia" htmlFor="data-agenda">
          <input id="data-agenda" type="date" className={classeEntrada} value={data} min={hoje} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Observação" htmlFor="obs-agenda" dica="Opcional. Ex.: às 8h, vai deixar o carro o dia todo.">
          <input id="obs-agenda" className={classeEntrada} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={120} />
        </Campo>
        <p className="rounded-xl bg-caneta-claro px-3 py-2 text-[14px] text-caneta">O carro sai da lista de avisos e fica em Agendados até você registrar o serviço.</p>
      </div>
    </Folha>
  );
}

