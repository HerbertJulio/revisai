// Como usar a API da loja: endereço, exemplos com curl, campos, respostas e limites. Sem estado.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CHAMADAS_POR_MINUTO, LIMITE_DO_LOTE } from '@/lib/loja/api-dados';
import { Quadro } from './comum';
import { BotaoCopiar } from './Integracao';

function Codigo({ texto }: { texto: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-tinta px-4 py-3 pr-28 text-[13px] leading-relaxed text-papel">
        <code>{texto}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <BotaoCopiar texto={texto} />
      </div>
    </div>
  );
}

function Campo({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[200px_1fr] sm:gap-4 sm:px-5">
      <dt className="num font-semibold">{nome}</dt>
      <dd className="text-[14.5px] text-tinta-2">{children}</dd>
    </div>
  );
}

export function DocumentacaoDaApi({ origem }: { origem: string }) {
  const base = `${origem}/api/lojas/v1/produtos`;
  const listar = `curl -s "${base}?limite=100" \\\n  -H "Authorization: Bearer SEU_TOKEN"`;
  const mudar = `curl -s -X PATCH "${base}" \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"produtos": [\n    {"codigo": "OL-5W30-1L", "preco": 41.90, "estoque": 120},\n    {"codigo": "FO-PSL55", "estoque": 0, "prazo_entrega_horas": 24},\n    {"codigo": "VE-NGK-BKR6", "ativo": false}\n  ]}'`;
  const resposta = `{\n  "recebidos": 3,\n  "atualizados": 2,\n  "sem_mudanca": 1,\n  "nao_encontrados": [],\n  "erros": []\n}`;
  return (
    <div className="flex flex-col gap-5">
      <Quadro
        titulo="Como funciona"
        descricao={
          <>
            O sistema da loja manda o preço, o estoque, o prazo de entrega e se o produto está à venda, pelo <strong>código</strong> de cada produto (o mesmo da coluna codigo da
            planilha). A API não cria produtos: cadastre em{' '}
            <Link href="/fornecedor/produtos" className="font-semibold underline">
              Produtos
            </Link>{' '}
            (um por um ou pela planilha) com o código igual ao do seu sistema.
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] text-tinta-2">
          <li>
            <strong>Bling, Tiny e outros sistemas:</strong> ainda não há conector pronto no Revisaí. Quem cuida do seu sistema, ou um integrador, pode mandar os produtos para este endereço
            com o token, sempre que o preço ou o estoque mudar (ou de tempos em tempos).
          </li>
          <li>
            <strong>Prefere planilha?</strong> Em Produtos, baixe a planilha da loja, mude e mande de volta. Funciona do mesmo jeito, sem token.
          </li>
          <li>O token é como uma senha da loja: fica no sistema, nunca em mensagem. Se vazar, revogue aqui e crie outro. Cada chamada fica registrada, só com as contagens.</li>
        </ul>
      </Quadro>

      <Quadro titulo="Ler os produtos" descricao={`Devolve os produtos da loja do token, 100 por vez (até ${LIMITE_DO_LOTE} com limite). Para a página seguinte, mande depois com o valor de proximo.`}>
        <Codigo texto={listar} />
        <p className="text-[14px] text-tinta-2">
          Filtros: <span className="num">codigo=OL-5W30-1L</span> (um produto), <span className="num">limite=500</span> e <span className="num">depois=123</span>.
        </p>
      </Quadro>

      <Quadro titulo="Mudar preço e estoque" descricao={<>Até {LIMITE_DO_LOTE} produtos por chamada. Só muda o que vier em cada produto; o resto fica como está.</>}>
        <Codigo texto={mudar} />
        <dl className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          <Campo nome="codigo">Obrigatório. O código do produto na sua loja.</Campo>
          <Campo nome="preco">Preço por unidade, de 0,01 a 100.000, com ponto: 41.90.</Campo>
          <Campo nome="estoque">Unidades em estoque, número inteiro. null para a loja não controlar estoque nesse produto.</Campo>
          <Campo nome="prazo_entrega_horas">Prazo de entrega desse produto, de 1 a 720 horas. null para usar o prazo da loja.</Campo>
          <Campo nome="ativo">true para vender, false para tirar da loja (o produto continua cadastrado).</Campo>
        </dl>
        <p className="text-[14px] text-tinta-2">Resposta:</p>
        <Codigo texto={resposta} />
        <p className="text-[14px] text-tinta-2">
          Código que não existe na sua loja vem em nao_encontrados (nada é criado). Se algum produto do lote não conferir (preço negativo, campo com nome errado, código repetido), a
          resposta é 400 com a lista erros, cada um com o índice e o motivo, e nada muda: corrija e mande de novo.
        </p>
      </Quadro>

      <Quadro titulo="Erros e limites">
        <dl className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          <Campo nome="401">Sem token, token errado ou revogado.</Campo>
          <Campo nome="400">Dados que não conferem. A resposta diz o que corrigir, em erro e erros.</Campo>
          <Campo nome="413">O corpo passou de 512 KB. Mande em lotes menores.</Campo>
          <Campo nome="429">
            Mais de {CHAMADAS_POR_MINUTO} chamadas por minuto no mesmo token (ou muitas tentativas com token errado). Espere o tempo do cabeçalho Retry-After.
          </Campo>
          <Campo nome="500 e 503">Falha do nosso lado. Tente de novo em instantes.</Campo>
        </dl>
        <p className="text-[14px] text-tinta-2">
          Todo erro vem em JSON, em português: <span className="num">{'{"erro": "...", "codigo": "token_invalido"}'}</span>.
        </p>
      </Quadro>
    </div>
  );
}
