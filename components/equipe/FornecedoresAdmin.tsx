'use client';

import { Copy, KeyRound, MessageCircle, Pencil, Plus, Store } from 'lucide-react';
import { useState, useTransition } from 'react';
import { gerarLinkDoFornecedor, salvarFornecedor } from '@/app/admin/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Vazio, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { dataCurta, type Cadastro } from '@/lib/equipe-dados';
import { formatarMoeda, formatarTelefone, lerNumero, plural } from '@/lib/formatos';
import type { FornecedorAdmin } from '@/lib/marketplace-dados';
import { UFS } from '@/lib/padroes';
import { PLANOS_FORNECEDOR, type PlanoFornecedor } from '@/lib/planos-fornecedor';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoErro } from './comum';
import { Numero } from '@/components/painel/Numero';

interface Rascunho {
  id?: number;
  nome: string;
  cidade: string;
  uf: string;
  whatsapp: string;
  descricao: string;
  ativo: boolean;
  plano: PlanoFornecedor;
  destaqueAte: string;
  comissao: string;
  mensalidade: string;
  email: string;
  observacao: string;
}

function rascunhoDe(f?: FornecedorAdmin): Rascunho {
  const plano = f?.contrato?.plano ?? (f?.destaque ? 'destaque' : 'vitrine');
  return {
    id: f?.id,
    nome: f?.nome ?? '',
    cidade: f?.cidade ?? '',
    uf: f?.uf ?? 'RJ',
    whatsapp: f?.whatsapp ? formatarTelefone(f.whatsapp) : '',
    descricao: f?.descricao ?? '',
    ativo: f?.ativo ?? true,
    plano,
    destaqueAte: f?.destaque_ate ?? '',
    comissao: String(f?.contrato?.comissao_percentual ?? PLANOS_FORNECEDOR[plano].comissao).replace('.', ','),
    mensalidade: String(f?.contrato?.mensalidade ?? PLANOS_FORNECEDOR[plano].mensalidade).replace('.', ','),
    email: f?.contrato?.email ?? '',
    observacao: f?.contrato?.observacao ?? ''
  };
}

