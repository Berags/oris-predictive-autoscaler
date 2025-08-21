#!/bin/bash

# Script per eseguire rabbitmq-test.js con k6 usando Docker
# Questo script crea una build custom di k6 con l'estensione xk6-amqp e la esegue

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directory dello script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parametri configurabili
RABBITMQ_HOST="${RABBITMQ_HOST:-localhost}"
RABBITMQ_USER="${RABBITMQ_USER:-admin}"
RABBITMQ_PASSWORD="${RABBITMQ_PASSWORD:-password}"
RABBITMQ_PORT="${RABBITMQ_PORT:-5672}"
TEST_DURATION="${TEST_DURATION:-60s}"

# Nome dell'immagine Docker personalizzata
K6_CUSTOM_IMAGE="k6-amqp:latest"

echo -e "${GREEN}=== K6 RabbitMQ Test Runner ===${NC}"
echo "Host: $RABBITMQ_HOST"
echo "User: $RABBITMQ_USER"
echo "Duration: $TEST_DURATION"
echo

# Funzione per costruire l'immagine k6 personalizzata
build_k6_image() {
    echo -e "${YELLOW}Costruzione dell'immagine k6 personalizzata con estensione AMQP...${NC}"
    
    # Crea un Dockerfile temporaneo per k6 con xk6-amqp
    cat > "$SCRIPT_DIR/Dockerfile.k6" << 'EOF'
FROM golang:1.24-alpine AS builder

# Installa git (necessario per xk6) e xk6
RUN apk --no-cache add git
RUN go install go.k6.io/xk6/cmd/xk6@latest

# Costruisce k6 con l'estensione AMQP
RUN xk6 build --output /k6 --with github.com/grafana/xk6-amqp@latest

FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /k6 /usr/bin/k6
ENTRYPOINT ["k6"]
EOF

    # Costruisce l'immagine
    docker build -f "$SCRIPT_DIR/Dockerfile.k6" -t "$K6_CUSTOM_IMAGE" "$SCRIPT_DIR"
    
    # Rimuove il Dockerfile temporaneo
    rm "$SCRIPT_DIR/Dockerfile.k6"
    
    echo -e "${GREEN}Immagine k6 personalizzata costruita con successo!${NC}"
}

# Funzione per verificare se l'immagine esiste
image_exists() {
    docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "$K6_CUSTOM_IMAGE"
}

# Funzione per eseguire il test
run_test() {
    echo -e "${YELLOW}Esecuzione del test RabbitMQ...${NC}"
    
    # Monta la directory corrente e esegue il test
    docker run --rm \
        --network host \
        -v "$SCRIPT_DIR:/scripts" \
        -e RABBITMQ_HOST="$RABBITMQ_HOST" \
        -e RABBITMQ_USER="$RABBITMQ_USER" \
        -e RABBITMQ_PASSWORD="$RABBITMQ_PASSWORD" \
        -e RABBITMQ_PORT="$RABBITMQ_PORT" \
        -e TEST_DURATION="$TEST_DURATION" \
        "$K6_CUSTOM_IMAGE" run /scripts/rabbitmq-test.js
}

# Parsing degli argomenti della riga di comando
while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            RABBITMQ_HOST="$2"
            shift 2
            ;;
        --user)
            RABBITMQ_USER="$2"
            shift 2
            ;;
        --password)
            RABBITMQ_PASSWORD="$2"
            shift 2
            ;;
        --port)
            RABBITMQ_PORT="$2"
            shift 2
            ;;
        --duration)
            TEST_DURATION="$2"
            shift 2
            ;;
        --rebuild)
            echo -e "${YELLOW}Forzata ricostruzione dell'immagine k6...${NC}"
            build_k6_image
            shift
            ;;
        --help)
            echo "Uso: $0 [opzioni]"
            echo
            echo "Opzioni:"
            echo "  --host HOST        Host RabbitMQ (default: rabbitmq-service)"
            echo "  --user USER        Username RabbitMQ (default: admin)"
            echo "  --password PASS    Password RabbitMQ (default: password)"
            echo "  --port PORT        Porta RabbitMQ (default: 5672)"
            echo "  --duration TIME    Durata del test (default: 60s)"
            echo "  --rebuild          Forza la ricostruzione dell'immagine k6"
            echo "  --help             Mostra questo aiuto"
            echo
            echo "Variabili d'ambiente:"
            echo "  RABBITMQ_HOST, RABBITMQ_USER, RABBITMQ_PASSWORD,"
            echo "  RABBITMQ_PORT, TEST_DURATION"
            echo
            echo "Esempi:"
            echo "  $0"
            echo "  $0 --host localhost --duration 30s"
            echo "  $0 --rebuild --host rabbitmq-service --duration 2m"
            exit 0
            ;;
        *)
            echo -e "${RED}Opzione sconosciuta: $1${NC}"
            echo "Usa --help per vedere le opzioni disponibili"
            exit 1
            ;;
    esac
done

# Verifica se Docker è disponibile
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Errore: Docker non è installato o non è nel PATH${NC}"
    exit 1
fi

# Verifica se l'immagine k6 personalizzata esiste, se no la costruisce
if ! image_exists; then
    echo -e "${YELLOW}L'immagine k6 personalizzata non esiste, costruzione in corso...${NC}"
    build_k6_image
else
    echo -e "${GREEN}L'immagine k6 personalizzata è già disponibile${NC}"
fi

# Esegue il test
run_test

echo -e "${GREEN}Test completato!${NC}"
