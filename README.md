# hive-mcp-zk-attestation

Verifiable agent state attestations for the autonomous agent economy. RFC-stage v0.1.0.

A Model Context Protocol shim that lets any autonomous agent emit a zero-knowledge proof of its internal state hash and DID, anchor a commitment to Base, and expose verification keys that are portable to ecosystem-neutral zk verifiers (Aleo snarkVM, Risc0, Plonky2). Attestation-only. No asset bridging. No custody. No wrapped value.

Brand colour: Hive Civilization gold `#C08D23`.

## What this is

An attestation primitive for autonomous agents. The shim exposes five MCP tools that together let one agent prove to another agent — or to a regulator, counterparty, or auditor — that:

1. The first agent was in a specific internal state, identified by a 32-byte hash.
2. The state was held by a specific DID.
3. A commitment to that proof has been anchored to Base at a known block.
4. The verification key is reproducible on any compatible zk-VM.

The agent never reveals its state. The verifier never learns more than the boolean result and the public inputs. The audit trail is anchored on a public chain. The verification key is portable.

## Why it exists

Autonomous agents transact, hold state, and make decisions on behalf of users. Existing agent-to-agent protocols — MCP, A2A, ACP — assume the agent is willing to publish what it knows. That assumption breaks the moment two agents need to negotiate without leaking inventory, model weights, prompt history, or counterparty positions.

Zero-knowledge proofs are the standard cryptographic answer. The plumbing has not been wired into the MCP / A2A surface that agent runtimes already speak. This shim is that wiring.

## Architecture

```
┌─────────────┐    state hash + DID     ┌───────────────────┐
│ Agent (any) │ ─────────────────────▶  │  zk_attest        │
└─────────────┘                         │  (Groth16 / Plonk)│
                                        └─────────┬─────────┘
                                                  │ proof
                                                  ▼
                                        ┌───────────────────┐
                                        │  zk_anchor_to_base│
                                        │  commitment → L2  │
                                        └─────────┬─────────┘
                                                  │ tx_hash
                                                  ▼
                                        ┌───────────────────┐
                                        │  Base L2          │
                                        │  (public anchor)  │
                                        └─────────┬─────────┘
                                                  │
              verification key publishable to     │
              ecosystem-neutral verifiers         │
                                                  ▼
            ┌──────────────────┬───────────────┬──────────────┐
            │  Aleo snarkVM    │   Risc0 zkVM  │   Plonky2    │
            │  (interop only)  │   (interop)   │   (interop)  │
            └──────────────────┴───────────────┴──────────────┘
```

Hive emits the proof. Base anchors the commitment. Any verifier — including an Aleo snarkVM instance — can independently check the proof against the published verification key. The shim is the MCP-shaped front door; the cryptography itself is standard.

## What this is NOT

Stated explicitly so there is no ambiguity:

- **Not a bridge.** No value, no token, no wrapped asset crosses any chain. The shim emits proofs and commitments, not balances.
- **Not a custody layer.** The shim never holds keys for any chain on behalf of the caller. It does not hold user funds, token balances, or signing authority.
- **Not a regulated activity.** Emitting a hash commitment to a public chain is not money transmission, securities issuance, or a regulated payment service.
- **Not a partner integration.** Aleo snarkVM, Risc0, and Plonky2 are interoperability targets — public open-source verifiers. There is no co-branding, no joint product, no shared roadmap.
- **Not a product for any specific industry vertical.** The primitive is commercial dual-use: any autonomous agent that needs verifiable private state can use it.

## Threat model

The shim is designed against three concrete threats:

1. **Agent state confidentiality.** An agent must be able to prove a fact about its state without revealing the state. Standard zk-SNARK construction; the shim simply exposes it through the MCP surface.
2. **Counterparty proof-of-honesty.** When two agents negotiate, each can demand a proof that the other is in a state consistent with the negotiation, without either side opening its book.
3. **Audit trail without exposure.** Compliance-conscious operators can publish proof commitments to Base while keeping the underlying state private. The audit trail is verifiable; the data is not exposed.

The shim does not defend against: a compromised agent forging its own state hash before proving it (garbage in, valid proof of garbage out), or a verifier choosing to trust an unrelated verification key. Both are upstream of this primitive.

## Interoperability

| Verifier         | Status                | Notes                                                                |
|------------------|-----------------------|----------------------------------------------------------------------|
| Aleo snarkVM     | Verification-key target | Verification keys are emittable in BLS12-377 format. Ecosystem-neutral; no co-branding. |
| Risc0 zkVM       | Verification-key target | Verification keys are emittable in BabyBear-field format.            |
| Plonky2          | Verification-key target | Roadmap. Goldilocks-field circuits in scope for v0.2.                |

Aleo references throughout this repo describe Aleo snarkVM as a public, ecosystem-neutral verifier. There is no co-branding, no Aleo logo usage, and no claim of partnership.

## Tools

| Tool                     | Cost                      | Status                |
|--------------------------|---------------------------|-----------------------|
| `zk_attest_agent_state`  | $0.05 USDC on Base        | 503 backend pending   |
| `zk_verify_proof`        | Free                      | 503 backend pending   |
| `zk_anchor_to_base`      | $0.02 USDC + L1 gas       | 503 backend pending   |
| `zk_list_circuits`       | Free                      | 503 backend pending (stable circuit catalog returned inline) |
| `zk_query_attestation`   | Free                      | 503 backend pending   |

The backend at `https://hivemorph.onrender.com/v1/zk/*` is RFC-stage. Until it ships, every paid tool returns:

```json
{
  "error": "backend_pending",
  "retry_after": 86400,
  "message": "zk attestation rails are RFC-stage. Backend endpoints publish when the spec is finalized. Tool surface, costs, and circuit list are stable."
}
```

The MCP shim, tool surface, costs, and circuit catalog are stable across the v0.1 RFC. Calling agents can integrate now and receive proofs the moment the backend is live.

### Settlement

Real Base USDC. No mocks, no testnet, no simulated settlement. Recipient (canonical Hive treasury, EVM): `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e`. Pricing is denominated in USDC; payment is collected via x402 PaymentRequired (HTTP 402) on the paid tools.

## Usage

```bash
git clone https://github.com/srotzin/hive-mcp-zk-attestation
cd hive-mcp-zk-attestation
npm install
node server.js
```

Then point any MCP client at `http://localhost:3000/mcp`. Discovery endpoints:

- `GET /health` — health probe
- `GET /.well-known/mcp.json` — MCP manifest
- `GET /.well-known/agent.json` — A2A AgentCard
- `GET /.well-known/oac.json` — Open Agent Card JSON-LD

### Example: list circuits

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"zk_list_circuits","arguments":{}}}'
```

While the backend is RFC-stage, this returns the stable circuit catalog inline.

## License

MIT. See [LICENSE](./LICENSE).
