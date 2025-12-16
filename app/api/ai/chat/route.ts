import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getAccessiblePropertyIds,
  getAuthContext,
  isAdmin,
  type UserRole,
} from "@/lib/auth/route-helpers";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_TEXT_SNIPPET = 2_000;

const isTextLike = (url: string) =>
  [".txt", ".md", ".csv", ".json", ".log"].some((ext) => url.toLowerCase().includes(ext));

async function fetchTextPreview(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_TEXT_SNIPPET);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const { messages = [], systemPrompt, propertyId } = body || {};

    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!propertyId && !isAdmin(role)) {
      return NextResponse.json({ error: "Property is required" }, { status: 400 });
    }

    // Enforce property access
    let propertyFilterId = propertyId as string | undefined;
    if (!isAdmin(role)) {
      const allowed = await getAccessiblePropertyIds(user.id, role);
      if (!propertyFilterId) propertyFilterId = allowed[0];
      if (!propertyFilterId || !allowed.includes(propertyFilterId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const visibilityFilter =
      role === "tenant"
        ? ["tenant", "all"]
        : role === "owner"
          ? ["owner", "all"]
          : ["admin", "owner", "tenant", "all"];

    // Pull property details
    const { data: property } = propertyFilterId
      ? await supabaseAdmin
          .from("properties")
          .select("id, address, lease_start, lease_end, target_monthly_rent, deposit")
          .eq("id", propertyFilterId)
          .single()
      : { data: null };

    // Pull documents scoped to property + visibility
    const { data: docs } = propertyFilterId
      ? await supabaseAdmin
          .from("property_documents")
          .select("id, title, file_url, visibility, name")
          .eq("property_id", propertyFilterId)
          .in("visibility", visibilityFilter)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };

    const docPreviews: { title: string; visibility: string; snippet?: string; file_url: string }[] = [];
    for (const doc of docs || []) {
      if (doc.file_url && isTextLike(doc.file_url)) {
        const snippet = await fetchTextPreview(doc.file_url);
        if (snippet) {
          docPreviews.push({
            title: doc.title || doc.name || "Document",
            visibility: doc.visibility,
            snippet,
            file_url: doc.file_url,
          });
          continue;
        }
      }
      docPreviews.push({
        title: doc.title || doc.name || "Document",
        visibility: doc.visibility,
        file_url: doc.file_url,
      });
    }

    const propertyContext = property
      ? `Property: ${property.address || property.id}.
Lease start: ${property.lease_start || "n/a"}; Lease end: ${property.lease_end || "n/a"}.
Target rent: ${property.target_monthly_rent ?? "n/a"}; Deposit: ${property.deposit ?? "n/a"}.`
      : "Property context unavailable.";

    const docsContext =
      (docPreviews || []).length === 0
        ? "No scoped documents found for this property."
        : docPreviews
            .map((d, idx) => {
              const base = `${idx + 1}. ${d.title} (visibility: ${d.visibility})`;
              return d.snippet
                ? `${base}\nSnippet:\n${d.snippet}`
                : `${base}\nURL: ${d.file_url}`;
            })
            .join("\n\n");

    const scopedSystemPrompt =
      systemPrompt ||
      `You are the Luxor Assistant. Answer only using the scoped property context and documents provided.
If lease dates are asked, prefer the lease_start/lease_end fields. If unknown, state that the info is not available.
Do not answer about any other properties or documents.`;

    const payload = {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: scopedSystemPrompt },
        {
          role: "system",
          content: `Scoped property context:\n${propertyContext}\n\nDocuments for this property:\n${docsContext}`,
        },
        ...messages,
      ],
      temperature: 0.2,
      max_tokens: 500,
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("OpenAI error", res.status, errorText);
      return NextResponse.json({ error: "Upstream model error" }, { status: 502 });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Error in /api/ai/chat:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
