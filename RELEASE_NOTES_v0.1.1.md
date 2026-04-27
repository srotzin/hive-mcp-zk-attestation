# v0.1.1 — Honest Aleo/Varuna alignment

A documentation and metadata patch on top of v0.1.0. No tool surface changes. Backend remains 503 backend_pending until the v0.1 spec is finalized.

## What changed

- Realigned proof-system language to **Varuna over BLS12-377** — Aleo snarkVM's actual proof system (a Marlin/AHP variant using KZG10), as exposed via the `snark.verify` opcode in `synthesizer/program/src/logic/instruction/operation/snark_verify.rs` and the `@provablehq/sdk` `VerifyingKey.verify()` path.
- Demoted Groth16 and Plonk references to **research status**. Earlier drafts treated them as first-class; they are not. A generic Groth16/BN254 → BLS12-377 verifier inside snarkVM would be roughly two million constraints and is not shipped.
- Added an explicit **interop priority order**: (1) Aleo snarkVM, (2) native Hive verification, (3) Risc0 (research), (4) Plonky2 (research).
- Added an **Architecture** subsection to the README explaining the seam: Hive emits attestations; Leo programs in a forthcoming `hive-leo-circuits` repository (future work, not part of this shim) consume them; verification happens inside snarkVM.
- Added a **Known gotchas** subsection covering BLS12-377 keypair separation, the absence of native Groth16 verification on Aleo today, and the real cost of deploying a Leo program (~1.5–2 ALEO credits).
- Updated `package.json` description, version, and keywords. Added `varuna`, `bls12-377`, `kzg10`, `marlin-ahp`, `leo-lang`, `snarkvm-compatible`, `aleo-mainnet`, `provable-sdk`. Removed `groth16` and `plonk` from primary keywords.
- Mirrored the description and keyword updates into `smithery.yaml`, the agent card, and the JSON-LD on the landing page.
- Updated `zk_list_circuits` to return a catalog where Varuna and native Hive verification are marked `primary`, Risc0 and Plonky2 are `future-research`, and Groth16 / Plonk are `research`.
- Updated `zk_attest_agent_state`, `zk_verify_proof`, and `zk_anchor_to_base` tool descriptions to mention Aleo snarkVM compatibility honestly.

## What did not change

- Tool surface (five tools, same names, same input schemas).
- Pricing (`$0.05` USDC for `zk_attest_agent_state`, `$0.02` USDC for `zk_anchor_to_base`, free for the rest).
- Backend status — every paid tool still returns `503 backend_pending` until `/v1/zk/*` publishes.
- Settlement recipient: `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e` (canonical Hive treasury, EVM).
- Brand colour: Hive Civilization gold `#C08D23`.

## Clean-money guardrails — re-verified

1. Attestation-only, not a bridge.
2. Commercial dual-use language only.
3. Zero claims of clearances, certifications, or contracts.
4. Public framing is agent-economy.
5. Aleo references are interoperability targets, not partnership claims. No co-branding, no logo usage, no "powered by" language.
6. Real rails only — backend stays 503 until live.
7. Honest about non-interop. BLS12-377 ↔ BN254 is not free; Aleo accounts are separate from Base/Solana keys; Leo deployment has a real cost.

---

Brand: Hive Civilization gold `#C08D23`. License: MIT. Author: Steve Rotzin.
