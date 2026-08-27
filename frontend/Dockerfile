FROM node:20-alpine as build-deps

WORKDIR /usr/src/app
COPY . .

ENV NODE_OPTIONS --openssl-legacy-provider

RUN --mount=type=cache,target=/root/.npm \
    npm ci && npm run build

FROM ghcr.io/ticketz-oss/nginx-alpine

WORKDIR /usr/share/nginx/html

COPY --from=build-deps /usr/src/app/build /var/www/public
COPY --from=build-deps /usr/src/app/node_modules/@socket.io/admin-ui/ui/dist /var/www/public/socket-admin
COPY nginx /etc/nginx

CMD if [ "${FRONTEND_REQUIRE_HTTPS:-false}" = "true" ]; then \
        if [ "${BACKEND_PROTOCOL:-https}" != "https" ]; then \
            echo "BACKEND_PROTOCOL must be https when FRONTEND_REQUIRE_HTTPS=true" >&2; \
            exit 1; \
        fi; \
        case "${BACKEND_HOST:-}" in ""|"localhost"|"127.0.0.1") \
            echo "BACKEND_HOST must be a public hostname when FRONTEND_REQUIRE_HTTPS=true" >&2; \
            exit 1; \
        esac; \
    fi \
    && (echo "{" && while IFS='=' read -r name value; do \
        printf '\t"%s": "%s"\n' "$name" "$value"; \
    done < <(env) | sed '$!s/$/,/' && echo "}")  > /var/www/public/config.json \
    && if [ -n "$BACKEND_SERVICE" ]; then \
        BACKEND_IP=$(getent hosts $BACKEND_SERVICE | awk '{ print $1 }') \
        && echo "$BACKEND_IP backend" >> /etc/hosts; \
    fi \
    && nginx -g "daemon off;"
