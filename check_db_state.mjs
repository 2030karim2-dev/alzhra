import pg from 'pg';

const pool = new pg.Pool({
  host: 'db.zzthamxjxnxzzpswllid.supabase.co',
  user: 'postgres',
  password: 'Karimalgafari1',
  database: 'postgres',
  port: 5432,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function main() {
  const client = await pool.connect();
  console.log('✅ Connected');

  // Check if our functions exist
  const funcs = [
    'get_dashboard_summary', 'commit_sales_invoice', 'search_inventory',
    'report_trial_balance', 'get_low_stock_products', 'get_dashboard_summary'
  ];
  
  const { rows } = await client.query(`
    SELECT proname, pronargs FROM pg_proc
    WHERE proname = ANY($1) AND pronamespace = 'public'::regnamespace
    ORDER BY proname
  `, [funcs]);
  console.log('\nFunctions in pg_proc:', rows.map(r => `${r.proname}(${r.pronargs})`).join(', '));

  // Check if our tables exist
  const tables = ['cashboxes', 'monthly_targets', 'suspended_orders', 'backup_configs', 'backup_logs'];
  for (const t of tables) {
    const { rows: r } = await client.query(`SELECT to_regclass('public.${t}') IS NOT NULL as exists`);
    console.log(`  Table ${t}: ${r[0].exists ? '✅' : '❌'}`);
  }

  // Test direct SQL call
  console.log('\n=== Test get_dashboard_summary via SQL ===');
  try {
    const { rows: r2 } = await client.query(
      "SELECT * FROM get_dashboard_summary('fa02647b-a740-4ab5-85b7-81d80235da38')"
    );
    console.log('✅ Result:', JSON.stringify(r2[0]).substring(0, 300));
  } catch(e) {
    console.log('❌ Error:', e.message);
  }

  client.release();
  await pool.end();
}

main().catch(console.error);
