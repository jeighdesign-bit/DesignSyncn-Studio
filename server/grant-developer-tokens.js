import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

async function run() {
  console.log('🔄 Overwriting database token balances to 999999 for development...');
  
  try {
    // 1. Get all records from token_usage
    const { data: records, error } = await supabase
      .from('token_usage')
      .select('*');

    if (error) throw error;

    console.log(`Found ${records?.length || 0} user session(s) in token_usage table.`);

    // 2. Overwrite / Upsert anonymous-session and update others
    const { error: upsertError } = await supabase
      .from('token_usage')
      .upsert([
        {
          user_id: 'anonymous-session',
          tokens_remaining: 999999,
          tokens_used: 0,
          plan_id: 'free',
          updated_at: new Date().toISOString()
        }
      ], { onConflict: 'user_id' });

    if (upsertError) console.error('Error updating anonymous-session:', upsertError);

    for (const record of records || []) {
      const { error: updateError } = await supabase
        .from('token_usage')
        .update({
          tokens_remaining: 999999,
          tokens_used: 0,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', record.user_id);
        
      if (updateError) {
        console.error(`Error updating user ${record.user_id}:`, updateError);
      } else {
        console.log(`✓ Granted 999999 tokens to session: ${record.user_id}`);
      }
    }
    
    console.log('✅ Overwrite completed successfully!');
  } catch (err) {
    console.error('❌ Failed to run script:', err);
  }
}

run();
