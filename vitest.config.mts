import { defineConfig } from 'vitest/config';

export default defineConfig({
  // NODE_ENV fixo em 'test': a publicação roda os testes com NODE_ENV=production herdado do build,
  // e os provedores de mentira (placa, FIPE) se desligam em produção.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', env: { NODE_ENV: 'test' } },
  resolve: { alias: { '@': new URL('./', import.meta.url).pathname } }
});
