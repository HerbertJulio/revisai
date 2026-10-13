'use client';

import { ChevronRight, Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { Placa } from '@/components/pecas';
import { Botao, Vazio, classeEntrada } from '@/components/ui';
import { itensDoVeiculo } from '@/lib/avisos';
import { formatarTelefone, normalizarPlaca } from '@/lib/formatos';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { servico } from '@/lib/manutencao';
import { rotuloPrazo } from '@/lib/rotulos';
import { useOficina } from '@/lib/store';
import {
  CLIENTE_VAZIO,
  CamposCliente,
  CamposVeiculo,
  VEICULO_VAZIO,
  clienteDoRascunho,
  errosCliente,
  errosVeiculo,
  veiculoDoRascunho
} from './formularios';

export function Clientes() {
  const dados = useDadosAvisos();
  const hoje = useHoje();
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);

  const linhas = useMemo(() => {
    return Object.values(dados.veiculos)
      .map((v) => {
        const cliente = dados.clientes[v.clienteId];
        const { itens } = itensDoVeiculo(v, dados, hoje);
        return { v, cliente, proximo: itens[0] };
      })
      .sort((a, b) => (a.cliente?.nome ?? '').localeCompare(b.cliente?.nome ?? '', 'pt-BR'));
  }, [dados, hoje]);

  const t = busca.trim().toLowerCase();
  const placa = normalizarPlaca(t);
  const digitos = t.replace(/\D/g, '');
  const filtradas = t
    ? linhas.filter(
        ({ v, cliente }) =>
          (cliente?.nome.toLowerCase().includes(t) ?? false) ||
          (placa.length >= 2 && v.placa.includes(placa)) ||
          (digitos.length >= 4 && (cliente?.telefone.includes(digitos) ?? false)) ||
          `${v.marca} ${v.modelo}`.toLowerCase().includes(t)
      )
    : linhas;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Clientes</h1>
          <p className="mt-1 text-tinta-2">
            {Object.keys(dados.clientes).length} clientes, {linhas.length} carros
          </p>
        </div>
        <Botao variante="primario" onClick={() => setNovo(true)}>
          <UserPlus size={18} /> Cliente novo
        </Botao>
      </header>

      <div className="relative max-w-lg">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
        <input className={`${classeEntrada} pl-10`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Placa, nome, telefone ou modelo" aria-label="Buscar" />
      </div>

      {linhas.length === 0 ? (
        <Vazio titulo="Nenhum cliente ainda" acao={<Botao variante="primario" onClick={() => setNovo(true)}>Cadastrar o primeiro</Botao>}>
          Você também pode cadastrar na hora de registrar um serviço.
        </Vazio>
      ) : filtradas.length === 0 ? (
        <p className="text-tinta-2">Nada encontrado para “{busca}”.</p>
      ) : (
        <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {filtradas.map(({ v, cliente, proximo }) => {
            const p = proximo ? rotuloPrazo(proximo.venc, proximo.situacao) : null;
            const cor = proximo?.situacao === 'atrasado' ? 'text-atraso' : proximo?.situacao === 'avisar' ? 'text-oleo-tinta' : 'text-tinta-3';
            return (
              <li key={v.id}>
                <Link href={`/oficina/carro?id=${v.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-papel-2 sm:px-5">
                  <Placa placa={v.placa} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{cliente?.nome ?? 'Sem nome'}</p>
                    <p className="truncate text-[14px] text-tinta-2">
                      {[v.marca, v.modelo, v.ano].filter(Boolean).join(' ')}
                      {cliente?.telefone ? <span className="text-tinta-3">, {formatarTelefone(cliente.telefone)}</span> : null}
                    </p>
                  </div>
                  {proximo && p ? (
                    <div className="hidden text-right sm:block">
                      <p className={`text-[14px] font-bold ${cor}`}>{p.principal}</p>
                      <p className="text-[13px] text-tinta-3">{servico(proximo.servico).nome}</p>
                    </div>
                  ) : null}
                  <ChevronRight size={18} className="shrink-0 text-tinta-3" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NovoCliente aberta={novo} aoFechar={() => setNovo(false)} />
    </div>
  );
}

function NovoCliente({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const router = useRouter();
  const veiculos = useOficina((s) => s.veiculos);
  const salvarCliente = useOficina((s) => s.salvarCliente);
  const salvarVeiculo = useOficina((s) => s.salvarVeiculo);
  const [cliente, setCliente] = useState(CLIENTE_VAZIO);
  const [carro, setCarro] = useState(VEICULO_VAZIO);
  const [erros, setErros] = useState<{ c: ReturnType<typeof errosCliente>; v: ReturnType<typeof errosVeiculo> }>({ c: {}, v: {} });

  function salvar() {
    const c = errosCliente(cliente);
    const v = errosVeiculo(carro);
    if (Object.values(veiculos).some((x) => x.placa === normalizarPlaca(carro.placa))) v.placa = 'Essa placa já está cadastrada.';
    setErros({ c, v });
    if (Object.keys(c).length || Object.keys(v).length) return;
    const clienteId = salvarCliente(clienteDoRascunho(cliente));
    const veiculoId = salvarVeiculo(veiculoDoRascunho(carro, clienteId));
    setCliente(CLIENTE_VAZIO);
    setCarro(VEICULO_VAZIO);
    aoFechar();
    router.push(`/oficina/carro?id=${veiculoId}`);
  }

  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Cliente novo"
      descricao="Depois você registra os serviços e cadastra o óleo do manual."
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <CamposCliente valor={cliente} aoMudar={setCliente} erros={erros.c} />
        <div className="border-t border-linha pt-5">
          <CamposVeiculo valor={carro} aoMudar={setCarro} erros={erros.v} completo />
        </div>
      </div>
    </Folha>
  );
}
