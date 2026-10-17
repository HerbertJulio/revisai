'use client';

import { BadgeCheck, BellPlus, CalendarPlus, Power, Star } from 'lucide-react';
import { useState, useTransition } from 'react';
import { darProNaOficina, estenderTesteDaOficina, mudarAtivaDaOficina, mudarFundadorDaOficina } from '@/app/admin/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { PACOTES_ALERTAS } from '@/lib/alertas-dados';
import { formatarData } from '@/lib/datas';
import { lerNumero } from '@/lib/formatos';
import { PRO } from '@/lib/plano';
import { MESES_PRO, valorSugerido } from '@/lib/pro-dados';
import { AvisoErro } from './comum';
import { FolhaLiberar } from './ProAdmin';

const DIAS_DE_TESTE = [7, 15, 30] as const;

function valorTexto(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** O que o financeiro faz no plano de uma oficina. */
export function OficinaAcoes({
  oficina
}: {
  oficina: { id: string; nome: string; fundador: boolean; ativa: boolean; proAte: string | null; testeAte: string | null };
}) {
  const toast = useToast();
  const [aberta, setAberta] = useState<'pro' | 'teste' | null>(null);
  const [liberar, setLiberar] = useState(false);
  const [meses, setMeses] = useState<number>(1);
  const [valor, setValor] = useState(valorTexto(valorSugerido(1, oficina.fundador)));
  const [observacao, setObservacao] = useState('');
  const [dias, setDias] = useState<number>(15);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function abrirPro() {
    setErro(null);
    setMeses(1);
    setValor(valorTexto(valorSugerido(1, oficina.fundador)));
    setObservacao('');
    setAberta('pro');
  }

  function darPro() {
    setErro(null);
    const v = valor.trim() ? lerNumero(valor) : null;
    if (valor.trim() && (v == null || v < 0)) return setErro('Confira o valor recebido.');
    iniciar(async () => {
      try {
        const r = await darProNaOficina(oficina.id, meses, v, observacao);
        if (!r.ok) return setErro(r.erro);
        toast({ texto: `Pro da ${oficina.nome} vale até ${formatarData(r.ate)}.` });
        setAberta(null);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function estenderTeste() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await estenderTesteDaOficina(oficina.id, dias);
        if (!r.ok) return setErro(r.erro);
        toast({ texto: `Teste da ${oficina.nome} vai até ${formatarData(r.ate)}.` });
        setAberta(null);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function alternar(o: 'fundador' | 'ativa') {
    const pergunta =
      o === 'fundador'
        ? oficina.fundador
          ? `Tirar a ${oficina.nome} das fundadoras? O preço dela volta a ser o cheio nas contas.`
          : `Marcar a ${oficina.nome} como fundadora (preço de ${valorTexto(PRO.precoFundador)} por mês)?`
        : oficina.ativa
          ? `Desativar a ${oficina.nome}? Ninguém dela consegue usar o app até a equipe reativar.`
          : `Reativar a ${oficina.nome}?`;
    if (!window.confirm(pergunta)) return;
    iniciar(async () => {
      try {
        const r = o === 'fundador' ? await mudarFundadorDaOficina(oficina.id, !oficina.fundador) : await mudarAtivaDaOficina(oficina.id, !oficina.ativa);
        toast(r.ok ? { texto: 'Pronto.' } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Botao tamanho="pequeno" variante="escuro" onClick={abrirPro} disabled={ocupado}>
        <BadgeCheck size={15} /> Dar ou estender o Pro
      </Botao>
      <Botao
        tamanho="pequeno"
        onClick={() => {
          setErro(null);
          setDias(15);
          setAberta('teste');
        }}
        disabled={ocupado}
      >
        <CalendarPlus size={15} /> Estender o teste
      </Botao>
      <Botao tamanho="pequeno" onClick={() => setLiberar(true)} disabled={ocupado}>
        <BellPlus size={15} /> Liberar alertas extras
      </Botao>
      <Botao tamanho="pequeno" onClick={() => alternar('fundador')} disabled={ocupado}>
        <Star size={15} /> {oficina.fundador ? 'Tirar das fundadoras' : 'Marcar como fundadora'}
      </Botao>
      <Botao tamanho="pequeno" variante={oficina.ativa ? 'perigo' : 'secundario'} onClick={() => alternar('ativa')} disabled={ocupado}>
        <Power size={15} /> {oficina.ativa ? 'Desativar' : 'Reativar'}
      </Botao>

      <Folha
        aberta={aberta === 'pro'}
        aoFechar={() => setAberta(null)}
        titulo="Dar ou estender o Pro"
        descricao={`Conta a partir do fim do Pro atual${oficina.proAte ? ` (${formatarData(oficina.proAte)})` : ''}, ou de hoje se ele já venceu. Fica registrado como assinatura da oficina.`}
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setAberta(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={darPro} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Dar o Pro'}
            </Botao>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <p className="mb-2 text-[14px] font-semibold">Meses</p>
            <div className="flex flex-wrap gap-2">
              {MESES_PRO.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={meses === m}
                  onClick={() => {
                    setMeses(m);
                    setValor(valorTexto(valorSugerido(m, oficina.fundador)));
                  }}
                  className={`num h-10 rounded-full border px-4 text-[14px] font-semibold ${meses === m ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
                >
                  {m === 1 ? '1 mês' : `${m} meses`}
                </button>
              ))}
            </div>
          </div>
          <Campo rotulo="Valor recebido (R$)" htmlFor="op-valor" className="sm:col-span-2" dica="Em branco quando for cortesia.">
            <input id="op-valor" className={classeEntrada} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
          </Campo>
          <Campo rotulo="Observação interna" htmlFor="op-obs" className="sm:col-span-4" dica="Ex.: pagou por Pix em 16/10, ou cortesia pelo problema do dia 10.">
            <input id="op-obs" className={classeEntrada} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} />
          </Campo>
          {erro ? (
            <div className="sm:col-span-6">
              <AvisoErro>{erro}</AvisoErro>
            </div>
          ) : null}
        </div>
      </Folha>

      <Folha
        aberta={aberta === 'teste'}
        aoFechar={() => setAberta(null)}
        titulo="Estender o teste do Pro"
        descricao={`Conta a partir do fim do teste atual${oficina.testeAte ? ` (${formatarData(oficina.testeAte)})` : ''}, ou de hoje.`}
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setAberta(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={estenderTeste} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Estender'}
            </Botao>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {DIAS_DE_TESTE.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dias === d}
                onClick={() => setDias(d)}
                className={`num h-10 rounded-full border px-4 text-[14px] font-semibold ${dias === d ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
              >
                Mais {d} dias
              </button>
            ))}
          </div>
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        </div>
      </Folha>

      <FolhaLiberar
        pedido={liberar ? { oficinaId: oficina.id, oficina: oficina.nome, quantidade: PACOTES_ALERTAS[0].quantidade, valor: valorTexto(PACOTES_ALERTAS[0].preco), cadastroId: null } : null}
        aoFechar={() => setLiberar(false)}
      />
    </div>
  );
}
