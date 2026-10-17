'use client';

// Os mecânicos e ajudantes da oficina: aparecem na agenda e nas ordens. A comissão (sobre a mão de
// obra e sobre as peças) só o dono e o gerente veem e mudam.

import { MessageCircle, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { formatarNumero, formatarTelefone, lerNumero, normalizarTelefone } from '@/lib/formatos';
import type { Profissional } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useGestao, useProfissionais } from './comum';

export function Profissionais() {
  const lista = useProfissionais();
  const gestao = useGestao();
  const [aberto, setAberto] = useState<Id | 'novo' | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-[14.5px] text-tinta-2">Quem trabalha na oficina. Escolha o profissional ao marcar um horário{gestao ? '; a comissão de cada um fica guardada aqui' : ''}.</p>
        <Botao variante="primario" onClick={() => setAberto('novo')}>
          <UserPlus size={18} aria-hidden="true" /> Profissional
        </Botao>
      </div>
      {lista.length ? (
        <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha" aria-label="Profissionais">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={() => setAberto(p.id)}>
                <span className="flex items-center gap-2 font-bold">
                  {p.nome} {p.ativo ? null : <Chip>Inativo</Chip>}
                </span>
                <span className="text-[13.5px] text-tinta-3">
                  {[p.telefone ? formatarTelefone(p.telefone) : '', gestao ? `comissão ${formatarNumero(p.comissaoServicos, 2)}% na mão de obra, ${formatarNumero(p.comissaoPecas, 2)}% nas peças` : ''].filter(Boolean).join(' · ') || 'Sem telefone'}
                </span>
              </button>
              {p.telefone && linkWhatsApp(p.telefone, '') ? (
                <a href={linkWhatsApp(p.telefone, '')!} target="_blank" rel="noopener noreferrer" className={classeBotao('fantasma', 'pequeno')} aria-label={`WhatsApp de ${p.nome}`}>
                  <MessageCircle size={16} aria-hidden="true" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo="Nenhum profissional ainda" acao={<Botao onClick={() => setAberto('novo')}>Cadastrar o primeiro</Botao>}>
          Cadastre os mecânicos para dividir a agenda e saber quem fez cada serviço.
        </Vazio>
      )}
      <FolhaProfissional id={aberto} aoFechar={() => setAberto(null)} />
    </div>
  );
}

function FolhaProfissional({ id, aoFechar }: { id: Id | 'novo' | null; aoFechar: () => void }) {
  const atual = useOficina((s) => (id && id !== 'novo' ? s.profissionais[id] : undefined));
  return (
    <Folha aberta={!!id} aoFechar={aoFechar} titulo={atual ? atual.nome : 'Profissional novo'}>
      {id ? <Formulario key={id} atual={atual} aoFechar={aoFechar} /> : null}
    </Folha>
  );
}

function percentual(texto: string): number | null {
  const n = lerNumero(texto.replace('%', ''));
  return n != null && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}

function Formulario({ atual, aoFechar }: { atual: Profissional | undefined; aoFechar: () => void }) {
  const gestao = useGestao();
  const toast = useToast();
  const [nome, setNome] = useState(atual?.nome ?? '');
  const [telefone, setTelefone] = useState(atual?.telefone ?? '');
  const [ativo, setAtivo] = useState(atual?.ativo ?? true);
  const [servicos, setServicos] = useState(atual ? formatarNumero(atual.comissaoServicos, 2) : '0');
  const [pecas, setPecas] = useState(atual ? formatarNumero(atual.comissaoPecas, 2) : '0');
  const [erros, setErros] = useState<Record<string, string>>({});

  function salvar() {
    const e: Record<string, string> = {};
    if (nome.trim().length < 2) e.nome = 'Escreva o nome.';
    if (telefone.trim() && !normalizarTelefone(telefone)) e.telefone = 'Confira o telefone, com DDD.';
    const cs = gestao ? percentual(servicos) : (atual?.comissaoServicos ?? 0);
    const cp = gestao ? percentual(pecas) : (atual?.comissaoPecas ?? 0);
    if (cs == null) e.servicos = 'De 0 a 100.';
    if (cp == null) e.pecas = 'De 0 a 100.';
    setErros(e);
    if (Object.keys(e).length || cs == null || cp == null) return;
    useOficina.getState().salvarRegistro('profissionais', {
      id: atual?.id,
      nome: nome.trim().replace(/\s+/g, ' '),
      telefone: normalizarTelefone(telefone) ?? undefined,
      // o mecânico não vê a comissão: mantém a que já estava
      comissaoServicos: cs,
      comissaoPecas: cp,
      ativo
    });
    toast({ texto: atual ? 'Profissional salvo.' : `${nome.trim()} entrou na equipe.` });
    aoFechar();
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Nome" htmlFor="prof-nome" erro={erros.nome}>
        <input id="prof-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="off" />
      </Campo>
      <Campo rotulo="Telefone" htmlFor="prof-tel" erro={erros.telefone} dica="Opcional.">
        <input id="prof-tel" type="tel" inputMode="tel" className={classeEntrada} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 98765-4321" />
      </Campo>
      {gestao ? (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Comissão na mão de obra (%)" htmlFor="prof-cs" erro={erros.servicos}>
            <input id="prof-cs" inputMode="decimal" className={classeEntrada} value={servicos} onChange={(e) => setServicos(e.target.value)} />
          </Campo>
          <Campo rotulo="Comissão nas peças (%)" htmlFor="prof-cp" erro={erros.pecas}>
            <input id="prof-cp" inputMode="decimal" className={classeEntrada} value={pecas} onChange={(e) => setPecas(e.target.value)} />
          </Campo>
        </div>
      ) : null}
      <Alternar id="prof-ativo" ligado={ativo} aoMudar={setAtivo} rotulo="Ativo" descricao="Inativo não aparece para escolher na agenda." />
      <div className="flex justify-end gap-2 border-t border-linha pt-4">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </div>
  );
}
