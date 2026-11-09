import test from 'node:test';
import assert from 'node:assert/strict';
import { createSemanticSearch } from '../src/retrieval.mjs';

const records = [
  {
    id: 'lunar-note',
    project: 'lunar',
    version: 1,
    title: 'Plano da oficina lunar',
    semantic_score: 0.9,
    semantic_evidence: [{ content: 'A oficina lunar foi aprovada.' }],
  },
  {
    id: 'lunar-budget',
    project: 'lunar',
    version: 1,
    title: 'Orçamento da oficina lunar',
    semantic_score: 0.7,
    semantic_evidence: [{ content: 'O orçamento da oficina lunar é R$ 420.' }],
  },
  {
    id: 'marine-budget',
    project: 'marine',
    version: 1,
    title: 'Orçamento da oficina marinha',
    semantic_score: 0.98,
    semantic_evidence: [{ content: 'O orçamento da oficina marinha é R$ 630.' }],
  },
];

const search = createSemanticSearch({
  embed: async () => [1, 0],
  rpc: async (_unused, _operation, args) => ({
    items: records.filter(record => record.project === args.project_id),
    next_offset: null,
  }),
});

const budgetQuery = 'Qual orçamento da oficina?';

test('returns the supporting passage once, even when both candidate lists contain it', async () => {
  const result = await search(null, { project_id: 'lunar', query: budgetQuery });
  assert.deepEqual(result.items.map(item => item.id), ['lunar-budget']);
  assert.match(result.items[0].excerpt, /420/);
  assert.equal(result.semantic_validation.rejected_count, 1);
});

test('uses the requested project scope in the candidate adapter', async () => {
  const result = await search(null, { project_id: 'marine', query: budgetQuery });
  assert.deepEqual(result.items.map(item => item.id), ['marine-budget']);
});

test('returns no result when a date question has no supporting date', async () => {
  const result = await search(null, {
    project_id: 'lunar',
    query: 'Qual a data da oficina?',
  });
  assert.deepEqual(result.items, []);
  assert.equal(result.semantic_validation.rejected_count, 2);
});
