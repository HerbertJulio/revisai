'use client';

// "Sua loja": o cadastro, a chave Pix e a equipe. O dono muda tudo; o vendedor vê os colegas e
// pode sair. Trocar a chave Pix e chamar outro dono pedem o código do e-mail de novo.

import { History, KeyRound, LogOut, MessageCircle, Trash2, UserPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  cancelarConvite,
  cancelarTrocaPix,
  convidarParaALoja,
  mudarPapel,
  sairDaLoja,
  salvarCadastroDaLoja,
  tirarPessoa,
  trocarChavePix
} from '@/app/fornecedor/acoes';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { formatarCnpj } from '@/lib/cnpj';
import { formatarDiaHora } from '@/lib/datas';
import { formatarMoeda, formatarTelefone, lerNumero } from '@/lib/formatos';
import { dataCurta, diaEmBrasilia, FUSO, hojeEmBrasilia, quandoFoi } from '@/lib/loja/comum';
import { PRAZOS_DE_ENTREGA, textoDoPrazoDeEntrega, type ConviteDaLoja, type LinhaLoja, type MembroDaLoja, type ResumoPix } from '@/lib/loja/dados';
import { formatarChavePix, type TipoChavePix } from '@/lib/pix';
import type { ConfigPublica } from '@/lib/supabase-navegador';
import { ConfirmarEmail } from './ConfirmarEmail';
import { AvisoErro } from './comum';

const SEM_CONEXAO = 'Sem conexão com o servidor. Tente de novo.';

// ---------------------------------------------------------------- cadastro

