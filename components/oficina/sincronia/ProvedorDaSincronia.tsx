'use client';

import { Cloud, CloudOff, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { telaDaOficinaAbriu, useSaindoDaConta } from '@/components/conta/sair';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { Botao } from '@/components/ui';
import { formatarDiaHora } from '@/lib/datas';
import { plural } from '@/lib/formatos';
import { useHidratado } from '@/lib/ganchos';
import { resumoLocal, temDadosLocais } from '@/lib/sincronia-dados';
import { useOficina } from '@/lib/store';
import { MotorDeSincronia, type EstadoMotor, type InfoMotor } from './motor';

// Liga os dados do aparelho à oficina da conta e mantém os dois iguais. Sem conta, não faz nada
// (os dados ficam só no aparelho, como antes). Nada acontece antes de ler o que o aparelho já
// tem guardado: decidir antes disso apagaria os dados de quem usava o app sem conta.

export type EstadoSincronia = EstadoMotor | 'local' | 'outra-aba';

interface ValorSincronia {
  estado: EstadoSincronia;
  pendentes: number;
  rejeitados: number;
  ultimaEm: string | null;
  erro: string | null;
  sincronizar: () => void;
}

const Contexto = createContext<ValorSincronia>({ estado: 'local', pendentes: 0, rejeitados: 0, ultimaEm: null, erro: null, sincronizar: () => {} });

export function useSincronia(): ValorSincronia {
  return useContext(Contexto);
}

type Pergunta = { tipo: 'levar' } | { tipo: 'trocar'; de: string; pendentes: number } | null;

export function ProvedorDaSincronia({ children }: { children: ReactNode }) {
  const { oficina, banco } = useConta();
  const hidratado = useHidratado();
  const contaOficinaId = useOficina((s) => s.contaOficinaId);
  const pendentes = useOficina((s) => Object.keys(s.sinc.pendentes).length);
  const rejeitados = useOficina((s) => Object.keys(s.sinc.rejeitados ?? {}).length);
  const ultimaEm = useOficina((s) => s.sinc.ultimaEm);
  const [info, setInfo] = useState<InfoMotor>({ estado: 'iniciando', erro: null });
  const [lider, setLider] = useState(true);
  const [pergunta, setPergunta] = useState<Pergunta>(null);
  const motor = useRef<MotorDeSincronia | null>(null);
  const oficinaId = oficina?.id ?? null;
  const saindo = useSaindoDaConta();

  useEffect(() => {
    telaDaOficinaAbriu();
  }, []);

  // de quem são os dados deste aparelho?
  useEffect(() => {
    if (!hidratado || !oficinaId || saindo) return;
    const s = useOficina.getState();
    if (s.contaOficinaId === oficinaId) {
      setPergunta(null);
      return;
    }
    if (s.contaOficinaId === null) {
      if (temDadosLocais(s)) setPergunta({ tipo: 'levar' });
      else s.vincularConta(oficinaId, false);
      return;
    }
    const n = Object.keys(s.sinc.pendentes).length;
    if (!n) {
      s.esquecerConta();
      useOficina.getState().vincularConta(oficinaId, false);
    } else setPergunta({ tipo: 'trocar', de: s.contaOficinaId, pendentes: n });
  }, [hidratado, oficinaId, contaOficinaId, saindo]);

  // o motor roda numa aba só (as outras recebem pelo aparelho)
  useEffect(() => {
    if (!hidratado || !oficinaId || contaOficinaId !== oficinaId || saindo) return;
    const sb = banco();
    if (!sb) return;
    let atual: MotorDeSincronia | null = null;
    let soltar: (() => void) | null = null;
    let cancelado = false;
    const ligar = () => {
      setLider(true);
      atual = new MotorDeSincronia(sb, oficinaId, setInfo);
      motor.current = atual;
      atual.iniciar();
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      setLider(false);
      void locks
        .request(`revisai-sincronia-${oficinaId}`, () =>
          new Promise<void>((resolve) => {
            if (cancelado) return resolve();
            ligar();
            soltar = resolve;
          })
        )
        .catch(() => {
          // sem o cadeado (navegador antigo, modo restrito), esta aba sincroniza sozinha
          if (!cancelado) ligar();
        });
    } else ligar();
    return () => {
      cancelado = true;
      atual?.parar();
      soltar?.();
      if (motor.current === atual) motor.current = null;
    };
  }, [hidratado, oficinaId, contaOficinaId, banco, saindo]);

  // oficina recém-criada: depois da primeira busca, se o banco não tinha o cadastro, o aparelho
  // começa com o da conta (e ele sobe como config)
  useEffect(() => {
    if (!oficina || contaOficinaId !== oficina.id) return;
    const s = useOficina.getState();
    if (s.sinc.marca === null || s.oficina.nome) return;
    s.salvarOficina({ nome: oficina.nome, cidade: oficina.cidade ?? '', uf: oficina.uf ?? s.oficina.uf, whatsapp: oficina.whatsapp ?? '', endereco: oficina.endereco ?? '' });
  }, [oficina, contaOficinaId, ultimaEm]);

  const sincronizar = useCallback(() => motor.current?.agendar(0), []);

  const valor = useMemo<ValorSincronia>(() => {
    if (!oficina) return { estado: 'local', pendentes: 0, rejeitados: 0, ultimaEm: null, erro: null, sincronizar };
    if (!lider) return { estado: 'outra-aba', pendentes, rejeitados, ultimaEm, erro: null, sincronizar };
    return { estado: info.estado, pendentes, rejeitados, ultimaEm, erro: info.erro, sincronizar };
  }, [oficina, lider, info, pendentes, rejeitados, ultimaEm, sincronizar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {pergunta && oficina ? <PerguntaDosDados pergunta={pergunta} oficina={oficina.nome} oficinaId={oficina.id} aoTerminar={() => setPergunta(null)} /> : null}
    </Contexto.Provider>
  );
}

function PerguntaDosDados({ pergunta, oficina, oficinaId, aoTerminar }: { pergunta: NonNullable<Pergunta>; oficina: string; oficinaId: string; aoTerminar: () => void }) {
  const { banco } = useConta();
  const resumo = useMemo(() => resumoLocal(useOficina.getState()), []);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (pergunta.tipo === 'levar') {
    const partes = [
      resumo.clientes ? plural(resumo.clientes, 'cliente', 'clientes') : null,
      resumo.carros ? plural(resumo.carros, 'carro', 'carros') : null,
      resumo.servicos ? plural(resumo.servicos, 'serviço', 'serviços') : null,
      resumo.documentos ? plural(resumo.documentos, 'orçamento ou ordem', 'orçamentos e ordens') : null,
      resumo.estoque ? plural(resumo.estoque, 'item de estoque', 'itens de estoque') : null
    ].filter(Boolean);
    return (
      <Folha
        aberta
        aoFechar={() => {}}
        titulo={`Levar os dados deste aparelho para ${oficina}?`}
        descricao={partes.length ? `Este aparelho tem ${partes.join(', ')} de antes da conta.` : 'Este aparelho tem dados de antes da conta.'}
        rodape={
          <div className="flex flex-wrap justify-end gap-2">
            <Botao
              variante="fantasma"
              onClick={() => {
                if (!window.confirm('O que está neste aparelho sai daqui e fica só o que já está na conta. Continuar?')) return;
                useOficina.getState().vincularConta(oficinaId, false);
                aoTerminar();
              }}
            >
              Não, usar só o da conta
            </Botao>
            <Botao
              variante="escuro"
              onClick={() => {
                useOficina.getState().vincularConta(oficinaId, true);
                aoTerminar();
              }}
            >
              Levar para a conta
            </Botao>
          </div>
        }
      >
        <p className="text-[15px] text-tinta-2">
          Levando, tudo sobe para a nuvem e aparece nos outros aparelhos da oficina. Se a oficina já tinha clientes na conta, os dois se juntam (pode ficar algum cliente repetido para apagar depois). Os clientes de exemplo ficam só neste aparelho.
        </p>
      </Folha>
    );
  }

  return (
    <Folha
      aberta
      aoFechar={() => {}}
      titulo="Este aparelho tem dados de outra oficina"
      descricao={`São ${plural(pergunta.pendentes, 'mudança', 'mudanças')} que ainda não subiram para a outra oficina.`}
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Botao
            variante="perigo"
            disabled={ocupado}
            onClick={() => {
              if (!window.confirm('As mudanças que não subiram se perdem. Continuar?')) return;
              useOficina.getState().esquecerConta();
              useOficina.getState().vincularConta(oficinaId, false);
              aoTerminar();
            }}
          >
            Descartar e abrir {oficina}
          </Botao>
          <Botao
            variante="escuro"
            disabled={ocupado}
            onClick={async () => {
              const sb = banco();
              if (!sb) return;
              setOcupado(true);
              setErro(null);
              const m = new MotorDeSincronia(sb, pergunta.de, () => {});
              const ok = await m.enviarPendentes();
              m.parar();
              setOcupado(false);
              if (!ok) return setErro('Não deu para enviar: você pode não ser mais dessa oficina, ou a internet caiu.');
              useOficina.getState().esquecerConta();
              useOficina.getState().vincularConta(oficinaId, false);
              aoTerminar();
            }}
          >
            {ocupado ? 'Enviando…' : 'Enviar e abrir'}
          </Botao>
        </div>
      }
    >
      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : (
        <p className="text-[15px] text-tinta-2">Enviando, as mudanças vão para a outra oficina antes de abrir esta.</p>
      )}
    </Folha>
  );
}

