'use client';

import { Download, Trash2 } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { apagarDadosDoTitular, exportarDadosDoTitular } from '@/app/admin/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { emailValido } from '@/lib/equipe/entrada';
import { plural } from '@/lib/formatos';

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pedidos de titulares (LGPD, art. 18): exportar tudo de um e-mail ou apagar a conta e os cadastros. */
export function Titulares() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [erroApagar, setErroApagar] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const limpo = email.trim().toLowerCase();

  function exportar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!emailValido(limpo)) return setErro('Confira o e-mail.');
    iniciar(async () => {
      try {
        const r = await exportarDadosDoTitular(limpo);
        if (!r.ok) return setErro(r.erro);
        baixar(r.arquivo, r.json);
        toast({ texto: 'Arquivo baixado. O pedido ficou no histórico.' });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function apagar(e: FormEvent) {
    e.preventDefault();
    setErroApagar(null);
    if (!emailValido(limpo)) return setErroApagar('Escreva o e-mail lá em cima.');
    if (confirmacao.trim().toLowerCase() !== limpo) return setErroApagar('Digite o mesmo e-mail na confirmação.');
    if (!window.confirm(`Apagar a conta e os cadastros de ${limpo}? Não dá para desfazer.`)) return;
    iniciar(async () => {
      try {
        const r = await apagarDadosDoTitular(limpo, confirmacao);
        if (!r.ok) return setErroApagar(r.erro);
        setConfirmacao('');
        toast({ texto: `Apagado: ${r.conta ? 'a conta e ' : ''}${plural(r.cadastros, 'cadastro do site', 'cadastros do site')}.` });
      } catch {
        setErroApagar('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={exportar} className="flex flex-col gap-4 rounded-2xl bg-papel p-4 ring-1 ring-linha sm:p-5">
        <h2 className="text-[19px]">Exportar os dados</h2>
        <p className="text-[14px] text-tinta-2">
          Baixa um arquivo com tudo o que o Revisaí guarda sobre o e-mail: conta, oficinas e lojas de que a pessoa participa, cadastros do site, termos aceitos e os
          últimos acessos. Mande para a pessoa pelo canal que ela usou para pedir.
        </p>
        <Campo rotulo="E-mail da pessoa" htmlFor="tit-email" erro={erro}>
          <input id="tit-email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} className={classeEntrada} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Botao type="submit" variante="escuro" disabled={ocupado} className="self-start">
          <Download size={16} aria-hidden="true" /> {ocupado ? 'Gerando…' : 'Baixar o arquivo'}
        </Botao>
      </form>

      <form onSubmit={apagar} className="flex flex-col gap-4 rounded-2xl bg-papel p-4 ring-1 ring-linha sm:p-5">
        <h2 className="text-[19px]">Apagar os dados</h2>
        <p className="text-[14px] text-tinta-2">
          Apaga a conta e os cadastros do site desse e-mail. Se a pessoa for a única dona de uma oficina ou loja, apague a empresa antes. Os registros de acesso ficam os 6
          meses que a lei manda.
        </p>
        <Campo rotulo="Digite o e-mail de novo para confirmar" htmlFor="tit-conf" erro={erroApagar}>
          <input
            id="tit-conf"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            className={classeEntrada}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
        </Campo>
        <Botao type="submit" variante="perigo" disabled={ocupado || !limpo || confirmacao.trim().toLowerCase() !== limpo} className="self-start">
          <Trash2 size={16} aria-hidden="true" /> Apagar de vez
        </Botao>
      </form>
    </div>
  );
}
