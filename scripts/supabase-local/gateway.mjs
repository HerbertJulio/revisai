// Gateway local que imita o Supabase (veja sb.sh): /auth/v1 -> GoTrue, /rest/v1 -> PostgREST,
// /storage/v1 -> armazenamento simples com as mesmas regras (RLS) do banco,
// e uma caixa de e-mails (SMTP na porta 2500) lida em /__mail.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const BASE = process.env.SB_LOCAL ?? path.join(process.env.HOME ?? '/root', '.revisai-supabase');
const chaves = JSON.parse(fs.readFileSync(path.join(BASE, 'chaves.json'), 'utf8'));
const PORTA = Number(process.env.PORTA ?? 54321);
const DIR_ARQ = process.env.DIR_ARQUIVOS ?? path.join(BASE, 'data', 'storage');
const pool = new pg.Pool({ connectionString: 'postgres://postgres@127.0.0.1:54322/postgres', max: 8 });

fs.mkdirSync(DIR_ARQ, { recursive: true });

const caixa = [];

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onAuth(_auth, _session, cb) {
    cb(null, { user: 'local' });
  },
  onData(stream, _session, cb) {
    simpleParser(stream)
      .then((m) => {
        caixa.push({ para: (m.to?.value ?? []).map((v) => v.address.toLowerCase()), assunto: m.subject ?? '', texto: m.text ?? '', html: typeof m.html === 'string' ? m.html : '', quando: Date.now() });
        if (caixa.length > 500) caixa.splice(0, caixa.length - 500);
        cb();
      })
      .catch((e) => cb(e));
  }
});
smtp.listen(2500, '127.0.0.1');

function b64urlJson(parte) {
  return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
}

function verificarJwt(token) {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const esperado = crypto.createHmac('sha256', chaves.segredo).update(`${partes[0]}.${partes[1]}`).digest('base64url');
  if (esperado !== partes[2]) return null;
  const c = b64urlJson(partes[1]);
  if (c.exp && c.exp * 1000 < Date.now()) return null;
  return c;
}

/** Troca as chaves no formato novo (sb_publishable_/sb_secret_) pelos JWT, como o gateway do Supabase. */
function normalizarChave(valor) {
  if (!valor) return null;
  if (valor.startsWith('sb_publishable_')) return chaves.anon;
  if (valor.startsWith('sb_secret_')) return chaves.service;
  return valor;
}

function autorizacao(req) {
  const apikey = normalizarChave(req.headers['apikey']);
  const bearer = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
  return normalizarChave(bearer) || apikey || chaves.anon;
}

function proxy(req, res, destinoPorta, novoCaminho) {
  const headers = { ...req.headers, host: `127.0.0.1:${destinoPorta}` };
  headers['authorization'] = `Bearer ${autorizacao(req)}`;
  if (headers['apikey']) headers['apikey'] = normalizarChave(headers['apikey']);
  const p = http.request({ host: '127.0.0.1', port: destinoPorta, method: req.method, path: novoCaminho, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  p.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: String(e) }));
  });
  req.pipe(p);
}

function json(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  const partes = [];
  for await (const c of req) partes.push(c);
  return Buffer.concat(partes);
}

