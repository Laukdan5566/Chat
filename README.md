# Chat CRM

Chat CRM is the FP Informatica and Correia Cloud distribution for omnichannel
service, CRM and commercial automation. It includes the product brand, PWA,
notifications, commercial routing, integrations and operational flows used by
the Chat CRM platform.

[![en](https://img.shields.io/badge/lang-en-green.svg)](README.md)
[![pt-br](https://img.shields.io/badge/lang-pt--br-red.svg)](README.pt.md)

## Repository and releases

Source code and approved release images are published from this repository.
Application images are built by GitHub Actions and published to GitHub
Container Registry (GHCR). Production must consume a tested image tag; it must
not build application code directly on the live server.

## Local development

Requirements: Docker Compose and Git.

```bash
git clone https://github.com/Laukdan5566/Chat.git chat-crm
cd chat-crm
```

Create the private environment files for the target environment before
starting the stack. They are deliberately not versioned:

```text
.env-backend-local
.env-frontend-local
```

Start a local stack:

```bash
docker compose -f docker-compose-local.yaml up -d --build
```

Follow service logs when needed:

```bash
docker compose -f docker-compose-local.yaml logs -f backend frontend
```

Stop the local stack:

```bash
docker compose -f docker-compose-local.yaml down
```

## Release flow

1. Implement and validate the change locally.
2. Push the approved commit to `main`.
3. Wait for the GitHub Actions workflow **Publish Chat CRM images** to finish.
4. Deploy the resulting Git SHA to VIB and run the functional checks there.
5. Promote that exact SHA to production only after VIB approval.

The frontend and backend use the same Git SHA. This makes every deployment
traceable and gives rollback a known image reference.

## VIB or production deployment

Install the release helper and compose override once on the target server:

```bash
mkdir -p "$HOME/chat-crm-release"
cp ops/release/docker-compose.ghcr.yml "$HOME/chat-crm-release/"
cp ops/release/apply-ghcr-release.sh "$HOME/chat-crm-release/"
chmod +x "$HOME/chat-crm-release/apply-ghcr-release.sh"
```

After the GHCR images are available, deploy an approved SHA:

```bash
"$HOME/chat-crm-release/apply-ghcr-release.sh" <git-sha>
```

The helper records the active frontend and backend images before replacing
them, pulls only the two application images, and recreates only those two
containers. PostgreSQL, Redis, volumes and compose configuration are left
untouched.

Validate the public interface, `/backend/`, Socket.IO, WhatsApp connections
and the affected user journey before promoting an image to production.

## Rollback

The deploy helper writes a file such as
`$HOME/chat-crm-release/rollback-YYYYMMDD-HHMMSS.env`. To restore it, load the
saved image references and recreate only frontend and backend with the same
compose files used by the helper:

```bash
set -a
source "$HOME/chat-crm-release/rollback-YYYYMMDD-HHMMSS.env"
set +a

# Set these once for the target server's private Compose configuration.
export BASE_COMPOSE=/path/to/docker-compose.yml
export LOCAL_OVERRIDE=/path/to/docker-compose.override.yml

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

## Security and operations

- Never commit credentials, private keys, certificates, mobile artifacts or
  production environment files.
- Keep production changes limited to approved application images.
- Keep database, Redis, volumes, media and rollback artifacts intact.
- Use the same tested SHA in VIB and production.

## Origin, authorship and license

Chat CRM is a derivative distribution of the open-source Ticketz project.
Original credits, copyright notices and AGPL-3.0 obligations are preserved in
this repository, including [LICENSE.md](LICENSE.md). Chat CRM-specific changes
are maintained by the Chat CRM team.

### Original authorship

This project was initiated in [an Open Source project](https://github.com/canove/whaticket-community), published by the developer [Cassio Santos](https://github.com/canove) under the permissive MIT license. It later received various improvements by unidentified authors and was commercially distributed directly between developers and users with the provision of source code. According to information from [this video, it was leaked and publicly released at some point](https://www.youtube.com/watch?v=SX_cGD5RLkQ).

After some research, it was further identified that the first SaaS version of Whaticket was created by the developer [Wender Teixeira](https://github.com/w3nder), including a version of [Whaticket Single](https://github.com/unkbot/whaticket-free) that uses the Baileys library for WhatsApp access.

It is practically impossible to identify and credit the authors of all improvements. The published code does not consistently identify a license; the original MIT attribution and the applicable AGPL-3.0 terms are retained here.

### Relicensing notice

The project is distributed under the AGPL-3.0. Anyone using a modified network
service must retain an accessible way for users to obtain the corresponding
source code, as required by that license. If this distribution is changed,
update the source-code reference accordingly.

## Notice

Chat CRM is not affiliated with Meta, WhatsApp or their respective companies.
Use of WhatsApp integrations is the responsibility of each deploying company
and must comply with the relevant platform policies.
