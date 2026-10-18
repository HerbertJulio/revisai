'use client';

// O formulário da página pública: a pessoa escolhe o estado e a cidade e digita os números da
// oficina. Só o estado e a cidade vão para o servidor; a comparação é feita aqui no aparelho e
// nada é guardado.

import { ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { LegendaDaRegua, LinhaDoComparativo } from '@/components/oficina/relatorios/Regua';
import { Botao, Campo, classeBotao, classeEntrada } from '@/components/ui';
import { METRICAS, type Metrica } from '@/lib/comparativo';
import { lerNumero } from '@/lib/formatos';
import { UFS } from '@/lib/padroes';
import { consultarComparativo, type RespostaComparativo } from './acoes';

const CAMPOS: { id: Metrica; rotulo: string; dica: string; placeholder: string }[] = [
  { id: 'ticket', rotulo: 'Ticket médio (R$)', dica: 'Quanto fica, em média, cada ordem de serviço.', placeholder: 'Ex.: 380' },
  { id: 'trocaOleo', rotulo: 'Troca de óleo (R$)', dica: 'Óleo e mão de obra de uma troca comum.', placeholder: 'Ex.: 190' },
  { id: 'carrosMes', rotulo: 'Carros por mês', dica: 'Carros diferentes que você atende num mês.', placeholder: 'Ex.: 40' },
  { id: 'aprovacao', rotulo: 'Orçamentos aprovados (%)', dica: 'Opcional. De cada 100 orçamentos, quantos o cliente aprova.', placeholder: 'Ex.: 60' }
];

export function FormComparativo() {
  const [uf, setUf] = useState('RJ');
  const [cidade, setCidade] = useState('');
  const [numeros, setNumeros] = useState<Record<Metrica, string>>({ ticket: '', trocaOleo: '', carrosMes: '', aprovacao: '' });
  const [resposta, setResposta] = useState<{ r: RespostaComparativo; uf: string; cidade: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  const valor = (m: Metrica): number | null => {
    const v = lerNumero(numeros[m].replace(/r\$|%/gi, ''));
    return v != null && v >= 0 ? v : null;
  };

  function consultar(e: React.FormEvent) {
    e.preventDefault();
    const pedido = { uf, cidade: cidade.trim() };
    iniciar(async () => {
      try {
        setResposta({ r: await consultarComparativo(pedido), ...pedido });
      } catch {
        setResposta({ r: { ok: false, erro: 'Não deu para falar com o servidor. Confira a internet e tente de novo.' }, ...pedido });
      }
    });
  }

  const r = resposta?.r;
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={consultar} className="flex flex-col gap-4 rounded-[22px] bg-papel p-5 ring-1 ring-linha sm:p-7">
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <Campo rotulo="Cidade da oficina" htmlFor="cmp-cidade">
            <input id="cmp-cidade" className={classeEntrada} value={cidade} onChange={(e) => setCidade(e.target.value)} autoComplete="address-level2" maxLength={80} placeholder="Ex.: Guapimirim" />
          </Campo>
          <Campo rotulo="UF" htmlFor="cmp-uf">
            <select id="cmp-uf" className={classeEntrada} value={uf} onChange={(e) => setUf(e.target.value)}>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAMPOS.map((c) => (
            <Campo key={c.id} rotulo={c.rotulo} htmlFor={`cmp-${c.id}`} dica={c.dica}>
              <input
                id={`cmp-${c.id}`}
                className={`${classeEntrada} num`}
                value={numeros[c.id]}
                onChange={(e) => setNumeros({ ...numeros, [c.id]: e.target.value })}
                inputMode="decimal"
                placeholder={c.placeholder}
                autoComplete="off"
              />
            </Campo>
          ))}
        </div>
        <p className="text-[13.5px] text-tinta-3">Os seus números não saem deste aparelho: só a cidade e o estado vão para a consulta, e nada fica guardado.</p>
        <Botao type="submit" variante="primario" tamanho="grande" disabled={enviando} className="self-start">
          {enviando ? 'Comparando…' : 'Comparar com a região'} <ArrowRight size={18} aria-hidden="true" />
        </Botao>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {r && !r.ok ? (
          <p className="rounded-2xl bg-atraso-claro px-4 py-3 text-[14.5px] text-atraso" role="alert">
            {r.erro}
          </p>
        ) : null}
        {r && r.ok && !r.dados ? (
          <div className="flex flex-col items-start gap-3 rounded-[22px] border border-dashed border-linha px-5 py-6">
            <p className="meio-largo text-lg font-bold">Ainda não dá para comparar em {resposta?.uf}</p>
            <p className="text-tinta-2">Para ninguém ser exposto, a faixa só aparece com 5 oficinas ou mais com conta no Revisaí na cidade ou no estado. Crie a sua conta grátis e chame as oficinas parceiras: assim que juntar 5, a média aparece aqui e no seu relatório.</p>
            <Link href="/entrar?para=/oficina" className={classeBotao('escuro')}>
              Criar a conta grátis
            </Link>
          </div>
        ) : null}
        {r && r.ok && r.dados ? (
          <>
            <p className="flex items-center gap-2 font-semibold">
              <MapPin size={17} aria-hidden="true" />
              {r.dados.nivel === 'cidade'
                ? `${resposta?.cidade}, ${r.dados.uf}: ${r.dados.oficinas} ou mais oficinas com conta`
                : `Estado de ${r.dados.uf}: ${r.dados.oficinas} ou mais oficinas com conta${resposta?.cidade ? ' (a cidade ainda não tem 5)' : ''}`}
            </p>
            <LegendaDaRegua rotuloDoValor="Sua oficina" />
            <div className="grid gap-3">
              {METRICAS.map((m) => (
                <LinhaDoComparativo key={m.id} metrica={m.id} valor={valor(m.id)} faixa={r.dados![m.id]} rotuloDoValor="Sua oficina" />
              ))}
            </div>
            <div className="flex flex-col items-start gap-3 rounded-[22px] bg-asfalto px-5 py-6 text-white sm:px-7">
              <p className="meio-largo text-[19px] font-bold">Quer isso sozinho, todo mês?</p>
              <p className="text-white/80">Com a conta grátis, o Revisaí calcula os seus números pelas ordens de serviço e mostra a comparação no relatório, junto com o faturamento, a margem das peças e o fiado.</p>
              <Link href="/entrar?para=/oficina/relatorios" className={classeBotao('primario', 'grande')}>
                Criar a conta grátis
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
