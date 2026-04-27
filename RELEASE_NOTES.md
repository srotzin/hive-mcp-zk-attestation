# v0.1.0 — hive-mcp-zk-attestation (RFC-stage)

Initial scaffold of the verifiable-agent-state-attestation MCP shim. RFC-stage: tool surface and circuit catalog are stable; backend endpoints publish when the v0.1 spec is finalized.

## Scope

Five MCP tools exposing standard zero-knowledge primitives (Groth16, Plonk) over the MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0 surface.

| Tool                     | Cost                | Status                |
|--------------------------|---------------------|-----------------------|
| `zk_attest_agent_state`  | $0.05 USDC on Base  | 503 backend pending   |
| `zk_verify_proof`        | Free                | 503 backend pending   |
| `zk_anchor_to_base`      | $0.02 USDC + L1 gas | 503 backend pending   |
| `zk_list_circuits`       | Free                | 503 backend pending (stable catalog returned inline) |
| `zk_query_attestation`   | Free                | 503 backend pending   |

## What this is

A commercial dual-use cryptographic primitive for the autonomous agent economy. Any agent that needs to prove a fact about its internal state without revealing the state can use this shim.

## What this is NOT

Stated explicitly so there is no ambiguity:

- **Attestation-only — not an asset bridge.** No value, no token, no wrapped asset crosses any chain. The shim emits proofs and commitments, not balances. Aleo (or any other verifier) verifies; Base settles. Nothing flows between them.
- **Not a custody layer.** The shim never holds keys, balances, or signing authority on behalf of the caller.
- **Not a regulated activity.** Emitting a hash commitment to a public chain is not money transmission, securities issuance, or a regulated payment service.
- **Not a partner integration with Aleo.** Aleo snarkVM is one of several ecosystem-neutral verifiers whose verification key format is supported. No co-branding, no joint product, no shared roadmap.
- **Not a vertical-specific product.** Commercial dual-use. Standard zk primitives only (Groth16, Plonk, Aleo snarkVM-compatible, Risc0-compatible).

## Settlement

Real Base USDC. Recipient (canonical Hive treasury, EVM): `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e`. Payment is collected via x402 PaymentRequired (HTTP 402) on the paid tools when the backend is live.

## Backend status

`https://hivemorph.onrender.com/v1/zk/*` is RFC-stage. Until it ships, every paid tool returns:

```json
{
  "error": "backend_pending",
  "retry_after": 86400,
  "message": "zk attestation rails are RFC-stage. Backend endpoints publish when the spec is finalized. Tool surface, costs, and circuit list are stable."
}
```

`zk_list_circuits` returns the stable circuit catalog inline so calling agents can integrate against the verification-key targets today.

## Compatibility targets

Verification keys are emittable to ecosystem-neutral verifiers. No co-branding. No partnership claim.

- Aleo snarkVM (BLS12-377)
- RISC Zero zkVM (BabyBear)
- Plonky2 (Goldilocks) — roadmap for v0.2

## Versioning

`v0.1.0` signals RFC-stage spec, not yet rails-live. The MCP shim, tool surface, costs, and circuit catalog are stable. The backend cuts to `v0.2.0` when the prover and anchor endpoints publish.

## License

MIT.

## Brand

Hive Civilization gold `#C08D23`.
