import React from "react";
import { apiRequest, signOut } from "./backend.js";
import { useEffect, useRef, useState } from "react";



const ATTENDANCE = { yes: "Attending", maybe: "Maybe", no: "Can't make it" };
const DEFAULT_EVENT = {
  name: "Sophia", birthYear: 2000, date: "2026-11-14", time: "18:30",
  timezone: "Bangkok (UTC+7)", location: "The Garden Terrace",
  address: "123 Celebration Lane, Bangkok",
  note: "Let's make a wish, share some cake, and create memories worth keeping.",
  profileImage: "",
};

function createState(event = {}, profileImage = "") {
  return { version: 2, event: { ...DEFAULT_EVENT, ...event, profileImage: profileImage || event.profileImage || "" }, guests: [], responses: [] };
}

function getRoute() {
  if (typeof window === "undefined") return { view: "admin", section: "guests" };
  const hash = window.location.hash.slice(1);
  const inviteId = new URLSearchParams(hash).get("invite");
  if (inviteId) return { view: "guest", inviteId };
  if (hash === "preview") return { view: "preview" };
  const section = hash.replace("admin-", "");
  return { view: "admin", section: ["inbox", "event"].includes(section) ? section : "guests" };
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function guestLink(guest) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.search = "";
  url.searchParams.set("guest", guest.name);
  url.hash = `invite=${encodeURIComponent(guest.id)}`;
  return url.href;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function prettyDate(date) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function prettyTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}` : time;
}

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Status({ attendance, disabled = false }) {
  return <span className={`status-badge ${disabled ? "disabled" : attendance || "pending"}`}>{disabled ? "Disabled" : ATTENDANCE[attendance] || "Awaiting RSVP"}</span>;
}

function Portrait({ name, image, compact = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return <div className={`portrait-wrap ${compact ? "compact" : ""}`}>
    {image && !failed ? <img className="portrait" src={image} alt={name} onError={() => setFailed(true)} /> : <svg className="portrait" viewBox="0 0 200 200" role="img" aria-label={`Illustrated portrait of ${name}`}>
      <rect width="200" height="200" fill="#eedcf5" /><circle cx="155" cy="42" r="26" fill="#fff3cf" />
      <path d="M48 128V79a52 52 0 0 1 104 0v49Z" fill="#453044" /><path d="M29 200v-25a71 71 0 0 1 142 0v25" fill="#9272b3" />
      <path d="M84 119h32v35c-11 12-21 12-32 0" fill="#c98975" /><ellipse cx="100" cy="88" rx="38" ry="47" fill="#e8b198" />
      <path d="M61 77c-3-58 80-57 80 0-23-6-40-20-48-35-4 19-18 30-32 35" fill="#453044" />
      <path d="M78 88h6m32 0h6" stroke="#453044" strokeWidth="4" strokeLinecap="round" />
      <path d="M89 110q11 10 22 0" fill="none" stroke="#a45563" strokeWidth="3" strokeLinecap="round" />
      <circle cx="64" cy="104" r="5" fill="#f7d888" /><circle cx="136" cy="104" r="5" fill="#f7d888" />
    </svg>}
  </div>;
}

function GuestInvitation({ details, guest, response, previewName, onSubmit, notify }) {
  const [open, setOpen] = useState(false);
  const [attendance, setAttendance] = useState(response?.attendance || "yes");
  const [partySize, setPartySize] = useState(response?.partySize || 1);
  const [wish, setWish] = useState(response?.wish || "");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const name = guest?.name || previewName;

  async function submit(event) {
    event.preventDefault();
    if (!guest?.enabled) return;
    if (sending) return;
    setSending(true);
    const saved = await onSubmit({ type: "submitResponse", guestId: guest.id, attendance, partySize, wish });
    setSending(false);
    if (!saved) return;
    setSent(true); setOpen(false);
    notify("Your response was saved to the birthday inbox.");
  }

  return <main className="invitation-page">
    <article className="invitation-card" aria-labelledby="invitation-title">
      <span className="invitation-sparkle sparkle-one" aria-hidden="true">✦</span><span className="invitation-sparkle sparkle-two" aria-hidden="true">✧</span>
      <p className="invitation-eyebrow">A little cake. A lot of joy.</p>
      <div className="invitation-profile"><Portrait name={details.name} image={details.profileImage} /><span className="invitation-year">Est. {details.birthYear}</span></div>
      <p className="invitation-greeting">Dear <strong>{name}</strong>,</p>
      <h1 id="invitation-title">You're invited to<br /><em>{details.name}'s birthday</em></h1>
      <p className="invitation-description">{details.note}</p>
      <dl className="invitation-details">
        <div><dt>When</dt><dd><time dateTime={`${details.date}T${details.time}`}>{prettyDate(details.date)}</time><span>{prettyTime(details.time)} · {details.timezone}</span></dd></div>
        <div><dt>Where</dt><dd>{details.location}<span>{details.address}</span></dd></div>
      </dl>
      {!guest ? <div className="guest-notice">This is a preview. Add a guest in the admin panel to try the RSVP and wish form.</div>
        : !guest.enabled ? <div className="guest-notice" role="status">This invitation is currently disabled. Please check with the host.</div>
          : <>
            {(sent || response) && !open && <div className="response-success" role="status"><span aria-hidden="true">✓</span><strong>{sent ? "Your response is in the inbox!" : "You've already responded."}</strong><p>{ATTENDANCE[response?.attendance || attendance]}{response?.wish ? " · Birthday wish included" : ""}</p></div>}
            <button className="button primary invitation-rsvp" aria-expanded={open} aria-controls={open ? "guest-response-form" : undefined} onClick={() => { setSent(false); setOpen(!open); }}>{open ? "Close response form" : response || sent ? "Edit my response" : "RSVP & leave a wish"}<span aria-hidden="true">{open ? "−" : "+"}</span></button>
            {open && <form id="guest-response-form" className="wish-form" onSubmit={submit}>
              <label>Will you join us?<select value={attendance} onChange={(event) => setAttendance(event.target.value)}>{Object.entries(ATTENDANCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {attendance !== "no" && <label>Number of people, including you<select value={partySize} onChange={(event) => setPartySize(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} {count === 1 ? "person" : "people"}</option>)}</select></label>}
              <label>A birthday wish <span className="optional">(optional)</span><textarea rows="4" maxLength="1000" placeholder={`Write something lovely for ${details.name}…`} value={wish} onChange={(event) => setWish(event.target.value)} /></label>
              <span className="character-count">{wish.length}/1000</span>
              <button className="button primary" type="submit" disabled={sending}>{sending ? "Sending…" : "Send to birthday inbox"} <span aria-hidden="true">↗</span></button>
              <p className="form-hint">Your wish goes straight to the host's inbox. No email needed.</p>
            </form>}
          </>}
      <p className="invitation-signoff">Can't wait to celebrate with you!</p>
    </article>
  </main>;
}

function GuestList({ data, dispatch, notify, previewGuest }) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [linkGuest, setLinkGuest] = useState(null);
  const filtered = data.guests.filter((guest) => guest.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  async function addGuest(event) {
    event.preventDefault();
    if (!name.trim()) return;
    if (!await dispatch({ type: "addGuest", name })) return;
    notify(`Invitation created for ${name.trim()}.`); setName("");
  }

  async function copyLink(guest) {
    setLinkGuest(guest);
    try { await navigator.clipboard.writeText(guestLink(guest)); notify("Invitation link copied. Share it privately with this guest."); }
    catch { notify("Select and copy the invitation link below."); }
  }

  return <>
    <section className="add-guest-panel">
      <div><span className="section-kicker">THE GUEST LIST</span><h2>A seat for someone special.</h2><p>Write a name to create their personal invitation.</p></div>
      <form onSubmit={addGuest}><label htmlFor="guest-name">Guest name</label><div className="add-guest-controls"><input id="guest-name" required maxLength="80" placeholder="e.g. Maya Chen" value={name} onChange={(event) => setName(event.target.value)} /><button className="button primary" type="submit"><span aria-hidden="true">+</span> Add guest</button></div></form>
    </section>
    {linkGuest && <section className="demo-link-panel"><div className="section-heading"><strong>Invitation for {data.guests.find((guest) => guest.id === linkGuest.id)?.name}</strong><button className="text-button" onClick={() => setLinkGuest(null)}>Close</button></div><input aria-label="Personal invitation link" readOnly value={guestLink(data.guests.find((guest) => guest.id === linkGuest.id) || linkGuest)} onFocus={(event) => event.target.select()} /><p>Share this personal link with the named guest. Anyone with this link can use their invitation.</p></section>}
    <section className="panel guest-panel">
      <div className="section-heading"><h2>Your guests <span className="count-pill">{data.guests.length}</span></h2><label className="search-field"><span className="sr-only">Search guests</span><input type="search" placeholder="Search by name…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      {!filtered.length ? <div className="empty-state"><span className="empty-symbol" aria-hidden="true">✧</span><h3>{data.guests.length ? "No names match your search" : "Good company starts with one name"}</h3><p>{data.guests.length ? "Try another name or clear the search." : "Add your first guest above. Their invitation will appear here."}</p></div>
        : <div className="guest-list">{filtered.map((guest) => {
          const response = data.responses.find((item) => item.guestId === guest.id);
          return <div className={`guest-row ${!guest.enabled ? "is-disabled" : ""}`} key={guest.id}>
            <span className="guest-avatar" aria-hidden="true">{initials(guest.name)}</span>
            <div className="guest-identity">{editingId === guest.id ? <form className="rename-form" onSubmit={async (event) => { event.preventDefault(); if (!editName.trim()) return; if (!await dispatch({ type: "renameGuest", id: guest.id, name: editName })) return; setEditingId(null); notify("Guest name updated."); }}><input aria-label="Edit guest name" autoFocus required maxLength="80" value={editName} onChange={(event) => setEditName(event.target.value)} /><button className="text-button" type="submit">Save</button><button className="text-button" type="button" onClick={() => setEditingId(null)}>Cancel</button></form> : <><strong>{guest.name}</strong><button className="text-button rename-button" aria-label={`Rename ${guest.name}`} onClick={() => { setEditingId(guest.id); setEditName(guest.name); }}>Edit name</button></>}</div>
            <Status attendance={response?.attendance} disabled={!guest.enabled} />
            <div className="row-actions"><button className="button small" onClick={() => previewGuest(guest.id)}>Preview</button><button className="button small" disabled={!guest.enabled} onClick={() => copyLink(guest)}>Copy invite link</button><button className="text-button" aria-label={`${guest.enabled ? "Disable" : "Enable"} invitation for ${guest.name}`} onClick={async () => { if (!await dispatch({ type: "toggleGuest", id: guest.id })) return; notify(`Invitation ${guest.enabled ? "disabled" : "enabled"}.`); }}>{guest.enabled ? "Disable" : "Enable"}</button></div>
          </div>;
        })}</div>}
    </section>
    <p className="page-note">Disabled invitations cannot submit a response. Previous wishes stay in your inbox.</p>
  </>;
}

function Inbox({ data, dispatch }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const guestFor = (response) => data.guests.find((guest) => guest.id === response.guestId);
  const responses = [...data.responses].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter((response) => (filter !== "unread" || !response.read) && `${guestFor(response)?.name} ${response.wish}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = data.responses.find((response) => response.id === selectedId);
  const unread = data.responses.filter((response) => !response.read).length;

  return <section className="panel inbox-panel">
    <div className="section-heading inbox-heading"><div><h2>Birthday inbox <span className="count-pill">{unread} unread</span></h2><p>A little collection of good wishes.</p></div><button className="button small" disabled={!unread} onClick={() => dispatch({ type: "markAllRead" })}>Mark all as read</button></div>
    <div className="inbox-toolbar"><div className="filter-tabs" role="group" aria-label="Filter inbox"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All responses</button><button aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Unread</button></div><label className="search-field"><span className="sr-only">Search wishes</span><input type="search" placeholder="Search wishes…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    {!data.responses.length ? <div className="empty-state"><span className="empty-symbol" aria-hidden="true">♡</span><h3>Lovely words will land here</h3><p>When guests RSVP or leave a birthday wish, their responses will appear here.</p></div> : <div className="inbox-layout">
      <div className="message-list">{!responses.length ? <p className="no-results">No responses match this view.</p> : responses.map((response) => <button className={`message-preview ${!response.read ? "unread" : ""} ${selectedId === response.id ? "selected" : ""}`} key={response.id} onClick={() => { setSelectedId(response.id); dispatch({ type: "markRead", id: response.id, read: true }); }}><span className="message-preview-top"><strong>{guestFor(response)?.name || "Guest"}</strong>{!response.read && <span className="unread-dot" aria-label="Unread" />}</span><span className="message-excerpt">{response.wish || "RSVP received · No birthday wish added"}</span><span className="message-meta">{ATTENDANCE[response.attendance]} · {timestamp(response.updatedAt)}</span></button>)}</div>
      {selected ? <article className="message-detail"><div className="message-person"><span className="guest-avatar" aria-hidden="true">{initials(guestFor(selected)?.name || "Guest")}</span><div><h3>{guestFor(selected)?.name || "Guest"}</h3><p>{timestamp(selected.updatedAt)}</p></div></div><div className="message-status"><Status attendance={selected.attendance} /><span>{selected.partySize ? `${selected.partySize} ${selected.partySize === 1 ? "person" : "people"}` : "Sending wishes from afar"}</span></div><p className="full-wish">{selected.wish || "This guest sent an RSVP without a birthday wish."}</p><button className="text-button" onClick={() => dispatch({ type: "markRead", id: selected.id, read: !selected.read })}>{selected.read ? "Mark as unread" : "Mark as read"}</button></article> : <div className="message-detail message-placeholder"><span aria-hidden="true">✦</span><p>Choose a response to read it.</p></div>}
    </div>}
  </section>;
}

