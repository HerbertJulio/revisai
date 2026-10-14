'use client';

import { BellRing, Download, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Folha } from '@/components/Folha';
import { IconeServico } from '@/components/icones';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Secao, classeArea, classeEntrada } from '@/components/ui';
import type { ItemAviso } from '@/lib/avisos';
import { dataLocal, formatarData, somarDias } from '@/lib/datas';
import { lerNumero } from '@/lib/formatos';
import { useGrupos, useHoje } from '@/lib/ganchos';
import { SERVICOS, rotuloIntervalo } from '@/lib/manutencao';
import { UFS } from '@/lib/padroes';
import { notificar, pedirPermissao } from '@/lib/notificacao';
import { dadosParaBackup, useOficina, type DadosGuardados } from '@/lib/store';
import type { Preferencias, ServicoId } from '@/lib/tipos';
import { MENSAGEM_PADRAO, VARIAVEIS_MENSAGEM, montarMensagem } from '@/lib/whatsapp';
import { AgenteWhatsApp } from './AgenteWhatsApp';
import { PlanoDaOficina } from './plano';
import { SeusProdutos } from './SeusProdutos';

export function Ajustes() {
  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="largo text-[30px] sm:text-[34px]">Ajustes</h1>
        <p className="mt-1 text-tinta-2">As mudanças valem na hora e ficam guardadas neste aparelho.</p>
      </header>
      <DadosOficina />
      <PlanoDaOficina />
      <AgenteWhatsApp />
      <Avisos />
      <Mensagem />
      <Prazos />
      <SeusProdutos />
      <Aparencia />
      <SeusDados />
    </div>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">{children}</div>;
}

function DadosOficina() {
  const oficina = useOficina((s) => s.oficina);
  const salvar = useOficina((s) => s.salvarOficina);
  return (
    <Secao id="oficina" titulo="Oficina" descricao="Aparece na mensagem para o cliente, no cartão de manutenção e nos pedidos da loja.">
      <Cartao>
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Nome" htmlFor="of-nome" className="sm:col-span-3">
            <input id="of-nome" className={classeEntrada} value={oficina.nome} onChange={(e) => salvar({ nome: e.target.value })} />
          </Campo>
          <Campo rotulo="WhatsApp" htmlFor="of-whats" className="sm:col-span-3">
            <input id="of-whats" className={classeEntrada} value={oficina.whatsapp} onChange={(e) => salvar({ whatsapp: e.target.value })} inputMode="tel" />
          </Campo>
          <Campo rotulo="Endereço" htmlFor="of-end" className="sm:col-span-6" dica="Opcional. Vai no cartão de manutenção.">
            <input id="of-end" className={classeEntrada} value={oficina.endereco} onChange={(e) => salvar({ endereco: e.target.value })} />
          </Campo>
          <Campo rotulo="Cidade" htmlFor="of-cidade" className="sm:col-span-4">
            <input id="of-cidade" className={classeEntrada} value={oficina.cidade} onChange={(e) => salvar({ cidade: e.target.value })} />
          </Campo>
          <Campo rotulo="UF" htmlFor="of-uf" className="sm:col-span-2">
            <select id="of-uf" className={classeEntrada} value={oficina.uf} onChange={(e) => salvar({ uf: e.target.value })}>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Campo>
          <LinkAvaliacao valor={oficina.linkAvaliacao ?? ''} aoSalvar={(v) => salvar({ linkAvaliacao: v })} />
        </div>
      </Cartao>
    </Secao>
  );
}

