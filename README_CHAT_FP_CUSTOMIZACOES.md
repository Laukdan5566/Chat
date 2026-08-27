# Chat FP Informatica - Customizacoes do Ticketz

Este documento registra as principais customizacoes feitas no projeto Ticketz da FP Informatica, para facilitar continuidade em outra maquina ou por outro desenvolvedor.

Nao colocar senhas, tokens privados ou chaves Firebase neste arquivo. Quando necessario, usar arquivos `.env`, segredos do servidor ou documentos internos separados.

## Estado atual em 2026-06-04

Resumo rapido do que estava funcionando no ultimo ponto da conversa:

- Ticketz em producao acessivel por `https://chat.fpinformatica.com.br`;
- backend publicado por proxy em `https://chat.fpinformatica.com.br/backend`;
- app Android com logo FP e push nativo funcionando em segundo plano;
- app Windows publicado e funcionando como wrapper do Chat FP;
- participantes/apoio aparecem na lista customizada e recebem notificacoes;
- ACK/status de mensagens corrigido para nao precisar F5;
- dashboard admin com cards extras de conexoes e empresas;
- Zammad integrado e validado em teste;
- N8N por fila funcionando e parando quando agente assume;
- Meta/Facebook/Instagram iniciado, mas ainda depende da configuracao no Meta Developers e dos tokens/permissoes finais.

Ultimo bundle de frontend observado em producao:

```txt
main.726b7a6c.js
```

Ultimo deploy relevante de backend:

```txt
backend ACK hotfix aplicado e validado com status ready
```

Importante: o repositorio local esta com muitas alteracoes nao commitadas e arquivos novos. Antes de trocar de maquina, salvar/copiar a pasta inteira ou fazer um commit/backup completo.

## Ambientes

### Projeto local

Pasta principal:

```txt
C:\Users\DANIEL\Documents\CHat FP INFORMATICA\fp-ticketz
```

Projetos relacionados:

```txt
C:\Users\DANIEL\Documents\CHat FP INFORMATICA\chatfp-android
C:\Users\DANIEL\Documents\CHat FP INFORMATICA\chatfp-windows
```

### Producao

URL publica:

```txt
https://chat.fpinformatica.com.br
```

Backend publico via proxy:

```txt
https://chat.fpinformatica.com.br/backend
```

Servidor de producao:

```txt
10.11.11.4
```

Usuario SSH:

```txt
fp
```

Nao registrar a senha neste README.

Containers principais em producao:

```txt
ticketz_frontend
ticketz_backend
ticketz_postgres
ticketz_redis
```

O frontend dentro do container `ticketz_frontend` usa:

```txt
/var/www/public
```

Importante: nao publicar frontend em `/usr/share/nginx/html`, pois a raiz correta do nginx neste container e `/var/www/public`.

Config de frontend de producao:

```json
{
  "BACKEND_PROTOCOL": "https",
  "BACKEND_HOST": "chat.fpinformatica.com.br",
  "BACKEND_PATH": "/backend",
  "LOG_LEVEL": "info"
}
```

Esse arquivo fica salvo no servidor como:

```txt
/home/fp/ticketz-prod-config.json
```

E deve ser restaurado para:

```txt
/var/www/public/config.json
```

apos cada deploy de frontend.

## Scripts de deploy usados

Na pasta:

```txt
C:\Users\DANIEL\Documents\CHat FP INFORMATICA
```

### Deploy correto do frontend

Arquivo:

```txt
deploy-frontend-correct-root.sh
```

Funcao:

- extrai `/home/fp/ticketz-frontend-native-token.tar.gz`;
- faz backup de `/var/www/public`;
- copia `build/.` para `/var/www/public`;
- restaura `/home/fp/ticketz-prod-config.json` como `config.json`;
- recarrega nginx;
- valida hash do bundle principal.

### Deploy completo backend + frontend

Arquivo:

```txt
deploy-ticketz-full-update.sh
```

Funcao:

