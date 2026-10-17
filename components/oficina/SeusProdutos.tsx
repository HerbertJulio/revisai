'use client';

import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sugerirParaBase } from '@/app/acoes';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { IconeServico } from '@/components/icones';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Secao, Vazio, classeArea, classeEntrada } from '@/components/ui';
import { CATEGORIAS, nomeCategoria } from '@/lib/catalogo';
import { lerNumero } from '@/lib/formatos';
import { servicosDaCategoria } from '@/lib/manutencao';
import { textoDoPrazo, type ProdutoProprio } from '@/lib/referencias';
import { useOficina } from '@/lib/store';
import type { Categoria } from '@/lib/tipos';

interface Rascunho {
  id?: string;
  categoria: Categoria;
  marca: string;
  nome: string;
  km: string;
  meses: string;
  observacao: string;
}

const VAZIO: Rascunho = { categoria: 'oleo_motor', marca: '', nome: '', km: '', meses: '', observacao: '' };

/** Produtos que a oficina usa e que não estão na loja nem na base, com o prazo que ela confia. */
export function SeusProdutos() {
  const proprios = useOficina((s) => s.produtosProprios);
  const salvar = useOficina((s) => s.salvarProdutoProprio);
  const remover = useOficina((s) => s.removerProdutoProprio);
  const toast = useToast();
  const router = useRouter();
  const { conta } = useConta();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const lista = Object.values(proprios).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome, 'pt-BR'));

  function abrir(p?: ProdutoProprio) {
    setErro(null);
    setRascunho(
      p
        ? { id: p.id, categoria: p.categoria, marca: p.marca, nome: p.nome, km: p.intervaloKm ? String(p.intervaloKm) : '', meses: p.intervaloMeses ? String(p.intervaloMeses) : '', observacao: p.observacao ?? '' }
        : VAZIO
    );
  }

  function guardar() {
    if (!rascunho) return;
    const km = lerNumero(rascunho.km);
    const meses = lerNumero(rascunho.meses);
    if (rascunho.nome.trim().length < 2) return setErro('Escreva o nome do produto.');
    if (!km && !meses) return setErro('Informe o prazo em km, em meses ou nos dois.');
    if ((km != null && (km < 100 || km > 500000)) || (meses != null && (meses < 1 || meses > 240))) return setErro('Confira o prazo.');
    salvar({
      id: rascunho.id,
      categoria: rascunho.categoria,
      marca: rascunho.marca,
      nome: rascunho.nome,
      intervaloKm: km ? Math.round(km) : null,
      intervaloMeses: meses ? Math.round(meses) : null,
      observacao: rascunho.observacao.trim() || undefined,
      ...(rascunho.id && proprios[rascunho.id]?.sugeridoEm ? { sugeridoEm: proprios[rascunho.id].sugeridoEm } : {})
    });
    toast({ texto: rascunho.id ? 'Produto atualizado.' : 'Produto guardado. Ele aparece na lista ao registrar o serviço.' });
    setRascunho(null);
  }

  function apagar(p: ProdutoProprio) {
    remover(p.id);
    toast({ texto: `${p.nome} saiu de Seus produtos.`, acao: { rotulo: 'Desfazer', fazer: () => salvar(p) } });
  }

  function sugerir(p: ProdutoProprio) {
    if (!p.marca.trim()) {
      abrir(p);
      setErro('Para sugerir para a base, escreva a marca do produto.');
      return;
    }
    // a sugestão vai pela oficina da conta (a equipe confere antes de entrar na base)
    if (!conta) {
      toast({ texto: 'Entre na sua conta para sugerir produtos para a base.', tom: 'erro', acao: { rotulo: 'Entrar', fazer: () => router.push('/entrar?para=/oficina/ajustes') } });
      return;
    }
    iniciar(async () => {
      let r: Awaited<ReturnType<typeof sugerirParaBase>>;
      try {
        r = await sugerirParaBase({
          categoria: p.categoria,
          marca: p.marca,
          nome: p.nome,
          intervaloKm: p.intervaloKm,
          intervaloMeses: p.intervaloMeses,
          observacao: p.observacao ?? ''
        });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
        return;
      }
      if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
      salvar({ ...p, sugeridoEm: new Date().toISOString() });
      toast({ texto: 'Sugestão enviada. A equipe confere a fonte e inclui na base para todas as oficinas.' });
    });
  }

  return (
    <Secao
      id="produtos"
      titulo="Seus produtos"
      descricao="Produtos que você usa e que não estão na loja, com o prazo de troca que você confia. Eles aparecem primeiro na lista ao registrar o serviço."
      acao={
        <Botao tamanho="pequeno" onClick={() => abrir()}>
          <Plus size={16} /> Produto
        </Botao>
      }
    >
      {lista.length === 0 ? (
        <Vazio titulo="Nenhum produto seu ainda">
          Ao registrar um serviço com um produto escrito à mão, marque Guardar em Seus produtos. Ou cadastre aqui com o prazo do fabricante.
        </Vazio>
      ) : (
        <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-papel-2 text-tinta-2">
                <IconeServico servico={servicosDaCategoria(p.categoria)[0] ?? 'revisao'} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{[p.marca, p.nome].filter(Boolean).join(' ')}</p>
                <p className="text-[13.5px] text-tinta-3">
                  {nomeCategoria(p.categoria)}, troca a cada {textoDoPrazo(p.intervaloKm, p.intervaloMeses)}
                  {p.sugeridoEm ? '. Sugerido para a base' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!p.sugeridoEm ? (
                  <Botao tamanho="pequeno" variante="fantasma" onClick={() => sugerir(p)} disabled={enviando} aria-label={`Sugerir ${p.nome} para a base`}>
                    <Send size={15} /> Sugerir
                  </Botao>
                ) : null}
                <Botao tamanho="pequeno" variante="fantasma" onClick={() => abrir(p)} aria-label={`Editar ${p.nome}`}>
                  <Pencil size={15} />
                </Botao>
                <Botao tamanho="pequeno" variante="fantasma" onClick={() => apagar(p)} aria-label={`Apagar ${p.nome}`}>
                  <Trash2 size={15} />
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Folha
        aberta={rascunho != null}
        aoFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? 'Editar produto' : 'Novo produto'}
        descricao="O prazo vem preenchido sempre que você escolher este produto."
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setRascunho(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={guardar}>
              Guardar
            </Botao>
          </div>
        }
      >
        {rascunho ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Categoria" htmlFor="pp-cat" className="sm:col-span-2">
              <select id="pp-cat" className={classeEntrada} value={rascunho.categoria} onChange={(e) => setRascunho({ ...rascunho, categoria: e.target.value as Categoria })}>
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Marca" htmlFor="pp-marca">
              <input id="pp-marca" className={classeEntrada} value={rascunho.marca} onChange={(e) => setRascunho({ ...rascunho, marca: e.target.value })} maxLength={80} placeholder="Ex.: Tecfil" />
            </Campo>
            <Campo rotulo="Produto" htmlFor="pp-nome">
              <input id="pp-nome" className={classeEntrada} value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} maxLength={160} placeholder="Ex.: Filtro de ar ARL 2345" />
            </Campo>
            <Campo rotulo="Troca a cada (km)" htmlFor="pp-km">
              <input id="pp-km" className={classeEntrada} value={rascunho.km} onChange={(e) => setRascunho({ ...rascunho, km: e.target.value })} inputMode="numeric" placeholder="sem km" />
            </Campo>
            <Campo rotulo="ou a cada (meses)" htmlFor="pp-meses">
              <input id="pp-meses" className={classeEntrada} value={rascunho.meses} onChange={(e) => setRascunho({ ...rascunho, meses: e.target.value })} inputMode="numeric" placeholder="sem prazo" />
            </Campo>
            <Campo rotulo="Observação" htmlFor="pp-obs" className="sm:col-span-2" dica="Opcional. Ex.: prazo da embalagem, fonte do fabricante.">
              <textarea id="pp-obs" rows={2} className={classeArea} value={rascunho.observacao} onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })} maxLength={600} />
            </Campo>
            {erro ? (
              <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso sm:col-span-2" role="alert">
                {erro}
              </p>
            ) : null}
          </div>
        ) : null}
      </Folha>
    </Secao>
  );
}
