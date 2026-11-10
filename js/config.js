import { createClient } from 'https://esm.run/@supabase/supabase-js@2';

const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const BUCKET_NAME = 'user-files';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { BUCKET_NAME };
