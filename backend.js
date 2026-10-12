import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && !!key && !key.includes("YOUR-");
// Only the public publishable/anon key belongs in the frontend.
export const supabase = configured ? createClient(url, key) : null;

export async function apiRequest(path, method = "GET", value, signal) {
  if (!supabase) throw new Error("The host hasn't finished setting up the online inbox yet.");
  let request = supabase.rpc("wishbox_request", { p_path: path, p_method: method, p_value: value ?? {} });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message || "Couldn't reach the inbox. Please try again.");
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) window.alert("Couldn't sign out. Please try again.");
}
