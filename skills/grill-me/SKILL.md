---
name: grill-me
description: >-
  Entrevista estruturada em rodadas de perguntas para fechar requisitos, plano ou
  decisões de design antes de implementar. Ative SOMENTE quando o usuário pedir
  /grill-me, "me sabatine", "faça perguntas" ou quando a arquitetura tiver
  ambiguidades reais que exijam alinhamento.
---

# Grill Me

Entreviste o usuário de forma implacável, uma decisão por vez, até resolver todas as ramificações do plano ou design.

## Regras

1. **Explore antes de perguntar:** Se uma dúvida puder ser respondida lendo o código ou docs do projeto, leia primeiro (ou use `scout`) — não pergunte o óbvio ao usuário.
2. **Uma pergunta / bloco focado por rodada:** Use `AskUserQuestion` (ou perguntas numeradas curtas) percorrendo cada ramo da árvore de decisões, resolvendo dependências entre decisões uma a uma.
3. **Dê sua recomendação:** Em cada pergunta com trade-off, indique qual opção recomenda e o motivo em 1 linha.
4. **Pare quando fechar:** Não invente perguntas extras depois que escopo, contratos, casos de borda e validação estiverem definidos.
5. **Resumo final:** Ao encerrar, entregue um resumo compacto das decisões fechadas antes de partir para a implementação (ou aguarde `ok`).