/** Roda fn numa transação com o papel e as claims do JWT da requisição (as políticas RLS valem). */
async function comoQuemPede(req, fn) {
  const claims = verificarJwt(autorizacao(req));
  if (!claims) throw Object.assign(new Error('JWT inválido'), { status: 401 });
  const papel = ['anon', 'authenticated', 'service_role'].includes(claims.role) ? claims.role : 'anon';
  const cabecalhos = {};
  for (const [k, v] of Object.entries(req.headers)) cabecalhos[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${papel}`);
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true), set_config('request.method', $3, true)`, [JSON.stringify(claims), JSON.stringify(cabecalhos), req.method]);
    const r = await fn(c, claims);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function caminhoArquivo(bucket, nome) {
  const p = path.normalize(path.join(DIR_ARQ, bucket, nome));
  if (!p.startsWith(path.join(DIR_ARQ, bucket) + path.sep)) throw Object.assign(new Error('caminho inválido'), { status: 400 });
  return p;
}

async function armazenamento(req, res, resto) {
  // resto: /object/... (sem o /storage/v1)
  const url = new URL(resto, 'http://x');
  const partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (partes[0] !== 'object') return json(res, 404, { error: 'not_found' });
    if (partes[1] === 'public' && req.method === 'GET') {
      const [bucket, ...nome] = partes.slice(2);
      const b = await pool.query('select public from storage.buckets where id = $1', [bucket]);
      if (!b.rows[0]?.public) return json(res, 400, { error: 'Bucket not found' });
      const arq = caminhoArquivo(bucket, nome.join('/'));
      if (!fs.existsSync(arq)) return json(res, 400, { error: 'not_found', message: 'Object not found' });
      const meta = await pool.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, nome.join('/')]);
      res.writeHead(200, { 'content-type': meta.rows[0]?.metadata?.mimetype ?? 'application/octet-stream' });
      return fs.createReadStream(arq).pipe(res);
    }
    if (partes[1] === 'sign' && req.method === 'GET') {
      const [bucket, ...nome] = partes.slice(2);
      const token = url.searchParams.get('token') ?? '';
      const c = verificarJwt(token);
      if (!c || c.url !== `${bucket}/${nome.join('/')}`) return json(res, 400, { error: 'InvalidJWT' });
      const arq = caminhoArquivo(bucket, nome.join('/'));
      if (!fs.existsSync(arq)) return json(res, 400, { error: 'not_found' });
      return fs.createReadStream(arq).pipe(res);
    }
    if (partes[1] === 'sign' && req.method === 'POST') {
      const [bucket, ...nome] = partes.slice(2);
      const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}');
      const ok = await comoQuemPede(req, async (c) => (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, nome.join('/')])).rowCount > 0);
      if (!ok) return json(res, 400, { error: 'not_found', message: 'Object not found' });
      const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const h = b({ alg: 'HS256', typ: 'JWT' });
      const pl = b({ url: `${bucket}/${nome.join('/')}`, exp: Math.floor(Date.now() / 1000) + Number(corpo.expiresIn ?? 60) });
      const s = crypto.createHmac('sha256', chaves.segredo).update(`${h}.${pl}`).digest('base64url');
      return json(res, 200, { signedURL: `/object/sign/${bucket}/${nome.map(encodeURIComponent).join('/')}?token=${h}.${pl}.${s}` });
    }
    if (req.method === 'DELETE' && partes.length === 2) {
      const bucket = partes[1];
      const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}');
      const nomes = Array.isArray(corpo.prefixes) ? corpo.prefixes : [];
      const apagados = await comoQuemPede(req, async (c) => (await c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning name', [bucket, nomes])).rows);
      for (const r of apagados) fs.rmSync(caminhoArquivo(bucket, r.name), { force: true });
      return json(res, 200, apagados.map((r) => ({ name: r.name, bucket_id: bucket })));
    }
    if ((req.method === 'POST' || req.method === 'PUT') && partes.length >= 3) {
      const [bucket, ...nome] = partes.slice(1);
      const caminho = nome.join('/');
      const bytes = await lerCorpo(req);
      const tipo = String(req.headers['content-type'] ?? 'application/octet-stream').split(';')[0];
      const b = (await pool.query('select file_size_limit, allowed_mime_types from storage.buckets where id = $1', [bucket])).rows[0];
      if (!b) return json(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      if (b.file_size_limit && bytes.length > Number(b.file_size_limit)) return json(res, 400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
      if (b.allowed_mime_types?.length && !b.allowed_mime_types.includes(tipo)) return json(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${tipo} is not supported` });
      const upsert = String(req.headers['x-upsert'] ?? 'false') === 'true';
      try {
        await comoQuemPede(req, async (c, claims) => {
          const meta = { mimetype: tipo, size: bytes.length, cacheControl: req.headers['cache-control'] ?? null };
          if (upsert) {
            await c.query(
              `insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)
               on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now()`,
              [bucket, caminho, claims.sub ?? null, meta]
            );
          } else {
            await c.query('insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)', [bucket, caminho, claims.sub ?? null, meta]);
          }
        });
      } catch (e) {
        if (e.code === '23505') return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        if (e.code === '42501') return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        throw e;
      }
      const arq = caminhoArquivo(bucket, caminho);
      fs.mkdirSync(path.dirname(arq), { recursive: true });
      fs.writeFileSync(arq, bytes);
      return json(res, 200, { Key: `${bucket}/${caminho}`, Id: crypto.randomUUID() });
    }
    if (req.method === 'GET' && partes.length >= 3) {
      const inicio = partes[1] === 'authenticated' ? 2 : 1;
      const [bucket, ...nome] = partes.slice(inicio);
      const ok = await comoQuemPede(req, async (c) => (await c.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, nome.join('/')])).rows[0]);
      if (!ok) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const arq = caminhoArquivo(bucket, nome.join('/'));
      if (!fs.existsSync(arq)) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      res.writeHead(200, { 'content-type': ok.metadata?.mimetype ?? 'application/octet-stream' });
      return fs.createReadStream(arq).pipe(res);
    }
    return json(res, 404, { error: 'not_found' });
  } catch (e) {
    return json(res, e.status ?? 500, { statusCode: String(e.status ?? 500), error: 'erro', message: String(e.message ?? e) });
  }
}

const TEMPLATE = `<h2>Seu código do Revisaí</h2><p>Código: <strong>{{ .Token }}</strong></p><p><a href="{{ .ConfirmationURL }}">Entrar</a></p>`;

const servidor = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-headers', 'authorization, apikey, content-type, x-client-info, x-upsert, prefer, range, accept-profile, content-profile, x-revisai-sistema, x-revisai-equipe');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('access-control-expose-headers', 'content-range, x-total-count');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (url.startsWith('/auth/v1/')) return proxy(req, res, 9999, url.slice('/auth/v1'.length));
  if (url.startsWith('/rest/v1/')) return proxy(req, res, 3001, url.slice('/rest/v1'.length));
  if (url.startsWith('/storage/v1/')) return armazenamento(req, res, url.slice('/storage/v1'.length));
  if (url.startsWith('/__templates/')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(TEMPLATE);
  }
  if (url.startsWith('/__mail')) {
    const u = new URL(url, 'http://x');
    const para = (u.searchParams.get('para') ?? '').toLowerCase();
    const lista = para ? caixa.filter((m) => m.para.includes(para)) : caixa;
    if (req.method === 'DELETE') {
      caixa.length = 0;
      return json(res, 200, { ok: true });
    }
    return json(res, 200, lista);
  }
  if (url === '/__saude') return json(res, 200, { ok: true });
  json(res, 404, { message: 'no route' });
});

servidor.listen(PORTA, '127.0.0.1', () => console.log(`gateway em http://127.0.0.1:${PORTA}`));
