'use client';

import { ArrowLeft, Copy, FileText, Gauge, MessageCircle, Mic, Pencil, Plus, Printer, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { IconeServico } from '@/components/icones';
import { Menu } from '@/components/Menu';
import { Odometro, Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Secao, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { itensDoVeiculo } from '@/lib/avisos';
import { dataLocal, formatarData } from '@/lib/datas';
import { formatarKm, formatarMoeda, formatarNumero, formatarTelefone, lerNumero } from '@/lib/formatos';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { servico } from '@/lib/manutencao';
import { nomeBase } from '@/lib/oleos';
import { rotuloRodagem } from '@/lib/rotulos';
import { areaDoTexto } from '@/lib/saude';
import { useOficina } from '@/lib/store';
import type { ResultadoContato } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useCartaoDoCarro } from './acoes';
import { DocumentosDoCarro } from './Ordens';
import { OrdensDoCarro } from './OrdensDoCarro';
import { SaudeDoCarro } from './SaudeDoCarro';
import {
  CamposCliente,
  CamposVeiculo,
  EditorOleo,
  clienteDoRascunho,
  errosCliente,
  errosVeiculo,
  rascunhoDoCliente,
  rascunhoDoVeiculo,
  veiculoDoRascunho
} from './formularios';

const RESULTADOS: Record<ResultadoContato, string> = { avisado: 'Avisado', agendado: 'Agendado', adiado: 'Adiado', recusou: 'Não quis agora' };

export function Carro() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const toast = useToast();
  const dados = useDadosAvisos();
  const hoje = useHoje();
  const veiculo = dados.veiculos[id];
  const cliente = veiculo ? dados.clientes[veiculo.clienteId] : undefined;
  const salvarCliente = useOficina((s) => s.salvarCliente);
  const removerVeiculo = useOficina((s) => s.removerVeiculo);
  const removerAtendimento = useOficina((s) => s.removerAtendimento);
  const anotarKm = useOficina((s) => s.anotarKm);
  const removerLeitura = useOficina((s) => s.removerLeitura);
  const cartao = useCartaoDoCarro();
  const [folha, setFolha] = useState<null | 'oleo' | 'carro' | 'cliente' | 'km' | 'excluir'>(null);

  const calculo = useMemo(() => (veiculo ? itensDoVeiculo(veiculo, dados, hoje) : null), [veiculo, dados, hoje]);
  const historico = useMemo(
    () =>
      Object.values(dados.atendimentos)
        .filter((a) => a.veiculoId === id)
        .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.km - a.km)),
    [dados.atendimentos, id]
  );
  const leituras = useMemo(
    () =>
      Object.values(dados.leituras)
        .filter((l) => l.veiculoId === id)
        .sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.leituras, id]
  );
  const ordens = useOficina((s) => s.ordens);
  // recomendações das ordens de serviço dos últimos 120 dias entram no mapa do carro
  const recomendacoes = useMemo(() => {
    const desde = new Date(Date.now() - 120 * 86_400_000).toISOString();
    return Object.values(ordens)
      .filter((o) => o.veiculoId === id && o.criadoEm >= desde)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
      .flatMap((o) => o.ia.recomendacoes.map((r) => ({ texto: r.texto, urgencia: r.urgencia, area: areaDoTexto(r.texto) })))
      .slice(0, 8);
  }, [ordens, id]);
  const contatos = useMemo(
    () =>
      Object.values(dados.contatos)
        .filter((c) => c.veiculoId === id)
        .sort((a, b) => (a.quando < b.quando ? 1 : -1)),
    [dados.contatos, id]
  );

  if (!veiculo || !calculo) {
    return (
      <Vazio titulo="Carro não encontrado" acao={<Link href="/oficina/clientes" className={classeBotao()}>Ver clientes</Link>}>
        Ele pode ter sido apagado neste aparelho.
      </Vazio>
    );
  }

  const { itens, rodagem, kmHoje } = calculo;
  const devidos = itens.filter((i) => i.situacao !== 'futuro');
  const registrar = `/oficina/nova?tipo=ordem&carro=${veiculo.id}${devidos.length ? `&servicos=${devidos.map((i) => i.servico).join(',')}` : ''}`;
  const zap = cliente ? linkWhatsApp(cliente.telefone, `Oi, ${cliente.nome.split(' ')[0]}!`) : null;
  // contatos agrupados por momento (um aviso cobre vários itens)
  const contatosPorMomento = [...new Map(contatos.map((c) => [`${c.quando}|${c.resultado}`, c])).values()];
  const oleo = veiculo.oleo;

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-col gap-4">
        <Link href="/oficina/clientes" className="inline-flex items-center gap-1 self-start text-[14px] font-semibold text-tinta-3 hover:text-tinta">
          <ArrowLeft size={16} /> Clientes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-col items-start gap-3">
            <Placa placa={veiculo.placa} grande />
            <h1 className="largo text-[26px] sm:text-[32px]">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Carro'}</h1>
            <p className="-mt-2 text-tinta-2">
              {[veiculo.motor, veiculo.ano, veiculo.combustivel === 'gnv' ? 'com GNV' : ''].filter(Boolean).join(', ')}
              {veiculo.usoSevero ? ', uso severo' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold">{cliente?.nome}</span>
              {cliente?.telefone ? <span className="text-tinta-2">{formatarTelefone(cliente.telefone)}</span> : null}
              <button type="button" onClick={() => setFolha('cliente')} className="text-[14px] font-semibold text-caneta hover:underline">
                Editar cliente
              </button>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-[13px] font-semibold text-tinta-3">Hoje, estimado</span>
            <Odometro km={kmHoje} />
            <span className="text-[13px] text-tinta-3">{rotuloRodagem(rodagem.kmMes, rodagem.origem)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={registrar} className={classeBotao('primario')}>
            <Plus size={18} /> Nova OS
          </Link>
          <Link href={`/oficina/nova?tipo=orcamento&carro=${veiculo.id}`} className={classeBotao('secundario')}>
            <FileText size={17} /> Orçamento
          </Link>
          {zap ? (
            <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario')}>
              <MessageCircle size={18} /> Conversar
            </a>
          ) : null}
          <Link href={`/oficina/ordem?carro=${veiculo.id}`} className={classeBotao('secundario')}>
            <Mic size={18} /> Ordem por voz
          </Link>
          <Botao onClick={() => setFolha('km')}>
            <Gauge size={18} /> Anotar km
          </Botao>
          <Menu
            itens={[
              {
                rotulo: 'Mandar cartão de manutenção',
                icone: <Send size={17} />,
                fazer: () => {
                  const c = cartao(veiculo.id);
                  if (c?.whatsapp) window.open(c.whatsapp, '_blank', 'noopener');
                  else toast({ texto: 'Cadastre o WhatsApp do cliente para mandar o cartão.' });
                }
              },
              {
                rotulo: 'Copiar link do cartão',
                icone: <Copy size={17} />,
                fazer: () => {
                  const c = cartao(veiculo.id);
                  if (c) void navigator.clipboard?.writeText(c.link).then(() => toast({ texto: 'Link copiado.' }));
                }
              },
              { rotulo: 'Editar dados do carro', icone: <Pencil size={17} />, fazer: () => setFolha('carro') },
              { rotulo: 'Apagar carro e histórico', icone: <Trash2 size={17} />, fazer: () => setFolha('excluir'), perigo: true }
            ]}
          />
        </div>
      </header>

      <Secao titulo="Saúde do carro" descricao={itens.length ? 'Quanto resta de cada item até a próxima troca, pela data ou pela quilometragem, o que vier primeiro.' : undefined}>
        {itens.length === 0 && recomendacoes.length === 0 ? (
          <Vazio titulo="Nenhum serviço registrado neste carro" acao={<Link href={registrar} className={classeBotao('primario')}>Fazer a primeira OS</Link>} />
        ) : (
          <SaudeDoCarro itens={itens} hoje={hoje} recomendacoes={recomendacoes} />
        )}
      </Secao>

      <DocumentosDoCarro veiculoId={veiculo.id} />

      <Secao titulo="Ordens por voz" descricao="Os áudios e as fotos das ordens que a IA montou, conferidas por você.">
        <OrdensDoCarro veiculoId={veiculo.id} telefone={cliente?.telefone ?? null} />
      </Secao>

      <Secao
        titulo="Óleo do manual"
        descricao="Com o óleo cadastrado, os avisos já mostram o produto certo e as promoções."
        acao={
          <Botao tamanho="pequeno" onClick={() => setFolha('oleo')}>
            <Pencil size={15} /> {oleo?.viscosidades?.length ? 'Editar' : 'Cadastrar'}
          </Botao>
        }
      >
        <div id="oleo" className="scroll-mt-24 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          {oleo?.viscosidades?.length ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Dado rotulo="Viscosidade" valor={oleo.viscosidades.join(' ou ')} />
              <Dado rotulo="API mínima" valor={oleo.api ? `API ${oleo.api}` : 'Não informada'} />
              <Dado rotulo="Norma" valor={oleo.norma ?? oleo.acea ?? 'Nenhuma'} />
              <Dado rotulo="Capacidade" valor={oleo.capacidadeL ? `${formatarNumero(oleo.capacidadeL, 2)} L com filtro` : 'Não informada'} />
              {oleo.base ? <Dado rotulo="Base usada" valor={nomeBase(oleo.base)} /> : null}
              {veiculo.intervaloOleo ? (
                <Dado rotulo="Troca no manual" valor={[veiculo.intervaloOleo.km ? formatarKm(veiculo.intervaloOleo.km) : '', veiculo.intervaloOleo.meses ? `${veiculo.intervaloOleo.meses} meses` : ''].filter(Boolean).join(' ou ')} />
              ) : null}
            </dl>
          ) : (
            <p className="text-tinta-2">Ainda não cadastrado.</p>
          )}
        </div>
      </Secao>

      <Secao titulo="Histórico">
        {historico.length === 0 ? (
          <p className="text-tinta-2">Sem serviços registrados.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {historico.map((a) => (
              <li key={a.id} className="rounded-2xl bg-papel ring-1 ring-linha">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-linha px-4 py-3 sm:px-5">
                  <p className="font-bold">{formatarData(a.data)}</p>
                  <p className="num text-tinta-2">{formatarKm(a.km)}</p>
                  {a.valor ? <p className="num text-tinta-2">{formatarMoeda(a.valor)}</p> : null}
                  <div className="ml-auto flex items-center gap-1">
                    <Link href={`/oficina/etiqueta?atendimento=${a.id}`} className="grid h-9 w-9 place-items-center rounded-lg text-tinta-3 hover:bg-papel-2 hover:text-tinta" aria-label="Imprimir etiqueta">
                      <Printer size={17} />
                    </Link>
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-lg text-tinta-3 hover:bg-atraso-claro hover:text-atraso"
                      aria-label="Apagar este registro"
                      onClick={() => {
                        if (window.confirm('Apagar este registro de serviço?')) removerAtendimento(a.id);
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                <ul className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                  {a.itens.map((i) => (
                    <li key={i.servico} className="flex items-start gap-3 text-[14.5px]">
                      <IconeServico servico={i.servico} size={18} className="mt-0.5 shrink-0 text-tinta-3" />
                      <span className="min-w-0">
                        <span className="font-semibold">{servico(i.servico).nome}</span>
                        {i.produto ? <span className="text-tinta-2">, {i.produto.nome}</span> : null}
                      </span>
                    </li>
                  ))}
                  {a.observacao ? <li className="text-[14px] text-tinta-2">{a.observacao}</li> : null}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Secao>

      {leituras.length ? (
        <Secao titulo="Quilometragem anotada" descricao="Anotou errado? Apague a leitura e a rodagem do carro é recalculada.">
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {leituras.map((l) => (
              <li key={l.id} className="flex items-center gap-4 px-4 py-2.5 text-[14.5px] sm:px-5">
                <span className="text-tinta-2">{formatarData(l.data)}</span>
                <span className="num font-semibold">{formatarKm(l.km)}</span>
                <button
                  type="button"
                  className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-tinta-3 hover:bg-atraso-claro hover:text-atraso"
                  aria-label={`Apagar a leitura de ${formatarKm(l.km)}`}
                  onClick={() => removerLeitura(l.id)}
                >
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      {contatosPorMomento.length ? (
        <Secao titulo="Contatos com o cliente">
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {contatosPorMomento.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[14.5px] sm:px-5">
                <span className="font-semibold">{RESULTADOS[c.resultado]}</span>
                <span className="text-tinta-2">{formatarData(dataLocal(c.quando))}</span>
                {c.data ? <span className="text-tinta-2">{c.resultado === 'agendado' ? 'para' : 'até'} {formatarData(c.data)}</span> : null}
                {c.observacao ? <span className="text-tinta-3">{c.observacao}</span> : null}
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      <FolhaOleo aberta={folha === 'oleo'} aoFechar={() => setFolha(null)} veiculoId={veiculo.id} />
      <FolhaCarro aberta={folha === 'carro'} aoFechar={() => setFolha(null)} veiculoId={veiculo.id} />
      {cliente ? (
        <FolhaCliente
          aberta={folha === 'cliente'}
          aoFechar={() => setFolha(null)}
          inicial={rascunhoDoCliente(cliente)}
          aoSalvar={(c) => {
            salvarCliente({ ...cliente, ...clienteDoRascunho(c) });
            setFolha(null);
            toast({ texto: 'Cliente atualizado.' });
          }}
        />
      ) : null}
      <FolhaKm
        aberta={folha === 'km'}
        aoFechar={() => setFolha(null)}
        hoje={hoje}
        estimado={kmHoje}
        aoSalvar={(d, km) => {
          anotarKm(veiculo.id, d, km);
          setFolha(null);
          toast({ texto: `${formatarKm(km)} anotado. A rodagem do carro foi recalculada.` });
        }}
      />
      <Folha
        aberta={folha === 'excluir'}
        aoFechar={() => setFolha(null)}
        titulo="Apagar este carro?"
        descricao="O histórico de serviços e os contatos deste carro saem deste aparelho. Não dá para desfazer."
        rodape={
          <>
            <Botao onClick={() => setFolha(null)}>Cancelar</Botao>
            <Botao
              variante="perigo"
              onClick={() => {
                removerVeiculo(veiculo.id);
                router.replace('/oficina/clientes');
              }}
            >
              <Trash2 size={17} /> Apagar
            </Botao>
          </>
        }
      >
        <p className="text-tinta-2">O cliente {cliente?.nome} continua cadastrado.</p>
      </Folha>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[13px] text-tinta-3">{rotulo}</dt>
      <dd className="font-semibold">{valor}</dd>
    </div>
  );
}

function FolhaOleo({ aberta, aoFechar, veiculoId }: { aberta: boolean; aoFechar: () => void; veiculoId: string }) {
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const salvar = useOficina((s) => s.salvarVeiculo);
  const toast = useToast();
  const [rascunho, setRascunho] = useState(() => rascunhoDoVeiculo(veiculo));
  const [aberturaAnterior, setAberturaAnterior] = useState(aberta);
  if (aberta !== aberturaAnterior) {
    setAberturaAnterior(aberta);
    if (aberta) setRascunho(rascunhoDoVeiculo(veiculo));
  }
  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Óleo do manual"
      descricao={`${veiculo.marca} ${veiculo.modelo} ${veiculo.motor ?? ''} ${veiculo.ano ?? ''}`}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            onClick={() => {
              salvar({ ...veiculo, ...veiculoDoRascunho(rascunho, veiculo.clienteId) });
              aoFechar();
              toast({ texto: 'Óleo do manual salvo.' });
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <EditorOleo valor={rascunho} aoMudar={setRascunho} textoCarro={`${veiculo.marca} ${veiculo.modelo} ${veiculo.motor ?? ''} ${veiculo.ano ?? ''}`} />
    </Folha>
  );
}

function FolhaCarro({ aberta, aoFechar, veiculoId }: { aberta: boolean; aoFechar: () => void; veiculoId: string }) {
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const veiculos = useOficina((s) => s.veiculos);
  const salvar = useOficina((s) => s.salvarVeiculo);
  const toast = useToast();
  const [rascunho, setRascunho] = useState(() => rascunhoDoVeiculo(veiculo));
  const [erros, setErros] = useState<ReturnType<typeof errosVeiculo>>({});
  const [aberturaAnterior, setAberturaAnterior] = useState(aberta);
  if (aberta !== aberturaAnterior) {
    setAberturaAnterior(aberta);
    if (aberta) setRascunho(rascunhoDoVeiculo(veiculo));
  }
  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Dados do carro"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            onClick={() => {
              const e = errosVeiculo(rascunho);
              if (Object.values(veiculos).some((v) => v.id !== veiculo.id && v.placa === rascunho.placa)) e.placa = 'Outro carro já tem essa placa.';
              setErros(e);
              if (Object.keys(e).length) return;
              salvar({ ...veiculo, ...veiculoDoRascunho(rascunho, veiculo.clienteId) });
              aoFechar();
              toast({ texto: 'Carro atualizado.' });
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <CamposVeiculo valor={rascunho} aoMudar={setRascunho} erros={erros} completo />
    </Folha>
  );
}

function FolhaCliente({
  aberta,
  aoFechar,
  inicial,
  aoSalvar
}: {
  aberta: boolean;
  aoFechar: () => void;
  inicial: ReturnType<typeof rascunhoDoCliente>;
  aoSalvar: (c: ReturnType<typeof rascunhoDoCliente>) => void;
}) {
  const [c, setC] = useState(inicial);
  const [erros, setErros] = useState<ReturnType<typeof errosCliente>>({});
  const [aberturaAnterior, setAberturaAnterior] = useState(aberta);
  if (aberta !== aberturaAnterior) {
    setAberturaAnterior(aberta);
    if (aberta) setC(inicial);
  }
  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Cliente"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            onClick={() => {
              const e = errosCliente(c);
              setErros(e);
              if (!Object.keys(e).length) aoSalvar(c);
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <CamposCliente valor={c} aoMudar={setC} erros={erros} />
    </Folha>
  );
}

function FolhaKm({
  aberta,
  aoFechar,
  hoje,
  estimado,
  aoSalvar
}: {
  aberta: boolean;
  aoFechar: () => void;
  hoje: string;
  estimado: number;
  aoSalvar: (data: string, km: number) => void;
}) {
  const [data, setData] = useState(hoje);
  const [km, setKm] = useState('');
  const n = lerNumero(km);
  const dataOk = !!data && data <= hoje;
  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Anotar quilometragem"
      descricao="Quando o cliente passar na oficina ou mandar uma foto do painel. Ajuda a prever melhor os vencimentos."
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!n || n <= 0 || !dataOk} onClick={() => n && dataOk && aoSalvar(data, n)}>
            Anotar
          </Botao>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data" htmlFor="km-data">
          <input id="km-data" type="date" className={classeEntrada} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Quilometragem" htmlFor="km-valor" dica={`Estimado para hoje: ${formatarKm(estimado)}.`}>
          <input id="km-valor" className={`${classeEntrada} largo num font-bold`} value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" autoComplete="off" />
        </Campo>
      </div>
    </Folha>
  );
}
