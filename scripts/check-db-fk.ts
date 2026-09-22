import Database from 'better-sqlite3';

const db = new Database('D:/contentos-data/dev.db');

console.log('=== PRAGMA foreign_keys ===');
console.log(db.pragma('foreign_keys'));

console.log('\n=== Topic Schema (PRAGMA table_info) ===');
const columns = db.prepare("PRAGMA table_info('Topic')").all() as Array<{ name: string; type: string; notnull: number; pk: number }>;
columns.forEach((col) => {
  console.log(`  ${col.name} ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PK' : ''}`);
});

console.log('\n=== Topic Foreign Keys (PRAGMA foreign_key_list) ===');
const fks = db.prepare("PRAGMA foreign_key_list('Topic')").all() as Array<{ id: number; seq: number; table: string; from: string; to: string; on_delete: string; on_update: string }>;
if (fks.length === 0) {
  console.log('  NO FOREIGN KEYS FOUND!');
} else {
  fks.forEach((fk) => {
    console.log(`  FK#${fk.id}: ${fk.from} → ${fk.table}.${fk.to} (onDelete: ${fk.on_delete})`);
  });
}

console.log('\n=== Topic Indexes (PRAGMA index_list) ===');
const indexes = db.prepare("PRAGMA index_list('Topic')").all() as Array<{ name: string; unique: number; origin: string }>;
indexes.forEach((idx) => {
  console.log(`  ${idx.name} (unique: ${idx.unique}, origin: ${idx.origin})`);
});

console.log('\n=== Draft Schema ===');
const draftCols = db.prepare("PRAGMA table_info('Draft')").all() as Array<{ name: string; type: string; pk: number }>;
draftCols.forEach((col) => {
  console.log(`  ${col.name} ${col.type} ${col.pk ? 'PK' : ''}`);
});

db.close();
