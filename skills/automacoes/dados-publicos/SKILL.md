---
nome: automacoes/dados-publicos
dominio: automacoes
produto: add-on (diferencial)
status: parcial
arquivos:
  - app/api/veiculos/placa/route.ts
  - app/api/veiculos/fipe/route.ts
  - lib/fipe.ts
  - lib/equipe/cnpj.ts
  - lib/recall.ts
---

# Automações de dados públicos

O diferencial "além de ERP": o sistema vai buscar o dado para o usuário em vez de ele catar
na internet e digitar de volta. É o que os ERPs comuns não fazem com facilidade.

## Já existe
- **Placa → carro.** `app/api/veiculos/placa` (consultadeplaca.net, pago; tem provedor de teste grátis para demonstrar). Preenche marca, modelo, ano, cor.
- **FIPE → preço do carro.** `lib/fipe.ts` pela BrasilAPI (grátis, sem chave), com cache mensal.
- **CNPJ → dados da empresa.** `lib/equipe/cnpj.ts` (BrasilAPI / Receita), no cadastro de loja.
- **Recall.** `lib/recall.ts` cruza campanhas do governo (Senatran/gov.br) com os carros e avisa o cliente.

## Próximas (alto valor, grátis ou barato)
Ideias de buscar-para-o-usuário que reduzem dor do dia a dia:
- **CEP → endereço** (ViaCEP/BrasilAPI, grátis) no cadastro de cliente e loja.
- **Inscrição estadual / Sintegra** da loja, para nota e cadastro.
- **Tabela de tempos de mão de obra** por serviço/carro, para orçar o serviço em horas.
- **Catálogo de peças por montadora/ano** (aplicação), para achar a peça certa pelo carro.
- **Boleto/DANFE lido por foto** (OCR com a IA que já temos), para dar entrada de nota de compra sem digitar.
- **Cotação de câmbio/índices** para peças importadas.
- **Consulta de débitos/IPVA/licenciamento** do veículo (quando houver fonte pública viável).

## Padrão de implementação
Cada automação é uma rota em `app/api/...` que: confere acesso, vê cache no banco (via
`clienteSistema`), senão chama a fonte, guarda no cache e devolve. Fonte paga tem cota por
conta; fonte grátis tem limite por IP. Falha da fonte nunca quebra a tela — cai para
preencher à mão.

## Regras e invariantes
- Cachear para não repetir chamada (e não gastar, quando a fonte é paga).
- A chave da fonte fica só no servidor.

## Segurança e LGPD
Dado de veículo e empresa pode ser pessoal (proprietário): guardar o mínimo, não expor sem
necessidade. Ver `plataforma/seguranca-lgpd`.

## Depende de
`plataforma/dados-rls`, `plataforma/ia` (para OCR).

## A fazer
Cada "próxima" vira uma rota no mesmo padrão. Priorizar CEP, tabela de tempos e leitura de
nota por foto.
