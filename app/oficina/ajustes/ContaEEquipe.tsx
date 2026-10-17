'use client';

// As partes dos Ajustes que dependem da conta: quem entrou e sair, a equipe da oficina (membros,
// convites e papéis), apagar a oficina e apagar a cópia dos dados deste aparelho.

import { LogIn, LogOut, Mail, Repeat, Trash2, UserMinus, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { contaAgora } from '@/app/oficina/acoes-pro';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { useSincronia } from '@/components/oficina/sincronia/ProvedorDaSincronia';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Secao, classeBotao, classeEntrada } from '@/components/ui';
import { nomeDoPapel, PAPEIS_OFICINA, type PapelOficina } from '@/lib/conta-dados';
import { dataLocal, formatarData } from '@/lib/datas';
import { plural } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import {
  cancelarConviteDaOficina,
  cancelarExclusaoDaOficina,
  convidarParaOficina,
  equipeDaOficina,
  mudarPapelNaOficina,
  pedirExclusaoDaOficina,
  sairDaConta,
  sairDaOficina,
  tirarDaOficina,
  type EquipeDaOficina
} from './acoes';

const SEM_CONEXAO = 'Sem conexão com o servidor. Tente de novo.';

function Cartao({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">{children}</div>;
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
      {texto}
    </p>
  );
}

/** Tira a conta da tela e a cópia dos dados do aparelho, e vai para outra página. */
function useLargarAConta(): (destino: string) => Promise<void> {
  const { definirConta } = useConta();
  const router = useRouter();
  return useCallback(
    async (destino: string) => {
      // primeiro a conta sai da tela (a sincronia para), depois os dados saem do aparelho
      definirConta(null);
      useOficina.getState().esquecerConta();
      // dá tempo de o aparelho gravar a cópia vazia antes de trocar de página
      await new Promise((r) => setTimeout(r, 200));
      router.replace(destino);
      router.refresh();
    },
    [definirConta, router]
  );
}

// ---------------------------------------------------------------- equipe (dados compartilhados)

interface ValorEquipe {
  equipe: EquipeDaOficina | null;
  erro: string | null;
  recarregar: () => void;
}

const ContextoEquipe = createContext<ValorEquipe>({ equipe: null, erro: null, recarregar: () => {} });

/** Busca a equipe e a exclusão pedida uma vez para as partes dos Ajustes. */
export function ProvedorDaEquipe({ children }: { children: ReactNode }) {
  const { oficina } = useConta();
  const oficinaId = oficina?.id ?? null;
  const [equipe, setEquipe] = useState<{ de: string; valor: EquipeDaOficina } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vez, setVez] = useState(0);

  useEffect(() => {
    if (!oficinaId) return;
    let vivo = true;
    equipeDaOficina()
      .then((r) => {
        if (!vivo) return;
        if (r.ok) {
          setEquipe({ de: oficinaId, valor: r.equipe });
          setErro(null);
        } else setErro(r.erro);
      })
      .catch(() => vivo && setErro(SEM_CONEXAO));
    return () => {
      vivo = false;
    };
  }, [oficinaId, vez]);

  const valor = useMemo<ValorEquipe>(
    () => ({ equipe: equipe && equipe.de === oficinaId ? equipe.valor : null, erro, recarregar: () => setVez((v) => v + 1) }),
    [equipe, oficinaId, erro]
  );
  return <ContextoEquipe.Provider value={valor}>{children}</ContextoEquipe.Provider>;
}

// ---------------------------------------------------------------- sua conta

