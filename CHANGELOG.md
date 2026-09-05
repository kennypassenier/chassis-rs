# Changelog

All notable changes to chassis-rs. Semantic versioning over two contracts
(SCOPE H3): the Rust API services call, and the shape of the files the
scaffold writes. A breaking change in either is a major and carries a
**Migration** section; `chassis release` refuses a major without one.

## [Unreleased]

### Added
- The kit: `core` (configuration with provenance, errors with a remedy,
  logging, request-id, `/healthz` with `version`, `/metrics`, guards,
  graceful shutdown with `Type=notify`), `dashboard` (token + session
  login, Clients with tokens and last requests, status page, kp-themes
  3.1.0), `passkeys` (WebAuthn behind a trusted TLS proxy),
  `self-update` (off / supervised / autonomous, minisign-verified,
  staged probe, link+rename swap, rollback), `notify` (per-event webhooks
  with retries and a fallback).
- The `chassis` command: `new`, `sync`, `release`, and the scaffold they
  render (CI and Release workflows, Dockerfile, golden systemd unit,
  homelab `service.yml`, hooks).
- `examples/inbox`, the example service, and `examples/minimal.rs`.
