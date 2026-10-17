'use client';

// O checklist de entrada: km, combustível em oitavos, os itens do carro (OK, falta ou avaria),
// as avarias marcadas no desenho do carro (com tipo, nota e foto), fotos, observações e a
// assinatura do cliente. Cada mudança é gravada na hora. Imprime em A4 e, com a conta, vai para o
// cliente por um link onde ele confere e assina.

import { ArrowLeft, Camera, ClipboardCheck, MessageCircle, PenLine, Printer, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { QuadroDeAssinatura } from '@/components/cliente/Assinatura';
import { CarroDeCima } from '@/components/cliente/CarroDeCima';
import { dataHora } from '@/components/cliente/comum';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Vazio, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { cabeNoAparelho, combustivelEmTexto, ESTADOS_DO_ITEM, ITENS_DO_CHECKLIST, mensagemDoChecklist, novaAvaria, pendenciasDoChecklist, TIPOS_DE_AVARIA } from '@/lib/checklist';
import { formatarCnpj } from '@/lib/cnpj';
import { formatarKm, formatarTelefone, lerNumero, SEM_NOME } from '@/lib/formatos';
import type { AvariaChecklist, Checklist, EstadoItemChecklist, FotoRegistro, TipoAvaria } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoSemConta, copiarTexto, janelaParaDepois } from './comum';
import { useContextoDaConta } from './conta';
import { enderecoDaFotoRegistro, enviarFoto, fotoNoAparelho, novoIdDeFoto } from './fotos';
import { criarChecklist } from './PainelChecklist';
import { publicarChecklist } from './publicar';

export function PaginaDoChecklist() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  const documentoId = params.get('documento');
  const veiculoId = params.get('veiculo');
  const checklist = useOficina((s) => (id ? s.checklists[id] : undefined));
  const existe = useOficina((s) => (documentoId ? !!s.documentos[documentoId] : veiculoId ? !!s.veiculos[veiculoId] : false));

  // aberto pela ordem ou pelo carro: usa o checklist da ordem ou cria um
  useEffect(() => {
    if (id || !existe) return;
    const novo = criarChecklist({ documentoId, veiculoId });
    if (novo) router.replace(`/oficina/checklist?id=${novo}`);
  }, [id, existe, documentoId, veiculoId, router]);

  if (!id) {
    if (documentoId || veiculoId) return existe ? <div className="min-h-[40vh]" aria-busy="true" /> : <NaoAchou />;
    return <ListaDeChecklists />;
  }
  if (!checklist) return <NaoAchou />;
  return <Editor c={checklist} />;
}

function NaoAchou() {
  return (
    <Vazio titulo="Checklist não encontrado" acao={<Link href="/oficina/ordens?aba=ordens" className={classeBotao()}>Ver as ordens</Link>}>
      Ele pode ter sido apagado, ou ainda não chegou neste aparelho.
    </Vazio>
  );
}

