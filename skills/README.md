# Skills do Revisaí

Esta pasta é o mapa do sistema por módulos. Cada recurso tem uma _skill_: um `SKILL.md`
que descreve **o que o recurso faz, como ele é feito por dentro e como mexer nele sem
quebrar o resto**. A ideia é dupla.

1. **Para a IA.** Ao trabalhar num recurso, a IA carrega a skill daquele recurso e passa a
   dominar aquele pedaço inteiro — telas, lógica, banco e regras — sem precisar reler o
   sistema todo. Cada skill é autossuficiente.
2. **Para você.** No VS Code, abrir a skill de um módulo é entender aquele módulo em uma
   página, com os caminhos dos arquivos para ir direto ao ponto.

Leia também [`ARQUITETURA.md`](./ARQUITETURA.md): como os módulos são separados, como podem
ser vendidos em partes, a decisão de mobile x desktop e a visão de segurança.

## Como usar

- Vai mexer num módulo? Abra o `SKILL.md` dele primeiro. Ele diz os arquivos, as tabelas,
  as funções do banco e as regras que não podem quebrar.
- Criou ou mudou um recurso? Atualize a skill dele na mesma leva. A skill é a verdade do
  módulo; se ela e o código divergirem, o código mudou e a skill ficou para trás.
- Skill nova? Copie [`_TEMPLATE/SKILL.md`](./_TEMPLATE/SKILL.md) e preencha.
- Convenção de pasta: `skills/<grupo>/<modulo>/SKILL.md`. Nome em minúsculas com hífen.

## Grupos e módulos

Status: ✅ pronto · 🟡 parcial · ⬜ a construir.

### Plataforma (base, compartilhada por todos os painéis)
| Módulo | Status | O que é |
|---|---|---|
| [`plataforma/auth-paineis`](./plataforma/auth-paineis/SKILL.md) | ✅ | Login, seletor de painel, papéis, sessão e 2FA da equipe. |
| [`plataforma/dados-rls`](./plataforma/dados-rls/SKILL.md) | ✅ | Clientes Supabase, regras de acesso (RLS), chave do sistema, dados locais e sincronização. |
| [`plataforma/avisos`](./plataforma/avisos/SKILL.md) | ✅ | Fila de avisos e os canais WhatsApp, e-mail e push. |
| [`plataforma/ia`](./plataforma/ia/SKILL.md) | ✅ | Gemini para voz, agente e transcrição. |
| [`plataforma/seguranca-lgpd`](./plataforma/seguranca-lgpd/SKILL.md) | 🟡 | Acesso, segredos, validação, limites e LGPD. |

### Oficina (produto "Revisaí Oficina")
| Módulo | Status | O que é |
|---|---|---|
| [`oficina/ordens`](./oficina/ordens/SKILL.md) | ✅ | Ordem de serviço, orçamento, checklist, garantia e links ao cliente. |
| `oficina/cadastros` | ✅ | Clientes e carros. _(a documentar)_ |
| [`oficina/estoque`](./oficina/estoque/SKILL.md) | 🟡 | Saldo e custo da última compra. Falta custo médio. |
| [`oficina/financeiro`](./oficina/financeiro/SKILL.md) | ✅ | Contas a pagar e a receber, caixa, fiado, parcelas e Pix. |
| `oficina/fiscal` | 🟡 | NF-e e NFS-e pela Focus. _(a documentar)_ |
| `oficina/avisos-manutencao` | ✅ | Lembretes de revisão, recall e pedido de avaliação. _(a documentar)_ |
| `oficina/agenda` | ✅ | Agendamento online por link. _(a documentar)_ |
| `oficina/clube` | ✅ | Clube de manutenção, fidelidade e cashback. _(a documentar)_ |
| `oficina/compras` | 🟡 | Compra no marketplace e alertas de preço. _(a documentar)_ |
| `oficina/ia-voz` | ✅ | Ordem por voz e agente no WhatsApp. _(a documentar)_ |
| [`oficina/mecanicos`](./oficina/mecanicos/SKILL.md) | ⬜ | Permissões do mecânico, frente de loja, apontamento de horas e PCM/PCP. |

### Automações (o diferencial "além de ERP")
| Módulo | Status | O que é |
|---|---|---|
| [`automacoes/dados-publicos`](./automacoes/dados-publicos/SKILL.md) | 🟡 | Buscar dados para o usuário em vez de ele catar na internet: placa, FIPE, CNPJ, recall, e as próximas. |

### Loja / Fornecedor (produto "Revisaí Loja")
| Módulo | Status | O que é |
|---|---|---|
| [`loja/catalogo`](./loja/catalogo/SKILL.md) | 🟡 | Produtos, fotos e planilha. Foto vai virar obrigatória para anunciar. |
| [`loja/anuncios`](./loja/anuncios/SKILL.md) | ✅ | Vitrine, impulso, destaque e promoção. |
| `loja/pedidos` | ✅ | Pedidos e confirmação de pagamento. _(a documentar)_ |
| `loja/entregas` | ✅ | Link do entregador e rastreio. _(a documentar)_ |
| `loja/financeiro` | ✅ | Pix da loja, crédito faturado, cashback e extrato. _(a documentar)_ |
| `loja/api` | ✅ | API pública para ERP (Bling, Tiny). _(a documentar)_ |
| `loja/equipe` | ✅ | Dono e vendedores. _(a documentar)_ |

### ERP (as lacunas a construir)
| Módulo | Status | O que é |
|---|---|---|
| [`erp/compras-formais`](./erp/compras-formais/SKILL.md) | 🟡 | Pedido de compra → recebimento → entrada no estoque → conta a pagar. **1ª versão construída.** |
| [`erp/custo-estoque`](./erp/custo-estoque/SKILL.md) | 🟡 | Posição de estoque valorizada e CMV prontos; custo médio no núcleo é o passo final. |
| [`erp/contabilidade`](./erp/contabilidade/SKILL.md) | 🟡 | DRE por categoria (caixa e competência) pronto; plano de contas e centro de custo depois. |
| [`erp/fluxo-caixa`](./erp/fluxo-caixa/SKILL.md) | 🟡 | Projeção de caixa pelos vencimentos, pronta. |
| [`erp/bi`](./erp/bi/SKILL.md) | 🟡 | Faturamento, ordens, ticket médio, inadimplência e histórico prontos; curva ABC e giro depois. |
| `erp/multiempresa` | ⬜ | Uma pessoa gerindo várias oficinas ou lojas. |

### Admin global (uso interno da equipe Revisaí)
| Módulo | Status | O que é |
|---|---|---|
| [`admin/global`](./admin/global/SKILL.md) | 🟡 | Moderação, assinaturas, suporte, LGPD, relatórios internos e marketing do sistema. |

> O admin é só o global (nosso). A loja não tem painel de administração separado; o sistema
> próprio dela já cuida disso.

## Empacotamento (vender em partes)

A separação em módulos existe também para vender o sistema em pedaços, como o Google separa
Gmail e Drive. A proposta de pacotes e a mecânica de liberar/bloquear módulo por conta estão
em [`ARQUITETURA.md`](./ARQUITETURA.md#empacotamento).