export function CadastroDaLoja({ loja, dono }: { loja: LinhaLoja; dono: boolean }) {
  const toast = useToast();
  const [nome, setNome] = useState(loja.nome);
  const [descricao, setDescricao] = useState(loja.descricao ?? '');
  const [whatsapp, setWhatsapp] = useState(loja.whatsapp ? formatarTelefone(loja.whatsapp) : '');
  const [email, setEmail] = useState(loja.email ?? '');
  const [cidade, setCidade] = useState(loja.cidade ?? '');
  const [prazo, setPrazo] = useState(loja.prazo_entrega_horas != null ? String(loja.prazo_entrega_horas) : '');
  const [avisar, setAvisar] = useState(loja.avisar_whatsapp !== false);
  const [minimo, setMinimo] = useState(loja.pedido_minimo != null ? String(loja.pedido_minimo).replace('.', ',') : '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const fixos = (
    <dl className="grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-3">
      <div>
        <dt className="text-tinta-3">CNPJ</dt>
        <dd className="num font-semibold">{loja.cnpj ? formatarCnpj(loja.cnpj) : 'Não informado'}</dd>
      </div>
      <div>
        <dt className="text-tinta-3">Estado</dt>
        <dd className="font-semibold">{loja.uf ?? 'Não informado'}</dd>
      </div>
      <div>
        <dt className="text-tinta-3">No Revisaí desde</dt>
        <dd className="num font-semibold">{dataCurta(diaEmBrasilia(loja.criado_em), hojeEmBrasilia())}</dd>
      </div>
    </dl>
  );

  if (!dono)
    return (
      <div className="flex flex-col gap-3 text-[15px]">
        <p>
          <strong>{loja.nome}</strong>
          {loja.cidade ? `, ${loja.cidade}` : ''}
        </p>
        {loja.descricao ? <p className="text-tinta-2">{loja.descricao}</p> : null}
        <p className="text-tinta-2">{[loja.whatsapp ? `WhatsApp ${formatarTelefone(loja.whatsapp)}` : null, loja.email].filter(Boolean).join(', ') || 'Sem contato cadastrado.'}</p>
        {textoDoPrazoDeEntrega(loja.prazo_entrega_horas) ? <p className="text-tinta-2">{textoDoPrazoDeEntrega(loja.prazo_entrega_horas)}.</p> : null}
        {loja.pedido_minimo != null ? <p className="text-tinta-2">Pedido mínimo de {formatarMoeda(loja.pedido_minimo)}.</p> : null}
        {fixos}
        <p className="text-[13.5px] text-tinta-3">Só o dono da loja muda o cadastro.</p>
      </div>
    );

  function salvar() {
    setErro(null);
    iniciar(async () => {
      try {
        const pedidoMinimo = minimo.trim() ? lerNumero(minimo) : null;
        if (minimo.trim() && !pedidoMinimo) return setErro('Confira o pedido mínimo (ou deixe em branco).');
        const r = await salvarCadastroDaLoja({ nome, descricao, whatsapp, email, cidade, prazoEntregaHoras: prazo ? Number(prazo) : null, avisarWhatsapp: avisar, pedidoMinimo });
        if (!r.ok) return setErro(r.erro);
        toast({ texto: 'Cadastro salvo.' });
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da loja" htmlFor="loja-nome" className="sm:col-span-2">
          <input id="loja-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
        </Campo>
        <Campo rotulo="Sobre a loja" htmlFor="loja-desc" dica="Aparece para as oficinas na vitrine. Ex.: entrega no mesmo dia na região." className="sm:col-span-2">
          <textarea id="loja-desc" className={classeArea} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={400} />
        </Campo>
        <Campo rotulo="WhatsApp da loja" htmlFor="loja-zap" dica="Com DDD. A equipe e as oficinas falam com a loja por ele.">
          <input id="loja-zap" className={classeEntrada} inputMode="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={30} />
        </Campo>
        <Campo rotulo="E-mail de contato" htmlFor="loja-email">
          <input id="loja-email" type="email" className={classeEntrada} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} />
        </Campo>
        <Campo rotulo="Cidade" htmlFor="loja-cidade">
          <input id="loja-cidade" className={classeEntrada} value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} />
        </Campo>
        <Campo rotulo="Prazo de entrega" htmlFor="loja-prazo" dica="Aparece para as oficinas ao lado dos seus produtos.">
          <select id="loja-prazo" className={classeEntrada} value={prazo} onChange={(e) => setPrazo(e.target.value)}>
            <option value="">Não informar</option>
            {PRAZOS_DE_ENTREGA.map((p) => (
              <option key={p.horas} value={p.horas}>
                {p.nome}
              </option>
            ))}
            {prazo && !PRAZOS_DE_ENTREGA.some((p) => String(p.horas) === prazo) ? <option value={prazo}>{textoDoPrazoDeEntrega(Number(prazo))}</option> : null}
          </select>
        </Campo>
        <Campo rotulo="Pedido mínimo (R$)" htmlFor="loja-minimo" dica="Em branco, sem mínimo. A oficina vê antes de pedir.">
          <input id="loja-minimo" className={`${classeEntrada} num`} value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="decimal" placeholder="sem mínimo" />
        </Campo>
        <div className="rounded-xl border border-linha px-4 py-1 sm:col-span-2">
          <Alternar
            id="loja-avisos"
            ligado={avisar}
            aoMudar={setAvisar}
            rotulo="Avisos no WhatsApp da loja"
            descricao="Pedido novo, alerta de preço da região e troca da chave Pix, para quando o painel está fechado."
          />
        </div>
      </div>
      {fixos}
      <p className="text-[13.5px] text-tinta-3">Para mudar o CNPJ ou o estado, fale com a equipe do Revisaí.</p>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <Botao type="submit" variante="escuro" className="self-end" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar o cadastro'}
      </Botao>
    </form>
  );
}

// ---------------------------------------------------------------- Pix

const TIPOS_PIX: { id: TipoChavePix; nome: string; dica: string }[] = [
  { id: 'cnpj', nome: 'CNPJ', dica: '00.000.000/0000-00' },
  { id: 'cpf', nome: 'CPF', dica: '000.000.000-00' },
  { id: 'telefone', nome: 'Celular', dica: '(21) 99999-0000' },
  { id: 'email', nome: 'E-mail', dica: 'vendas@loja.com.br' },
  { id: 'aleatoria', nome: 'Chave aleatória', dica: 'Como aparece no app do banco' }
];

function nomeDoTipo(t: string): string {
  return TIPOS_PIX.find((x) => x.id === t)?.nome ?? t;
}

type PixDoDono = Extract<ResumoPix, { dono: true }>;

export function ChavePixDaLoja({ pix, config, email, cidadeDaLoja }: { pix: PixDoDono; config: ConfigPublica | null; email: string; cidadeDaLoja: string | null }) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const base = pix.troca ?? pix.atual;
  const [tipo, setTipo] = useState<TipoChavePix>(base?.tipo ?? 'cnpj');
  const [chave, setChave] = useState(base ? formatarChavePix(base.tipo, base.chave) : '');
  const [nome, setNome] = useState(base?.nome ?? '');
  const [cidade, setCidade] = useState(base?.cidade ?? cidadeDaLoja ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const agora = new Date();

  function salvar() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await trocarChavePix({ tipo, chave, nome, cidade });
        if (!r.ok) {
          if ('confirmarEmail' in r && r.confirmarEmail) return setConfirmar(true);
          return setErro(r.erro);
        }
        setEditando(false);
        setConfirmar(false);
        toast({
          texto: r.imediata
            ? 'Chave Pix salva. As oficinas já podem pagar pelo app.'
            : `Troca pedida. A chave nova vale ${formatarDiaHora(r.valeEm, new Date(), FUSO)}; até lá, as oficinas pagam na chave atual.`
        });
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  function cancelar() {
    iniciar(async () => {
      try {
        const r = await cancelarTrocaPix();
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        toast({ texto: 'Troca cancelada. A chave atual continua valendo.' });
      } catch {
        toast({ texto: SEM_CONEXAO, tom: 'erro' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {pix.atual ? (
        <div className="flex items-start gap-3 rounded-xl bg-papel-2 px-4 py-3">
          <KeyRound size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-oleo-tinta" />
          <div className="min-w-0 text-[14.5px]">
            <p className="font-semibold">
              {nomeDoTipo(pix.atual.tipo)} {formatarChavePix(pix.atual.tipo, pix.atual.chave)}
            </p>
            <p className="text-tinta-2">
              Em nome de {pix.atual.nome}, {pix.atual.cidade}.{pix.atual.desde ? ` Valendo desde ${quandoFoi(pix.atual.desde, agora.getTime())}.` : ''}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[14.5px] text-tinta-2">A loja ainda não tem chave Pix. Com ela, a oficina paga o pedido pelo app, com o QR Code do valor certo, direto na conta da loja. A primeira chave vale na hora.</p>
      )}

      {pix.troca ? (
        <div className="flex flex-col gap-2 rounded-xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta" role="status">
          <p>
            <strong>Troca pedida</strong>
            {pix.troca.pedidaPor ? ` por ${pix.troca.pedidaPor}` : ''}: {nomeDoTipo(pix.troca.tipo)} {formatarChavePix(pix.troca.tipo, pix.troca.chave)}, em nome de {pix.troca.nome}.
          </p>
          <p>
            Vale {formatarDiaHora(pix.troca.valeEm, agora, FUSO)}. Até lá, as oficinas pagam na chave atual. Não foi você? Cancele agora e troque o acesso da conta.
          </p>
          <Botao variante="perigo" tamanho="pequeno" className="self-start" onClick={cancelar} disabled={ocupado}>
            Cancelar a troca
          </Botao>
        </div>
      ) : null}

      {editando ? (
        <div className="flex flex-col gap-4 rounded-xl bg-papel-2/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo da chave" htmlFor="pix-tipo">
              <select id="pix-tipo" className={classeEntrada} value={tipo} onChange={(e) => setTipo(e.target.value as TipoChavePix)}>
                {TIPOS_PIX.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Chave" htmlFor="pix-chave">
              <input id="pix-chave" className={classeEntrada} value={chave} onChange={(e) => setChave(e.target.value)} placeholder={TIPOS_PIX.find((t) => t.id === tipo)?.dica} autoComplete="off" />
            </Campo>
            <Campo rotulo="Nome de quem recebe" htmlFor="pix-nome" dica="Como está no banco. Vai no QR Code (até 25 letras).">
              <input id="pix-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
            </Campo>
            <Campo rotulo="Cidade" htmlFor="pix-cidade" dica="Vai no QR Code (até 15 letras).">
              <input id="pix-cidade" className={classeEntrada} value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} />
            </Campo>
          </div>
          {pix.atual ? <p className="text-[13.5px] text-tinta-3">Por segurança, a chave nova só vale 24 horas depois do pedido, e dá para cancelar até lá.</p> : null}
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          {confirmar ? (
            <ConfirmarEmail config={config} email={email} motivo="trocar a chave Pix" aoConfirmar={salvar} aoVoltar={() => setConfirmar(false)} />
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Botao variante="fantasma" onClick={() => (setEditando(false), setErro(null))}>
                Cancelar
              </Botao>
              <Botao variante="primario" onClick={salvar} disabled={ocupado}>
                {ocupado ? 'Salvando…' : pix.atual ? 'Pedir a troca' : 'Salvar a chave'}
              </Botao>
            </div>
          )}
        </div>
      ) : (
        <Botao variante={pix.atual ? 'secundario' : 'escuro'} className="self-start" onClick={() => setEditando(true)}>
          {pix.atual ? (pix.troca ? 'Pedir outra troca' : 'Trocar a chave') : 'Cadastrar a chave Pix'}
        </Botao>
      )}

      {pix.antigas.length ? (
        <details className="group text-[14px]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-tinta-2 hover:text-tinta">
            <History size={15} aria-hidden="true" /> Chaves usadas antes ({pix.antigas.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 border-l-2 border-linha pl-3 text-tinta-2">
            {pix.antigas.map((a, i) => (
              <li key={`${a.usadaAte}-${i}`}>
                {nomeDoTipo(a.tipo)} {formatarChavePix(a.tipo as TipoChavePix, a.chave)}, {a.nome}. Usada até {quandoFoi(a.usadaAte, agora.getTime())}.
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- equipe

export function EquipeDaLoja({
  membros,
  convites,
  dono,
  euId,
  loja,
  config,
  email
}: {
  membros: MembroDaLoja[];
  convites: ConviteDaLoja[];
  dono: boolean;
  euId: string;
  loja: string;
  config: ConfigPublica | null;
  email: string;
}) {
  const toast = useToast();
  const [novoEmail, setNovoEmail] = useState('');
  const [novoPapel, setNovoPapel] = useState<'vendedor' | 'dono'>('vendedor');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<null | { motivo: string; refazer: () => void }>(null);
  const [convidado, setConvidado] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const donos = membros.filter((m) => m.papel === 'dono').length;
  const agora = Date.now();

  function convidar() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await convidarParaALoja({ email: novoEmail, papel: novoPapel });
        if (!r.ok) {
          if ('confirmarEmail' in r && r.confirmarEmail) return setConfirmar({ motivo: 'chamar outro dono', refazer: convidar });
          return setErro(r.erro);
        }
        setConfirmar(null);
        setConvidado(r.email);
        setNovoEmail('');
        toast({ texto: `Convite feito para ${r.email}.` });
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  function papel(m: MembroDaLoja, p: 'dono' | 'vendedor') {
    iniciar(async () => {
      try {
        const r = await mudarPapel(m.userId, p);
        if (!r.ok) {
          if ('confirmarEmail' in r && r.confirmarEmail) return setConfirmar({ motivo: 'passar alguém a dono', refazer: () => papel(m, p) });
          return toast({ texto: r.erro, tom: 'erro' });
        }
        setConfirmar(null);
        toast({ texto: p === 'dono' ? `${m.email ?? 'A pessoa'} agora é dono da loja.` : `${m.email ?? 'A pessoa'} agora é vendedor.` });
      } catch {
        toast({ texto: SEM_CONEXAO, tom: 'erro' });
      }
    });
  }

  function tirar(m: MembroDaLoja) {
    if (!window.confirm(`Tirar ${m.email ?? 'esta pessoa'} da loja? Ela perde o acesso ao painel na hora.`)) return;
    iniciar(async () => {
      try {
        const r = await tirarPessoa(m.userId);
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        toast({ texto: 'Pronto. A pessoa não acessa mais a loja.' });
      } catch {
        toast({ texto: SEM_CONEXAO, tom: 'erro' });
      }
    });
  }

  function cancelar(c: ConviteDaLoja) {
    iniciar(async () => {
      try {
        const r = await cancelarConvite(c.id);
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        toast({ texto: 'Convite cancelado.' });
      } catch {
        toast({ texto: SEM_CONEXAO, tom: 'erro' });
      }
    });
  }

  function sair() {
    iniciar(async () => {
      try {
        const r = await sairDaLoja();
        if (r && !r.ok) {
          setSaindo(false);
          toast({ texto: r.erro, tom: 'erro' });
        }
      } catch (e) {
        // a saída redireciona para a conta (o Next avisa com um erro especial)
        if (e && typeof e === 'object' && 'digest' in e) throw e;
        toast({ texto: SEM_CONEXAO, tom: 'erro' });
      }
    });
  }

  function mensagemDoConvite(para: string): string {
    return `Te chamei para trabalhar na loja ${loja} no Revisaí. Entre com o e-mail ${para} em ${location.origin}/entrar?para=/fornecedor e aceite o convite.`;
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="divide-y divide-linha rounded-xl ring-1 ring-linha">
        {membros.map((m) => {
          const eu = m.userId === euId;
          return (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {m.nome || m.email || 'Pessoa da loja'}
                  {eu ? <span className="font-normal text-tinta-3"> (você)</span> : null}
                </p>
                <p className="text-[13.5px] text-tinta-3">
                  {m.nome && m.email ? `${m.email}, ` : ''}na loja desde {quandoFoi(m.desde, agora)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {dono && !eu ? (
                  <select
                    aria-label={`Papel de ${m.email ?? 'pessoa'}`}
                    value={m.papel}
                    disabled={ocupado}
                    onChange={(e) => papel(m, e.target.value as 'dono' | 'vendedor')}
                    className="h-9 rounded-[10px] border border-linha bg-papel pr-8 pl-3 text-[16px] font-semibold text-tinta outline-none focus:border-caneta focus:ring-3 focus:ring-caneta/20 sm:text-[14px]"
                  >
                    <option value="vendedor">Vendedor</option>
                    <option value="dono">Dono</option>
                  </select>
                ) : (
                  <Chip tom={m.papel === 'dono' ? 'oleo' : 'neutro'}>{m.papel === 'dono' ? 'Dono' : 'Vendedor'}</Chip>
                )}
                {dono && !eu ? (
                  <button type="button" onClick={() => tirar(m)} disabled={ocupado} className="grid h-9 w-9 place-items-center rounded-[10px] text-tinta-3 hover:bg-atraso-claro hover:text-atraso" aria-label={`Tirar ${m.email ?? 'pessoa'} da loja`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {dono ? (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">Chamar alguém para a loja</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Campo rotulo="E-mail da pessoa" htmlFor="convite-email">
              <input id="convite-email" type="email" className={classeEntrada} value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} autoComplete="off" maxLength={160} />
            </Campo>
            <Campo rotulo="Papel" htmlFor="convite-papel">
              <select id="convite-papel" className={classeEntrada} value={novoPapel} onChange={(e) => setNovoPapel(e.target.value as 'dono' | 'vendedor')}>
                <option value="vendedor">Vendedor</option>
                <option value="dono">Dono</option>
              </select>
            </Campo>
            <Botao variante="escuro" onClick={convidar} disabled={ocupado || !novoEmail.trim()}>
              <UserPlus size={17} aria-hidden="true" /> Convidar
            </Botao>
          </div>
          <p className="text-[13.5px] text-tinta-3">
            Vendedor cuida de produtos, promoções, pedidos e alertas. Dono também mexe na chave Pix, no cadastro, no plano e na equipe.
          </p>
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          {convidado ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ok-claro/60 px-4 py-3 text-[14.5px]">
              <span className="min-w-0 flex-1">O convite aparece quando {convidado} entrar no Revisaí com esse e-mail. Quer avisar a pessoa?</span>
              <a href={`https://wa.me/?text=${encodeURIComponent(mensagemDoConvite(convidado))}`} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
                <MessageCircle size={15} aria-hidden="true" /> Mandar no WhatsApp
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {confirmar ? (
        <ConfirmarEmail
          config={config}
          email={email}
          motivo={confirmar.motivo}
          aoConfirmar={() => {
            const refazer = confirmar.refazer;
            setConfirmar(null);
            refazer();
          }}
          aoVoltar={() => setConfirmar(null)}
        />
      ) : null}

      {dono && convites.length ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">Convites esperando</p>
          <ul className="divide-y divide-linha rounded-xl ring-1 ring-linha">
            {convites.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.email}</p>
                  <p className="text-[13.5px] text-tinta-3">
                    {c.papel === 'dono' ? 'Dono' : 'Vendedor'}, vale até {formatarDiaHora(c.expiraEm, new Date(), FUSO)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={`https://wa.me/?text=${encodeURIComponent(mensagemDoConvite(c.email))}`} target="_blank" rel="noopener noreferrer" className={classeBotao('fantasma', 'pequeno')}>
                    <MessageCircle size={15} aria-hidden="true" /> Avisar
                  </a>
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => cancelar(c)} disabled={ocupado}>
                    Cancelar
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-linha pt-4">
        {saindo ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-atraso-claro/60 px-4 py-3 text-[14.5px]">
            <span className="min-w-0 flex-1">
              {dono && donos <= 1 ? 'Você é o único dono: passe o dono para outra pessoa antes de sair.' : 'Sair da loja? Você perde o acesso ao painel dela na hora.'}
            </span>
            <Botao tamanho="pequeno" variante="fantasma" onClick={() => setSaindo(false)}>
              Voltar
            </Botao>
            {!(dono && donos <= 1) ? (
              <Botao tamanho="pequeno" variante="perigo" onClick={sair} disabled={ocupado}>
                Sair da loja
              </Botao>
            ) : null}
          </div>
        ) : (
          <button type="button" onClick={() => setSaindo(true)} className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-tinta-3 hover:text-atraso">
            <LogOut size={15} aria-hidden="true" /> Sair desta loja
          </button>
        )}
      </div>
    </div>
  );
}
