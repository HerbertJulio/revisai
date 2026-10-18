'use client';

// A planilha de produtos: baixar o que está cadastrado e mandar de volta (Excel ou o sistema da loja).
// A leitura acontece aqui, com a prévia do que muda; o servidor confere de novo e grava tudo junto.

import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { importarPlanilha } from '@/app/fornecedor/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Chip } from '@/components/ui';
import { nomeCategoria } from '@/lib/catalogo';
import { formatarMoeda, plural } from '@/lib/formatos';
import type { LinhaProdutoDaLoja } from '@/lib/loja/dados';
import { COLUNAS_DA_PLANILHA, lerPlanilha, planilhaDosProdutos, type LeituraDaPlanilha } from '@/lib/loja/planilha';
import { AvisoErro } from './comum';

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function Planilha({ produtos }: { produtos: LinhaProdutoDaLoja[] }) {
  const toast = useToast();
  const arquivo = useRef<HTMLInputElement>(null);
  const [leitura, setLeitura] = useState<(LeituraDaPlanilha & { nome: string }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [importando, iniciar] = useTransition();

  function baixarPlanilha() {
    const dia = new Date().toISOString().slice(0, 10);
    baixar(`produtos-${dia}.csv`, planilhaDosProdutos(produtos));
  }

  async function escolher(f: File | undefined) {
    if (arquivo.current) arquivo.current.value = '';
    if (!f) return;
    setErro(null);
    if (f.size > 3_000_000) return toast({ texto: 'A planilha passou de 3 MB. Mande em partes.', tom: 'erro' });
    if (/\.xlsx?$/i.test(f.name)) return toast({ texto: 'Salve a planilha como CSV (no Excel: Salvar como, CSV) e mande de novo.', tom: 'erro' });
    try {
      const texto = await f.text();
      setLeitura({ ...lerPlanilha(texto, produtos), nome: f.name });
    } catch {
      toast({ texto: 'Não deu para ler o arquivo.', tom: 'erro' });
    }
  }

  function importar() {
    if (!leitura?.linhas.length) return;
    setErro(null);
    iniciar(async () => {
      try {
        const r = await importarPlanilha(leitura.linhas.map((l) => l.produto));
        if (!r.ok) return setErro(r.erro);
        setLeitura(null);
        toast({ texto: `Planilha importada: ${plural(r.novos, 'produto novo', 'produtos novos')} e ${plural(r.mudados, 'mudado', 'mudados')}.` });
      } catch {
        setErro('Sem conexão com o servidor. Nada foi mudado; tente de novo.');
      }
    });
  }

  const novos = leitura?.linhas.filter((l) => l.acao === 'novo').length ?? 0;
  const mudados = leitura?.linhas.filter((l) => l.acao === 'mudar').length ?? 0;

  return (
    <>
      <Botao onClick={baixarPlanilha} disabled={!produtos.length} title="Baixar os produtos em planilha (CSV)">
        <Download size={16} aria-hidden="true" /> Baixar planilha
      </Botao>
      <input ref={arquivo} id="planilha-produtos" type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void escolher(e.target.files?.[0])} />
      <label htmlFor="planilha-produtos" className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-linha bg-papel px-4 text-[15px] font-semibold whitespace-nowrap hover:border-tinta-3">
        <Upload size={16} aria-hidden="true" /> Importar planilha
      </label>

      <Folha
        aberta={leitura != null}
        aoFechar={() => setLeitura(null)}
        titulo="Importar planilha"
        descricao={leitura ? `${leitura.nome}: confira o que muda antes de importar. Nada muda até você confirmar.` : undefined}
        rodape={
          leitura ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <p className="text-[14px] text-tinta-2">
                {leitura.erros.length ? `Corrija ${plural(leitura.erros.length, 'linha', 'linhas')} e mande de novo.` : `${plural(novos, 'novo', 'novos')} e ${plural(mudados, 'mudança', 'mudanças')}.`}
              </p>
              <Botao variante="primario" onClick={importar} disabled={importando || !!leitura.erros.length || !leitura.linhas.length}>
                <FileSpreadsheet size={17} aria-hidden="true" /> {importando ? 'Importando…' : `Importar ${plural(leitura.linhas.length, 'produto', 'produtos')}`}
              </Botao>
            </div>
          ) : undefined
        }
      >
        {leitura ? (
          <div className="flex flex-col gap-4">
            {erro ? <AvisoErro>{erro}</AvisoErro> : null}
            {leitura.erros.length ? (
              <div className="flex flex-col gap-2 rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
                <p className="font-bold">Linhas com problema</p>
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {leitura.erros.slice(0, 50).map((e) => (
                    <li key={`${e.numero}-${e.erro}`}>
                      <span className="num font-semibold">Linha {e.numero}:</span> {e.erro}
                    </li>
                  ))}
                  {leitura.erros.length > 50 ? <li>E mais {leitura.erros.length - 50}.</li> : null}
                </ul>
              </div>
            ) : null}
            {leitura.ignoradas.length ? <p className="text-[13.5px] text-tinta-3">Colunas que ficaram de fora: {leitura.ignoradas.join(', ')}.</p> : null}
            {leitura.linhas.length ? (
              <ul className="divide-y divide-linha rounded-xl ring-1 ring-linha">
                {leitura.linhas.slice(0, 200).map((l) => (
                  <li key={l.numero} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[14px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{[l.produto.marca, l.produto.nome].filter(Boolean).join(' ')}</span>
                      <span className="text-[12.5px] text-tinta-3">
                        {nomeCategoria(l.produto.categoria)}
                        {l.produto.codigo ? `, código ${l.produto.codigo}` : ''}
                        {l.produto.estoque != null ? `, ${l.produto.estoque} em estoque` : ''}
                      </span>
                    </span>
                    <span className="num font-semibold">{formatarMoeda(l.produto.preco)}</span>
                    <Chip tom={l.acao === 'novo' ? 'ok' : 'caneta'}>{l.acao === 'novo' ? 'Novo' : 'Muda'}</Chip>
                  </li>
                ))}
                {leitura.linhas.length > 200 ? <li className="px-3 py-2 text-[13.5px] text-tinta-3">E mais {leitura.linhas.length - 200}.</li> : null}
              </ul>
            ) : !leitura.erros.length ? (
              <p className="text-[14.5px] text-tinta-2">A planilha não tem produtos.</p>
            ) : null}
            <details className="text-[13.5px] text-tinta-3">
              <summary className="cursor-pointer font-semibold text-tinta-2">Como montar a planilha</summary>
              <p className="mt-2">
                Baixe a planilha da loja e use como modelo. Colunas: {COLUNAS_DA_PLANILHA.join(', ')}. Só nome, categoria e preco são obrigatórias para produto novo. A linha com id (ou com o
                código de um produto seu) muda aquele produto; sem id, vira produto novo. Coluna que não vier fica como está. Em aplicacoes, separe os carros com |. Em ativo, sim ou não.
              </p>
            </details>
          </div>
        ) : null}
      </Folha>
    </>
  );
}
