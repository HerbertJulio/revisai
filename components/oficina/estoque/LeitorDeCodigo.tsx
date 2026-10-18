'use client';

// Ler o código de barras da embalagem com a câmera (BarcodeDetector, que o Chrome do Android tem)
// ou digitando, achar o produto no estoque e dar entrada, saída ou contagem ali mesmo. Código que
// não está em nenhum produto: liga a um produto que já tem ou cadastra um novo com ele.

import { Camera, CameraOff, Keyboard, ScanBarcode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { CATEGORIAS, nomeCategoria } from '@/lib/catalogo';
import { acharPorCodigo, campoDoCodigo, FORMATOS_DE_BARRAS, limparCodigo } from '@/lib/codigo-barras';
import { textoQuantidade, unidadeDaCategoria } from '@/lib/estoque';
import { formatarMoeda, formatarNumero, lerNumero } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { Categoria, Id, ItemEstoque } from '@/lib/tipos';
import { FotoProduto } from '../FotoProduto';

// o BarcodeDetector ainda não está nos tipos do TypeScript
interface CodigoLido {
  rawValue: string;
  format: string;
}
interface Detector {
  detect(fonte: CanvasImageSource): Promise<CodigoLido[]>;
}
interface ClasseDetector {
  new (opcoes?: { formats?: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

function classeDoDetector(): ClasseDetector | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { BarcodeDetector?: ClasseDetector }).BarcodeDetector ?? null) as ClasseDetector | null;
}

function nomeDoItem(i: Pick<ItemEstoque, 'marca' | 'nome'>): string {
  return i.marca && !i.nome.toLowerCase().includes(i.marca.toLowerCase()) ? `${i.marca} ${i.nome}` : i.nome;
}

type Tela = { tipo: 'ler' } | { tipo: 'achou'; itemId: Id; codigo: string } | { tipo: 'nao_achou'; codigo: string };

export function LeitorDeCodigo() {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <Botao onClick={() => setAberta(true)}>
        <ScanBarcode size={18} aria-hidden="true" /> Ler código
      </Botao>
      {aberta ? <FolhaLeitor aoFechar={() => setAberta(false)} /> : null}
    </>
  );
}

function FolhaLeitor({ aoFechar }: { aoFechar: () => void }) {
  const [tela, setTela] = useState<Tela>({ tipo: 'ler' });
  const [temCamera] = useState(() => !!classeDoDetector() && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  const [usarCamera, setUsarCamera] = useState(temCamera);
  const [digitado, setDigitado] = useState('');

  function procurar(codigo: string) {
    const c = limparCodigo(codigo);
    if (c.length < 3) return;
    const item = acharPorCodigo(Object.values(useOficina.getState().estoque), c);
    setTela(item ? { tipo: 'achou', itemId: item.id, codigo: c } : { tipo: 'nao_achou', codigo: c });
  }

  return (
    <Folha aberta aoFechar={aoFechar} titulo="Ler código de barras" descricao="Aponte a câmera para o código da embalagem, ou digite o código.">
      <div className="flex flex-col gap-4">
        {tela.tipo === 'ler' ? (
          <>
            {temCamera && usarCamera ? <VisorDaCamera aoLer={procurar} aoFalhar={() => setUsarCamera(false)} /> : null}
            {!temCamera ? <p className="rounded-xl bg-papel-2 px-3.5 py-2.5 text-[14px] text-tinta-2">Este navegador não lê código pela câmera (o Chrome do Android lê). Digite o código abaixo.</p> : null}
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                procurar(digitado);
              }}
            >
              <label htmlFor="codigo-digitado" className="flex items-center gap-1.5 text-sm font-semibold">
                <Keyboard size={16} aria-hidden="true" /> Código de barras ou do produto
              </label>
              <div className="flex gap-2">
                <input id="codigo-digitado" className={`${classeEntrada} num`} value={digitado} onChange={(e) => setDigitado(e.target.value)} inputMode="text" autoComplete="off" placeholder="7891000315507" autoFocus={!temCamera} />
                <Botao type="submit" variante="escuro" disabled={limparCodigo(digitado).length < 3}>
                  Buscar
                </Botao>
              </div>
            </form>
            {temCamera && !usarCamera ? (
              <Botao className="self-start" onClick={() => setUsarCamera(true)}>
                <Camera size={17} aria-hidden="true" /> Usar a câmera
              </Botao>
            ) : null}
          </>
        ) : tela.tipo === 'achou' ? (
          <ItemLido itemId={tela.itemId} aoLerOutro={() => {
            setDigitado('');
            setTela({ tipo: 'ler' });
          }} />
        ) : (
          <CodigoNovo
            codigo={tela.codigo}
            aoLigar={(itemId) => setTela({ tipo: 'achou', itemId, codigo: tela.codigo })}
            aoVoltar={() => setTela({ tipo: 'ler' })}
          />
        )}
      </div>
    </Folha>
  );
}

