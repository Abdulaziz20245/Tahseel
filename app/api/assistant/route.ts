// The only server code (Claude.md §9.6): forwards a question plus the client's scenario snapshot to
// Gemini. The API key stays on the server and is never logged.

import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const MAX_BODY = 30 * 1024;
const MAX_QUESTION = 500;
const MAX_HISTORY = 6;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Best-effort per-IP limit. In-memory, so it is per server instance (resets on restart / per serverless instance).
const hits = new Map<string, number[]>();

const SYSTEM_INSTRUCTION = `You are Tahseel AI, the assistant of a concept prototype for a Saudi government invoice-settlement network.
Rules:
- Answer in English, in at most 120 words.
- Use only the scenario snapshot provided. Quote SAR figures exactly as they appear there.
- If the answer is not in the snapshot, say that you do not have that information.
- When the perspective is a company, you only know that company's own data. Never reveal or guess other companies' amounts, hub payments or schedules; counterparty names on its own invoices are fine. If asked about another company, say it is not in your data.
- This is a synthetic demo; do not present figures as real-world facts.`;

type Msg = { role: "user" | "assistant"; text: string };

function bad(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return bad(400, "Request too large.");

  let body: { question?: unknown; perspective?: unknown; history?: unknown; snapshot?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return bad(400, "Invalid JSON.");
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) return bad(400, `The question must be 1–${MAX_QUESTION} characters.`);
  const history: Msg[] = Array.isArray(body.history) ? (body.history as Msg[]).slice(-MAX_HISTORY) : [];
  if (Array.isArray(body.history) && body.history.length > MAX_HISTORY) return bad(400, "Too much history.");
  if (typeof body.snapshot !== "object" || body.snapshot === null) return bad(400, "Missing scenario snapshot.");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return bad(503, "unavailable");

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return bad(429, "Too many questions — please wait a few minutes.");
  hits.set(ip, [...recent, now]);

  const transcript = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text.slice(0, 1000)}`)
    .join("\n");
  const prompt = [
    `Perspective: ${String(body.perspective ?? "government")}`,
    `Scenario snapshot (JSON):\n${JSON.stringify(body.snapshot)}`,
    transcript ? `Conversation so far:\n${transcript}` : "",
    `Question: ${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION, maxOutputTokens: 400, temperature: 0.2 },
    });
    const answer = res.text?.trim();
    if (!answer) return bad(502, "unavailable");
    return Response.json({ answer });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 429) return bad(429, "The AI service is busy — please try again shortly.");
    console.error("assistant: Gemini call failed", status ?? "", (err as Error).message?.slice(0, 200));
    return bad(503, "unavailable");
  }
}
