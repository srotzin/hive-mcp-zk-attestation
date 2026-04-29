#!/usr/bin/env node
/**
 * hive-mcp-zk-attestation — RFC-stage MCP shim (v0.1.1)
 *
 * Verifiable agent state attestations for the autonomous agent economy.
 * Primary verification target: Aleo snarkVM (Varuna over BLS12-377), with
 * native Hive verification next. Groth16 / Plonk are research-stage only.
 *
 * Attestation-only. No asset bridging. No custody. No wrapped value.
 *
 * Backend: https://hivemorph.onrender.com (zk endpoints pending — shim
 * returns backend_pending payload until /v1/zk/* is live).
 *
 * Spec : MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0
 * Brand: Hive Civilization gold #C08D23
 */

import express from 'express';
import { HIVE_EARN_TOOLS, executeHiveEarnTool, isHiveEarnTool } from './hive-earn-tools.js';
import { buildAgentCard, buildOacJsonLd, renderRootHtml } from './hive-agent-card.js';
import { renderLanding, renderRobots, renderSitemap, renderSecurity, renderOgImage, seoJson, BRAND_GOLD } from './meta.js';

const app = express();
app.use(express.json({ limit: '512kb' }));

const PORT = process.env.PORT || 3000;
// ─── BOGO pay-front helpers ───────────────────────────────────────────────
// did_call_count tracks paid calls per DID for first-call-free and loyalty
// freebies. Schema lives in a dedicated DB so it never touches service data.
import _BogoDatabase from 'better-sqlite3';
const _bogoDB = new _BogoDatabase(process.env.BOGO_DB_PATH || '/tmp/bogo_zk_attest.db');
_bogoDB.pragma('journal_mode = WAL');
_bogoDB.exec(
  'CREATE TABLE IF NOT EXISTS did_call_count ' +
  '(did TEXT PRIMARY KEY, paid_calls INTEGER NOT NULL DEFAULT 0)'
);

const _bogoGetStmt = _bogoDB.prepare(
  'SELECT paid_calls FROM did_call_count WHERE did = ?'
);
const _bogoUpsertStmt = _bogoDB.prepare(
  'INSERT INTO did_call_count (did, paid_calls) VALUES (?, 1) ' +
  'ON CONFLICT(did) DO UPDATE SET paid_calls = paid_calls + 1'
);

function _bogoCheck(did) {
  if (!did) return { free: false };
  const row = _bogoGetStmt.get(did);
  const n   = row ? row.paid_calls : 0;
  if (n === 0)        return { free: true, reason: 'first_call_free' };
  if (n % 6 === 0)    return { free: true, reason: 'loyalty_freebie' };
  return { free: false };
}

function _bogoIncrement(did) {
  if (did) _bogoUpsertStmt.run(did);
}

const BOGO_BLOCK = {
  first_call_free: true,
  loyalty_threshold: 6,
  loyalty_message:
    "Every 6th paid call is free. Present your DID via 'x-hive-did' header to track progress.",
};
// ─────────────────────────────────────────────────────────────────────────

async function _verifyUsdcPayment(tx_hash, min_usd) {
  if (!tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(tx_hash))
    return { ok: false, reason: 'invalid_tx_hash' };
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(
    process.env.BASE_RPC_URL || 'https://mainnet.base.org'
  );
  let receipt;
  try   { receipt = await provider.getTransactionReceipt(tx_hash); }
  catch (err) { return { ok: false, reason: `rpc_error: ${err.message}` }; }
  if (!receipt)            return { ok: false, reason: 'tx_not_found_or_pending' };
  if (receipt.status !== 1) return { ok: false, reason: 'tx_reverted' };
  const USDC_ADDR    = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const WALLET_ADDR  = '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e';
  const XFER_TOPIC   = ethers.id('Transfer(address,address,uint256)');
  let total = 0n;
  for (const log of (receipt.logs || [])) {
    if (log.address.toLowerCase() !== USDC_ADDR.toLowerCase()) continue;
    if (log.topics?.[0] !== XFER_TOPIC) continue;
    if (('0x' + log.topics[2].slice(26).toLowerCase()) !== WALLET_ADDR.toLowerCase()) continue;
    total += BigInt(log.data);
  }
  if (total === 0n)  return { ok: false, reason: 'no_transfer_to_wallet' };
  const amount_usd = Number(total) / 1e6;
  if (amount_usd + 1e-9 < min_usd) return { ok: false, reason: 'underpaid', amount_usd };
  return { ok: true, amount_usd };
}


