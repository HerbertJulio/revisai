'use client';

// O crédito que a loja dá a cada oficina que já comprou dela: limite (quanto pode ficar em aberto),
// prazo (dias depois da entrega) e ligado ou não. A oficina escolhe "faturado" no pedido e o banco
// confere o limite. O risco é da loja; só o dono mexe.

import { HandCoins } from 'lucide-react';
import { useState, useTransition } from 'react';
import { salvarCreditoDaOficina } from '@/app/fornecedor/acoes';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Vazio, classeEntrada } from '@/components/ui';
import { formatarMoeda, lerNumero } from '@/lib/formatos';
import { combina, paraBusca, quandoFoi } from '@/lib/loja/comum';
import { AVISO_DO_RISCO, livreNoCredito, PRAZOS_DE_CREDITO, type ClienteComCredito } from '@/lib/loja/credito-dados';
import { AvisoErro, CampoBusca, Filtro, LinhaDeFiltros } from './comum';

type FiltroCredito = 'todos' | 'com' | 'sem';

export function CreditoDosClientes({ clientes, dono }: { clientes: ClienteComCredito[]; dono: boolean }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroCredito>(clientes.some((c) => c.credito) ? 'com' : 'todos');
  const [aberto, setAberto] = useState<ClienteComCredito | null>(null);
  const agora = Date.now();
  const com = clientes.filter((c) => c.credito);
  const visiveis = clientes.filter(
    (c) => (filtro === 'todos' || (filtro === 'com' ? c.credito : !c.credito)) && (!busca.trim() || combina(paraBusca(c.nome, c.cidade, c.uf), busca))
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-2xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta sm:px-5">{AVISO_DO_RISCO}</p>
      {!dono ? <p className="text-[14px] text-tinta-3">Só o dono da loja dá ou muda crédito. Você vê como está.</p> : null}
      {!clientes.length ? (
        <Vazio titulo="Nenhuma oficina comprou ainda">O crédito é para quem já comprou da loja. Quando uma oficina fizer o primeiro pedido, ela aparece aqui.</Vazio>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <LinhaDeFiltros rotulo="Filtrar clientes">
              <Filtro ativo={filtro === 'com'} aoClicar={() => setFiltro('com')} n={com.length}>
                Com crédito
              </Filtro>
              <Filtro ativo={filtro === 'sem'} aoClicar={() => setFiltro('sem')} n={clientes.length - com.length}>
                Sem crédito
              </Filtro>
              <Filtro ativo={filtro === 'todos'} aoClicar={() => setFiltro('todos')} n={clientes.length}>
                Todos
              </Filtro>
            </LinhaDeFiltros>
            {clientes.length > 8 ? <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar oficina" dica="Nome ou cidade" /> : null}
          </div>
          {visiveis.length ? (
            <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
              {visiveis.map((c) => (
                <li key={c.oficinaId} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{c.nome}</p>
                    <p className="text-[13.5px] text-tinta-3">
                      {[[c.cidade, c.uf].filter(Boolean).join(', '), `${c.pedidos} ${c.pedidos === 1 ? 'pedido' : 'pedidos'}, ${formatarMoeda(c.total)}`, `último ${quandoFoi(c.ultimo, agora)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {c.credito ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.credito.ativo ? <Chip tom="ok">Faturado ligado</Chip> : <Chip>Faturado desligado</Chip>}
                        <Chip tom="caneta">Limite {formatarMoeda(c.credito.limite)}</Chip>
                        <Chip>{c.credito.prazoDias} dias depois da entrega</Chip>
                        <Chip tom={c.aberto > 0 ? 'oleo' : 'neutro'}>
                          Em uso {formatarMoeda(c.aberto)}, livre {formatarMoeda(livreNoCredito(c))}
                        </Chip>
                        {c.vencido > 0 ? <Chip tom="atraso">Vencido {formatarMoeda(c.vencido)}</Chip> : null}
                      </div>
                    ) : null}
                  </div>
                  {dono ? (
                    <Botao tamanho="pequeno" onClick={() => setAberto(c)}>
                      <HandCoins size={15} aria-hidden="true" /> {c.credito ? 'Mudar o crédito' : 'Dar crédito'}
                    </Botao>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhuma oficina aqui">Tente outro filtro ou outra palavra.</Vazio>
          )}
        </>
      )}
      <Folha
        aberta={aberto != null}
        aoFechar={() => setAberto(null)}
        titulo={aberto ? `Crédito para ${aberto.nome}` : 'Crédito'}
        descricao="A oficina escolhe faturado no pedido. Vale enquanto o que ela tem em aberto com a loja, mais a compra nova, couber no limite."
      >
        {aberto ? <FormCredito key={aberto.oficinaId} cliente={aberto} aoSalvar={() => setAberto(null)} /> : null}
      </Folha>
    </div>
  );
}

function FormCredito({ cliente, aoSalvar }: { cliente: ClienteComCredito; aoSalvar: () => void }) {
  const toast = useToast();
  const [limite, setLimite] = useState(cliente.credito ? String(cliente.credito.limite).replace('.', ',') : '');
  const [prazo, setPrazo] = useState<number>(cliente.credito?.prazoDias ?? 28);
  const [ativo, setAtivo] = useState(cliente.credito?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const prazos: number[] = [...PRAZOS_DE_CREDITO];
  if (!prazos.includes(prazo)) prazos.push(prazo);

  function salvar() {
    setErro(null);
    const valor = lerNumero(limite);
    if (!valor || valor <= 0) return setErro('Informe o limite, como 2.000.');
    iniciar(async () => {
      try {
        const r = await salvarCreditoDaOficina({ oficinaId: cliente.oficinaId, limite: valor, prazoDias: prazo, ativo });
        if (!r.ok) return setErro(r.erro);
        toast({ texto: ativo ? `Crédito de ${formatarMoeda(valor)} para ${cliente.nome}.` : `Faturado desligado para ${cliente.nome}.` });
        aoSalvar();
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Limite em aberto (R$)" htmlFor="cred-limite" dica="Quanto a oficina pode dever para a loja ao mesmo tempo.">
          <input id="cred-limite" className={`${classeEntrada} num`} value={limite} onChange={(e) => setLimite(e.target.value)} inputMode="decimal" placeholder="2.000" />
        </Campo>
        <Campo rotulo="Prazo para pagar" htmlFor="cred-prazo" dica="Contado da entrega do pedido.">
          <select id="cred-prazo" className={classeEntrada} value={prazo} onChange={(e) => setPrazo(Number(e.target.value))}>
            {prazos.map((d) => (
              <option key={d} value={d}>
                {d} dias depois da entrega
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Alternar id="cred-ativo" ligado={ativo} aoMudar={setAtivo} rotulo="Faturado ligado" descricao="Desligado, a oficina volta a pagar por Pix. As faturas em aberto continuam valendo." />
      {cliente.credito && cliente.aberto > 0 ? (
        <p className="text-[14px] text-tinta-2">
          Esta oficina tem {formatarMoeda(cliente.aberto)} em aberto com a loja
          {cliente.vencido > 0 ? `, ${formatarMoeda(cliente.vencido)} vencidos` : ''}.
        </p>
      ) : null}
      <div className="flex justify-end">
        <Botao variante="primario" onClick={salvar} disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar o crédito'}
        </Botao>
      </div>
    </div>
  );
}
