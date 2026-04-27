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

app.listen(PORT, () => {
  console.log(`hive-mcp-zk-attestation MCP server running on :${PORT}`);
  console.log(`  Backend     : ${HIVE_BASE}`);
  console.log(`  Backend st. : pending (RFC-stage)`);
  console.log(`  Tools       : ${TOOLS.length}`);
});