/** Link do Google para o cliente avaliar a oficina. Só aceita endereço do Google. */
function LinkAvaliacao({ valor, aoSalvar }: { valor: string; aoSalvar: (v: string) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Campo
      rotulo="Link de avaliação no Google"
      htmlFor="of-avaliacao"
      className="sm:col-span-6"
      erro={erro ?? undefined}
      dica="No Perfil da Empresa no Google, toque em Pedir avaliações e copie o link (começa com g.page/r). Vai no pedido de avaliação depois do serviço."
    >
      <input
        id="of-avaliacao"
        className={classeEntrada}
        defaultValue={valor}
        inputMode="url"
        placeholder="https://g.page/r/..."
        onBlur={(e) => {
          const t = e.target.value.trim();
          if (!t) {
            setErro(null);
            return aoSalvar('');
          }
          const url = linkDoGoogle(t);
          if (!url) return setErro('Cole o link que o Google mostra em Pedir avaliações.');
          setErro(null);
          e.target.value = url;
          aoSalvar(url);
        }}
      />
    </Campo>
  );
}

function linkDoGoogle(texto: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
    const host = u.hostname.toLowerCase();
    const doGoogle = host === 'g.page' || host === 'goo.gl' || host === 'maps.app.goo.gl' || host === 'search.google.com' || host.endsWith('.google.com') || host === 'google.com' || host.startsWith('google.com.') || host.startsWith('www.google.com.');
    if (!doGoogle || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

function Opcoes<T extends number>({ valor, opcoes, aoMudar, formato }: { valor: T; opcoes: T[]; aoMudar: (v: T) => void; formato: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === valor}
          onClick={() => aoMudar(o)}
          className={`num h-10 rounded-full border px-4 text-[14px] font-semibold ${o === valor ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
        >
          {formato(o)}
        </button>
      ))}
    </div>
  );
}

function Avisos() {
  const prefs = useOficina((s) => s.preferencias);
  const salvar = useOficina((s) => s.salvarPreferencias);
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel'>('indisponivel');
  useEffect(() => setPermissao(typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission), []);
  const diasOpcoes = [7, 10, 15, 20, 30];
  const kmOpcoes = [300, 500, 1000, 1500];
  return (
    <Secao titulo="Avisos" descricao="Com quanta antecedência o cliente entra na lista de quem avisar.">
      <Cartao>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Avisar antes de vencer</p>
            <Opcoes valor={prefs.antecedenciaDias} opcoes={diasOpcoes.includes(prefs.antecedenciaDias) ? diasOpcoes : [...diasOpcoes, prefs.antecedenciaDias].sort((a, b) => a - b)} aoMudar={(v) => salvar({ antecedenciaDias: v })} formato={(v) => `${v} dias`} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Ou quando faltar (pela quilometragem)</p>
            <Opcoes valor={prefs.antecedenciaKm} opcoes={kmOpcoes.includes(prefs.antecedenciaKm) ? kmOpcoes : [...kmOpcoes, prefs.antecedenciaKm].sort((a, b) => a - b)} aoMudar={(v) => salvar({ antecedenciaKm: v })} formato={(v) => `${v.toLocaleString('pt-BR')} km`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Rodagem para carros sem histórico (km por mês)" htmlFor="aj-kmmes" dica="A média no Brasil fica perto de 1.000 km por mês. Com duas visitas, o app usa o histórico do carro.">
              <input
                id="aj-kmmes"
                className={classeEntrada}
                defaultValue={prefs.kmMesPadrao}
                onBlur={(e) => {
                  const n = lerNumero(e.target.value);
                  if (n && n > 0 && n < 20000) salvar({ kmMesPadrao: Math.round(n) });
                  else e.target.value = String(prefs.kmMesPadrao);
                }}
                inputMode="numeric"
              />
            </Campo>
          </div>
          <Alternar
            id="aj-severo"
            ligado={prefs.usoSeveroPadrao}
            aoMudar={(v) => salvar({ usoSeveroPadrao: v })}
            rotulo="Uso severo como padrão"
            descricao="Para oficinas com muito carro de aplicativo, táxi ou que roda em terra. Dá para mudar carro a carro."
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-5">
            <div>
              <p className="font-semibold">Notificação neste aparelho</p>
              <p className="text-[13.5px] text-tinta-3">
                {permissao === 'granted'
                  ? 'Ligada. Ao abrir o Revisaí, chega um resumo do dia.'
                  : permissao === 'denied'
                    ? 'Bloqueada no navegador. Libere nas configurações do site.'
                    : permissao === 'indisponivel'
                      ? 'Este navegador não mostra notificações.'
                      : 'Um resumo do dia quando você abrir o Revisaí.'}
              </p>
            </div>
            {permissao === 'default' ? (
              <Botao
                onClick={async () => {
                  const r = await pedirPermissao();
                  setPermissao(r);
                  if (r === 'granted') void notificar('Revisaí', 'Pronto. É assim que o resumo do dia vai aparecer quando você abrir o app.');
                }}
              >
                <BellRing size={17} /> Ativar
              </Botao>
            ) : null}
          </div>
        </div>
      </Cartao>
    </Secao>
  );
}

function Mensagem() {
  const prefs = useOficina((s) => s.preferencias);
  const oficina = useOficina((s) => s.oficina);
  const salvar = useOficina((s) => s.salvarPreferencias);
  const { grupos } = useGrupos();
  const hoje = useHoje();
  const area = useRef<HTMLTextAreaElement>(null);
  const exemplo = grupos[0];
  const itensExemplo: ItemAviso[] = exemplo?.itens ?? [
    {
      servico: 'troca_oleo',
      venc: { dataPrevista: somarDias(hoje, 9), diasRestantes: 9, motivo: 'tempo' }
    } as unknown as ItemAviso
  ];
  const previa = montarMensagem(prefs.mensagem, {
    cliente: exemplo?.cliente?.nome ?? 'Fernanda',
    oficina: oficina.nome,
    veiculo: exemplo?.veiculo ?? { modelo: 'Onix', placa: 'FLM2C24' },
    itens: itensExemplo
  });

  function inserir(variavel: string) {
    const el = area.current;
    if (!el) return;
    const ini = el.selectionStart ?? prefs.mensagem.length;
    const fim = el.selectionEnd ?? ini;
    const texto = prefs.mensagem.slice(0, ini) + variavel + prefs.mensagem.slice(fim);
    salvar({ mensagem: texto });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + variavel.length, ini + variavel.length);
    });
  }

  return (
    <Secao titulo="Mensagem do WhatsApp" descricao="O texto que abre pronto quando você toca em WhatsApp num aviso.">
      <Cartao>
        <div className="flex flex-col gap-4">
          <textarea ref={area} rows={4} className={classeArea} value={prefs.mensagem} onChange={(e) => salvar({ mensagem: e.target.value })} aria-label="Modelo da mensagem" />
          <div className="flex flex-wrap gap-2">
            {VARIAVEIS_MENSAGEM.map((v) => (
              <button key={v.nome} type="button" onClick={() => inserir(v.nome)} className="rounded-full border border-linha bg-papel-2 px-3 py-1 text-[13px] font-semibold text-tinta-2 hover:border-tinta-3" title={v.descricao}>
                {v.nome}
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-ok-claro px-4 py-3">
            <p className="mb-1 text-[12.5px] font-semibold text-ok">Como o cliente recebe</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{previa}</p>
          </div>
          {prefs.mensagem !== MENSAGEM_PADRAO ? (
            <Botao tamanho="pequeno" className="self-start" onClick={() => salvar({ mensagem: MENSAGEM_PADRAO })}>
              <RotateCcw size={15} /> Voltar ao texto padrão
            </Botao>
          ) : null}
        </div>
      </Cartao>
    </Secao>
  );
}

function Prazos() {
  const intervalos = useOficina((s) => s.preferencias.intervalos);
  const salvar = useOficina((s) => s.salvarPreferencias);

  function mudar(id: ServicoId, campo: 'km' | 'meses', texto: string) {
    const atual = intervalos[id] ?? { ...SERVICOS.find((s) => s.id === id)!.normal };
    const n = texto.trim() === '' ? null : lerNumero(texto);
    const novo = { ...atual, [campo]: n && n > 0 ? Math.round(n) : null };
    salvar({ intervalos: { ...intervalos, [id]: novo } });
  }

  function restaurar(id: ServicoId) {
    const { [id]: _, ...resto } = intervalos;
    salvar({ intervalos: resto as Preferencias['intervalos'] });
  }

  return (
    <Secao
      titulo="Prazos padrão"
      descricao="O prazo que já vem preenchido ao registrar cada serviço (uso normal; no uso severo, o app usa a metade quando a regra pede). O manual do carro e o produto usado podem mudar o prazo de cada registro."
    >
      <div className="overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
        <ul className="divide-y divide-linha">
          {SERVICOS.map((s) => {
            const proprio = intervalos[s.id];
            const valor = proprio ?? s.normal;
            return (
              <li key={s.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_1fr_220px_auto] sm:px-5">
                <IconeServico servico={s.id} className="text-tinta-3" />
                <div className="min-w-0">
                  <p className="font-semibold">{s.nome}</p>
                  <p className="text-[13px] text-tinta-3">{proprio ? `Padrão do app: ${rotuloIntervalo(s.normal)}` : rotuloIntervalo(s.normal)}</p>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1">
                  <label className="flex items-center gap-2">
                    <input
                      className={`${classeEntrada} h-10`}
                      key={`${s.id}-km-${valor.km}`}
                      defaultValue={valor.km ?? ''}
                      placeholder="sem km"
                      inputMode="numeric"
                      aria-label={`${s.nome}: km`}
                      onBlur={(e) => e.target.value !== String(valor.km ?? '') && mudar(s.id, 'km', e.target.value)}
                    />
                    <span className="text-[13px] text-tinta-3">km</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      className={`${classeEntrada} h-10`}
                      key={`${s.id}-m-${valor.meses}`}
                      defaultValue={valor.meses ?? ''}
                      placeholder="sem"
                      inputMode="numeric"
                      aria-label={`${s.nome}: meses`}
                      onBlur={(e) => e.target.value !== String(valor.meses ?? '') && mudar(s.id, 'meses', e.target.value)}
                    />
                    <span className="text-[13px] text-tinta-3">meses</span>
                  </label>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  {proprio ? (
                    <button type="button" className="text-[13px] font-semibold text-caneta hover:underline" onClick={() => restaurar(s.id)}>
                      Voltar ao padrão
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Secao>
  );
}

function Aparencia() {
  const tema = useOficina((s) => s.preferencias.tema);
  const salvar = useOficina((s) => s.salvarPreferencias);
  function escolher(t: Preferencias['tema']) {
    salvar({ tema: t });
    try {
      if (t === 'auto') localStorage.removeItem('revisai:tema');
      else localStorage.setItem('revisai:tema', t);
      (window as Window & { __revisaiTema?: () => void }).__revisaiTema?.();
    } catch {}
  }
  const opcoes: { id: Preferencias['tema']; nome: string }[] = [
    { id: 'auto', nome: 'Igual ao aparelho' },
    { id: 'claro', nome: 'Claro' },
    { id: 'escuro', nome: 'Escuro' }
  ];
  return (
    <Secao titulo="Aparência">
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={tema === o.id}
            onClick={() => escolher(o.id)}
            className={`h-10 rounded-full border px-4 text-[14px] font-semibold ${tema === o.id ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
          >
            {o.nome}
          </button>
        ))}
      </div>
    </Secao>
  );
}

