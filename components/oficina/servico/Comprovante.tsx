'use client';

// O comprovante da aprovação do orçamento (Código de Defesa do Consumidor, art. 40): na tela da
// ordem, um resumo com o código de conferência; para imprimir, a folha com a oficina, o cliente,
// o carro, os itens, o total, quando, por onde, IP, aparelho e o resumo (SHA-256).

import { BadgeCheck, Mail, Printer, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao } from '@/components/ui';
import { dataHora } from '@/components/cliente/comum';
import { aparelhoDoAgente, CANAIS_DE_APROVACAO, codigoDeConferencia, conteudoDoOrcamento, versaoDoConteudo } from '@/lib/aprovacao';
import { formatarCnpj } from '@/lib/cnpj';
import { formatarData } from '@/lib/datas';
import { validoAte } from '@/lib/documentos';
import { formatarMoeda, formatarNumero, formatarPlaca, formatarTelefone, SEM_NOME } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { Documento } from '@/lib/tipos';
import { AreaDeImpressao, CaixaDoServico } from './comum';
import { useContextoDaConta, useEhMecanico } from './conta';
import { mandarCopiaDaAprovacao } from './copia';

/** O resumo guardado ainda bate com o orçamento? (null enquanto calcula). */
function useConfere(orcamento: Documento | undefined): boolean | null {
  const [confere, setConfere] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!orcamento?.aprovacao?.versao) return;
    void versaoDoConteudo(conteudoDoOrcamento(orcamento)).then((v) => {
      if (vivo) setConfere(v === orcamento.aprovacao?.versao);
    });
    return () => {
      vivo = false;
    };
  }, [orcamento]);
  return confere;
}

