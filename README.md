# GVD Memory Hub — Retrieval Lab

This repository contains the retrieval and evidence checking core extracted from GVD Memory Hub, a shared project memory system for software agents. It demonstrates how the system merges candidate lists, ranks records, and checks whether a passage supports a price or a date before returning it.

Run the synthetic evaluation with Node.js 20 or later:

```sh
node --test
```

The tests use fictional projects and an in-memory adapter. No account, database, external API, or model download is required. The candidate adapter applies the project filter; the lab does not implement authentication or demonstrate production access enforcement. The embedding adapter returns deterministic test vectors, so these tests do not measure real model quality. The source heuristics currently target Portuguese queries.

The next step is to add an evaluation corpus with paraphrases, conflicting record versions, and questions with no supporting passage, then compare retrieval changes against that baseline.