function SeusDados() {
  const estado = useOficina();
  const toast = useToast();
  const arquivo = useRef<HTMLInputElement>(null);
  const [confirmar, setConfirmar] = useState<null | 'apagar' | { dados: Partial<DadosGuardados>; resumo: string }>(null);

  function exportar() {
    const conteudo = JSON.stringify(dadosParaBackup(estado), null, 2);
    const blob = new Blob([conteudo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revisai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    estado.marcarBackup();
    toast({ texto: 'Backup baixado. Guarde o arquivo num lugar seguro.' });
  }

  async function lerArquivo(f: File) {
    try {
      const json = JSON.parse(await f.text());
      if (json?.app !== 'revisai' || typeof json.veiculos !== 'object' || typeof json.atendimentos !== 'object') throw new Error('formato');
      const resumo = `${Object.keys(json.clientes ?? {}).length} clientes, ${Object.keys(json.veiculos ?? {}).length} carros e ${Object.keys(json.atendimentos ?? {}).length} serviços, exportado em ${formatarData(dataLocal(String(json.exportadoEm ?? '')))}`;
      setConfirmar({ dados: json, resumo });
    } catch {
      toast({ texto: 'Esse arquivo não é um backup do Revisaí.', tom: 'erro' });
    }
  }

  const total = Object.keys(estado.veiculos).length;
  return (
    <Secao titulo="Seus dados" descricao="Sem login, os dados ficam só neste aparelho. Faça backup de vez em quando.">
      <Cartao>
        <div className="flex flex-col gap-5">
          <p className="text-[14px] text-tinta-2">
            {Object.keys(estado.clientes).length} clientes, {total} carros, {Object.keys(estado.atendimentos).length} serviços registrados.
            {estado.ultimoBackup ? ` Último backup em ${formatarData(dataLocal(estado.ultimoBackup))}.` : ' Nenhum backup feito ainda.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao onClick={exportar}>
              <Download size={17} /> Baixar backup
            </Botao>
            <Botao onClick={() => arquivo.current?.click()}>
              <Upload size={17} /> Restaurar backup
            </Botao>
            <input
              ref={arquivo}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
                e.target.value = '';
              }}
            />
            {estado.exemplo ? (
              <Botao onClick={() => { estado.removerExemplo(); toast({ texto: 'Clientes de exemplo apagados.' }); }}>Apagar clientes de exemplo</Botao>
            ) : (
              <Botao onClick={() => { estado.carregarExemplo(); toast({ texto: 'Clientes de exemplo carregados.' }); }}>Carregar clientes de exemplo</Botao>
            )}
            <Botao variante="perigo" onClick={() => setConfirmar('apagar')}>
              Apagar tudo
            </Botao>
          </div>
        </div>
      </Cartao>

      <Folha
        aberta={confirmar === 'apagar'}
        aoFechar={() => setConfirmar(null)}
        titulo="Apagar todos os dados?"
        descricao="Clientes, carros, serviços, ajustes e pedidos saem deste aparelho. Baixe um backup antes se quiser guardar."
        rodape={
          <>
            <Botao onClick={() => setConfirmar(null)}>Cancelar</Botao>
            <Botao
              variante="perigo"
              onClick={() => {
                estado.apagarTudo();
                setConfirmar(null);
              }}
            >
              Apagar tudo
            </Botao>
          </>
        }
      >
        <p className="text-tinta-2">Depois disso o Revisaí volta para a tela de boas-vindas.</p>
      </Folha>
      <Folha
        aberta={typeof confirmar === 'object' && confirmar !== null}
        aoFechar={() => setConfirmar(null)}
        titulo="Restaurar este backup?"
        descricao="Os dados atuais deste aparelho serão trocados pelos do arquivo."
        rodape={
          <>
            <Botao onClick={() => setConfirmar(null)}>Cancelar</Botao>
            <Botao
              variante="primario"
              onClick={() => {
                if (typeof confirmar === 'object' && confirmar) estado.importar(confirmar.dados);
                setConfirmar(null);
                toast({ texto: 'Backup restaurado.' });
              }}
            >
              Restaurar
            </Botao>
          </>
        }
      >
        <p>{typeof confirmar === 'object' && confirmar ? confirmar.resumo : ''}</p>
      </Folha>
    </Secao>
  );
}
