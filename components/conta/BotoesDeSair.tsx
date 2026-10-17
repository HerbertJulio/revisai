'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { sair, sairDeTodos } from '@/app/conta/acoes';
import { Botao } from '@/components/ui';
import type { ConfigPublica } from '@/lib/supabase-navegador';
import { desistirDeSair, ehRedirecionamento, prepararSaida } from './sair';

/**
 * Sair neste aparelho ou em todos. Antes, sobe o que ainda não subiu e tira deste aparelho a
 * cópia dos dados da oficina (na próxima entrada, eles voltam da nuvem).
 */
export function BotoesDeSair({ config, compacto = false }: { config: ConfigPublica | null; compacto?: boolean }) {
  const [ocupado, setOcupado] = useState<'aqui' | 'todos' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function sairDaConta(todos: boolean) {
    setErro(null);
    setOcupado(todos ? 'todos' : 'aqui');
    if (!(await prepararSaida(config))) {
      setOcupado(null);
      return;
    }
    try {
      // a ação termina mandando para a página inicial
      await (todos ? sairDeTodos() : sair());
    } catch (e) {
      if (ehRedirecionamento(e)) return;
      desistirDeSair();
      setOcupado(null);
      setErro('Não deu para sair agora. Confira a internet e tente de novo.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap gap-2 ${compacto ? 'flex-col items-stretch' : ''}`}>
        <Botao variante="secundario" tamanho="pequeno" disabled={!!ocupado} onClick={() => void sairDaConta(false)}>
          <LogOut size={15} aria-hidden="true" /> {ocupado === 'aqui' ? 'Saindo…' : 'Sair'}
        </Botao>
        <Botao variante="fantasma" tamanho="pequeno" disabled={!!ocupado} onClick={() => void sairDaConta(true)}>
          {ocupado === 'todos' ? 'Saindo…' : 'Sair de todos os aparelhos'}
        </Botao>
      </div>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
