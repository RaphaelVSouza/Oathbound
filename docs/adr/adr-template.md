---
status: Proposed # Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN
date: AAAA-MM-DD # data da última mudança de status
decision-makers: [Nome 1, Nome 2]
consulted: [] # opcional: quem deu opinião técnica
informed: [] # opcional: quem só precisa saber da decisão
---

<!-- Guia: docs/adr/como-escrever-adr.md. Leitura alvo: 5 a 10 minutos. -->

# NNNN - Título curto que afirma a decisão tomada

## Contexto e Problema

Cenário atual, restrições técnicas ou de negócio (prazo, orçamento, equipe, legado, SLA) e o problema que exige decisão. Tom neutro, sem vender a solução (2 a 4 frases).

## Fatores de Decisão <!-- opcional -->

- [RNF relevante, ex.: latência p99 abaixo de 100 ms]
- [Custo, curva de aprendizado, prazo ou compliance]

## Opções Consideradas

- [Opção 1]
- [Opção 2]
- [Opção 3]

## Decisão

Opção escolhida: **"[Opção 1]"**, porque [justificativa ligada aos fatores acima].

<!-- Se a regra vale só para código novo, diga aqui como o legado será tratado. -->

### Consequências

- **Bom:** [benefício concreto].
- **Ruim:** [trade-off, custo operacional ou limitação assumida] — _mitigação:_ [como reduzir].
- **Neutro:** [impacto colateral ou ajuste necessário].

### Confirmação

[Como verificar a conformidade: teste automatizado, regra de lint/arquitetura, checklist de code review, critério de Go/No-Go.]

## Prós e Contras das Opções <!-- opcional para decisões simples -->

### [Opção 1]

- **Bom:** porque [argumento].
- **Ruim:** porque [argumento].

### [Opção 2]

- **Bom:** porque [argumento].
- **Ruim:** porque [argumento].

## Referências <!-- opcional -->

- [RFC, benchmark, issue ou ADR relacionada]
