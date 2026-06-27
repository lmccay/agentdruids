# In-Session Retrieval (RAG) — using the corpus inside a Druid session

**Status:** Design
**Builds on:** `docling-integration-evaluation.md`, `operator-ingestion-flow.md`, `phase-b-embeddings.md`, `realm-grounded-assessment.md`, Layer 1 (PR #31)
**Scope:** How an ingested corpus *informs* a Druid's reasoning within a collaboration session — not just passive search. Establishes that retrieval can inform sessions **without** vectorization (lexical RAG), why high-level questions still want semantic, and how to sequence so the two land without re-plumbing.

## The core claim

**RAG is retriever-agnostic.** "Use the corpus to inform the answer" = *retrieve relevant passages → put them in the prompt → generate.* That works with any retriever. A keyword/FTS retriever can already feed a Druid's reasoning ("lexical RAG"). **Vectorization is not a prerequisite for in-session use** — it is a *quality upgrade* for a specific query class (below).

## What actually has to exist (none of it is vectors)

1. **A retrieval → injection step wired into the session.** Today `search_documents` / `read_document` exist as REST + the *external* MCP surface (for clients like Goose). For an *internal* Druid to use them mid-session they must be either:
   - **(a) an agent tool** the Druid can call in its agentic loop (today's built-in agent tools are file/URL only — CLAUDE.md §8 — so WorldTree retrieval is not yet an agent tool), or
   - **(b) automatic** — the coordinator retrieves scoped context before planning and injects it (this is Phase C, "retrieval-augmented coordination").

   Either way it's **Phase-C plumbing, not embeddings**.
2. **Chunking.** Injecting a whole document is crude (blows context, drowns relevance). Good RAG injects passage-sized **chunks** — the Docling `HybridChunker`. Chunking is the shared prerequisite for *either* lexical or semantic RAG; lexical search runs over chunk text with no embeddings.
3. **Scoping.** Retrieval scoped to the session's realms (`global ∪ traversed`) — the realm/scope model.

## Two modes of in-session retrieval

- **Agentic tool-use RAG.** The Druid *decides* to call a retrieval tool when it needs information, reads the results, continues. Closest to "works soon" — needs only the retrieval tool wired into the in-session agent. The model controls when to retrieve.
- **Automatic retrieval-augmented coordination (Phase C).** The coordinator auto-retrieves scoped context before/within planning and injects it. More systematic, better recall, no reliance on the model remembering to look.

Both are available **without** vectors.

## Where lexical breaks — and why it's the use case that wants semantic

Lexical matches *terms*, not *meaning*. A high-level question ("what are the trade-offs of approach X?") often shares **no keywords** with the passage that answers it ("Y degrades under Z load"). Vocabulary mismatch, synonymy, paraphrase, and abstraction — the hallmarks of *higher-level questions* — are exactly where keyword search misses and **semantic retrieval wins**. So:

- Lexical-RAG-in-session is a real, useful capability and the right way to **build and prove the injection plumbing**.
- But for *informing a high-level conceptual question* — the primary goal — **semantic is the difference between "sometimes finds it" and "reliably surfaces the relevant passage."** Not a prerequisite to start; the quality unlock for that query class.

## The decoupling that makes sequencing painless

Retrieval and injection are **separate concerns**. Build the injection step **once**; swap the retriever underneath (lexical → semantic) via the pluggable `VectorStore` / `EmbeddingProvider` from `phase-b-embeddings.md`. The sequence:

> chunk (Docling) → **lexical** retrieval + injection (Phase-C-lite) → *prove the corpus informs sessions* → add embeddings (Phase B) underneath → high-level questions get good — **no re-plumbing.**

Semantic RAG end state, concretely: the Druid embeds the question → semantic-searches the scoped corpus → injects the top chunks **with citations** into its reasoning prompt → answers grounded in them.

## Reinforcement with the support gate

The injected, cited chunks are exactly the **per-claim evidence** the realm-grounded support gate consumes (`session_claim_evidence` in `realm-grounded-assessment.md`). So retrieval-injection and grounding-assessment are the same data viewed twice: what the model *used* is what the gate *checks*. Building retrieval injection also lays the capture path the support gate needs.

## Recommended build sequence

1. **Chunking** — run Docling's `HybridChunker` over ingested documents into the unified `worldtree_chunks` (the Phase B chunk layer), no embeddings yet.
2. **Lexical retrieval + injection (Phase-C-lite)** — a scoped chunk search exposed as an in-session agent tool (and/or coordinator auto-injection), feeding top chunks into the Druid prompt. This makes the corpus *inform* responses and de-risks the plumbing.
3. **Embeddings (Phase B)** — populate `chunk_embeddings` via the `EmbeddingProvider`; retrieval swaps to semantic via the `VectorStore` seam. High-level questions improve; injection code unchanged.
4. **Citations + support gate** — record which chunks informed which claims; feed the support gate.

Do **not** gate in-session use on vectors. But since the primary goal is high-level conceptual Q&A, treat lexical-RAG as scaffolding to validate the pipeline and plan to reach semantic soon — that is where this use case actually lands.

## Open questions

- **Tool-use vs automatic** as the first injection mode — agent-decides (simpler, less reliable recall) or coordinator-auto (systematic, more plumbing)?
- **Context budget** — how many chunks to inject, and how to rank/truncate under the model's context window.
- **Cross-source retrieval** — documents and session contributions share `worldtree_chunks`; do in-session queries retrieve across both, or documents only, by default?
- **When to retrieve** in the coordination lifecycle — once at planning, per delegation, or per claim.
