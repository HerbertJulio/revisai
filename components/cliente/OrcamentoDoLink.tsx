'use client';

// O orçamento pelo link do servidor, como o cliente da oficina vê: os itens com o preço, o que a
// oficina viu no carro e a resposta ali mesmo (aprovar tudo, só alguns itens ou recusar). O
// código de conferência é o resumo do que está marcado: o mesmo fica guardado com a aprovação.

import { Check, ShieldCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Placa } from '@/components/pecas';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { aparelhoDoAgente, codigoDeConferencia, conteudoDaAprovacao, versaoDoConteudo } from '@/lib/aprovacao';
import { formatarData } from '@/lib/datas';
import { formatarKm, formatarMoeda, formatarNumero } from '@/lib/formatos';
import { responderOrcamento } from '@/lib/links-acoes';
import type { DadosOrcamentoLink, LinhaOrcamentoLink, OficinaDoLink, RespostaDoLink } from '@/lib/links-publicos';
import { AcoesDoCliente, CabecalhoDaOficina, dataHora, FalarComAOficina, Rodape } from './comum';

const URGENCIAS = { agora: 'Fazer logo', proxima_revisao: 'Na próxima revisão', observar: 'Ficar de olho' } as const;

function legenda(l: LinhaOrcamentoLink): string {
  const tipo = l.tipo === 'peca' ? 'Peça' : l.tipo === 'servico' ? 'Mão de obra' : '';
  const partes: string[] = [];
  if (tipo && !l.descricao.toLowerCase().startsWith(tipo.toLowerCase()) && !(l.tipo === 'servico' && l.valorUnitario == null)) partes.push(tipo);
  if (l.quantidade !== 1 || l.unidade === 'L')
    partes.push(`${formatarNumero(l.quantidade, 2)} ${l.unidade === 'L' ? 'litros' : l.unidade === 'h' ? 'horas' : 'unidades'}${l.valorUnitario != null ? ` de ${formatarMoeda(l.valorUnitario)}` : ''}`);
  return partes.join(', ');
}

function valorDaLinha(l: LinhaOrcamentoLink): string {
  if (l.valorUnitario != null) return formatarMoeda(Math.round(l.valorUnitario * l.quantidade * 100) / 100);
  return l.tipo === 'servico' ? 'incluído' : 'a combinar';
}

function grupos(d: DadosOrcamentoLink) {
  const g: { titulo: string; linhas: LinhaOrcamentoLink[] }[] = [];
  for (const l of d.linhas) {
    const titulo = l.grupo || 'Outros itens';
    let grupo = g.find((x) => x.titulo === titulo);
    if (!grupo) g.push((grupo = { titulo, linhas: [] }));
    grupo.linhas.push(l);
  }
  return g.sort((a, b) => Number(a.titulo === 'Outros itens') - Number(b.titulo === 'Outros itens'));
}

/** O resumo do que está marcado (calculado no próprio aparelho, como no servidor). */
function useVersao(d: DadosOrcamentoLink, recusadas: string[]) {
  const conteudo = useMemo(() => conteudoDaAprovacao(d, recusadas), [d, recusadas]);
  const [versao, setVersao] = useState<{ de: typeof conteudo; hash: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    void versaoDoConteudo(conteudo).then((hash) => {
      if (vivo) setVersao({ de: conteudo, hash });
    });
    return () => {
      vivo = false;
    };
  }, [conteudo]);
  return { conteudo, versao: versao?.de === conteudo ? versao.hash : null };
}

export function OrcamentoDoLink({ token, dados, oficina, resposta, hoje }: { token: string; dados: DadosOrcamentoLink; oficina: OficinaDoLink; resposta: RespostaDoLink | null; hoje: string }) {
  const carro = [dados.carro.nome, dados.carro.ano].filter(Boolean).join(' ');
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
      <CabecalhoDaOficina oficina={oficina} rotulo={`Orçamento nº ${dados.numero}`} />
      <section className="flex flex-wrap items-center gap-3">
        {dados.carro.placa ? <Placa placa={dados.carro.placa} grande /> : null}
        <div className="min-w-0">
          <p className="font-bold">{carro}</p>
          <p className="text-[14px] text-tinta-2">{[dados.carro.km != null ? formatarKm(dados.carro.km) : '', `feito em ${formatarData(dados.data)}`].filter(Boolean).join(', ')}</p>
        </div>
        {!resposta ? (
          <p className={`ml-auto rounded-full px-3 py-1 text-[13.5px] font-semibold ${hoje > dados.validade ? 'bg-atraso-claro text-atraso' : 'bg-ok-claro text-ok'}`}>
            {hoje > dados.validade ? `Venceu em ${formatarData(dados.validade)}` : `Vale até ${formatarData(dados.validade)}`}
          </p>
        ) : null}
      </section>
      {resposta ? <Respondido dados={dados} oficina={oficina} resposta={resposta} /> : <ParaResponder token={token} dados={dados} oficina={oficina} hoje={hoje} />}
    </article>
  );
}

