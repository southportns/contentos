import Database from 'better-sqlite3';
const db = new Database('D:/contentos-data/dev.db');

const topicCount = db.prepare("SELECT COUNT(*) as c FROM Topic").get() as { c: number };
const activeDraftCount = db.prepare("SELECT COUNT(*) as c FROM Topic WHERE activeDraftId IS NOT NULL").get() as { c: number };
const orphanedActive = db.prepare(`
  SELECT t.id, t.activeDraftId FROM Topic t
  LEFT JOIN Draft d ON t.activeDraftId = d.id
  WHERE t.activeDraftId IS NOT NULL AND d.id IS NULL
`).all();

console.log('Topic count:', topicCount.c);
console.log('Topics with activeDraftId:', activeDraftCount.c);
console.log('Orphaned activeDraftId references:', orphanedActive.length);
if (orphanedActive.length > 0) {
  console.log('Orphaned:', orphanedActive);
}

const draftCount = db.prepare("SELECT COUNT(*) as c FROM Draft").get() as { c: number };
console.log('Draft count:', draftCount.c);

db.close();
