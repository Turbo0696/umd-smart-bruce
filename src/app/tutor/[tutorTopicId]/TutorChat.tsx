"use client";

import { useState } from "react";
import { sendMessage } from "./actions";

type Msg = { role: "USER" | "ASSISTANT"; content: string };

export function TutorChat({
  tutorTopicId,
  initialMessages,
}: {
  tutorTopicId: string;
  initialMessages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    setError(null);
    setMessages((m) => [...m, { role: "USER", content }]);
    setSending(true);

    try {
      const reply = await sendMessage(tutorTopicId, content);
      setMessages((m) => [...m, { role: "ASSISTANT", content: reply }]);
      setInput("");
    } catch (err) {
      // The user's message was already persisted server-side even if
      // the tutor call failed, so we leave the bubble above and just
      // restore the input text so they can retry without retyping.
      //
      // Server Action errors *do* reach the client with their real
      // message (unlike a page-render error, which Next.js redacts), so
      // show it — a generic "couldn't reach" for every kind of failure
      // (timeout vs. a real 4xx/5xx vs. something else) was exactly
      // what made this issue slow to diagnose.
      const detail = err instanceof Error && err.message ? err.message : null;
      setError(
        detail ??
          "Couldn't reach the tutor — your message was saved, try asking again.",
      );
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Ask a question to get started.
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <p
                className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "USER"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                {m.content}
              </p>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
              Thinking…
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={sending}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Send
        </button>
      </form>
    </div>
  );
}