/** A câmera de trás procurando código; para sozinha ao achar ou ao sair da tela. */
function VisorDaCamera({ aoLer, aoFalhar }: { aoLer: (codigo: string) => void; aoFalhar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const aoLerRef = useRef(aoLer);
  useEffect(() => {
    aoLerRef.current = aoLer;
  });

  useEffect(() => {
    const Classe = classeDoDetector();
    if (!Classe) return;
    let parar = false;
    let stream: MediaStream | null = null;
    let espera: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const suportados = await Classe.getSupportedFormats().catch(() => [] as string[]);
        const formatos = FORMATOS_DE_BARRAS.filter((f) => suportados.includes(f));
        const detector = new Classe(formatos.length ? { formats: formatos } : undefined);
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (parar || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const procurar = async () => {
          if (parar || !video.current) return;
          try {
            const lidos = await detector.detect(video.current);
            const valor = lidos.find((l) => l.rawValue?.trim())?.rawValue;
            if (valor) {
              navigator.vibrate?.(60);
              aoLerRef.current(valor);
              return;
            }
          } catch {
            // um quadro ruim: tenta o próximo
          }
          espera = setTimeout(procurar, 250);
        };
        void procurar();
      } catch {
        if (!parar) setErro('Não deu para abrir a câmera. Confira a permissão do navegador ou digite o código.');
      }
    })();
    return () => {
      parar = true;
      clearTimeout(espera);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (erro)
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl bg-papel-2 px-3.5 py-3 text-[14px] text-tinta-2" role="alert">
        <p className="flex items-center gap-2">
          <CameraOff size={16} aria-hidden="true" /> {erro}
        </p>
        <button type="button" onClick={aoFalhar} className="font-semibold text-caneta hover:underline">
          Fechar a câmera
        </button>
      </div>
    );
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Câmera procurando o código de barras" />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-oleo/80" aria-hidden="true" />
      <button type="button" onClick={aoFalhar} className="absolute top-2 right-2 rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-semibold text-white">
        Digitar
      </button>
    </div>
  );
}

type Acao = 'entrada' | 'saida' | 'contagem';

