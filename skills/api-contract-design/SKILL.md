---
name: api-contract-design
description: >-
  Design or evolve HTTP, RPC, or event contracts with a focus on backward
  compatibility, idempotency, standardized errors, and explicit limits.
---

# API Contract Design

Assume the requester is a software engineer: focus on contract semantics, safe evolution, and failure modes, without generic REST/RPC theory.

1. **Identify consumers and compatibility:** map internal/external clients, the current version, and whether the change is additive or breaking.
2. **Define the contract surface:**
   - Operations/endpoints or topics/events with names consistent with the local standard.
   - Input and output schemas with types, required fields, defaults, formats (ISO-8601, UUID, currency/precision), and size limits.
   - Pagination (cursor vs offset), filters, and deterministic ordering when returning collections.
3. **Settle operational semantics:**
   - **Errors:** standardized format, stable codes, and a clear distinction between client errors, conflicts, and transient failures.
   - **Idempotency and retry:** idempotency keys, retry semantics, and behavior under concurrency.
   - **Auth, rate limit, and observability:** scopes/permissions, limits, and correlation/request ID.
4. **Document concrete examples:** at least 1 success payload and 1 representative error payload.
5. **For breaking changes:** specify a versioning strategy or compatible transition (use `migration` and `create-adr` when applicable).
