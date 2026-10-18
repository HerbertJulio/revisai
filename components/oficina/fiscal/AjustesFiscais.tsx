'use client';

// O cadastro fiscal da oficina (só para o dono e o gerente): a empresa no emissor de notas, o
// serviço (item 14.01 da LC 116, código nacional 140101), o ISS, o padrão da NFS-e, as opções da
// NF-e das peças, o ambiente e o certificado A1, que vai direto para o emissor (o Revisaí não
// guarda o arquivo nem a senha).

import { FileKey, LogIn, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { enviarCertificado, salvarFiscal } from '@/app/oficina/fiscal/acoes';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Secao, classeBotao, classeEntrada } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import { formatarCpfCnpj } from '@/lib/fiscal/identificacao';
import { lerConfigFiscal, lerEndereco, REGIMES, SERVICO_PADRAO, UFS, type ConfigFiscal } from '@/lib/fiscal/payload';
import type { NomeProvedorFiscal, RegimeFiscal } from '@/lib/fiscal/tipos';
import { formatarNumero } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import { useGestao } from '../cobranca-cliente/gestao';
import { SoGestao } from '../financeiro/comum';

const NOMES_DOS_EMISSORES: Record<NomeProvedorFiscal, string> = { focus: 'Focus NFe', teste: 'emissor de teste (só no computador)' };

export function AjustesFiscais({ ligado, provedor }: { ligado: boolean; provedor: NomeProvedorFiscal | null }) {
  return (
    <SoGestao>
      <Tela ligado={ligado} provedor={provedor} />
    </SoGestao>
  );
}

interface Formulario {
  cnpj: string;
  razaoSocial: string;
  regime: RegimeFiscal;
  inscricaoMunicipal: string;
  inscricaoEstadual: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoMunicipio: string;
  padraoNfse: 'nacional' | 'municipal';
  codigoServico: string;
  codigoTributacaoNacional: string;
  codigoTributacaoMunicipal: string;
  aliquotaIss: string;
  cnae: string;
  ambiente: 'homologacao' | 'producao';
  pecasComSubstituicao: boolean;
  pisCofins: string;
  aliquotaIcms: string;
  ibsCbsSituacao: string;
  ibsCbsClassificacao: string;
}

function inicial(c: ConfigFiscal | null, o: ReturnType<typeof useOficina.getState>['oficina']): Formulario {
  const e = c?.opcoes.endereco ?? null;
  const daOficina = lerEndereco(o.endereco);
  return {
    cnpj: formatarCpfCnpj(c?.cnpj ?? o.cnpj ?? ''),
    razaoSocial: c?.razaoSocial ?? o.razaoSocial ?? '',
    regime: c?.regime ?? 'simples',
    inscricaoMunicipal: c?.inscricaoMunicipal ?? o.inscricaoMunicipal ?? '',
    inscricaoEstadual: c?.inscricaoEstadual ?? '',
    email: c?.opcoes.email ?? '',
    cep: e?.cep ?? daOficina.cep ?? '',
    logradouro: e?.logradouro ?? daOficina.logradouro ?? o.endereco ?? '',
    numero: e?.numero ?? daOficina.numero ?? '',
    complemento: e?.complemento ?? '',
    bairro: e?.bairro ?? daOficina.bairro ?? '',
    municipio: e?.municipio ?? o.cidade ?? '',
    uf: e?.uf ?? o.uf ?? '',
    codigoMunicipio: c?.codigoMunicipio ?? e?.codigoMunicipio ?? '',
    padraoNfse: c?.padraoNfse ?? 'nacional',
    codigoServico: c?.codigoServico ?? SERVICO_PADRAO.codigoServico,
    codigoTributacaoNacional: c?.codigoTributacaoNacional ?? SERVICO_PADRAO.codigoTributacaoNacional,
    codigoTributacaoMunicipal: c?.codigoTributacaoMunicipal ?? '',
    aliquotaIss: c?.aliquotaIss != null ? formatarNumero(c.aliquotaIss, 2) : '',
    cnae: c?.cnae ?? SERVICO_PADRAO.cnae,
    ambiente: c?.ambiente ?? 'homologacao',
    pecasComSubstituicao: c?.opcoes.pecasComSubstituicao ?? true,
    pisCofins: c?.opcoes.pisCofins ?? '49',
    aliquotaIcms: c?.opcoes.aliquotaIcms != null ? formatarNumero(c.opcoes.aliquotaIcms, 2) : '',
    ibsCbsSituacao: c?.opcoes.ibsCbs?.situacao ?? '',
    ibsCbsClassificacao: c?.opcoes.ibsCbs?.classificacao ?? ''
  };
}

