# Auditoria por mutação

`gremlin` recebe fontes-alvo, testes e comando de teste. Ele mede baseline,
cria `<fonte>.mut-bak`, aplica uma mudança pequena por vez, roda os testes
indicados e restaura o fonte conferindo hashes. Execute-o em série, sem outro
editor ou fila ativa nos mesmos arquivos.

Neste pacote, `run.js` **não** copia `*.mut-bak` sobre arquivos do projeto.
Após timeout, falha ou término incompleto, pare novas edições nos alvos e
inspecione o backup, o hash inicial registrado e o estado Git. Restaure
somente um backup cuja origem e conteúdo tenham sido confirmados. O pacote
não conclui automaticamente essa decisão.
