# Atualizacoes por release

Cada commit em `main` publica imagens candidatas no GitHub Container Registry
(GHCR) com o SHA completo e a tag `candidate`. Ao criar uma tag `release-*`,
o mesmo nome da tag tambem e publicado como imagem imutavel.

O VIB continua sendo o ambiente de teste e tambem pode montar um arquivo de
release para contingencia. O GHCR e o caminho padrao para producao: a mesma
imagem aprovada no VIB e baixada sem compilar codigo no servidor de producao.

No servidor, execute uma vez como `root`:

```bash
./install-ghcr-updater.sh
```

Depois, para publicar uma versao aprovada:

```bash
sudo chat-update release-2026.09.02
```

O comando baixa somente backend e frontend, salva as referencias atuais para
rollback, recria somente esses dois containers e valida backend e frontend.
PostgreSQL, Redis, volumes e os demais servicos nao sao alterados.

Para testar uma imagem antes da release, pode ser usado o SHA completo do
commit. O atalho `candidate` deve ser usado somente em ambiente de teste.

## Acesso ao GHCR

Se os pacotes forem publicos, nenhum login adicional e necessario. Para
pacotes privados, autentique cada servidor uma unica vez com um token do GitHub
com permissao somente de leitura de pacotes:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u LAUKDAN5566 --password-stdin
```