export function SuaConta() {
  const { conta, oficina } = useConta();
  const { pendentes, sincronizar } = useSincronia();
  const largar = useLargarAConta();
  const [pergunta, setPergunta] = useState<'sair' | 'todos' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  if (!conta || !oficina)
    return (
      <Secao id="conta" titulo="Sua conta">
        <Cartao>
          <div className="flex flex-col gap-3">
            <p className="text-[15px] font-semibold">Sem conta, os dados ficam só neste aparelho.</p>
            <p className="text-[14.5px] text-tinta-2">
              Com a conta, tudo fica guardado na nuvem e aparece nos outros aparelhos da oficina, cada pessoa da equipe entra com o próprio e-mail e a voz com IA funciona.
              Para entrar basta o e-mail, sem senha.
            </p>
            <Link href="/entrar?para=/oficina/ajustes" className={`${classeBotao('escuro')} self-start`}>
              <LogIn size={17} aria-hidden="true" /> Entrar ou criar a conta
            </Link>
          </div>
        </Cartao>
      </Secao>
    );

  function sair(todos: boolean) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await sairDaConta(todos);
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
        await largar('/');
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  const papel = PAPEIS_OFICINA.find((p) => p.id === oficina.papel);
  return (
    <Secao id="conta" titulo="Sua conta">
      <Cartao>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold">{conta.usuario.email}</p>
              <p className="text-[14px] text-tinta-2">
                {papel?.nome ?? oficina.papel} da {oficina.nome}. {papel?.descricao}.
              </p>
            </div>
            {conta.oficinas.length > 1 ? (
              <Link href="/conta?ver=1" className={classeBotao('secundario', 'pequeno')}>
                <Repeat size={15} aria-hidden="true" /> Trocar de oficina
              </Link>
            ) : null}
          </div>
          <Erro texto={erro} />
          <div className="flex flex-wrap gap-2 border-t border-linha pt-4">
            <Botao variante="secundario" disabled={ocupado} onClick={() => (pendentes > 0 ? setPergunta('sair') : sair(false))}>
              <LogOut size={16} aria-hidden="true" /> {ocupado ? 'Saindo…' : 'Sair'}
            </Botao>
            <Botao variante="fantasma" disabled={ocupado} onClick={() => setPergunta('todos')}>
              Sair de todos os aparelhos
            </Botao>
          </div>
          <p className="text-[13px] text-tinta-3">Ao sair, a cópia dos dados da oficina sai deste aparelho. Na nuvem, nada muda.</p>
        </div>
      </Cartao>

      <Folha
        aberta={pergunta != null}
        aoFechar={() => setPergunta(null)}
        titulo={pergunta === 'todos' ? 'Sair de todos os aparelhos?' : 'Sair sem subir as mudanças?'}
        descricao={
          pergunta === 'todos'
            ? 'Use quando um celular for perdido ou trocado. Você sai daqui e de todos os outros aparelhos; neles, o Revisaí pede para entrar de novo.'
            : `${plural(pendentes, 'mudança deste aparelho ainda não subiu', 'mudanças deste aparelho ainda não subiram')} para a nuvem. Saindo agora, ${pendentes === 1 ? 'ela se perde' : 'elas se perdem'}.`
        }
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {pendentes > 0 ? (
              <Botao
                onClick={() => {
                  sincronizar();
                  setPergunta(null);
                }}
              >
                Sincronizar agora
              </Botao>
            ) : (
              <Botao onClick={() => setPergunta(null)}>Cancelar</Botao>
            )}
            <Botao
              variante="perigo"
              disabled={ocupado}
              onClick={() => {
                const todos = pergunta === 'todos';
                setPergunta(null);
                sair(todos);
              }}
            >
              {pergunta === 'todos' ? 'Sair de todos' : 'Sair mesmo assim'}
            </Botao>
          </div>
        }
      >
        {pergunta === 'todos' && pendentes > 0 ? (
          <p className="text-[14.5px] text-atraso">
            Atenção: {plural(pendentes, 'mudança deste aparelho ainda não subiu', 'mudanças deste aparelho ainda não subiram')}. Sincronize antes de sair.
          </p>
        ) : (
          <p className="text-[14.5px] text-tinta-2">A cópia dos dados da oficina sai deste aparelho. O que está na nuvem continua lá.</p>
        )}
      </Folha>
    </Secao>
  );
}