const HIVE_BASE = process.env.HIVE_BASE || 'https://hivemorph.onrender.com';

const BACKEND_PENDING = {
  error: 'backend_pending',
  retry_after: 86400,
  message: 'zk attestation rails are RFC-stage. Backend endpoints publish when the spec is finalized. Tool surface, costs, and circuit list are stable.',
};

const HIVE_AGENT_CFG = {
  name: 'hive-mcp-zk-attestation',
  description: 'Hive ZK attestation MCP server. Agent state proofs targeting Aleo snarkVM (Varuna/BLS12-377). RFC-stage, attestation-only, no asset bridging.',
  url: 'https://hive-mcp-gateway.onrender.com/zk-attestation',
  version: '0.1.1',
  repoUrl: 'https://github.com/srotzin/hive-mcp-zk-attestation',
  did: 'did:hive:zk-attestation',
  gatewayUrl: 'https://hive-mcp-gateway.onrender.com',
  tools: [],
};

const TOOLS = [
  {
    name: 'zk_attest_agent_state',
    description: 'Produce a zero-knowledge attestation of an agent state hash + DID. Primary verification target is Aleo snarkVM (Varuna over BLS12-377); native Hive verification is next. Attestation-only — emits a proof, not a token; no value crosses chains. Cost: $0.05 USDC on Base. Backend RFC-stage; returns backend_pending until rails land.',
    inputSchema: {
      type: 'object',
      required: ['agent_did', 'state_hash'],
      properties: {
        agent_did: { type: 'string', description: 'DID of the agent whose state is being attested' },
        state_hash: { type: 'string', description: 'Hex-encoded 32-byte hash of the agent state (poseidon or sha256)' },
        circuit: { type: 'string', description: 'Circuit identifier; defaults to varuna-bls12377-agent-state-v1 (snarkVM-compatible)' },
        public_inputs: { type: 'array', items: { type: 'string' }, description: 'Optional public inputs as hex strings' },
      },
    },
  },
  {
    name: 'zk_verify_proof',
    description: 'Verify a submitted attestation against a known verification key. Aleo snarkVM (Varuna/BLS12-377) is the primary verification target via the snark.verify opcode. Returns boolean validity plus the verification key fingerprint. Free. Read-only — no settlement, no on-chain write.',
    inputSchema: {
      type: 'object',
      required: ['proof', 'verification_key_id'],
      properties: {
        proof: { type: 'string', description: 'Hex-encoded proof bytes (Varuna; Groth16/Plonk research-stage only)' },
        verification_key_id: { type: 'string', description: 'Identifier of the verification key to check against' },
        public_inputs: { type: 'array', items: { type: 'string' }, description: 'Public inputs the proof was generated against' },
      },
    },
  },
  {
    name: 'zk_anchor_to_base',
    description: 'Write an attestation commitment (32-byte hash) to Base via the Hive gateway. Anchors the attestation only; does not bridge value or move state to Aleo. Aleo snarkVM consumes the attestation independently via Leo programs (future hive-leo-circuits repo). Cost: $0.02 USDC + L1 gas. Backend RFC-stage; returns backend_pending until rails land.',
    inputSchema: {
      type: 'object',
      required: ['proof_commitment', 'agent_did'],
      properties: {
        proof_commitment: { type: 'string', description: 'Hex-encoded 32-byte commitment to the proof' },
        agent_did: { type: 'string', description: 'DID of the attesting agent' },
        verification_key_id: { type: 'string', description: 'Identifier of the verification key referenced by the proof' },
      },
    },
  },
  {
    name: 'zk_list_circuits',
    description: 'Enumerate supported circuits and verification key fingerprints. Primary: Varuna over BLS12-377 (Aleo snarkVM-compatible). Research-stage: Groth16, Plonk. Future: Risc0, Plonky2. Free. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'zk_query_attestation',
    description: 'Fetch a previously-anchored attestation by Base transaction hash. Returns the proof commitment, verification key id, agent DID, and block number. Free. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tx_hash'],
      properties: {
        tx_hash: { type: 'string', description: 'Base L2 transaction hash of the anchored attestation' },
      },
    },
  },
];