function ListaDeChecklists() {
  const checklists = useOficina((s) => s.checklists);
  const veiculos = useOficina((s) => s.veiculos);
  const lista = useMemo(() => Object.values(checklists).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)), [checklists]);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="largo text-[30px] sm:text-[34px]">Checklists de entrada</h1>
        <p className="mt-1 max-w-[60ch] text-tinta-2">Faça o checklist pela ordem de serviço ou pela página do carro. Aqui ficam os mais recentes.</p>
      </header>
      {lista.length ? (
        <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {lista.slice(0, 50).map((c) => {
            const v = c.veiculoId ? veiculos[c.veiculoId] : undefined;
            return (
              <li key={c.id}>
                <Link href={`/oficina/checklist?id=${c.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-papel-2 sm:px-5">
                  {v ? <Placa placa={v.placa} /> : null}
                  <span className="font-semibold">{v?.modelo ?? 'Carro'}</span>
                  <span className="text-[13.5px] text-tinta-3">{dataHora(c.criadoEm)}</span>
                  <span className={`ml-auto text-[13px] font-semibold ${c.assinatura ? 'text-ok' : 'text-oleo-tinta'}`}>{c.assinatura ? 'Assinado' : 'Sem assinatura'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo="Nenhum checklist ainda">Abra uma ordem de serviço e toque em Fazer o checklist.</Vazio>
      )}
    </div>
  );
}

function Editor({ c }: { c: Checklist }) {
  const toast = useToast();
  const ctx = useContextoDaConta();
  const doc = useOficina((s) => (c.documentoId ? s.documentos[c.documentoId] : undefined));
  const veiculo = useOficina((s) => (c.veiculoId ? s.veiculos[c.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const nomeOficina = useOficina((s) => s.oficina.nome);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [km, setKm] = useState(c.km != null ? String(c.km) : '');
  const [nome, setNome] = useState(cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : '');
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [refazer, setRefazer] = useState(false);
  const fotoPorId = useMemo(() => new Map((c.fotos ?? []).map((f) => [f.id, f])), [c.fotos]);
  const gerais = (c.fotos ?? []).filter((f) => !c.avarias.some((a) => a.fotoIds?.includes(f.id)));
  const voltar = doc ? `/oficina/ordens?${doc.tipo === 'ordem' ? 'aba=ordens&' : ''}ver=${doc.id}` : veiculo ? `/oficina/carro?id=${veiculo.id}` : '/oficina/checklist';

  function atualizar(parte: Partial<Checklist>) {
    const atual = useOficina.getState().checklists[c.id];
    if (atual) useOficina.getState().salvarRegistro('checklists', { ...atual, ...parte });
  }

  async function novaFoto(arquivo: File): Promise<FotoRegistro | null> {
    const r = ctx ? await enviarFoto(ctx, 'checklist', arquivo) : await fotoNoAparelho(arquivo);
    if (!r.ok) {
      toast({ texto: r.erro, tom: 'erro' });
      return null;
    }
    const atual = useOficina.getState().checklists[c.id];
    if (!ctx && atual && !cabeNoAparelho(atual, r.foto.dataUrl?.length ?? 0)) {
      toast({ texto: 'Sem conta, cabem poucas fotos no aparelho. Entre com sua conta para guardar mais.', tom: 'erro' });
      return null;
    }
    return r.foto;
  }

  async function adicionarFotos(arquivos: FileList | null, avariaId?: string) {
    if (!arquivos?.length) return;
    setOcupado(true);
    for (const arquivo of Array.from(arquivos).slice(0, 6)) {
      const foto = await novaFoto(arquivo);
      if (!foto) break;
      const atual = useOficina.getState().checklists[c.id];
      if (!atual) break;
      atualizar({
        fotos: [...(atual.fotos ?? []), foto].slice(-24),
        ...(avariaId ? { avarias: atual.avarias.map((a) => (a.id === avariaId ? { ...a, fotoIds: [...(a.fotoIds ?? []), foto.id].slice(-4) } : a)) } : {})
      });
    }
    setOcupado(false);
  }

  function tirarFoto(fotoId: string) {
    const atual = useOficina.getState().checklists[c.id];
    if (!atual) return;
    atualizar({ fotos: atual.fotos.filter((f) => f.id !== fotoId), avarias: atual.avarias.map((a) => ({ ...a, fotoIds: a.fotoIds?.filter((x) => x !== fotoId) })) });
  }

  function marcar(x: number, y: number) {
    const atual = useOficina.getState().checklists[c.id];
    if (!atual || atual.avarias.length >= 30) return;
    const a = novaAvaria(novoIdDeFoto().replace('f-', 'a-'), x, y);
    atualizar({ avarias: [...atual.avarias, a] });
    setSelecionada(a.id);
  }

  function mudarAvaria(id: string, parte: Partial<AvariaChecklist>) {
    const atual = useOficina.getState().checklists[c.id];
    if (atual) atualizar({ avarias: atual.avarias.map((a) => (a.id === id ? { ...a, ...parte } : a)) });
  }

  function salvarAssinatura() {
    if (nome.trim().length < 2) return toast({ texto: 'Escreva o nome de quem assina.', tom: 'erro' });
    if (!assinatura) return toast({ texto: 'Peça para o cliente assinar no quadro.', tom: 'erro' });
    atualizar({ assinatura: { nome: nome.trim().slice(0, 80), imagem: assinatura, quando: new Date().toISOString() } });
    setRefazer(false);
    setAssinatura(null);
    toast({ texto: 'Assinatura guardada.' });
    if (ctx && c.link?.url) void publicarChecklist(c.id, ctx);
  }

  async function mandar() {
    if (!ctx) return;
    const tel = cliente?.telefone;
    const janela = tel ? janelaParaDepois() : null;
    setOcupado(true);
    const r = await publicarChecklist(c.id, ctx);
    setOcupado(false);
    if (!r.ok || !r.link.url) {
      janela?.fechar();
      return toast({ texto: r.ok ? 'O link não ficou pronto.' : r.erro, tom: 'erro' });
    }
    const texto = mensagemDoChecklist({ oficina: nomeOficina, cliente: cliente?.nome ?? '', carro: veiculo?.modelo ?? '', link: r.link.url, assinado: !!c.assinatura });
    const zap = tel ? linkWhatsApp(tel, texto) : null;
    if (janela && zap) janela.ir(zap);
    else toast({ texto: (await copiarTexto(texto)) ? 'Mensagem com o link copiada.' : 'Link pronto.' });
  }

  const p = pendenciasDoChecklist(c);

  return (
    <div className="flex flex-col gap-7">
      <style>{'@page { size: A4; margin: 12mm; }'}</style>
      <div className="nao-imprimir flex flex-col gap-7">
        <header className="flex flex-col gap-3">
          <Link href={voltar} className="inline-flex items-center gap-1 self-start text-[14px] font-semibold text-tinta-3 hover:text-tinta">
            <ArrowLeft size={16} aria-hidden="true" /> {doc ? 'Voltar à ordem' : 'Voltar'}
          </Link>
          <h1 className="largo text-[28px] sm:text-[32px]">Checklist de entrada</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            {veiculo ? <Placa placa={veiculo.placa} grande /> : null}
            <p className="font-semibold">{[veiculo?.marca, veiculo?.modelo].filter(Boolean).join(' ') || 'Carro'}</p>
            <p className="text-tinta-2">{[cliente?.nome !== SEM_NOME ? cliente?.nome : '', doc ? `${doc.tipo === 'ordem' ? 'OS' : 'Orçamento'} nº ${doc.numero}` : '', dataHora(c.criadoEm)].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao onClick={() => window.print()}>
              <Printer size={17} aria-hidden="true" /> Imprimir
            </Botao>
            {ctx ? (
              <Botao variante="whatsapp" disabled={ocupado} onClick={() => void mandar()}>
                <MessageCircle size={17} aria-hidden="true" /> {c.link?.url ? 'Mandar de novo ao cliente' : 'Mandar cópia ao cliente'}
              </Botao>
            ) : null}
          </div>
          {!ctx ? <AvisoSemConta texto="Sem conta, imprima ou assine aqui. Entre com sua conta para mandar o link ao cliente." /> : null}
        </header>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Quilometragem e combustível">
          <Campo rotulo="Quilometragem" htmlFor="ck-km">
            <input
              id="ck-km"
              inputMode="numeric"
              className={`${classeEntrada} num`}
              value={km}
              onChange={(e) => setKm(e.target.value)}
              onBlur={() => {
                const n = lerNumero(km);
                atualizar({ km: n != null && n >= 0 ? Math.round(n) : null });
                if (n != null) setKm(String(Math.round(n)));
              }}
              placeholder="Ex.: 84.500"
            />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Combustível: {combustivelEmTexto(c.combustivel)}</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Combustível no tanque, em oitavos">
              {Array.from({ length: 9 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={c.combustivel === n}
                  aria-label={combustivelEmTexto(n)}
                  onClick={() => atualizar({ combustivel: n })}
                  className={`h-11 flex-1 rounded-md text-[12px] font-bold ${c.combustivel != null && n <= c.combustivel ? 'bg-oleo text-[#1b1f22]' : 'bg-papel-2 text-tinta-3 ring-1 ring-linha'}`}
                >
                  {n === 0 ? 'R' : n === 8 ? 'C' : n === 4 ? '½' : ''}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="t-ck-itens">
          <h2 id="t-ck-itens" className="text-[19px]">
            Itens do carro
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ITENS_DO_CHECKLIST.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-papel px-3 py-2 ring-1 ring-linha">
                <span className="text-[15px] font-semibold">{item.nome}</span>
                <span className="flex gap-1" role="group" aria-label={item.nome}>
                  {(Object.keys(ESTADOS_DO_ITEM) as EstadoItemChecklist[]).map((e) => {
                    const sel = c.itens[item.id] === e;
                    const cor = e === 'ok' ? 'bg-ok text-sobre-ok' : e === 'falta' ? 'bg-oleo text-[#1b1f22]' : 'bg-atraso text-white';
                    return (
                      <button
                        key={e}
                        type="button"
                        aria-pressed={sel}
                        onClick={() => {
                          const itens = { ...useOficina.getState().checklists[c.id]?.itens };
                          if (sel) delete itens[item.id];
                          else itens[item.id] = e;
                          atualizar({ itens });
                        }}
                        className={`h-9 rounded-lg px-2.5 text-[13px] font-semibold ${sel ? cor : 'bg-papel-2 text-tinta-2 hover:text-tinta'}`}
                      >
                        {ESTADOS_DO_ITEM[e]}
                      </button>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="t-ck-avarias">
          <h2 id="t-ck-avarias" className="text-[19px]">
            Avarias
          </h2>
          <p className="text-[14.5px] text-tinta-2">Toque no desenho onde está o risco, o amassado ou a peça quebrada.</p>
          <div className="grid items-start gap-4 sm:grid-cols-[220px_1fr]">
            <div className="rounded-2xl bg-papel p-3 text-tinta ring-1 ring-linha">
              <CarroDeCima marcas={c.avarias} aoTocar={marcar} selecionada={selecionada} />
            </div>
            {c.avarias.length ? (
              <ol className="flex flex-col gap-2">
                {c.avarias.map((a, i) => (
                  <li key={a.id} className={`flex flex-col gap-2 rounded-xl bg-papel px-3 py-2.5 ring-1 ${selecionada === a.id ? 'ring-caneta' : 'ring-linha'}`} onFocus={() => setSelecionada(a.id)}>
                    <div className="flex items-center gap-2">
                      <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-atraso text-[12px] font-bold text-white">{i + 1}</span>
                      <select className={`${classeEntrada} h-9 w-auto`} value={a.tipo} onChange={(e) => mudarAvaria(a.id, { tipo: e.target.value as TipoAvaria })} aria-label={`Tipo da avaria ${i + 1}`}>
                        {(Object.keys(TIPOS_DE_AVARIA) as TipoAvaria[]).map((t) => (
                          <option key={t} value={t}>
                            {TIPOS_DE_AVARIA[t]}
                          </option>
                        ))}
                      </select>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-tinta-2">{a.local}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const atual = useOficina.getState().checklists[c.id];
                          if (!atual) return;
                          const fora = new Set(a.fotoIds ?? []);
                          atualizar({ avarias: atual.avarias.filter((x) => x.id !== a.id), fotos: atual.fotos.filter((f) => !fora.has(f.id)) });
                        }}
                        className="grid h-9 w-9 place-items-center rounded-lg text-tinta-3 hover:bg-atraso-claro hover:text-atraso"
                        aria-label={`Tirar a avaria ${i + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <input className={`${classeEntrada} h-10`} placeholder="Nota (opcional). Ex.: risco de 10 cm na porta" maxLength={200} defaultValue={a.observacao ?? ''} onBlur={(e) => mudarAvaria(a.id, { observacao: e.target.value.trim() || undefined })} aria-label={`Nota da avaria ${i + 1}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      {(a.fotoIds ?? []).map((fid) => {
                        const f = fotoPorId.get(fid);
                        const src = f ? enderecoDaFotoRegistro(f) : null;
                        return src ? <Miniatura key={fid} src={src} alt={`Foto da avaria ${i + 1}`} aoTirar={() => tirarFoto(fid)} /> : null;
                      })}
                      <BotaoDeFoto rotulo="Foto" desativado={ocupado || (a.fotoIds?.length ?? 0) >= 4} aoEscolher={(l) => void adicionarFotos(l, a.id)} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[14.5px] text-tinta-3">Nenhuma avaria marcada.</p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="t-ck-fotos">
          <h2 id="t-ck-fotos" className="text-[19px]">
            Fotos
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {gerais.map((f) => {
              const src = enderecoDaFotoRegistro(f);
              return src ? <Miniatura key={f.id} src={src} alt="Foto do carro na entrada" aoTirar={() => tirarFoto(f.id)} /> : null;
            })}
            <BotaoDeFoto rotulo={ocupado ? 'Guardando…' : 'Tirar foto'} desativado={ocupado} aoEscolher={(l) => void adicionarFotos(l)} />
          </div>
          {!ctx ? <p className="text-[13px] text-tinta-3">Sem conta, as fotos ficam pequenas e cabem poucas.</p> : null}
        </section>

        <Campo rotulo="Observações" htmlFor="ck-obs">
          <textarea id="ck-obs" className={classeArea} rows={3} maxLength={1000} defaultValue={c.observacao ?? ''} onBlur={(e) => atualizar({ observacao: e.target.value.trim() })} placeholder="Ex.: cliente pediu para guardar as peças trocadas." />
        </Campo>

        <section className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha" aria-labelledby="t-ck-assinatura">
          <h2 id="t-ck-assinatura" className="flex items-center gap-2 text-[19px]">
            <PenLine size={19} aria-hidden="true" /> Assinatura do cliente
          </h2>
          {c.assinatura && !refazer ? (
            <>
              <img src={c.assinatura.imagem} alt={`Assinatura de ${c.assinatura.nome}`} className="h-24 w-auto self-start rounded-lg bg-white ring-1 ring-linha" />
              <p className="text-[14.5px]">
                {c.assinatura.nome}, em {dataHora(c.assinatura.quando)}
              </p>
              <Botao tamanho="pequeno" variante="fantasma" className="self-start" onClick={() => setRefazer(true)}>
                Assinar de novo
              </Botao>
            </>
          ) : (
            <>
              <p className="text-[14.5px] text-tinta-2">
                {p.avarias || p.faltam.length ? 'O cliente confere as avarias e os itens que faltam e assina.' : 'O cliente confere e assina.'}
                {ctx ? ' Ou mande o link e ele assina no celular dele.' : ''}
              </p>
              <Campo rotulo="Nome de quem assina" htmlFor="ck-nome">
                <input id="ck-nome" className={classeEntrada} value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
              </Campo>
              <QuadroDeAssinatura aoMudar={setAssinatura} />
              <div className="flex flex-wrap gap-2">
                <Botao variante="escuro" onClick={salvarAssinatura}>
                  <ClipboardCheck size={17} aria-hidden="true" /> Guardar a assinatura
                </Botao>
                {refazer ? (
                  <Botao variante="fantasma" onClick={() => setRefazer(false)}>
                    Cancelar
                  </Botao>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="so-imprimir">
        <FolhaDoChecklist c={c} />
      </div>
    </div>
  );
}

function Miniatura({ src, alt, aoTirar }: { src: string; alt: string; aoTirar: () => void }) {
  return (
    <span className="relative">
      <img src={src} alt={alt} className="h-16 w-16 rounded-lg object-cover ring-1 ring-linha" />
      <button type="button" onClick={aoTirar} className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-tinta text-papel" aria-label={`Tirar: ${alt}`}>
        <X size={13} />
      </button>
    </span>
  );
}

function BotaoDeFoto({ rotulo, desativado, aoEscolher }: { rotulo: string; desativado?: boolean; aoEscolher: (l: FileList | null) => void }) {
  return (
    <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-linha bg-papel px-3 text-sm font-semibold ${desativado ? 'pointer-events-none opacity-45' : 'hover:border-tinta-3'}`}>
      <Camera size={15} aria-hidden="true" /> {rotulo}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        disabled={desativado}
        onChange={(e) => {
          aoEscolher(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );
}

/** A folha A4 do checklist (só na impressão). */
function FolhaDoChecklist({ c }: { c: Checklist }) {
  const oficina = useOficina((s) => s.oficina);
  const doc = useOficina((s) => (c.documentoId ? s.documentos[c.documentoId] : undefined));
  const veiculo = useOficina((s) => (c.veiculoId ? s.veiculos[c.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const fotos = (c.fotos ?? []).map((f) => enderecoDaFotoRegistro(f)).filter((x): x is string => !!x);
  return (
    <div className="text-[10.5pt] leading-snug text-black">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <p className="text-[9pt] font-bold tracking-wide uppercase">Checklist de entrada</p>
          <h1 className="text-[17pt] font-extrabold">{oficina.nome || 'Oficina'}</h1>
          <p className="text-[9pt]">
            {[oficina.endereco, [oficina.cidade, oficina.uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ')}
            {oficina.whatsapp ? ` · ${formatarTelefone(oficina.whatsapp)}` : ''}
            {oficina.cnpj ? ` · CNPJ ${formatarCnpj(oficina.cnpj)}` : ''}
          </p>
        </div>
        <div className="text-right text-[10pt]">
          {doc ? <p className="font-bold">{doc.tipo === 'ordem' ? 'OS' : 'Orçamento'} nº {doc.numero}</p> : null}
          <p>{dataHora(c.criadoEm)}</p>
        </div>
      </header>
      <p className="py-2">
        <strong>Carro:</strong> {[veiculo?.marca, veiculo?.modelo, veiculo?.ano].filter(Boolean).join(' ')} · <strong>Placa:</strong> {veiculo?.placa ?? '—'} · <strong>Cliente:</strong>{' '}
        {cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : '—'}
      </p>
      <p className="pb-2">
        <strong>Km:</strong> {c.km != null ? formatarKm(c.km) : '—'} · <strong>Combustível:</strong> {combustivelEmTexto(c.combustivel)}
      </p>
      <table className="w-full border-collapse text-[10pt]">
        <tbody>
          {ITENS_DO_CHECKLIST.map((i) => (
            <tr key={i.id}>
              <td className="border-b border-[#cbd1ce] py-1">{i.nome}</td>
              <td className="border-b border-[#cbd1ce] py-1 text-right font-semibold">{c.itens[i.id] ? ESTADOS_DO_ITEM[c.itens[i.id]] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 grid grid-cols-[52mm_1fr] gap-4" style={{ breakInside: 'avoid' }}>
        <div style={{ width: '52mm' }}>
          <CarroDeCima marcas={c.avarias} />
        </div>
        <div>
          <p className="font-bold">Avarias</p>
          {c.avarias.length ? (
            <ol className="list-decimal pl-5">
              {c.avarias.map((a) => (
                <li key={a.id}>
                  {TIPOS_DE_AVARIA[a.tipo]}, {a.local}
                  {a.observacao ? `: ${a.observacao}` : ''}
                </li>
              ))}
            </ol>
          ) : (
            <p>Nenhuma.</p>
          )}
          {c.observacao ? (
            <>
              <p className="mt-2 font-bold">Observações</p>
              <p className="whitespace-pre-line">{c.observacao}</p>
            </>
          ) : null}
        </div>
      </div>
      {fotos.length ? (
        <div className="mt-3 grid grid-cols-4 gap-2" style={{ breakInside: 'avoid' }}>
          {fotos.slice(0, 12).map((src, i) => (
            <img key={i} src={src} alt={`Foto ${i + 1}`} className="aspect-square w-full object-cover" />
          ))}
        </div>
      ) : null}
      <div className="mt-6 flex items-end gap-6" style={{ breakInside: 'avoid' }}>
        <div className="flex-1">
          {c.assinatura ? <img src={c.assinatura.imagem} alt={`Assinatura de ${c.assinatura.nome}`} className="h-16 w-auto" /> : <div className="h-16" />}
          <p className="border-t border-black pt-1 text-[9.5pt]">
            Assinatura do cliente{c.assinatura ? `: ${c.assinatura.nome}, ${dataHora(c.assinatura.quando)}` : ''}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[8.5pt] text-[#4b545a]">O cliente confere o estado do carro na entrada. Feito com o Revisaí.</p>
    </div>
  );
}
