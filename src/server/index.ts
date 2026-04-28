/**
 * Nexus Alpha Express + WebSocket Server
 * Provides:
 *  - REST API for pipeline triggers
 *  - WebSocket server on port 3001 for live build log streaming
 */

import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { runAutomatedPipeline } from "../services/pipelineService";
import type { PipelineExecution } from "../types";

const app = express();
app.use(express.json());

const PORT_HTTP = Number(process.env.PORT ?? 3000);
const PORT_WS   = Number(process.env.WS_PORT ?? 3001);

// ─── WebSocket Server ───────────────────────────────────────────────────────────
const wsServer = new WebSocketServer({ port: PORT_WS });

const clients = new Set<WebSocket>();

wsServer.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  ws.send(JSON.stringify({ type: "connected", message: "Nexus Alpha WS ready", ts: Date.now() }));

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    } catch {
      // ignore bad messages
    }
  });
});

function broadcast(data: unknown): void {
  const json = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// ─── REST API ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", wsClients: clients.size, ts: Date.now() });
});

/** POST /api/pipeline/run - trigger a pipeline and stream updates via WS */
app.post("/api/pipeline/run", async (req, res) => {
  const { repos, agentId } = req.body as { repos: string[]; agentId?: string };
  if (!Array.isArray(repos) || repos.length === 0) {
    return res.status(400).json({ error: "repos array required" });
  }

  let executionId = "";

  runAutomatedPipeline(repos, agentId, (exec: PipelineExecution) => {
    if (!executionId) executionId = exec.id;
    broadcast({ type: "pipeline_update", exec });
  });

  res.json({ started: true, executionId });
});

/** GET /api/pipeline/status - returns WS client count */
app.get("/api/pipeline/status", (_req, res) => {
  res.json({ wsClients: clients.size, ts: Date.now() });
});

// ─── Start ─────────────────────────────────────────────────────────────────────────
app.listen(PORT_HTTP, () => {
  console.log(`[HTTP] Nexus Alpha server running on port ${PORT_HTTP}`);
  console.log(`[WS]   WebSocket server running on port ${PORT_WS}`);
});

export { app, broadcast };
