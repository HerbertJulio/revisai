'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { montarGrupos, resumir } from './avisos';
import { hojeISO } from './datas';
import { aoHidratar, jaHidratou, useOficina } from './store';

/**
 * true depois que os dados guardados no aparelho foram carregados pela primeira vez. Recarregar
 * depois (outra aba gravou, o app voltou para a frente) não volta para "carregando", e um erro
 * na leitura também libera a tela (o app avisa do problema em vez de ficar parado).
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const a = aoHidratar(avisar);
      const b = useOficina.persist.onFinishHydration(avisar);
      return () => {
        a();
        b();
      };
    },
    () => jaHidratou(),
    () => false
  );
}

/** A data de hoje, que vira sozinha à meia-noite. */
export function useHoje(): string {
  const [hoje, setHoje] = useState(() => hojeISO());
  useEffect(() => {
    const t = setInterval(() => {
      const agora = hojeISO();
      setHoje((h) => (h === agora ? h : agora));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return hoje;
}

export function useDadosAvisos() {
  const clientes = useOficina((s) => s.clientes);
  const veiculos = useOficina((s) => s.veiculos);
  const atendimentos = useOficina((s) => s.atendimentos);
  const leituras = useOficina((s) => s.leituras);
  const contatos = useOficina((s) => s.contatos);
  const preferencias = useOficina((s) => s.preferencias);
  return useMemo(
    () => ({ clientes, veiculos, atendimentos, leituras, contatos, preferencias }),
    [clientes, veiculos, atendimentos, leituras, contatos, preferencias]
  );
}

export function useGrupos(horizonteDias = 60) {
  const dados = useDadosAvisos();
  const hoje = useHoje();
  return useMemo(() => {
    const grupos = montarGrupos(dados, hoje, horizonteDias);
    return { grupos, resumo: resumir(grupos, hoje), hoje };
  }, [dados, hoje, horizonteDias]);
}