export function FornecedoresAdmin({ fornecedores, leads, hoje }: { fornecedores: FornecedorAdmin[]; leads: Cadastro[]; hoje: string }) {
  const toast = useToast();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<{ fornecedor: FornecedorAdmin; url: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const ativos = fornecedores.filter((f) => f.ativo && !f.demonstracao);
  const vendas = fornecedores.reduce((s, f) => s + f.vendasMes, 0);
  const comissao = fornecedores.reduce((s, f) => s + f.comissaoMes, 0);
  const mensalidades = fornecedores.filter((f) => f.ativo && f.contrato?.plano === 'destaque').reduce((s, f) => s + (f.contrato?.mensalidade ?? 0), 0);

  function abrir(f?: FornecedorAdmin) {
    setErro(null);
    setRascunho(rascunhoDe(f));
  }

  function deLead(c: Cadastro) {
    setErro(null);
    setRascunho({
      ...rascunhoDe(),
      nome: c.empresa || c.nome,
      cidade: c.cidade ?? '',
      uf: c.uf ?? 'RJ',
      whatsapp: c.whatsapp ? formatarTelefone(c.whatsapp) : '',
      email: c.email ?? '',
      descricao: c.mensagem?.slice(0, 400) ?? '',
      plano: c.plano === 'destaque' ? 'destaque' : 'vitrine'
    });
  }

  function mudarPlano(plano: PlanoFornecedor) {
    if (!rascunho) return;
    setRascunho({ ...rascunho, plano, comissao: String(PLANOS_FORNECEDOR[plano].comissao), mensalidade: String(PLANOS_FORNECEDOR[plano].mensalidade) });
  }

  function salvar() {
    if (!rascunho) return;
    setErro(null);
    const comissao = lerNumero(rascunho.comissao);
    const mensalidade = lerNumero(rascunho.mensalidade);
    if (comissao == null || comissao < 0 || comissao > 30) return setErro('A comissão vai de 0 a 30%.');
    if (mensalidade == null || mensalidade < 0) return setErro('Confira a mensalidade.');
    iniciar(async () => {
      try {
        const r = await salvarFornecedor({ ...rascunho, comissao, mensalidade });
        if (!r.ok) return setErro(r.erro);
        toast({ texto: rascunho.id ? 'Fornecedor atualizado.' : 'Fornecedor criado. Gere o link de acesso para ele entrar no painel.' });
        setRascunho(null);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function gerarLink(f: FornecedorAdmin) {
    if (f.temAcesso && !window.confirm(`Gerar um link novo para ${f.nome}? O link antigo para de funcionar.`)) return;
    iniciar(async () => {
      try {
        const r = await gerarLinkDoFornecedor(f.id);
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        setLink({ fornecedor: f, url: r.link });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Link copiado.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o link e copie.', tom: 'erro' });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Fornecedores ativos" valor={String(ativos.length)} />
        <Numero rotulo="Vendas no mês" valor={formatarMoeda(vendas)} />
        <Numero rotulo="Comissão no mês" valor={formatarMoeda(comissao)} />
        <Numero rotulo="Mensalidades Destaque" valor={formatarMoeda(mensalidades)} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="t-fornecedores">
        <div className="flex items-end justify-between gap-3">
          <h2 id="t-fornecedores" className="text-[21px]">
            Lojas
          </h2>
          <Botao tamanho="pequeno" variante="escuro" onClick={() => abrir()}>
            <Plus size={16} /> Fornecedor
          </Botao>
        </div>
        {fornecedores.length ? (
          <ul className="flex flex-col gap-3">
            {fornecedores.map((f) => {
              const whatsapp = f.whatsapp ? linkWhatsApp(f.whatsapp, 'Olá! Aqui é da equipe do Revisaí.') : null;
              const plano = f.contrato?.plano ?? 'vitrine';
              return (
                <li key={f.id} className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[17px] font-bold">{f.nome}</p>
                        {plano === 'destaque' ? (
                          <Chip tom="caneta">{f.destaque_ate ? `Destaque até ${dataCurta(f.destaque_ate, hoje)}` : 'Destaque'}</Chip>
                        ) : (
                          <Chip>Vitrine</Chip>
                        )}
                        {f.demonstracao ? <Chip>Exemplo</Chip> : null}
                        {!f.ativo ? <Chip tom="atraso">Fora da loja</Chip> : null}
                        {f.destaque_ate && f.destaque_ate < hoje ? <Chip tom="atraso">Destaque vencido</Chip> : null}
                      </div>
                      <p className="mt-0.5 text-[14px] text-tinta-3">
                        {[[f.cidade, f.uf].filter(Boolean).join(', '), plural(f.produtosAtivos, 'produto ativo', 'produtos ativos'), `comissão de ${String(f.contrato?.comissao_percentual ?? 5).replace('.', ',')}%`]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-[17px] font-extrabold">{formatarMoeda(f.vendasMes)}</p>
                      <p className="text-[13px] text-tinta-3">
                        {plural(f.pedidosMes, 'pedido', 'pedidos')} no mês, {formatarMoeda(f.comissaoMes)} de comissão
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Botao tamanho="pequeno" onClick={() => abrir(f)}>
                      <Pencil size={15} /> Editar
                    </Botao>
                    <Botao tamanho="pequeno" onClick={() => gerarLink(f)} disabled={salvando}>
                      <KeyRound size={15} /> {f.temAcesso ? 'Novo link de acesso' : 'Gerar link de acesso'}
                    </Botao>
                    {whatsapp ? (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
                        <MessageCircle size={15} aria-hidden="true" /> WhatsApp
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vazio titulo="Nenhum fornecedor ainda" acao={<Botao onClick={() => abrir()}>Cadastrar fornecedor</Botao>} />
        )}
      </section>

      {leads.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="t-leads">
          <h2 id="t-leads" className="text-[21px]">
            Querem vender
          </h2>
          <p className="-mt-1 text-[15px] text-tinta-2">Cadastros de fornecedores do site que ainda não viraram loja.</p>
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {leads.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Store size={18} className="text-tinta-3" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.empresa || c.nome}</p>
                  <p className="truncate text-[13.5px] text-tinta-3">{[c.nome !== (c.empresa || c.nome) ? c.nome : '', [c.cidade, c.uf].filter(Boolean).join(', '), c.mensagem].filter(Boolean).join(', ')}</p>
                </div>
                <Botao tamanho="pequeno" onClick={() => deLead(c)}>
                  Criar loja
                </Botao>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Folha
        aberta={rascunho != null}
        aoFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? 'Editar fornecedor' : 'Novo fornecedor'}
        descricao="Dados da loja, plano e comissão combinados."
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setRascunho(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        }
      >
        {rascunho ? (
          <div className="grid gap-4 sm:grid-cols-6">
            <Campo rotulo="Nome da loja" htmlFor="fa-nome" className="sm:col-span-6">
              <input id="fa-nome" className={classeEntrada} value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} maxLength={120} />
            </Campo>
            <Campo rotulo="Cidade" htmlFor="fa-cidade" className="sm:col-span-4">
              <input id="fa-cidade" className={classeEntrada} value={rascunho.cidade} onChange={(e) => setRascunho({ ...rascunho, cidade: e.target.value })} maxLength={80} />
            </Campo>
            <Campo rotulo="UF" htmlFor="fa-uf" className="sm:col-span-2">
              <select id="fa-uf" className={classeEntrada} value={rascunho.uf} onChange={(e) => setRascunho({ ...rascunho, uf: e.target.value })}>
                {UFS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="WhatsApp" htmlFor="fa-whats" className="sm:col-span-3">
              <input id="fa-whats" className={classeEntrada} value={rascunho.whatsapp} onChange={(e) => setRascunho({ ...rascunho, whatsapp: e.target.value })} inputMode="tel" />
            </Campo>
            <Campo rotulo="E-mail" htmlFor="fa-email" className="sm:col-span-3">
              <input id="fa-email" className={classeEntrada} value={rascunho.email} onChange={(e) => setRascunho({ ...rascunho, email: e.target.value })} inputMode="email" />
            </Campo>
            <Campo rotulo="Descrição na loja" htmlFor="fa-desc" className="sm:col-span-6" dica="Aparece no detalhe dos produtos. Ex.: entrega em 24 horas na capital.">
              <textarea id="fa-desc" rows={2} className={classeArea} value={rascunho.descricao} onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} maxLength={400} />
            </Campo>
            <div className="sm:col-span-6">
              <p className="mb-2 text-[14px] font-semibold">Plano</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(PLANOS_FORNECEDOR) as PlanoFornecedor[]).map((id) => {
                  const p = PLANOS_FORNECEDOR[id];
                  const sel = rascunho.plano === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={sel}
                      onClick={() => mudarPlano(id)}
                      className={`rounded-xl border px-4 py-3 text-left ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel hover:border-tinta-3'}`}
                    >
                      <span className="block font-bold">{p.nome}</span>
                      <span className={`block text-[13px] ${sel ? 'text-papel/80' : 'text-tinta-3'}`}>
                        {p.mensalidade ? `${formatarMoeda(p.mensalidade)} por mês` : 'Sem mensalidade'}, {String(p.comissao).replace('.', ',')}% de comissão
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Campo rotulo="Comissão (%)" htmlFor="fa-com" className="sm:col-span-2">
              <input id="fa-com" className={classeEntrada} value={rascunho.comissao} onChange={(e) => setRascunho({ ...rascunho, comissao: e.target.value })} inputMode="decimal" />
            </Campo>
            <Campo rotulo="Mensalidade (R$)" htmlFor="fa-mens" className="sm:col-span-2">
              <input id="fa-mens" className={classeEntrada} value={rascunho.mensalidade} onChange={(e) => setRascunho({ ...rascunho, mensalidade: e.target.value })} inputMode="decimal" />
            </Campo>
            <Campo rotulo="Destaque até" htmlFor="fa-ate" className="sm:col-span-2" dica={rascunho.plano === 'destaque' ? 'Em branco, sem data para acabar.' : 'Só no plano Destaque.'}>
              <input
                id="fa-ate"
                type="date"
                className={classeEntrada}
                value={rascunho.destaqueAte}
                onChange={(e) => setRascunho({ ...rascunho, destaqueAte: e.target.value })}
                disabled={rascunho.plano !== 'destaque'}
              />
            </Campo>
            <Campo rotulo="Observação interna" htmlFor="fa-obs" className="sm:col-span-6">
              <input id="fa-obs" className={classeEntrada} value={rascunho.observacao} onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })} maxLength={300} />
            </Campo>
            <div className="rounded-xl border border-linha px-4 py-1 sm:col-span-6">
              <Alternar id="fa-ativo" ligado={rascunho.ativo} aoMudar={(v) => setRascunho({ ...rascunho, ativo: v })} rotulo="Na loja" descricao="Desligado, os produtos somem da loja das oficinas." />
            </div>
            {erro ? (
              <div className="sm:col-span-6">
                <AvisoErro>{erro}</AvisoErro>
              </div>
            ) : null}
          </div>
        ) : null}
      </Folha>

      <Folha
        aberta={link != null}
        aoFechar={() => setLink(null)}
        titulo="Link de acesso"
        descricao={link ? `Mande para ${link.fornecedor.nome}. Quem abrir este link entra no painel da loja, então mande só para o responsável.` : undefined}
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {link?.fornecedor.whatsapp ? (
              <a
                href={
                  linkWhatsApp(
                    link.fornecedor.whatsapp,
                    `Olá! Aqui é da equipe do Revisaí. Este é o link do painel da ${link.fornecedor.nome}, onde você cadastra produtos, fotos e promoções e vê os pedidos e a demanda da região: ${link.url}`
                  ) ?? '#'
                }
                target="_blank"
                rel="noopener noreferrer"
                className={classeBotao('whatsapp')}
              >
                <MessageCircle size={17} aria-hidden="true" /> Mandar no WhatsApp
              </a>
            ) : null}
            <Botao variante="escuro" onClick={() => link && void copiar(link.url)}>
              <Copy size={16} /> Copiar link
            </Botao>
          </div>
        }
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <input readOnly className={`${classeEntrada} num text-[14px]`} value={link.url} onFocus={(e) => e.target.select()} aria-label="Link de acesso" />
            <p className="text-[14px] text-tinta-2">O link vale até a equipe gerar outro. A sessão de quem entrou dura 30 dias neste aparelho.</p>
          </div>
        ) : null}
      </Folha>
    </div>
  );
}

