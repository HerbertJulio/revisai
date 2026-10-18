'use client';

import { Sparkles } from 'lucide-react';
import { Alternar, Campo, classeEntrada } from '@/components/ui';
import { formatarNumero, lerNumero, normalizarPlaca, normalizarTelefone, placaValida } from '@/lib/formatos';
import { ACEA, BASES, NIVEIS_API, NORMAS, VISCOSIDADES, buscarReferencias, type ReferenciaOleo } from '@/lib/oleos';
import { camposDaPlaca } from '@/lib/placa';
import type { Cliente, Combustivel, EspecOleo, Veiculo } from '@/lib/tipos';
import { BuscaPelaPlaca, type CarroDaPlaca } from './cadastro/BuscaPelaPlaca';

export interface RascunhoCliente {
  nome: string;
  telefone: string;
  email: string;
  observacao: string;
}

export interface RascunhoVeiculo {
  placa: string;
  marca: string;
  modelo: string;
  motor: string;
  ano: string;
  combustivel: Combustivel;
  kmMes: string;
  usoSevero: boolean | null;
  oleo: EspecOleo;
  oleoCapacidade: string;
  oleoKm: string;
  oleoMeses: string;
  observacao: string;
  /** Vêm da busca pela placa (e da edição completa do carro). */
  cor?: string;
  anoModelo?: string;
  chassi?: string;
  /** O valor FIPE que veio com a placa; undefined deixa o do carro como está. */
  fipe?: Veiculo['fipe'];
}

export const CLIENTE_VAZIO: RascunhoCliente = { nome: '', telefone: '', email: '', observacao: '' };

export const VEICULO_VAZIO: RascunhoVeiculo = {
  placa: '',
  marca: '',
  modelo: '',
  motor: '',
  ano: '',
  combustivel: 'flex',
  kmMes: '',
  usoSevero: null,
  oleo: { viscosidades: [] },
  oleoCapacidade: '',
  oleoKm: '',
  oleoMeses: '',
  observacao: ''
};

export function rascunhoDoCliente(c: Cliente): RascunhoCliente {
  return { nome: c.nome, telefone: c.telefone, email: c.email ?? '', observacao: c.observacao ?? '' };
}

export function rascunhoDoVeiculo(v: Veiculo): RascunhoVeiculo {
  return {
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    motor: v.motor ?? '',
    ano: v.ano ? String(v.ano) : '',
    combustivel: v.combustivel ?? 'flex',
    kmMes: v.kmMes ? String(v.kmMes) : '',
    usoSevero: v.usoSevero ?? null,
    oleo: { viscosidades: [], ...v.oleo },
    oleoCapacidade: v.oleo?.capacidadeL != null ? formatarNumero(v.oleo.capacidadeL, 2) : '',
    oleoKm: v.intervaloOleo?.km ? String(v.intervaloOleo.km) : '',
    oleoMeses: v.intervaloOleo?.meses ? String(v.intervaloOleo.meses) : '',
    observacao: v.observacao ?? '',
    cor: v.cor ?? '',
    anoModelo: v.anoModelo ? String(v.anoModelo) : '',
    chassi: v.chassi ?? ''
  };
}

/** O rascunho com o que veio da placa (só os campos que vieram; a pessoa já confirmou). */
export function rascunhoComPlaca(v: RascunhoVeiculo, c: CarroDaPlaca): RascunhoVeiculo {
  return { ...v, ...camposDaPlaca(c.dados), ...(c.fipe ? { fipe: c.fipe } : {}) };
}

export function errosCliente(c: RascunhoCliente): Partial<Record<keyof RascunhoCliente, string>> {
  const e: Partial<Record<keyof RascunhoCliente, string>> = {};
  if (c.nome.trim().length < 2) e.nome = 'Escreva o nome do cliente.';
  if (c.telefone.trim() && !normalizarTelefone(c.telefone)) e.telefone = 'Confira o número, com DDD.';
  if (c.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) e.email = 'Confira o e-mail.';
  return e;
}

export function errosVeiculo(v: RascunhoVeiculo): Partial<Record<keyof RascunhoVeiculo, string>> {
  const e: Partial<Record<keyof RascunhoVeiculo, string>> = {};
  if (!placaValida(v.placa)) e.placa = 'Placa no formato ABC1D23 ou ABC-1234.';
  if (!v.modelo.trim()) e.modelo = 'Escreva o modelo.';
  const ano = lerNumero(v.ano);
  if (v.ano.trim() && (ano == null || ano < 1950 || ano > new Date().getFullYear() + 1)) e.ano = 'Ano inválido.';
  const anoModelo = lerNumero(v.anoModelo ?? '');
  if ((v.anoModelo ?? '').trim() && (anoModelo == null || anoModelo < 1950 || anoModelo > new Date().getFullYear() + 2)) e.anoModelo = 'Ano inválido.';
  return e;
}