/** Na ordem ou no orçamento aprovado: quem aprovou, quando e por onde, com o comprovante. */
export function PainelDaAprovacao({ doc }: { doc: Documento }) {
  const orcamento = useOficina((s) => (doc.tipo === 'orcamento' ? s.documentos[doc.id] : doc.orcamentoId ? s.documentos[doc.orcamentoId] : undefined));
  const veiculo = useOficina((s) => (orcamento?.veiculoId ? s.veiculos[orcamento.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const ctx = useContextoDaConta();
  const mecanico = useEhMecanico();
  const toast = useToast();
  const confere = useConfere(orcamento);
  const [imprimindo, setImprimindo] = useState(false);
  const [mandando, setMandando] = useState(false);
  const a = orcamento?.aprovacao;
  if (!orcamento || !a) return null;
  const email = cliente?.email?.trim();

  return (
    <CaixaDoServico titulo="Aprovação do cliente" icone={<BadgeCheck size={18} aria-hidden="true" />}>
      <p className="text-[14.5px]">
        {CANAIS_DE_APROVACAO[a.canal]}, em {dataHora(a.quando)}
        {a.nome ? `, por ${a.nome}` : ''}.
        {a.observacao ? <span className="text-tinta-2"> “{a.observacao}”</span> : null}
      </p>
      {a.ip || a.agente ? (
        <p className="text-[13.5px] text-tinta-2">{[a.ip ? `IP ${a.ip}` : '', aparelhoDoAgente(a.agente)].filter(Boolean).join(' · ')}</p>
      ) : null}
      <p className="text-[13.5px] text-tinta-2">
        Código de conferência <strong className="num font-mono text-tinta">{codigoDeConferencia(a.versao)}</strong>
        {confere === true ? <span className="ml-1.5 text-ok">confere com o orçamento</span> : null}
      </p>
      {confere === false ? (
        <p className="flex items-start gap-2 rounded-lg bg-atraso-claro px-3 py-2 text-[13.5px] text-atraso">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> O orçamento mudou depois da aprovação: o resumo não bate mais.
        </p>
      ) : null}
      {a.copiaEnviadaPara ? <p className="text-[13px] text-tinta-3">Cópia mandada por e-mail para {a.copiaEnviadaPara}.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Botao tamanho="pequeno" onClick={() => setImprimindo(true)}>
          <Printer size={15} aria-hidden="true" /> Comprovante
        </Botao>
        {ctx && email && !a.copiaEnviadaPara ? (
          <Botao
            tamanho="pequeno"
            variante="fantasma"
            disabled={mandando}
            onClick={async () => {
              setMandando(true);
              const r = await mandarCopiaDaAprovacao(orcamento.id);
              setMandando(false);
              toast(r.ok ? { texto: r.enviado ? `Cópia mandada para ${email}.` : 'O e-mail da oficina ainda não está ligado.' } : { texto: r.erro ?? 'Não deu para mandar o e-mail.', tom: 'erro' });
            }}
          >
            <Mail size={15} aria-hidden="true" /> {mandando ? 'Mandando…' : 'Mandar cópia por e-mail'}
          </Botao>
        ) : null}
      </div>
      {imprimindo ? (
        <AreaDeImpressao aoTerminar={() => setImprimindo(false)}>
          <FolhaDoComprovante orcamento={orcamento} mostrarValores={!mecanico} confere={confere} />
        </AreaDeImpressao>
      ) : null}
    </CaixaDoServico>
  );
}

function FolhaDoComprovante({ orcamento, mostrarValores, confere }: { orcamento: Documento; mostrarValores: boolean; confere: boolean | null }) {
  const oficina = useOficina((s) => s.oficina);
  const veiculo = useOficina((s) => (orcamento.veiculoId ? s.veiculos[orcamento.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const a = orcamento.aprovacao!;
  const c = conteudoDoOrcamento(orcamento);
  const linha = 'border-b border-[#cbd1ce] py-1.5';
  return (
    <div className="mx-auto max-w-[180mm] text-[11pt] leading-snug text-black">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
        <div>
          <p className="text-[9pt] font-bold tracking-wide uppercase">Comprovante de aprovação</p>
          <h1 className="text-[18pt] font-extrabold">{oficina.nome || 'Oficina'}</h1>
          <p className="text-[9.5pt]">
            {[oficina.endereco, [oficina.cidade, oficina.uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ')}
            {oficina.whatsapp ? ` · WhatsApp ${formatarTelefone(oficina.whatsapp)}` : ''}
            {oficina.cnpj ? ` · CNPJ ${formatarCnpj(oficina.cnpj)}` : ''}
          </p>
        </div>
        <p className="text-right text-[11pt] font-bold">Orçamento nº {orcamento.numero}</p>
      </header>
      <section className="grid grid-cols-2 gap-x-6 gap-y-1 py-3 text-[10.5pt]">
        <p>
          <strong>Cliente:</strong> {cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : '—'}
        </p>
        <p>
          <strong>Carro:</strong> {[veiculo?.marca, veiculo?.modelo, veiculo?.ano].filter(Boolean).join(' ')} {veiculo?.placa ? `· ${formatarPlaca(veiculo.placa)}` : ''}
        </p>
        <p>
          <strong>Orçamento de:</strong> {formatarData(orcamento.data)}
        </p>
        <p>
          <strong>Válido até:</strong> {formatarData(validoAte(orcamento))}
        </p>
      </section>
      <table className="w-full border-collapse text-[10.5pt]">
        <thead>
          <tr className="text-left">
            <th className={linha}>Item aprovado</th>
            <th className={`${linha} text-right`}>Qtd.</th>
            {mostrarValores ? <th className={`${linha} text-right`}>Valor</th> : null}
          </tr>
        </thead>
        <tbody>
          {c.itens.map((i, n) => (
            <tr key={n}>
              <td className={linha}>{i.descricao}</td>
              <td className={`${linha} text-right`}>
                {formatarNumero(i.quantidade, 2)} {i.unidade}
              </td>
              {mostrarValores ? <td className={`${linha} text-right`}>{i.valorUnitario != null ? formatarMoeda(Math.round(i.quantidade * i.valorUnitario * 100) / 100) : '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {mostrarValores ? (
        <p className="mt-2 text-right text-[12pt] font-bold">
          {c.desconto ? <span className="mr-4 text-[10pt] font-normal">Desconto {formatarMoeda(c.desconto)}</span> : null}
          Total aprovado {formatarMoeda(c.total)}
        </p>
      ) : null}
      {c.recusados.length ? <p className="mt-2 text-[10pt]">Não aprovado agora: {c.recusados.join(', ')}.</p> : null}
      <section className="mt-4 flex flex-col gap-1 rounded border border-black p-3 text-[10pt]">
        <p>
          <strong>Aprovado em:</strong> {dataHora(a.quando)} · <strong>Por onde:</strong> {CANAIS_DE_APROVACAO[a.canal]}
        </p>
        {a.nome ? (
          <p>
            <strong>Nome:</strong> {a.nome}
          </p>
        ) : null}
        {a.observacao ? (
          <p>
            <strong>Resposta do cliente:</strong> {a.observacao}
          </p>
        ) : null}
        <p>
          <strong>IP:</strong> {a.ip || 'não se aplica'} · <strong>Aparelho:</strong> {aparelhoDoAgente(a.agente) || 'não informado'}
        </p>
        <p>
          <strong>Código de conferência:</strong> <span className="font-mono">{codigoDeConferencia(a.versao)}</span>
          {confere === true ? ' (confere com o orçamento)' : confere === false ? ' (o orçamento mudou depois da aprovação)' : ''}
        </p>
        <p className="font-mono text-[8.5pt] break-all">SHA-256: {a.versao}</p>
        {a.assinatura ? <img src={a.assinatura} alt={`Assinatura de ${a.nome ?? 'o cliente'}`} className="mt-2 h-20 w-auto self-start" /> : null}
        {a.copiaEnviadaPara ? <p>Cópia por e-mail para {a.copiaEnviadaPara}.</p> : null}
      </section>
      <p className="mt-3 text-[8.5pt] text-[#4b545a]">
        O código de conferência é o resumo (SHA-256) dos itens, quantidades, preços, desconto, total e validade aprovados. Se qualquer um deles mudar, o resumo muda. Feito com o Revisaí.
      </p>
    </div>
  );
}
