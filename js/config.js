import { createClient } from 'https://esm.run/@supabase/supabase-js@2';

// 1. Paste your FULL Project URL here (must end in .supabase.co)
const SUPABASE_URL = 'https://ctztzcybeyauvvahsenq.supabase.co'; 

// 2. Paste your FULL Publishable (anon) key here
const SUPABASE_ANON_KEY = 'sb_publishable_yzg5FtAdOefET5Wd6XxTPw_LbIjEc8d'; 

// 3. The name of the storage bucket we created for 47 Cloud
const BUCKET_NAME = 'user-files';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { BUCKET_NAME };
