// O service worker (public/sw.js) num ambiente de mentira: o que fica guardado, o que sai quando
// passa do limite, e que guardar nunca quebra a tela, nem sem espaço no aparelho.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

const CODIGO = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGEM = 'https://revisai.howlks.com';

class CacheDeMentira {
  itens: { url: string; resposta: Response }[] = [];
  constructor(private ambiente: { semEspaco: boolean }) {}
  private chave(p: unknown) {
    return typeof p === 'string' ? new URL(p, ORIGEM).toString() : (p as { url: string }).url;
  }
  async match(p: unknown, opcoes: { ignoreSearch?: boolean } = {}) {
    const alvo = new URL(this.chave(p));
    const igual = (u: string) => {
      const x = new URL(u);
      return opcoes.ignoreSearch ? x.origin + x.pathname === alvo.origin + alvo.pathname : x.toString() === alvo.toString();
    };
    return this.itens.find((i) => igual(i.url))?.resposta.clone();
  }
  async put(p: unknown, resposta: Response) {
    if (this.ambiente.semEspaco) throw new DOMException('cheio', 'QuotaExceededError');
    const url = this.chave(p);
    this.itens = this.itens.filter((i) => i.url !== url);
    this.itens.push({ url, resposta });
  }
  async keys() {
    return this.itens.map((i) => ({ url: i.url }));
  }
  async delete(p: unknown) {
    const url = this.chave(p);
    const antes = this.itens.length;
    this.itens = this.itens.filter((i) => i.url !== url);
    return this.itens.length < antes;
  }
}

function montar() {
  const ambiente = { semEspaco: false, semInternet: false, pedidos: [] as string[] };
  const caches = new Map<string, CacheDeMentira>();
  const tratadores: Record<string, (e: unknown) => void> = {};
  const armazenamento = {
    open: async (nome: string) => {
      if (!caches.has(nome)) caches.set(nome, new CacheDeMentira(ambiente));
      return caches.get(nome)!;
    },
    keys: async () => [...caches.keys()],
    delete: async (nome: string) => caches.delete(nome),
    match: async (p: unknown, opcoes: { cacheName?: string; ignoreSearch?: boolean } = {}) => caches.get(opcoes.cacheName ?? '')?.match(p, opcoes)
  };
  const contexto = {
    self: {
      location: { origin: ORIGEM },
      addEventListener: (tipo: string, f: (e: unknown) => void) => (tratadores[tipo] = f),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
      registration: {}
    },
    caches: armazenamento,
    fetch: async (p: { url: string }) => {
      ambiente.pedidos.push(p.url);
      if (ambiente.semInternet) throw new TypeError('Failed to fetch');
      return Object.defineProperty(new Response(`conteúdo de ${p.url}`, { status: 200 }), 'type', { value: 'basic' });
    },
    Response,
    URL,
    console
  };
  vm.runInNewContext(CODIGO, contexto);

  async function pedir(caminho: string, modo: 'navigate' | 'no-cors' = 'no-cors') {
    const espera: Promise<unknown>[] = [];
    let resposta: Promise<Response> | undefined;
    tratadores.fetch({
      request: { url: ORIGEM + caminho, method: 'GET', mode: modo },
      respondWith: (p: Promise<Response>) => (resposta = p),
      waitUntil: (p: Promise<unknown>) => espera.push(p)
    });
    const r = resposta ? await resposta : undefined;
    await Promise.all(espera);
    return r;
  }
  const guardados = (nome: string) => (caches.get(nome)?.itens ?? []).map((i) => new URL(i.url).pathname + new URL(i.url).search);
  return { ambiente, caches, tratadores, pedir, guardados, armazenamento };
}

let sw: ReturnType<typeof montar>;
beforeEach(() => {
  sw = montar();
});

describe('service worker', () => {
  it('guarda os arquivos do app e serve a cópia sem ir à internet', async () => {
    expect(await (await sw.pedir('/_next/static/chunks/app-1.js'))!.text()).toContain('app-1.js');
    sw.ambiente.semInternet = true;
    expect(await (await sw.pedir('/_next/static/chunks/app-1.js'))!.text()).toContain('app-1.js');
    expect(sw.ambiente.pedidos).toHaveLength(1);
  });

  it('sem espaço no aparelho, a tela recebe o arquivo da internet e as cópias antigas saem', async () => {
    for (let i = 0; i < 10; i++) await sw.pedir(`/_next/static/chunks/v${i}.js`);
    sw.ambiente.semEspaco = true;
    const r = await sw.pedir('/_next/static/chunks/novo.js');
    expect(r!.status).toBe(200);
    expect(await r!.text()).toContain('novo.js');
    expect(sw.guardados('revisai-app-v2-arquivos')).toEqual(['/_next/static/chunks/v5.js', '/_next/static/chunks/v6.js', '/_next/static/chunks/v7.js', '/_next/static/chunks/v8.js', '/_next/static/chunks/v9.js']);
  });

  it('fica só com os 300 arquivos mais novos', async () => {
    for (let i = 0; i < 305; i++) await sw.pedir(`/_next/static/chunks/a${i}.js`);
    const lista = sw.guardados('revisai-app-v2-arquivos');
    expect(lista).toHaveLength(300);
    expect(lista[0]).toBe('/_next/static/chunks/a5.js');
    expect(lista.at(-1)).toBe('/_next/static/chunks/a304.js');
  });

  it('não guarda os arquivos do desenvolvimento (?v=)', async () => {
    await sw.pedir('/_next/static/chunks/main-app.js?v=1792280000000');
    expect(sw.guardados('revisai-app-v2-arquivos')).toEqual([]);
  });

  it('telas do app: da internet, e sem internet a última cópia ou a página de sem internet', async () => {
    await sw.pedir('/oficina', 'navigate');
    await sw.pedir('/oficina/clientes?busca=ana', 'navigate');
    sw.ambiente.semInternet = true;
    expect(await (await sw.pedir('/oficina/clientes', 'navigate'))!.text()).toContain('/oficina/clientes');
    expect(await (await sw.pedir('/oficina/agenda', 'navigate'))!.text()).toContain('/oficina');
    sw.caches.clear();
    const sem = await sw.pedir('/oficina/agenda', 'navigate');
    expect(sem!.status).toBe(503);
    expect(await sem!.text()).toContain('Sem internet');
  });

  it('sem espaço, a tela que veio da internet não vira a página de sem internet', async () => {
    sw.ambiente.semEspaco = true;
    const r = await sw.pedir('/oficina/estoque', 'navigate');
    expect(r!.status).toBe(200);
    expect(await r!.text()).toContain('/oficina/estoque');
  });

  it('ao atualizar, apaga as cópias da versão antiga', async () => {
    await sw.armazenamento.open('revisai-app-v1');
    await sw.armazenamento.open('revisai-app-v2-arquivos');
    let espera: Promise<unknown> | undefined;
    sw.tratadores.activate({ waitUntil: (p: Promise<unknown>) => (espera = p) });
    await espera;
    expect(await sw.armazenamento.keys()).toEqual(['revisai-app-v2-arquivos']);
  });

  it('fora do app (outra origem, POST, páginas do site) não interfere', async () => {
    expect(await sw.pedir('/precos', 'navigate')).toBeUndefined();
    expect(await sw.pedir('/api/catalogo')).toBeUndefined();
  });
});
