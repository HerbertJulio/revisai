'use client';

// Sair da conta neste aparelho: antes, sobe o que ainda não subiu e tira do aparelho a cópia
// dos dados da oficina (outra pessoa pode usar o mesmo computador). Na próxima entrada, os dados
// voltam do banco.

import { MotorDeSincronia } from '@/components/oficina/sincronia/motor';
import { plural } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';

let saindo = false;

/** Está saindo da conta: a tela não liga os dados do aparelho de novo enquanto isso. */
export function saindoDaConta(): boolean {
  return saindo;
}

/**
 * Devolve false se a pessoa preferiu não sair (ficaram mudanças sem subir). `confirmar` é a
 * pergunta da tela (window.confirm por padrão).
 */
export async function prepararSaida(config: ConfigPublica | null, confirmar: (texto: string) => boolean = (t) => window.confirm(t)): Promise<boolean> {
  const s = useOficina.getState();
  saindo = true;
  if (!s.contaOficinaId) return true;
  const pendentes = Object.keys(s.sinc.pendentes).length;
  if (pendentes) {
    let ok = false;
    if (config && navigator.onLine !== false) {
      const motor = new MotorDeSincronia(clienteNavegador(config), s.contaOficinaId, () => {});
      ok = await motor.enviarPendentes();
      motor.parar();
    }
    if (!ok) {
      const resto = Object.keys(useOficina.getState().sinc.pendentes).length || pendentes;
      const texto = `${plural(resto, 'mudança deste aparelho ainda não subiu', 'mudanças deste aparelho ainda não subiram')} para a nuvem. Se sair agora, ${resto === 1 ? 'ela se perde' : 'elas se perdem'}. Sair mesmo assim?`;
      if (!confirmar(texto)) {
        saindo = false;
        return false;
      }
    }
  }
  useOficina.getState().esquecerConta();
  return true;
}