- atualiza backend `dist`;
- copia `package.json` e `package-lock.json`;
- roda `npm install --omit=dev`;
- tenta migracoes somente se a config existir;
- atualiza frontend;
- reinicia backend;
- recarrega nginx.

Usar com cuidado, pois mexe no backend e frontend.

### Hotfix backend de ACK

Arquivo:

```txt
deploy-backend-ack-hotfix.sh
```

Funcao:

- copia somente `backend/dist`;
- faz backup do `dist` atual;
- reinicia `ticketz_backend`;
- valida `http://127.0.0.1:3000/`.

Esse script foi usado para corrigir atualizacao de status de mensagens enviadas.

## Comandos uteis

### Build frontend local

Na pasta `fp-ticketz/frontend`:

```powershell
npm.cmd run winBuild
```

Observacao: o build compila com avisos antigos de Prettier/CRLF e alguns imports. Esses avisos ja existiam e nao bloquearam deploy.

### Build backend local

Na pasta `fp-ticketz/backend`:

```powershell
npm.cmd run build
```

### Empacotar frontend

Na pasta `CHat FP INFORMATICA`:

```powershell
tar -czf .\ticketz-frontend-native-token.tar.gz -C .\fp-ticketz\frontend build
```

### Enviar frontend para o servidor

```powershell
& 'C:\Program Files\PuTTY\pscp.exe' -P 22 -batch -pw '<senha>' .\ticketz-frontend-native-token.tar.gz fp@10.11.11.4:/home/fp/ticketz-frontend-native-token.tar.gz
```

### Rodar deploy de frontend

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -P 22 -batch -pw '<senha>' fp@10.11.11.4 "chmod +x /home/fp/deploy-frontend-correct-root.sh && /home/fp/deploy-frontend-correct-root.sh"
```

### Validar producao

```powershell
Invoke-WebRequest -Uri 'https://chat.fpinformatica.com.br/backend/' -UseBasicParsing
Invoke-WebRequest -Uri 'https://chat.fpinformatica.com.br/config.json' -UseBasicParsing
```

### Ver containers Ticketz

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -P 22 -batch -pw '<senha>' fp@10.11.11.4 "docker ps --filter name=ticketz --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
```

### Ver logs do backend

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -P 22 -batch -pw '<senha>' fp@10.11.11.4 "docker logs --tail=200 ticketz_backend"
```

### Ping simples ate voltar apos restart

```powershell
while ($true) {
  try {
    $r = Invoke-WebRequest -Uri 'https://chat.fpinformatica.com.br/backend/' -UseBasicParsing -TimeoutSec 5
    Write-Host "$(Get-Date -Format HH:mm:ss) backend OK $($r.StatusCode)"
    break
  } catch {
    Write-Host "$(Get-Date -Format HH:mm:ss) aguardando backend..."
    Start-Sleep -Seconds 3
  }
}
```

### Restart rapido do backend

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -P 22 -batch -pw '<senha>' fp@10.11.11.4 "docker restart ticketz_backend && docker logs --tail=80 ticketz_backend"
```

## Principais customizacoes feitas

## 1. Identidade Chat FP

### Versao exibida no menu/site

Arquivo:

```txt
frontend/src/layout/MainListItems.js
```

Mudanca:

- removida leitura de `/gitinfo.json` para exibir `v1.0.x / custom build`;
- substituido por texto fixo:

```txt
Chat FP v1.0.1 / FP Informatica
```

Objetivo:

- deixar a versao com identidade propria da FP;
- nao exibir branch/build generico do Ticketz.

### Downloads no menu do usuario

Arquivo:

```txt
frontend/src/layout/index.js
```

Adicionado no menu do usuario:

```txt
Baixar app Android
Baixar app Windows
```

Links publicados:

```txt
https://chat.fpinformatica.com.br/downloads/ChatFP-Android.apk
https://chat.fpinformatica.com.br/downloads/ChatFP-Setup.exe
```

## 2. App Android

Projeto:

```txt
C:\Users\DANIEL\Documents\CHat FP INFORMATICA\chatfp-android
```

APK publicado:

```txt
https://chat.fpinformatica.com.br/downloads/ChatFP-Android.apk
```

