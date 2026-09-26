# Instruções do Oathbound

- Mantenha este repositório independente de regras, hosts, caminhos e segredos de um projeto consumidor.
- Coloque o fluxo comum na skill e nos scripts; configure exceções no `AGENTS.md` do projeto que instala o pacote.
- Ao mudar comportamento, atualize `VERSION`, `CHANGELOG.md` e a referência correspondente na mesma entrega.
- Não sobrescreva instalações existentes automaticamente. Preserve alterações locais e apresente o diff de atualização.
- Descreva somente validações realmente executadas. A fila, os agentes e os scripts de mutação podem alterar projetos consumidores; execute-os apenas em uma tarefa que peça isso.
- Para auditoria de links e documentos do próprio pacote, consulte `tools/README.md` e a configuração em `tools/audit-docs.config.js`.
- No Windows, use comandos nativos do RTK: `rtk read <arquivo>` para leitura completa e `rtk rg -n -C 5 <padrão> <arquivo>` para trechos. Não passe cmdlets PowerShell ao `rtk`.