export function clienteDoRascunho(c: RascunhoCliente) {
  return {
    nome: c.nome.trim(),
    telefone: normalizarTelefone(c.telefone) ?? c.telefone.trim(),
    email: c.email.trim() || undefined,
    observacao: c.observacao.trim() || undefined
  };
}

export function veiculoDoRascunho(v: RascunhoVeiculo, clienteId: string): Omit<Veiculo, 'id' | 'criadoEm'> {
  const km = lerNumero(v.oleoKm);
  const meses = lerNumero(v.oleoMeses);
  const capacidadeL = lerNumero(v.oleoCapacidade) ?? undefined;
  const oleo: EspecOleo | undefined = v.oleo.viscosidades.length || capacidadeL ? limparOleo({ ...v.oleo, capacidadeL }) : undefined;
  return {
    clienteId,
    placa: normalizarPlaca(v.placa),
    marca: v.marca.trim(),
    modelo: v.modelo.trim(),
    motor: v.motor.trim() || undefined,
    ano: lerNumero(v.ano) ?? null,
    combustivel: v.combustivel,
    kmMes: lerNumero(v.kmMes) ?? null,
    usoSevero: v.usoSevero,
    oleo,
    intervaloOleo: km || meses ? { km: km || null, meses: meses || null } : null,
    observacao: v.observacao.trim() || undefined,
    ...(v.cor !== undefined ? { cor: v.cor.trim() || undefined } : {}),
    ...(v.anoModelo !== undefined ? { anoModelo: lerNumero(v.anoModelo) ?? null } : {}),
    ...(v.chassi !== undefined ? { chassi: v.chassi.trim() || undefined } : {}),
    ...(v.fipe !== undefined ? { fipe: v.fipe } : {})
  };
}

function limparOleo(o: EspecOleo): EspecOleo {
  const r: EspecOleo = { viscosidades: o.viscosidades };
  if (o.api) r.api = o.api;
  if (o.acea) r.acea = o.acea;
  if (o.norma) r.norma = o.norma;
  if (o.base) r.base = o.base;
  if (o.capacidadeL) r.capacidadeL = o.capacidadeL;
  return r;
}