Ultimo APK local relevante:

```txt
chatfp-android\ChatFP-logo-fp-v5-debug.apk
```

Funcionalidades:

- abre o Ticketz/Chat FP;
- usa logo da FP no app;
- notificacoes nativas via Firebase;
- suporte a notificacao mesmo com app em segundo plano;
- reconhece usuario logado pelo backend/web app;
- melhor comportamento no celular do que o navegador, especialmente em notificacoes.

Firebase:

- foi criado projeto Firebase;
- adicionado `google-services.json` no Android;
- usado service account do Firebase Admin no backend para envio de push.

Nao registrar neste README:

- chave privada do service account;
- JSON completo do Firebase Admin;
- tokens.

## 3. App Windows

Projeto:

```txt
C:\Users\DANIEL\Documents\CHat FP INFORMATICA\chatfp-windows
```

Tecnologia:

```txt
Electron
Squirrel/electron-winstaller
```

Installer gerado:

```txt
chatfp-windows\dist\squirrel\ChatFP-Setup.exe
```

Installer publicado:

```txt
https://chat.fpinformatica.com.br/downloads/ChatFP-Setup.exe
```

Principais arquivos:

```txt
chatfp-windows\src\main.js
chatfp-windows\src\preload.js
chatfp-windows\package.json
chatfp-windows\assets\icon.ico
chatfp-windows\assets\icon.png
```

Funcionalidades:

- abre `https://chat.fpinformatica.com.br`;
- remove menu padrao do Electron com `Menu.setApplicationMenu(null)`;
- tem icone FP;
- permite notificacoes do navegador/app;
- tray/configuracoes basicas;
- versao `1.0.1`.

Observacao:

- `electron-builder` teve problema com symlink/`winCodeSign` no Windows.
- Workaround usado: `electron-winstaller`.
- Foi necessario copiar `LICENSE` para `dist\win-unpacked\LICENSE` antes de gerar o instalador.

## 4. Notificacoes

Foram feitos ajustes em notificacoes do navegador, app Windows e Android.

### Android

Implementado envio nativo via Firebase.

Principais arquivos envolvidos:

```txt
backend/src/services/PushNotificationServices/
backend/src/controllers/PushTokenController.ts
backend/src/routes/pushTokenRoutes.ts
backend/src/models/UserPushToken.ts
backend/src/database/migrations/20260529100000-create-user-push-tokens.ts
frontend/src/helpers/nativePushNotifications.js
```

Fluxo:

1. app Android registra token Firebase;
2. frontend/backend salvam token por usuario;
3. backend envia push para usuario atribuido, usuarios da fila e participantes conforme regra;
4. notificacao abre o ticket.

### Browser/App Windows

Foram ajustados:

- notificacoes de mensagens;
- notificacoes para participantes/apoio;
- notificacoes mais confiaveis no app Windows.

Arquivos relevantes:

```txt
frontend/src/components/NotificationsPopOver/index.js
frontend/src/helpers/browserNotifications.js
frontend/public/ticketz-notifications-sw.js
frontend/public/notificame-gateway.js
```

## 5. Participantes/Apoio no ticket

Objetivo:

- permitir adicionar usuarios como apoio/participantes em um ticket sem transferir o atendimento;
- participante pode visualizar e, se autorizado, enviar mensagens;
- participante deve receber notificacao;
- ticket deve aparecer na lista do participante.

Backend:

```txt
backend/src/models/TicketParticipant.ts
backend/src/database/migrations/20260521113000-create-ticket-participants.ts
backend/src/controllers/TicketParticipantController.ts
backend/src/routes/ticketParticipantRoutes.ts
backend/src/libs/socket.ts
backend/src/controllers/MessageController.ts
backend/src/services/TicketServices/ListTicketsService.ts
backend/src/services/TicketServices/ListTicketsServiceKanban.ts
backend/src/services/TicketServices/ShowTicketService.ts
backend/src/services/TicketServices/ShowTicketFromUUIDService.ts
```

Frontend:

