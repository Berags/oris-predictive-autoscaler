FROM golang:1.24-alpine AS builder

# Install git (required by xk6) and xk6
RUN apk --no-cache add git
RUN go install go.k6.io/xk6/cmd/xk6@latest

# Build k6 with the AMQP extension
RUN xk6 build --output /k6 --with github.com/grafana/xk6-amqp@latest

FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /k6 /usr/bin/k6
ENTRYPOINT ["k6"]
