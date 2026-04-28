"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type OwnerAssistantProperty = {
  id: string;
  address: string;
};

type OwnerAssistantCardProps = {
  properties: OwnerAssistantProperty[];
  title?: string;
  subtitle?: string;
  defaultPropertyId?: string;
  compact?: boolean;
};

export default function OwnerAssistantCard({
  properties,
  title = "Owner Assistant (AI)",
  subtitle = "Ask questions about your property and financials.",
  defaultPropertyId,
  compact = false,
}: OwnerAssistantCardProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(defaultPropertyId || properties[0]?.id || "");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    if (!properties.length) {
      setSelectedPropertyId("");
      return;
    }
    if (defaultPropertyId && properties.some((property) => property.id === defaultPropertyId)) {
      setSelectedPropertyId(defaultPropertyId);
      return;
    }
    if (!properties.some((property) => property.id === selectedPropertyId)) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [defaultPropertyId, properties, selectedPropertyId]);

  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) || null;

  const handleChatSend = async () => {
    if (!chatInput.trim() || !selectedPropertyId) return;

    const userMessage = { role: "user" as const, content: chatInput.trim() };
    const systemContext = `
You are the Luxor Owner Assistant. Be concise.
Answer only for the selected property (${selectedProperty?.address || "Unknown"}). If unsure, ask for clarification.
Use the provided property and document context from the server; do not guess.`;

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...chatMessages, userMessage],
          systemPrompt: systemContext,
          propertyId: selectedPropertyId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Chat request failed");
      }
      const assistantMessage = {
        role: "assistant" as const,
        content: data.content || "Sorry, I didn't get that.",
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setChatError(err.message || "Chat failed");
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-5 md:p-6 border-b border-slate-200 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1f2937] via-[#0f172a] to-[#1e293b] flex items-center justify-center overflow-hidden shadow-sm">
            <Image src="/luxor-ai.png" alt="Luxor AI" width={52} height={52} className="object-contain mix-blend-lighten opacity-90" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600">{subtitle}</p>
          </div>
        </div>
        {properties.length > 0 && (
          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="w-full md:w-80 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.address}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="p-4 md:p-5 space-y-3">
        <div className={`${compact ? "max-h-52" : "max-h-64"} overflow-y-auto border border-slate-200 rounded-md p-3 bg-slate-50`}>
          {chatMessages.length === 0 ? (
            <p className="text-sm text-slate-500">Ask a question to get started.</p>
          ) : (
            chatMessages.map((message, idx) => (
              <div key={idx} className={`mb-2 ${message.role === "user" ? "text-slate-900" : "text-slate-800"}`}>
                <span className="font-semibold text-xs uppercase mr-2">{message.role === "user" ? "You" : "Assistant"}</span>
                <span className="text-sm">{message.content}</span>
              </div>
            ))
          )}
        </div>
        {chatError && <p className="text-sm text-red-600">{chatError}</p>}
        <div className="flex flex-col md:flex-row gap-2 md:items-start">
          <textarea
            className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            rows={compact ? 2 : 3}
            placeholder="Ask about lease dates, tenant payments, expenses, or maintenance."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button
            onClick={handleChatSend}
            disabled={chatLoading || !selectedPropertyId}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 shadow-sm h-fit"
          >
            {chatLoading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
