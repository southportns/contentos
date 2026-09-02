/**
 * P0.2.3 — Knowledge Retrieval CLI Test
 *
 * Tests the Knowledge Store with predefined topics.
 * Run: npx tsx scripts/test-knowledge-retrieval.ts
 */

import { knowledgeStore } from '../src/knowledge';

const TEST_TOPICS = [
  '爱自己',
  '职场边界',
  '女性成长',
  '被爱',
  '自我价值',
];

function separator(): string {
  return '─'.repeat(60);
}

function printHeader(text: string): void {
  console.log(`\n${separator()}`);
  console.log(`  ${text}`);
  console.log(separator());
}

function printResult(
  index: number,
  result: {
    knowledge_id: string;
    score: number;
    matched_terms: string[];
    knowledge_level: string;
    category: string;
    confidence: string;
    status: string;
    retrieval_reason: string;
  },
  name: string
): void {
  console.log(
    `  ${index}. ${result.knowledge_id} — ${name}`
  );
  console.log(
    `     score: ${result.score.toFixed(2)} | level: ${result.knowledge_level} | category: ${result.category}`
  );
  console.log(
    `     confidence: ${result.confidence} | status: ${result.status}`
  );
  if (result.matched_terms.length > 0) {
    console.log(`     matched: [${result.matched_terms.join(', ')}]`);
  }
  console.log(`     reason: ${result.retrieval_reason}`);
}

function runTopicTest(topic: string): void {
  printHeader(`Query: ${topic}`);

  const response = knowledgeStore.search({
    topic,
    limit: 5,
  });

  if (response.total === 0) {
    console.log('  (no results)');
    return;
  }

  console.log(`  Total results: ${response.total}`);
  console.log('');

  response.results.forEach((result, index) => {
    const ku = knowledgeStore.getById(result.knowledge_id);
    const name = ku?.name ?? 'Unknown';
    printResult(index + 1, result, name);
  });
}

function runAllTests(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  P0.2.3 — Knowledge Retrieval CLI Test                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Print store stats
  printHeader('Store Statistics');
  console.log(`  Total KUs: ${knowledgeStore.size}`);
  console.log(`  Validated: ${knowledgeStore.getValidated().length}`);
  console.log(`  Candidates: ${knowledgeStore.getCandidates().length}`);

  // Run topic tests
  for (const topic of TEST_TOPICS) {
    runTopicTest(topic);
  }

  // Run edge case tests
  printHeader('Edge Case: Empty Query');
  const emptyResult = knowledgeStore.search({ topic: '', limit: 5 });
  console.log(`  Results for empty topic: ${emptyResult.total}`);

  printHeader('Edge Case: Irrelevant Query');
  const irrelevantResult = knowledgeStore.search({
    topic: '量子物理集成电路',
    limit: 5,
  });
  console.log(`  Results for irrelevant topic: ${irrelevantResult.total}`);

  // Include candidates test
  printHeader('Test: include_candidates=true with topic "爱自己"');
  const candidateResult = knowledgeStore.search({
    topic: '爱自己',
    include_candidates: true,
    limit: 8,
  });
  console.log(
    `  Results including candidates: ${candidateResult.total}`
  );
  candidateResult.results.forEach((result, index) => {
    const ku = knowledgeStore.getById(result.knowledge_id);
    const name = ku?.name ?? 'Unknown';
    console.log(
      `  ${index + 1}. ${result.knowledge_id} — ${name} (${result.status})`
    );
  });

  console.log(`\n${separator()}`);
  console.log('  Test Complete');
  console.log(`${separator()}\n`);
}

runAllTests();
