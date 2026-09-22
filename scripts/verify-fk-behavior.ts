import Database from 'better-sqlite3';

const db = new Database('D:/contentos-data/dev.db');
db.pragma('foreign_keys = ON');

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ ${name}: ${msg}`);
    testsFailed++;
  }
}

console.log('=== P0.4.8.1 Foreign Key Behavior Tests ===\n');

// Setup: Create test data
console.log('--- Setup ---');
const now = new Date().toISOString();
db.prepare("INSERT INTO Project (id, name, userId, updatedAt) VALUES (?, ?, ?, ?)").run('proj_test', 'Test Project', 'default', now);
console.log('  Created Project: proj_test');

const topicId = 'topic_test_fk';
db.prepare("INSERT INTO Topic (id, projectId, topic, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(topicId, 'proj_test', 'Test Topic FK', 'DRAFT', now, now);
console.log('  Created Topic: topic_test_fk');

const draftId = 'draft_test_fk';
db.prepare("INSERT INTO Draft (id, topicId, version, content, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(draftId, topicId, 1, 'Test content', 'DRAFT', now, now);
console.log('  Created Draft: draft_test_fk');

// Test A: Valid Reference
console.log('\n--- Test A: Valid Reference ---');
test('Setting activeDraftId to existing Draft.id should succeed', () => {
  db.prepare("UPDATE Topic SET activeDraftId = ? WHERE id = ?").run(draftId, topicId);
});

test('Topic.activeDraftId should equal the draft ID', () => {
  const row = db.prepare("SELECT activeDraftId FROM Topic WHERE id = ?").get(topicId) as { activeDraftId: string };
  if (row.activeDraftId !== draftId) throw new Error(`Expected ${draftId}, got ${row.activeDraftId}`);
});

// Test B: Invalid Reference
console.log('\n--- Test B: Invalid Reference ---');
test('Setting activeDraftId to non-existent Draft should fail with FK error', () => {
  let errorMsg = '';
  try {
    db.prepare("UPDATE Topic SET activeDraftId = ? WHERE id = ?").run('nonexistent_draft_id', topicId);
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }
  if (!errorMsg.includes('FOREIGN KEY')) {
    throw new Error(`Expected FK constraint error, got: ${errorMsg || 'no error'}`);
  }
});

// Test C: Unique - one draft can't be active for two topics
console.log('\n--- Test C: Unique Constraint ---');
test('Two topics cannot have the same activeDraftId', () => {
  const topicId2 = 'topic_test_fk_2';
  db.prepare("INSERT INTO Topic (id, projectId, topic, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(topicId2, 'proj_test', 'Test Topic FK 2', 'DRAFT', now, now);
  
  let errorMsg = '';
  try {
    db.prepare("UPDATE Topic SET activeDraftId = ? WHERE id = ?").run(draftId, topicId2);
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }
  if (!errorMsg.includes('UNIQUE') && !errorMsg.includes('unique') && !errorMsg.includes('constraint')) {
    throw new Error(`Expected unique constraint error, got: ${errorMsg || 'no error'}`);
  }
  
  // Cleanup
  db.prepare("DELETE FROM Topic WHERE id = ?").run(topicId2);
});

// Test D: SetNull - deleting active draft should set Topic.activeDraftId to NULL
console.log('\n--- Test D: SetNull on Delete ---');
test('Topic.activeDraftId should reference the draft before delete', () => {
  const row = db.prepare("SELECT activeDraftId FROM Topic WHERE id = ?").get(topicId) as { activeDraftId: string };
  if (row.activeDraftId !== draftId) throw new Error(`Expected ${draftId}, got ${row.activeDraftId}`);
});

test('Deleting the active draft should set Topic.activeDraftId to NULL', () => {
  db.prepare("DELETE FROM Draft WHERE id = ?").run(draftId);
  
  const row = db.prepare("SELECT activeDraftId FROM Topic WHERE id = ?").get(topicId) as { activeDraftId: string | null };
  if (row.activeDraftId !== null) throw new Error(`Expected NULL, got ${row.activeDraftId}`);
});

// Test E: Verify FK enforcement is ON
console.log('\n--- Test E: FK Enforcement Status ---');
test('PRAGMA foreign_keys query should return 1', () => {
  const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
  if (row.foreign_keys !== 1) throw new Error(`Expected 1, got ${row.foreign_keys}`);
});

// Test F: Verify Orphaned Data Cannot Exist
console.log('\n--- Test F: Orphan Prevention ---');
test('Inserting Topic with non-existent activeDraftId should fail', () => {
  let errorMsg = '';
  try {
    db.prepare("INSERT INTO Topic (id, projectId, topic, status, createdAt, updatedAt, activeDraftId) VALUES (?, ?, ?, ?, ?, ?, ?)").run('topic_orphan', 'proj_test', 'Orphan Topic', 'DRAFT', now, now, 'no_such_draft');
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }
  if (!errorMsg.includes('FOREIGN KEY')) {
    throw new Error(`Expected FK error, got: ${errorMsg || 'no error'}`);
  }
});

// Test G: FK structure verification
console.log('\n--- Test G: FK Structure ---');
test('Topic should have activeDraftId FK to Draft.id', () => {
  const fkList = db.prepare("PRAGMA foreign_key_list('Topic')").all() as { id: number; table: string; from: string; to: string }[];
  const activeFk = fkList.find(fk => fk.table === 'Draft' && fk.from === 'activeDraftId');
  if (!activeFk) throw new Error('Missing FK: activeDraftId -> Draft.id');
  if (activeFk.to !== 'id') throw new Error(`FK references wrong column: ${activeFk.to}`);
});

test('Topic should have unique index on activeDraftId', () => {
  const indexList = db.prepare("PRAGMA index_list('Topic')").all() as { name: string; unique: number }[];
  const uniqueIdx = indexList.find(idx => idx.name === 'Topic_activeDraftId_key');
  if (!uniqueIdx) throw new Error('Missing unique index: Topic_activeDraftId_key');
  if (uniqueIdx.unique !== 1) throw new Error('Index is not unique');
});

// Test H: Fallback - after SetNull, can reassign new activeDraft
console.log('\n--- Test H: Fallback After SetNull ---');
test('After deleting active draft (SetNull), Topic can get new activeDraft', () => {
  const draftId2 = 'draft_test_fk_2';
  const now2 = new Date().toISOString();
  db.prepare("INSERT INTO Draft (id, topicId, version, content, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(draftId2, topicId, 2, 'Test content v2', 'DRAFT', now2, now2);
  
  db.prepare("UPDATE Topic SET activeDraftId = ? WHERE id = ?").run(draftId2, topicId);
  
  const row = db.prepare("SELECT activeDraftId FROM Topic WHERE id = ?").get(topicId) as { activeDraftId: string };
  if (row.activeDraftId !== draftId2) throw new Error(`Expected ${draftId2}, got ${row.activeDraftId}`);
  
  db.prepare("DELETE FROM Draft WHERE id = ?").run(draftId2);
});

// Cleanup
console.log('\n--- Cleanup ---');
db.prepare("DELETE FROM Topic WHERE id = ?").run(topicId);
db.prepare("DELETE FROM Project WHERE id = ?").run('proj_test');
db.prepare("DELETE FROM Draft WHERE topicId = ?").run(topicId);
console.log('  Cleaned up test data');

db.close();

console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
if (testsFailed > 0) {
  process.exit(1);
}
