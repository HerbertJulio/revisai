---
nome: automacoes/dados-publicos
dominio: automacoes
produto: add-on (diferencial)
status: parcial
arquivos:
  - lib/placa-uf.ts
  - app/api/veiculos/placa/route.ts
  - app/api/veiculos/placa/provedores.ts
  - app/api/veiculos/fipe/route.ts
  - lib/fipe.ts
  - lib/equipe/cnpj.ts
  - lib/recall.ts
---

# Automações de dados públicos

O diferencial "além de ERP": o sistema vai buscar o dado para o usuário em vez de ele catar
na internet e digitar de volta. É o que os ERPs comuns não fazem com facilidade.

## Já existe
- **Placa → UF, de graça e offline.** `lib/placa-uf.ts`: só da placa, sem internet e sem custo, sai o tipo (antiga ou Mercosul) e o estado de emplacamento (faixas de letras oficiais). Adianta o cadastro: a pessoa digita a placa e a UF já vem. O que não sai da placa fica para a consulta paga.
- **Placa → carro (módulo Despachante, pago).** `app/api/veiculos/placa` (consultadeplaca.net, pago; tem provedor de teste grátis para demonstrar, `PLACA_API_PROVEDOR=teste`). Preenche marca, modelo, ano, cor, chassi (mascarado) e FIPE. Cota por mês por oficina. É o add-on que o usuário paga para ter; a situação de roubo/furto e débitos entram aqui quando o provedor expõe (ver "A fazer").
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
- **Despachante (Pro, pago):** roubo/furto, débitos, IPVA, licenciamento e restrições do veículo, por um provedor pago (Infosimples, API Brasil, consultadeplaca e afins). É o módulo a mais que o usuário paga para ter; cada consulta tem custo, então entra na mesma cota mensal e cache da placa.

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
