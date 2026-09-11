# FP Ops: abertura de chamados pelo Chat CRM

Em Configuracoes > Empresas, edite uma empresa existente e cadastre a URL HTTPS
publica do FP Ops e o token gerado em Helpdesk > Configuracoes no FP Ops.
O token precisa do escopo `tickets:create`. Deixar o campo do token vazio ao
editar preserva o segredo ja cadastrado.

Ativar FP Ops desativa novas aberturas no Zammad para essa empresa. Chamados e
links antigos permanecem no historico. As outras empresas mantem sua configuracao.
Para rollback, desative FP Ops e reative Zammad com suas configuracoes anteriores.

O menu da conversa oferece Abrir chamado. O backend envia ao FP Ops:

- empresa, ID e UUID da conversa para deduplicacao;
- identidade do atendente autenticado, separada do contato solicitante;
- assunto, resumo, prioridade e, opcionalmente, as ultimas 12 mensagens;
- link da conversa de origem.

A API usada e `POST /api/v1/integrations/ticketz/tickets`, autenticada com Bearer.
A resposta `ticket_id`, `number` e `created` gera o link publico e a anotacao
interna. Repetir a abertura na mesma conversa reutiliza o chamado no FP Ops.
O Chat aceita a rota nova `/tickets/:ticketId/helpdesk` e preserva a rota
`/tickets/:ticketId/zammad` para clientes anteriores. A abertura pelo site
tambem segue a integracao configurada na empresa.

Nao ha sincronizacao de comentarios, encerramento ou consulta de andamento
nesta entrega: essas APIs ainda nao existem na implementacao analisada do FP Ops
(commit c44202d7ab51f629367d4ef04665c5e52b04dca6).

Validacao local sem banco de producao:

```sh
cd backend
node node_modules/jest/bin/jest.js --config jest.fp-ops.config.cjs --runInBand
npm run generate:i18nkeys
npm run build
```

Antes de ativar em producao, validar no VIB com URL/token de teste: abrir um
chamado, conferir solicitante e atendente, repetir a abertura e verificar que
o numero permanece igual. O teste de imagens/documentos no APK requer um
aparelho Android; os testes automatizados da interface nao substituem essa etapa.