function ItemLido({ itemId, aoLerOutro }: { itemId: Id; aoLerOutro: () => void }) {
  const item = useOficina((s) => s.estoque[itemId]);
  const mover = useOficina((s) => s.moverEstoque);
  const toast = useToast();
  const [acao, setAcao] = useState<Acao>('entrada');
  const [quantidade, setQuantidade] = useState('1');
  const [custo, setCusto] = useState(() => (item?.custo != null ? formatarNumero(item.custo, 2) : ''));
  const [erro, setErro] = useState<string | null>(null);
  if (!item) return <p className="text-tinta-2">Esse produto saiu do estoque.</p>;
  const unidade = item.unidade === 'L' ? 'litros' : 'unidades';

  function confirmar() {
    if (!item) return;
    setErro(null);
    const q = lerNumero(quantidade);
    if (q == null || q < 0 || (acao !== 'contagem' && q === 0)) return setErro('Confira a quantidade.');
    if (acao === 'entrada') {
      const c = lerNumero(custo);
      mover({ itemId: item.id, tipo: 'entrada', quantidade: q, custoUnitario: c && c > 0 ? c : null, origem: { tipo: 'manual', rotulo: 'Entrada pelo código' } });
      toast({ texto: `Entrada de ${textoQuantidade(q, item.unidade)} de ${nomeDoItem(item)}.` });
    } else if (acao === 'saida') {
      if (q > item.quantidade) return setErro(`Só tem ${textoQuantidade(item.quantidade, item.unidade)} no estoque.`);
      mover({ itemId: item.id, tipo: 'saida', quantidade: -q, origem: { tipo: 'manual', rotulo: 'Saída pelo código' } });
      toast({ texto: `Saída de ${textoQuantidade(q, item.unidade)} de ${nomeDoItem(item)}.` });
    } else {
      const dif = Math.round((q - item.quantidade) * 100) / 100;
      if (dif === 0) toast({ texto: 'A contagem bate com o estoque.' });
      else {
        mover({ itemId: item.id, tipo: 'ajuste', quantidade: dif, origem: { tipo: 'contagem', rotulo: 'Contagem pelo código' } });
        toast({ texto: `Estoque de ${nomeDoItem(item)} ajustado para ${textoQuantidade(q, item.unidade)}.` });
      }
    }
    aoLerOutro();
  }

  return (
    <div className="flex flex-col gap-4" data-testid="item-lido">
      <div className="flex items-center gap-3">
        <FotoProduto produto={{ imagemUrl: item.imagemUrl, categoria: item.categoria, nome: item.nome }} tamanhos="64px" className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-linha" />
        <div className="min-w-0">
          <p className="leading-snug font-bold">{nomeDoItem(item)}</p>
          <p className="text-[14px] text-tinta-2">
            Tem {textoQuantidade(item.quantidade, item.unidade)} · {nomeCategoria(item.categoria)}
            {item.custo != null ? ` · pagou ${formatarMoeda(item.custo)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-1 self-start rounded-[12px] bg-papel-2 p-1" role="tablist" aria-label="O que fazer">
        {(['entrada', 'saida', 'contagem'] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={acao === a}
            onClick={() => {
              setAcao(a);
              setQuantidade(a === 'contagem' ? formatarNumero(item.quantidade, 2) : '1');
            }}
            className={`h-9 rounded-[10px] px-3.5 text-[14.5px] font-semibold ${acao === a ? 'bg-papel shadow-sm' : 'text-tinta-2'}`}
          >
            {a === 'entrada' ? 'Entrada' : a === 'saida' ? 'Saída' : 'Contagem'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo={acao === 'contagem' ? `Contei (${unidade})` : `Quantidade (${unidade})`} htmlFor="lido-q">
          <input id="lido-q" className={`${classeEntrada} num`} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="decimal" />
        </Campo>
        {acao === 'entrada' ? (
          <Campo rotulo={`Pagou por ${item.unidade === 'L' ? 'litro' : 'unidade'}`} htmlFor="lido-custo">
            <input id="lido-custo" className={`${classeEntrada} num`} value={custo} onChange={(e) => setCusto(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </Campo>
        ) : null}
      </div>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" onClick={confirmar}>
          {acao === 'entrada' ? 'Dar entrada' : acao === 'saida' ? 'Dar saída' : 'Ajustar o estoque'}
        </Botao>
        <Botao variante="fantasma" onClick={aoLerOutro}>
          Ler outro código
        </Botao>
      </div>
    </div>
  );
}

function CodigoNovo({ codigo, aoLigar, aoVoltar }: { codigo: string; aoLigar: (itemId: Id) => void; aoVoltar: () => void }) {
  const estoque = useOficina((s) => s.estoque);
  const salvar = useOficina((s) => s.salvarItemEstoque);
  const mover = useOficina((s) => s.moverEstoque);
  const toast = useToast();
  const itens = Object.values(estoque).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const [ligarA, setLigarA] = useState('');
  const [novo, setNovo] = useState({ nome: '', categoria: 'outros' as Categoria, quantidade: '', custo: '' });
  const [erro, setErro] = useState<string | null>(null);

  function ligar() {
    const item = estoque[ligarA];
    if (!item) return setErro('Escolha o produto.');
    salvar({ ...item, ...campoDoCodigo(codigo) });
    toast({ texto: `Código ligado a ${nomeDoItem(item)}.` });
    aoLigar(item.id);
  }

  function cadastrar() {
    setErro(null);
    if (novo.nome.trim().length < 2) return setErro('Escreva o nome do produto.');
    const q = lerNumero(novo.quantidade) ?? 0;
    const c = lerNumero(novo.custo);
    if (q < 0) return setErro('Confira a quantidade.');
    const id = salvar({ nome: novo.nome.trim(), categoria: novo.categoria, unidade: unidadeDaCategoria(novo.categoria), quantidade: 0, minimo: 0, custo: c && c > 0 ? c : null, preco: null, ...campoDoCodigo(codigo) });
    if (q > 0) mover({ itemId: id, tipo: 'entrada', quantidade: q, custoUnitario: c && c > 0 ? c : null, origem: { tipo: 'manual', rotulo: 'Estoque inicial' } });
    toast({ texto: 'No estoque.' });
    aoLigar(id);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-xl bg-papel-2 px-3.5 py-2.5 text-[14.5px]">
        Nenhum produto do estoque tem o código <strong className="num">{codigo}</strong>.
      </p>
      {itens.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">É um produto que já está no estoque?</h3>
          <div className="flex gap-2">
            <select className={classeEntrada} value={ligarA} onChange={(e) => setLigarA(e.target.value)} aria-label="Produto do estoque">
              <option value="">Escolha o produto</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>
                  {nomeDoItem(i)}
                </option>
              ))}
            </select>
            <Botao onClick={ligar} disabled={!ligarA}>
              Ligar
            </Botao>
          </div>
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <h3 className="font-bold">Ou cadastre um produto novo com esse código</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome" htmlFor="cod-nome" className="sm:col-span-2">
            <input id="cod-nome" className={classeEntrada} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Filtro de óleo PSL 55" />
          </Campo>
          <Campo rotulo="Categoria" htmlFor="cod-cat">
            <select id="cod-cat" className={classeEntrada} value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value as Categoria })}>
              {CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={unidadeDaCategoria(novo.categoria) === 'L' ? 'Tem (litros)' : 'Tem'} htmlFor="cod-q">
              <input id="cod-q" className={`${classeEntrada} num`} value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} inputMode="decimal" placeholder="0" />
            </Campo>
            <Campo rotulo="Custo" htmlFor="cod-custo">
              <input id="cod-custo" className={`${classeEntrada} num`} value={novo.custo} onChange={(e) => setNovo({ ...novo, custo: e.target.value })} inputMode="decimal" placeholder="0,00" />
            </Campo>
          </div>
        </div>
        <Botao variante="primario" className="self-start" onClick={cadastrar}>
          Cadastrar
        </Botao>
      </section>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <button type="button" onClick={aoVoltar} className="self-start text-[14px] font-semibold text-caneta hover:underline">
        Ler outro código
      </button>
    </div>
  );
}
