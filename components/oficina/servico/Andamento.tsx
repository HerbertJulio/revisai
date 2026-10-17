'use client';

// O andamento do serviço na ordem: as etapas que o cliente acompanha pelo link (recebido,
// diagnóstico, aguardando peças, em serviço, pronto, entregue), com nota e fotos. Cada mudança
// republica o link; a primeira vez vai pelo WhatsApp.

import { Activity, Camera, Check, Copy, MessageCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, classeArea } from '@/components/ui';
import { dataHora } from '@/components/cliente/comum';
import { mensagemDoAndamento, nomeDaEtapa, passosDoAndamento, podeMudarPara, proximaEtapa, registrarEtapa } from '@/lib/andamento';
import { useOficina } from '@/lib/store';
import type { Documento, EtapaServico } from '@/lib/tipos';
import type { FotoRegistro } from '@/lib/registros-oficina';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoSemConta, CaixaDoServico, copiarTexto, janelaParaDepois } from './comum';
import { useContextoDaConta } from './conta';
import { enderecoDaFotoRegistro, enviarFoto } from './fotos';
import { publicarAndamento } from './publicar';
import { useLinkNoBanco } from './situacao';

export function PainelDoAndamento({ doc }: { doc: Documento }) {
  const ctx = useContextoDaConta();
  const toast = useToast();
  const veiculo = useOficina((s) => (doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const nomeOficina = useOficina((s) => s.oficina.nome);
  const [editando, setEditando] = useState<EtapaServico | null>(null);
  const [nota, setNota] = useState('');
  const [fotos, setFotos] = useState<FotoRegistro[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const guardado = doc.links?.andamento;
  const { link } = useLinkNoBanco('andamento', doc.id, !!guardado);

  if (doc.tipo !== 'ordem' || doc.situacao === 'cancelada') return null;
  const passos = passosDoAndamento(doc);
  const proxima = proximaEtapa(doc);
  const fotoPorId = new Map((doc.fotos ?? []).map((f) => [f.id, f]));
  const recentes = [...(doc.andamento ?? [])].reverse().slice(0, 3);

  function abrir(e: EtapaServico) {
    const ok = podeMudarPara(doc, e);
    if (!ok.ok) return toast({ texto: ok.motivo, tom: 'erro' });
    setEditando(e);
    setNota('');
    setFotos([]);
  }

  async function adicionarFotos(arquivos: FileList | null) {
    if (!ctx || !arquivos?.length) return;
    setOcupado(true);
    for (const arquivo of Array.from(arquivos).slice(0, 6 - fotos.length)) {
      const r = await enviarFoto(ctx, 'andamento', arquivo);
      if (r.ok) setFotos((x) => [...x, r.foto]);
      else toast({ texto: r.erro, tom: 'erro' });
    }
    setOcupado(false);
  }

  async function salvar() {
    if (!editando) return;
    const atual = useOficina.getState().documentos[doc.id];
    if (!atual) return;
    const mud = registrarEtapa(atual, editando, new Date().toISOString(), { nota, fotoIds: fotos.map((f) => f.id) });
    if (!mud) {
      setEditando(null);
      return;
    }
    useOficina.getState().salvarDocumento({ ...atual, ...mud, fotos: [...(atual.fotos ?? []), ...fotos].slice(-60) });
    setEditando(null);
    toast({ texto: `${nomeDaEtapa(editando)}: anotado.${guardado?.url ? ' O cliente já vê pelo link.' : ''}` });
    if (ctx && guardado?.url) {
      const r = await publicarAndamento(doc.id, ctx);
      if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
    }
  }

  async function mandar() {
    if (!ctx) return;
    const tel = cliente?.telefone;
    const janela = tel ? janelaParaDepois() : null;
    setOcupado(true);
    const r = await publicarAndamento(doc.id, ctx);
    setOcupado(false);
    if (!r.ok || !r.link.url) {
      janela?.fechar();
      return toast({ texto: r.ok ? 'O link não ficou pronto.' : r.erro, tom: 'erro' });
    }
    const texto = mensagemDoAndamento({ oficina: nomeOficina, cliente: cliente?.nome ?? '', carro: veiculo?.modelo ?? '', placa: veiculo?.placa ?? '', link: r.link.url });
    const zap = tel ? linkWhatsApp(tel, texto) : null;
    if (janela && zap) janela.ir(zap);
    else toast({ texto: (await copiarTexto(texto)) ? 'Mensagem com o link copiada.' : 'Link pronto. Copie no botão.' });
  }

  return (
    <CaixaDoServico titulo="Andamento para o cliente" icone={<Activity size={18} aria-hidden="true" />}>
      <ol className="flex flex-wrap gap-1.5" aria-label="Etapas do serviço">
        {passos.map((p) => (
          <li key={p.etapa}>
            <button
              type="button"
              onClick={() => abrir(p.etapa)}
              aria-current={p.estado === 'atual' ? 'step' : undefined}
              className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold ${
                p.estado === 'atual' ? 'bg-caneta text-papel' : p.estado === 'feita' ? 'bg-ok-claro text-ok' : 'bg-papel-2 text-tinta-3 hover:text-tinta'
              }`}
              title={p.quando ? dataHora(p.quando) : undefined}
            >
              {p.estado === 'feita' ? <Check size={13} aria-hidden="true" /> : null}
              {p.nome}
            </button>
          </li>
        ))}
      </ol>

      {editando ? (
        <div className="flex flex-col gap-2.5 rounded-lg bg-papel-2 px-3 py-3">
          <p className="text-[14.5px] font-semibold">{nomeDaEtapa(editando)}</p>
          <textarea className={classeArea} rows={2} maxLength={300} placeholder="Nota para o cliente (opcional). Ex.: A peça chega amanhã cedo." value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota para o cliente" />
          {fotos.length ? (
            <div className="flex flex-wrap gap-2">
              {fotos.map((f) => (
                <span key={f.id} className="relative">
                  <img src={enderecoDaFotoRegistro(f) ?? ''} alt="Foto para o cliente" className="h-16 w-16 rounded-lg object-cover ring-1 ring-linha" />
                  <button type="button" onClick={() => setFotos((x) => x.filter((y) => y.id !== f.id))} className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-tinta text-papel" aria-label="Tirar a foto">
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="escuro" tamanho="pequeno" disabled={ocupado} onClick={() => void salvar()}>
              <Check size={15} aria-hidden="true" /> {ocupado ? 'Guardando foto…' : 'Salvar'}
            </Botao>
            {ctx ? (
              <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-linha bg-papel px-3 text-sm font-semibold ${ocupado || fotos.length >= 6 ? 'pointer-events-none opacity-45' : ''}`}>
                <Camera size={15} aria-hidden="true" /> Foto
                <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => void adicionarFotos(e.target.files).then(() => (e.target.value = ''))} />
              </label>
            ) : (
              <span className="text-[13px] text-tinta-3">Fotos para o cliente só com a conta.</span>
            )}
            <Botao variante="fantasma" tamanho="pequeno" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : proxima ? (
        <Botao tamanho="pequeno" className="self-start" onClick={() => abrir(proxima)}>
          Marcar: {nomeDaEtapa(proxima)}
        </Botao>
      ) : doc.situacao !== 'concluida' ? (
        <p className="text-[13.5px] text-tinta-3">Conclua a ordem para marcar como entregue.</p>
      ) : null}

      {recentes.length ? (
        <ul className="flex flex-col gap-1.5 text-[13.5px]">
          {recentes.map((a, i) => (
            <li key={`${a.quando}-${i}`} className="text-tinta-2">
              <span className="font-semibold text-tinta">{nomeDaEtapa(a.etapa)}</span>, {dataHora(a.quando)}
              {a.nota ? `: ${a.nota}` : ''}
              {a.fotoIds?.length ? (
                <span className="mt-1 flex gap-1.5">
                  {a.fotoIds.map((id) => {
                    const f = fotoPorId.get(id);
                    const src = f ? enderecoDaFotoRegistro(f) : null;
                    return src ? <img key={id} src={src} alt={`Foto da etapa ${nomeDaEtapa(a.etapa).toLowerCase()}`} className="h-12 w-12 rounded-md object-cover ring-1 ring-linha" /> : null;
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!ctx ? (
        <AvisoSemConta />
      ) : guardado?.url ? (
        <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-tinta-2">
          <span>O cliente acompanha pelo link{link?.vistas ? `, aberto ${link.vistas === 1 ? '1 vez' : `${link.vistas} vezes`}` : ''}.</span>
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-caneta hover:underline" onClick={async () => toast({ texto: (await copiarTexto(guardado.url!)) ? 'Link copiado.' : 'Não deu para copiar.' })}>
            <Copy size={14} aria-hidden="true" /> Copiar link
          </button>
        </div>
      ) : (
        <Botao variante="whatsapp" tamanho="pequeno" className="self-start" disabled={ocupado} onClick={() => void mandar()}>
          <MessageCircle size={15} aria-hidden="true" /> Mandar o acompanhamento
        </Botao>
      )}
    </CaixaDoServico>
  );
}
