'use client';

// Na página do carro: o histórico verificado para a venda (os serviços que a oficina fez, com o
// nome, a cidade e o CNPJ dela vindos do banco) e o campo do CNPJ, se ainda não tem.

import { BadgeCheck, Copy, ExternalLink, MessageCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { dataHora } from '@/components/cliente/comum';
import { useToast } from '@/components/Toasts';
import { Botao, classeEntrada } from '@/components/ui';
import { cnpjValido, formatarCnpj, soNumeros } from '@/lib/cnpj';
import { historicoDesatualizado, mensagemDoHistorico } from '@/lib/historico';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoSemConta, CaixaDoServico, copiarTexto, janelaParaDepois } from './comum';
import { useContextoDaConta, useEhMecanico } from './conta';
import { publicarHistorico } from './publicar';
import { useLinkNoBanco } from './situacao';

/** O CNPJ da oficina (vai para o banco pelo cadastro e aparece no histórico e na garantia). */
export function CampoDoCnpj() {
  const cnpj = useOficina((s) => s.oficina.cnpj);
  const salvarOficina = useOficina((s) => s.salvarOficina);
  const mecanico = useEhMecanico();
  const toast = useToast();
  const [valor, setValor] = useState('');
  if (cnpj && cnpjValido(cnpj)) return null;
  if (mecanico) return <p className="text-[13px] text-tinta-3">O CNPJ da oficina ainda não foi cadastrado. Peça ao dono para escrever.</p>;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!cnpjValido(valor)) return toast({ texto: 'Confira o CNPJ: os números não batem.', tom: 'erro' });
        salvarOficina({ cnpj: soNumeros(valor) });
        toast({ texto: 'CNPJ guardado. Ele aparece no histórico e na garantia.' });
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13.5px] font-semibold">
        CNPJ da oficina, para aparecer no histórico e na garantia
        <input className={`${classeEntrada} num`} inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} onBlur={() => setValor((v) => formatarCnpj(v))} placeholder="00.000.000/0000-00" />
      </label>
      <Botao type="submit" tamanho="pequeno" className="mb-1">
        Guardar
      </Botao>
    </form>
  );
}

export function HistoricoParaVenda({ veiculoId }: { veiculoId: Id }) {
  const ctx = useContextoDaConta();
  const toast = useToast();
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const atendimentos = useOficina((s) => s.atendimentos);
  const nomeOficina = useOficina((s) => s.oficina.nome);
  const [ocupado, setOcupado] = useState(false);
  const guardado = veiculo?.links?.historico;
  const { link } = useLinkNoBanco('historico', veiculoId, !!guardado?.url);
  if (!veiculo) return null;
  const temServico = Object.values(atendimentos).some((a) => a.veiculoId === veiculoId);
  const desatualizado = !!guardado?.url && historicoDesatualizado(veiculo, atendimentos);

  async function publicar() {
    if (!ctx) return;
    setOcupado(true);
    const r = await publicarHistorico(veiculoId, ctx);
    setOcupado(false);
    toast(r.ok ? { texto: 'Histórico atualizado.' } : { texto: r.erro, tom: 'erro' });
  }

  async function mandar() {
    if (!ctx) return;
    const tel = cliente?.telefone;
    const janela = tel ? janelaParaDepois() : null;
    setOcupado(true);
    const r = await publicarHistorico(veiculoId, ctx);
    setOcupado(false);
    if (!r.ok || !r.link.url) {
      janela?.fechar();
      return toast({ texto: r.ok ? 'O link não ficou pronto.' : r.erro, tom: 'erro' });
    }
    const texto = mensagemDoHistorico({ oficina: nomeOficina, carro: veiculo.modelo, placa: veiculo.placa, link: r.link.url });
    const zap = tel ? linkWhatsApp(tel, texto) : null;
    if (janela && zap) janela.ir(zap);
    else toast({ texto: (await copiarTexto(texto)) ? 'Mensagem com o histórico copiada.' : 'Histórico publicado.' });
  }

  return (
    <CaixaDoServico titulo="Histórico para a venda do carro" icone={<BadgeCheck size={18} aria-hidden="true" />}>
      <p className="text-[14px] text-tinta-2">Um link com os serviços que a oficina fez neste carro, com data, km, peças e marcas, confirmados com o nome e o CNPJ da oficina. Ajuda o cliente a vender o carro.</p>
      {!ctx ? (
        <AvisoSemConta />
      ) : !temServico ? (
        <>
          <p className="text-[13.5px] text-tinta-3">Aparece depois do primeiro serviço registrado.</p>
          <CampoDoCnpj />
        </>
      ) : (
        <>
          {guardado?.url ? (
            <p className="text-[13.5px] text-tinta-2">
              {desatualizado ? 'Tem serviço novo que ainda não está no link.' : `Atualizado em ${dataHora(guardado.publicadoEm ?? link?.atualizadoEm)}.`}
              {link?.vistas ? ` Aberto ${link.vistas === 1 ? '1 vez' : `${link.vistas} vezes`}.` : ''}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Botao variante="whatsapp" tamanho="pequeno" disabled={ocupado} onClick={() => void mandar()}>
              <MessageCircle size={15} aria-hidden="true" /> {guardado?.url ? 'Mandar o histórico' : 'Criar e mandar o histórico'}
            </Botao>
            {guardado?.url ? (
              <>
                {desatualizado ? (
                  <Botao tamanho="pequeno" disabled={ocupado} onClick={() => void publicar()}>
                    <RefreshCw size={15} aria-hidden="true" /> Atualizar
                  </Botao>
                ) : null}
                <Botao tamanho="pequeno" variante="fantasma" onClick={async () => toast({ texto: (await copiarTexto(guardado.url!)) ? 'Link copiado.' : 'Não deu para copiar.' })}>
                  <Copy size={15} aria-hidden="true" /> Copiar link
                </Botao>
                <a href={guardado.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 px-2 text-sm font-semibold text-caneta hover:underline">
                  <ExternalLink size={15} aria-hidden="true" /> Ver
                </a>
              </>
            ) : null}
          </div>
          <CampoDoCnpj />
        </>
      )}
    </CaixaDoServico>
  );
}