```txt
frontend/src/components/TicketParticipantsModal/
frontend/src/components/TicketOptionsMenu/index.js
frontend/src/components/TicketsList/index.js
frontend/src/components/TicketsListCustom/index.js
frontend/src/components/NotificationsPopOver/index.js
frontend/src/components/Ticket/index.js
frontend/src/helpers/userPermissions.js
```

Permissoes granulares relacionadas:

```txt
ticket-participants:view
ticket-participants:manage
ticket-participants:sendMessage
```

Correcao importante:

- a lista normal ja aceitava tickets onde o usuario era participante;
- depois foi corrigida tambem a lista customizada (`TicketsListCustom`), pois ela ainda bloqueava por fila/usuario e o ticket nao aparecia para o participante no app Windows.

## 6. Permissoes granulares

Foi adicionada base para permissao granular por usuario.

Arquivos relevantes:

```txt
backend/src/helpers/UserPermissions.ts
backend/src/middleware/hasPermission.ts
backend/src/database/migrations/20260521103000-add-permissions-to-users.ts
frontend/src/helpers/userPermissions.js
frontend/src/components/UserModal/index.js
frontend/src/components/Can/index.js
```

Permissoes citadas/usadas:

```txt
ticket-participants:view
ticket-participants:manage
ticket-participants:sendMessage
tickets-manager:showall
tickets-manager:showQueueTickets
users:view
queues:view
drawer-admin-items:view
financeiro:view
```

Comportamento:

- admin e super passam automaticamente em `hasPermission`;
- usuario comum precisa ter a chave da permissao em `permissions`.

## 7. Anotacao interna

Objetivo:

- permitir criar anotacao interna no chat;
- anotacao aparece como mensagem interna;
- nao envia para o cliente;
- IA/N8N pode usar como contexto;
- transferencia pode incluir anotacao/resumo interno.

Arquivos relevantes:

```txt
backend/src/services/TicketNoteService/CreateTicketNoteService.ts
backend/src/database/migrations/20260520152000-backfill-ticket-notes-as-internal-messages.ts
frontend/src/components/TicketNotes/
frontend/src/components/MessagesList/index.js
frontend/src/components/TransferTicketModalCustom/index.js
frontend/src/components/TicketOptionsMenu/index.js
```

Foi ajustado visualmente para a anotacao ficar como balao interno no chat.

## 8. N8N por fila

Objetivo:

- permitir que uma fila envie mensagens recebidas para um webhook N8N;
- usar N8N/IA como recepcionista;
- ao atendente aceitar o ticket, parar envio para N8N;
- manter chatbot interno desativado enquanto N8N esta ativo, mas sem apagar configuracoes do chatbot.

Arquivos relevantes:

```txt
backend/src/services/N8nServices/RunN8nWebhookService.ts
backend/src/services/WbotServices/wbotMessageListener.ts
backend/src/models/Queue.ts
backend/src/database/migrations/20260520143000-add-n8n-fields-to-queues.ts
frontend/src/components/QueueModal/index.js
```

Campos adicionados na fila:

```txt
n8nWebhookEnabled
n8nWebhookUrl
```

Webhook usado em teste:

```txt
https://n8n.fpinformatica.com.br/webhook/e93fe9f2-7915-487e-99cf-a421ac682039
```

Comportamento importante:

- se a fila esta com N8N ativo, o chatbot interno nao roda;
- ao aceitar atendimento por um agente, o N8N para de responder;
- chatbot interno deve ficar apenas desativado, nao apagado.

## 9. Zammad / abertura de chamado

Objetivo:

- permitir abrir chamado no Zammad a partir de um ticket do Ticketz;
- incluir link/id da conversa;
- enviar resumo para tecnico;
- opcional por empresa, usado principalmente pela FP.

Arquivos relevantes:

```txt
backend/src/services/ZammadServices/CreateZammadTicketService.ts
backend/src/controllers/IntegrationController.ts
backend/src/routes/integrationRoutes.ts
frontend/src/components/TicketOptionsMenu/index.js
```

Campos/configuracoes envolvidas:

- URL do Zammad;
- token de API;
- grupo;
- prioridade;
- opcao de incluir ultimas mensagens.

Observacoes:

- o grupo no Zammad precisa existir exatamente como configurado;
- erro observado: `No lookup value found for 'group': 'users'`;
- isso foi resolvido usando grupo valido no Zammad.

URL sugerida para Zammad:

```txt
https://helpdesk.fpinformatica.com.br
```

Evitar usar IP interno publicamente.

## 10. Meta / Instagram / Facebook

Foi criada estrutura inicial para canais Meta:

- Facebook Messenger;
- Instagram Direct.

Backend:

```txt
backend/src/services/MetaServices/
backend/src/controllers/MetaWebhookController.ts
backend/src/routes/metaWebhookRoutes.ts
backend/src/services/MetaServices/HandleMetaWebhookService.ts
backend/src/services/MetaServices/SendMetaMessageService.ts
```

Frontend:

```txt
frontend/src/components/WhatsAppModal/index.js
frontend/src/components/PlansManager/index.js
frontend/src/components/CompaniesManager/index.js
```

Planos:

```txt
facebookEnabled
instagramEnabled
```

Webhook publico Meta:

```txt
https://chat.fpinformatica.com.br/backend/meta/webhook
```

Cadastro no Ticketz:

```txt
Conexoes -> Adicionar conexao -> Canal -> Instagram Direct
Conexoes -> Adicionar conexao -> Canal -> Facebook Messenger
```

Campos:

```txt
Token de verificacao do webhook
Access token da Pagina/Instagram
ID da conta Instagram profissional / ID da Pagina Facebook
ID Instagram para envio via graph.instagram.com
```

Observacoes:

- para Instagram, ideal ter conta Instagram profissional vinculada a uma Pagina Facebook;
- Meta Developers exige app vinculado ao Gerenciador de Negocios;
- webhook deve usar o mesmo token de verificacao cadastrado no Ticketz;
- a API da Meta pode exigir permissoes e revisao antes de funcionar em producao.

Checklist pratico Meta:

1. Acessar o Meta Developers com a conta que administra a empresa FP.
2. Confirmar que o app esta vinculado ao Gerenciador de Negocios correto.
3. Adicionar o produto/caso de uso de Messenger e/ou Instagram.
4. Em Webhooks, cadastrar:

```txt
Callback URL: https://chat.fpinformatica.com.br/backend/meta/webhook
Verify token: o mesmo token cadastrado na conexao do Ticketz
```

5. Assinar eventos de mensagens da Pagina/Instagram.
6. Gerar token de acesso da Pagina/Instagram com permissoes corretas.
7. No Ticketz, criar conexao do canal desejado e preencher token/IDs.
8. Fazer teste recebendo mensagem real no Messenger/Instagram.

Pontos que costumam travar:

- Instagram precisa ser profissional/comercial;
- Instagram precisa estar vinculado a uma Pagina Facebook;
- token de teste costuma expirar;
- app em modo desenvolvimento so conversa com usuarios com funcao no app;
- em producao pode ser necessario solicitar permissoes e revisao da Meta.

## 11. Historico de mensagens por contato

Objetivo:

- permitir abrir historico de mensagens de um contato/numero;
- facilita buscar informacoes de tickets antigos;
- adicionado carregamento de mensagens anteriores.

Arquivos relevantes:

```txt
backend/src/services/MessageServices/ListContactMessagesService.ts
backend/src/routes/messageRoutes.ts
frontend/src/components/ContactMessageHistoryModal/
frontend/src/components/MessageOptionsMenu/index.js
frontend/src/components/MessagesList/index.js
```

## 12. Foto do perfil do cliente

Objetivo:

- ao clicar na foto do cliente, abrir imagem maior;
- manter boa qualidade da foto de perfil;
- evitar thumbnail pequena/ruim.

Arquivos envolvidos:

```txt
frontend/src/components/TicketInfo/index.js
backend/src/services/WbotServices/GetProfilePicUrl.ts
```

## 13. Imagem com legenda

Objetivo:

- permitir enviar imagem com texto/legenda no mesmo envio;
- evitar ter que mandar imagem e depois texto separado.

Arquivos relevantes:

```txt
frontend/src/components/MessageInputCustom/index.js
backend/src/controllers/MessageController.ts
backend/src/services/WbotServices/SendWhatsAppMedia.ts
```

## 14. Agendamento com fila

Objetivo:

- ao agendar mensagem, escolher uma fila;
- ao abrir/criar ticket por agendamento, ticket ja entra na fila escolhida.

Arquivos relevantes:

```txt
backend/src/models/Schedule.ts
backend/src/database/migrations/20260521162000-add-queueid-to-schedules.ts
backend/src/services/ScheduleServices/CreateService.ts
backend/src/services/ScheduleServices/UpdateService.ts
backend/src/services/ScheduleServices/ListService.ts
backend/src/services/ScheduleServices/ShowService.ts
frontend/src/components/ScheduleModal/index.js
frontend/src/pages/Schedules/index.js
```

## 15. Transferencias e permissoes

Foram feitos ajustes para usuarios comuns conseguirem:

- listar usuarios para transferencia;
- transferir tickets quando permitido;
- transferir para fila/usuario sem erro indevido;
- aceitar ticket em fila onde tem acesso.

Arquivos relevantes:

```txt
backend/src/controllers/UserController.ts
backend/src/services/UserServices/ListUsersService.ts
backend/src/services/TicketServices/UpdateTicketService.ts
frontend/src/components/TransferTicketModal/index.js
frontend/src/components/TransferTicketModalCustom/index.js
```

## 16. Dashboard administrativo

Foram adicionados/resumidos indicadores no dashboard principal:

- usuarios online;
- atendimentos aguardando;
- atendimentos abertos;
- conexoes ativas;
- empresas conectadas;
- cards de atendimento resolvido, novos contatos, tempo medio, etc.

Arquivos relevantes:

```txt
backend/src/controllers/DashboardController.ts
backend/src/services/ReportService/DashboardService.ts
frontend/src/pages/Dashboard/index.js
frontend/src/components/Dashboard/CardCounter.js
```

Foi feito ajuste visual para alinhar melhor os cards.

## 17. Limites de sessao/dispositivo

Foram adicionadas configuracoes/estrutura para controlar sessoes de usuario:

- detectar tipo de dispositivo;
- diferenciar computador e mobile;
- opcoes de login para manter sessoes, derrubar ultima sessao ou derrubar todas;
- registrar sessoes ativas para dashboard.

Arquivos relevantes:

```txt
backend/src/models/UserSocketSession.ts
backend/src/helpers/DetectDeviceType.ts
backend/src/database/migrations/20260524143000-add-device-info-to-user-socket-sessions.ts
backend/src/controllers/SessionController.ts
backend/src/services/UserServices/AuthUserService.ts
frontend/src/pages/Login/index.js
frontend/src/hooks/useAuth.js/index.js
```

## 18. ACK/status de mensagem enviada

Problema observado:

- mensagens enviadas ficavam com relogio;
- apos F5 apareciam como enviadas;
- banco ja tinha `ack=3`, mas tela nao atualizava em tempo real.

Backend:

```txt
backend/src/services/WbotServices/wbotMessageListener.ts
```

Mudanca:

- update de ACK agora emite para:
  - sala do ticket;
  - status da empresa;
  - notificacoes;
  - fila;
  - usuario atribuido;
  - participantes.

Frontend:

```txt
frontend/src/components/MessagesList/index.js
```

Mudancas:

- `ack=0` renderiza relogio;
- `ack=1` renderiza check simples;
- quando mensagem propria ainda tem `ack < 3`, a tela consulta silenciosamente e atualiza somente o ACK, sem recarregar a lista inteira.

## 19. Ajustes visuais

Foram feitos ajustes em:

- hover/sombra do menu recolhido;
- botoes e visual mais moderno;
- cards do dashboard;
- anotacao interna no chat;
- foto de perfil;
- frontend de downloads;
- remocao de elementos de assinatura/apoio ao projeto do Ticketz quando desejado.