function EventSettings({ details, dispatch, notify }) {
  const [draft, setDraft] = useState(details);
  const [imageError, setImageError] = useState("");
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 600 * 1024) { setImageError("Choose a JPG, PNG or WebP image under 600 KB."); event.target.value = ""; return; }
    try {
      const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      update("profileImage", image); setImageError("");
    } catch { setImageError("This image couldn't be read. Please choose another photo."); }
    event.target.value = "";
  }
  async function save(event) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.location.trim()) return;
    if (!await dispatch({ type: "updateEvent", event: { ...draft, name: draft.name.trim(), location: draft.location.trim(), birthYear: Number(draft.birthYear) } })) return;
    notify("Event details saved. Every invitation is updated.");
  }
  return <section className="panel settings-panel"><div className="section-heading"><div><h2>The celebration details</h2><p>One update, every invitation.</p></div></div>
    <form onSubmit={save}>
      <div className="photo-settings"><Portrait name={draft.name} image={draft.profileImage} compact /><div><label className="button small photo-upload">Choose a photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} /></label><p>JPG, PNG or WebP · up to 600 KB</p>{draft.profileImage && <button className="text-button" type="button" onClick={() => update("profileImage", "")}>Use illustrated portrait</button>}</div></div>
      {imageError && <p className="inline-error" role="alert">{imageError}</p>}
      <div className="settings-grid">
        <label>Birthday person's name<input required maxLength="80" value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
        <label>Birth year<input type="number" required min="1900" max={new Date().getFullYear()} value={draft.birthYear} onChange={(event) => update("birthYear", event.target.value)} /></label>
        <label>Event date<input type="date" required value={draft.date} onChange={(event) => update("date", event.target.value)} /></label>
        <label>Time<input type="time" required value={draft.time} onChange={(event) => update("time", event.target.value)} /></label>
        <label>Time zone label<input required maxLength="60" value={draft.timezone} onChange={(event) => update("timezone", event.target.value)} /></label>
        <label>Venue<input required maxLength="120" value={draft.location} onChange={(event) => update("location", event.target.value)} /></label>
        <label className="full-width">Address<input required maxLength="240" value={draft.address} onChange={(event) => update("address", event.target.value)} /></label>
        <label className="full-width">Invitation message<textarea rows="3" maxLength="400" value={draft.note} onChange={(event) => update("note", event.target.value)} /></label>
      </div>
      <div className="settings-footer"><p>Changes update every invitation.</p><button className="button primary" type="submit">Save event details</button></div>
    </form>
  </section>;
}


