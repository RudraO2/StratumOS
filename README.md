# Stratum Web — the demoable version

> **Okay, this is a demoable version.** A Windows-style workstation in your browser, with Stratum running
> inside it. Questions are answered over a **fixed sample library of eight coal documents** that were
> already read and extracted, and the wording comes from **hosted open-weight models through the Groq API**
> (GPT-OSS-20B for text, Qwen3.8-27B for page images): the only way a public link can answer.
>
> **The real product ([RudraO2/Stratum](https://github.com/RudraO2/Stratum)) runs on the officer's own machine** — local models (Qwen3-4B, Qwen3-VL-2B) on a 4 GB
> GPU, nothing leaves it, and any document dropped in is parsed, checked and added. Here the library is
> fixed and adding a document is **not** simulated.

Smart India Hackathon 2026 · CMPDI / Coal India Limited. Stratum reads coal documents (reports,
statistics, past Parliament replies, scanned directories) into cited facts, and answers, drafts and
reports from them. The second SIH submission, after Faraday.

## What is here

- **A simulated workstation** in React (window manager, taskbar, start menu, a virtual filesystem, File
  Explorer, Notepad, a PowerShell-shaped Terminal, a Browser whose tabs are real iframes, Settings with
  light and dark themes). The eight sample documents are real files under `Documents\Library`; open one
  and it shows in the Browser window.
- **Stratum, as an app in it**: Ask, PQ reply, Report and Topics, each a card with tables, citation
  chips that open the source page, the number-guard verdict and, for PQ replies and reports, a real
  `.docx` written to `Documents\Deliverables`. The routing chip shows the task type the router picked
  and why; the egress monitor shows the seal.
- **The Library window**: documents, the 148 facts read from them with their verification status and a
  per-fact lineage (document, page, the cell text, the unit conversion, the checks), topics, and the
  backend's measured metrics.
- **Ready-made prompts** under the composer, each run against the library before it was listed:
  subsidiary-wise production, year-on-year change, target vs achievement, a "why" question, Hindi and
  Hinglish, an unanswerable one (shows the refusal), a full PQ with the past-reply mismatch warning,
  each report template, topics, a scanned page read by the vision model, and an attempt to reach the
  internet that the seal refuses.

## How it stays honest

- **The LLM maps, the code extracts.** Every figure is a fact read from a cited cell and looked up by a
  parameterised query; the model never writes SQL and never supplies a figure. Tables and report
  narratives are stated by templates. The model writes prose only for a single figure, a "why" question,
  or a PQ part with no metric.
- **The number guard** rejects any number in generated text that is not in the evidence (Devanagari
  digits normalised first); when the model's wording fails it, the template's wording replaces it and the
  card says so.
- **`src/stratum/engine/`** is a TypeScript port of the Python backend's deterministic logic (domain rules,
  intent parsing, canonical facts, the guard, Ask, the PQ builder, the report engine) running over an
  exported snapshot of the library (`src/stratum/data/library.json`). It has tests, including the gold
  questions the backend was measured on.
- **Lanes, not tool choice.** As in the product, the router's task type picks the tool and the lane calls
  it from the officer's own words; the model is not asked to choose. In chat, the model may call
  `browser_open` (the demo's one outward tool), and the seal refuses it while closed.

## The seal, in this build

With the seal closed, an outbound tool call is refused before it runs, counted and recorded; with it
open, the call really leaves the page. It does **not** govern the model plane: every prompt goes to the
Groq API, and the header pill, the drawer and the answer footers say so.

## Run it

```sh
cp .env.example .env      # paste GROQ_API_KEY (and GEMINI_API_KEY for the fallback)
npm install
npm run dev               # http://localhost:5173 — api/turn.ts is served by a dev middleware
npm run test:engine       # the engine: domain, guard, ask, PQ, reports, the gold questions
```

Deploy: Vercel, from `main`. Set `GROQ_API_KEY` (and optionally `GEMINI_API_KEY` and the `STRATUM_*`
names in `.env.example`) under the project's environment variables. `api/turn.ts` is the only server
piece and the key never reaches the browser bundle.

## Cut, said out loud

Ingestion (Docling parsing, table mapping, the extractor, the review queue), the embedding model (search
here is BM25 over the library's 27 passages), the local model stack, and time-reduction trials (not
measured anywhere yet). The fixed sample library stands in for all of it.

## Credits

Built on the simulated-workstation shell of [AirgappedOS](https://github.com/RudraO2/AirgappedOS), the
demoable version of Faraday. Fonts: Geist and Geist Mono (OFL-1.1). The sample documents are synthetic,
stamped "SAMPLE", with figures that approximate published data; no real CMPDI or Ministry document is included.