function Tela({ ligado, provedor }: { ligado: boolean; provedor: NomeProvedorFiscal | null }) {
  const { ctx, plano } = useGestao();
  const oficina = useOficina((s) => s.oficina);
  const [config, setConfig] = useState<ConfigFiscal | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!ctx) return;
    let vivo = true;
    void Promise.resolve(ctx.sb.from('oficinas_fiscal').select('*').eq('oficina_id', ctx.oficinaId).maybeSingle())
      .then(({ data }) => {
        if (!vivo) return;
        setConfig(lerConfigFiscal(data));
        setCarregado(true);
      })
      .catch(() => vivo && setCarregado(true));
    return () => {
      vivo = false;
    };
  }, [ctx]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="largo text-[30px] sm:text-[34px]">Notas fiscais</h1>
        <p className="mt-1 max-w-[62ch] text-tinta-2">
          A nota de serviço (NFS-e) da mão de obra e a nota das peças (NF-e) saem da ordem de serviço, pelo emissor de notas. Aqui ficam os dados da empresa e o certificado digital.
        </p>
      </header>

      {!ligado ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-linha px-5 py-6">
          <p className="meio-largo text-lg font-bold">As notas fiscais ainda não estão ligadas no Revisaí</p>
          <p className="max-w-prose text-tinta-2">Assim que o emissor de notas estiver ligado, é aqui que você cadastra a empresa e o certificado A1. Enquanto isso, o resto do app funciona normalmente.</p>
        </div>
      ) : !ctx ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-linha px-5 py-6">
          <p className="meio-largo text-lg font-bold">Entre na conta da oficina</p>
          <p className="max-w-prose text-tinta-2">As notas fiscais usam a conta da oficina, onde ficam o cadastro no emissor e as notas emitidas.</p>
          <Link href="/entrar?para=/oficina/fiscal" className={classeBotao('primario')}>
            <LogIn size={17} aria-hidden="true" /> Entrar
          </Link>
        </div>
      ) : plano === 'gratis' ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-linha px-5 py-6">
          <p className="meio-largo text-lg font-bold">As notas fiscais são do Pro</p>
          <p className="max-w-prose text-tinta-2">No Pro (e no teste grátis do Pro), a oficina emite a NFS-e e a NF-e direto da ordem de serviço.</p>
          <Link href="/oficina/assinatura" className={classeBotao('primario')}>
            Ver o Pro
          </Link>
        </div>
      ) : carregado ? (
        <>
          <FormFiscal config={config} oficina={oficina} provedor={provedor} aoSalvar={setConfig} />
          {config ? <Certificado config={config} aoEnviar={(validoAte) => setConfig({ ...config, certificadoValidoAte: validoAte })} /> : null}
        </>
      ) : (
        <div className="min-h-40" aria-busy="true" />
      )}

      <p className="text-[13.5px] text-tinta-3">Confira com o seu contador o regime, os códigos do serviço, a alíquota do ISS e os códigos das peças (NCM, CFOP e CSOSN) antes de emitir em produção.</p>
    </div>
  );
}