// ---------------------------------------------------------------- equipe da oficina

export function EquipeDaOficinaSecao() {
  const { conta, oficina } = useConta();
  const { equipe, erro: erroAoCarregar, recarregar } = useContext(ContextoEquipe);
  const toast = useToast();
  const largar = useLargarAConta();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [papelNovo, setPapelNovo] = useState<PapelOficina>('mecanico');
  const [saindo, setSaindo] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (!conta || !oficina) return null;
  const eu = conta.usuario.id;
  const dono = oficina.papel === 'dono';
  const convida = dono || oficina.papel === 'gerente';
  const papeisDoConvite = dono ? PAPEIS_OFICINA : PAPEIS_OFICINA.filter((p) => p.id === 'mecanico');

  function rodar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await acao();
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
        depois?.();
        recarregar();
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  function convidar(e: FormEvent) {
    e.preventDefault();
    const alvo = email.trim().toLowerCase();
    if (!alvo) return setErro('Escreva o e-mail de quem você quer chamar.');
    rodar(
      () => convidarParaOficina(alvo, papelNovo),
      () => {
        setEmail('');
        setAviso(`Convite feito para ${alvo}. Peça para a pessoa entrar no Revisaí com esse e-mail: o convite aparece na conta dela e vale 14 dias.`);
      }
    );
  }

  function sairDaqui() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await sairDaOficina();
        if (!r.ok) {
          setErro(r.erro);
          setSaindo(false);
          return;
        }
        toast({ texto: `Você saiu da ${oficina?.nome ?? 'oficina'}.` });
        await largar('/conta?ver=1');
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  return (
    <Secao id="equipe" titulo="Equipe da oficina" descricao="Cada pessoa entra com o próprio e-mail e vê só esta oficina. O dono cuida do plano e da equipe; o gerente convida mecânicos.">
      <Cartao>
        <div className="flex flex-col gap-5">
          <Erro texto={erro ?? erroAoCarregar} />
          {aviso ? (
            <p className="rounded-xl bg-ok-claro px-4 py-3 text-[14px] text-ok" role="status">
              {aviso}
            </p>
          ) : null}

          {equipe == null ? (
            <p className="text-[14px] text-tinta-3">{erroAoCarregar ? '' : 'Abrindo a equipe…'}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linha" aria-label="Pessoas da oficina">
              {equipe.membros.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {m.nome || m.email || 'Sem e-mail'} {m.userId === eu ? <span className="text-[13px] font-normal text-tinta-3">(você)</span> : null}
                    </p>
                    {m.nome && m.email ? <p className="truncate text-[13px] text-tinta-3">{m.email}</p> : null}
                  </div>
                  {dono ? (
                    <select
                      className={`${classeEntrada} h-9 w-auto text-[14px]`}
                      value={m.papel}
                      disabled={ocupado}
                      aria-label={`Papel de ${m.email || 'membro'}`}
                      onChange={(e) => {
                        const novo = e.target.value as PapelOficina;
                        if (m.userId === eu && novo !== 'dono' && !window.confirm('Deixar de ser dono? Você perde o acesso ao plano, à equipe e a apagar a oficina.')) return;
                        rodar(() => mudarPapelNaOficina(m.userId, novo), () => toast({ texto: 'Papel mudado.' }));
                      }}
                    >
                      {PAPEIS_OFICINA.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Chip tom={m.papel === 'dono' ? 'oleo' : 'neutro'}>{nomeDoPapel('oficina', m.papel)}</Chip>
                  )}
                  {dono && m.userId !== eu ? (
                    <Botao
                      variante="fantasma"
                      tamanho="pequeno"
                      disabled={ocupado}
                      aria-label={`Tirar ${m.email || 'membro'} da oficina`}
                      onClick={() => {
                        if (!window.confirm(`Tirar ${m.email || 'esta pessoa'} da oficina? Ela perde o acesso na hora.`)) return;
                        rodar(() => tirarDaOficina(m.userId), () => toast({ texto: 'A pessoa saiu da oficina.' }));
                      }}
                    >
                      <UserMinus size={16} aria-hidden="true" /> Tirar
                    </Botao>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {convida && equipe?.convites.length ? (
            <div className="flex flex-col gap-2 border-t border-linha pt-4">
              <p className="text-[14px] font-semibold">Convites esperando</p>
              <ul className="flex flex-col gap-2">
                {equipe.convites.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-papel-2 px-3 py-2">
                    <Mail size={16} className="text-tinta-3" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[14.5px]">
                      {c.email} · {nomeDoPapel('oficina', c.papel).toLowerCase()} · vale até {formatarData(dataLocal(c.expiraEm))}
                    </span>
                    <button
                      type="button"
                      className="text-[13.5px] font-semibold text-tinta-3 hover:text-atraso"
                      disabled={ocupado}
                      onClick={() => rodar(() => cancelarConviteDaOficina(c.id), () => toast({ texto: 'Convite cancelado.' }))}
                    >
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {convida ? (
            <form onSubmit={convidar} className="flex flex-col gap-3 border-t border-linha pt-4">
              <p className="text-[14px] font-semibold">Chamar alguém para a equipe</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <Campo rotulo="E-mail" htmlFor="eq-email">
                  <input
                    id="eq-email"
                    type="email"
                    className={classeEntrada}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mecanico@email.com"
                    autoComplete="off"
                    inputMode="email"
                  />
                </Campo>
                <Campo rotulo="Entra como" htmlFor="eq-papel">
                  <select id="eq-papel" className={classeEntrada} value={papelNovo} onChange={(e) => setPapelNovo(e.target.value as PapelOficina)}>
                    {papeisDoConvite.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Botao type="submit" variante="escuro" disabled={ocupado}>
                  <UserPlus size={17} aria-hidden="true" /> Convidar
                </Botao>
              </div>
              <p className="text-[13px] text-tinta-3">{PAPEIS_OFICINA.find((p) => p.id === papelNovo)?.descricao}.</p>
            </form>
          ) : null}

          <div className="border-t border-linha pt-4">
            {saindo ? (
              <div className="flex flex-col gap-3 rounded-xl bg-atraso-claro px-4 py-3">
                <p className="text-[14.5px] text-atraso">
                  Sair da {oficina.nome}? Você perde o acesso aos dados dela, e a cópia deste aparelho é apagada. Para voltar, o dono precisa convidar você de novo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Botao variante="perigo" tamanho="pequeno" disabled={ocupado} onClick={sairDaqui}>
                    {ocupado ? 'Saindo…' : 'Sair da oficina'}
                  </Botao>
                  <Botao variante="fantasma" tamanho="pequeno" onClick={() => setSaindo(false)}>
                    Ficar
                  </Botao>
                </div>
              </div>
            ) : (
              <button type="button" className="text-[14px] font-semibold text-tinta-3 hover:text-atraso" onClick={() => setSaindo(true)}>
                Sair desta oficina
              </button>
            )}
          </div>
        </div>
      </Cartao>
    </Secao>
  );
}

// ---------------------------------------------------------------- apagar a oficina

/** Só o dono: pede para apagar a oficina (30 dias para desistir) ou desiste. */
export function ApagarOficina() {
  const { oficina, definirConta } = useConta();
  const { equipe, recarregar } = useContext(ContextoEquipe);
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  if (!oficina || oficina.papel !== 'dono') return null;

  async function atualizarConta() {
    try {
      const c = await contaAgora();
      if (c) definirConta(c);
    } catch {}
    recarregar();
  }

  function pedir() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await pedirExclusaoDaOficina(texto);
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
        setTexto('');
        toast({ texto: `A oficina vai ser apagada em ${formatarData(dataLocal(r.quando))}.` });
        await atualizarConta();
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  function desistir() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await cancelarExclusaoDaOficina();
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
        toast({ texto: 'Pronto. A oficina não vai mais ser apagada.' });
        await atualizarConta();
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  const excluirEm = equipe?.excluirEm ?? null;
  return (
    <Secao id="apagar-oficina" titulo="Apagar a oficina">
      <Cartao>
        {excluirEm ? (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] font-semibold text-atraso">A {oficina.nome} vai ser apagada em {formatarData(dataLocal(excluirEm))}.</p>
            <p className="text-[14px] text-tinta-2">Até lá, ela fica fora do ar para toda a equipe e dá para desistir.</p>
            <Erro texto={erro} />
            <Botao variante="escuro" className="self-start" disabled={ocupado} onClick={desistir}>
              {ocupado ? 'Desfazendo…' : 'Não apagar a oficina'}
            </Botao>
          </div>
        ) : (
          <details className="text-[14.5px]">
            <summary className="cursor-pointer font-semibold text-tinta-2 hover:text-atraso">Quero apagar a {oficina.nome}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-tinta-2">
                A oficina sai do ar na hora para toda a equipe e é apagada de vez em 30 dias: clientes, carros, serviços, ordens, estoque e o plano. Até lá, dá para desistir aqui. Baixe um backup antes se quiser guardar uma cópia.
              </p>
              <Campo rotulo="Escreva APAGAR para confirmar" htmlFor="apagar-oficina-confirma" erro={erro}>
                <input id="apagar-oficina-confirma" className={classeEntrada} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" autoCapitalize="characters" />
              </Campo>
              <Botao variante="perigo" className="self-start" disabled={ocupado || texto.trim().toUpperCase() !== 'APAGAR'} onClick={pedir}>
                <Trash2 size={16} aria-hidden="true" /> {ocupado ? 'Pedindo…' : 'Apagar a oficina'}
              </Botao>
            </div>
          </details>
        )}
      </Cartao>
    </Secao>
  );
}

// ---------------------------------------------------------------- cópia deste aparelho

/** Com a conta: apaga só a cópia deste aparelho (ela volta da nuvem); a nuvem não muda. */
export function ApagarCopiaDoAparelho() {
  const { oficina } = useConta();
  const { pendentes, sincronizar } = useSincronia();
  const toast = useToast();
  const [aberta, setAberta] = useState(false);
  if (!oficina) return null;
  return (
    <>
      <Botao variante="perigo" onClick={() => setAberta(true)}>
        Apagar a cópia deste aparelho
      </Botao>
      <Folha
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        titulo="Apagar a cópia deste aparelho?"
        descricao="Os dados da oficina saem deste aparelho e voltam da nuvem em seguida, como estão lá. Use quando algo parecer errado só aqui. Na nuvem e nos outros aparelhos, nada muda."
        rodape={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {pendentes > 0 ? (
              <Botao
                onClick={() => {
                  sincronizar();
                  setAberta(false);
                }}
              >
                Sincronizar antes
              </Botao>
            ) : (
              <Botao onClick={() => setAberta(false)}>Cancelar</Botao>
            )}
            <Botao
              variante="perigo"
              onClick={() => {
                setAberta(false);
                useOficina.getState().esquecerConta();
                toast({ texto: 'Cópia apagada. Os dados estão voltando da nuvem.' });
              }}
            >
              Apagar a cópia
            </Botao>
          </div>
        }
      >
        {pendentes > 0 ? (
          <p className="text-[14.5px] text-atraso">
            {plural(pendentes, 'mudança deste aparelho ainda não subiu', 'mudanças deste aparelho ainda não subiram')}. Apagando agora, {pendentes === 1 ? 'ela se perde' : 'elas se perdem'}.
          </p>
        ) : (
          <p className="text-[14.5px] text-tinta-2">Tudo deste aparelho já está na nuvem.</p>
        )}
      </Folha>
    </>
  );
}
