'use client';

import { Copy, MailPlus, MessageCircle, Pencil, Plus, Store, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { cancelarConviteDaLoja, convidarNaLoja, salvarFornecedor } from '@/app/admin/acoes';
import { Folha } from '@/components/Folha';
import { Numero } from '@/components/painel/Numero';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Vazio, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { formatarCnpj } from '@/lib/cnpj';
import type { PapelEquipe } from '@/lib/conta-dados';
import { dataCurta, type Cadastro } from '@/lib/equipe-dados';
import { pode } from '@/lib/equipe/papeis';
import { VERIFICACOES_LOJA, type LojaAdmin } from '@/lib/equipe/tipos';
import { formatarMoeda, formatarTelefone, lerNumero, plural } from '@/lib/formatos';
import { UFS } from '@/lib/padroes';
import { PLANOS_FORNECEDOR, type PlanoFornecedor } from '@/lib/planos-fornecedor';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoErro } from './comum';

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
  /** A loja já tem contrato (só o financeiro muda). */
  temContrato: boolean;
}

function rascunhoDe(f?: LojaAdmin): Rascunho {
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
    email: f?.contrato?.email ?? f?.email ?? '',
    observacao: f?.contrato?.observacao ?? '',
    temContrato: f?.contrato != null
  };
}

/** A mensagem para quem foi convidado entrar na loja com a conta do e-mail. */
function mensagemDoConvite(loja: string, email: string, site: string): string {
  return `Olá! Aqui é da equipe do Revisaí. Liberamos o painel da ${loja} para o e-mail ${email}. Entre em ${site}/entrar com esse e-mail, digite o código que chegar e aceite o convite. Lá você cadastra produtos, fotos e promoções e vê os pedidos da região.`;
}