function Detalhes({ d }: { d: DadosOrcamentoLink }) {
  return (
    <>
      {d.prazo || d.pagamento ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {d.prazo ? (
            <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
              <dt className="text-[13px] font-semibold text-tinta-3">Prazo</dt>
              <dd className="font-semibold">{d.prazo}</dd>
            </div>
          ) : null}
          {d.pagamento ? (
            <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
              <dt className="text-[13px] font-semibold text-tinta-3">Pagamento</dt>
              <dd className="font-semibold">{d.pagamento}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {d.recomendacoes?.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-bold">Para ficar de olho</h2>
          <ul className="flex flex-col gap-1.5">
            {d.recomendacoes.map((x, i) => (
              <li key={i} className="flex items-start gap-2 text-[15px]">
                <span className="mt-0.5 shrink-0 rounded-full bg-oleo-claro px-2 py-0.5 text-[12px] font-bold text-oleo-tinta">{URGENCIAS[x.urgencia]}</span>
                {x.texto}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {d.observacao ? <p className="text-[14.5px] text-tinta-2">{d.observacao}</p> : null}
    </>
  );
}

function ParaResponder({ token, dados, oficina, hoje }: { token: string; dados: DadosOrcamentoLink; oficina: OficinaDoLink; hoje: string }) {
  const router = useRouter();
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() => new Set(dados.linhas.map((l) => l.id)));
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<'aprovar' | 'recusar' | null>(null);
  const [recusando, setRecusando] = useState(false);
  const recusadas = useMemo(() => dados.linhas.filter((l) => !escolhidas.has(l.id)).map((l) => l.id), [dados, escolhidas]);
  const { conteudo, versao } = useVersao(dados, recusadas);
  const vencido = hoje > dados.validade;
  const todas = recusadas.length === 0;

  function alternar(id: string) {
    setEscolhidas((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function responder(acao: 'aprovar' | 'recusar') {
    setErro(null);
    if (acao === 'aprovar' && nome.trim().length < 2) return setErro('Escreva o seu nome para aprovar.');
    if (acao === 'aprovar' && !escolhidas.size) return setErro('Marque pelo menos um item para aprovar.');
    const lista = acao === 'recusar' ? dados.linhas.map((l) => l.id) : recusadas;
    const hash = acao === 'recusar' ? await versaoDoConteudo(conteudoDaAprovacao(dados, lista)) : versao;
    if (!hash) return;
    setEnviando(acao);
    try {
      const r = await responderOrcamento(token, { acao, recusadas: lista, nome: nome.trim(), versao: hash });
      if (!r.ok) {
        setErro(r.erro);
        if (r.mudou) router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setErro('Não deu para mandar agora. Confira a internet e tente de novo.');
    } finally {
      setEnviando(null);
    }
  }

  return (
    <>
      {dados.cliente ? <p className="text-[17px]">Olá, {dados.cliente}! Segue o que o seu carro precisa e quanto fica. Você responde aqui mesmo.</p> : null}
      {dados.diagnostico ? (
        <section className="rounded-2xl bg-papel-2 px-4 py-3.5">
          <h2 className="text-[15px] font-bold">O que a oficina viu no carro</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-tinta-2">{dados.diagnostico}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-label="Itens">
        {!vencido ? <p className="text-[14px] text-tinta-3">Desmarque o que não quiser fazer agora. O total muda sozinho.</p> : null}
        {grupos(dados).map((g) => (
          <div key={g.titulo} className="flex flex-col gap-1.5">
            <h2 className="text-[16px] font-bold">{g.titulo}</h2>
            <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
              {g.linhas.map((l) => {
                const sim = escolhidas.has(l.id);
                return (
                  <li key={l.id}>
                    <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${sim ? '' : 'text-tinta-3'}`}>
                      <input type="checkbox" checked={sim} disabled={vencido || !!enviando} onChange={() => alternar(l.id)} className="h-5 w-5 shrink-0 accent-[var(--color-tinta)] print:hidden" />
                      <span className="min-w-0 flex-1">
                        <span className={`block ${sim ? '' : 'line-through'}`}>{l.descricao}</span>
                        {legenda(l) ? <span className="block text-[13px] text-tinta-3">{legenda(l)}</span> : null}
                      </span>
                      <span className={`num font-semibold ${sim ? '' : 'line-through'}`}>{valorDaLinha(l)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-1 rounded-2xl bg-tinta px-5 py-4 text-papel">
        {conteudo.desconto ? <p className="text-[14px] text-papel/75">Com {formatarMoeda(conteudo.desconto)} de desconto</p> : null}
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{todas ? 'Total' : 'Total do que está marcado'}</span>
          <span className="largo num text-[32px] font-extrabold">{formatarMoeda(conteudo.total)}</span>
        </p>
        {dados.modalidade === 'pago' && dados.vistoria ? (
          <p className="text-[14px] text-papel/80">
            A vistoria custa {formatarMoeda(dados.vistoria.valor)}.
            {dados.vistoria.abater ? ` Se aprovar, ela sai deste valor: você paga ${formatarMoeda(Math.max(0, conteudo.total - dados.vistoria.valor))} no fim.` : ' Ela é cobrada à parte.'}
          </p>
        ) : null}
      </section>

      <Detalhes d={dados} />

      {vencido ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-atraso-claro px-4 py-3.5 text-atraso">
          <p className="font-semibold">Este orçamento venceu em {formatarData(dados.validade)}. Peça um novo para a oficina.</p>
          <div className="flex flex-wrap gap-2">
            <FalarComAOficina oficina={oficina} mensagem={`Olá! O orçamento nº ${dados.numero} (${[dados.carro.nome, dados.carro.placa].filter(Boolean).join(', ')}) venceu. Pode mandar um novo?`} rotulo="Pedir um orçamento novo" destaque />
          </div>
        </div>
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha print:hidden" aria-label="Sua resposta">
          <h2 className="text-[18px]">Sua resposta</h2>
          <Campo rotulo="Seu nome" htmlFor="nome-cliente" dica="Vale como a sua assinatura na aprovação.">
            <input id="nome-cliente" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={80} />
          </Campo>
          <p className="flex items-start gap-2 rounded-xl bg-papel-2 px-3 py-2.5 text-[13.5px] text-tinta-2">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
            <span>
              Código de conferência do que está marcado: <strong className="num font-mono text-tinta">{versao ? codigoDeConferencia(versao) : '…'}</strong>. Ele fica guardado com a sua resposta, junto com a data, a hora e o aparelho.
            </span>
          </p>
          {erro ? (
            <p className="rounded-xl bg-atraso-claro px-3 py-2.5 text-[14px] text-atraso" role="alert">
              {erro}
            </p>
          ) : null}
          {recusando ? (
            <div className="flex flex-col gap-2">
              <p className="text-[15px]">Recusar o orçamento inteiro? A oficina fica sabendo na hora.</p>
              <div className="flex flex-wrap gap-2">
                <Botao variante="perigo" disabled={!!enviando} onClick={() => void responder('recusar')}>
                  <X size={17} aria-hidden="true" /> {enviando === 'recusar' ? 'Mandando…' : 'Sim, recusar'}
                </Botao>
                <Botao variante="fantasma" disabled={!!enviando} onClick={() => setRecusando(false)}>
                  Voltar
                </Botao>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Botao variante="whatsapp" tamanho="grande" className="w-full" disabled={!!enviando || !versao || !escolhidas.size} onClick={() => void responder('aprovar')}>
                <Check size={19} aria-hidden="true" /> {enviando === 'aprovar' ? 'Mandando…' : todas ? 'Aprovar o orçamento' : `Aprovar ${escolhidas.size} ${escolhidas.size === 1 ? 'item' : 'itens'}`}
              </Botao>
              <div className="flex flex-wrap gap-2">
                <FalarComAOficina oficina={oficina} mensagem={`Olá! Tenho uma dúvida sobre o orçamento nº ${dados.numero} (${[dados.carro.nome, dados.carro.placa].filter(Boolean).join(', ')}).`} rotulo="Tirar uma dúvida" />
                <Botao variante="fantasma" className="flex-1" disabled={!!enviando} onClick={() => setRecusando(true)}>
                  Agora não, recusar
                </Botao>
              </div>
            </div>
          )}
        </section>
      )}

      <AcoesDoCliente />
      <Rodape>
        Orçamento feito pela {oficina.nome} no Revisaí. Os valores valem até {formatarData(dados.validade)}. A sua resposta fica guardada com data, hora, IP e aparelho, como comprovante para você e para a oficina.
      </Rodape>
    </>
  );
}

function Respondido({ dados, oficina, resposta }: { dados: DadosOrcamentoLink; oficina: OficinaDoLink; resposta: RespostaDoLink }) {
  const aprovou = resposta.acao === 'aprovar';
  const fora = new Set(resposta.recusadas);
  const { conteudo, versao } = useVersao(dados, resposta.recusadas);
  const confere = versao && resposta.hashAprovado ? versao === resposta.hashAprovado : null;
  const aprovadas = dados.linhas.filter((l) => !fora.has(l.id));
  const recusadas = dados.linhas.filter((l) => fora.has(l.id));
  return (
    <>
      <section className={`flex items-start gap-3 rounded-2xl px-4 py-4 ${aprovou ? 'bg-ok-claro text-ok' : 'bg-papel-2 text-tinta'}`}>
        {aprovou ? <Check size={22} className="mt-0.5 shrink-0" aria-hidden="true" /> : <X size={22} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <div>
          <p className="text-[18px] font-bold">{aprovou ? (recusadas.length ? 'Você aprovou parte do orçamento' : 'Você aprovou o orçamento') : 'Você recusou o orçamento'}</p>
          <p className="text-[14.5px]">
            {dataHora(resposta.quando)}
            {resposta.nome ? `, por ${resposta.nome}` : ''}. {aprovou ? 'A oficina já recebeu e vai começar o serviço.' : 'A oficina já recebeu a sua resposta.'}
          </p>
        </div>
      </section>

      {aprovou ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-bold">O que foi aprovado</h2>
          <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {aprovadas.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block">{l.descricao}</span>
                  {legenda(l) ? <span className="block text-[13px] text-tinta-3">{legenda(l)}</span> : null}
                </span>
                <span className="num font-semibold">{valorDaLinha(l)}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-baseline justify-between rounded-2xl bg-tinta px-5 py-3 text-papel">
            <span className="font-semibold">Total aprovado</span>
            <span className="largo num text-[26px] font-extrabold">{formatarMoeda(resposta.total ?? conteudo.total)}</span>
          </p>
          {recusadas.length ? <p className="text-[14.5px] text-tinta-2">Ficou para depois: {recusadas.map((l) => l.descricao).join(', ')}.</p> : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-1.5 rounded-2xl bg-papel px-4 py-3.5 text-[14px] ring-1 ring-linha" aria-label="Comprovante">
        <h2 className="text-[15px] font-bold">Comprovante</h2>
        <p>
          {aprovou ? 'Aprovado' : 'Recusado'} em {dataHora(resposta.quando)}, pelo link do orçamento{resposta.nome ? `, por ${resposta.nome}` : ''}.
        </p>
        {resposta.ip ? <p className="text-tinta-2">IP: {resposta.ip}</p> : null}
        {resposta.agente ? <p className="text-tinta-2">Aparelho: {aparelhoDoAgente(resposta.agente)}</p> : null}
        {resposta.hashAprovado ? (
          <>
            <p>
              Código de conferência: <strong className="num font-mono">{codigoDeConferencia(resposta.hashAprovado)}</strong>
              {confere === true ? <span className="ml-2 text-ok">confere com o orçamento</span> : confere === false ? <span className="ml-2 text-atraso">o orçamento mudou depois da resposta</span> : null}
            </p>
            <p className="font-mono text-[12px] break-all text-tinta-3">SHA-256: {resposta.hashAprovado}</p>
          </>
        ) : null}
      </section>

      <Detalhes d={dados} />
      <AcoesDoCliente imprimir="Imprimir o comprovante">
        <FalarComAOficina oficina={oficina} mensagem={`Olá! Sobre o orçamento nº ${dados.numero} (${[dados.carro.nome, dados.carro.placa].filter(Boolean).join(', ')}).`} />
      </AcoesDoCliente>
      <Rodape>
        Orçamento nº {dados.numero} da {oficina.nome}, feito no Revisaí. O comprovante mostra o que foi respondido, com a data, a hora, o IP e o aparelho, e o resumo (SHA-256) do que foi aprovado.
      </Rodape>
    </>
  );
}