export function CamposCliente({ valor, aoMudar, erros = {} }: { valor: RascunhoCliente; aoMudar: (c: RascunhoCliente) => void; erros?: Partial<Record<keyof RascunhoCliente, string>> }) {
  const muda = (campo: keyof RascunhoCliente) => (e: React.ChangeEvent<HTMLInputElement>) => aoMudar({ ...valor, [campo]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Campo rotulo="Nome do cliente" htmlFor="cli-nome" erro={erros.nome} className="sm:col-span-2">
        <input id="cli-nome" className={classeEntrada} value={valor.nome} onChange={muda('nome')} autoComplete="off" />
      </Campo>
      <Campo rotulo="WhatsApp" htmlFor="cli-tel" erro={erros.telefone} dica="Com DDD. É para onde vão os avisos.">
        <input id="cli-tel" className={classeEntrada} value={valor.telefone} onChange={muda('telefone')} inputMode="tel" placeholder="(21) 99999-0000" autoComplete="off" />
      </Campo>
      <Campo rotulo="E-mail" htmlFor="cli-email" erro={erros.email} dica="Opcional.">
        <input id="cli-email" className={classeEntrada} value={valor.email} onChange={muda('email')} inputMode="email" autoComplete="off" />
      </Campo>
    </div>
  );
}

export function CamposVeiculo({
  valor,
  aoMudar,
  erros = {},
  completo = false
}: {
  valor: RascunhoVeiculo;
  aoMudar: (v: RascunhoVeiculo) => void;
  erros?: Partial<Record<keyof RascunhoVeiculo, string>>;
  completo?: boolean;
}) {
  const muda = (campo: keyof RascunhoVeiculo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => aoMudar({ ...valor, [campo]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <Campo rotulo="Placa" htmlFor="v-placa" erro={erros.placa} className="sm:col-span-2">
        <input
          id="v-placa"
          className={`${classeEntrada} largo num font-bold tracking-[0.08em] uppercase`}
          value={valor.placa}
          onChange={(e) => aoMudar({ ...valor, placa: normalizarPlaca(e.target.value) })}
          placeholder="ABC1D23"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={8}
        />
      </Campo>
      <BuscaPelaPlaca placa={valor.placa} aoUsar={(c) => aoMudar(rascunhoComPlaca(valor, c))} className="sm:col-span-4 sm:pt-[26px]" />
      <Campo rotulo="Marca" htmlFor="v-marca" className="sm:col-span-2">
        <input id="v-marca" className={classeEntrada} value={valor.marca} onChange={muda('marca')} placeholder="Chevrolet" list="marcas" autoComplete="off" />
      </Campo>
      <Campo rotulo="Modelo" htmlFor="v-modelo" erro={erros.modelo} className="sm:col-span-2">
        <input id="v-modelo" className={classeEntrada} value={valor.modelo} onChange={muda('modelo')} placeholder="Onix" autoComplete="off" />
      </Campo>
      <Campo rotulo="Motor" htmlFor="v-motor" className="sm:col-span-2" dica="Ex.: 1.0 turbo, 1.6, 1.0 TSI.">
        <input id="v-motor" className={classeEntrada} value={valor.motor} onChange={muda('motor')} autoComplete="off" />
      </Campo>
      <Campo rotulo="Ano" htmlFor="v-ano" erro={erros.ano} className="sm:col-span-2">
        <input id="v-ano" className={classeEntrada} value={valor.ano} onChange={muda('ano')} inputMode="numeric" maxLength={4} autoComplete="off" />
      </Campo>
      {completo ? (
        <Campo rotulo="Ano do modelo" htmlFor="v-anomodelo" erro={erros.anoModelo} className="sm:col-span-2" dica="O segundo ano do documento (2019/2020).">
          <input id="v-anomodelo" className={classeEntrada} value={valor.anoModelo ?? ''} onChange={muda('anoModelo')} inputMode="numeric" maxLength={4} autoComplete="off" />
        </Campo>
      ) : null}
      <Campo rotulo="Combustível" htmlFor="v-comb" className="sm:col-span-2">
        <select id="v-comb" className={classeEntrada} value={valor.combustivel} onChange={muda('combustivel')}>
          <option value="flex">Flex</option>
          <option value="gasolina">Gasolina</option>
          <option value="etanol">Etanol</option>
          <option value="gnv">Com GNV</option>
          <option value="diesel">Diesel</option>
          <option value="hibrido">Híbrido</option>
          <option value="eletrico">Elétrico</option>
        </select>
      </Campo>
      <datalist id="marcas">
        {['Chevrolet', 'Volkswagen', 'Fiat', 'Hyundai', 'Toyota', 'Renault', 'Jeep', 'Honda', 'Nissan', 'Ford', 'Peugeot', 'Citroën', 'Caoa Chery', 'BYD', 'Mitsubishi', 'Kia'].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {completo ? (
        <>
          <Campo rotulo="Cor" htmlFor="v-cor" className="sm:col-span-3">
            <input id="v-cor" className={classeEntrada} value={valor.cor ?? ''} onChange={muda('cor')} autoComplete="off" />
          </Campo>
          <Campo rotulo="Quanto roda por mês" htmlFor="v-kmmes" className="sm:col-span-3" dica="Deixe em branco para o app calcular pelo histórico.">
            <input id="v-kmmes" className={classeEntrada} value={valor.kmMes} onChange={muda('kmMes')} inputMode="numeric" placeholder="1000" autoComplete="off" />
          </Campo>
          <div className="sm:col-span-6">
            <Alternar
              id="v-severo"
              ligado={valor.usoSevero ?? false}
              aoMudar={(v) => aoMudar({ ...valor, usoSevero: v })}
              rotulo="Uso severo"
              descricao="Trânsito pesado, trajetos curtos, aplicativo ou táxi, poeira, reboque. Os prazos caem pela metade."
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Óleo do manual do carro, com sugestões pelo modelo (referências de confiança média). */
export function EditorOleo({ valor, aoMudar, textoCarro }: { valor: RascunhoVeiculo; aoMudar: (v: RascunhoVeiculo) => void; textoCarro: string }) {
  const oleo = valor.oleo;
  const sugestoes = buscarReferencias(textoCarro).slice(0, 2);
  const mudaOleo = (o: Partial<EspecOleo>) => aoMudar({ ...valor, oleo: { ...oleo, ...o } });
  const alternarViscosidade = (v: string) =>
    mudaOleo({ viscosidades: oleo.viscosidades.includes(v) ? oleo.viscosidades.filter((x) => x !== v) : [...oleo.viscosidades, v] });

  return (
    <div className="flex flex-col gap-4">
      {sugestoes.map((r) => (
        <SugestaoOleo
          key={r.id}
          r={r}
          aoUsar={() =>
            aoMudar({ ...valor, oleo: { ...r.oleo, base: oleo.base }, oleoCapacidade: r.oleo.capacidadeL != null ? formatarNumero(r.oleo.capacidadeL, 2) : valor.oleoCapacidade })
          }
        />
      ))}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Viscosidade que o manual pede</span>
        <div className="flex flex-wrap gap-2">
          {VISCOSIDADES.map((v) => {
            const sel = oleo.viscosidades.includes(v);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={sel}
                onClick={() => alternarViscosidade(v)}
                className={`num h-9 rounded-full border px-3 text-[14px] font-semibold ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
              >
                {v}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-tinta-3">Marque mais de uma se o manual aceitar alternativas.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="API mínima" htmlFor="o-api">
          <select id="o-api" className={classeEntrada} value={oleo.api ?? ''} onChange={(e) => mudaOleo({ api: e.target.value || undefined })}>
            <option value="">Não sei</option>
            {NIVEIS_API.map((a) => (
              <option key={a} value={a}>
                API {a}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Norma da montadora" htmlFor="o-norma">
          <select id="o-norma" className={classeEntrada} value={oleo.norma ?? ''} onChange={(e) => mudaOleo({ norma: e.target.value || undefined })}>
            <option value="">Nenhuma ou não sei</option>
            {NORMAS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="ACEA" htmlFor="o-acea">
          <select id="o-acea" className={classeEntrada} value={oleo.acea ?? ''} onChange={(e) => mudaOleo({ acea: e.target.value || undefined })}>
            <option value="">Não sei</option>
            {ACEA.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Capacidade com filtro (litros)" htmlFor="o-cap">
          <input
            id="o-cap"
            className={classeEntrada}
            value={valor.oleoCapacidade}
            onChange={(e) => aoMudar({ ...valor, oleoCapacidade: e.target.value })}
            inputMode="decimal"
            placeholder="3,5"
            autoComplete="off"
          />
        </Campo>
        <Campo rotulo="Base usada" htmlFor="o-base" dica="O app não recomenda descer de base (de sintético para mineral).">
          <select id="o-base" className={classeEntrada} value={oleo.base ?? ''} onChange={(e) => mudaOleo({ base: (e.target.value || undefined) as EspecOleo['base'] })}>
            <option value="">Não sei</option>
            {BASES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Troca no manual (km)" htmlFor="o-km">
            <input id="o-km" className={classeEntrada} value={valor.oleoKm} onChange={(e) => aoMudar({ ...valor, oleoKm: e.target.value })} inputMode="numeric" placeholder="10000" />
          </Campo>
          <Campo rotulo="ou meses" htmlFor="o-meses">
            <input id="o-meses" className={classeEntrada} value={valor.oleoMeses} onChange={(e) => aoMudar({ ...valor, oleoMeses: e.target.value })} inputMode="numeric" placeholder="12" />
          </Campo>
        </div>
      </div>
    </div>
  );
}

export function SugestaoOleo({ r, aoUsar }: { r: ReferenciaOleo; aoUsar: () => void }) {
  const o = r.oleo;
  const partes = [o.viscosidades.join(' ou '), o.api ? `API ${o.api}` : '', o.acea ? `ACEA ${o.acea}` : '', o.norma ?? '', o.capacidadeL ? `${formatarNumero(o.capacidadeL, 2)} L` : ''].filter(Boolean);
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl bg-caneta-claro px-3 py-3 text-[14px]">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-caneta" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{r.descricao}</p>
        <p className="text-tinta-2">{partes.join(', ')}. Distribuição por {r.distribuicao}.</p>
        {r.nota ? <p className="mt-1 text-tinta-2">{r.nota}</p> : null}
        <p className="mt-1 text-[12.5px] text-tinta-3">Referência de revistas técnicas e manuais. Confira no manual do carro.</p>
      </div>
      <button type="button" onClick={aoUsar} className="h-9 rounded-[10px] bg-caneta px-3 text-[14px] font-semibold text-white escuro:text-[#10183a]">
        Usar
      </button>
    </div>
  );
}
