'use client';

import { KeyRound } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Botao, classeEntrada } from '@/components/ui';
import { chavePixParaMostrar, chavePixUsavel, ERRO_DA_CHAVE, tipoDaChavePix, TIPOS_DE_CHAVE } from '@/lib/cobranca-cliente';
import { formatarChavePix, type TipoChavePix } from '@/lib/pix';
import { useOficina } from '@/lib/store';

/** Pede (ou troca) a chave Pix da oficina, usada na cobrança do cliente e no clube. */
export function FormChavePix({ aoSalvar, titulo = 'Qual é a chave Pix da oficina?' }: { aoSalvar?: () => void; titulo?: string }) {
  const id = useId();
  const atual = useOficina((s) => s.oficina.chavePix ?? '');
  const salvarOficina = useOficina((s) => s.salvarOficina);
  const tipoAtual = tipoDaChavePix(atual);
  const [tipo, setTipo] = useState<TipoChavePix>(tipoAtual ?? 'cnpj');
  const [chave, setChave] = useState(atual && tipoAtual ? formatarChavePix(tipoAtual, atual) : '');
  const [erro, setErro] = useState<string | null>(null);
  const exemplo = TIPOS_DE_CHAVE.find((t) => t.id === tipo)?.exemplo ?? '';

  function salvar(e: FormEvent) {
    e.preventDefault();
    const normalizada = chavePixUsavel(chave, tipo);
    if (!normalizada) {
      setErro(ERRO_DA_CHAVE[tipo]);
      return;
    }
    salvarOficina({ chavePix: normalizada });
    setErro(null);
    aoSalvar?.();
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl bg-papel-2 px-3.5 py-3" aria-labelledby={`${id}-titulo`}>
      <div className="flex items-start gap-2.5">
        <KeyRound size={18} className="mt-0.5 shrink-0 text-tinta-2" aria-hidden="true" />
        <div>
          <p id={`${id}-titulo`} className="font-semibold">
            {titulo}
          </p>
          <p className="text-[13.5px] text-tinta-2">O Pix cai direto na conta da oficina. O Revisaí não passa pelo pagamento.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
        <label className="sr-only" htmlFor={`${id}-tipo`}>
          Tipo da chave
        </label>
        <select id={`${id}-tipo`} className={classeEntrada} value={tipo} onChange={(e) => setTipo(e.target.value as TipoChavePix)}>
          {TIPOS_DE_CHAVE.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${id}-chave`}>
          Chave Pix
        </label>
        <input
          id={`${id}-chave`}
          className={classeEntrada}
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder={exemplo}
          autoComplete="off"
          inputMode={tipo === 'cpf' ? 'numeric' : tipo === 'telefone' ? 'tel' : tipo === 'email' ? 'email' : 'text'}
          aria-invalid={!!erro}
        />
      </div>
      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : atual ? (
        <p className="text-[13px] text-tinta-3">Agora: {chavePixParaMostrar(atual)}</p>
      ) : null}
      <Botao type="submit" variante="escuro" className="self-start">
        Salvar a chave Pix
      </Botao>
    </form>
  );
}
