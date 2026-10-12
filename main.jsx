import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import BirthdayInvitation from "./BirthdayInvitation.jsx";
import { supabase, configured } from "./backend.js";
import "./Invitation.css";

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword("");
    } catch (error) { setError(error.message || "Couldn't sign in. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="birthday-app"><main className="invitation-page"><article className="invitation-card">
    <p className="invitation-eyebrow">WISHBOX · FOR THE HOST</p><h1>Your celebration<br /><em>starts here.</em></h1>
    <p className="invitation-description">Sign in to manage your guests and read their wishes.</p>
    <form className="wish-form" onSubmit={submit}>
      <label>Host account<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Open admin panel"}</button>
      <p className="form-hint">Guests use their invitation link. They don't need email or an account.</p>
    </form><a className="text-button" href="#">Back to invitation</a>
  </article></main></div>;
}

function App() {
  const [hash, setHash] = useState(window.location.hash);
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!configured);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setReady(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const admin = hash.startsWith("#admin-") || hash === "#preview";
  if (!configured) return <div className="birthday-app"><main className="invitation-page"><article className="invitation-card"><p className="invitation-eyebrow">WISHBOX</p><h1>A celebration<br /><em>in the making.</em></h1><p className="invitation-description">The host is setting up this invitation. Please check back soon.</p></article></main></div>;
  if (!ready) return <div className="birthday-app"><main className="invitation-page"><p role="status">Opening your celebration…</p></main></div>;
  if (admin && !session) return <SignIn />;
  return <BirthdayInvitation key={`${admin ? "admin" : "guest"}-${admin ? session.user.id : "public"}`} mode={admin ? "admin" : "guest"} />;
}

createRoot(document.getElementById("root")).render(<App />);
