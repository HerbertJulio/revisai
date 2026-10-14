'use client';

import { Copy, MessageCircle, Plus, Wrench } from 'lucide-react';
import { useState, useTransition } from 'react';
import { criarCodigoPro } from '@/app/admin/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { diasEntre, formatarData } from '@/lib/datas';
import { dataCurta, type Cadastro } from '@/lib/equipe-dados';
import { formatarMoeda, formatarTelefone, lerNumero, plural } from '@/lib/formatos';
import { formatarCodigo, PRO } from '@/lib/plano';
import { MAX_APARELHOS, MESES_PRO, mensagemDoCodigo, resumoDaAssinatura, vagasDeFundador, valorSugerido, type Assinatura } from '@/lib/pro-dados';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoErro } from './comum';

interface Rascunho {
  oficinaNome: string;
  oficinaWhatsapp: string;
  meses: number;
  valor: string;
  observacao: string;
}

function valorTexto(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

export function ProAdmin({ assinaturas, interessados, hoje }: { assinaturas: Assinatura[]; interessados: Cadastro[]; hoje: string }) {
  const toast = useToast();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criada, setCriada] = useState<Assinatura | null>(null);
  const [salvando, iniciar] = useTransition();

  const ativas = assinaturas.filter((a) => a.ate >= hoje);
  const oficinasAtivas = new Set(ativas.map((a) => a.oficina_nome.trim().toLowerCase())).size;
  const mes = hoje.slice(0, 7);
  const recebidoNoMes = assinaturas.filter((a) => a.criado_em.slice(0, 7) === mes).reduce((s, a) => s + (a.valor ?? 0), 0);
  const vencendo = ativas.filter((a) => diasEntre(hoje, a.ate) <= 15);
  const vagas = vagasDeFundador(assinaturas);

  function abrir(c?: Cadastro) {
    setErro(null);
    const meses = 1;
    setRascunho({
      oficinaNome: c ? c.empresa || c.nome : '',
      oficinaWhatsapp: c?.whatsapp ? formatarTelefone(c.whatsapp) : '',
      meses,
      valor: valorTexto(valorSugerido(meses, vagas > 0)),
      observacao: ''
    });
  }

  function mudarMeses(meses: number) {
    if (!rascunho) return;
    setRascunho({ ...rascunho, meses, valor: valorTexto(valorSugerido(meses, vagas > 0)) });
  }

  function criar() {
    if (!rascunho) return;
    setErro(null);
    const valor = rascunho.valor.trim() ? lerNumero(rascunho.valor) : null;
    if (rascunho.valor.trim() && (valor == null || valor < 0)) return setErro('Confira o valor pago.');
    iniciar(async () => {
      try {
        const r = await criarCodigoPro({ ...rascunho, valor });
        if (!r.ok) return setErro(r.erro);
        setRascunho(null);
        setCriada(r.assinatura);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: aviso });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o texto e copie.', tom: 'erro' });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Oficinas no Pro" valor={String(oficinasAtivas)} />
        <Numero rotulo="Recebido no mês" valor={formatarMoeda(recebidoNoMes)} />
        <Numero rotulo="Vencem em 15 dias" valor={String(vencendo.length)} />
        <Numero rotulo="Vagas de fundador" valor={String(vagas)} detalhe={`${formatarMoeda(PRO.precoFundador)} por mês`} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="t-codigos">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="t-codigos" className="text-[21px]">
              Códigos
            </h2>
            <p className="text-[14px] text-tinta-3">Cada código vale em até {MAX_APARELHOS} aparelhos da mesma oficina.</p>
          </div>
          <Botao tamanho="pequeno" variante="escuro" onClick={() => abrir()}>
            <Plus size={16} /> Novo código
          </Botao>
        </div>
        {assinaturas.length ? (
          <div className="overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
            <table className="w-full text-left text-[14.5px]">
              <thead className="hidden bg-papel-2 text-[13px] text-tinta-3 sm:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Oficina
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Código
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Vale até
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Aparelhos
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linha">
                {assinaturas.map((a) => {
                  const vencida = a.ate < hoje;
                  const dias = diasEntre(hoje, a.ate);
                  const zap = a.oficina_whatsapp ? linkWhatsApp(a.oficina_whatsapp, mensagemDoCodigo(a)) : null;
                  return (
                    <tr key={a.id} className="flex flex-col gap-1.5 px-4 py-3.5 sm:table-row sm:p-0">
                      <td className="sm:px-4 sm:py-3">
                        <p className="font-bold">{a.oficina_nome}</p>
                        <p className="text-[13px] text-tinta-3">
                          {[resumoDaAssinatura(a), `criado ${dataCurta(a.criado_em.slice(0, 10), hoje)}`, a.observacao].filter(Boolean).join(', ')}
                        </p>
                      </td>
                      <td className="sm:px-4 sm:py-3">
                        <span className="num text-[14px] font-semibold tracking-wide">{formatarCodigo(a.codigo)}</span>
                      </td>
                      <td className="sm:px-4 sm:py-3">
                        {vencida ? (
                          <Chip tom="atraso">Venceu em {formatarData(a.ate)}</Chip>
                        ) : dias <= 15 ? (
                          <Chip tom="oleo">{dias === 0 ? 'Vence hoje' : `Vence em ${plural(dias, 'dia', 'dias')}`}</Chip>
                        ) : (
                          <span className="num">{formatarData(a.ate)}</span>
                        )}
                      </td>
                      <td className="num sm:px-4 sm:py-3 sm:text-right">
                        <span className="sm:hidden text-tinta-3">Aparelhos: </span>
                        {a.ativacoes} de {MAX_APARELHOS}
                      </td>
                      <td className="sm:px-4 sm:py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void copiar(mensagemDoCodigo(a), 'Mensagem com o código copiada.')}
                            className="grid h-9 w-9 place-items-center rounded-lg text-tinta-2 hover:bg-papel-2"
                            aria-label={`Copiar a mensagem com o código da ${a.oficina_nome}`}
                            title="Copiar mensagem"
                          >
                            <Copy size={17} />
                          </button>
                          {zap ? (
                            <a
                              href={zap}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-9 w-9 place-items-center rounded-lg text-ok hover:bg-papel-2"
                              aria-label={`Mandar o código no WhatsApp da ${a.oficina_nome}`}
                              title="Mandar no WhatsApp"
                            >
                              <MessageCircle size={17} />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo="Nenhum código ainda" acao={<Botao onClick={() => abrir()}>Criar o primeiro código</Botao>}>
            Depois que a oficina pagar, crie o código aqui e mande para ela. Ela digita em Ajustes, na parte Plano.
          </Vazio>
        )}
      </section>

      {interessados.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="t-querem">
          <h2 id="t-querem" className="text-[21px]">
            Querem o Pro
          </h2>
          <p className="-mt-1 text-[15px] text-tinta-2">Oficinas que se cadastraram na página de planos.</p>
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {interessados.map((c) => {
              const zap = c.whatsapp ? linkWhatsApp(c.whatsapp, `Olá, ${c.nome.split(' ')[0]}! Aqui é da equipe do Revisaí. Vi que você quer o Pro. Posso te passar como funciona o pagamento?`) : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <Wrench size={18} className="text-tinta-3" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.empresa || c.nome}</p>
                    <p className="truncate text-[13.5px] text-tinta-3">{[c.empresa ? c.nome : '', [c.cidade, c.uf].filter(Boolean).join(', '), c.mensagem].filter(Boolean).join(', ')}</p>
                  </div>
                  {zap ? (
                    <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
                      <MessageCircle size={15} aria-hidden="true" /> WhatsApp
                    </a>
                  ) : null}
                  <Botao tamanho="pequeno" onClick={() => abrir(c)}>
                    Criar código
                  </Botao>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Folha
        aberta={rascunho != null}
        aoFechar={() => setRascunho(null)}
        titulo="Novo código do Pro"
        descricao="Crie depois de receber o pagamento. O código libera o Pro até a data calculada pelos meses."
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setRascunho(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={criar} disabled={salvando}>
              {salvando ? 'Criando…' : 'Criar código'}
            </Botao>
          </div>
        }
      >
        {rascunho ? (
          <div className="grid gap-4 sm:grid-cols-6">
            <Campo rotulo="Oficina" htmlFor="pa-nome" className="sm:col-span-4">
              <input id="pa-nome" className={classeEntrada} value={rascunho.oficinaNome} onChange={(e) => setRascunho({ ...rascunho, oficinaNome: e.target.value })} maxLength={120} />
            </Campo>
            <Campo rotulo="WhatsApp" htmlFor="pa-whats" className="sm:col-span-2" dica="Para mandar o código.">
              <input id="pa-whats" className={classeEntrada} value={rascunho.oficinaWhatsapp} onChange={(e) => setRascunho({ ...rascunho, oficinaWhatsapp: e.target.value })} inputMode="tel" />
            </Campo>
            <div className="sm:col-span-6">
              <p className="mb-2 text-[14px] font-semibold">Meses pagos</p>
              <div className="flex flex-wrap gap-2">
                {MESES_PRO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={rascunho.meses === m}
                    onClick={() => mudarMeses(m)}
                    className={`num h-10 rounded-full border px-4 text-[14px] font-semibold ${rascunho.meses === m ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
                  >
                    {m === 1 ? '1 mês' : `${m} meses`}
                  </button>
                ))}
              </div>
            </div>
            <Campo rotulo="Valor recebido (R$)" htmlFor="pa-valor" className="sm:col-span-2" dica={vagas > 0 ? 'Preço de fundador.' : 'Preço cheio.'}>
              <input id="pa-valor" className={classeEntrada} value={rascunho.valor} onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value })} inputMode="decimal" />
            </Campo>
            <Campo rotulo="Observação interna" htmlFor="pa-obs" className="sm:col-span-4" dica="Ex.: pagou por Pix em 14/10.">
              <input id="pa-obs" className={classeEntrada} value={rascunho.observacao} onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })} maxLength={300} />
            </Campo>
            {erro ? (
              <div className="sm:col-span-6">
                <AvisoErro>{erro}</AvisoErro>
              </div>
            ) : null}
          </div>
        ) : null}
      </Folha>

      <Folha
        aberta={criada != null}
        aoFechar={() => setCriada(null)}
        titulo="Código criado"
        descricao={criada ? `Mande para a ${criada.oficina_nome}. O Pro vale até ${formatarData(criada.ate)}.` : undefined}
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {criada?.oficina_whatsapp ? (
              <a href={linkWhatsApp(criada.oficina_whatsapp, mensagemDoCodigo(criada)) ?? '#'} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp')}>
                <MessageCircle size={17} aria-hidden="true" /> Mandar no WhatsApp
              </a>
            ) : null}
            <Botao variante="escuro" onClick={() => criada && void copiar(mensagemDoCodigo(criada), 'Mensagem copiada.')}>
              <Copy size={16} /> Copiar mensagem
            </Botao>
          </div>
        }
      >
        {criada ? (
          <div className="flex flex-col gap-3">
            <p className="num rounded-xl bg-papel-2 px-4 py-4 text-center text-[24px] font-extrabold tracking-[0.08em]">{formatarCodigo(criada.codigo)}</p>
            <p className="whitespace-pre-line text-[14px] text-tinta-2">{mensagemDoCodigo(criada)}</p>
          </div>
        ) : null}
      </Folha>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
      <p className="text-[13px] font-semibold text-tinta-3">{rotulo}</p>
      <p className="largo num mt-0.5 text-[22px] font-extrabold">{valor}</p>
      {detalhe ? <p className="text-[12.5px] text-tinta-3">{detalhe}</p> : null}
    </div>
  );
}
