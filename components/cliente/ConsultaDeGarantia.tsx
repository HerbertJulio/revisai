'use client';

// A consulta pública da garantia: a placa do carro e o código do certificado.

import { Search } from 'lucide-react';
import { useState } from 'react';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { normalizarPlaca } from '@/lib/formatos';
import { lerGarantiaDoLink, type DadosGarantiaLink } from '@/lib/garantia';
import { consultarGarantiaPublica } from '@/lib/links-acoes';
import { esquemaOficinaDoLink, hojeNoBrasil, type OficinaDoLink } from '@/lib/links-publicos';
import { CertificadoDeGarantia } from './CertificadoDeGarantia';

export function ConsultaDeGarantia({ placaInicial = '', codigoInicial = '' }: { placaInicial?: string; codigoInicial?: string }) {
  const [placa, setPlaca] = useState(placaInicial);
  const [codigo, setCodigo] = useState(codigoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [achada, setAchada] = useState<{ dados: DadosGarantiaLink; oficina: OficinaDoLink; codigo: string } | null>(null);

  async function consultar() {
    setErro(null);
    setBuscando(true);
    try {
      const r = await consultarGarantiaPublica(placa, codigo);
      if (!r.ok) {
        setAchada(null);
        return setErro(r.erro);
      }
      const dados = lerGarantiaDoLink(r.dados);
      const oficina = esquemaOficinaDoLink.safeParse(r.oficina);
      if (!dados || !oficina.success) return setErro('Esta garantia não abriu. Peça o certificado para a oficina.');
      setAchada({ dados, oficina: oficina.data, codigo: codigo.trim().toUpperCase() });
    } catch {
      setErro('Não deu para consultar agora. Confira a internet e tente de novo.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          void consultar();
        }}
      >
        <div>
          <h1 className="largo text-[28px] leading-tight sm:text-[34px]">Consultar a garantia</h1>
          <p className="mt-1 text-tinta-2">Use a placa do carro e o código de 6 letras e números que está no certificado da oficina.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo rotulo="Placa" htmlFor="g-placa">
            <input id="g-placa" className={`${classeEntrada} num uppercase`} value={placa} onChange={(e) => setPlaca(normalizarPlaca(e.target.value))} placeholder="ABC1D23" autoComplete="off" required />
          </Campo>
          <Campo rotulo="Código do certificado" htmlFor="g-codigo">
            <input id="g-codigo" className={`${classeEntrada} num uppercase tracking-[0.12em]`} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="X7K2QM" autoComplete="off" required />
          </Campo>
          <Botao type="submit" variante="escuro" disabled={buscando}>
            <Search size={17} aria-hidden="true" /> {buscando ? 'Consultando…' : 'Consultar'}
          </Botao>
        </div>
        {erro ? (
          <p className="rounded-xl bg-atraso-claro px-3 py-2.5 text-[14px] text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
      </form>
      {achada ? <CertificadoDeGarantia dados={achada.dados} oficina={achada.oficina} codigo={achada.codigo} hoje={hojeNoBrasil()} enderecoDaConsulta={`${window.location.host}/garantia`} /> : null}
    </div>
  );
}
