"use client";

// "Ask Tahseel AI" button and right-side panel (Claude.md §3.4, §9.6). Read-only: it never changes
// the scenario. The rest of the app does not depend on it.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { buildSnapshot, type Perspective } from "@/lib/snapshot";
import { useLedger, useMetrics, usePlan, useScenario } from "@/lib/ScenarioProvider";

type Msg = { role: "user" | "assistant"; text: string; error?: boolean };

const GOV_QUESTIONS = ["How many payments does Tahseel save at this step?", "Which companies pay the hub in the first round?", "Why was an invoice escalated?"];
const companyQuestions = (name: string) => [`How much does ${name} pay the hub?`, `Which of ${name}'s invoices are cleared by set-off?`, `When is ${name}'s next settlement?`];

export default function AssistantButton() {
  const { data, stepIndex, selectedCompanyId, assistantOpen, setAssistantOpen } = useScenario();
  const { ledger } = useLedger();
  const { plan, changedAt } = usePlan();
  const metrics = useMetrics();
  const pathname = usePathname();
  const [perspective, setPerspective] = useState<Perspective>("government");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  const companyName = data.companies.find((c) => c.id === perspective)?.name;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const history = messages.filter((m) => !m.error).slice(-6).map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const snapshot = buildSnapshot(perspective, data, stepIndex, ledger, plan, metrics, changedAt);
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.slice(0, 500), perspective, history, snapshot }),
      });
      const body = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (res.ok && body.answer) setMessages((m) => [...m, { role: "assistant", text: body.answer! }]);
      else {
        const text = res.status === 429 ? body.error ?? "Too many questions — please wait a few minutes." : res.status === 400 ? body.error ?? "That question could not be sent." : "Assistant unavailable right now.";
        setMessages((m) => [...m, { role: "assistant", text, error: true }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Assistant unavailable right now.", error: true }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = perspective === "government" ? GOV_QUESTIONS : companyQuestions(companyName ?? perspective);

  return (
    <>
      {!assistantOpen && (
        <button
          type="button"
          onClick={() => {
            // Default perspective: the selected company when opened from the Companies tab.
            const next = pathname === "/companies" ? (selectedCompanyId ?? data.companies[0].id) : "government";
            if (next !== perspective) {
              setPerspective(next);
              setMessages([]);
            }
            setAssistantOpen(true);
          }}
          className="fixed right-6 bottom-6 z-40 rounded-md border border-primary bg-canvas px-4 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          Ask Tahseel AI
        </button>
      )}
      {assistantOpen && (
        <aside aria-label="Tahseel AI assistant" className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-canvas shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold text-ink">Ask Tahseel AI</h2>
            <button type="button" onClick={() => setAssistantOpen(false)} className="rounded-md border border-line px-2 py-1 text-sm text-muted hover:text-ink">
              Close
            </button>
          </div>
          <div className="border-b border-line px-4 py-3">
            <label className="flex flex-col text-sm text-muted">
              Answer as
              <select
                value={perspective}
                onChange={(e) => {
                  setPerspective(e.target.value);
                  setMessages([]);
                }}
                className="mt-1 rounded-md border border-line bg-canvas px-2 py-1.5 text-ink"
              >
                <option value="government">Government view (full network)</option>
                {data.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (its own data only)
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {messages.length === 0 && (
              <div>
                <p className="text-muted">Try a question about the current step (event {stepIndex}):</p>
                <div className="mt-2 flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className="rounded-md border border-line px-3 py-2 text-left text-ink hover:border-accent">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-md px-3 py-2 whitespace-pre-wrap ${
                  m.role === "user" ? "self-end bg-primary text-white" : m.error ? "border border-warn text-warn" : "border border-line text-ink"
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && <p className="text-muted" role="status">Thinking…</p>}
          </div>
          <form
            className="border-t border-line px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder="Ask about the current scenario"
                aria-label="Your question"
                className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              />
              <button type="submit" disabled={loading || !input.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                Send
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">AI answers from the synthetic scenario; check figures on the dashboards.</p>
          </form>
        </aside>
      )}
    </>
  );
}
