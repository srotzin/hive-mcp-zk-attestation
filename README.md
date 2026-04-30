# hive-mcp-zk-attestation

[![srotzin/hive-mcp-zk-attestation MCP server](https://glama.ai/mcp/servers/srotzin/hive-mcp-zk-attestation/badges/score.svg)](https://glama.ai/mcp/servers/srotzin/hive-mcp-zk-attestation)

Verifiable agent state attestations for the autonomous agent economy. RFC-stage v0.1.1.

A Model Context Protocol shim that lets any autonomous agent emit a zero-knowledge attestation of its internal state hash and DID. The primary verification target is Aleo snarkVM (Varuna over BLS12-377), with native Hive verification next, and Risc0 / Plonky2 referenced as future research targets. Attestation-only. No asset bridging. No custody. No wrapped value.

Brand colour: Hive Civilization gold `#C08D23`.

## What this is

An attestation primitive for autonomous agents. The shim exposes five MCP tools that together let one agent prove to another agent — or to a regulator, counterparty, or auditor — that:

1. The first agent was in a specific internal state, identified by a 32-byte hash.
2. The state was held by a specific DID.
3. A commitment to that proof has been anchored to Base at a known block.
4. The verification path is reproducible against a public, ecosystem-neutral verifier.

The agent never reveals its state. The verifier never learns more than the boolean result and the public inputs. The audit trail is anchored on a public chain. The verification key is portable to compatible verifiers — primarily Aleo snarkVM via Leo.

## Why it exists

Autonomous agents transact, hold state, and make decisions on behalf of users. Existing agent-to-agent protocols — MCP, A2A, ACP — assume the agent is willing to publish what it knows. That assumption breaks the moment two agents need to negotiate without leaking inventory, model weights, prompt history, or counterparty positions.

Zero-knowledge proofs are the standard cryptographic answer. The plumbing has not been wired into the MCP / A2A surface that agent runtimes already speak. This shim is that wiring.

## Interop targets

Honest priority order. Every name below is a public, ecosystem-neutral verifier or a research direction. There is no co-branding, no partnership, and no shared roadmap with any of these projects.

1. **Aleo snarkVM (Varuna over BLS12-377)** — primary. Aleo's native proof system is Varuna (a Marlin/AHP variant using KZG10 over BLS12-377). On-chain verification happens inside snarkVM via the `snark.verify` opcode (`synthesizer/program/src/logic/instruction/operation/snark_verify.rs`), which accepts Varuna proofs and verification keys. The TypeScript SDK `@provablehq/sdk` exposes `VerifyingKey.verify()` for client-side checks. Mainnet endpoint: `https://api.provable.com/v2`.
2. **Native Hive verification** — proofs verified server-side at the Hive backend. Not yet rails-live; ships when the v0.1 spec is finalized and `/v1/zk/*` publishes.
3. **Risc0** — researched, not implemented. Future verification target.
4. **Plonky2** — researched, not implemented. Future verification target.

### Architecture

```
┌─────────────┐    state hash + DID     ┌────────────────────────┐
│ Agent (any) │ ─────────────────────▶  │  zk_attest_agent_state │
└─────────────┘                         │  (attestation payload) │
                                        └─────────────┬──────────┘
                                                      │ commitment
                                                      ▼
                                        ┌────────────────────────┐
                                        │  zk_anchor_to_base     │
                                        │  commitment → Base L2  │
                                        └─────────────┬──────────┘
                                                      │ tx_hash
                                                      ▼
                                        ┌────────────────────────┐
                                        │  Base L2 (anchor)      │
                                        └─────────────┬──────────┘
                                                      │
                attestation consumed by               │
                downstream verifier                   │
                                                      ▼
            ┌──────────────────────┬─────────────────────────┐
            │  Aleo snarkVM        │  Native Hive backend    │
            │  (Varuna/BLS12-377   │  (verification at       │
            │  via Leo programs in │   hivemorph; not yet    │
            │  hive-leo-circuits   │   rails-live)           │
            │  — future repo)      │                         │
            └──────────────────────┴─────────────────────────┘
```

Hive emits the attestation. Base anchors the commitment. Verification happens either (a) inside snarkVM via Leo programs that consume the attestation and call `snark.verify` against a Varuna verification key, or (b) inside the Hive backend once `/v1/zk/*` publishes. The Leo programs themselves will live in a separate `hive-leo-circuits` repository — that repo is future work and is not part of this shim.

### Future research (Groth16 / Plonk)

Earlier drafts of this shim referenced Groth16 over BN254 and Plonk as if they were first-class. They are not. Aleo's mainnet verification path is Varuna over BLS12-377, and a generic Groth16/BN254 → BLS12-377 verifier inside snarkVM would be roughly two million constraints — researched, not shipped. Groth16 and Plonk remain in this repo only as research-stage references for hypothetical bring-your-own-verifier integrations.

## Known gotchas

The whole point of v0.1.1 is honesty about where the integration actually is. Read this section before integrating.

- **BLS12-377 keypair separation.** Aleo accounts are BLS12-377 scalar-field keypairs. They are not interoperable with the Base (W1) or Solana (B1) keys an agent may already hold. An agent that wants to verify attestations on Aleo needs a separate Aleo account.
- **No native Groth16 verification on Aleo today.** A Groth16/BN254 proof cannot be verified inside snarkVM without a curve-translation circuit (~2M constraints). That circuit is researched, not implemented, and is not part of this shim.
- **Leo deployment cost.** Deploying a Leo program to Aleo mainnet costs roughly 1.5 to 2 ALEO credits per program. The forthcoming `hive-leo-circuits` repository will carry that cost; this shim does not.
- **Backend is RFC-stage.** Every paid tool returns 503 backend_pending until `/v1/zk/*` publishes. The tool surface, costs, and circuit catalog are stable across the v0.1 RFC.
- **Attestation, not bridge.** No value moves between Base and Aleo. The shim emits proofs and commitments; nothing is wrapped, mirrored, or escrowed.

## What this is NOT

Stated explicitly so there is no ambiguity:

- **Not a bridge.** No value, no token, no wrapped asset crosses any chain. The shim emits proofs and commitments, not balances.
- **Not a custody layer.** The shim never holds keys for any chain on behalf of the caller. It does not hold user funds, token balances, or signing authority.
- **Not a regulated activity.** Emitting a hash commitment to a public chain is not money transmission, securities issuance, or a regulated payment service.
- **Not a partner integration.** Aleo snarkVM, Risc0, and Plonky2 are interoperability targets — public open-source verifiers. There is no co-branding, no joint product, no shared roadmap, no Aleo logo usage, and no "powered by Aleo" claim.
- **Not a product for any specific industry vertical.** The primitive is commercial dual-use: any autonomous agent that needs verifiable private state can use it.

## Threat model

The shim is designed against three concrete threats:

1. **Agent state confidentiality.** An agent must be able to prove a fact about its state without revealing the state. Standard zk-SNARK construction; the shim simply exposes it through the MCP surface.
2. **Counterparty proof-of-honesty.** When two agents negotiate, each can demand a proof that the other is in a state consistent with the negotiation, without either side opening its book.
3. **Audit trail without exposure.** Compliance-conscious operators can publish proof commitments to Base while keeping the underlying state private. The audit trail is verifiable; the data is not exposed.

The shim does not defend against: a compromised agent forging its own state hash before proving it (garbage in, valid proof of garbage out), or a verifier choosing to trust an unrelated verification key. Both are upstream of this primitive.

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

The MCP shim, tool surface, costs, and circuit catalog are stable across the v0.1 RFC. Calling agents can integrate now and consume attestations the moment the backend is live.

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

<!-- HIVE-GAMIFICATION-META-START -->
## Hive Gamification

This MCP server is part of the Hive Civilization gamification surface (10-mechanic capability taxonomy).

- Capability taxonomy: https://hive-gamification.onrender.com/.well-known/hive-gamification.json
- Centrifuge dashboard: https://hive-gamification.onrender.com/.well-known/hive-centrifuge.json
- Consolidated OpenAPI: https://hive-gamification.onrender.com/.well-known/openapi.json

**Surface tags:** `gamification.spec.v1` · `gamification.surface.public` · `gamification.signal.read-only` · `gamification.settlement.real-rails`

Real rails on Base L2 (USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`). Read-only signal layer. Brand gold `#C08D23`.
<!-- HIVE-GAMIFICATION-META-END -->

## Hive Civilization Directory

Part of the Hive Civilization — agent-native financial infrastructure.

- Endpoint Directory: https://thehiveryiq.com
- Live Leaderboard: https://hive-a2amev.onrender.com/leaderboard
- Revenue Dashboard: https://hivemine-dashboard.onrender.com
- Other MCP Servers: https://github.com/srotzin?tab=repositories&q=hive-mcp

Brand: #C08D23
<!-- /hive-footer -->
