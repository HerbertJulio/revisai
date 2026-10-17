import { ArrowLeft, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { LimiteDeCompraDaOficina } from '@/app/admin/moderacao/_componentes/Antifraude';
import { OficinaAcoes } from '@/components/equipe/OficinaAcoes';
import { ChipPlano } from '@/components/equipe/OficinasEquipe';
import { Numero } from '@/components/painel/Numero';
import { Chip, Secao, Vazio, classeBotao } from '@/components/ui';
import { ALERTAS } from '@/lib/alertas-dados';
import { formatarCnpj } from '@/lib/cnpj';
import { nomeDoPapel } from '@/lib/conta-dados';
import { formatarData } from '@/lib/datas';
import { diaEmBrasilia, quandoFoi } from '@/lib/equipe-dados';
import { detalheDaOficina } from '@/lib/equipe/dados';
import { uuidValido } from '@/lib/equipe/escrita';
import { pode } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { planoNoDia, SITUACOES_CHAMADO } from '@/lib/equipe/tipos';
import { formatarMoeda, formatarNumero, formatarTelefone, plural } from '@/lib/formatos';
import { SITUACOES_PARTE } from '@/lib/marketplace-dados';
import { formatarCodigo } from '@/lib/plano';
import { resumoDaAssinatura } from '@/lib/pro-dados';
import { linkWhatsApp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Oficina' };

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 sm:px-5">
      <dt className="text-[14px] text-tinta-3">{rotulo}</dt>
      <dd className="text-right text-[15px] font-semibold">{children}</dd>
    </div>
  );
}

function usoTexto(usado: number, limite: number | null): string {
  return limite != null ? `${formatarNumero(usado)} de ${formatarNumero(limite)}` : formatarNumero(usado);
}

