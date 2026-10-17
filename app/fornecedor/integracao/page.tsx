import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AvisoErro, Quadro } from '@/components/fornecedor/comum';
import { DocumentacaoDaApi } from '@/components/fornecedor/DocumentacaoDaApi';
import { TokensDaApi } from '@/components/fornecedor/Integracao';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { painelOuEntrada } from '@/lib/loja/painel';
import { chamadasDaApi, tokensDaLoja } from '@/lib/loja/tokens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Integração' };

/** O endereço do site como a pessoa abriu (vale no computador de teste e no ar). */
async function origemDoSite(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim();
  if (!host) return process.env.SITE_URL ?? 'https://revisai.howlks.com';
  const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() || (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function PaginaIntegracao() {
  const r = await painelOuEntrada('/fornecedor/integracao');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const dono = painel.papel === 'dono';
  const [tokens, chamadas, origem] = await Promise.all([dono ? tokensDaLoja(sb, painel.loja.id) : Promise.resolve([]), dono ? chamadasDaApi(sb, painel.loja.id) : Promise.resolve(null), origemDoSite()]);
  return (
    <MolduraFornecedor
      aba="integracao"
      painel={painel}
      titulo="Integração"
      descricao="O sistema da loja manda preço e estoque para o Revisaí sozinho, pela API. Sem sistema, a planilha em Produtos faz o mesmo."
    >
      <Quadro titulo="Tokens da API" descricao="Cada sistema usa um token para mexer nos produtos da loja.">
        {tokens ? <TokensDaApi tokens={tokens} chamadas={chamadas} dono={dono} /> : <AvisoErro>Não deu para carregar os tokens agora. Atualize a página em instantes.</AvisoErro>}
      </Quadro>
      <DocumentacaoDaApi origem={origem} />
    </MolduraFornecedor>
  );
}
