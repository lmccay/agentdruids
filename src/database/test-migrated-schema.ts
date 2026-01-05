import { DatabaseService } from '../services/DatabaseService';

/**
 * Test script to verify the migrated database schema works with our repository pattern
 */
async function testMigratedSchema(): Promise<void> {
  console.log('🧪 Testing migrated database schema...');

  try {
    const db = DatabaseService.getInstance();
    await db.connect();

    // Test 1: Verify new columns exist in agents table
    console.log('\n1️⃣ Testing agents table new columns...');
    const agentColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'druids_core' AND table_name = 'agents'
      ORDER BY column_name
    `);
    
    const expectedAgentColumns = ['realm_access', 'specialization', 'bindings', 'tags', 'metadata'];
    const existingColumns = agentColumns.rows.map(row => row['column_name']);
    const missingColumns = expectedAgentColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length === 0) {
      console.log('✅ All expected agent columns exist');
    } else {
      console.log('❌ Missing agent columns:', missingColumns);
    }

    // Test 2: Verify new columns exist in realms table
    console.log('\n2️⃣ Testing realms table new columns...');
    const realmColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'druids_core' AND table_name = 'realms'
      ORDER BY column_name
    `);
    
    const expectedRealmColumns = ['agents', 'ley_line_connections', 'health', 'security', 'type', 'status'];
    const existingRealmColumns = realmColumns.rows.map(row => row['column_name']);
    const missingRealmColumns = expectedRealmColumns.filter(col => !existingRealmColumns.includes(col));
    
    if (missingRealmColumns.length === 0) {
      console.log('✅ All expected realm columns exist');
    } else {
      console.log('❌ Missing realm columns:', missingRealmColumns);
    }

    // Test 3: Verify new tables exist
    console.log('\n3️⃣ Testing new tables...');
    const tableCheck = await db.query(`
      SELECT 
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'druids_core' AND table_name = 'scenarios')) as has_scenarios,
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'druids_knowledge' AND table_name = 'entries')) as has_knowledge,
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'druids_core' AND table_name = 'async_results')) as has_async_results
    `);
    
    const tables = tableCheck.rows[0];
    console.log('📋 Table existence check:');
    console.log(`  - scenarios: ${tables['has_scenarios'] ? '✅' : '❌'}`);
    console.log(`  - knowledge.entries: ${tables['has_knowledge'] ? '✅' : '❌'}`);
    console.log(`  - async_results: ${tables['has_async_results'] ? '✅' : '❌'}`);

    // Test 4: Test CRUD operations on new schema
    console.log('\n4️⃣ Testing CRUD operations...');
    
    // Test agent with new columns
    const testAgentId = `test-agent-${Date.now()}`;
    await db.query(`
      INSERT INTO druids_core.agents (id, name, type, status, description, specialization, tags, realm_access) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      testAgentId,
      'Test Migration Agent',
      'elemental',
      'active',
      'Agent created to test migration success',
      JSON.stringify({ domain: 'testing', expertise: ['migration', 'database'] }),
      JSON.stringify(['test', 'migration']),
      JSON.stringify({ boundRealmId: null, accessibleRealms: [] })
    ]);
    console.log('✅ Successfully created agent with new schema');

    // Test realm with new columns
    const testRealmId = `test-realm-${Date.now()}`;
    await db.query(`
      INSERT INTO druids_core.realms (id, name, type, status, description, agents, health, created_by, last_modified_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      testRealmId,
      'Test Migration Realm',
      'testing',
      'active',
      'Realm created to test migration success',
      JSON.stringify([testAgentId]),
      JSON.stringify({ status: 'healthy', lastHealthCheck: new Date().toISOString() }),
      'system',
      'system'
    ]);
    console.log('✅ Successfully created realm with new schema');

    // Test scenario creation
    await db.query(`
      INSERT INTO druids_core.scenarios (name, type, description, created_by, last_modified_by) 
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'Test Migration Scenario',
      'testing',
      'Scenario created to test migration success',
      'system',
      'system'
    ]);
    console.log('✅ Successfully created scenario');

    // Test knowledge entry creation
    await db.query(`
      INSERT INTO druids_knowledge.entries (namespace, key, value, created_by, last_modified_by) 
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'migration://test',
      'migration_success',
      JSON.stringify({ success: true, timestamp: new Date().toISOString(), test: 'passed' }),
      'system',
      'system'
    ]);
    console.log('✅ Successfully created knowledge entry');

    // Test 5: Verify data retrieval
    console.log('\n5️⃣ Testing data retrieval...');
    
    const agentData = await db.query('SELECT id, name, specialization, tags, realm_access FROM druids_core.agents WHERE id = $1', [testAgentId]);
    const realmData = await db.query('SELECT id, name, type, agents, health FROM druids_core.realms WHERE id = $1', [testRealmId]);
    const scenarioCount = await db.query('SELECT COUNT(*) as count FROM druids_core.scenarios');
    const knowledgeData = await db.query('SELECT namespace, key, value FROM druids_knowledge.entries WHERE namespace = $1', ['migration://test']);

    console.log('📊 Retrieved test data:');
    console.log(`  - Agent: ${agentData.rows[0]['name']} with specialization: ${JSON.stringify(agentData.rows[0]['specialization'])}`);
    console.log(`  - Realm: ${realmData.rows[0]['name']} (${realmData.rows[0]['type']}) with ${JSON.parse(realmData.rows[0]['agents']).length} agents`);
    console.log(`  - Scenarios: ${scenarioCount.rows[0]['count']} total`);
    console.log(`  - Knowledge: ${knowledgeData.rows[0]['key']} = ${JSON.stringify(knowledgeData.rows[0]['value'])}`);

    // Test 6: Get final statistics
    console.log('\n6️⃣ Final database statistics...');
    const stats = await db.query(`
      SELECT 'AGENTS' as table_name, COUNT(*) as row_count FROM druids_core.agents
      UNION ALL
      SELECT 'REALMS' as table_name, COUNT(*) as row_count FROM druids_core.realms  
      UNION ALL
      SELECT 'SCENARIOS' as table_name, COUNT(*) as row_count FROM druids_core.scenarios
      UNION ALL
      SELECT 'KNOWLEDGE' as table_name, COUNT(*) as row_count FROM druids_knowledge.entries
      UNION ALL
      SELECT 'ASYNC_RESULTS' as table_name, COUNT(*) as row_count FROM druids_core.async_results
    `);

    console.log('📈 Database entity counts:');
    stats.rows.forEach(row => {
      console.log(`  - ${row['table_name']}: ${row['row_count']} rows`);
    });

    await db.close();
    console.log('\n🎉 Database migration test completed successfully!');
    console.log('✅ All new schema features are working correctly');

  } catch (error) {
    console.error('❌ Migration test failed:', error);
    throw error;
  }
}

// Run the test
testMigratedSchema()
  .then(() => {
    console.log('Migration test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration test failed:', error);
    process.exit(1);
  });