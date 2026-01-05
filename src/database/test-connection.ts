import { DatabaseService } from '../services/DatabaseService';

/**
 * Simple test to check database connectivity and existing data
 */
async function testDatabaseConnection(): Promise<void> {
  console.log('🔍 Testing database connection and existing data...');

  try {
    const db = DatabaseService.getInstance();
    
    // Test connection
    console.log('📡 Testing database connectivity...');
    const health = await db.healthCheck();
    console.log('Database health:', health);

    // Test existing agents table
    console.log('\n📊 Checking existing agents...');
    const agentsResult = await db.query('SELECT id, name, type, status FROM druids_core.agents');
    console.log(`Found ${agentsResult.rows.length} agents:`);
    agentsResult.rows.forEach(agent => {
      console.log(`  - ${agent.name} (${agent.type}) [${agent.status}]`);
    });

    // Test existing realms table
    console.log('\n🏰 Checking existing realms...');
    const realmsResult = await db.query('SELECT id, name, description, security_level FROM druids_core.realms');
    console.log(`Found ${realmsResult.rows.length} realms:`);
    realmsResult.rows.forEach(realm => {
      console.log(`  - ${realm.name}: ${realm.description || 'No description'} [${realm.security_level}]`);
    });

    // Test creating a simple test entry
    console.log('\n✏️ Testing database write operations...');
    const testResult = await db.query(`
      INSERT INTO druids_core.agents (id, name, type, status, configuration) 
      VALUES ($1, $2, $3, $4, $5) 
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, name, type, status
    `, [
      'test-db-agent-' + Date.now(),
      'Database Test Agent',
      'elemental',
      'active',
      JSON.stringify({ test: true, created: new Date().toISOString() })
    ]);
    
    console.log('✅ Successfully created/updated test agent:', testResult.rows[0]);

    await db.close();
    console.log('🎉 Database connection test completed successfully!');

  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    throw error;
  }
}

// Run the test if called directly
if (require.main === module) {
  testDatabaseConnection()
    .then(() => {
      console.log('Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

export { testDatabaseConnection };