function guestState(payload) {
  return { version: 2, event: payload.event, guests: [payload.guest], responses: payload.response ? [payload.response] : [] };
}

export default function OnlineApp({ mode = "guest" }) {
  const [data, setData] = useState(createState);
  const [rawRoute, setRoute] = useState(getRoute);
  const route = mode === "guest" ? { view: "guest", inviteId: rawRoute.inviteId || null } : rawRoute;
  const [guestName, setGuestName] = useState("Friend");
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const isSaving = useRef(false);

  useEffect(() => {
    const onNavigate = () => { setRoute(getRoute()); setGuestName(new URLSearchParams(window.location.search).get("guest")?.trim().slice(0, 80) || "Friend"); };
    onNavigate(); window.addEventListener("hashchange", onNavigate); window.addEventListener("popstate", onNavigate);
    return () => { window.removeEventListener("hashchange", onNavigate); window.removeEventListener("popstate", onNavigate); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    const load = async () => {
      if (isSaving.current) return;
      if (mode !== "admin" && !route.inviteId) { setData(createState()); setLoading(false); return; }
      try {
        const payload = await apiRequest(mode === "admin" ? "/api/admin/state" : "/api/invites/" + encodeURIComponent(route.inviteId), "GET", undefined, controller.signal);
        if (!controller.signal.aborted && !isSaving.current) setData(mode === "admin" ? payload : guestState(payload));
        if (!controller.signal.aborted) { setLoading(false); setLoadError(""); }
      } catch (error) {
        if (!controller.signal.aborted) { setLoadError(error.message); setLoading(false); }
      }
    };
    load();
    const timer = mode === "admin" ? window.setInterval(() => { if (!document.hidden) load(); }, 30000) : null;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [mode, route.inviteId, retry]);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 5000); return () => window.clearTimeout(timer); }, [toast]);

  async function dispatch(action) {
    if (isSaving.current) { setToast("Another change is saving. Please try again in a moment."); return false; }
    isSaving.current = true;
    try {
      switch (action.type) {
        case "addGuest": await apiRequest("/api/admin/guests", "POST", { name: action.name }); break;
        case "renameGuest": await apiRequest("/api/admin/guests/" + encodeURIComponent(action.id), "PATCH", { name: action.name }); break;
        case "toggleGuest": await apiRequest("/api/admin/guests/" + encodeURIComponent(action.id), "PATCH", { enabled: !data.guests.find((item) => item.id === action.id)?.enabled }); break;
        case "submitResponse": await apiRequest("/api/invites/" + encodeURIComponent(action.guestId), "PUT", { attendance: action.attendance, partySize: action.partySize, wish: action.wish }); break;
        case "markRead": await apiRequest("/api/admin/responses/" + encodeURIComponent(action.id), "PATCH", { read: action.read }); break;
        case "markAllRead": await apiRequest("/api/admin/read-all", "POST", {}); break;
        case "updateEvent": await apiRequest("/api/admin/event", "PATCH", action.event); break;
        default: throw new Error("This action isn't available.");
      }
      const payload = await apiRequest(mode === "admin" ? "/api/admin/state" : "/api/invites/" + encodeURIComponent(action.guestId));
      setData(mode === "admin" ? payload : guestState(payload));
      return true;
    } catch (error) { setToast(error.message); return false; }
    finally { isSaving.current = false; }
  }

  const unread = data.responses.filter((response) => !response.read).length;
  const active = data.guests.filter((guest) => guest.enabled).length;
  const coming = data.responses.filter((response) => response.attendance === "yes" && data.guests.some((guest) => guest.id === response.guestId && guest.enabled)).reduce((count, response) => count + response.partySize, 0);
  const guest = data.guests.find((item) => item.id === (route.view === "guest" ? route.inviteId : selectedGuestId)) || (route.view === "preview" ? data.guests[0] : null);
  const response = guest && data.responses.find((item) => item.guestId === guest.id);
  const previewGuest = (id) => { setSelectedGuestId(id); window.location.hash = "preview"; };
  const title = { guests: "Your people, personally invited.", inbox: "Good wishes, all in one place.", event: "Make it your celebration." };

  if (loading || loadError) return <div className="birthday-app"><main className="invitation-page"><div className="invitation-card"><p className="invitation-eyebrow">WISHBOX</p><h1>{loading ? "One lovely moment…" : "We couldn't open this page"}</h1><p className="invitation-description" role={loadError ? "alert" : "status"}>{loading ? "Opening your celebration." : loadError}</p>{loadError && <><button className="button primary" onClick={() => setRetry((value) => value + 1)}>Try again</button><p><button className="text-button" onClick={() => mode === "admin" ? signOut() : (window.location.hash = "admin-guests")}>{mode === "admin" ? "Sign in with another account" : "Host sign-in"}</button></p></>}</div></main></div>;

  return <div className="birthday-app">
    <div className="toast" role="status" aria-live="polite">{toast && <span>{toast}</span>}</div>
    {route.view === "admin" ? <div className="admin-shell">
      <aside className="admin-sidebar"><a className="brand" href="#admin-guests"><span className="brand-icon" aria-hidden="true">✦</span><span>Wishbox<small>Birthday, beautifully planned.</small></span></a><span className="sidebar-label">YOUR CELEBRATION</span><nav aria-label="Admin navigation">{[["guests", "Guest list", "◉"], ["inbox", "Wish inbox", "♡"], ["event", "Event details", "✧"]].map(([key, label, icon]) => <a key={key} href={`#admin-${key}`} className={route.section === key ? "active" : ""} aria-current={route.section === key ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}{key === "inbox" && unread > 0 && <span className="nav-count">{unread}</span>}</a>)}</nav><div className="sidebar-bottom"><span className="local-dot" /> Online celebration<p>Only you can view this inbox.</p><button className="text-button" onClick={signOut}>Sign out</button></div></aside>
      <main className="admin-main"><header className="admin-topbar"><span>YOUR BIRTHDAY CONTROL PANEL</span><button className="button small" onClick={() => { window.location.hash = "preview"; }}>Preview invitation <span aria-hidden="true">↗</span></button></header>
        <section className="dashboard-heading"><div><p className="section-kicker">LET'S CELEBRATE {data.event.name.toUpperCase()}</p><h1>{title[route.section]}</h1><p>{route.section === "guests" ? "A thoughtful invitation for everyone on your list." : route.section === "inbox" ? "Read RSVPs and birthday wishes without using email." : "Set the date, add a photo, and put your personality into every card."}</p></div><span className="heading-flower" aria-hidden="true">✳</span></section>
        <section className="stats-grid" aria-label="Celebration overview"><div className="stat"><span>Active invitations</span><strong>{active}<small> / {data.guests.length} guests</small></strong></div><div className="stat"><span>People attending</span><strong>{coming}<small> including plus-ones</small></strong></div><div className="stat accent-stat"><span>Unread responses</span><strong>{unread}<small> little moments of joy</small></strong></div></section>
        {route.section === "guests" ? <GuestList data={data} dispatch={dispatch} notify={setToast} previewGuest={previewGuest} /> : route.section === "inbox" ? <Inbox data={data} dispatch={dispatch} /> : <EventSettings details={data.event} dispatch={dispatch} notify={setToast} />}
        <footer className="admin-footer"><span>Made for a day worth remembering.</span><span>Shared inbox · Refreshes every 30 seconds</span></footer>
      </main>
    </div> : <>
      <header className="preview-bar"><a className="brand" href="#admin-guests"><span className="brand-icon" aria-hidden="true">✦</span>Wishbox</a><div className="preview-controls"><span className="demo-label">Birthday invitation</span>{route.view === "preview" && data.guests.length > 0 && <label><span className="sr-only">Preview as guest</span><select value={guest?.id || ""} onChange={(event) => setSelectedGuestId(event.target.value)}>{data.guests.map((item) => <option key={item.id} value={item.id}>{item.name}{!item.enabled ? " (disabled)" : ""}</option>)}</select></label>}<a className="button small" href="#admin-guests">{mode === "admin" ? "Back to admin" : "Host sign-in"}</a></div></header>
      {route.view === "guest" && !guest ? <main className="invitation-page"><div className="invitation-card"><p className="invitation-eyebrow">YOUR CELEBRATION</p><h1>{route.inviteId ? "Invitation not found" : "Your invitation awaits"}</h1><p className="invitation-description">Open the personal invitation link shared by your host.</p><a className="button primary" href="#admin-guests">Host sign-in</a></div></main> : <GuestInvitation key={guest?.id || "sample"} details={data.event} guest={guest} response={response} previewName={guestName} onSubmit={dispatch} notify={setToast} />}
      <footer className="guest-demo-footer">Your birthday wish goes directly to the host's private inbox.</footer>
    </>}
  </div>;
}