export default async function PaginaOficina({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirEquipe();
  const { id } = await params;
  if (!uuidValido(id)) notFound();
  const { dados, erro } = await detalheDaOficina(acesso.sb, id);
  if (!dados && !erro) notFound();
  const agora = Date.now();
  const hoje = diaEmBrasilia(agora);
  const voltar = (
    <Link href="/admin/oficinas" className={classeBotao('fantasma', 'pequeno')}>
      <ArrowLeft size={16} aria-hidden="true" /> Todas as oficinas
    </Link>
  );
  if (!dados) {
    return (
      <Moldura acesso={acesso} aba="oficinas" titulo="Oficina" acao={voltar}>
        <AvisoErro>{erro}</AvisoErro>
      </Moldura>
    );
  }
  const { oficina: o, membros, convites, assinaturas, creditos, uso, alertas, compras, chamados } = dados;
  const plano = planoNoDia(o, hoje);
  const zap = o.whatsapp ? linkWhatsApp(o.whatsapp, `Olá! Aqui é da equipe do Revisaí, sobre a ${o.nome}.`) : null;
  const totalCompras = compras.filter((c) => c.status !== 'cancelado').reduce((s, c) => s + c.subtotal, 0);
  return (
    <Moldura
      acesso={acesso}
      aba="oficinas"
      titulo={o.nome}
      descricao={[[o.cidade, o.uf].filter(Boolean).join(', '), `criada ${quandoFoi(o.criado_em, agora)}`].filter(Boolean).join(', ')}
      acao={voltar}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ChipPlano plano={plano} proAte={o.pro_ate} testeAte={o.teste_ate} />
        {o.fundador ? <Chip tom="caneta">Fundadora</Chip> : null}
        {!o.ativa ? <Chip tom="atraso">Desativada</Chip> : null}
        {o.excluir_em ? <Chip tom="atraso">Pediu para apagar, sai em {formatarData(o.excluir_em.slice(0, 10))}</Chip> : null}
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno', 'ml-auto')}>
            <MessageCircle size={15} aria-hidden="true" /> {formatarTelefone(o.whatsapp ?? '')}
          </a>
        ) : null}
      </div>

      {pode(acesso.papel, 'mudarPlano') ? (
        <OficinaAcoes oficina={{ id: o.id, nome: o.nome, fundador: o.fundador, ativa: o.ativa, proAte: o.pro_ate, testeAte: o.teste_ate }} />
      ) : null}

      <LimiteDeCompraDaOficina sb={acesso.sb} oficinaId={o.id} podeMudar={pode(acesso.papel, 'mudarCadastro')} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Ordens pela IA no mês" valor={uso ? usoTexto(uso.montagem.usado, uso.montagem.limite) : 'sem dados'} />
        <Numero rotulo="Transcrições no mês" valor={uso ? usoTexto(uso.transcricao.usado, uso.transcricao.limite) : 'sem dados'} />
        <Numero
          rotulo="Alertas de preço no mês"
          valor={alertas ? `${alertas.noMes}${plano === 'pro' ? ` de ${ALERTAS.porMesPro}` : ''}` : '0'}
          detalhe={alertas?.creditos ? `${alertas.extras} de ${alertas.creditos} extras sobrando` : undefined}
        />
        <Numero rotulo="Compras recentes na loja" valor={formatarMoeda(totalCompras)} detalhe={plural(compras.length, 'parte de pedido', 'partes de pedido')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Cadastro">
          <dl className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            <Linha rotulo="Pro até">{o.pro_ate ? formatarData(o.pro_ate) : 'nunca teve'}</Linha>
            <Linha rotulo="Teste até">{o.teste_ate ? formatarData(o.teste_ate) : 'não começou'}</Linha>
            <Linha rotulo="CNPJ">{o.cnpj ? formatarCnpj(o.cnpj) : 'não informado'}</Linha>
            <Linha rotulo="Endereço">{o.endereco ?? 'não informado'}</Linha>
          </dl>
        </Secao>

        <Secao titulo="Quem entra na oficina">
          {membros.length || convites.length ? (
            <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
              {membros.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 sm:px-5">
                  <span className="font-semibold break-all">{m.email ?? m.nome ?? 'Conta sem e-mail'}</span>
                  <span className="text-[14px] text-tinta-3">
                    {nomeDoPapel('oficina', m.papel)}, desde {formatarData(m.criado_em.slice(0, 10))}
                  </span>
                </li>
              ))}
              {convites.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 sm:px-5">
                  <span className="font-semibold break-all text-tinta-2">{c.email}</span>
                  <span className="text-[14px] text-tinta-3">
                    convite de {nomeDoPapel('oficina', c.papel).toLowerCase()}, vale até {formatarData(c.expira_em.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Ninguém na oficina">A oficina ficou sem pessoas. Ela some do app de todos.</Vazio>
          )}
        </Secao>
      </div>

      {pode(acesso.papel, 'verAssinaturas') ? (
        <Secao titulo="Assinaturas do Pro" descricao="Os códigos ativados por esta oficina e o Pro dado pela equipe.">
          {assinaturas.length ? (
            <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
              {assinaturas.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                  <span>
                    <span className="font-semibold">{resumoDaAssinatura(a)}</span>
                    <span className="block text-[13px] text-tinta-3">
                      {[`código ${formatarCodigo(a.codigo)}`, `criada ${quandoFoi(a.criado_em, agora)}`, a.observacao].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <span className={`text-[14px] font-semibold ${a.ate < hoje ? 'text-atraso' : 'text-tinta-2'}`}>
                    {a.ate < hoje ? 'venceu em' : 'vale até'} {formatarData(a.ate)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhuma assinatura">Quando a oficina ativar um código ou ganhar o Pro da equipe, aparece aqui.</Vazio>
          )}
        </Secao>
      ) : null}

      {creditos.length ? (
        <Secao titulo="Pacotes de alertas liberados">
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {creditos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5 sm:px-5">
                <span className="font-semibold">
                  {plural(c.quantidade, 'alerta', 'alertas')}
                  {c.valor != null ? ` por ${formatarMoeda(c.valor)}` : ''}
                </span>
                <span className="text-[13.5px] text-tinta-3">{[quandoFoi(c.criado_em, agora), c.observacao].filter(Boolean).join(', ')}</span>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      <Secao titulo="Compras na loja" descricao="As últimas partes de pedido (cada loja recebe a sua parte).">
        {compras.length ? (
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {compras.map((c) => {
              const s = SITUACOES_PARTE.find((x) => x.id === c.status);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0">
                    <span className="num font-semibold">{c.codigo ?? `#${c.pedido_id}`}</span>
                    <span className="ml-2 text-[14px] text-tinta-2">{c.loja?.nome ?? `Loja ${c.fornecedor_id}`}</span>
                    <span className="block text-[13px] text-tinta-3">{quandoFoi(c.criado_em, agora)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Chip tom={s?.tom ?? 'neutro'}>{s?.nome ?? c.status}</Chip>
                    <span className="num font-semibold">{formatarMoeda(c.subtotal)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vazio titulo="Nenhuma compra ainda" />
        )}
      </Secao>

      {pode(acesso.papel, 'suporte') ? (
        <Secao titulo="Pedidos de ajuda">
          {chamados.length ? (
            <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
              {chamados.map((c) => {
                const s = SITUACOES_CHAMADO.find((x) => x.id === c.situacao) ?? SITUACOES_CHAMADO[0];
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                    <Link href={`/admin/suporte/${c.id}`} className="font-semibold text-caneta hover:underline">
                      {c.assunto}
                    </Link>
                    <span className="flex items-center gap-2 text-[13px] text-tinta-3">
                      <Chip tom={s.tom}>{s.nome}</Chip>
                      {quandoFoi(c.atualizado_em, agora)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vazio titulo="Nenhum pedido de ajuda" />
          )}
        </Secao>
      ) : null}
    </Moldura>
  );
}