const SERVICE_CFG = {
  service: 'hive-mcp-zk-attestation',
  shortName: 'HiveZKAttestation',
  title: 'hive-mcp-zk-attestation · Verifiable Agent State Attestations',
  tagline: 'Verifiable agent state attestations for the autonomous agent economy.',
  description: 'Hive ZK attestation MCP server. Agent state proofs targeting Aleo snarkVM (Varuna/BLS12-377). RFC-stage, attestation-only, no asset bridging.',
  keywords: [
    'mcp', 'model-context-protocol', 'x402', 'a2a', 'agentic', 'ai-agent', 'autonomous-agent',
    'hive', 'hive-civilization',
    'zk', 'zero-knowledge', 'zk-proof',
    'varuna', 'bls12-377', 'kzg10', 'marlin-ahp', 'leo-lang', 'snarkvm-compatible', 'aleo-mainnet', 'provable-sdk',
    'agent-attestation', 'agent-state-proof', 'verifiable-agent', 'private-agent-execution', 'agent-audit-trail',
    'autonomous-systems', 'dual-use', 'commercial-grade',
    'usdc', 'base', 'base-l2', 'real-rails', 'on-chain-anchoring',
  ],
  externalUrl: 'https://hive-mcp-zk-attestation.onrender.com',
  gatewayMount: '/zk-attestation',
  version: '0.1.1',
  pricing: [
    { name: 'zk_attest_agent_state', priceUsd: 0.05, label: 'Attest agent state — $0.05 USDC on Base' },
    { name: 'zk_verify_proof', priceUsd: 0, label: 'Verify proof — free' },
    { name: 'zk_anchor_to_base', priceUsd: 0.02, label: 'Anchor commitment to Base — $0.02 USDC + L1 gas' },
    { name: 'zk_list_circuits', priceUsd: 0, label: 'List circuits — free' },
    { name: 'zk_query_attestation', priceUsd: 0, label: 'Query attestation — free' },
  ],
};
SERVICE_CFG.tools = TOOLS.map(t => ({ name: t.name, description: t.description }));

for (const t of HIVE_EARN_TOOLS) {
  if (!TOOLS.find(x => x.name === t.name)) TOOLS.push(t);
}
HIVE_AGENT_CFG.tools = TOOLS;

