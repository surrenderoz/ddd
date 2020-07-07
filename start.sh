#!/usr/bin/env bash

if ! [[ -x "$(command -v docker-compose)" ]]; then
  echo 'Error: docker-compose is not installed.' >&2
  exit 1
fi

data_path="./certbot/etc-dir"
rsa_key_size=4096

# Read saved from file
if [[ -f .env.start ]]; then
    # Load Environment Variables
    export $(cat .env.start | grep -v '#' | awk '/=/ {print $1}')
fi

## Compose live, saved and read values

# domain
if [[ -z "$DOMAIN" ]]; then
  if [[ -z "$SAVED_DOMAIN" ]]; then
    read -p "Enter domain (e.g. 'example.org', 'subdomain.example.org': " decision
    LIVE_DOMAIN="$decision";
  else
    LIVE_DOMAIN="$SAVED_DOMAIN";
  fi
else
  LIVE_DOMAIN="$DOMAIN";
fi

# email
if [[ -z "$EMAIL" ]]; then
  if [[ -z "$SAVED_EMAIL" ]]; then
    read -p "Enter domain owner/admin email (for LetsEncrypt certificate obtain): " decision
    LIVE_EMAIL="$decision";
  else
    LIVE_EMAIL="$SAVED_EMAIL";
  fi
else
  LIVE_EMAIL="$EMAIL";
fi

# Share email with eff
if [[ -z "$SHARE_EMAIL" ]]; then
  if [[ -z "$SAVED_SHARE_EMAIL" ]]; then
    read -p "Share your email with EFF (Electronic Frontier Foundation, a founding partner of the Let's Encrypt project and the non-profit organization that develops Certbot)? (y/N) " decision
    if [[ "$decision" != "Y" ]] && [[ "$decision" != "y" ]]; then
      LIVE_SHARE_EMAIL=0;
    else
      LIVE_SHARE_EMAIL=1;
    fi
  else
    LIVE_SHARE_EMAIL="$SAVED_SHARE_EMAIL";
  fi
else
  LIVE_SHARE_EMAIL="$SHARE_EMAIL";
fi

# staging
if [[ -z "$STAGING" ]]; then
  if [[ -z "$SAVED_STAGING" ]]; then
    read -p "Is it STAGING environment (will create TEST certificates for $LIVE_DOMAIN) (y/N) " decision
    if [[ "$decision" != "Y" ]] && [[ "$decision" != "y" ]]; then
      LIVE_STAGING=0;
    else
      LIVE_STAGING=1;
    fi
  else
    LIVE_STAGING="$SAVED_STAGING";
  fi
else
  LIVE_STAGING="$STAGING";
fi

# Recreate certificate when it already exists
if [[ -z "$FORCE_RECREATE_CERT" ]]; then
  if [[ -z "$SAVED_FORCE_RECREATE_CERT" ]]; then
    read -p "Recreate and replace existing certificate on start in the future? (y/N) " decision
    if [[ "$decision" != "Y" ]] && [[ "$decision" != "y" ]]; then
      LIVE_FORCE_RECREATE_CERT=0;
    else
      LIVE_FORCE_RECREATE_CERT=1;
    fi
  else
    LIVE_FORCE_RECREATE_CERT="$SAVED_FORCE_RECREATE_CERT";
  fi
else
  LIVE_FORCE_RECREATE_CERT="$FORCE_RECREATE_CERT";
fi

# Process templated configs
shopt -s dotglob

for filename in ./janus-conf/*.template; do
  sed "s/{{ DOMAIN }}/$LIVE_DOMAIN/" ${filename} > "${filename%.*}"
done
for filename in ./nginx-conf/*.template; do
  sed "s/{{ DOMAIN }}/$LIVE_DOMAIN/" ${filename} > "${filename%.*}"
done
for filename in ./rtp-source/*.template; do
  sed "s/{{ DOMAIN }}/$LIVE_DOMAIN/" ${filename} > "${filename%.*}"
done

# Decide to obtain cert or not
if [[ -d "$data_path/live/$LIVE_DOMAIN" ]]; then
  NEED_TO_OBTAIN_CERT=${LIVE_FORCE_RECREATE_CERT}
else
  NEED_TO_OBTAIN_CERT=1
fi

if [[ ${NEED_TO_OBTAIN_CERT} != "0" ]]; then
  echo "### Creating dummy certificate for $LIVE_DOMAIN ..."
  path="/etc/letsencrypt/live/$LIVE_DOMAIN"
  mkdir -p "$data_path/live/$LIVE_DOMAIN"
  docker-compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:1024 -days 1\
      -keyout '$path/privkey.pem' \
      -out '$path/fullchain.pem' \
      -subj '/CN=localhost'" certbot
  echo

  echo "### Starting nginx ..."
  docker-compose up --force-recreate -d nginx
  echo

  echo "### Deleting dummy certificate for $LIVE_DOMAIN ..."
  docker-compose run --rm --entrypoint "\
    rm -Rf /etc/letsencrypt/live/$LIVE_DOMAIN && \
    rm -Rf /etc/letsencrypt/archive/$LIVE_DOMAIN && \
    rm -Rf /etc/letsencrypt/renewal/$LIVE_DOMAIN.conf" certbot
  echo

  echo "### Requesting Let's Encrypt certificate for $LIVE_DOMAIN ..."
  # Join $domains to -d args
  domain_args="-d $LIVE_DOMAIN"

  # Select appropriate email arg
  case "$LIVE_EMAIL" in
    "") email_arg="--register-unsafely-without-email" ;;
    *) email_arg="--email $LIVE_EMAIL" ;;
  esac

  # Enable staging mode if needed
  if [[ ${LIVE_STAGING} != "0" ]]; then staging_arg="--staging"; fi

  # Sharing email with EFF
  case "$LIVE_SHARE_EMAIL" in
    "1") eff_arg="--eff-email" ;;
    "0") eff_arg="--no-eff-email" ;;
  esac

  docker-compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
      $staging_arg \
      $email_arg \
      $eff_arg
      $domain_args \
      --rsa-key-size $rsa_key_size \
      --agree-tos \
      --force-renewal" certbot
  echo

  echo "### Reloading nginx ..."
  docker-compose exec nginx nginx -s reload
fi

# Start services
echo "### Starting services ..."
docker-compose up --detach

# Save configuration
echo "### Update startup configuration ..."
cat <<EOF > .env.start
SAVED_DOMAIN=$LIVE_DOMAIN
SAVED_EMAIL=$LIVE_EMAIL
SAVED_STAGING=$LIVE_STAGING
SAVED_SHARE_EMAIL=$LIVE_SHARE_EMAIL
SAVED_FORCE_RECREATE_CERT=$LIVE_FORCE_RECREATE_CERT
EOF
