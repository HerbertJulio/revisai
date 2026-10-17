'use client';

// No detalhe da ordem (só para o dono e o gerente): cobrar o cliente por Pix pelo WhatsApp. O
// valor sugerido é o que ainda não entrou no caixa da ordem (o mesmo do pagamento da OS). Com a
// conta, a mensagem leva a página do Pix (QR Code, código e o botão "Já paguei"); sem conta, só o
// código Pix. O aviso do cliente aparece aqui para a oficina confirmar quando o Pix cair.

import { Check, MessageCircle, QrCode as IconeQr } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, classeEntrada } from '@/components/ui';
import {
  avisoPendente,
  dadosDoPagamento,
  descricaoDaOrdem,
  DIAS_DO_LINK,
  lerDadosDoPagamento,
  lerValorDaCobranca,
  mensagemDeCobranca,
  novoTxid,
  podeCobrar,
  recebedorDaOficina,
  refDaCobranca,
  valorParaCobrar
} from '@/lib/cobranca-cliente';
import { formatarDiaHora } from '@/lib/datas';
import { formatarMoeda, formatarNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { publicarLink } from '@/lib/links-publicos';
import { useOficina } from '@/lib/store';
import type { Documento } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { ChavePixDaOficina } from '../financeiro/Pix';
import type { ContextoDaConta } from '../servico/conta';
import { AvisoDePagamento } from './Avisos';
import { useGestao } from './gestao';
import { confirmarPagamento, useLinksDeCobranca } from './links';
import { MensagemPronta } from './Mensagem';

export function PainelCobranca({ doc }: { doc: Documento }) {
  const { gestao, ctx } = useGestao();
  if (!gestao || !podeCobrar(doc)) return null;
  return <Cobranca doc={doc} ctx={ctx} />;
}

interface Pronta {
  texto: string;
  whatsapp: string | null;
  link: string | null;
}

function Cobranca({ doc, ctx }: { doc: Documento; ctx: ContextoDaConta | null }) {
  const hoje = useHoje();
  const toast = useToast();
  const lancamentos = useOficina((s) => s.lancamentos);
  const oficina = useOficina((s) => s.oficina);
  const veiculo = useOficina((s) => (doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const falta = useMemo(() => valorParaCobrar(doc, Object.values(lancamentos)), [doc, lancamentos]);
  const { links, recarregar } = useLinksDeCobranca(ctx?.sb ?? null, ctx?.oficinaId ?? null, { documentoId: doc.id });
  const avisos = links.filter((l) => avisoPendente(l));
  const ultima = links.find((l) => l.tipo === 'pagamento');
  const dadosDaUltima = ultima ? lerDadosDoPagamento(ultima.dados) : null;
  const [abrindo, setAbrindo] = useState(false);
  const [valorTexto, setValorTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pronta, setPronta] = useState<Pronta | null>(null);
  const recebedor = recebedorDaOficina(oficina);

  if (falta <= 0 && !avisos.length && !ultima && !pronta) return null;

  function abrir() {
    setValorTexto(falta > 0 ? formatarNumero(falta, 2) : '');
    setErro(null);
    setPronta(null);
    setAbrindo(true);
  }

  function mensagem(valor: number, descricao: string, link: string | null, pix: string): Pronta {
    const texto = mensagemDeCobranca({ oficina: oficina.nome, cliente: cliente?.nome ?? '', valor, descricao, link, pix });
    return { texto, whatsapp: cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null, link };
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    const valor = lerValorDaCobranca(valorTexto);
    if (!valor) return setErro('Escreva o valor da cobrança.');
    const r = recebedorDaOficina(useOficina.getState().oficina);
    if (!r) return setErro('Cadastre a chave Pix da oficina primeiro.');
    const descricao = descricaoDaOrdem(doc, veiculo);
    const dados = dadosDoPagamento({
      recebedor: r,
      valor,
      descricao,
      titulo: `OS nº ${doc.numero}`,
      cliente: cliente?.nome ?? '',
      oficina: oficina.nome,
      hoje,
      txid: novoTxid(`OS${doc.numero}`),
      documentoId: doc.id
    });
    let link: string | null = null;
    if (ctx) {
      setOcupado(true);
      const p = await publicarLink(ctx.sb, window.location.origin, { oficinaId: ctx.oficinaId, tipo: 'pagamento', ref: refDaCobranca(doc.id), dados, dias: DIAS_DO_LINK });
      setOcupado(false);
      if (p.ok) {
        link = p.link.url ?? null;
        const s = useOficina.getState();
        const atual = s.documentos[doc.id];
        if (atual) s.salvarDocumento({ ...atual, links: { ...atual.links, pagamento: p.link } });
        void recarregar();
      } else {
        toast({ texto: `${p.erro} A mensagem vai só com o código Pix.`, tom: 'erro' });
      }
    }
    setPronta(mensagem(valor, descricao, link, dados.pix));
    setAbrindo(false);
  }

  function mandarDeNovo() {
    if (!ultima || !dadosDaUltima) return;
    const guardado = doc.links?.pagamento;
    const link = guardado?.url && guardado.codigo === ultima.codigo ? guardado.url : null;
    setPronta(mensagem(dadosDaUltima.valor, dadosDaUltima.descricao, link, dadosDaUltima.pix));
  }

  async function jaRecebi() {
    if (!ultima || !ctx || !dadosDaUltima) return;
    if (!window.confirm(`O Pix de ${formatarMoeda(dadosDaUltima.valor)} caiu na conta da oficina?`)) return;
    setOcupado(true);
    const c = await confirmarPagamento(ultima, ctx.sb, ctx.oficinaId, hoje);
    setOcupado(false);
    if (!c.ok) return toast({ texto: c.erro ?? 'Não deu para confirmar agora.', tom: 'erro' });
    toast({ texto: c.jaTratado ? 'Outro aparelho já tinha confirmado este Pix.' : `${formatarMoeda(dadosDaUltima.valor)} no caixa de hoje.` });
    void recarregar();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl px-3.5 py-3 ring-1 ring-linha" aria-label="Cobrança por Pix">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold">
          <IconeQr size={17} aria-hidden="true" /> Cobrança por Pix
        </h3>
        {dadosDaUltima?.pago ? <Chip tom="ok">Pix confirmado</Chip> : null}
      </div>

      {ctx
        ? avisos.map((l) => (
            <AvisoDePagamento key={l.id} l={l} ctx={ctx} aoTratar={() => void recarregar()} />
          ))
        : null}

      {ultima && dadosDaUltima && !dadosDaUltima.pago && !avisoPendente(ultima) && !pronta && !abrindo ? (
        <div className="flex flex-col gap-1.5 text-[14px]">
          <p className="text-tinta-2">
            Cobrança de <span className="num font-semibold text-tinta">{formatarMoeda(dadosDaUltima.valor)}</span> criada {formatarDiaHora(ultima.criadoEm)}
            {ultima.codigo ? <span className="num"> (código {ultima.codigo})</span> : null}. Quando o cliente pagar, ele avisa pela página.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={mandarDeNovo} className="font-semibold text-caneta hover:underline">
              Mandar de novo
            </button>
            <button type="button" onClick={jaRecebi} disabled={ocupado} className="font-semibold text-caneta hover:underline disabled:opacity-50">
              Já recebi este Pix
            </button>
          </div>
        </div>
      ) : null}

      {pronta ? (
        <MensagemPronta texto={pronta.texto} whatsapp={pronta.whatsapp} link={pronta.link} />
      ) : abrindo ? (
        recebedor ? (
          <form onSubmit={criar} className="flex flex-col gap-3">
            <Campo rotulo="Valor da cobrança" htmlFor={`cobrar-${doc.id}`} erro={erro} dica={falta > 0 ? `Falta entrar ${formatarMoeda(falta)} desta ordem.` : undefined}>
              <input
                id={`cobrar-${doc.id}`}
                className={`${classeEntrada} num text-[20px] font-bold`}
                value={valorTexto}
                onChange={(e) => (setValorTexto(e.target.value), setErro(null))}
                inputMode="decimal"
                placeholder="0,00"
                autoComplete="off"
              />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Botao type="submit" variante="whatsapp" disabled={ocupado}>
                <Check size={17} aria-hidden="true" /> Criar a cobrança
              </Botao>
              <Botao variante="fantasma" onClick={() => setAbrindo(false)}>
                Cancelar
              </Botao>
            </div>
            {!ctx ? <p className="text-[13px] text-tinta-3">Sem a conta da oficina, a mensagem vai só com o código Pix (sem a página com o botão "Já paguei").</p> : null}
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <ChavePixDaOficina />
            <Botao variante="fantasma" className="self-start" onClick={() => setAbrindo(false)}>
              Cancelar
            </Botao>
          </div>
        )
      ) : falta > 0 ? (
        <Botao variante="whatsapp" className="self-start" onClick={abrir}>
          <MessageCircle size={17} aria-hidden="true" /> Cobrar pelo WhatsApp
        </Botao>
      ) : null}

      {pronta ? (
        <button type="button" onClick={() => setPronta(null)} className="self-start text-[13.5px] font-semibold text-tinta-3 hover:text-tinta">
          Fechar a mensagem
        </button>
      ) : null}
      <p className="text-[12.5px] text-tinta-3">O Pix cai direto na conta da oficina. O Revisaí não passa pelo pagamento.</p>
    </section>
  );
}