async function hiveGet(path, params = {}) {
  const url = new URL(`${HIVE_BASE}${path.startsWith('/') ? path : '/' + path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  let data; try { data = await res.json(); } catch { data = { raw: await res.text() }; }
  return { data, status: res.status };
}
async function hivePost(path, body) {
  const res = await fetch(`${HIVE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data; try { data = await res.json(); } catch { data = { raw: await res.text() }; }
  return { data, status: res.status };
}

function pendingResponse(extra = {}) {
  return { type: 'text', text: JSON.stringify({ status: 503, ...BACKEND_PENDING, ...extra }, null, 2) };
}

function relayResponse(status, data) {
  if (status === 503 || status === 404 || status >= 500) return pendingResponse({ upstream_status: status, upstream: data });
  return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
}

async function executeTool(name, args) {
  if (isHiveEarnTool(name)) {
    const out = await executeHiveEarnTool(name, args);
    if (out) return out;
  }
  switch (name) {
    case 'zk_attest_agent_state': {
      try {
        const { data, status } = await hivePost('/v1/zk/attest', {
          agent_did: args.agent_did,
          state_hash: args.state_hash,
          circuit: args.circuit || 'varuna-bls12377-agent-state-v1',
          public_inputs: args.public_inputs || [],
        });
        return relayResponse(status, data);
      } catch (err) {
        return pendingResponse({ network_error: String(err?.message || err) });
      }
    }
    case 'zk_verify_proof': {
      try {
        const { data, status } = await hivePost('/v1/zk/verify', {
          proof: args.proof,
          verification_key_id: args.verification_key_id,
          public_inputs: args.public_inputs || [],
        });
        return relayResponse(status, data);
      } catch (err) {
        return pendingResponse({ network_error: String(err?.message || err) });
      }
    }
    case 'zk_anchor_to_base': {
      try {
        const { data, status } = await hivePost('/v1/zk/anchor', {
          proof_commitment: args.proof_commitment,
          agent_did: args.agent_did,
          verification_key_id: args.verification_key_id,
        });
        return relayResponse(status, data);
      } catch (err) {
        return pendingResponse({ network_error: String(err?.message || err) });
      }
    }
    case 'zk_list_circuits': {
      try {
        const { data, status } = await hiveGet('/v1/zk/circuits');
        if (status === 503 || status === 404 || status >= 500) {
          return { type: 'text', text: JSON.stringify({
            status: 503,
            ...BACKEND_PENDING,
            stable_circuit_catalog: [
              { id: 'varuna-bls12377-agent-state-v1', proving_system: 'Varuna (Marlin/AHP, KZG10)', curve: 'BLS12-377', status: 'primary', purpose: 'agent state hash + DID attestation; verifiable inside Aleo snarkVM via the snark.verify opcode' },
              { id: 'hive-native-agent-state-v1', proving_system: 'Hive native (server-side)', curve: 'n/a', status: 'primary', purpose: 'verification at the Hive backend; ships with v0.1 spec finalization' },
              { id: 'risc0-compat-v1', proving_system: 'RISC Zero-compatible', curve: 'BabyBear', status: 'future-research', purpose: 'researched verification target; not implemented' },
              { id: 'plonky2-compat-v1', proving_system: 'Plonky2-compatible', curve: 'Goldilocks', status: 'future-research', purpose: 'researched verification target; not implemented' },
              { id: 'groth16-bn254-agent-state-v1', proving_system: 'Groth16', curve: 'BN254', status: 'research', purpose: 'research-stage only; no native Aleo verification path (BN254 to BLS12-377 in-circuit verification is roughly 2M constraints and not shipped)' },
              { id: 'plonk-bn254-tx-validity-v1', proving_system: 'Plonk', curve: 'BN254', status: 'research', purpose: 'research-stage only; not a first-class verification target' },
            ],
            note: 'Catalog is stable across the v0.1 RFC. Primary verification target is Aleo snarkVM (Varuna over BLS12-377) consumed via Leo programs (future hive-leo-circuits repo); native Hive verification is next. Groth16 and Plonk are research-stage. Risc0 and Plonky2 are future research targets, not implemented. Aleo references describe an ecosystem-neutral verifier — no co-branding.',
          }, null, 2) };
        }
        return relayResponse(status, data);
      } catch (err) {
        return pendingResponse({ network_error: String(err?.message || err) });
      }
    }
    case 'zk_query_attestation': {
      try {
        const { data, status } = await hiveGet(`/v1/zk/attestations/${encodeURIComponent(args.tx_hash)}`);
        return relayResponse(status, data);
      } catch (err) {
        return pendingResponse({ network_error: String(err?.message || err) });
      }
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── POST /v1/attest — pay-front for issuing a zk attestation ────────────
// Returns 402 + BOGO block with no tx_hash. First-call-free for new DIDs.
// On payment: submits to HIVE_BASE /v1/zk/attest when live; queues otherwise.
app.post('/v1/attest', async (req, res) => {
  const PRICE = 0.05;
  const did     = req.headers['x-hive-did'] || req.body?.agent_did || null;
  const tx_hash = req.body?.tx_hash || req.headers['x402-tx-hash'] || null;

  const bogo = _bogoCheck(did);
  if (bogo.free) {
    _bogoIncrement(did);
    return res.json({
      ok: true, bogo_applied: bogo.reason,
      attestation: {
        agent_did: did,
        state_hash: req.body?.state_hash || null,
        circuit:    req.body?.circuit || 'varuna-bls12377-agent-state-v1',
        status:     'queued',
        issued_at:  new Date().toISOString(),
      },
    });
  }

  if (!tx_hash) {
    return res.status(402).json({
      error: 'payment_required',
      x402: {
        type: 'x402', version: '1', kind: 'zk_attest',
        asking_usd: 0.05, accept_min_usd: 0.05,
        asset: 'USDC', asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        network: 'base', pay_to: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
        nonce: Math.random().toString(36).slice(2),
        issued_ms: Date.now(),
      },
      bogo: BOGO_BLOCK,
      bogo_first_call_free: true,
      bogo_loyalty_threshold: 6,
      bogo_pitch: "Pay this once, your 6th call is on the house. New here? Add header x-hive-did to claim your first call free.",
      note: `Submit tx_hash in body or 'x402-tx-hash' header. Asking 0.05 USDC on Base to 0x15184bf50b3d3f52b60434f8942b7d52f2eb436e.`,
      did: did || null,
    });
  }

  const v = await _verifyUsdcPayment(tx_hash, PRICE);
  if (!v.ok) return res.status(402).json({ error: 'payment_invalid', reason: v.reason, tx_hash });

  _bogoIncrement(did);
  // Forward to backend when live; return queued receipt if backend is pending.
  let attestation = {
    agent_did: did,
    state_hash: req.body?.state_hash || null,
    circuit:    req.body?.circuit || 'varuna-bls12377-agent-state-v1',
    status:     'queued',
    issued_at:  new Date().toISOString(),
  };
  try {
    const backendRes = await fetch(`${HIVE_BASE}/v1/zk/attest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent_did: did, state_hash: req.body?.state_hash, circuit: req.body?.circuit }),
      signal: AbortSignal.timeout(10000),
    });
    if (backendRes.ok) attestation = { ...attestation, ...await backendRes.json(), status: 'issued' };
  } catch { /* backend pending — queued receipt is authoritative */ }
  res.json({ ok: true, billed_usd: v.amount_usd, tx_hash, attestation });
});

app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC' } });
  try {
    switch (method) {
      case 'initialize':
        return res.json({ jsonrpc: '2.0', id, result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'hive-mcp-zk-attestation', version: '0.1.1', description: SERVICE_CFG.description },
        } });
      case 'tools/list':
        return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const out = await executeTool(name, args || {});
        return res.json({ jsonrpc: '2.0', id, result: { content: [out] } });
      }
      case 'ping':
        return res.json({ jsonrpc: '2.0', id, result: {} });
      default:
        return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'hive-mcp-zk-attestation', version: '0.1.1', backend: HIVE_BASE, backend_state: 'pending' }));
app.get('/.well-known/mcp.json', (req, res) => res.json({
  name: 'hive-mcp-zk-attestation',
  endpoint: '/mcp',
  transport: 'streamable-http',
  protocol: '2024-11-05',
  tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
}));

app.get('/', (req, res) => {
  const __landing = renderLanding(SERVICE_CFG);
  const __oacLd = JSON.stringify(buildOacJsonLd(HIVE_AGENT_CFG)).replace(/</g, '\\u003c');
  const __ldTag = '\n<script type="application/ld+json">' + __oacLd + '</script>\n';
  const __out = __landing.replace('</head>', __ldTag + '</head>');
  res.type('text/html; charset=utf-8').send(__out);
});
app.get('/og.svg', (req, res) => res.type('image/svg+xml').send(renderOgImage(SERVICE_CFG)));
app.get('/robots.txt', (req, res) => res.type('text/plain').send(renderRobots(SERVICE_CFG)));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(renderSitemap(SERVICE_CFG)));
app.get('/.well-known/security.txt', (req, res) => res.type('text/plain').send(renderSecurity()));
app.get('/seo.json', (req, res) => res.json(seoJson(SERVICE_CFG)));
app.get('/.well-known/agent.json', (req, res) => res.json(buildAgentCard(HIVE_AGENT_CFG)));
app.get('/agent.json', (req, res) => res.json(buildAgentCard(HIVE_AGENT_CFG)));
app.get('/.well-known/oac.json', (req, res) => res.json(buildOacJsonLd(HIVE_AGENT_CFG)));
app.get('/agent.html', (req, res) => res.type('text/html; charset=utf-8').send(renderRootHtml(HIVE_AGENT_CFG)));

// ─── Schema discoverability (auto-injected) ──────────────────────────────
app.get('/.well-known/agent-card.json', (req, res) => res.json({
  name: 'hive-mcp-zk-attestation',
  description: "Hive Civilization zk-attestation MCP \u2014 pay-per-attest zero-knowledge proof verification with x402 USDC settlement. New agents: first call free. Loyalty: every 6th paid call is free. Pay in USDC on Base L2.",
  url: 'https://hive-mcp-zk-attestation.onrender.com',
  provider: { organization: 'Hive Civilization', url: 'https://www.thehiveryiq.com', contact: 'steve@thehiveryiq.com' },
  version: '0.1.1',
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  authentication: {
    schemes: ['x402'],
    credentials: { type:'x402', asset:'USDC', network:'base',
      asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e'
    }
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
  extensions: {
    hive_pricing: {
      currency: 'USDC', network: 'base', model: 'per_call',
      first_call_free: true, loyalty_threshold: 6,
      loyalty_message: 'Every 6th paid call is free'
    }
  },
  bogo: {
    first_call_free: true, loyalty_threshold: 6,
    pitch: "Pay this once, your 6th paid call is on the house. New here? Add header 'x-hive-did' to claim your first call free.",
    claim_with: 'x-hive-did header'
  }
}));
app.get('/.well-known/ap2.json', (req, res) => res.json({
  ap2_version: '1',
  agent: {
    name: 'hive-mcp-zk-attestation',
    did: 'did:web:hive-mcp-zk-attestation.onrender.com',
    description: "Hive Civilization zk-attestation MCP \u2014 pay-per-attest zero-knowledge proof verification with x402 USDC settlement. New agents: first call free. Loyalty: every 6th paid call is free. Pay in USDC on Base L2."
  },
  endpoints: {
    mcp: 'https://hive-mcp-zk-attestation.onrender.com/mcp',
    agent_card: 'https://hive-mcp-zk-attestation.onrender.com/.well-known/agent-card.json'
  },
  payments: {
    schemes: ['x402'],
    primary: { scheme:'x402', network:'base', asset:'USDC',
      asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e'
    }
  },
  bogo: {
    first_call_free: true, loyalty_threshold: 6,
    pitch: "Pay this once, your 6th paid call is on the house.",
    claim_with: 'x-hive-did header'
  },
  brand: { color: '#C08D23', name: 'Hive Civilization' }
}));



// ─── Subscription & enterprise tier endpoints (Wave B codification) ──────────
// Partner-doctrine: identity/receipts/trust plumbing only.
// Subscription billing is denominated in USDC on Base (Monroe W1).
// Spectral receipt is emitted on every fee event via hive-receipt sidecar.
//
// Tier schedule:
//   Tier 1 (Starter)    : 20.0/mo
//   Tier 2 (Pro)        : 100.0/mo
//   Tier 3 (Enterprise) : 500.0/mo
//
// x402 tx_hash required for Tier 1+ confirmation. Tier 3 can invoice monthly.
//
// Spectral receipt: POST to hive-receipt sidecar for tamper-evident audit trail.

const SUBSCRIPTION_TIERS = {
  starter:    { price_usd: 20.0, calls_per_day: 400, label: 'Starter' },
  pro:        { price_usd: 100.0, calls_per_day: 2000, label: 'Pro' },
  enterprise: { price_usd: 500.0, calls_per_day: Infinity, label: 'Enterprise', invoice: true },
};

// In-memory subscription ledger (durable persistence on hivemorph backend).
const _subLedger = new Map(); // did -> { tier, activated_ms, tx_hash }

async function emitSpectralReceipt({ event_type, did, amount_usd, tool_name, tx_hash, metadata }) {
  // Posts a Spectral-signed receipt to hive-receipt. Non-blocking.
  // Error is logged but never throws — receipt emission must not block the fee path.
  try {
    const body = JSON.stringify({
      issuer_did: 'did:hive:zk-attestation',
      recipient_did: did || 'did:hive:anonymous',
      event_type,
      tool_name,
      amount_usd: String(amount_usd),
      currency: 'USDC',
      network: 'base',
      pay_to: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
      tx_hash: tx_hash || null,
      issued_ms: Date.now(),
      service: 'Hive ZK Attestation',
      brand: '#C08D23',
      ...metadata,
    });
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    await fetch('https://hive-receipt.onrender.com/v1/receipt/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(tid);
  } catch (_) {
    // Receipt emission is best-effort. Log and continue.
    console.warn('[zk-attestation] receipt emit failed (non-fatal):', _.message || _);
  }
}

// POST /v1/subscription — create or upgrade a subscription
app.post('/v1/subscription', async (req, res) => {
  const { tier, did, tx_hash } = req.body || {};
  if (!tier || !SUBSCRIPTION_TIERS[tier]) {
    return res.status(400).json({
      error: 'invalid_tier',
      valid_tiers: Object.keys(SUBSCRIPTION_TIERS),
      brand: '#C08D23',
    });
  }
  const t = SUBSCRIPTION_TIERS[tier];
  if (!did) return res.status(400).json({ error: 'did_required' });

  // Enterprise tier can invoice monthly (no tx_hash required at activation).
  if (tier !== 'enterprise' && !tx_hash) {
    return res.status(402).json({
      error: 'payment_required',
      x402: {
        type: 'x402', version: '1', kind: 'subscription_zk-attestation',
        asking_usd: t.price_usd,
        accept_min_usd: t.price_usd,
        asset: 'USDC', asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        network: 'base', pay_to: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
        nonce: Math.random().toString(36).slice(2),
        issued_ms: Date.now(),
        tier, label: t.label,
        bogo: { first_call_free: true, loyalty_every_n: 6 },
      },
      note: `Submit tx_hash for ${t.price_usd} USDC/mo to 0x15184bf50b3d3f52b60434f8942b7d52f2eb436e on Base.`,
    });
  }

  const record = {
    tier, did, tx_hash: tx_hash || 'enterprise_invoice',
    activated_ms: Date.now(),
    expires_ms: Date.now() + 30 * 24 * 3600 * 1000,
    price_usd: t.price_usd,
    calls_per_day: t.calls_per_day,
  };
  _subLedger.set(did, record);

  // Emit Spectral receipt for subscription activation.
  await emitSpectralReceipt({
    event_type: 'subscription_activated',
    did, amount_usd: t.price_usd, tool_name: 'subscription',
    tx_hash: tx_hash || null,
    metadata: { tier, service: 'Hive ZK Attestation', expires_ms: record.expires_ms },
  });

  return res.json({
    ok: true,
    subscription: record,
    receipt_emitted: true,
    partner_attribution: 'ZK attestation on Aleo snarkVM — partners with Aleo, Varuna circuit providers',
    brand: '#C08D23',
    note: 'Subscription active for 30 days. Spectral receipt issued to hive-receipt.',
  });
});

// GET /v1/subscription/:did — check subscription status
app.get('/v1/subscription/:did', (req, res) => {
  const record = _subLedger.get(req.params.did);
  if (!record) {
    return res.status(404).json({ active: false, did: req.params.did });
  }
  const active = Date.now() < record.expires_ms;
  return res.json({ active, ...record });
});

// POST /v1/subscription/verify — lightweight verification (no charge)
app.post('/v1/subscription/verify', (req, res) => {
  const { did } = req.body || {};
  const record = _subLedger.get(did);
  const active = record && Date.now() < record.expires_ms;
  return res.json({
    active: !!active,
    did: did || null,
    tier: record?.tier || null,
    expires_ms: record?.expires_ms || null,
    brand: '#C08D23',
  });
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`hive-mcp-zk-attestation MCP server running on :${PORT}`);
  console.log(`  Backend     : ${HIVE_BASE}`);
  console.log(`  Backend st. : pending (RFC-stage)`);
  console.log(`  Tools       : ${TOOLS.length}`);
});
