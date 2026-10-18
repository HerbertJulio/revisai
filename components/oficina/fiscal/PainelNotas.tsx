'use client';

// Na ordem de serviço concluída (só para o dono e o gerente): a nota de serviço (NFS-e) da mão de
// obra e a nota das peças (NF-e), pelo emissor de notas. Pede o que falta do cliente (CPF ou CNPJ,
// e-mail, endereço) e o NCM das peças, e guarda no cadastro para a próxima. A situação vem do
// aviso do emissor e da consulta enquanto a nota processa; o resumo fica na ordem (documento.nota).

import { Ban, Download, FileText, Receipt, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { cancelarNota, consultarNota, emitirNota } from '@/app/oficina/fiscal/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { COLUNAS_DA_NOTA, lerNotaFiscal, NOMES_DA_NOTA, notasDaOrdem, podeCancelar, resumoDaNota, resumoMudou, SITUACOES_DA_NOTA, type NotaFiscal } from '@/lib/fiscal/dados';
import { formatarCpfCnpj } from '@/lib/fiscal/identificacao';
import { descricaoDoServico, formatarEndereco, lerConfigFiscal, lerEndereco, ncmValido, partesDaOrdem, pecasDaOrdem, problemaDoTomador, UFS, type ConfigFiscal } from '@/lib/fiscal/payload';
import type { NomeProvedorFiscal, Tomador, TipoNota } from '@/lib/fiscal/tipos';
import { formatarMoeda, formatarPlaca, SEM_NOME } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { Documento } from '@/lib/tipos';
import { useGestao } from '../cobranca-cliente/gestao';
import type { ContextoDaConta } from '../servico/conta';
import { perguntarEstado } from './estado';

/** Se o emissor está ligado no servidor (pergunta uma vez por aba). */
export function useEstadoDoEmissor() {
  const [estado, setEstado] = useState<{ ligado: boolean; provedor: NomeProvedorFiscal | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    void perguntarEstado().then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

export function PainelNotas({ doc }: { doc: Documento }) {
  const { gestao, ctx, plano } = useGestao();
  if (!gestao || doc.tipo !== 'ordem' || doc.situacao !== 'concluida') return null;
  if (!ctx) return null;
  return <Notas doc={doc} ctx={ctx} gratis={plano === 'gratis'} />;
}

function Notas({ doc, ctx, gratis }: { doc: Documento; ctx: ContextoDaConta; gratis: boolean }) {
  const estado = useEstadoDoEmissor();
  const [config, setConfig] = useState<ConfigFiscal | null | undefined>(undefined);
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [emitindo, setEmitindo] = useState<TipoNota | null>(null);
  const partes = useMemo(() => partesDaOrdem(doc), [doc]);

  const carregar = useCallback(async () => {
    const [c, n] = await Promise.all([
      ctx.sb.from('oficinas_fiscal').select('*').eq('oficina_id', ctx.oficinaId).maybeSingle(),
      ctx.sb.from('notas_fiscais').select(COLUNAS_DA_NOTA).eq('oficina_id', ctx.oficinaId).eq('documento_id', doc.id).order('criado_em', { ascending: false }).limit(20)
    ]);
    if (!c.error) setConfig(lerConfigFiscal(c.data));
    if (!n.error) setNotas((n.data ?? []).map(lerNotaFiscal).filter((x): x is NotaFiscal => !!x));
  }, [ctx, doc.id]);

  useEffect(() => {
    void carregar().catch(() => setConfig((x) => (x === undefined ? null : x)));
  }, [carregar]);

  const atuais = useMemo(() => notasDaOrdem(notas, doc.id), [notas, doc.id]);

  // o resumo na ordem acompanha a nota (sincroniza com os outros aparelhos)
  useEffect(() => {
    const resumo = resumoDaNota(atuais);
    const s = useOficina.getState();
    const d = s.documentos[doc.id];
    if (d && resumoMudou(d.nota, resumo)) s.salvarDocumento({ ...d, nota: resumo });
  }, [atuais, doc.id]);

  // enquanto processa: pergunta ao emissor (e relê, para pegar o que o aviso já trouxe)
  const processando = Object.values(atuais)
    .filter((n): n is NotaFiscal => n?.situacao === 'processando')
    .map((n) => n.id)
    .join(',');
  useEffect(() => {
    if (!processando) return;
    let vezes = 0;
    let parado = false;
    const t = setInterval(async () => {
      if (parado || document.visibilityState !== 'visible') return;
      vezes++;
      for (const id of processando.split(',')) {
        const r = await consultarNota(id).catch(() => null);
        if (r?.ok) setNotas((lista) => lista.map((n) => (n.id === r.nota.id ? r.nota : n)));
      }
      await carregar().catch(() => {});
      if (vezes >= 45) clearInterval(t);
    }, 4000);
    return () => {
      parado = true;
      clearInterval(t);
    };
  }, [processando, carregar]);

  function receber(n: NotaFiscal) {
    setNotas((lista) => [n, ...lista.filter((x) => x.id !== n.id)]);
  }

  let corpo: ReactNode;
  if (!estado || config === undefined) corpo = <p className="text-[14px] text-tinta-3">Vendo as notas desta ordem...</p>;
  else if (!estado.ligado) corpo = <p className="text-[14px] text-tinta-3">As notas fiscais ainda não estão ligadas no Revisaí.</p>;
  else if (gratis)
    corpo = (
      <p className="text-[14px] text-tinta-2">
        A nota fiscal é do Pro.{' '}
        <Link href="/oficina/assinatura" className="font-semibold text-caneta hover:underline">
          Ver o Pro
        </Link>
      </p>
    );
  else if (!config)
    corpo = (
      <p className="text-[14px] text-tinta-2">
        Para emitir a nota desta ordem, cadastre os dados fiscais da oficina.{' '}
        <Link href="/oficina/fiscal" className="font-semibold text-caneta hover:underline">
          Cadastrar
        </Link>
      </p>
    );
  else
    corpo = (
      <>
        {(['nfse', 'nfe'] as const).map((tipo) => {
          const valor = tipo === 'nfse' ? partes.valorNfse : partes.valorNfe;
          const nota = atuais[tipo];
          if (!(valor > 0) && !nota) return null;
          return (
            <BlocoDaNota
              key={tipo}
              tipo={tipo}
              valor={valor}
              nota={nota ?? null}
              doc={doc}
              config={config}
              emitindo={emitindo === tipo}
              aoEmitir={() => setEmitindo(tipo)}
              aoFechar={() => setEmitindo(null)}
              aoReceber={(n) => {
                receber(n);
                setEmitindo(null);
              }}
            />
          );
        })}
        {!(partes.valorNfse > 0) && !(partes.valorNfe > 0) && !notas.length ? <p className="text-[14px] text-tinta-3">Esta ordem não tem valor para nota fiscal.</p> : null}
        {config.ambiente === 'homologacao' ? <p className="text-[12.5px] text-tinta-3">Ambiente de homologação: as notas são de teste, sem valor fiscal.</p> : null}
      </>
    );

  return (
    <section className="flex flex-col gap-3 rounded-xl px-3.5 py-3 ring-1 ring-linha" aria-label="Notas fiscais">
      <h3 className="flex items-center gap-2 font-bold">
        <Receipt size={17} aria-hidden="true" /> Notas fiscais
      </h3>
      {corpo}
    </section>
  );
}

function BlocoDaNota({
  tipo,
  valor,
  nota,
  doc,
  config,
  emitindo,
  aoEmitir,
  aoFechar,
  aoReceber
}: {
  tipo: TipoNota;
  valor: number;
  nota: NotaFiscal | null;
  doc: Documento;
  config: ConfigFiscal;
  emitindo: boolean;
  aoEmitir: () => void;
  aoFechar: () => void;
  aoReceber: (n: NotaFiscal) => void;
}) {
  const toast = useToast();
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const nomes = NOMES_DA_NOTA[tipo];
  const s = nota ? SITUACOES_DA_NOTA[nota.situacao] : null;
  const deNovo = nota && (nota.situacao === 'erro' || nota.situacao === 'cancelada');

  async function cancelar(e: FormEvent) {
    e.preventDefault();
    if (!nota) return;
    setOcupado(true);
    const r = await cancelarNota(nota.id, motivo);
    setOcupado(false);
    if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
    aoReceber(r.nota);
    setCancelando(false);
    setMotivo('');
    toast({ texto: `${nomes.curto} cancelada.` });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-linha pt-3 first:border-t-0 first:pt-0" data-nota={tipo}>
      <div className="flex flex-wrap items-center gap-2">
        <FileText size={16} className="text-tinta-3" aria-hidden="true" />
        <span className="font-semibold">{nomes.longo}</span>
        {s ? <Chip tom={s.tom}>{s.nome}</Chip> : null}
        <span className="num ml-auto font-semibold">{formatarMoeda(nota?.valor ?? valor)}</span>
      </div>
      {nota ? (
        <div className="flex flex-col gap-1.5 text-[14px]">
          {nota.numero ? (
            <p className="num">
              Nº {nota.numero}
              {nota.serie ? ` (série ${nota.serie})` : ''}
              {nota.ambiente === 'homologacao' ? ' · homologação' : ''}
            </p>
          ) : nota.situacao === 'processando' ? (
            <p className="text-tinta-2">O emissor está processando a nota. A situação muda aqui sozinha.</p>
          ) : null}
          {nota.mensagem && nota.situacao === 'erro' ? (
            <p className="rounded-lg bg-atraso-claro px-2.5 py-2 text-atraso" role="alert">
              {nota.mensagem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {nota.urlPdf ? (
              <a href={nota.urlPdf} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
                <Download size={15} aria-hidden="true" /> PDF
              </a>
            ) : null}
            {nota.urlXml ? (
              <a href={nota.urlXml} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
                <Download size={15} aria-hidden="true" /> XML
              </a>
            ) : null}
            {podeCancelar(nota) && !cancelando ? (
              <Botao tamanho="pequeno" variante="fantasma" onClick={() => setCancelando(true)}>
                <Ban size={15} aria-hidden="true" /> Cancelar a nota
              </Botao>
            ) : null}
            {deNovo && !emitindo && valor > 0 ? (
              <Botao tamanho="pequeno" onClick={aoEmitir}>
                <RotateCcw size={15} aria-hidden="true" /> Emitir de novo
              </Botao>
            ) : null}
          </div>
          {cancelando ? (
            <form onSubmit={cancelar} className="flex flex-col gap-2">
              <Campo rotulo="Motivo do cancelamento" htmlFor={`cancelar-${nota.id}`} dica="De 15 a 255 letras. Vai para a prefeitura ou para a Sefaz.">
                <textarea id={`cancelar-${nota.id}`} className={classeArea} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} />
              </Campo>
              <div className="flex flex-wrap gap-2">
                <Botao type="submit" variante="perigo" tamanho="pequeno" disabled={ocupado || motivo.trim().length < 15}>
                  Cancelar a {nomes.curto}
                </Botao>
                <Botao tamanho="pequeno" variante="fantasma" onClick={() => setCancelando(false)}>
                  Voltar
                </Botao>
              </div>
            </form>
          ) : null}
        </div>
      ) : !emitindo ? (
        <Botao variante="escuro" tamanho="pequeno" className="self-start" onClick={aoEmitir}>
          Emitir a {nomes.curto}
        </Botao>
      ) : null}
      {emitindo ? <FormEmissao tipo={tipo} doc={doc} config={config} aoFechar={aoFechar} aoReceber={aoReceber} /> : null}
    </div>
  );
}

interface CamposTomador {
  nome: string;
  documento: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoMunicipio: string;
}

function FormEmissao({ tipo, doc, config, aoFechar, aoReceber }: { tipo: TipoNota; doc: Documento; config: ConfigFiscal; aoFechar: () => void; aoReceber: (n: NotaFiscal) => void }) {
  const toast = useToast();
  const veiculo = useOficina((s) => (doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const estoque = useOficina((s) => s.estoque);
  const paraNfe = tipo === 'nfe';
  const [t, setT] = useState<CamposTomador>(() => {
    const e = lerEndereco(cliente?.endereco);
    const daCidade = !!e.municipio && !!config.opcoes.endereco?.municipio && e.municipio.toLowerCase() === config.opcoes.endereco.municipio.toLowerCase();
    return {
      nome: cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : '',
      documento: formatarCpfCnpj(cliente?.cpfCnpj ?? ''),
      email: cliente?.email ?? '',
      cep: e.cep ?? '',
      logradouro: e.logradouro ?? '',
      numero: e.numero ?? '',
      complemento: e.complemento ?? '',
      bairro: e.bairro ?? '',
      municipio: e.municipio ?? '',
      uf: e.uf ?? '',
      codigoMunicipio: daCidade ? (config.codigoMunicipio ?? '') : ''
    };
  });
  const [descricao, setDescricao] = useState(() => descricaoDoServico(doc, veiculo ? { modelo: veiculo.modelo, placa: formatarPlaca(veiculo.placa) } : null));
  const pecas = useMemo(() => pecasDaOrdem(doc, estoque), [doc, estoque]);
  const [escolhas, setEscolhas] = useState(() => pecas.map((p) => ({ linhaId: p.linhaId, ncm: p.ncm, cfop: (config.opcoes.pecasComSubstituicao ? '5405' : '5102') as '5102' | '5405' })));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudar = (k: keyof CamposTomador, v: string) => setT((x) => ({ ...x, [k]: v }));
  const temEndereco = !!(t.logradouro || t.cep || t.bairro);

  function tomador(): Tomador {
    const endereco = temEndereco || paraNfe
      ? { logradouro: t.logradouro.trim(), numero: t.numero.trim(), complemento: t.complemento.trim() || null, bairro: t.bairro.trim(), municipio: t.municipio.trim(), uf: t.uf, cep: t.cep.replace(/\D/g, ''), codigoMunicipio: t.codigoMunicipio.replace(/\D/g, '') || null }
      : null;
    return { nome: t.nome.trim(), documento: t.documento, email: t.email.trim() || null, telefone: cliente?.telefone ?? null, endereco };
  }

  async function emitir(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const tom = tomador();
    const problema = problemaDoTomador(tom, paraNfe);
    if (problema) return setErro(problema);
    if (paraNfe) {
      const semNcm = escolhas.find((x) => !ncmValido(x.ncm));
      if (semNcm) return setErro(`Escreva o NCM (8 números) de "${pecas.find((p) => p.linhaId === semNcm.linhaId)?.descricao ?? 'peça'}".`);
    }
    const s = useOficina.getState();
    // o que a pessoa completou fica no cadastro para a próxima nota
    if (cliente) {
      const endereco = tom.endereco ? formatarEndereco(tom.endereco) : cliente.endereco;
      const cpfCnpj = tom.documento.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (cliente.cpfCnpj !== cpfCnpj || (tom.email && cliente.email !== tom.email) || (endereco && cliente.endereco !== endereco)) {
        s.salvarCliente({ ...cliente, cpfCnpj, email: tom.email ?? cliente.email, endereco: endereco || cliente.endereco });
      }
    }
    if (paraNfe) {
      for (const p of pecas) {
        const ncm = escolhas.find((x) => x.linhaId === p.linhaId)?.ncm.replace(/\D/g, '');
        const item = p.estoqueId ? s.estoque[p.estoqueId] : undefined;
        if (item && ncm && item.ncm !== ncm) s.salvarItemEstoque({ ...item, ncm });
      }
    }
    const atual = useOficina.getState();
    const itensDoEstoque = Object.fromEntries(
      doc.linhas
        .filter((l) => l.estoqueId && atual.estoque[l.estoqueId])
        .map((l) => {
          const i = atual.estoque[l.estoqueId!];
          return [i.id, { ...(i.ncm ? { ncm: i.ncm } : {}), ...(i.codigo ? { codigo: i.codigo.slice(0, 60) } : {}), ...(i.ean ? { ean: i.ean.slice(0, 20) } : {}) }];
        })
    );
    setOcupado(true);
    const r = await emitirNota({
      tipo,
      documento: {
        id: doc.id,
        numero: doc.numero,
        tipo: 'ordem',
        situacao: doc.situacao,
        linhas: doc.linhas.map((l) => ({
          id: l.id,
          tipo: l.tipo,
          ...(l.servico ? { servico: l.servico } : {}),
          descricao: l.descricao.slice(0, 300),
          quantidade: l.quantidade,
          unidade: l.unidade,
          valorUnitario: l.valorUnitario,
          ...(l.estoqueId ? { estoqueId: l.estoqueId } : {}),
          ...(l.recusada ? { recusada: true } : {})
        })),
        desconto: doc.desconto,
        carro: veiculo ? { modelo: veiculo.modelo, placa: formatarPlaca(veiculo.placa) } : null
      },
      tomador: tom,
      descricao,
      escolhas: paraNfe ? escolhas.map((x) => ({ ...x, ncm: x.ncm.replace(/\D/g, '') })) : [],
      estoque: itensDoEstoque
    });
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    aoReceber(r.nota);
    toast({ texto: r.nota.situacao === 'erro' ? 'O emissor recusou a nota. Veja o motivo.' : `${NOMES_DA_NOTA[tipo].curto} enviada ao emissor. A situação aparece aqui.` });
  }

  return (
    <form onSubmit={emitir} className="flex flex-col gap-3 rounded-xl bg-papel-2 px-3.5 py-3" aria-label={`Emitir a ${NOMES_DA_NOTA[tipo].curto}`}>
      <p className="font-semibold">Para quem é a nota</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome ou razão social" htmlFor={`tom-nome-${tipo}`}>
          <input id={`tom-nome-${tipo}`} className={classeEntrada} value={t.nome} onChange={(e) => mudar('nome', e.target.value)} maxLength={150} />
        </Campo>
        <Campo rotulo="CPF ou CNPJ" htmlFor={`tom-doc-${tipo}`}>
          <input id={`tom-doc-${tipo}`} className={classeEntrada} value={t.documento} onChange={(e) => mudar('documento', e.target.value)} inputMode="text" autoComplete="off" />
        </Campo>
        <Campo rotulo="E-mail (a nota vai para ele)" htmlFor={`tom-email-${tipo}`}>
          <input id={`tom-email-${tipo}`} type="email" className={classeEntrada} value={t.email} onChange={(e) => mudar('email', e.target.value)} />
        </Campo>
        <Campo rotulo={paraNfe ? 'CEP' : 'CEP (opcional)'} htmlFor={`tom-cep-${tipo}`}>
          <input id={`tom-cep-${tipo}`} className={classeEntrada} value={t.cep} onChange={(e) => mudar('cep', e.target.value)} inputMode="numeric" />
        </Campo>
        <Campo rotulo="Rua" htmlFor={`tom-rua-${tipo}`}>
          <input id={`tom-rua-${tipo}`} className={classeEntrada} value={t.logradouro} onChange={(e) => mudar('logradouro', e.target.value)} />
        </Campo>
        <Campo rotulo="Número" htmlFor={`tom-num-${tipo}`}>
          <input id={`tom-num-${tipo}`} className={classeEntrada} value={t.numero} onChange={(e) => mudar('numero', e.target.value)} />
        </Campo>
        <Campo rotulo="Bairro" htmlFor={`tom-bairro-${tipo}`}>
          <input id={`tom-bairro-${tipo}`} className={classeEntrada} value={t.bairro} onChange={(e) => mudar('bairro', e.target.value)} />
        </Campo>
        <Campo rotulo="Cidade" htmlFor={`tom-cidade-${tipo}`}>
          <input id={`tom-cidade-${tipo}`} className={classeEntrada} value={t.municipio} onChange={(e) => mudar('municipio', e.target.value)} />
        </Campo>
        <Campo rotulo="Estado" htmlFor={`tom-uf-${tipo}`}>
          <select id={`tom-uf-${tipo}`} className={classeEntrada} value={t.uf} onChange={(e) => mudar('uf', e.target.value)}>
            <option value="">Escolha</option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Complemento (opcional)" htmlFor={`tom-compl-${tipo}`}>
          <input id={`tom-compl-${tipo}`} className={classeEntrada} value={t.complemento} onChange={(e) => mudar('complemento', e.target.value)} />
        </Campo>
      </div>

      {tipo === 'nfse' ? (
        <Campo rotulo="Descrição do serviço" htmlFor={`desc-${doc.id}`}>
          <textarea id={`desc-${doc.id}`} className={classeArea} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1000} />
        </Campo>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Peças da nota</legend>
          {pecas.map((p, i) => (
            <div key={p.linhaId} className="grid grid-cols-[1fr_120px] gap-2 sm:grid-cols-[1fr_120px_110px]">
              <span className="col-span-2 text-[14px] sm:col-span-1 sm:self-center">
                {p.descricao} <span className="num text-tinta-3">· {formatarMoeda(p.valor)}</span>
              </span>
              <input
                aria-label={`NCM de ${p.descricao}`}
                className={`${classeEntrada} num`}
                value={escolhas[i]?.ncm ?? ''}
                onChange={(e) => setEscolhas((x) => x.map((y, j) => (j === i ? { ...y, ncm: e.target.value } : y)))}
                placeholder="NCM"
                inputMode="numeric"
              />
              <select
                aria-label={`CFOP de ${p.descricao}`}
                className={classeEntrada}
                value={escolhas[i]?.cfop ?? '5405'}
                onChange={(e) => setEscolhas((x) => x.map((y, j) => (j === i ? { ...y, cfop: e.target.value as '5102' | '5405' } : y)))}
              >
                <option value="5405">5405 (com ST)</option>
                <option value="5102">5102 (sem ST)</option>
              </select>
            </div>
          ))}
        </fieldset>
      )}

      <p className="text-[12.5px] text-tinta-3">Confira com o seu contador os dados e os códigos (serviço, NCM, CFOP e CSOSN) antes de emitir em produção.</p>
      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" variante="primario" disabled={ocupado}>
          {ocupado ? 'Enviando...' : `Emitir a ${NOMES_DA_NOTA[tipo].curto}`}
        </Botao>
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