Arquivos visuais frequentes:

```txt
frontend/src/App.js
frontend/src/layout/index.js
frontend/src/layout/MainListItems.js
frontend/src/components/MessagesList/index.js
frontend/src/components/TicketListItemCustom/index.js
frontend/src/components/TicketsManager/index.js
frontend/src/components/TicketsManagerTabs/index.js
```

## 20. Kasm

Foi feita analise/restart no Kasm do servidor.

Problemas vistos:

- muitos processos zumbis no servidor;
- container `kasm_guac` reiniciando;
- necessidade de estabilizar para uso em producao.

Nao e parte direta do Ticketz, mas impacta o servidor.

## 21. Seguranca discutida

Pontos planejados/sugeridos:

- nao depender de URL obscura/hash como seguranca;
- remover informacao publica de versao/build no `/backend`;
- fechar CORS para dominio correto;
- aplicar rate limit em login/API/webhook;
- headers de seguranca no nginx/NPM;
- tokens fora do codigo;
- rotacionar tokens expostos em teste;
- limitar upload de arquivos perigosos;
- Postgres/Redis somente em rede interna;
- backups e teste de restore;
- log/alerta para backend fora do ar.

## 22. Backups

Deploys geram backups em:

```txt
/home/fp/ticketz-backups/
```

Exemplos:

```txt
frontend-correct-root-YYYYMMDD-HHMMSS
backend-ack-hotfix-YYYYMMDD-HHMMSS
full-update-YYYYMMDD-HHMMSS
```

Antes de qualquer deploy grande:

1. confirmar que o backup anterior existe;
2. se houver migracao, fazer backup do Postgres;
3. validar rollback possivel.

## 23. Banco de dados

Container:

```txt
ticketz_postgres
```

Banco/usuario observados:

```txt
DB_NAME=ticketz
DB_USER=ticketz
```

Exemplo de consulta via SSH:

```powershell
@'
select id, body, ack, "fromMe", "ticketId", "createdAt", "updatedAt"
from "Messages"
order by "createdAt" desc
limit 10;
'@ | & 'C:\Program Files\PuTTY\plink.exe' -P 22 -batch -pw '<senha>' fp@10.11.11.4 "docker exec -i ticketz_postgres psql -U ticketz -d ticketz"
```

### Backup manual do Postgres antes de deploy grande

Exemplo:

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -P 22 -batch -pw '<senha>' fp@10.11.11.4 "mkdir -p /home/fp/ticketz-backups/db && docker exec ticketz_postgres pg_dump -U ticketz -d ticketz > /home/fp/ticketz-backups/db/ticketz-$(date +%Y%m%d-%H%M%S).sql"
```

Depois de gerar, conferir tamanho do arquivo:

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -P 22 -batch -pw '<senha>' fp@10.11.11.4 "ls -lh /home/fp/ticketz-backups/db | tail"
```

## 24. Sequencia recomendada para continuar em outra maquina

1. Clonar/copiar projeto `fp-ticketz`.
2. Copiar tambem `chatfp-android`, `chatfp-windows` e scripts da pasta `CHat FP INFORMATICA`.
3. Instalar dependencias de frontend e backend.
4. Validar `npm.cmd run build` no backend.
5. Validar `npm.cmd run winBuild` no frontend.
6. Conferir scripts de deploy na pasta `CHat FP INFORMATICA`.
7. Nunca sobrescrever `config.json` de producao com config local.
8. Para frontend, sempre publicar em `/var/www/public`.
9. Para backend, publicar `dist` e reiniciar `ticketz_backend`.
10. Testar:
   - login;
   - envio/recebimento WhatsApp;
   - ACK sem F5;
   - participante/apoio;
   - notificacao app Windows;
   - notificacao Android;
   - N8N se fila estiver ativa;
   - Zammad se empresa tiver integracao ativa.

### Checklist antes de subir para producao