/** O estado da nuvem no canto do app: em dia, salvando, sem internet, guardado só aqui. */
export function IndicadorDaSincronia({ compacto = false }: { compacto?: boolean }) {
  const { estado, pendentes, rejeitados } = useSincronia();
  // para quem usa leitor de tela: só os problemas são anunciados (o "salvando" muda o tempo todo)
  const aviso =
    estado === 'sem-internet'
      ? 'Sem internet. O que você fizer fica guardado neste aparelho e sobe quando a internet voltar.'
      : estado === 'sem-sessao'
        ? 'Sua sessão terminou. Entre de novo para salvar na nuvem.'
        : estado === 'erro' || estado === 'sem-permissao' || estado === 'limite'
          ? 'Os dados não estão subindo para a nuvem.'
          : rejeitados > 0 && pendentes === 0
            ? 'Alguns itens não subiram para a nuvem.'
            : '';
  return (
    <>
      <ConteudoDoIndicador compacto={compacto} />
      <span className="sr-only" aria-live="polite">
        {aviso}
      </span>
    </>
  );
}

function ConteudoDoIndicador({ compacto }: { compacto: boolean }) {
  const { estado, pendentes, rejeitados, ultimaEm, erro, sincronizar } = useSincronia();
  const titulo = ultimaEm ? `Última vez em dia: ${formatarDiaHora(ultimaEm)}` : undefined;
  const classe = 'flex items-center gap-2 text-[13px] font-semibold';
  if (estado === 'local')
    return (
      <Link href="/entrar?para=/oficina" className={`${classe} text-oleo-tinta hover:underline`}>
        <CloudOff size={15} aria-hidden="true" /> {compacto ? 'Só neste aparelho' : 'Só neste aparelho · Entrar'}
      </Link>
    );
  if (estado === 'sem-sessao')
    return (
      <Link href="/entrar?para=/oficina&motivo=sessao" className={`${classe} text-atraso hover:underline`}>
        <TriangleAlert size={15} aria-hidden="true" /> {pendentes ? `Entre de novo para salvar ${pendentes}` : 'Entre de novo para salvar'}
      </Link>
    );
  if (estado === 'sem-internet')
    return (
      <span className={`${classe} text-oleo-tinta`} title={titulo ?? 'Fica guardado neste aparelho e sobe quando a internet voltar.'}>
        <CloudOff size={15} aria-hidden="true" /> Sem internet{pendentes ? ` · ${pendentes} para subir` : ''}
      </span>
    );
  if (estado === 'limite' || estado === 'sem-permissao' || estado === 'erro')
    return (
      <button type="button" onClick={sincronizar} className={`${classe} text-atraso`} title={erro ?? titulo}>
        <TriangleAlert size={15} aria-hidden="true" />
        {estado === 'limite' ? 'Limite de dados da oficina' : estado === 'sem-permissao' ? 'Sem acesso a esta oficina' : compacto ? 'Não salvou · tentar' : 'Não salvou na nuvem · tentar de novo'}
      </button>
    );
  if (rejeitados > 0 && pendentes === 0)
    return (
      <button type="button" onClick={sincronizar} className={`${classe} text-oleo-tinta`} title="Grandes demais ou fora do formato. Edite o item para tentar de novo.">
        <TriangleAlert size={15} aria-hidden="true" /> {plural(rejeitados, 'item não subiu', 'itens não subiram')}
      </button>
    );
  if (estado === 'sincronizando' || estado === 'iniciando' || pendentes > 0)
    return (
      <span className={`${classe} text-tinta-2`} title={titulo}>
        <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Salvando{pendentes ? ` · ${pendentes}` : ''}
      </span>
    );
  if (estado === 'outra-aba')
    return (
      <span className={`${classe} text-ok`} title="Outra aba do Revisaí neste aparelho está cuidando da nuvem.">
        <Cloud size={15} aria-hidden="true" /> Salvo na nuvem
      </span>
    );
  return (
    <button type="button" onClick={sincronizar} className={`${classe} text-ok`} title={titulo} aria-label="Salvo na nuvem. Tocar para conferir agora">
      <Cloud size={15} aria-hidden="true" /> Salvo na nuvem
      {compacto ? null : <RefreshCw size={12} className="opacity-60" aria-hidden="true" />}
    </button>
  );
}
