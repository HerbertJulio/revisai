'use client';

import { Building2, Check, ChevronRight, LogOut, Store, Wrench, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { abrirLoja, abrirOficina, aceitarTermos, apagarMinhaConta, criarLoja, criarOficina, responderConvite, sair, sairDeTodos } from '@/app/conta/acoes';
import { Botao, Campo, Chip, classeEntrada } from '@/components/ui';
import { formatarCnpj } from '@/lib/cnpj';
import { nomeDoPapel, type Conta } from '@/lib/conta-dados';
import { formatarData } from '@/lib/datas';
import { UFS } from '@/lib/padroes';
import { useOficina } from '@/lib/store';

const DOCUMENTOS: Record<string, { nome: string; href: string }> = {
  termos: { nome: 'Termos de uso', href: '/termos' },
  privacidade: { nome: 'Política de privacidade', href: '/privacidade' },
  contrato_loja: { nome: 'Contrato das lojas', href: '/contrato-lojas' },
  tratamento_dados: { nome: 'Acordo de tratamento de dados (os dados dos seus clientes)', href: '/tratamento-de-dados' }
};

const NOME_PLANO: Record<string, string> = { pro: 'Pro', teste: 'Teste do Pro', gratis: 'Grátis' };

export function PainelConta({ conta, termosPendentes, para }: { conta: Conta; termosPendentes: string[]; para: string }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<'oficina' | 'loja' | null>(conta.oficinas.length + conta.fornecedores.length === 0 && !conta.convites.length ? 'oficina' : null);

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro ?? 'Não deu certo. Tente de novo.');
      else router.refresh();
    });
  }

  if (termosPendentes.length) return <AceiteDosTermos pendentes={termosPendentes} para={para} />;

  const vazio = !conta.oficinas.length && !conta.fornecedores.length;

  return (
    <div className="flex flex-col gap-7">
      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}

      {conta.convites.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[18px]">Convites para você</h2>
          {conta.convites.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-linha p-4">
              <div className="min-w-0">
                <p className="font-bold">{c.nome || (c.tipo === 'oficina' ? 'Uma oficina' : 'Uma loja')}</p>
                <p className="text-[14px] text-tinta-2">
                  {c.tipo === 'oficina' ? 'Oficina' : 'Loja'} · entrar como {nomeDoPapel(c.tipo, c.papel).toLowerCase()} · vale até {formatarData(c.expiraEm.slice(0, 10))}
                </p>
              </div>
              <div className="flex gap-2">
                <Botao variante="fantasma" tamanho="pequeno" disabled={ocupado} onClick={() => rodar(() => responderConvite(c.id, false))}>
                  <X size={16} aria-hidden="true" /> Recusar
                </Botao>
                <Botao variante="escuro" tamanho="pequeno" disabled={ocupado} onClick={() => rodar(() => responderConvite(c.id, true))}>
                  <Check size={16} aria-hidden="true" /> Aceitar
                </Botao>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {conta.oficinas.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[18px]">Suas oficinas</h2>
          {conta.oficinas.map((o) => (
            <form key={o.id} action={abrirOficina.bind(null, o.id)}>
              <button type="submit" className="flex w-full items-center gap-3 rounded-2xl border border-linha p-4 text-left hover:border-tinta-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-oleo-claro text-oleo-tinta">
                  <Wrench size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{o.nome}</span>
                  <span className="text-[14px] text-tinta-2">
                    {nomeDoPapel('oficina', o.papel)} · {NOME_PLANO[o.plano]}
                    {o.cidade ? ` · ${o.cidade}` : ''}
                  </span>
                </span>
                {!o.ativa ? <Chip tom="atraso">Desativada</Chip> : null}
                <ChevronRight size={18} className="text-tinta-3" aria-hidden="true" />
              </button>
            </form>
          ))}
        </section>
      ) : null}

      {conta.fornecedores.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[18px]">Suas lojas</h2>
          {conta.fornecedores.map((f) => (
            <form key={f.id} action={abrirLoja.bind(null, f.id)}>
              <button type="submit" className="flex w-full items-center gap-3 rounded-2xl border border-linha p-4 text-left hover:border-tinta-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-caneta-claro text-caneta">
                  <Store size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{f.nome}</span>
                  <span className="text-[14px] text-tinta-2">{nomeDoPapel('fornecedor', f.papel)}</span>
                </span>
                {f.verificacao === 'pendente' ? <Chip tom="oleo">Em análise</Chip> : f.verificacao === 'recusada' ? <Chip tom="atraso">Recusada</Chip> : !f.ativo ? <Chip>Pausada</Chip> : null}
                <ChevronRight size={18} className="text-tinta-3" aria-hidden="true" />
              </button>
            </form>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-[18px]">{vazio ? 'Para começar' : 'Mais'}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setAberto(aberto === 'oficina' ? null : 'oficina')} aria-expanded={aberto === 'oficina'} className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${aberto === 'oficina' ? 'border-tinta' : 'border-linha hover:border-tinta-3'}`}>
            <Building2 size={20} aria-hidden="true" />
            <span>
              <span className="block font-bold">{conta.oficinas.length ? 'Criar outra oficina' : 'Tenho uma oficina'}</span>
              <span className="text-[13px] text-tinta-2">Avisos, ordens, estoque e loja</span>
            </span>
          </button>
          <button type="button" onClick={() => setAberto(aberto === 'loja' ? null : 'loja')} aria-expanded={aberto === 'loja'} className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${aberto === 'loja' ? 'border-tinta' : 'border-linha hover:border-tinta-3'}`}>
            <Store size={20} aria-hidden="true" />
            <span>
              <span className="block font-bold">{conta.fornecedores.length ? 'Cadastrar outra loja' : 'Vendo peças'}</span>
              <span className="text-[13px] text-tinta-2">Venda para as oficinas da região</span>
            </span>
          </button>
        </div>
        {aberto === 'oficina' ? <FormOficina /> : null}
        {aberto === 'loja' ? <FormLoja /> : null}
        {vazio && !conta.convites.length ? (
          <p className="text-[13px] text-tinta-3">Trabalha numa oficina que já usa o Revisaí? Peça ao dono para convidar o seu e-mail ({conta.usuario.email}) em Ajustes, na parte Equipe.</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-linha pt-5">
        <div className="flex flex-wrap gap-2">
          <form action={sair}>
            <Botao type="submit" variante="secundario" tamanho="pequeno">
              <LogOut size={15} aria-hidden="true" /> Sair
            </Botao>
          </form>
          <form action={sairDeTodos}>
            <Botao type="submit" variante="fantasma" tamanho="pequeno">
              Sair de todos os aparelhos
            </Botao>
          </form>
        </div>
        <ApagarConta />
      </section>
    </div>
  );
}

function AceiteDosTermos({ pendentes, para }: { pendentes: string[]; para: string }) {
  const router = useRouter();
  const [marcado, setMarcado] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!marcado) return setErro('Marque que leu e aceita para continuar.');
        iniciar(async () => {
          const r = await aceitarTermos(pendentes);
          if (!r.ok) setErro(r.erro);
          else {
            router.replace(para ? `/conta?para=${encodeURIComponent(para)}` : '/conta');
            router.refresh();
          }
        });
      }}
    >
      <p className="text-[15px] text-tinta-2">Antes de continuar, leia e aceite:</p>
      <ul className="flex flex-col gap-1.5">
        {pendentes.map((d) => (
          <li key={d}>
            <Link href={DOCUMENTOS[d]?.href ?? '/termos'} target="_blank" className="font-semibold text-caneta underline">
              {DOCUMENTOS[d]?.nome ?? d}
            </Link>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-3 rounded-xl bg-papel-2 p-3 text-[15px]">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-tinta)]" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} />
        <span>Li e aceito {pendentes.length > 1 ? 'esses documentos' : 'esse documento'}.</span>
      </label>
      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
        {ocupado ? 'Guardando…' : 'Aceitar e continuar'}
      </Botao>
    </form>
  );
}

function FormOficina() {
  const router = useRouter();
  const local = useOficina((s) => s.oficina);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('RJ');
  const [endereco, setEndereco] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  // quem já usava o Revisaí neste aparelho começa com o cadastro que já tinha
  useEffect(() => {
    if (!local.nome) return;
    setNome((v) => v || local.nome);
    setWhatsapp((v) => v || local.whatsapp);
    setCidade((v) => v || local.cidade);
    setUf((v) => (v === 'RJ' && local.uf ? local.uf : v));
    setEndereco((v) => v || local.endereco);
  }, [local]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await criarOficina({ nome, whatsapp, cidade, uf, endereco });
      if (!r.ok) return setErro(r.erro);
      router.push('/oficina');
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-4 rounded-2xl bg-papel-2/60 p-4 sm:grid-cols-2">
      <Campo rotulo="Nome da oficina" htmlFor="of-nome" className="sm:col-span-2" erro={erro}>
        <input id="of-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Auto Center Serra" autoComplete="organization" required />
      </Campo>
      <Campo rotulo="WhatsApp da oficina" htmlFor="of-whats" dica="Vai no cartão do cliente e nos pedidos da loja.">
        <input id="of-whats" className={classeEntrada} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(21) 99999-0000" inputMode="tel" autoComplete="tel" required />
      </Campo>
      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Campo rotulo="Cidade" htmlFor="of-cidade">
          <input id="of-cidade" className={classeEntrada} value={cidade} onChange={(e) => setCidade(e.target.value)} autoComplete="address-level2" />
        </Campo>
        <Campo rotulo="UF" htmlFor="of-uf">
          <select id="of-uf" className={classeEntrada} value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo rotulo="Endereço (para as entregas da loja)" htmlFor="of-end" className="sm:col-span-2">
        <input id="of-end" className={classeEntrada} value={endereco} onChange={(e) => setEndereco(e.target.value)} autoComplete="street-address" />
      </Campo>
      <Botao type="submit" variante="primario" tamanho="grande" className="sm:col-span-2" disabled={ocupado}>
        {ocupado ? 'Criando…' : 'Criar a oficina'}
      </Botao>
      <p className="text-[13px] text-tinta-3 sm:col-span-2">Você entra no plano grátis e pode testar o Pro por 30 dias quando quiser.</p>
    </form>
  );
}

function FormLoja() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('RJ');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await criarLoja({ nome, cnpj, whatsapp, cidade, uf });
      if (!r.ok) return setErro(r.erro);
      router.push('/fornecedor');
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-4 rounded-2xl bg-papel-2/60 p-4 sm:grid-cols-2">
      <Campo rotulo="Nome da loja" htmlFor="lj-nome" className="sm:col-span-2" erro={erro}>
        <input id="lj-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="organization" required />
      </Campo>
      <Campo rotulo="CNPJ" htmlFor="lj-cnpj" dica="A equipe confere antes de a loja aparecer.">
        <input id="lj-cnpj" className={`${classeEntrada} num`} value={cnpj} onChange={(e) => setCnpj(e.target.value)} onBlur={() => setCnpj((v) => formatarCnpj(v))} inputMode="numeric" required />
      </Campo>
      <Campo rotulo="WhatsApp da loja" htmlFor="lj-whats">
        <input id="lj-whats" className={classeEntrada} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" autoComplete="tel" required />
      </Campo>
      <div className="grid grid-cols-[1fr_88px] gap-3 sm:col-span-2">
        <Campo rotulo="Cidade" htmlFor="lj-cidade">
          <input id="lj-cidade" className={classeEntrada} value={cidade} onChange={(e) => setCidade(e.target.value)} required />
        </Campo>
        <Campo rotulo="UF" htmlFor="lj-uf">
          <select id="lj-uf" className={classeEntrada} value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Campo>
      </div>
      <Botao type="submit" variante="escuro" tamanho="grande" className="sm:col-span-2" disabled={ocupado}>
        {ocupado ? 'Enviando…' : 'Pedir para vender no Revisaí'}
      </Botao>
    </form>
  );
}

function ApagarConta() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <details className="text-[14px]">
      <summary className="cursor-pointer text-tinta-3 hover:text-tinta">Apagar minha conta</summary>
      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-linha p-4">
        <p className="text-tinta-2">
          Sua conta e seus acessos somem. Se você for o único dono de uma oficina ou loja, apague a empresa antes (em Ajustes) ou passe o dono para outra pessoa. Os registros de acesso ficam guardados 6 meses, como a lei pede.
        </p>
        <Campo rotulo="Escreva APAGAR para confirmar" erro={erro} htmlFor="apagar-conta">
          <input id="apagar-conta" className={classeEntrada} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
        </Campo>
        <Botao
          variante="perigo"
          tamanho="pequeno"
          disabled={ocupado}
          onClick={() =>
            iniciar(async () => {
              const r = await apagarMinhaConta(texto);
              if (!r.ok) setErro(r.erro);
              else router.replace('/');
            })
          }
        >
          Apagar minha conta
        </Botao>
      </div>
    </details>
  );
}
