# ADR 0003 — Jev na revisão de mudanças em testes

Data: 2026-11-14. Estado: protótipo manual, com limiar provisório medido em dados sintéticos.

## Decisão

Rodar `test/jev/revisar-teste.js` sob demanda quando comparar um teste com o requisito exige interpretar texto. O comando recebe um critério de aceite, a asserção anterior e o diff. Reutiliza o transporte do Jev com uma pergunta `Noul` sobre enfraquecimento.

O comando envia esses três campos à TypeSafe após aplicar a redação do auditor. Use exemplos sintéticos ou trechos autorizados. A saída contém apenas status, probabilidade ou motivo de indisponibilidade.

Use `alerta` a partir de 0,81, `sem_alerta` até 0,30 e `inconclusivo` entre os dois. Use o sinal na revisão humana. Falha de infraestrutura retorna `indisponivel`. Delegação omitida, teste falhando e erro repetido são verificações locais.

## Uso

Prepare um JSON com os três campos, como neste caso de expiração antecipada:

```json
{
  "criterio": "A reserva expira no segundo 323.",
  "assercao_anterior": "assert.deepEqual(expire(322), [])",
  "diff": "- assert.deepEqual(expire(322), [])\n+ assert.deepEqual(expire(322), ['boundary'])"
}
```

Com `JEV_API_KEY` no ambiente, rode no Git Bash:

```bash
rtk proxy node test/jev/revisar-teste.js < caso.json
```

Saída JSON. Código 0 indica análise concluída, 1 indisponibilidade e 2 entrada inválida.

## Calibração preliminar

Dois subagentes prepararam conjuntos sintéticos independentes. O gabarito foi revisado antes de medir a conferência. Com `jev-1.14.0`, medimos 18 casos de calibração e 18 de conferência. O modelo recebeu só os três campos de entrada. Os rótulos ficaram com o avaliador.

| Conjunto | Sem alerta / alerta | Enfraquecimentos alertados | Mudanças legítimas alertadas | Incertos que ficaram inconclusivos |
| --- | --- | --- | --- | --- |
| Calibração | 0,30 / 0,70 | 7/8 | 2/8 | 0/2 |
| Calibração | 0,30 / 0,81 | 6/8 | 0/8 | 2/2 |
| Conferência | 0,30 / 0,70 | 7/7 | 0/9 | 1/2 |
| Conferência | 0,30 / 0,81 | 7/7 | 0/9 | 2/2 |

A calibração sugeriu 0,65 / 0,81 antes da conferência. Nesse par, um caso incerto da conferência ficou como `sem_alerta`. Mantivemos 0,30 para evitar essa dispensa. Com 0,30 / 0,81, os dois enfraquecimentos sem alerta positivo na calibração ficaram inconclusivos. A alteração é provisória e requer outra amostra independente.

Para repetir as duas medições com a API:

```bash
rtk proxy node test/jev/medir-revisao.js test/jev/casos-calibracao.json
rtk proxy node test/jev/medir-revisao.js test/jev/casos-conferencia.json
```

Antes de propor integração ao hook, compare com gabarito humano independente e reporte detecção, falsos alertas e taxa de inconclusivos.
