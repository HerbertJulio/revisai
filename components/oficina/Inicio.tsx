'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/marca';
import { EtiquetaTroca } from '@/components/pecas';
import { Botao, Campo, classeBotao, classeEntrada } from '@/components/ui';
import { somarDias } from '@/lib/datas';
import { normalizarTelefone } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { UFS } from '@/lib/padroes';
import { useOficina } from '@/lib/store';

/** Primeiro acesso: o nome da oficina e, se quiser, clientes de exemplo para conhecer o app. */
export function Inicio() {
  const configurar = useOficina((s) => s.configurar);
  const hoje = useHoje();
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('RJ');
  const [erro, setErro] = useState<string | null>(null);

  function comecar(exemplo: boolean) {
    if (nome.trim().length < 2) {
      setErro('Escreva o nome da oficina.');
      return;
    }
    if (whatsapp && !normalizarTelefone(whatsapp)) {
      setErro('Confira o WhatsApp, com DDD. Ou deixe em branco por enquanto.');
      return;
    }
    configurar({ nome: nome.trim(), whatsapp: normalizarTelefone(whatsapp) ?? '', cidade: cidade.trim(), uf }, exemplo);
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-5xl content-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_auto] lg:gap-16">
      <div className="flex flex-col gap-6">
        <Logo />
        <div>
          <h1 className="largo text-[32px] sm:text-[40px]">Vamos montar a sua oficina</h1>
          <p className="mt-3 max-w-[52ch] text-[17px] text-tinta-2">
            A cada serviço que você registrar, o Revisaí calcula quando o carro precisa voltar e avisa você antes.
          </p>
        </div>
        <div className="flex max-w-xl flex-col gap-3 rounded-2xl bg-papel p-5 ring-1 ring-linha">
          <p className="font-bold">Crie a conta da oficina</p>
          <p className="text-[15px] text-tinta-2">Com a conta, tudo fica guardado na nuvem e aparece no celular e no computador de quem trabalha com você. Entre com o Google ou com um código no e-mail, sem senha.</p>
          <Link href="/entrar?para=/oficina" className={classeBotao('escuro', 'grande', 'self-start')}>
            Entrar ou criar a conta
          </Link>
        </div>
        <p className="text-[15px] font-semibold text-tinta-2">Ou teste sem conta, só neste aparelho:</p>
        <form
          className="grid grid-cols-1 max-w-xl gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            comecar(true);
          }}
        >
          <Campo rotulo="Nome da oficina" htmlFor="nome" className="sm:col-span-2" erro={erro}>
            <input id="nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Auto Center Serra" autoComplete="organization" required />
          </Campo>
          <Campo rotulo="WhatsApp da oficina" htmlFor="whats" dica="Vai no cartão que o cliente recebe e nos pedidos da loja.">
            <input id="whats" className={classeEntrada} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(21) 99999-0000" inputMode="tel" autoComplete="tel" />
          </Campo>
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <Campo rotulo="Cidade" htmlFor="cidade">
              <input id="cidade" className={classeEntrada} value={cidade} onChange={(e) => setCidade(e.target.value)} autoComplete="address-level2" />
            </Campo>
            <Campo rotulo="UF" htmlFor="uf">
              <select id="uf" className={classeEntrada} value={uf} onChange={(e) => setUf(e.target.value)}>
                {UFS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="flex flex-wrap gap-3 pt-2 sm:col-span-2">
            <Botao variante="primario" tamanho="grande" type="submit">
              Testar com clientes de exemplo
            </Botao>
            <Botao tamanho="grande" onClick={() => comecar(false)}>
              Testar do zero
            </Botao>
          </div>
          <p className="text-[13px] text-tinta-3 sm:col-span-2">Os clientes de exemplo são fictícios e saem com um toque em Ajustes. Sem conta, a voz com IA fica fechada e a loja mostra os produtos sem preço; quando criar a conta, o que estiver aqui vai junto.</p>
        </form>
      </div>
      <div className="hidden items-center justify-center lg:flex" aria-hidden="true">
        <div className="relative h-[300px] w-[300px] rounded-[40px] bg-vidro">
          <EtiquetaTroca data={somarDias(hoje, 9)} km={52300} girar className="absolute top-10 left-8 scale-[1.35]" />
        </div>
      </div>
    </div>
  );
}
