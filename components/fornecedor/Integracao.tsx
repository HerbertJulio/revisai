'use client';

// Os tokens da API da loja: o dono cria (o token aparece uma vez, para copiar), vê quando cada um foi
// usado e revoga. Embaixo, as últimas chamadas (só contagens).

import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { criarTokenDaApi, revogarTokenDaApi } from '@/app/fornecedor/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Vazio, classeEntrada } from '@/components/ui';
import { quandoFoi } from '@/lib/loja/comum';
import type { ChamadaDaApi, TokenDaLoja } from '@/lib/loja/tokens';
import { AvisoErro } from './comum';

export function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(texto)
          .then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          })
          .catch(() => {});
      }}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-linha bg-papel px-3 text-[13.5px] font-semibold text-tinta-2 hover:border-tinta-3"
    >
      {copiado ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copiado ? 'Copiado' : rotulo}
    </button>
  );
}

export function TokensDaApi({ tokens, chamadas, dono }: { tokens: TokenDaLoja[]; chamadas: { hoje: number; chamadas: ChamadaDaApi[] } | null; dono: boolean }) {
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [novo, setNovo] = useState<{ token: string; nome: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const agora = Date.now();
  const ativos = tokens.filter((t) => !t.revogado);

  function criar() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await criarTokenDaApi(nome);
        if (!r.ok) return setErro(r.erro);
        setNovo({ token: r.token, nome: nome.trim() });
        setNome('');
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function revogar(t: TokenDaLoja) {
    if (!window.confirm(`Revogar o token ${t.nome}? O sistema que usa ele para de conseguir mudar os produtos na hora.`)) return;
    iniciar(async () => {
      try {
        const r = await revogarTokenDaApi(t.id);
        toast(r.ok ? { texto: `Token ${t.nome} revogado.` } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Nada mudou.', tom: 'erro' });
      }
    });
  }

  function fecharCriacao() {
    setCriando(false);
    setNovo(null);
    setErro(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14.5px] text-tinta-2">
          {ativos.length ? `${ativos.length} ${ativos.length === 1 ? 'token ativo' : 'tokens ativos'}.` : 'Nenhum token ativo.'} Um token para cada sistema que manda dados, assim dá para revogar um sem parar os outros.
        </p>
        {dono ? (
          <Botao variante="escuro" onClick={() => setCriando(true)} disabled={ativos.length >= 10}>
            <Plus size={17} aria-hidden="true" /> Criar token
          </Botao>
        ) : null}
      </div>
      {!dono ? <p className="text-[14px] text-tinta-3">Só o dono da loja cria e revoga tokens: com eles, um sistema muda preços e estoque.</p> : null}

      {tokens.length ? (
        <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <KeyRound size={18} className={t.revogado ? 'text-tinta-3' : 'text-caneta'} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-bold ${t.revogado ? 'text-tinta-3 line-through' : ''}`}>{t.nome}</p>
                  {t.revogado ? <Chip>Revogado</Chip> : <Chip tom="ok">Ativo</Chip>}
                </div>
                <p className="text-[13.5px] text-tinta-3">
                  <span className="num">{t.prefixo}…</span> · criado {quandoFoi(t.criadoEm, agora)} ·{' '}
                  {t.revogado && t.revogadoEm ? `revogado ${quandoFoi(t.revogadoEm, agora)}` : t.ultimoUsoEm ? `usado ${quandoFoi(t.ultimoUsoEm, agora)}` : 'ainda não usado'}
                </p>
              </div>
              {dono && !t.revogado ? (
                <Botao tamanho="pequeno" variante="perigo" onClick={() => revogar(t)} disabled={ocupado}>
                  <Trash2 size={15} aria-hidden="true" /> Revogar
                </Botao>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo="Nenhum token ainda">Crie um token e coloque no sistema da loja. Ele aparece uma vez só: copie na hora.</Vazio>
      )}

      {chamadas ? <UltimasChamadas chamadas={chamadas} /> : null}

      <Folha
        aberta={criando}
        aoFechar={fecharCriacao}
        titulo={novo ? 'Copie o token agora' : 'Criar token'}
        descricao={novo ? 'Ele não aparece de novo: o Revisaí guarda só uma impressão dele. Se perder, revogue e crie outro.' : 'Dê um nome que diga onde ele vai ficar.'}
      >
        {novo ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] font-semibold">{novo.nome}</p>
            <div className="flex flex-col gap-2 rounded-xl bg-papel-2 p-3 sm:flex-row sm:items-center">
              <code className="num min-w-0 flex-1 text-[13px] break-all" data-token-novo>
                {novo.token}
              </code>
              <BotaoCopiar texto={novo.token} rotulo="Copiar o token" />
            </div>
            <p className="text-[13.5px] text-tinta-3">Guarde no sistema da loja. Não mande por WhatsApp nem e-mail: com ele, quem tiver muda preços e estoque.</p>
            <div className="flex justify-end">
              <Botao variante="primario" onClick={fecharCriacao}>
                Já copiei
              </Botao>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {erro ? <AvisoErro>{erro}</AvisoErro> : null}
            <Campo rotulo="Nome do token" htmlFor="token-nome" dica='Ex.: "Bling", "ERP da loja", "Planilha do estoque".'>
              <input id="token-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="off" />
            </Campo>
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fecharCriacao}>
                Cancelar
              </Botao>
              <Botao variante="primario" onClick={criar} disabled={ocupado || nome.trim().length < 2}>
                {ocupado ? 'Criando…' : 'Criar token'}
              </Botao>
            </div>
          </div>
        )}
      </Folha>
    </div>
  );
}

const NOME_SITUACAO: Record<number, string> = { 200: 'ok', 400: 'dados com erro', 401: 'token', 413: 'corpo grande', 429: 'limite', 500: 'falha' };

function UltimasChamadas({ chamadas }: { chamadas: { hoje: number; chamadas: ChamadaDaApi[] } }) {
  const agora = Date.now();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[17px]">Últimas chamadas</h3>
      <p className="text-[13.5px] text-tinta-3">
        {chamadas.hoje} {chamadas.hoje === 1 ? 'chamada hoje' : 'chamadas hoje'}. O registro guarda só as contagens, nunca os preços nem o token.
      </p>
      {chamadas.chamadas.length ? (
        <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel text-[14px] ring-1 ring-linha">
          {chamadas.chamadas.map((c, i) => (
            <li key={`${c.quando}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
              <span className="flex items-center gap-2">
                <Chip tom={c.situacao < 300 ? 'ok' : c.situacao === 429 ? 'oleo' : 'atraso'}>
                  {c.metodo} {c.situacao} {NOME_SITUACAO[c.situacao] ?? ''}
                </Chip>
                <span className="text-tinta-3">{quandoFoi(c.quando, agora)}</span>
              </span>
              <span className="text-tinta-2">
                {c.metodo === 'GET'
                  ? `${c.devolvidos} produtos lidos`
                  : `${c.recebidos} recebidos, ${c.atualizados} mudados${c.naoEncontrados ? `, ${c.naoEncontrados} sem código na loja` : ''}${c.erros && c.situacao < 300 ? `, ${c.erros} com erro` : ''}`}
                {c.vezes > 1 ? ` (${c.vezes} vezes)` : ''}
                {c.nome ? <span className="text-tinta-3"> · {c.nome}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-tinta-3">Nenhuma chamada ainda.</p>
      )}
    </section>
  );
}
