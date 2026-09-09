/**
 * Database client using Supabase JS SDK with service_role key.
 * This client is STRICTLY for backend server and migration scripts.
 * NEVER expose this or import this in client-side / browser code.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[db] WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in environment.');
}

export const supabaseAdmin = createClient(
    SUPABASE_URL || 'https://placeholder-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
        db: {
            schema: 'api',
        },
    }
);

export function isDbConfigured() {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