export function FornecedoresAdmin({ lojas, leads, hoje, papel, site }: { lojas: LojaAdmin[]; leads: Cadastro[]; hoje: string; papel: PapelEquipe; site: string }) {
  const toast = useToast();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convite, setConvite] = useState<{ loja: LojaAdmin; email: string; papel: 'dono' | 'vendedor' } | null>(null);
  const [enviado, setEnviado] = useState<{ loja: LojaAdmin; email: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const podeCriar = pode(papel, 'criarLoja');
  const podeEditar = pode(papel, 'editarLoja');
  const podeContrato = pode(papel, 'mudarContrato');
  const podeConvidar = pode(papel, 'convidarNaLoja');

  const ativas = lojas.filter((f) => f.ativo && !f.demonstracao);
  const vendas = lojas.reduce((s, f) => s + f.vendasMes, 0);
  const comissao = lojas.reduce((s, f) => s + f.comissaoMes, 0);
  const mensalidades = lojas.filter((f) => f.ativo && f.contrato?.plano === 'destaque').reduce((s, f) => s + (f.contrato?.mensalidade ?? 0), 0);
  // o contrato fica livre para quem cria a loja (o suporte) e sempre para o financeiro
  const contratoLivre = rascunho ? podeContrato || !rascunho.temContrato : false;

  function abrir(f?: LojaAdmin) {
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
    const { temContrato: _, ...dados } = rascunho;
    iniciar(async () => {
      try {
        const r = await salvarFornecedor({ ...dados, comissao, mensalidade });
        if (!r.ok) return setErro(r.erro);
        toast({ texto: r.aviso ?? (rascunho.id ? 'Loja atualizada.' : 'Loja criada. Agora convide o dono pelo e-mail para ele entrar no painel.') });
        setRascunho(null);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function convidar() {
    if (!convite) return;
    setErro(null);
    const email = convite.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErro('Confira o e-mail.');
    iniciar(async () => {
      try {
        const r = await convidarNaLoja(convite.loja.id, email, convite.papel);
        if (!r.ok) return setErro(r.erro);
        setEnviado({ loja: convite.loja, email });
        setConvite(null);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function cancelar(loja: LojaAdmin, id: string, email: string) {
    if (!window.confirm(`Cancelar o convite de ${email} para a ${loja.nome}?`)) return;
    iniciar(async () => {
      try {
        const r = await cancelarConviteDaLoja(id);
        toast(r.ok ? { texto: 'Convite cancelado.' } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Mensagem copiada.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o texto e copie.', tom: 'erro' });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Lojas no ar" valor={String(ativas.length)} />
        <Numero rotulo="Vendas no mês" valor={formatarMoeda(vendas)} />
        <Numero rotulo="Comissão no mês" valor={formatarMoeda(comissao)} />
        <Numero rotulo="Mensalidades Destaque" valor={formatarMoeda(mensalidades)} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="t-fornecedores">
        <div className="flex items-end justify-between gap-3">
          <h2 id="t-fornecedores" className="text-[21px]">
            Lojas
          </h2>
          {podeCriar ? (
            <Botao tamanho="pequeno" variante="escuro" onClick={() => abrir()}>
              <Plus size={16} /> Loja
            </Botao>
          ) : null}
        </div>
        {lojas.length ? (
          <ul className="flex flex-col gap-3">
            {lojas.map((f) => {
              const whatsapp = f.whatsapp ? linkWhatsApp(f.whatsapp, 'Olá! Aqui é da equipe do Revisaí.') : null;
              const plano = f.contrato?.plano ?? 'vitrine';
              const verificacao = VERIFICACOES_LOJA.find((v) => v.id === f.verificacao);
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
                        {f.verificacao !== 'aprovada' && verificacao ? <Chip tom={verificacao.tom}>{verificacao.nome}</Chip> : null}
                        {!f.ativo ? <Chip tom="atraso">Fora da loja</Chip> : null}
                        {f.destaque_ate && f.destaque_ate < hoje ? <Chip tom="atraso">Destaque vencido</Chip> : null}
                      </div>
                      <p className="mt-0.5 text-[14px] text-tinta-3">
                        {[
                          [f.cidade, f.uf].filter(Boolean).join(', '),
                          f.cnpj ? `CNPJ ${formatarCnpj(f.cnpj)}` : null,
                          plural(f.produtosAtivos, 'produto ativo', 'produtos ativos'),
                          `comissão de ${String(f.contrato?.comissao_percentual ?? 5).replace('.', ',')}%`
                        ]
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

                  <div className="flex flex-col gap-1 rounded-xl bg-papel-2 px-3 py-2.5 text-[14px]">
                    {f.membros.length ? (
                      f.membros.map((m) => (
                        <p key={m.userId} className="flex flex-wrap gap-x-2">
                          <span className="font-semibold">{m.email ?? m.nome ?? 'Conta sem e-mail'}</span>
                          <span className="text-tinta-3">{m.papel === 'dono' ? 'dono' : 'vendedor'}</span>
                        </p>
                      ))
                    ) : (
                      <p className="text-tinta-3">Ninguém entra no painel desta loja ainda.</p>
                    )}
                    {f.convites.map((c) => (
                      <p key={c.id} className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold">{c.email}</span>
                        <span className="text-tinta-3">convite de {c.papel === 'dono' ? 'dono' : 'vendedor'}, vale até {dataCurta(c.expiraEm.slice(0, 10), hoje)}</span>
                        {podeConvidar ? (
                          <button
                            type="button"
                            className="inline-grid h-7 w-7 place-items-center rounded-lg text-tinta-3 hover:bg-papel hover:text-atraso"
                            aria-label={`Cancelar o convite de ${c.email}`}
                            onClick={() => cancelar(f, c.id, c.email)}
                            disabled={salvando}
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                        ) : null}
                      </p>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {podeEditar ? (
                      <Botao tamanho="pequeno" onClick={() => abrir(f)}>
                        <Pencil size={15} /> Editar
                      </Botao>
                    ) : null}
                    {podeConvidar ? (
                      <Botao
                        tamanho="pequeno"
                        onClick={() => {
                          setErro(null);
                          setConvite({ loja: f, email: f.membros.length ? '' : (f.contrato?.email ?? f.email ?? ''), papel: f.membros.some((m) => m.papel === 'dono') ? 'vendedor' : 'dono' });
                        }}
                        disabled={salvando}
                      >
                        <MailPlus size={15} /> Convidar pelo e-mail
                      </Botao>
                    ) : null}
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
          <Vazio titulo="Nenhuma loja ainda" acao={podeCriar ? <Botao onClick={() => abrir()}>Cadastrar loja</Botao> : undefined} />
        )}
      </section>

      {leads.length && podeCriar ? (
        <section className="flex flex-col gap-3" aria-labelledby="t-leads">
          <h2 id="t-leads" className="text-[21px]">
            Querem vender
          </h2>
          <p className="-mt-1 text-[15px] text-tinta-2">Cadastros de lojas do site que ainda não viraram loja.</p>
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
        titulo={rascunho?.id ? 'Editar loja' : 'Nova loja'}
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
                      disabled={!contratoLivre}
                      className={`rounded-xl border px-4 py-3 text-left disabled:opacity-60 ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel hover:border-tinta-3'}`}
                    >
                      <span className="block font-bold">{p.nome}</span>
                      <span className={`block text-[13px] ${sel ? 'text-papel/80' : 'text-tinta-3'}`}>
                        {p.mensalidade ? `${formatarMoeda(p.mensalidade)} por mês` : 'Sem mensalidade'}, {String(p.comissao).replace('.', ',')}% de comissão
                      </span>
                    </button>
                  );
                })}
              </div>
              {!contratoLivre ? <p className="mt-2 text-[13px] text-tinta-3">Plano, comissão e mensalidade de uma loja com contrato só o financeiro muda.</p> : null}
            </div>
            <Campo rotulo="Comissão (%)" htmlFor="fa-com" className="sm:col-span-2">
              <input id="fa-com" className={classeEntrada} value={rascunho.comissao} onChange={(e) => setRascunho({ ...rascunho, comissao: e.target.value })} inputMode="decimal" disabled={!contratoLivre} />
            </Campo>
            <Campo rotulo="Mensalidade (R$)" htmlFor="fa-mens" className="sm:col-span-2">
              <input id="fa-mens" className={classeEntrada} value={rascunho.mensalidade} onChange={(e) => setRascunho({ ...rascunho, mensalidade: e.target.value })} inputMode="decimal" disabled={!contratoLivre} />
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
              <input id="fa-obs" className={classeEntrada} value={rascunho.observacao} onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })} maxLength={300} disabled={!contratoLivre} />
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
        aberta={convite != null}
        aoFechar={() => setConvite(null)}
        titulo="Convidar para a loja"
        descricao={convite ? `A pessoa entra no painel da ${convite.loja.nome} com a conta deste e-mail. O convite vale por 14 dias.` : undefined}
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setConvite(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={convidar} disabled={salvando}>
              {salvando ? 'Convidando…' : 'Convidar'}
            </Botao>
          </div>
        }
      >
        {convite ? (
          <div className="flex flex-col gap-4">
            <Campo rotulo="E-mail" htmlFor="cv-email">
              <input id="cv-email" type="email" className={classeEntrada} value={convite.email} onChange={(e) => setConvite({ ...convite, email: e.target.value })} inputMode="email" autoFocus />
            </Campo>
            <div>
              <p className="mb-2 text-[14px] font-semibold">Entra como</p>
              <div className="flex flex-wrap gap-2">
                {(['dono', 'vendedor'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={convite.papel === p}
                    onClick={() => setConvite({ ...convite, papel: p })}
                    className={`h-10 rounded-full border px-4 text-[14px] font-semibold ${convite.papel === p ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
                  >
                    {p === 'dono' ? 'Dono (tudo, inclusive Pix e equipe)' : 'Vendedor (produtos e pedidos)'}
                  </button>
                ))}
              </div>
            </div>
            {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          </div>
        ) : null}
      </Folha>

      <Folha
        aberta={enviado != null}
        aoFechar={() => setEnviado(null)}
        titulo="Convite feito"
        descricao={enviado ? `Avise ${enviado.email} para entrar no Revisaí com esse e-mail e aceitar o convite.` : undefined}
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {enviado?.loja.whatsapp ? (
              <a href={linkWhatsApp(enviado.loja.whatsapp, mensagemDoConvite(enviado.loja.nome, enviado.email, site)) ?? '#'} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp')}>
                <MessageCircle size={17} aria-hidden="true" /> Avisar no WhatsApp
              </a>
            ) : null}
            <Botao variante="escuro" onClick={() => enviado && void copiar(mensagemDoConvite(enviado.loja.nome, enviado.email, site))}>
              <Copy size={16} /> Copiar mensagem
            </Botao>
          </div>
        }
      >
        {enviado ? <p className="text-[15px] whitespace-pre-line text-tinta-2">{mensagemDoConvite(enviado.loja.nome, enviado.email, site)}</p> : null}
      </Folha>
    </div>
  );
}
