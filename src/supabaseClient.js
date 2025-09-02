// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://abjempwlmbkfrkeqcgww.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiamVtcHdsbWJrZnJrZXFjZ3d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0Njk3NDksImV4cCI6MjA3MjA0NTc0OX0.F19GPfxZACByzLsZb2bS6sIvzs4D8UO9ugdKVJLwXqc";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials!');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
