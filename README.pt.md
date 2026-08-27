[![en](https://img.shields.io/badge/lang-en-red.svg)](README.md)
[![pt-br](https://img.shields.io/badge/lang-pt--br-green.svg)](README.pt.md)

# Chat CRM

O Chat CRM e a distribuicao da FP Informatica e Correia Cloud para
atendimento omnichannel, CRM e automacao comercial. Ela inclui a marca do
produto, PWA, notificacoes, roteamento comercial, integracoes e fluxos
operacionais usados pela plataforma Chat CRM.

## Repositorio e versoes

O codigo-fonte e as imagens aprovadas sao publicados por este repositorio. As
imagens da aplicacao sao construidas pelo GitHub Actions e publicadas no GitHub
Container Registry (GHCR). A producao deve consumir uma imagem testada; ela nao
deve compilar o codigo da aplicacao diretamente no servidor em uso.

## Desenvolvimento local

Requisitos: Docker Compose e Git.

```bash
git clone https://github.com/Laukdan5566/Chat.git chat-crm
cd chat-crm
```

Crie os arquivos privados do ambiente antes de iniciar a pilha. Eles nao sao
versionados de proposito:

```text
.env-backend-local
.env-frontend-local
```

Para iniciar localmente:

```bash
docker compose -f docker-compose-local.yaml up -d --build
```

Para acompanhar os logs:

```bash
docker compose -f docker-compose-local.yaml logs -f backend frontend
```

Para encerrar a pilha local:

```bash
docker compose -f docker-compose-local.yaml down
```

## Fluxo de publicacao

1. Desenvolva e valide a alteracao localmente.
2. Envie o commit aprovado para a branch `main`.
3. Aguarde a conclusao do workflow **Publish Chat CRM images** no GitHub
   Actions.
4. Publique o SHA gerado no VIB e faca os testes funcionais nele.
5. Promova exatamente o mesmo SHA para producao somente apos a aprovacao no
   VIB.

Frontend e backend usam o mesmo SHA do Git. Isso torna cada versao rastreavel e
mantem um rollback com referencias conhecidas de imagem.

## Publicacao no VIB ou na producao

Instale uma vez o auxiliar de release e o override do Compose no servidor de
destino:

```bash
mkdir -p "$HOME/chat-crm-release"
cp ops/release/docker-compose.ghcr.yml "$HOME/chat-crm-release/"
cp ops/release/apply-ghcr-release.sh "$HOME/chat-crm-release/"
chmod +x "$HOME/chat-crm-release/apply-ghcr-release.sh"
```

Depois de as imagens GHCR estarem disponiveis, publique um SHA aprovado:

```bash
"$HOME/chat-crm-release/apply-ghcr-release.sh" <git-sha>
```

O auxiliar registra as imagens atuais de frontend e backend antes da troca,
baixa somente as duas imagens da aplicacao e recria somente esses dois
containers. PostgreSQL, Redis, volumes e a configuracao do Compose permanecem
intactos.

Antes de promover uma imagem para a producao, valide a interface publica,
`/backend/`, Socket.IO, conexoes WhatsApp e o fluxo funcional afetado.

## Rollback

O auxiliar cria um arquivo como
`$HOME/chat-crm-release/rollback-AAAAMMDD-HHMMSS.env`. Para restaurar a versao,
carregue as referencias de imagem salvas e recrie apenas frontend e backend com
os mesmos arquivos Compose:

```bash
set -a
source "$HOME/chat-crm-release/rollback-AAAAMMDD-HHMMSS.env"
set +a

# Informe uma vez os caminhos privados do Compose no servidor de destino.
export BASE_COMPOSE=/caminho/para/docker-compose.yml
export LOCAL_OVERRIDE=/caminho/para/docker-compose.override.yml

docker compose \
  -f "$BASE_COMPOSE" \
  -f "$LOCAL_OVERRIDE" \
  -f "$HOME/chat-crm-release/docker-compose.ghcr.yml" \
  pull backend frontend

docker compose \
  -f "$BASE_COMPOSE" \
  -f "$LOCAL_OVERRIDE" \
  -f "$HOME/chat-crm-release/docker-compose.ghcr.yml" \
  up -d --no-build --force-recreate --no-deps backend frontend
```

## Seguranca e operacao

- Nunca versione credenciais, chaves privadas, certificados, APKs ou arquivos
  de ambiente de producao.
- Limite mudancas na producao a imagens aprovadas da aplicacao.
- Preserve banco, Redis, volumes, midias e artefatos de rollback.
- Use o mesmo SHA validado no VIB e na producao.

## Origem, autoria e licenca

O Chat CRM e uma distribuicao derivada do projeto open source Ticketz. Os
creditos originais, avisos de copyright e obrigacoes da AGPL-3.0 permanecem
preservados neste repositorio, incluindo [LICENSE.md](LICENSE.md). As mudancas
especificas do Chat CRM sao mantidas pela equipe Chat CRM.

### Autoria original

Este projeto foi iniciado em [um projeto Open Source](https://github.com/canove/whaticket-community), publicado pelo desenvolvedor [Cassio Santos](https://github.com/canove) sob a licenca permissiva MIT. Depois recebeu diversas melhorias por autores nao identificados e foi comercializado diretamente entre desenvolvedores e usuarios com fornecimento de codigo-fonte. De acordo com informacoes [deste video, acabou em algum momento sendo vazado e publicado abertamente](https://www.youtube.com/watch?v=SX_cGD5RLkQ).

Depois de algumas pesquisas, foi identificado que a primeira versao SaaS do Whaticket foi criada pelo desenvolvedor [Wender Teixeira](https://github.com/w3nder), incluindo uma versao do [Whaticket Single](https://github.com/unkbot/whaticket-free) que usa a biblioteca Baileys para acesso ao WhatsApp.

E praticamente impossivel identificar e creditar todos os autores das
melhorias. O codigo publicado nao identifica uma licenca de forma consistente;
a atribuicao MIT original e os termos aplicaveis da AGPL-3.0 estao preservados
nesta distribuicao.

### Aviso de relicenciamento

O projeto e distribuido sob a AGPL-3.0. Quem operar uma versao modificada como
servico em rede deve manter uma forma acessivel de seus usuarios obterem o
codigo-fonte correspondente, conforme exigido pela licenca. Ao modificar esta
distribuicao, atualize tambem a referencia para o codigo-fonte.

## Aviso

O Chat CRM nao e afiliado a Meta, WhatsApp ou suas empresas. O uso das
integracoes com WhatsApp e responsabilidade de cada empresa que implanta a
plataforma e deve respeitar as politicas aplicaveis.
