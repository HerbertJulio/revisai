'use client';

// O Pix da oficina: a chave (que vai no lembrete do fiado e no QR do balcão) e o QR Code com o
// valor digitado, para o cliente pagar ali na hora. É Pix estático: o dinheiro cai direto na
// conta da oficina, e o Revisaí não passa pelo pagamento.

import { Check, Copy, KeyRound, QrCode as IconeQr } from 'lucide-react';
import { useState } from 'react';
import { QrCode } from '@/components/QrCode';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Secao, classeEntrada } from '@/components/ui';
import { adivinharTipoDaChave, chavePixDaOficina, montarLancamentos, NOMES_TIPO_CHAVE, pixDaOficina, tipoDaChavePix } from '@/lib/financeiro';
import { formatarMoeda, formatarNumero, lerNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { formatarChavePix, normalizarChavePix, type TipoChavePix } from '@/lib/pix';
import { useOficina } from '@/lib/store';
import { gerarId } from './comum';

const ERRO_CHAVE: Record<TipoChavePix, string> = {
  cnpj: 'O CNPJ tem 14 letras e números, como aparece no cartão do CNPJ.',
  cpf: 'O CPF tem 11 números.',
  email: 'Confira o e-mail da chave.',
  telefone: 'Escreva o celular da chave com DDD.',
  aleatoria: 'A chave aleatória tem 32 letras e números, com tracinhos, como aparece no app do banco.'
};

/** A chave guardada, como a pessoa lê ("CPF 123.456.789-09"). */
export function textoDaChave(chave: string | null | undefined): string | null {
  const tipo = tipoDaChavePix(chave);
  if (!tipo || !chave) return null;
  return `${NOMES_TIPO_CHAVE[tipo]} ${formatarChavePix(tipo, chave)}`;
}

export function ChavePixDaOficina({ id }: { id?: string }) {
  const oficina = useOficina((s) => s.oficina);
  const salvarOficina = useOficina((s) => s.salvarOficina);
  const toast = useToast();
  const atual = chavePixDaOficina(oficina);
  const [editando, setEditando] = useState(!atual);
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<TipoChavePix>('cpf');
  const [tipoEscolhido, setTipoEscolhido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    const t = texto.trim();
    if (!t) return setErro('Escreva a chave Pix.');
    // chave aleatória colada sem os tracinhos
    const bruto = tipo === 'aleatoria' && /^[0-9a-f]{32}$/i.test(t) ? `${t.slice(0, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}-${t.slice(16, 20)}-${t.slice(20)}` : t;
    const chave = normalizarChavePix(tipo, bruto);
    if (!chave) return setErro(ERRO_CHAVE[tipo]);
    salvarOficina({ chavePix: chave });
    setErro(null);
    setTexto('');
    setEditando(false);
    toast({ texto: 'Chave Pix salva. Ela vai no lembrete do fiado e no QR do balcão.' });
  }

  return (
    <Secao id={id} titulo="Chave Pix da oficina" descricao="Os clientes pagam direto nesta chave. Confira com cuidado.">
      <div className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
        {atual && !editando ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok-claro text-ok">
              <KeyRound size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="num font-bold break-all">{textoDaChave(atual)}</p>
              <p className="text-[13.5px] text-tinta-3">
                No Pix aparece {oficina.razaoSocial?.trim() || oficina.nome || 'a oficina'}
                {oficina.cidade ? `, ${oficina.cidade}` : ''}. O nome e a cidade mudam em Ajustes.
              </p>
            </div>
            <Botao tamanho="pequeno" onClick={() => setEditando(true)}>
              Trocar
            </Botao>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Campo rotulo="Tipo" htmlFor="pix-tipo">
                <select
                  id="pix-tipo"
                  className={classeEntrada}
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value as TipoChavePix);
                    setTipoEscolhido(true);
                  }}
                >
                  {(Object.keys(NOMES_TIPO_CHAVE) as TipoChavePix[]).map((t) => (
                    <option key={t} value={t}>
                      {NOMES_TIPO_CHAVE[t]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Chave" htmlFor="pix-chave" erro={erro}>
                <input
                  id="pix-chave"
                  className={classeEntrada}
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    setErro(null);
                    if (!tipoEscolhido && e.target.value.trim()) setTipo(adivinharTipoDaChave(e.target.value));
                  }}
                  placeholder="CPF, CNPJ, celular, e-mail ou chave aleatória"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Campo>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao variante="escuro" onClick={salvar}>
                Salvar a chave
              </Botao>
              {atual ? (
                <Botao variante="fantasma" onClick={() => (setEditando(false), setErro(null))}>
                  Cancelar
                </Botao>
              ) : null}
              {atual ? (
                <Botao
                  variante="fantasma"
                  className="ml-auto"
                  onClick={() => {
                    if (!window.confirm('Tirar a chave Pix? O lembrete do fiado vai sem o código.')) return;
                    salvarOficina({ chavePix: '' });
                    setEditando(true);
                  }}
                >
                  Tirar a chave
                </Botao>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Secao>
  );
}

/** QR Code do Pix com o valor, para o cliente pagar no balcão; depois, registra no caixa. */
export function PixNoBalcao({ aoFaltarChave }: { aoFaltarChave?: () => void }) {
  const oficina = useOficina((s) => s.oficina);
  const salvar = useOficina((s) => s.salvarRegistro);
  const hoje = useHoje();
  const toast = useToast();
  const [valorTexto, setValorTexto] = useState('');
  const [descricao, setDescricao] = useState('');
  const valor = lerNumero(valorTexto);
  const chave = chavePixDaOficina(oficina);
  const codigo = valor && valor > 0 && valor <= 1_000_000 ? pixDaOficina(oficina, valor, 'BALCAO') : null;

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      toast({ texto: 'Código copiado.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Mostre o QR Code para o cliente.', tom: 'erro' });
    }
  }

  function registrar() {
    if (!valor || valor <= 0) return;
    const [l] = montarLancamentos({ tipo: 'receber', descricao: descricao.trim() || 'Pix no balcão', valor, vencimento: hoje, forma: 'pix', categoria: 'servico', pagoEm: hoje }, gerarId);
    if (l) salvar('lancamentos', l);
    toast({ texto: `${formatarMoeda(valor)} no caixa de hoje, no Pix.` });
    setValorTexto('');
    setDescricao('');
  }

  if (!chave)
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-linha px-5 py-6">
        <p className="font-bold">Cadastre a chave Pix da oficina</p>
        <p className="text-tinta-2">Com a chave, o app monta o QR Code com o valor certo para o cliente pagar no balcão, e o lembrete do fiado já vai com o Pix copia e cola.</p>
        {aoFaltarChave ? <Botao onClick={aoFaltarChave}>Cadastrar a chave</Botao> : null}
      </div>
    );

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <Campo rotulo="Valor" htmlFor="balcao-valor">
          <input id="balcao-valor" className={`${classeEntrada} num text-[20px] font-bold`} value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} inputMode="decimal" placeholder="0,00" autoComplete="off" />
        </Campo>
        <Campo rotulo="Do que é (para o caixa)" htmlFor="balcao-desc">
          <input id="balcao-desc" className={classeEntrada} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Troca de óleo do Corsa" maxLength={120} />
        </Campo>
      </div>
      {codigo && valor ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <QrCode texto={codigo} rotulo={`QR Code do Pix de ${formatarMoeda(valor)}`} className="h-56 w-56 shrink-0 rounded-xl ring-1 ring-linha" />
          <div className="flex w-full min-w-0 flex-col gap-2">
            <p className="largo num text-[28px] leading-none font-extrabold">{formatarMoeda(valor)}</p>
            <p className="text-[14px] text-tinta-2">O cliente abre o app do banco, escolhe pagar com Pix e aponta a câmera. Ou copie o código e mande para ele.</p>
            <p className="num rounded-lg bg-papel-2 px-3 py-2 text-[12.5px] break-all text-tinta-2" aria-label="Pix copia e cola">
              {codigo}
            </p>
            <div className="flex flex-wrap gap-2">
              <Botao onClick={copiar}>
                <Copy size={16} aria-hidden="true" /> Copiar o código
              </Botao>
              <Botao variante="primario" onClick={registrar}>
                <Check size={17} aria-hidden="true" /> Caiu, pôr no caixa
              </Botao>
            </div>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[14px] text-tinta-3">
          <IconeQr size={16} aria-hidden="true" /> Escreva o valor para aparecer o QR Code{valor && valor > 1_000_000 ? ` (até ${formatarNumero(1_000_000)} reais)` : ''}.
        </p>
      )}
    </div>
  );
}
