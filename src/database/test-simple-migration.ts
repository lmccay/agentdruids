import { DatabaseService } from '../services/DatabaseService';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Simple migration test runner
 */
async function runSimpleMigration(): Promise<void> {
  console.log('🚀 Starting simplified database migration...');

  try {
    const db = DatabaseService.getInstance();
    await db.connect();

    // Run the simple migration
    const migrationPath = join(process.cwd(), 'src/database/migration-simple.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Executing simplified migration...');
    const result = await db.query(migrationSql);
    
    console.log('✅ Migration completed successfully');
    
    // Show results
    if (result.rows && result.rows.length > 0) {
      console.log('📈 Final database statistics:');
      result.rows.forEach(row => {
        console.log(`  - ${row['table_name']}: ${row['row_count']} rows`);
      });
    }

    await db.close();
    console.log('🎉 Simple migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run the migration
runSimpleMigration()
  .then(() => {
    console.log('Simple migration test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Simple migration test failed:', error);
    process.exit(1);
  });