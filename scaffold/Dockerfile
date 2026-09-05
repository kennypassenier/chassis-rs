# Two stages on the same Debian the LXCs run (T8): a glibc binary that
# also works copied out of the image. The runtime stage has no shell
# tools, so the container HEALTHCHECK uses the binary's own --healthcheck.
FROM rust:{{ toolchain }}-slim-trixie AS build
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN cargo build --release --locked

FROM debian:trixie-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates libssl3t64 && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /var/lib/{{ name }} --shell /usr/sbin/nologin {{ name }} \
    && mkdir -p /var/lib/{{ name }} && chown {{ name }}:{{ name }} /var/lib/{{ name }}
COPY --from=build /src/target/release/{{ name }} /usr/local/bin/{{ name }}
USER {{ name }}
ENV {{ prefix }}_LISTEN=0.0.0.0:8080 {{ prefix }}_STATE_DIR=/var/lib/{{ name }}
EXPOSE 8080
VOLUME ["/var/lib/{{ name }}"]
# Self-update is off inside an image by detection (AR8); updates are a new image.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["/usr/local/bin/{{ name }}", "--healthcheck"]
ENTRYPOINT ["/usr/local/bin/{{ name }}"]
