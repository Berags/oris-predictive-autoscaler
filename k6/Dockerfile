FROM  golang:1.23-alpine AS builder

# Install git (required by xk6) and xk6
RUN apk --no-cache add git
RUN go install go.k6.io/xk6/cmd/xk6@v0.9.0

# Build k6 with the AMQP extension
RUN xk6 build --output /k6 --with github.com/grafana/xk6-amqp@latest

FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /k6 /usr/bin/k6

RUN mkdir -p /k6/lib
COPY lib/ /k6/lib/
COPY util/ /k6/util/
COPY rabbitmq-test.js /k6/rabbitmq-test.js

WORKDIR /k6
ENTRYPOINT ["k6"]
