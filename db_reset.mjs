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
  
  console.log('=== Dropping all our functions ===');
  const ourFuncs = [
    'get_dashboard_summary', 'get_sales_chart_data', 'get_top_products_and_customers',
    'get_expense_categories_summary', 'get_sales_analytics', 'get_sales_stats',
    'get_expense_stats', 'search_inventory', 'get_popular_products', 'get_monthly_performance',
    'report_trial_balance', 'report_profit_loss', 'report_balance_sheet',
    'report_cash_flow', 'report_debt_aging',
    'commit_sales_invoice', 'get_next_invoice_number', 'get_next_sequence',
    'commit_expense_v2', 'commit_payment', 'void_bond', 'get_low_stock_products'
  ];
  
  for (const fn of ourFuncs) {
    await client.query(`DROP FUNCTION IF EXISTS public.${fn} CASCADE`).catch(() => {});
  }
  console.log(`Dropped ${ourFuncs.length} functions`);
  
  const { rows } = await client.query(`
    SELECT count(*) as cnt FROM pg_proc 
    WHERE pronamespace = 'public'::regnamespace
    AND proname = ANY($1)
  `, [ourFuncs]);
  console.log(`Remaining: ${rows[0].cnt}`);
  
  await client.query("SELECT pg_notify('pgrst', 'reload')");
  console.log('NOTIFY sent');
  
  client.release();
  await pool.end();
}

main().catch(console.error);