- confirmar que nao ha usuarios em atendimento critico;
- fazer backup do Postgres se houver migracao ou alteracao de backend;
- compilar backend e frontend localmente;
- conferir se `frontend/public/config.json` local nao foi empacotado para producao com localhost;
- enviar pacote certo para `/home/fp`;
- executar script correto;
- validar `/backend`;
- validar bundle/hash no HTML;
- abrir site em janela anonima ou app Windows;
- testar envio de uma mensagem real;
- testar notificacao quando possivel.

### Rollback basico

Frontend:

- localizar backup mais recente em `/home/fp/ticketz-backups/frontend-correct-root-*`;
- copiar backup de volta para `/var/www/public`;
- restaurar `/home/fp/ticketz-prod-config.json` como `/var/www/public/config.json`;
- recarregar nginx dentro do container frontend.

Backend:

- localizar backup de `dist` em `/home/fp/ticketz-backups/backend-*`;
- restaurar `dist` em `/usr/src/app/dist`;
- reiniciar `ticketz_backend`;
- validar `http://127.0.0.1:3000/` dentro do servidor.

## 25. Pendencias e proximos passos sugeridos

### Meta / Instagram

- finalizar app no Meta Developers;
- vincular Instagram profissional a Pagina Facebook;
- gerar token permanente/adequado;
- configurar webhook:

```txt
https://chat.fpinformatica.com.br/backend/meta/webhook
```

- cadastrar conexao no Ticketz;
- testar recebimento e resposta.

### Seguranca

- esconder/minimizar resposta publica de `/backend`;
- aplicar headers/rate limit;
- revisar CORS;
- revisar tokens expostos durante testes.

### App Windows

- melhorar mecanismo de atualizacao do instalador;
- talvez criar instalador MSI/NSIS se ambiente permitir;
- adicionar atualizacao automatica futuramente.

### iPhone

- avaliar app iOS;
- necessario Apple Developer, assinatura e estrategia de publicacao.

### Mobile/web

- melhorar fluidez da navegacao mobile;
- evitar reload completo ao entrar/sair de tickets;
- avaliar cache/local state mais forte.

### Monitoramento

- alerta backend fora do ar;
- alerta disco alto;
- alerta container reiniciando;
- monitor de fila/WhatsApp desconectado.

## 26. Arquivos que merecem cuidado especial

Backend:

```txt
backend/src/services/WbotServices/wbotMessageListener.ts
backend/src/libs/socket.ts
backend/src/controllers/MessageController.ts
backend/src/services/MessageServices/CreateMessageService.ts
backend/src/services/TicketServices/UpdateTicketService.ts
backend/src/services/TicketServices/ListTicketsService.ts
backend/src/controllers/TicketParticipantController.ts
backend/src/services/PushNotificationServices/
backend/src/services/N8nServices/
backend/src/services/ZammadServices/
backend/src/services/MetaServices/
```

Frontend:

```txt
frontend/src/components/MessagesList/index.js
frontend/src/components/MessageInputCustom/index.js
frontend/src/components/TicketsListCustom/index.js
frontend/src/components/NotificationsPopOver/index.js
frontend/src/components/TicketOptionsMenu/index.js
frontend/src/components/WhatsAppModal/index.js
frontend/src/layout/index.js
frontend/src/layout/MainListItems.js
```

Apps:

```txt
chatfp-android
chatfp-windows
```

## 27. Observacoes finais

- O projeto tem muitas alteracoes ainda nao organizadas em commits limpos.
- Evitar `git reset --hard` ou revert geral sem revisar.
- Existem arquivos de deploy/build antigos na raiz; nao apagar sem confirmar.
- O frontend pode gerar pacote grande porque inclui downloads em `frontend/public/downloads`.
- O upload do pacote de frontend pode passar de 200 MB; usar timeout maior no `pscp`.
- Sempre validar hash do bundle apos deploy.
- Sempre validar `/backend` apos deploy.
- Nunca colocar neste README senhas SSH, tokens Meta, token Zammad, Firebase service account ou conteudo de `firebase-service-account.json`.
- Se este arquivo for enviado para outra pessoa, revisar antes para garantir que continua sem segredos.
