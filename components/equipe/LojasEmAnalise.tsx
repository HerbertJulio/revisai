'use client';

import { Check, ExternalLink, MessageCircle, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { decidirLojaEmAnalise } from '@/app/admin/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Vazio, classeArea, classeBotao } from '@/components/ui';
import { formatarCnpj } from '@/lib/cnpj';
import { formatarData } from '@/lib/datas';
import { quandoFoi } from '@/lib/equipe-dados';
import { linkDaReceita, type DadosCnpj } from '@/lib/equipe/cnpj-dados';
import type { LinhaLojaEquipe } from '@/lib/equipe/tipos';
import { formatarTelefone } from '@/lib/formatos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoErro } from './comum';

export interface LojaParaAnalisar extends LinhaLojaEquipe {
  donos: string[];
  consulta: { ok: true; dados: DadosCnpj } | { ok: false; erro: string } | null;
}

function nomesParecidos(a: string | null, b: string): boolean {
  if (!a) return false;
  const limpo = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\b(ltda|me|epp|eireli|s\/?a|comercio|de|da|do|e)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  const x = limpo(a);
  const y = limpo(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

export function LojasEmAnalise({ pendentes, recusadas, agora }: { pendentes: LojaParaAnalisar[]; recusadas: LojaParaAnalisar[]; agora: number }) {
  const toast = useToast();
  const [decidir, setDecidir] = useState<{ loja: LojaParaAnalisar; aprovar: boolean } | null>(null);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function abrir(loja: LojaParaAnalisar, aprovar: boolean) {
    setErro(null);
    setObs(aprovar ? '' : (loja.verificacao_obs ?? ''));
    setDecidir({ loja, aprovar });
  }

  function confirmar() {
    if (!decidir) return;
    setErro(null);
    iniciar(async () => {
      try {
        const r = await decidirLojaEmAnalise(decidir.loja.id, decidir.aprovar, obs);
        if (!r.ok) return setErro(r.erro);
        toast({ texto: decidir.aprovar ? `${decidir.loja.nome} foi aprovada e já pode vender.` : `${decidir.loja.nome} foi recusada.` });
        setDecidir(null);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="t-pendentes">
        <h2 id="t-pendentes" className="text-[21px]">
          Esperando a conferência
        </h2>
        {pendentes.length ? (
          <ul className="flex flex-col gap-3">
            {pendentes.map((l) => (
              <CartaoLoja key={l.id} loja={l} agora={agora}>
                <Botao tamanho="pequeno" variante="escuro" onClick={() => abrir(l, true)} disabled={ocupado}>
                  <Check size={15} /> Aprovar
                </Botao>
                <Botao tamanho="pequeno" variante="perigo" onClick={() => abrir(l, false)} disabled={ocupado}>
                  <X size={15} /> Recusar
                </Botao>
              </CartaoLoja>
            ))}
          </ul>
        ) : (
          <Vazio titulo="Nenhuma loja esperando">Quando uma loja pedir para vender no Revisaí, ela aparece aqui com os dados do CNPJ.</Vazio>
        )}
      </section>

      {recusadas.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="t-recusadas">
          <h2 id="t-recusadas" className="text-[21px]">
            Recusadas
          </h2>
          <ul className="flex flex-col gap-3">
            {recusadas.map((l) => (
              <CartaoLoja key={l.id} loja={l} agora={agora}>
                <Botao tamanho="pequeno" onClick={() => abrir(l, true)} disabled={ocupado}>
                  <Check size={15} /> Aprovar agora
                </Botao>
              </CartaoLoja>
            ))}
          </ul>
        </section>
      ) : null}

      <Folha
        aberta={decidir != null}
        aoFechar={() => setDecidir(null)}
        titulo={decidir?.aprovar ? 'Aprovar a loja' : 'Recusar a loja'}
        descricao={
          decidir?.aprovar
            ? `${decidir.loja.nome} entra no ar e já pode cadastrar produtos e vender.`
            : decidir
              ? `${decidir.loja.nome} fica fora do ar. A loja vê o motivo e pode corrigir o cadastro.`
              : undefined
        }
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setDecidir(null)}>
              Cancelar
            </Botao>
            <Botao variante={decidir?.aprovar ? 'primario' : 'perigo'} onClick={confirmar} disabled={ocupado}>
              {ocupado ? 'Salvando…' : decidir?.aprovar ? 'Aprovar' : 'Recusar'}
            </Botao>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Campo
            rotulo={decidir?.aprovar ? 'Observação (opcional)' : 'Motivo da recusa'}
            htmlFor="la-obs"
            dica={decidir?.aprovar ? 'Fica no cadastro da loja.' : 'Ex.: o CNPJ está baixado na Receita, ou a atividade não é de peças.'}
          >
            <textarea id="la-obs" rows={3} className={classeArea} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} />
          </Campo>
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        </div>
      </Folha>
    </div>
  );
}

function CartaoLoja({ loja: l, agora, children }: { loja: LojaParaAnalisar; agora: number; children: React.ReactNode }) {
  const zap = l.whatsapp ? linkWhatsApp(l.whatsapp, `Olá! Aqui é da equipe do Revisaí, sobre o cadastro da ${l.nome}.`) : null;
  const c = l.consulta;
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold">{l.nome}</p>
          <p className="text-[14px] text-tinta-3">
            {[l.cnpj ? `CNPJ ${formatarCnpj(l.cnpj)}` : 'sem CNPJ', [l.cidade, l.uf].filter(Boolean).join(', '), `pediu ${quandoFoi(l.criado_em, agora)}`].filter(Boolean).join(', ')}
          </p>
          <p className="text-[14px] text-tinta-2">{[...l.donos, l.email].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || 'sem e-mail'}</p>
          {l.verificacao_obs ? <p className="mt-1 text-[13.5px] text-tinta-3">Observação: {l.verificacao_obs}</p> : null}
        </div>
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
            <MessageCircle size={15} aria-hidden="true" /> {formatarTelefone(l.whatsapp ?? '')}
          </a>
        ) : null}
      </div>

      {c?.ok ? (
        <div className="flex flex-col gap-1.5 rounded-xl bg-papel-2 px-3 py-3 text-[14px]">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tom={c.dados.ativa ? 'ok' : 'atraso'}>Situação na Receita: {c.dados.situacao ?? 'sem informação'}</Chip>
            <Chip tom={c.dados.ligadaAPecas ? 'ok' : 'oleo'}>{c.dados.ligadaAPecas ? 'Atividade de peças ou manutenção' : 'Atividade fora de peças'}</Chip>
            {!nomesParecidos(c.dados.razaoSocial, l.nome) && !nomesParecidos(c.dados.nomeFantasia, l.nome) ? <Chip tom="oleo">Nome diferente do cadastro</Chip> : null}
          </div>
          <p>
            <span className="font-semibold">{c.dados.razaoSocial ?? 'Sem razão social'}</span>
            {c.dados.nomeFantasia ? <span className="text-tinta-2">, {c.dados.nomeFantasia}</span> : null}
          </p>
          {c.dados.atividade ? (
            <p className="text-tinta-2">
              {c.dados.atividade.codigo} {c.dados.atividade.descricao}
            </p>
          ) : null}
          {c.dados.endereco || c.dados.municipio ? (
            <p className="text-tinta-2">{[c.dados.endereco, [c.dados.municipio, c.dados.uf].filter(Boolean).join(' / ')].filter(Boolean).join(', ')}</p>
          ) : null}
          <p className="text-[13px] text-tinta-3">
            {[c.dados.abertura ? `aberta em ${formatarData(c.dados.abertura)}` : null, c.dados.naturezaJuridica, c.dados.porte, c.dados.socios.length ? `sócios: ${c.dados.socios.join(', ')}` : null]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 rounded-xl bg-oleo-claro px-3 py-2.5 text-[14px] text-oleo-tinta">
          {c ? c.erro : l.cnpj ? 'Para conferir de novo, consulte o CNPJ.' : 'A loja não informou o CNPJ.'}
          <a href={linkDaReceita()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
            Consultar na Receita <ExternalLink size={13} aria-hidden="true" />
          </a>
        </p>
      )}

      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}