function FormFiscal({
  config,
  oficina,
  provedor,
  aoSalvar
}: {
  config: ConfigFiscal | null;
  oficina: ReturnType<typeof useOficina.getState>['oficina'];
  provedor: NomeProvedorFiscal | null;
  aoSalvar: (c: ConfigFiscal) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Formulario>(() => inicial(config, oficina));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudar = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((x) => ({ ...x, [k]: v }));
  const texto = (k: keyof Formulario, id: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={id} className={classeEntrada} value={String(f[k])} onChange={(e) => mudar(k, e.target.value as never)} {...extra} />
  );

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    const r = await salvarFiscal({
      cnpj: f.cnpj,
      razaoSocial: f.razaoSocial,
      regime: f.regime,
      inscricaoMunicipal: f.inscricaoMunicipal,
      inscricaoEstadual: f.inscricaoEstadual,
      email: f.email,
      endereco: { cep: f.cep, logradouro: f.logradouro, numero: f.numero, complemento: f.complemento, bairro: f.bairro, municipio: f.municipio, uf: f.uf, codigoMunicipio: f.codigoMunicipio },
      padraoNfse: f.padraoNfse,
      codigoServico: f.codigoServico,
      codigoTributacaoNacional: f.codigoTributacaoNacional,
      codigoTributacaoMunicipal: f.codigoTributacaoMunicipal,
      aliquotaIss: f.aliquotaIss,
      cnae: f.cnae,
      ambiente: f.ambiente,
      pecasComSubstituicao: f.pecasComSubstituicao,
      pisCofins: f.pisCofins,
      aliquotaIcms: f.aliquotaIcms,
      ibsCbsSituacao: f.ibsCbsSituacao,
      ibsCbsClassificacao: f.ibsCbsClassificacao
    });
    setOcupado(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    aoSalvar(r.config);
    toast({ texto: config ? 'Cadastro fiscal salvo.' : 'Empresa cadastrada no emissor de notas. Agora mande o certificado A1.' });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-8" aria-label="Cadastro fiscal">
      <Secao titulo="Empresa" descricao={provedor ? `A oficina fica cadastrada como empresa no ${NOMES_DOS_EMISSORES[provedor]}.` : undefined}>
        <div className="grid gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:grid-cols-2 sm:px-5">
          <Campo rotulo="CNPJ" htmlFor="fis-cnpj">
            {texto('cnpj', 'fis-cnpj', { inputMode: 'text', autoComplete: 'off', placeholder: '00.000.000/0000-00' })}
          </Campo>
          <Campo rotulo="Razão social" htmlFor="fis-razao">
            {texto('razaoSocial', 'fis-razao', { maxLength: 150 })}
          </Campo>
          <Campo rotulo="Regime" htmlFor="fis-regime">
            <select id="fis-regime" className={classeEntrada} value={f.regime} onChange={(e) => mudar('regime', e.target.value as RegimeFiscal)}>
              {REGIMES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} ({r.descricao.toLowerCase()})
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="E-mail para as notas (opcional)" htmlFor="fis-email">
            {texto('email', 'fis-email', { type: 'email', autoComplete: 'email' })}
          </Campo>
          <Campo rotulo="Inscrição municipal" htmlFor="fis-im">
            {texto('inscricaoMunicipal', 'fis-im', { autoComplete: 'off' })}
          </Campo>
          <Campo rotulo="Inscrição estadual (para a NF-e)" htmlFor="fis-ie">
            {texto('inscricaoEstadual', 'fis-ie', { autoComplete: 'off' })}
          </Campo>
          <Campo rotulo="CEP" htmlFor="fis-cep">
            {texto('cep', 'fis-cep', { inputMode: 'numeric', autoComplete: 'postal-code' })}
          </Campo>
          <Campo rotulo="Rua" htmlFor="fis-rua">
            {texto('logradouro', 'fis-rua', { autoComplete: 'address-line1' })}
          </Campo>
          <Campo rotulo="Número" htmlFor="fis-numero">
            {texto('numero', 'fis-numero')}
          </Campo>
          <Campo rotulo="Complemento (opcional)" htmlFor="fis-compl">
            {texto('complemento', 'fis-compl')}
          </Campo>
          <Campo rotulo="Bairro" htmlFor="fis-bairro">
            {texto('bairro', 'fis-bairro')}
          </Campo>
          <Campo rotulo="Cidade" htmlFor="fis-cidade">
            {texto('municipio', 'fis-cidade', { autoComplete: 'address-level2' })}
          </Campo>
          <Campo rotulo="Estado" htmlFor="fis-uf">
            <select id="fis-uf" className={classeEntrada} value={f.uf} onChange={(e) => mudar('uf', e.target.value)}>
              <option value="">Escolha</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Código IBGE da cidade" htmlFor="fis-ibge" dica="7 números, como 3304557 (Rio de Janeiro). Está no site do IBGE e na prefeitura.">
            {texto('codigoMunicipio', 'fis-ibge', { inputMode: 'numeric', maxLength: 7 })}
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Nota de serviço (NFS-e)" descricao="A mão de obra da ordem de serviço.">
        <div className="grid gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:grid-cols-2 sm:px-5">
          <Campo rotulo="Onde a nota é emitida" htmlFor="fis-padrao" dica="O MEI e muitas cidades já usam o Emissor Nacional. Se a sua prefeitura ainda tem sistema próprio, escolha a prefeitura.">
            <select id="fis-padrao" className={classeEntrada} value={f.padraoNfse} onChange={(e) => mudar('padraoNfse', e.target.value as Formulario['padraoNfse'])}>
              <option value="nacional">Emissor Nacional (padrão nacional)</option>
              <option value="municipal">Sistema da prefeitura</option>
            </select>
          </Campo>
          <Campo rotulo="Item da lista de serviços (LC 116)" htmlFor="fis-item" dica="14.01: conserto e manutenção de veículos.">
            {texto('codigoServico', 'fis-item')}
          </Campo>
          <Campo rotulo="Código de tributação nacional" htmlFor="fis-ctn" dica="140101 para o item 14.01.">
            {texto('codigoTributacaoNacional', 'fis-ctn', { inputMode: 'numeric', maxLength: 6 })}
          </Campo>
          <Campo rotulo="Código do serviço na prefeitura (opcional)" htmlFor="fis-ctm">
            {texto('codigoTributacaoMunicipal', 'fis-ctm')}
          </Campo>
          <Campo rotulo="Alíquota do ISS (%)" htmlFor="fis-iss" dica="Deixe em branco se a cidade usa o Emissor Nacional (o sistema já sabe).">
            {texto('aliquotaIss', 'fis-iss', { inputMode: 'decimal', placeholder: 'Ex.: 2' })}
          </Campo>
          <Campo rotulo="CNAE" htmlFor="fis-cnae" dica="4520-0/01: manutenção e reparação mecânica de veículos.">
            {texto('cnae', 'fis-cnae', { inputMode: 'numeric' })}
          </Campo>
          {f.regime === 'normal' ? (
            <>
              <Campo rotulo="IBS/CBS: situação tributária" htmlFor="fis-ibs-st" dica="3 números, como o contador passou.">
                {texto('ibsCbsSituacao', 'fis-ibs-st', { inputMode: 'numeric', maxLength: 3 })}
              </Campo>
              <Campo rotulo="IBS/CBS: classificação tributária" htmlFor="fis-ibs-ct" dica="6 números.">
                {texto('ibsCbsClassificacao', 'fis-ibs-ct', { inputMode: 'numeric', maxLength: 6 })}
              </Campo>
            </>
          ) : null}
        </div>
      </Secao>

      <Secao titulo="Nota das peças (NF-e)" descricao="As peças da ordem, vendidas ao consumidor dentro do estado.">
        <div className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
          <Alternar
            id="fis-st"
            ligado={f.pecasComSubstituicao}
            aoMudar={(v) => mudar('pecasComSubstituicao', v)}
            rotulo="As peças têm ICMS por substituição tributária"
            descricao="O mais comum em autopeças: a venda sai com o CFOP 5405. Sem substituição, sai com o 5102. Dá para trocar em cada peça na hora de emitir."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="CST do PIS e da COFINS" htmlFor="fis-pis" dica="49 (outras operações de saída), se o contador não indicar outro.">
              {texto('pisCofins', 'fis-pis', { inputMode: 'numeric', maxLength: 2 })}
            </Campo>
            {f.regime === 'normal' ? (
              <Campo rotulo="Alíquota do ICMS (%)" htmlFor="fis-icms" dica="Para a peça sem substituição tributária.">
                {texto('aliquotaIcms', 'fis-icms', { inputMode: 'decimal' })}
              </Campo>
            ) : null}
          </div>
        </div>
      </Secao>

      <Secao titulo="Ambiente" descricao="Comece em homologação para testar: as notas não têm valor fiscal. Mude para produção quando estiver tudo certo.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ambiente das notas">
          {(['homologacao', 'producao'] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={f.ambiente === a}
              onClick={() => mudar('ambiente', a)}
              className={`h-11 rounded-[10px] border px-4 text-[14.5px] font-semibold ${f.ambiente === a ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
            >
              {a === 'homologacao' ? 'Homologação (testes)' : 'Produção (notas de verdade)'}
            </button>
          ))}
        </div>
      </Secao>

      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14.5px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={ocupado}>
          {ocupado ? 'Salvando...' : config ? 'Salvar o cadastro fiscal' : 'Cadastrar a empresa no emissor'}
        </Botao>
        {config ? <Chip tom={config.ambiente === 'producao' ? 'ok' : 'oleo'}>{config.ambiente === 'producao' ? 'Em produção' : 'Em homologação'}</Chip> : null}
      </div>
    </form>
  );
}

function Certificado({ config, aoEnviar }: { config: ConfigFiscal; aoEnviar: (validoAte: string | null) => void }) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const validoAte = config.certificadoValidoAte;
  const vencido = !!validoAte && new Date(validoAte).getTime() < Date.now();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    const dados = new FormData(e.currentTarget);
    const r = await enviarCertificado(dados);
    setOcupado(false);
    // o arquivo e a senha saem da tela: não ficam em lugar nenhum
    form.current?.reset();
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    aoEnviar(r.validoAte);
    toast({ texto: 'Certificado aceito pelo emissor de notas.' });
  }

  return (
    <Secao titulo="Certificado digital A1" descricao="O arquivo .pfx (ou .p12) e a senha vão direto para o emissor de notas. O Revisaí não guarda nenhum dos dois.">
      <form ref={form} onSubmit={enviar} className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
        <p className="flex items-center gap-2 text-[14.5px]">
          {validoAte ? <ShieldCheck size={18} className={vencido ? 'text-atraso' : 'text-ok'} aria-hidden="true" /> : <FileKey size={18} className="text-tinta-3" aria-hidden="true" />}
          {validoAte ? (
            <span className={vencido ? 'font-semibold text-atraso' : ''} data-certificado-ate={validoAte}>
              {vencido ? 'Certificado vencido em' : 'Certificado válido até'} {formatarData(validoAte.slice(0, 10))}
            </span>
          ) : (
            <span className="text-tinta-2">Nenhum certificado enviado ainda.</span>
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Arquivo do certificado" htmlFor="cert-arquivo">
            <input id="cert-arquivo" name="certificado" type="file" accept=".pfx,.p12,application/x-pkcs12" className="text-[14px]" required />
          </Campo>
          <Campo rotulo="Senha do certificado" htmlFor="cert-senha">
            <input id="cert-senha" name="senha" type="password" className={classeEntrada} autoComplete="off" required />
          </Campo>
        </div>
        {erro ? (
          <p className="text-sm text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
        <Botao type="submit" variante="escuro" className="self-start" disabled={ocupado}>
          {ocupado ? 'Enviando...' : validoAte ? 'Trocar o certificado' : 'Enviar o certificado'}
        </Botao>
      </form>
    </Secao>
  );
}
