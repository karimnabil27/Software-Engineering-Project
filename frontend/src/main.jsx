import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const EVENT_ID = "e1";
const ORGANIZER_ID = "u1";
const STAFF_ID = "u2";
const VENDOR_ID = "vendor1";
const roles = ["organizer", "staff", "vendor", "guest", "venue-owner"];
const userStatuses = ["active", "inactive"];
const taskStatuses = ["Not Assigned", "Pending", "In Progress", "Done"];
const eventStatuses = ["planning", "upcoming", "completed", "cancelled"];
const rsvpStatuses = ["Attending", "Maybe", "Not Attending"];
const sourcingStatuses = ["Pending", "Accepted", "Declined", "Preparing", "Out for Delivery", "Delivered", "Delayed"];
const bookingStatuses = ["Pending", "Approved", "Declined"];

const demoAccounts = [
  { role: "organizer", label: "Organizer", email: "jonathan@giuberlin", password: "1234", description: "Plan events, budgets, vendors, guests, and reports." },
  { role: "staff", label: "Staff", email: "omar@events.test", description: "Track assignments, check in guests, and confirm arrivals." },
  { role: "vendor", label: "Vendor", email: "hello@nilecatering.test", description: "Review sourcing requests, update delivery, and submit invoices." },
  { role: "guest", label: "Guest", email: "youssef@example.test", description: "View invitations, RSVP, read updates, and submit feedback." },
  { role: "venue-owner", label: "Venue Owner", email: "owner@zamalekvenues.test", description: "Manage venues, bookings, availability, and revenue." }
];

async function api(path, options = {}, token = "") {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Request failed");
  }
  return body;
}

function useApi(path, refreshKey, token = "") {
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: "" });
      return undefined;
    }

    let ignore = false;
    setState((current) => ({ ...current, loading: true, error: "" }));
    api(path, {}, token)
      .then((data) => {
        if (!ignore) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (!ignore) setState({ data: null, loading: false, error: error.message });
      });

    return () => {
      ignore = true;
    };
  }, [path, refreshKey, token]);

  return state;
}

function money(value = 0) {
  return `${Number(value).toLocaleString()} EGP`;
}

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return query.toString();
}

function itemsToLines(items) {
  return (items || [])
    .map((item) => `${item.name}:${item.amount}`)
    .join("\n");
}

function linesToItems(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, amount] = line.split(":");
      return { name: name?.trim(), amount: Number(amount) };
    })
    .filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0);
}

function csvToArray(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function printCurrentPage() {
  window.print();
}

function printInvitationCards() {
  document.body.classList.remove("printing-single-invitation");
  document.querySelectorAll(".invitation-card-print-target").forEach((node) => {
    node.classList.remove("invitation-card-print-target");
  });
  document.body.classList.add("printing-invitations");
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-invitations");
  }, { once: true });
  window.print();
}

function printSingleInvitation(guestId) {
  const card = document.getElementById(`invitation-${guestId}`);
  if (!card) return;

  document.body.classList.remove("printing-single-invitation");
  document.querySelectorAll(".invitation-card-print-target").forEach((node) => {
    node.classList.remove("invitation-card-print-target");
  });

  card.classList.add("invitation-card-print-target");
  document.body.classList.add("printing-invitations", "printing-single-invitation");
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-invitations", "printing-single-invitation");
    card.classList.remove("invitation-card-print-target");
  }, { once: true });
  window.print();
}

function InvitationQr({ value, label }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value || "EVENT-GUEST", {
      margin: 1,
      width: 140,
      color: { dark: "#0f172a", light: "#ffffff" }
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc("");
      });

    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className="invitation-qr-wrap">
      {src ? (
        <img alt={`QR code for ${label}`} className="invitation-qr" src={src} />
      ) : (
        <div className="invitation-qr invitation-qr-loading">Generating QR...</div>
      )}
      <span className="invitation-qr-code">{value}</span>
    </div>
  );
}

function GuestInvitationCard({ guest, event, venueName, dressCode, onPrint }) {
  return (
    <article className="invitation-card" id={`invitation-${guest.id}`}>
      <div className="invitation-card-header">
        <p className="eyebrow">You are invited</p>
        <h3>{event.name}</h3>
      </div>
      <div className="invitation-card-body">
        <span className="invitation-meta"><strong>Guest</strong> {guest.name}</span>
        <span className="invitation-meta"><strong>When</strong> {event.date} at {event.time}</span>
        <span className="invitation-meta"><strong>Where</strong> {venueName}</span>
        <span className="invitation-meta"><strong>RSVP</strong> {guest.rsvp}</span>
        {dressCode && <span className="invitation-meta"><strong>Dress code</strong> {dressCode}</span>}
      </div>
      <InvitationQr label={guest.name} value={guest.qrCode} />
      <p className="invitation-footnote">Present this QR code at registration for check-in.</p>
      <div className="inline-actions no-print invitation-card-actions">
        <Button type="button" variant="secondary" onClick={() => onPrint(guest.id)}>Print this invitation</Button>
      </div>
    </article>
  );
}

function classNameFrom(value) {
  return String(value || "unknown").toLowerCase().replaceAll(" ", "-");
}

function Button({ children, variant = "primary", ...props }) {
  return (
    <button className={`btn ${variant}`} {...props}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Badge({ value }) {
  return <span className={`badge ${classNameFrom(value)}`}>{value}</span>;
}

function StatCard({ label, value, hint }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  );
}

function Panel({ title, eyebrow, action, children, className = "", style }) {
  return (
    <section className={`panel ${className}`} style={style}>
      <div className="panel-header">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title = "No records yet", text = "Data will appear here when it is available." }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ConfirmModal({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel, loading = false }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow">Confirm action</p>
        <h3 id="confirm-modal-title">{title}</h3>
        <p className="muted">{message}</p>
        <div className="inline-actions">
          <Button variant="ghost" type="button" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button type="button" onClick={onConfirm} disabled={loading}>{loading ? "Deleting..." : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function PageIntro({ eyebrow, title, text, items = [] }) {
  return (
    <section className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {items.length > 0 && (
        <div className="intro-points">
          {items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function InfoList({ items }) {
  return (
    <div className="info-list">
      {items.map((item) => (
        <article key={item.title} className="info-row">
          <div>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </div>
          {item.badge && <Badge value={item.badge} />}
        </article>
      ))}
    </div>
  );
}

function ActionMessage({ status }) {
  if (!status?.message) return null;
  return <p className={status.type === "error" ? "error-message span-12" : "success-message span-12"}>{status.message}</p>;
}

function useActionStatus() {
  const [status, setStatus] = useState({ type: "", message: "", loading: false });

  async function runAction(successMessage, action) {
    setStatus({ type: "", message: "", loading: true });
    try {
      await action();
      setStatus({ type: "success", message: successMessage, loading: false });
    } catch (error) {
      setStatus({ type: "error", message: error.message, loading: false });
    }
  }

  return { actionStatus: status, runAction };
}

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [registerRole, setRegisterRole] = useState("vendor");
  const [companyName, setCompanyName] = useState("");
  const [contact, setContact] = useState("");
  const [supplies, setSupplies] = useState("");
  const [mainLocation, setMainLocation] = useState("Cairo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await api(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: JSON.stringify(
          mode === "login"
            ? { email, password }
            : {
                name,
                email,
                password,
                role: registerRole,
                companyName,
                contact,
                supplies,
                mainLocation
              }
        )
      });
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="brand-mark">EMP</div>
        <p className="eyebrow">Event Management Platform</p>
        <h1>Professional operations dashboard for every event stakeholder.</h1>
        <p>
          Sign in with your account or register as a vendor or venue owner. The platform opens the correct workspace based on your role.
        </p>
      </section>

      <form className="login-card" onSubmit={submit}>
        <div>
          <p className="eyebrow">Secure access</p>
          <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
        </div>

        <div className="login-mode-toggle">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }} type="button">Sign in</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }} type="button">Register</button>
        </div>

        {mode === "register" && (
          <>
            <Field label="Full name"><input onChange={(event) => setName(event.target.value)} required value={name} /></Field>
            <Field label="Account type">
              <select onChange={(event) => setRegisterRole(event.target.value)} value={registerRole}>
                <option value="vendor">Vendor / supplier</option>
                <option value="venue-owner">Venue owner</option>
              </select>
            </Field>
            <Field label={registerRole === "vendor" ? "Company name" : "Business name"}>
              <input onChange={(event) => setCompanyName(event.target.value)} required value={companyName} />
            </Field>
            {registerRole === "vendor" && (
              <>
                <Field label="Supplies offered"><input onChange={(event) => setSupplies(event.target.value)} placeholder="Buffet, AV, staffing" value={supplies} /></Field>
                <Field label="Main location"><input onChange={(event) => setMainLocation(event.target.value)} value={mainLocation} /></Field>
              </>
            )}
            <Field label="Contact"><input onChange={(event) => setContact(event.target.value)} placeholder="+20 10 0000 0000" value={contact} /></Field>
          </>
        )}

        <Field label="Email">
          <input
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder={mode === "login" ? "jonathan@giuberlin" : "you@company.test"}
            required
            type="email"
            value={email}
          />
        </Field>
        <Field label="Password">
          <input
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
            type="password"
            value={password}
          />
        </Field>
        {error && <p className="error-message">{error}</p>}
        <Button disabled={loading || !email || !password || (mode === "register" && (!name || !companyName))}>
          {loading ? (mode === "login" ? "Signing in..." : "Creating account...") : (mode === "login" ? "Sign in" : "Create account")}
        </Button>
        <p className="muted">
          {mode === "login"
            ? "The backend checks your email and password, then detects your role automatically."
            : "Vendors and venue owners can self-register. Organizers, staff, and guests are invited by an organizer."}
        </p>
      </form>
    </main>
  );
}

function AppShell({ session, onLogout }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activePage, setActivePage] = useState("overview");
  const [showLoginToast, setShowLoginToast] = useState(() => session.justLoggedIn);
  const [guestNavBadges, setGuestNavBadges] = useState({ operations: 0, reports: 0 });
  const refresh = () => setRefreshKey((key) => key + 1);
  const account = demoAccounts.find((item) => item.role === session.user.role) || demoAccounts[0];
  const organizerHeadings = {
    overview: ["Organizer overview", "Portfolio health, accounts, and daily readiness"],
    workspace: ["Organizer workspace", "Plan events, venues, vendors, guests, and budget"],
    operations: ["Organizer operations", "Day-of tasks, messaging, attendance, and layout"],
    reports: ["Organizer reports", "Feedback, costs, attendance, and exports"]
  };
  const guestHeadings = {
    overview: ["Guest overview", "Invitation details, RSVP status, and check-in QR"],
    workspace: ["Guest workspace", "Agenda, RSVP, and dietary preferences"],
    operations: ["Guest operations", "Day-of messages and live event updates"],
    reports: ["Guest reports", "Post-event feedback and thank-you confirmation"]
  };
  const staffHeadings = {
    overview: ["Staff overview", "Shift briefing and live event status"],
    workspace: ["Staff workspace", "Assigned tasks, schedule, and floor plan"],
    operations: ["Staff operations", "Day-of check-in, vendors, and live attendance"],
    reports: ["Staff reports", "Task completion summary"]
  };
  const vendorHeadings = {
    overview: ["Vendor overview", "Requests, deliveries, and billing at a glance"],
    workspace: ["Vendor workspace", "Review sourcing requests and update your profile"],
    operations: ["Vendor operations", "Track deliveries and update fulfillment status"],
    reports: ["Vendor reports", "Submit invoices and track payment review"]
  };
  const venueOwnerHeadings = {
    overview: ["Venue owner overview", "Listings, pending requests, and revenue at a glance"],
    workspace: ["Venue owner workspace", "Manage listings, profile, and inventory"],
    operations: ["Venue owner operations", "Availability, approvals, and confirmed bookings"],
    reports: ["Venue owner reports", "Performance metrics and booking history"]
  };
  const [pageEyebrow, pageTitle] = session.user.role === "organizer"
    ? (organizerHeadings[activePage] || organizerHeadings.overview)
    : session.user.role === "guest"
      ? (guestHeadings[activePage] || guestHeadings.overview)
      : session.user.role === "staff"
        ? (staffHeadings[activePage] || staffHeadings.overview)
        : session.user.role === "vendor"
          ? (vendorHeadings[activePage] || vendorHeadings.overview)
          : session.user.role === "venue-owner"
            ? (venueOwnerHeadings[activePage] || venueOwnerHeadings.overview)
            : [`${account.label} workspace`, account.description];
  const pages = [
    ["overview", "Overview"],
    ["workspace", "Workspace"],
    ["operations", "Operations"],
    ["reports", "Reports"]
  ];

  useEffect(() => {
    if (!showLoginToast) return undefined;
    const timer = window.setTimeout(() => setShowLoginToast(false), 4500);
    return () => window.clearTimeout(timer);
  }, [showLoginToast]);

  return (
    <div className="app-shell">
      {showLoginToast && (
        <div className="toast success-toast">
          <strong>Login successful</strong>
          <span>Logged in as {account.label}.</span>
          <button onClick={() => setShowLoginToast(false)} type="button">Dismiss</button>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">EMP</div>
          <div>
            <strong>EventOps</strong>
            <span>Management Suite</span>
          </div>
        </div>
        <nav className="side-nav">
          {pages.map(([value, label]) => (
            <button
              className={activePage === value ? "active" : ""}
              key={value}
              onClick={() => setActivePage(value)}
              type="button"
            >
              <span className="side-nav-label">{label}</span>
              {session.user.role === "guest" && guestNavBadges[value] > 0 && (
                <span className="nav-badge">{guestNavBadges[value]}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <span>Logged in as</span>
          <strong>{account.label}</strong>
          <small>{session.user.email}</small>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{pageEyebrow}</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <Badge value={session.user.status || "active"} />
            <Button variant="secondary" onClick={refresh}>Refresh</Button>
            <Button variant="ghost" onClick={onLogout}>Log out</Button>
          </div>
        </header>

        {session.user.role === "organizer" && <OrganizerDashboard activePage={activePage} refresh={refresh} refreshKey={refreshKey} token={session.token} user={session.user} />}
        {session.user.role === "staff" && <StaffDashboard activePage={activePage} refresh={refresh} refreshKey={refreshKey} token={session.token} user={session.user} />}
        {session.user.role === "vendor" && <VendorDashboard activePage={activePage} refresh={refresh} refreshKey={refreshKey} token={session.token} />}
        {session.user.role === "guest" && (
          <GuestDashboard
            activePage={activePage}
            onNavBadges={setGuestNavBadges}
            refresh={refresh}
            refreshKey={refreshKey}
            setActivePage={setActivePage}
            token={session.token}
            user={session.user}
          />
        )}
        {session.user.role === "venue-owner" && <VenueOwnerDashboard activePage={activePage} refresh={refresh} refreshKey={refreshKey} token={session.token} user={session.user} />}
      </div>
    </div>
  );
}

function OrganizerDashboard({ activePage, refresh, refreshKey, token, user }) {
  const { actionStatus, runAction } = useActionStatus();
  const organizerId = user?.id || ORGANIZER_ID;
  const [selectedEventId, setSelectedEventId] = useState(EVENT_ID);
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [eventSearchError, setEventSearchError] = useState("");
  const [eventSearchSuccess, setEventSearchSuccess] = useState("");
  const [appliedEventSearch, setAppliedEventSearch] = useState("");
  const [venueFilters, setVenueFilters] = useState({ location: "Cairo", date: "2026-06-24", minCapacity: "100", minSizeSqm: "", active: "true" });
  const [eventFilters, setEventFilters] = useState({ date: "", status: "" });
  const [taskFilters, setTaskFilters] = useState({ status: "", assignedTo: "" });
  const [guestFilters, setGuestFilters] = useState({ rsvp: "", search: "", checkedIn: "", dietary: "" });
  const [vendorFilters, setVendorFilters] = useState({ search: "", supply: "" });
  const [userFilters, setUserFilters] = useState({ role: "", status: "" });
  const [deleteSearchQuery, setDeleteSearchQuery] = useState("");
  const [deleteSearchApplied, setDeleteSearchApplied] = useState("");
  const [deleteSearchError, setDeleteSearchError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");
  const [selectedDeleteId, setSelectedDeleteId] = useState("");
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [editingGuest, setEditingGuest] = useState(null);
  const [confirmDeleteGuest, setConfirmDeleteGuest] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [messageText, setMessageText] = useState("Welcome to the event. Registration is open.");
  const [budgetDraft, setBudgetDraft] = useState("");
  const [totalPlanned, setTotalPlanned] = useState("0");
  const [eventEdit, setEventEdit] = useState(null);
  const [staffFilters, setStaffFilters] = useState({ employmentType: "", speciality: "" });
  const [organizerProfileDraft, setOrganizerProfileDraft] = useState(null);

  const dashboard = useApi("/dashboard", refreshKey);
  const allOrganizerEvents = useApi(`/events?${queryString({ organizerId })}`, refreshKey);
  const events = useApi(`/events?${queryString({ organizerId, ...eventFilters })}`, refreshKey);
  const allVenues = useApi("/venues", refreshKey);
  const allVendors = useApi("/vendors", refreshKey);
  const bookings = useApi(`/bookings?${queryString({ organizerId })}`, refreshKey);
  const sourcingRequests = useApi(`/sourcing-requests?${queryString({ organizerId, eventId: selectedEventId })}`, refreshKey);
  const tasks = useApi(`/tasks?${queryString({ eventId: selectedEventId, ...taskFilters })}`, refreshKey);
  const venues = useApi(`/venues?${queryString(venueFilters)}`, refreshKey);
  const vendors = useApi(`/vendors?${queryString(vendorFilters)}`, refreshKey);
  const guests = useApi(`/guests?${queryString({ eventId: selectedEventId, ...guestFilters })}`, refreshKey);
  const allEventGuests = useApi(`/guests?${queryString({ eventId: selectedEventId })}`, refreshKey);
  const users = useApi(`/users?${queryString(userFilters)}`, refreshKey);
  const staff = useApi("/users?role=staff&status=active", refreshKey);
  const budget = useApi(`/budgets/${selectedEventId}`, refreshKey);
  const invoices = useApi(`/invoices?eventId=${selectedEventId}`, refreshKey);
  const report = useApi(`/reports/${selectedEventId}`, refreshKey);
  const eventTasks = useApi(`/tasks?${queryString({ eventId: selectedEventId })}`, refreshKey);
  const eventFeedback = useApi(`/feedback?${queryString({ eventId: selectedEventId })}`, refreshKey);
  const allFeedback = useApi("/feedback", refreshKey);
  const allEvents = useApi("/events", refreshKey);
  const messages = useApi(`/messages?eventId=${selectedEventId}`, refreshKey);

  const data = {
    dashboard: dashboard.data || {},
    events: events.data || [],
    tasks: tasks.data || [],
    venues: venues.data || [],
    vendors: vendors.data || [],
    guests: guests.data || [],
    allEventGuests: allEventGuests.data || [],
    users: users.data || [],
    staff: staff.data || [],
    budget: budget.data,
    invoices: invoices.data || [],
    report: report.data,
    eventTasks: eventTasks.data || [],
    eventFeedback: eventFeedback.data || [],
    allFeedback: allFeedback.data || [],
    allEvents: allEvents.data || [],
    messages: messages.data || [],
    bookings: bookings.data || [],
    sourcingRequests: sourcingRequests.data || [],
    allVenues: allVenues.data || [],
    allVendors: allVendors.data || []
  };

  const organizerEvents = allOrganizerEvents.data || [];
  const selectedEvent = organizerEvents.find((event) => event.id === selectedEventId) || organizerEvents[0];
  const budgetDifference = Number(totalPlanned || 0) - (data.budget?.actualTotal || 0);
  const unseenGuestCount = (message) => (message.receivedBy || []).filter((guestId) => !(message.seenBy || []).includes(guestId)).length;

  useEffect(() => {
    if (!budget.data) return;
    setTotalPlanned(String(budget.data.totalPlanned ?? 0));
    setBudgetDraft(itemsToLines(budget.data.plannedItems));
  }, [selectedEventId, JSON.stringify(budget.data)]);

  useEffect(() => {
    if (!user) return;
    setOrganizerProfileDraft({
      name: user.name || "",
      email: user.email || ""
    });
  }, [user?.id, user?.name, user?.email]);

  useEffect(() => {
    if (!selectedEvent) {
      setEventEdit(null);
      return;
    }
    setEventEdit({
      name: selectedEvent.name,
      type: selectedEvent.type,
      venueId: selectedEvent.venueId,
      date: selectedEvent.date,
      time: selectedEvent.time,
      expectedGuests: String(selectedEvent.expectedGuests),
      dressCode: selectedEvent.dressCode || "",
      agenda: selectedEvent.agenda || "",
      status: selectedEvent.status
    });
  }, [selectedEventId, selectedEvent?.id, selectedEvent?.name]);

  function venueLabel(venueId) {
    return data.allVenues.find((venue) => venue.id === venueId)?.name || venueId;
  }

  function vendorLabel(vendorId) {
    return data.allVendors.find((vendor) => vendor.id === vendorId)?.companyName || vendorId;
  }

  function staffName(staffId) {
    if (!staffId) return "Unassigned";
    return data.staff.find((user) => user.id === staffId)?.name || staffId;
  }

  function guestNameById(guestId) {
    return data.allEventGuests.find((guest) => guest.id === guestId)?.name || guestId;
  }

  function unseenGuestLabels(message) {
    return (message.receivedBy || [])
      .filter((guestId) => !(message.seenBy || []).includes(guestId))
      .map((guestId) => guestNameById(guestId));
  }

  const operationsAttendance = {
    invited: data.report?.attendance?.invited ?? data.allEventGuests.length,
    arrived: data.report?.attendance?.arrived ?? data.allEventGuests.filter((guest) => guest.checkedIn).length,
    rsvpAttending: data.report?.attendance?.rsvpAttending ?? data.allEventGuests.filter((guest) => guest.rsvp === "Attending").length
  };
  const pendingInvoices = data.invoices.filter((invoice) => invoice.status === "Pending Review").length;
  const openTasks = data.tasks.filter((task) => task.status !== "Done").length;
  const demoToday = data.dashboard.today || "2026-06-24";
  const dueReminderTasks = (data.dashboard.pendingTasks || []).filter(
    (task) => task.reminder && task.dueDate <= demoToday && task.status !== "Done"
  );
  const filteredStaff = data.staff.filter((member) => {
    if (staffFilters.employmentType && member.employmentType !== staffFilters.employmentType) return false;
    if (staffFilters.speciality && member.speciality !== staffFilters.speciality) return false;
    return true;
  });
  const staffSpecialities = [...new Set(data.staff.map((member) => member.speciality).filter(Boolean))];
  const filteredInvoices = invoiceFilter
    ? data.invoices.filter((invoice) => invoice.status === invoiceFilter)
    : data.invoices;

  function searchEvent() {
    const query = eventSearchQuery.trim().toLowerCase();
    if (!query) {
      setEventSearchError("Enter an event name to search.");
      setEventSearchSuccess("");
      setAppliedEventSearch("");
      return;
    }

    if (allOrganizerEvents.loading) {
      setEventSearchError("Events are still loading. Try again in a moment.");
      setEventSearchSuccess("");
      return;
    }

    const pool = organizerEvents.length ? organizerEvents : data.events;
    const matches = pool.filter(
      (event) => event.name.toLowerCase().includes(query) || event.id.toLowerCase() === query
    );

    if (!matches.length) {
      setAppliedEventSearch("");
      setEventSearchSuccess("");
      setEventSearchError(`No event found for "${eventSearchQuery.trim()}".`);
      return;
    }

    const match = matches[0];
    setSelectedEventId(match.id);
    setAppliedEventSearch(query);
    setEventSearchError("");
    setEventSearchSuccess(
      matches.length === 1 ? `Selected: ${match.name}` : `Found ${matches.length} events. Selected: ${match.name}`
    );
  }

  const pipelineEvents = appliedEventSearch
    ? data.events.filter(
        (event) =>
          event.name.toLowerCase().includes(appliedEventSearch) ||
          event.id.toLowerCase() === appliedEventSearch
      )
    : data.events;

  const deletableUsers = data.users.filter((account) => account.id !== organizerId);
  const deleteCandidates = deleteSearchApplied
    ? deletableUsers.filter(
        (account) =>
          account.name.toLowerCase().includes(deleteSearchApplied) ||
          account.email.toLowerCase().includes(deleteSearchApplied)
      )
    : deletableUsers;

  function searchDeleteAccount() {
    const query = deleteSearchQuery.trim().toLowerCase();
    if (!query) {
      setDeleteSearchError("Enter a name or email to search.");
      setDeleteSearchApplied("");
      setDeleteSuccess("");
      return;
    }

    const matches = deletableUsers.filter(
      (account) =>
        account.name.toLowerCase().includes(query) || account.email.toLowerCase().includes(query)
    );

    if (!matches.length) {
      setDeleteSearchApplied("");
      setDeleteSuccess("");
      setDeleteSearchError(`No account found for "${deleteSearchQuery.trim()}".`);
      return;
    }

    setDeleteSearchApplied(query);
    setDeleteSearchError("");
    setDeleteSuccess("");
    setSelectedDeleteId(matches[0].id);
  }

  async function confirmDeleteAccount() {
    if (!confirmDeleteUser) return;
    await runAction("Stakeholder account deleted successfully.", async () => {
      await api(`/users/${confirmDeleteUser.id}`, { method: "DELETE" }, token);
      setConfirmDeleteUser(null);
      setSelectedDeleteId("");
      setDeleteSearchApplied("");
      setDeleteSearchQuery("");
      setDeleteSuccess("Stakeholder account deleted successfully.");
      refresh();
    });
  }

  function patchFilter(setter, key, value) {
    setter((current) => ({ ...current, [key]: value }));
  }

  async function submitForm(event, successMessage, action) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await runAction(successMessage, async () => {
      await action(values);
      event.currentTarget.reset();
      refresh();
    });
  }

  async function bookVenue(venue) {
    await runAction("Booking request submitted to the venue owner.", async () => {
      await api("/bookings", {
        method: "POST",
        body: JSON.stringify({
          organizerId,
          venueId: venue.id,
          eventType: selectedEvent?.type || "Conference",
          date: venueFilters.date || selectedEvent?.date || today(),
          attendees: selectedEvent?.expectedGuests || venue.capacity,
          specialRequirements: "Submitted from organizer venue search."
        })
      }, token);
      refresh();
    });
  }

  async function saveEventEdit(event) {
    event.preventDefault();
    if (!selectedEvent || !eventEdit) return;
    await runAction("Event updated.", async () => {
      await api(`/events/${selectedEvent.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...eventEdit,
          expectedGuests: Number(eventEdit.expectedGuests)
        })
      }, token);
      refresh();
    });
  }

  async function saveGuestEdit(formEvent) {
    formEvent.preventDefault();
    if (!editingGuest) return;
    const values = Object.fromEntries(new FormData(formEvent.currentTarget).entries());
    await runAction("Guest updated.", async () => {
      await api(`/guests/${editingGuest.id}`, { method: "PATCH", body: JSON.stringify(values) }, token);
      setEditingGuest(null);
      refresh();
    });
  }

  async function confirmRemoveGuest() {
    if (!confirmDeleteGuest) return;
    await runAction("Guest removed.", async () => {
      await api(`/guests/${confirmDeleteGuest.id}`, { method: "DELETE" }, token);
      setConfirmDeleteGuest(null);
      if (editingGuest?.id === confirmDeleteGuest.id) setEditingGuest(null);
      refresh();
    });
  }

  async function deleteExpense(expense) {
    await runAction("Expense removed.", async () => {
      await api(`/budgets/${selectedEventId}/expenses/${expense.id}`, { method: "DELETE" }, token);
      if (editingExpense?.id === expense.id) setEditingExpense(null);
      refresh();
    });
  }

  async function saveExpenseEdit(event) {
    event.preventDefault();
    if (!editingExpense) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await runAction("Expense updated.", async () => {
      await api(`/budgets/${selectedEventId}/expenses/${editingExpense.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: values.name,
          amount: Number(values.amount),
          paidOn: values.paidOn
        })
      }, token);
      setEditingExpense(null);
      refresh();
    });
  }

  async function saveTaskEdit(event) {
    event.preventDefault();
    if (!editingTask) return;
    await runAction("Task updated.", async () => {
      await api(`/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editingTask.title,
          category: editingTask.category,
          dueDate: editingTask.dueDate,
          assignedTo: editingTask.assignedTo || null,
          status: editingTask.assignedTo ? editingTask.status : "Not Assigned"
        })
      }, token);
      setEditingTask(null);
      refresh();
    });
  }

  async function confirmRemoveTask() {
    if (!confirmDeleteTask) return;
    await runAction("Task deleted.", async () => {
      await api(`/tasks/${confirmDeleteTask.id}`, { method: "DELETE" }, token);
      if (editingTask?.id === confirmDeleteTask.id) setEditingTask(null);
      setConfirmDeleteTask(null);
      refresh();
    });
  }

  async function updateTask(task, status) {
    await runAction(`Task moved to ${status}.`, async () => {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
      refresh();
    });
  }

  async function reviewInvoice(invoice, status) {
    await runAction(`Invoice marked as ${status}.`, async () => {
      await api(`/invoices/${invoice.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewNote: `${status} from organizer dashboard.` })
      }, token);
      refresh();
    });
  }

  async function sendFollowUp(message) {
    await runAction("Follow-up message sent to unseen guests.", async () => {
      await api(`/messages/${message.id}/follow-up`, { method: "POST", body: JSON.stringify({ body: `Reminder: ${message.body}` }) }, token);
      refresh();
    });
  }

  async function saveOrganizerProfile(event) {
    event.preventDefault();
    if (!organizerProfileDraft) return;
    await runAction("Your account details were updated.", async () => {
      await api(`/users/${organizerId}`, {
        method: "PATCH",
        body: JSON.stringify(organizerProfileDraft)
      }, token);
      refresh();
    });
  }

  return (
    <DashboardGrid>
      <ActionMessage status={actionStatus} />
      {activePage === "overview" && (
        <>
          <PageIntro
            eyebrow="Executive snapshot"
            title="Organizer overview"
            text="This page summarizes portfolio health, account coverage, attendance, budget pressure, and pending work."
            items={["Daily readiness", "Planning pipeline", "Budget status", "Stakeholder control"]}
          />
          <section className="stats-row">
            <StatCard label="Today" value={data.dashboard.today || "-"} hint="Demo operations date" />
            <StatCard label="Upcoming events" value={data.dashboard.upcomingEvents?.length || 0} hint="Active planning pipeline" />
            <StatCard label="Pending tasks" value={data.dashboard.pendingTasks?.length || 0} hint="Open workflow items" />
            <StatCard label="Invited guests" value={data.report?.attendance?.invited || data.guests.length} hint={selectedEvent?.name || "Selected event"} />
            <StatCard label="Positive feedback" value={data.dashboard.feedback?.positive || 0} hint="Ratings 4–5 stars" />
            <StatCard label="Needs attention" value={data.dashboard.feedback?.negative || 0} hint="Ratings 1–2 stars" />
          </section>
          <Panel title="Task Due Reminders" eyebrow="Daily workflow" className="span-7">
            {dueReminderTasks.length ? (
              <div className="stack">
                {dueReminderTasks.slice(0, 6).map((task) => (
                  <article className="compact-card" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>{task.category} · due {task.dueDate} · {staffName(task.assignedTo)} · {(data.allEvents || []).find((event) => event.id === task.eventId)?.name || task.eventId}</span>
                    </div>
                    <Badge value={task.status} />
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No due reminders" text="Tasks with reminders due today will appear here." />
            )}
          </Panel>
          <Panel title="My Account" eyebrow="Profile" className="span-5">
            {organizerProfileDraft ? (
              <form className="form-grid" onSubmit={saveOrganizerProfile}>
                <Field label="Name"><input onChange={(event) => setOrganizerProfileDraft((current) => ({ ...current, name: event.target.value }))} required value={organizerProfileDraft.name} /></Field>
                <Field label="Email"><input onChange={(event) => setOrganizerProfileDraft((current) => ({ ...current, email: event.target.value }))} required type="email" value={organizerProfileDraft.email} /></Field>
                <Button disabled={actionStatus.loading}>Save account details</Button>
              </form>
            ) : (
              <EmptyState title="Loading profile" text="Your account details will appear here." />
            )}
          </Panel>
          <Panel
            title="Event Pipeline"
            eyebrow="Planning"
            className="span-7"
            action={
              eventSearchError ? (
                <p className="panel-error">{eventSearchError}</p>
              ) : eventSearchSuccess ? (
                <p className="panel-success">{eventSearchSuccess}</p>
              ) : null
            }
          >
            <div className="filters-row">
              <Field label="Filter date"><input type="date" value={eventFilters.date} onChange={(event) => patchFilter(setEventFilters, "date", event.target.value)} /></Field>
              <Field label="Status"><select value={eventFilters.status} onChange={(event) => patchFilter(setEventFilters, "status", event.target.value)}><option value="">All</option>{eventStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <div className="field">
                <span>Search event</span>
                <div className="search-field">
                  <input
                    placeholder="Event name..."
                    value={eventSearchQuery}
                    onChange={(event) => {
                      setEventSearchQuery(event.target.value);
                      if (eventSearchError) setEventSearchError("");
                      if (eventSearchSuccess) setEventSearchSuccess("");
                      if (appliedEventSearch) setAppliedEventSearch("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchEvent();
                      }
                    }}
                  />
                  <button className="btn secondary" type="button" onClick={searchEvent}>Search</button>
                </div>
              </div>
            </div>
            <Table
              columns={["Event", "Date", "Venue", "Status"]}
              rows={pipelineEvents.map((event) => [
                <strong>{event.name}</strong>,
                `${event.date} at ${event.time}`,
                event.venueId,
                <Badge value={event.status} />
              ])}
            />
          </Panel>
          <Panel title="Stakeholder Accounts" eyebrow="Account control" className="span-5">
            <div className="filters-row">
              <Field label="Role"><select value={userFilters.role} onChange={(event) => patchFilter(setUserFilters, "role", event.target.value)}><option value="">All</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></Field>
              <Field label="Status"><select value={userFilters.status} onChange={(event) => patchFilter(setUserFilters, "status", event.target.value)}><option value="">All</option>{userStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
            </div>
            <div className="stack">
              {data.users.map((account) => (
                <article className="compact-card account-card" key={account.id}>
                  <div><strong>{account.name}</strong><span>{account.email} - {account.role}</span></div>
                  <div className="account-actions">
                    <Badge value={account.status} />
                    <Button disabled={actionStatus.loading || account.id === organizerId} variant="secondary" onClick={() => runAction("Account status updated.", async () => { await api(`/users/${account.id}`, { method: "PATCH", body: JSON.stringify({ status: account.status === "active" ? "inactive" : "active" }) }, token); refresh(); })}>{account.id === organizerId ? "Current" : account.status === "active" ? "Deactivate" : "Activate"}</Button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Budget Health" eyebrow="Finance" className="span-4">
            {data.budget ? (
              <>
                <div className="budget-stats-vertical">
                  <StatCard label="Planned" value={money(data.budget.totalPlanned)} />
                  <StatCard label="Actual" value={money(data.budget.actualTotal)} />
                  <StatCard label="Difference" value={money(data.budget.difference)} />
                </div>
                <ProgressBar value={data.budget.actualTotal} max={data.budget.totalPlanned} />
              </>
            ) : <EmptyState />}
          </Panel>
          <Panel title="Create Stakeholder Account" eyebrow="Users" className="span-4">
            <form className="form-grid" onSubmit={(event) => submitForm(event, "Account created.", (values) => api("/users", { method: "POST", body: JSON.stringify(values) }, token))}>
              <Field label="Name"><input name="name" required /></Field>
              <Field label="Email"><input name="email" required type="email" /></Field>
              <Field label="Role"><select name="role" required>{roles.map((role) => <option key={role}>{role}</option>)}</select></Field>
              <Field label="Password"><input name="password" placeholder="password123" /></Field>
              <Button disabled={actionStatus.loading}>Create account</Button>
            </form>
          </Panel>
          <Panel
            title="Delete Stakeholder Account"
            eyebrow="Users"
            className="span-4"
            action={
              <div className="panel-header-tools">
                {deleteSearchError ? <p className="panel-error">{deleteSearchError}</p> : null}
                {!deleteSearchError && deleteSuccess ? <p className="panel-success">{deleteSuccess}</p> : null}
                <div className="panel-search-inline">
                  <input
                    placeholder="Search account..."
                    value={deleteSearchQuery}
                    onChange={(event) => {
                      setDeleteSearchQuery(event.target.value);
                      if (deleteSearchError) setDeleteSearchError("");
                      if (deleteSuccess) setDeleteSuccess("");
                      if (deleteSearchApplied) setDeleteSearchApplied("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchDeleteAccount();
                      }
                    }}
                  />
                  <button className="btn secondary" type="button" onClick={searchDeleteAccount}>Search</button>
                </div>
              </div>
            }
          >
            <div className="stack delete-account-list">
              {deleteCandidates.map((account) => (
                <button
                  className={`compact-card account-card selectable-account ${selectedDeleteId === account.id ? "selected" : ""}`}
                  key={account.id}
                  onClick={() => setSelectedDeleteId(account.id)}
                  type="button"
                >
                  <div>
                    <strong>{account.name}</strong>
                    <span>{account.email} - {account.role}</span>
                  </div>
                  <Badge value={account.status} />
                </button>
              ))}
              {!deleteCandidates.length && <EmptyState title="No accounts to show" text="Try a different search or create a new stakeholder account." />}
            </div>
            <Button
              disabled={actionStatus.loading || !selectedDeleteId}
              onClick={() => {
                const account = deleteCandidates.find((item) => item.id === selectedDeleteId);
                if (account) setConfirmDeleteUser(account);
              }}
              variant="secondary"
            >
              Delete selected account
            </Button>
          </Panel>
          <ConfirmModal
            confirmLabel="Delete account"
            loading={actionStatus.loading}
            message={`Are you sure you want to delete ${confirmDeleteUser?.name}? This action cannot be undone.`}
            onCancel={() => setConfirmDeleteUser(null)}
            onConfirm={confirmDeleteAccount}
            open={Boolean(confirmDeleteUser)}
            title="Delete stakeholder account?"
          />
        </>
      )}

      {activePage === "workspace" && (
        <>
          <PageIntro
            eyebrow="Planning workspace"
            title="Build the event plan"
            text="Pick an active event, create or edit details, search venues, coordinate vendors, manage guests, and track budget lines in one place."
            items={["Active event context", "Venue booking", "Vendor requests", "Guest invitations", "Budget control"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Active event</p>
                <h2>{selectedEvent?.name || "No event selected"}</h2>
                <p className="workspace-context-copy">
                  All workspace actions below apply to the selected event. Switch events here or from Overview search.
                </p>
              </div>
              <Field label="Switch event">
                <select
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                >
                  {organizerEvents.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            {selectedEvent && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Date</strong> {selectedEvent.date} at {selectedEvent.time}</span>
                <span className="workspace-pill"><strong>Venue</strong> {venueLabel(selectedEvent.venueId)}</span>
                <span className="workspace-pill"><strong>Guests</strong> {selectedEvent.expectedGuests}</span>
                <span className="workspace-pill"><Badge value={selectedEvent.status} /></span>
                {data.budget && (
                  <span className="workspace-pill"><strong>Budget</strong> {money(data.budget.actualTotal)} / {money(data.budget.totalPlanned)}</span>
                )}
              </div>
            )}
          </section>

          <Panel title="Create Event" eyebrow="Event setup" className="span-6">
            <form className="form-grid" onSubmit={(event) => submitForm(event, "Event created.", (values) => api("/events", { method: "POST", body: JSON.stringify({ ...values, organizerId, expectedGuests: Number(values.expectedGuests) }) }, token))}>
              <Field label="Name"><input name="name" required placeholder="Summer Product Launch" /></Field>
              <Field label="Type"><input name="type" required placeholder="Product launch" /></Field>
              <Field label="Venue">
                <select name="venueId" required defaultValue={data.allVenues[0]?.id || "v1"}>
                  {data.allVenues.map((venue) => (
                    <option key={venue.id} value={venue.id}>{venue.name} — {venue.location}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date"><input name="date" required type="date" /></Field>
              <Field label="Time"><input name="time" required type="time" /></Field>
              <Field label="Expected guests"><input name="expectedGuests" min="1" required type="number" /></Field>
              <Field label="Dress code"><input name="dressCode" placeholder="Smart casual" /></Field>
              <Field label="Agenda"><input name="agenda" placeholder="Keynote, demo, networking" /></Field>
              <Button disabled={actionStatus.loading}>Create event</Button>
            </form>
          </Panel>

          <Panel title="Edit Selected Event" eyebrow="Event setup" className="span-6">
            {!eventEdit ? (
              <EmptyState title="No event loaded" text="Select an event above to edit its details." />
            ) : (
              <form className="form-grid" onSubmit={saveEventEdit}>
                <Field label="Name"><input required value={eventEdit.name} onChange={(event) => setEventEdit((current) => ({ ...current, name: event.target.value }))} /></Field>
                <Field label="Type"><input required value={eventEdit.type} onChange={(event) => setEventEdit((current) => ({ ...current, type: event.target.value }))} /></Field>
                <Field label="Venue">
                  <select required value={eventEdit.venueId} onChange={(event) => setEventEdit((current) => ({ ...current, venueId: event.target.value }))}>
                    {data.allVenues.map((venue) => (
                      <option key={venue.id} value={venue.id}>{venue.name} — {venue.location}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Date"><input required type="date" value={eventEdit.date} onChange={(event) => setEventEdit((current) => ({ ...current, date: event.target.value }))} /></Field>
                <Field label="Time"><input required type="time" value={eventEdit.time} onChange={(event) => setEventEdit((current) => ({ ...current, time: event.target.value }))} /></Field>
                <Field label="Expected guests"><input required min="1" type="number" value={eventEdit.expectedGuests} onChange={(event) => setEventEdit((current) => ({ ...current, expectedGuests: event.target.value }))} /></Field>
                <Field label="Status">
                  <select value={eventEdit.status} onChange={(event) => setEventEdit((current) => ({ ...current, status: event.target.value }))}>
                    {eventStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </Field>
                <Field label="Dress code"><input value={eventEdit.dressCode} onChange={(event) => setEventEdit((current) => ({ ...current, dressCode: event.target.value }))} /></Field>
                <Field label="Agenda"><input value={eventEdit.agenda} onChange={(event) => setEventEdit((current) => ({ ...current, agenda: event.target.value }))} /></Field>
                <Button disabled={actionStatus.loading}>Save changes</Button>
              </form>
            )}
          </Panel>

          <Panel title="Venue Search" eyebrow="Booking" className="span-8">
            <div className="filters-row">
              <Field label="Location"><input value={venueFilters.location} onChange={(event) => patchFilter(setVenueFilters, "location", event.target.value)} /></Field>
              <Field label="Date"><input type="date" value={venueFilters.date} onChange={(event) => patchFilter(setVenueFilters, "date", event.target.value)} /></Field>
              <Field label="Min capacity"><input type="number" value={venueFilters.minCapacity} onChange={(event) => patchFilter(setVenueFilters, "minCapacity", event.target.value)} /></Field>
              <Field label="Min size (sqm)"><input type="number" value={venueFilters.minSizeSqm} onChange={(event) => patchFilter(setVenueFilters, "minSizeSqm", event.target.value)} placeholder="Any" /></Field>
              <Field label="Active"><select value={venueFilters.active} onChange={(event) => patchFilter(setVenueFilters, "active", event.target.value)}><option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></select></Field>
            </div>
            <div className="stack">
              {data.venues.length ? data.venues.map((venue) => (
                <article className="compact-card" key={venue.id}>
                  <div>
                    <strong>{venue.name}</strong>
                    <span>{venue.location} · {venue.capacity} guests · {venue.sizeSqm} sqm · {money(venue.pricePerDay)} / day</span>
                    <span>{venue.amenities?.join(", ")} · Unavailable: {venue.unavailableDates?.join(", ") || "None"}</span>
                  </div>
                  <Button disabled={actionStatus.loading} variant="secondary" onClick={() => bookVenue(venue)}>Request booking</Button>
                </article>
              )) : <EmptyState title="No venues match" text="Adjust filters to discover available venues." />}
            </div>
          </Panel>

          <Panel title="Booking Requests" eyebrow="Status" className="span-4">
            <div className="stack workspace-bookings">
              {data.bookings.length ? data.bookings.slice(0, 8).map((booking) => (
                <article className="compact-card" key={booking.id}>
                  <div>
                    <strong>{venueLabel(booking.venueId)}</strong>
                    <span>{booking.date} · {booking.attendees} guests · {booking.eventType}</span>
                  </div>
                  <Badge value={booking.status} />
                </article>
              )) : <EmptyState title="No booking requests" text="Apply for a venue to start the approval flow." />}
            </div>
          </Panel>

          <Panel title="Vendor Coordination" eyebrow="Procurement" className="span-6">
            <div className="filters-row">
              <Field label="Search"><input value={vendorFilters.search} onChange={(event) => patchFilter(setVendorFilters, "search", event.target.value)} /></Field>
              <Field label="Supply"><input value={vendorFilters.supply} onChange={(event) => patchFilter(setVendorFilters, "supply", event.target.value)} /></Field>
            </div>
            <form className="form-grid" onSubmit={(event) => submitForm(event, "Sourcing request sent.", (values) => api("/sourcing-requests", { method: "POST", body: JSON.stringify({ ...values, organizerId, eventId: selectedEventId }) }, token))}>
              <Field label="Vendor"><select name="vendorId" required>{data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}</select></Field>
              <Field label="Requested items"><input name="requestedItems" required placeholder="Buffet lunch, coffee stations" /></Field>
              <Field label="Quantities"><input name="quantities" required placeholder="200 meals, 3 stations" /></Field>
              <Field label="Delivery date"><input name="deliveryDate" required type="date" /></Field>
              <Field label="Note"><input name="note" placeholder="Optional delivery notes" /></Field>
              <Button disabled={actionStatus.loading}>Send request</Button>
            </form>
            <div className="section-divider">
              <p className="eyebrow">Vendor directory</p>
              <Table columns={["Vendor", "Supplies", "Location", "Pricing"]} rows={data.vendors.map((vendor) => [<strong>{vendor.companyName}</strong>, vendor.supplies.join(", "), vendor.mainLocation, vendor.pricingList])} />
            </div>
            <div className="section-divider">
              <p className="eyebrow">Sourcing history — {selectedEvent?.name}</p>
              <Table
                columns={["Vendor", "Items", "Delivery", "Status"]}
                rows={data.sourcingRequests.map((request) => [
                  <strong>{vendorLabel(request.vendorId)}</strong>,
                  `${request.requestedItems} (${request.quantities})`,
                  request.deliveryDate,
                  <Badge value={request.status} />
                ])}
              />
            </div>
          </Panel>

          <Panel title="Guest Management" eyebrow="Invitations" className="span-6">
            <div className="filters-row">
              <Field label="Search"><input value={guestFilters.search} onChange={(event) => patchFilter(setGuestFilters, "search", event.target.value)} /></Field>
              <Field label="RSVP"><select value={guestFilters.rsvp} onChange={(event) => patchFilter(setGuestFilters, "rsvp", event.target.value)}><option value="">All</option>{rsvpStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="Dietary"><input value={guestFilters.dietary} onChange={(event) => patchFilter(setGuestFilters, "dietary", event.target.value)} placeholder="Vegan, halal..." /></Field>
              <Field label="Check-in"><select value={guestFilters.checkedIn} onChange={(event) => patchFilter(setGuestFilters, "checkedIn", event.target.value)}><option value="">All</option><option value="true">Checked in</option><option value="false">Not arrived</option></select></Field>
            </div>
            <form className="form-grid" onSubmit={(event) => submitForm(event, "Guest added.", (values) => api("/guests", { method: "POST", body: JSON.stringify({ ...values, eventId: selectedEventId }) }, token))}>
              <Field label="Name"><input name="name" required /></Field>
              <Field label="Email"><input name="email" required type="email" /></Field>
              <Field label="RSVP"><select name="rsvp">{rsvpStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="Dietary preference"><input name="dietaryPreference" defaultValue="None" /></Field>
              <Button disabled={actionStatus.loading}>Add guest</Button>
            </form>
            {editingGuest && (
              <form className="form-grid workspace-edit-form" onSubmit={saveGuestEdit}>
                <p className="eyebrow">Editing {editingGuest.name}</p>
                <Field label="Name"><input name="name" required defaultValue={editingGuest.name} /></Field>
                <Field label="Email"><input name="email" required type="email" defaultValue={editingGuest.email} /></Field>
                <Field label="RSVP"><select name="rsvp" defaultValue={editingGuest.rsvp}>{rsvpStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
                <Field label="Dietary preference"><input name="dietaryPreference" defaultValue={editingGuest.dietaryPreference} /></Field>
                <div className="inline-actions">
                  <Button disabled={actionStatus.loading}>Save guest</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingGuest(null)}>Cancel</Button>
                </div>
              </form>
            )}
            <Table
              columns={["Guest", "RSVP", "Diet", "Invite", "Check-in", "Actions"]}
              rows={data.guests.map((guest) => [
                <strong>{guest.name}</strong>,
                <Badge value={guest.rsvp} />,
                guest.dietaryPreference,
                guest.invitationSent ? <Badge value="Sent" /> : <Button disabled={actionStatus.loading} variant="secondary" onClick={() => runAction("Invitation marked as sent.", async () => { await api(`/guests/${guest.id}`, { method: "PATCH", body: JSON.stringify({ invitationSent: true }) }, token); refresh(); })}>Mark sent</Button>,
                guest.checkedIn ? "Checked in" : "Pending",
                <div className="table-actions">
                  <Button disabled={actionStatus.loading} variant="secondary" onClick={() => setEditingGuest(guest)}>Edit</Button>
                  <Button disabled={actionStatus.loading} variant="secondary" onClick={() => setConfirmDeleteGuest(guest)}>Delete</Button>
                </div>
              ])}
            />
          </Panel>

          <Panel title="Invitation Generator" eyebrow="Guest invitations" className="span-12 invitation-generator-panel">
            <div className="inline-actions no-print">
              <Button disabled={!selectedEvent || !data.allEventGuests.length} variant="secondary" onClick={printInvitationCards}>
                Print all invitations
              </Button>
              <span className="panel-footnote">
                {data.allEventGuests.length
                  ? `${data.allEventGuests.length} invitation${data.allEventGuests.length === 1 ? "" : "s"} for ${selectedEvent?.name || "this event"} — use Print this invitation on each card for one guest at a time`
                  : "Add guests above to generate invitations."}
              </span>
            </div>
            {selectedEvent && data.allEventGuests.length ? (
              <div className="invitation-grid">
                {data.allEventGuests.map((guest) => (
                  <GuestInvitationCard
                    dressCode={selectedEvent.dressCode}
                    event={selectedEvent}
                    guest={guest}
                    key={guest.id}
                    onPrint={printSingleInvitation}
                    venueName={venueLabel(selectedEvent.venueId)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No guest invitations yet"
                text="Add guests in Guest Management to generate personalized invitations with QR codes."
              />
            )}
          </Panel>

          <Panel title="Budget Planning" eyebrow="Budget" className="span-6">
            <div className="budget-summary-row">
              <StatCard label="Planned" value={money(Number(totalPlanned))} />
              <StatCard label="Actual" value={money(data.budget?.actualTotal || 0)} />
              <StatCard label="Remaining" value={money(budgetDifference)} hint={budgetDifference >= 0 ? "Under plan" : "Over plan"} />
            </div>
            <ProgressBar value={data.budget?.actualTotal || 0} max={Number(totalPlanned) || 1} />
            <form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction("Budget plan saved.", async () => { await api(`/budgets/${selectedEventId}/plan`, { method: "PUT", body: JSON.stringify({ totalPlanned: Number(totalPlanned), plannedItems: linesToItems(budgetDraft) }) }, token); refresh(); }); }}>
              <Field label="Total planned"><input value={totalPlanned} onChange={(event) => setTotalPlanned(event.target.value)} type="number" /></Field>
              <Field label="Planned items (name:amount, one per line)"><textarea rows="5" value={budgetDraft} onChange={(event) => setBudgetDraft(event.target.value)} placeholder="Venue:45000&#10;Catering:90000" /></Field>
              <Button disabled={actionStatus.loading}>Save budget plan</Button>
            </form>
            <div className="section-divider">
              <p className="eyebrow">Planned breakdown</p>
              <Table
                columns={["Item", "Amount"]}
                rows={(data.budget?.plannedItems || []).map((item) => [<strong>{item.name}</strong>, money(item.amount)])}
              />
            </div>
          </Panel>

          <Panel title="Actual Expenses" eyebrow="Budget" className="span-6">
            {editingExpense ? (
              <form className="form-grid workspace-edit-form" onSubmit={saveExpenseEdit}>
                <p className="eyebrow">Editing {editingExpense.name}</p>
                <Field label="Expense name"><input name="name" required defaultValue={editingExpense.name} /></Field>
                <Field label="Amount"><input name="amount" min="1" required type="number" defaultValue={editingExpense.amount} /></Field>
                <Field label="Paid on"><input name="paidOn" type="date" defaultValue={editingExpense.paidOn || ""} /></Field>
                <div className="table-actions">
                  <Button disabled={actionStatus.loading}>Save changes</Button>
                  <Button disabled={actionStatus.loading} type="button" variant="secondary" onClick={() => setEditingExpense(null)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <form className="form-grid" onSubmit={(event) => submitForm(event, "Actual expense added.", (values) => api(`/budgets/${selectedEventId}/expenses`, { method: "POST", body: JSON.stringify({ ...values, amount: Number(values.amount) }) }, token))}>
                <Field label="Expense name"><input name="name" required placeholder="Venue deposit" /></Field>
                <Field label="Amount"><input name="amount" min="1" required type="number" /></Field>
                <Field label="Paid on"><input name="paidOn" type="date" /></Field>
                <Button disabled={actionStatus.loading}>Add expense</Button>
              </form>
            )}
            <div className="section-divider">
              <p className="eyebrow">Recorded expenses</p>
              <Table
                columns={["Expense", "Amount", "Paid on", "Actions"]}
                rows={(data.budget?.actualExpenses || []).map((expense) => [
                  <strong>{expense.name}</strong>,
                  money(expense.amount),
                  expense.paidOn || "—",
                  <div className="table-actions" key={expense.id}>
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => setEditingExpense(expense)}>Edit</Button>
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => deleteExpense(expense)}>Remove</Button>
                  </div>
                ])}
              />
            </div>
          </Panel>

          <Panel title="Team Members" eyebrow="Staff" className="span-12">
            <div className="filters-row">
              <Field label="Employment">
                <select value={staffFilters.employmentType} onChange={(event) => setStaffFilters((current) => ({ ...current, employmentType: event.target.value }))}>
                  <option value="">All types</option>
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                </select>
              </Field>
              <Field label="Speciality">
                <select value={staffFilters.speciality} onChange={(event) => setStaffFilters((current) => ({ ...current, speciality: event.target.value }))}>
                  <option value="">All specialities</option>
                  {staffSpecialities.map((speciality) => (
                    <option key={speciality} value={speciality}>{speciality}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="stack">
              {filteredStaff.length ? filteredStaff.map((member) => (
                <article className="compact-card" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.email} · {member.employmentType || "—"} · {member.speciality || "General"} · age {member.age || "—"}</span>
                  </div>
                  <Badge value={member.status} />
                </article>
              )) : (
                <EmptyState title="No staff match" text="Adjust filters or create staff accounts from Overview." />
              )}
            </div>
            <div className="section-divider">
              <p className="eyebrow">Staff tasks — {selectedEvent?.name}</p>
              <Table
                columns={["Task", "Category", "Due", "Assignee", "Status"]}
                rows={data.eventTasks.map((task) => [
                  <strong>{task.title}</strong>,
                  task.category,
                  task.dueDate,
                  staffName(task.assignedTo),
                  <Badge value={task.status} />
                ])}
              />
            </div>
          </Panel>

          <ConfirmModal
            open={Boolean(confirmDeleteGuest)}
            title="Remove guest"
            message={confirmDeleteGuest ? `Remove ${confirmDeleteGuest.name} from ${selectedEvent?.name}?` : ""}
            confirmLabel="Remove guest"
            loading={actionStatus.loading}
            onConfirm={confirmRemoveGuest}
            onCancel={() => setConfirmDeleteGuest(null)}
          />
        </>
      )}

      {activePage === "operations" && (
        <>
          <PageIntro
            eyebrow="Live execution"
            title="Control event operations"
            text="Run day-of workflows for the selected event: assign staff tasks, review vendor invoices, monitor guest arrivals, track deliveries, broadcast updates, and coordinate the venue layout."
            items={["Active event context", "Task and invoice control", "Live attendance", "Messaging and layout"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Active event</p>
                <h2>{selectedEvent?.name || "No event selected"}</h2>
                <p className="workspace-context-copy">
                  Operations actions apply to this event. Switch events here or from Overview / Workspace.
                </p>
              </div>
              <Field label="Switch event">
                <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
                  {organizerEvents.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            {selectedEvent && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Date</strong> {selectedEvent.date} at {selectedEvent.time}</span>
                <span className="workspace-pill"><strong>Venue</strong> {venueLabel(selectedEvent.venueId)}</span>
                <span className="workspace-pill"><Badge value={selectedEvent.status} /></span>
                <span className="workspace-pill"><strong>Checked in</strong> {operationsAttendance.arrived} / {operationsAttendance.invited}</span>
                <span className="workspace-pill"><strong>RSVP yes</strong> {operationsAttendance.rsvpAttending}</span>
              </div>
            )}
          </section>

          <section className="stats-row span-12">
            <StatCard label="Checked in" value={`${operationsAttendance.arrived} / ${operationsAttendance.invited}`} hint="Live entrance progress" />
            <StatCard label="RSVP attending" value={operationsAttendance.rsvpAttending} hint="Expected arrivals" />
            <StatCard label="Open tasks" value={openTasks} hint="Not marked done" />
            <StatCard label="Invoices pending" value={pendingInvoices} hint="Awaiting review" />
          </section>

          <Panel title="Workflow Tasks" eyebrow="Operations" className="span-7">
            <div className="filters-row">
              <Field label="Status"><select value={taskFilters.status} onChange={(event) => patchFilter(setTaskFilters, "status", event.target.value)}><option value="">All</option>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="Assignee"><select value={taskFilters.assignedTo} onChange={(event) => patchFilter(setTaskFilters, "assignedTo", event.target.value)}><option value="">All</option>{data.staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
            </div>
            <form className="form-grid" onSubmit={(event) => submitForm(event, "Task created.", (values) => api("/tasks", { method: "POST", body: JSON.stringify({ ...values, eventId: selectedEventId }) }, token))}>
              <Field label="Title"><input name="title" required placeholder="Confirm AV setup" /></Field>
              <Field label="Category"><input name="category" required placeholder="Logistics" /></Field>
              <Field label="Due date"><input name="dueDate" required type="date" /></Field>
              <Field label="Assign to"><select name="assignedTo"><option value="">Not assigned</option>{data.staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
              <Button disabled={actionStatus.loading}>Create task</Button>
            </form>
            {editingTask && (
              <form className="form-grid workspace-edit-form" onSubmit={saveTaskEdit}>
                <p className="eyebrow">Editing {editingTask.title}</p>
                <Field label="Title"><input required value={editingTask.title} onChange={(event) => setEditingTask((current) => ({ ...current, title: event.target.value }))} /></Field>
                <Field label="Category"><input required value={editingTask.category} onChange={(event) => setEditingTask((current) => ({ ...current, category: event.target.value }))} /></Field>
                <Field label="Due date"><input required type="date" value={editingTask.dueDate} onChange={(event) => setEditingTask((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                <Field label="Assign to">
                  <select value={editingTask.assignedTo || ""} onChange={(event) => setEditingTask((current) => ({ ...current, assignedTo: event.target.value }))}>
                    <option value="">Not assigned</option>
                    {data.staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={editingTask.status} onChange={(event) => setEditingTask((current) => ({ ...current, status: event.target.value }))}>
                    {taskStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </Field>
                <div className="inline-actions">
                  <Button disabled={actionStatus.loading}>Save task</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingTask(null)}>Cancel</Button>
                </div>
              </form>
            )}
            <div className="stack">
              {data.tasks.length ? data.tasks.map((task) => (
                <article className="compact-card" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.category} · due {task.dueDate} · {staffName(task.assignedTo)}</span>
                  </div>
                  <div className="inline-actions">
                    <Badge value={task.status} />
                    <select aria-label="Assign task" value={task.assignedTo || ""} onChange={(event) => runAction("Task assignment updated.", async () => { await api(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ assignedTo: event.target.value || null, status: event.target.value ? "Pending" : "Not Assigned" }) }, token); refresh(); })}>
                      <option value="">Unassigned</option>{data.staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateTask(task, "In Progress")}>Start</Button>
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateTask(task, "Done")}>Done</Button>
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => setEditingTask({ ...task, assignedTo: task.assignedTo || "" })}>Edit</Button>
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => setConfirmDeleteTask(task)}>Delete</Button>
                  </div>
                </article>
              )) : <EmptyState title="No tasks yet" text="Create a task to coordinate staff during the event." />}
            </div>
          </Panel>

          <Panel title="Invoice Review" eyebrow="Controls" className="span-5">
            <div className="filters-row">
              <Field label="Status">
                <select value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value)}>
                  <option value="">All</option>
                  <option value="Pending Review">Pending Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Paid">Paid</option>
                </select>
              </Field>
            </div>
            <div className="stack">
              {filteredInvoices.length ? filteredInvoices.map((invoice) => (
                <article className="compact-card" key={invoice.id}>
                  <div>
                    <strong>{money(invoice.amount)}</strong>
                    <span>{vendorLabel(invoice.vendorId)} · {invoice.breakdown}</span>
                    {invoice.attachment && <span style={{display: "block", marginTop: "0.25rem"}}>Attachment: <a href="#" onClick={(e) => { e.preventDefault(); alert(`Opening simulated attachment: ${invoice.attachment}`); }} style={{color: '#2563eb', textDecoration: 'underline'}}>{invoice.attachment}</a></span>}
                    <span>Submitted {invoice.submittedAt || "—"}{invoice.reviewNote ? ` · ${invoice.reviewNote}` : ""}</span>
                  </div>
                  <div className="inline-actions">
                    <Badge value={invoice.status} />
                    {invoice.status === "Pending Review" && <><Button disabled={actionStatus.loading} variant="secondary" onClick={() => reviewInvoice(invoice, "Approved")}>Approve</Button><Button disabled={actionStatus.loading} variant="secondary" onClick={() => reviewInvoice(invoice, "Rejected")}>Reject</Button></>}
                    {invoice.status === "Approved" && <Button disabled={actionStatus.loading} variant="secondary" onClick={() => reviewInvoice(invoice, "Paid")}>Mark Paid</Button>}
                  </div>
                </article>
              )) : <EmptyState title="No invoices" text="Vendor invoices for this event will appear here for review." />}
            </div>
          </Panel>

          <Panel title="Day-Of Messages" eyebrow="Communications" className="span-4 ops-communications-row">
            <form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction("Message sent to event guests.", async () => { await api("/messages", { method: "POST", body: JSON.stringify({ eventId: selectedEventId, body: messageText }) }, token); refresh(); }); }}>
              <Field label="Message"><textarea rows="4" value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Registration is now open at the main entrance." /></Field>
              <Button disabled={actionStatus.loading || !messageText}>Send message</Button>
            </form>
            <div className="stack">
              {data.messages.length ? data.messages.map((message) => (
                <article className="compact-card" key={message.id}>
                  <div>
                    <strong>{message.body}</strong>
                    <span>Sent {formatDateTime(message.sentAt)} · {message.seenBy?.length || 0} seen / {unseenGuestCount(message)} unseen</span>
                    {unseenGuestLabels(message).length > 0 && (
                      <span className="message-unseen">Not seen yet: {unseenGuestLabels(message).join(", ")}</span>
                    )}
                  </div>
                  <Button disabled={actionStatus.loading || unseenGuestCount(message) === 0} variant="secondary" onClick={() => sendFollowUp(message)}>Follow up</Button>
                </article>
              )) : <EmptyState title="No messages sent" text="Broadcast an update to all guests on this event." />}
            </div>
          </Panel>

          <Panel title="Live Attendance" eyebrow="Entrance desk" className="span-4 panel-side panel-side-attendance ops-communications-row">
            <div className="stack panel-side-list panel-attendance-list">
              {data.allEventGuests.length ? data.allEventGuests.slice(0, 8).map((guest) => (
                <article className="compact-card compact-card-vertical attendance-card" key={guest.id}>
                  <strong>{guest.name}</strong>
                  <div className="inline-meta">
                    <Badge value={guest.rsvp} />
                    {guest.checkedIn ? <Badge value="Checked In" /> : <Badge value="Pending" />}
                  </div>
                </article>
              )) : <EmptyState title="No guests" text="Guests for this event will appear here." />}
            </div>
            <div className="attendance-progress-wrap">
              <ProgressBar value={operationsAttendance.arrived} max={operationsAttendance.invited || 1} />
            </div>
            {data.allEventGuests.length > 8 && <p className="panel-footnote">Showing 8 of {data.allEventGuests.length} guests.</p>}
          </Panel>

          <Panel title="Vendor Deliveries" eyebrow="Procurement" className="span-4 panel-side panel-side-delivery ops-communications-row">
            <div className="stack panel-side-list">
              {data.sourcingRequests.length ? data.sourcingRequests.map((request) => (
                <article className="compact-card compact-card-vertical delivery-card" key={request.id}>
                  <strong>{vendorLabel(request.vendorId)}</strong>
                  <span>{request.requestedItems}</span>
                  <span className="delivery-date">Delivery {request.deliveryDate}</span>
                  <div className="inline-meta">
                    <Badge value={request.status} />
                  </div>
                </article>
              )) : <EmptyState title="No deliveries" text="Sourcing requests for this event will appear here." />}
            </div>
          </Panel>

          <LayoutPanel eventId={selectedEventId} refresh={refresh} refreshKey={refreshKey} token={token} editable className="span-12" />

          <ConfirmModal
            open={Boolean(confirmDeleteTask)}
            title="Delete task"
            message={confirmDeleteTask ? `Remove "${confirmDeleteTask.title}" from ${selectedEvent?.name}?` : ""}
            confirmLabel="Delete task"
            loading={actionStatus.loading}
            onConfirm={confirmRemoveTask}
            onCancel={() => setConfirmDeleteTask(null)}
          />
        </>
      )}

      {activePage === "reports" && (
        <>
          <PageIntro
            eyebrow="Post-event intelligence"
            title="Review results and export reports"
            text="Review attendance, budget, guest feedback, invoices, task completion, and the venue layout for the selected event. Print the page for stakeholder submission."
            items={["Event context", "Attendance and costs", "Guest feedback", "Printable export"]}
          />
          <ReportAndLayout
            report={data.report}
            budget={data.budget}
            invoices={data.invoices}
            feedback={data.eventFeedback}
            tasks={data.eventTasks}
            sourcingRequests={data.sourcingRequests}
            guests={data.allEventGuests}
            messagesCount={data.messages.length}
            selectedEvent={selectedEvent}
            selectedEventId={selectedEventId}
            organizerEvents={organizerEvents}
            onEventChange={setSelectedEventId}
            venueLabel={venueLabel}
            vendorLabel={vendorLabel}
            allVenues={data.allVenues}
            allEvents={data.allEvents}
            allFeedback={data.allFeedback}
            refresh={refresh}
            refreshKey={refreshKey}
            token={token}
            eventId={selectedEventId}
          />
        </>
      )}
    </DashboardGrid>
  );
}

function StaffDashboard({ activePage, refresh, refreshKey, token, user }) {
  const { actionStatus, runAction } = useActionStatus();
  const staffId = user?.id || STAFF_ID;
  const [selectedEventId, setSelectedEventId] = useState(EVENT_ID);
  const [guestFilters, setGuestFilters] = useState({ rsvp: "", checkedIn: "", search: "", dietary: "" });
  const [eventDate, setEventDate] = useState("");
  const [vendorStatusFilter, setVendorStatusFilter] = useState("");
  const [taskFilters, setTaskFilters] = useState({ status: "", eventId: "", category: "" });
  const [taskBoardScope, setTaskBoardScope] = useState("open");
  const [opsTaskStatusFilter, setOpsTaskStatusFilter] = useState("");

  const dashboard = useApi("/dashboard", refreshKey);
  const tasks = useApi(`/tasks?assignedTo=${staffId}`, refreshKey, token);
  const allEvents = useApi("/events", refreshKey);
  const allVenues = useApi("/venues", refreshKey);
  const events = useApi(`/events?${queryString({ date: eventDate })}`, refreshKey);
  const guests = useApi(`/guests?${queryString({ eventId: selectedEventId, ...guestFilters })}`, refreshKey);
  const allEventGuests = useApi(`/guests?eventId=${selectedEventId}`, refreshKey);
  const allVendors = useApi("/vendors", refreshKey);
  const messages = useApi(`/messages?eventId=${selectedEventId}`, refreshKey);
  const requests = useApi(`/sourcing-requests?eventId=${selectedEventId}`, refreshKey);

  const staffTasks = tasks.data || [];
  const staffEventIds = [...new Set(staffTasks.map((task) => task.eventId))];
  const staffEvents = (allEvents.data || []).filter((event) => staffEventIds.includes(event.id));
  const selectedEvent =
    staffEvents.find((event) => event.id === selectedEventId) ||
    staffEvents[0] ||
    (allEvents.data || []).find((event) => event.id === EVENT_ID);
  const selectedEventTasks = staffTasks.filter((task) => task.eventId === selectedEventId);
  const openTasks = staffTasks.filter((task) => task.status !== "Done");
  const demoToday = dashboard.data?.today || today();
  const dueSoon = openTasks.filter((task) => task.dueDate <= demoToday);
  const eventGuests = guests.data || [];
  const allGuestsForEvent = allEventGuests.data || [];
  const checkedInCount = allGuestsForEvent.filter((guest) => guest.checkedIn).length;
  const operationsAttendance = {
    invited: allGuestsForEvent.length,
    arrived: checkedInCount,
    rsvpAttending: allGuestsForEvent.filter((guest) => guest.rsvp === "Attending").length
  };
  const pendingDeliveries = (requests.data || []).filter((request) => request.status !== "Delivered").length;
  const filteredVendorRequests = vendorStatusFilter
    ? (requests.data || []).filter((request) => request.status === vendorStatusFilter)
    : (requests.data || []);
  const eventOpenTasks = selectedEventTasks.filter((task) => task.status !== "Done");
  const filteredOpsTasks = opsTaskStatusFilter
    ? eventOpenTasks.filter((task) => task.status === opsTaskStatusFilter)
    : eventOpenTasks;
  const completedTasks = staffTasks.filter((task) => task.status === "Done").length;
  const reminderTasks = openTasks.filter((task) => task.reminder && task.dueDate <= demoToday);
  const filteredStaffTasks = staffTasks.filter((task) => {
    if (taskBoardScope === "open" && task.status === "Done") return false;
    if (taskBoardScope === "done" && task.status !== "Done") return false;
    if (taskFilters.status && task.status !== taskFilters.status) return false;
    if (taskFilters.eventId && task.eventId !== taskFilters.eventId) return false;
    if (taskFilters.category && !task.category.toLowerCase().includes(taskFilters.category.toLowerCase())) return false;
    return true;
  });
  const filteredScheduleEvents = eventDate
    ? (events.data || []).filter((event) => staffEventIds.includes(event.id))
    : staffEvents;

  useEffect(() => {
    const ids = [...new Set(staffTasks.map((task) => task.eventId))];
    const events = (allEvents.data || []).filter((event) => ids.includes(event.id));
    if (!events.length) return;
    setSelectedEventId((current) => (events.some((event) => event.id === current) ? current : events[0].id));
  }, [tasks.data, allEvents.data]);

  function venueLabel(venueId) {
    return (allVenues.data || []).find((venue) => venue.id === venueId)?.name || venueId;
  }

  function vendorLabel(vendorId) {
    return (allVendors.data || []).find((vendor) => vendor.id === vendorId)?.companyName || vendorId;
  }

  function vendorDetails(vendorId) {
    return (allVendors.data || []).find((vendor) => vendor.id === vendorId);
  }

  function taskCountForEvent(eventId) {
    return staffTasks.filter((task) => task.eventId === eventId).length;
  }

  function openTaskCountForEvent(eventId) {
    return staffTasks.filter((task) => task.eventId === eventId && task.status !== "Done").length;
  }

  function vendorActiveDeliveries(vendorId) {
    const items = (requests.data || []).filter((request) => request.vendorId === vendorId);
    const active = items.filter((request) => request.status !== "Delivered").length;
    return active ? `${active} active` : "Complete";
  }

  async function updateProgress(task, status) {
    await runAction(`Task moved to ${status}.`, async () => {
      await api(`/staff/${staffId}/tasks/${task.id}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      }, token);
      refresh();
    });
  }

  async function checkIn(guest) {
    await runAction(`${guest.name} checked in successfully.`, async () => {
      await api(`/guests/${guest.id}`, { method: "PATCH", body: JSON.stringify({ checkedIn: true }) }, token);
      refresh();
    });
  }

  async function markVendorArrived(request) {
    await runAction("Vendor delivery confirmed.", async () => {
      await api(`/sourcing-requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ status: "Delivered", arrivalConfirmedBy: staffId }) }, token);
      refresh();
    });
  }

  return (
    <DashboardGrid>
      <ActionMessage status={actionStatus} />
      {activePage === "overview" && (
        <>
          <PageIntro
            eyebrow="Shift briefing"
            title="Staff overview"
            text="Your shift command center: assigned tasks, active event context, guest arrival progress, vendor deliveries, and live messages in one place."
            items={["Active event", "Task priorities", "Guest arrivals", "Delivery status"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">On duty</p>
                <h2>{user?.name || "Staff member"}</h2>
                <p className="workspace-context-copy">
                  Focus on the selected event below. Stats and panels update when you switch assignments.
                </p>
              </div>
              {staffEvents.length > 0 && (
                <Field label="Active event">
                  <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
                    {staffEvents.map((event) => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {selectedEvent && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Today</strong> {demoToday}</span>
                <span className="workspace-pill"><strong>Event date</strong> {selectedEvent.date} at {selectedEvent.time}</span>
                <span className="workspace-pill"><strong>Venue</strong> {venueLabel(selectedEvent.venueId)}</span>
                <span className="workspace-pill"><Badge value={selectedEvent.status} /></span>
                <span className="workspace-pill"><strong>My tasks here</strong> {selectedEventTasks.length}</span>
              </div>
            )}
          </section>

          <section className="stats-row span-12">
            <StatCard label="Open tasks" value={openTasks.length} hint={`${staffTasks.length} assigned overall`} />
            <StatCard label="Due now" value={dueSoon.length} hint={`Due on or before ${demoToday}`} />
            <StatCard label="Guests checked in" value={`${checkedInCount} / ${allGuestsForEvent.length}`} hint={selectedEvent?.name || "Selected event"} />
            <StatCard label="Deliveries pending" value={pendingDeliveries} hint="Vendor requests not delivered" />
          </section>

          <Panel title="My Assigned Tasks" eyebrow="Priorities" className="span-7">
            {openTasks.length ? (
              <div className="stack">
                {openTasks.slice(0, 6).map((task) => (
                  <article className="compact-card" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>{task.category} · due {task.dueDate} · {(allEvents.data || []).find((event) => event.id === task.eventId)?.name || task.eventId}</span>
                    </div>
                    <div className="inline-actions">
                      <Badge value={task.status} />
                      <Button disabled={actionStatus.loading || task.status === "In Progress"} variant="secondary" onClick={() => updateProgress(task, "In Progress")}>Start</Button>
                      {task.status === "In Progress" && (
                        <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateProgress(task, "Pending")}>Pause</Button>
                      )}
                      <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateProgress(task, "Done")}>Done</Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="All tasks complete" text="You have no open assignments right now." />
            )}
          </Panel>

          <Panel title="Active Event Snapshot" eyebrow="Readiness" className="span-5">
            {!selectedEvent ? (
              <EmptyState title="No event selected" text="Choose an event you are assigned to." />
            ) : (
              <>
                <div className="mini-stats">
                  <StatCard label="RSVP pool" value={allGuestsForEvent.length} hint="Guests on list" />
                  <StatCard label="Checked in" value={checkedInCount} hint="Entrance desk" />
                  <StatCard label="Messages" value={(messages.data || []).length} hint="Day-of updates" />
                </div>
                <ProgressBar value={checkedInCount} max={allGuestsForEvent.length || 1} />
                <div className="section-divider">
                  <p className="eyebrow">Open tasks for this event</p>
                  {selectedEventTasks.filter((task) => task.status !== "Done").length ? (
                    <Table
                      columns={["Task", "Due", "Status"]}
                      rows={selectedEventTasks
                        .filter((task) => task.status !== "Done")
                        .slice(0, 4)
                        .map((task) => [<strong>{task.title}</strong>, task.dueDate, <Badge value={task.status} />])}
                    />
                  ) : (
                    <EmptyState title="Event tasks complete" text="All assignments for this event are done." />
                  )}
                </div>
              </>
            )}
          </Panel>

          <Panel title="My Event Schedule" eyebrow="Assignments" className="span-8">
            <div className="filters-row">
              <Field label="Filter by date"><input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></Field>
            </div>
            {filteredScheduleEvents.length ? (
              <Table
                columns={["Event", "Date", "Venue", "My tasks", "Open", "Status"]}
                rows={filteredScheduleEvents.map((event) => [
                  <strong>{event.name}</strong>,
                  `${event.date} at ${event.time}`,
                  venueLabel(event.venueId),
                  taskCountForEvent(event.id),
                  openTaskCountForEvent(event.id),
                  <Badge value={event.status} />
                ])}
              />
            ) : (
              <EmptyState title="No matching events" text="Adjust the date filter or wait for new assignments." />
            )}
          </Panel>

          <Panel title="Vendor Deliveries" eyebrow="Selected event" className="span-4">
            {(requests.data || []).length ? (
              <div className="stack panel-side-list">
                {(requests.data || []).map((request) => (
                  <article className="compact-card compact-card-vertical delivery-card" key={request.id}>
                    <strong>{request.requestedItems}</strong>
                    <span>{request.deliveryDate} · {request.eventLocation}</span>
                    <div className="inline-meta"><Badge value={request.status} /></div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No deliveries" text="No vendor requests for this event." />
            )}
          </Panel>

          <Panel title="Day-Of Messages" eyebrow="Communications" className="span-6">
            {(messages.data || []).length ? (
              <div className="stack">
                {(messages.data || []).map((message) => (
                  <article className="compact-card compact-card-vertical" key={message.id}>
                    <strong>{message.body}</strong>
                    <span>Sent {formatDateTime(message.sentAt)} · {message.seenBy?.length || 0} seen</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No messages" text="Organizer broadcasts for this event will appear here." />
            )}
          </Panel>

          <Panel title="Shift Priorities" eyebrow="Briefing" className="span-3 panel-side">
            <InfoList
              items={[
                { title: "Start assigned tasks", text: "Update each operational task as work begins so the organizer can track progress.", badge: "Action" },
                { title: "Prepare check-in desk", text: "Use guest QR codes and RSVP status to confirm arrivals at the entrance.", badge: "Day-of" },
                { title: "Confirm vendor arrivals", text: "Mark deliveries as arrived once supplies reach the venue.", badge: "Deliveries" }
              ]}
            />
          </Panel>

          <Panel title="Operational Notes" eyebrow="Context" className="span-3 panel-side">
            <InfoList
              items={[
                { title: "Layout reference", text: "Use Operations to view the floor plan for stage, seating, buffet, and check-in desk.", badge: "Layout" },
                { title: "Arrival visibility", text: "Guest check-in numbers feed the organizer dashboard and final attendance report.", badge: "Tracking" },
                { title: "Today in demo", text: `Operations date is set to ${demoToday} for portfolio testing.`, badge: "Demo" }
              ]}
            />
          </Panel>
        </>
      )}
      {activePage === "workspace" && (
        <>
          <PageIntro
            eyebrow="Assigned work"
            title="Complete operational tasks"
            text="Review your event schedule, filter assigned work, update task progress, and reference the organizer floor plan while preparing for day-of execution."
            items={["Event schedule", "Task filters", "Progress updates", "Layout reference"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Workspace event</p>
                <h2>{selectedEvent?.name || "No event selected"}</h2>
                <p className="workspace-context-copy">
                  Task filters and layout reference below follow the selected event. Switch events to focus on a different assignment.
                </p>
              </div>
              {staffEvents.length > 0 && (
                <Field label="Focus event">
                  <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
                    {staffEvents.map((event) => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {selectedEvent && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Today</strong> {demoToday}</span>
                <span className="workspace-pill"><strong>Event date</strong> {selectedEvent.date} at {selectedEvent.time}</span>
                <span className="workspace-pill"><strong>Venue</strong> {venueLabel(selectedEvent.venueId)}</span>
                <span className="workspace-pill"><Badge value={selectedEvent.status} /></span>
                <span className="workspace-pill"><strong>Open tasks</strong> {eventOpenTasks.length}</span>
                <span className="workspace-pill"><strong>Completed</strong> {selectedEventTasks.filter((task) => task.status === "Done").length}</span>
              </div>
            )}
          </section>

          <section className="stats-row span-12">
            <StatCard label="Assigned events" value={staffEvents.length} hint="Events you support" />
            <StatCard label="Open tasks" value={openTasks.length} hint={`${staffTasks.length} total assigned`} />
            <StatCard label="Due now" value={dueSoon.length} hint={`Due on or before ${demoToday}`} />
            <StatCard label="Completed" value={completedTasks} hint="Marked done" />
          </section>

          <Panel title="My Event Schedule" eyebrow="Participating events" className="span-5">
            <div className="filters-row">
              <Field label="Filter by date"><input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></Field>
            </div>
            {filteredScheduleEvents.length ? (
              <Table
                columns={["Event", "Date", "Open"]}
                rows={filteredScheduleEvents.map((event) => [
                  <strong>{event.name}</strong>,
                  `${event.date} at ${event.time}`,
                  openTaskCountForEvent(event.id)
                ])}
              />
            ) : (
              <EmptyState title="No matching events" text="Adjust the date filter or wait for new assignments." />
            )}
          </Panel>

          <Panel title="Task Reminders" eyebrow="Due soon" className="span-3 panel-side">
            {reminderTasks.length ? (
              <div className="stack panel-side-list">
                {reminderTasks.slice(0, 5).map((task) => (
                  <article className="compact-card compact-card-vertical" key={task.id}>
                    <strong>{task.title}</strong>
                    <span>{task.category} · due {task.dueDate}</span>
                    <div className="inline-meta"><Badge value={task.status} /></div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No reminders" text="Flagged tasks due today or earlier will appear here." />
            )}
          </Panel>

          <Panel title="Event Briefing" eyebrow="Context" className="span-4 panel-side">
            {selectedEvent ? (
              <InfoList
                items={[
                  { title: "Agenda", text: selectedEvent.agenda || "No agenda published yet.", badge: "Plan" },
                  { title: "Dress code", text: selectedEvent.dressCode || "Not specified.", badge: "Guests" },
                  { title: "Expected guests", text: `${selectedEvent.expectedGuests || "—"} invited · ${operationsAttendance.rsvpAttending} RSVP attending`, badge: "Scale" },
                  { title: "Deliveries pending", text: `${pendingDeliveries} vendor request(s) still need arrival confirmation.`, badge: "Logistics" }
                ]}
              />
            ) : (
              <EmptyState title="No event selected" text="Choose an assigned event to view briefing details." />
            )}
          </Panel>

          <Panel title="My Task Board" eyebrow="Staff operations" className="span-12">
            <div className="filters-row">
              <Field label="Show">
                <select value={taskBoardScope} onChange={(event) => setTaskBoardScope(event.target.value)}>
                  <option value="open">Open tasks</option>
                  <option value="all">All tasks</option>
                  <option value="done">Completed only</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={taskFilters.status} onChange={(event) => setTaskFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">All</option>
                  {taskStatuses.filter((status) => status !== "Not Assigned").map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </Field>
              <Field label="Event">
                <select value={taskFilters.eventId} onChange={(event) => setTaskFilters((current) => ({ ...current, eventId: event.target.value }))}>
                  <option value="">All assigned events</option>
                  {staffEvents.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Category"><input placeholder="Seating, Logistics..." value={taskFilters.category} onChange={(event) => setTaskFilters((current) => ({ ...current, category: event.target.value }))} /></Field>
            </div>
            {filteredStaffTasks.length ? (
              <Table
                columns={["Task", "Event", "Category", "Due", "Status", "Actions"]}
                rows={filteredStaffTasks.map((task) => [
                  <strong>{task.title}</strong>,
                  (allEvents.data || []).find((event) => event.id === task.eventId)?.name || task.eventId,
                  task.category,
                  task.dueDate,
                  <Badge value={task.status} />,
                  <div className="inline-actions">
                    <Button disabled={actionStatus.loading || task.status === "In Progress" || task.status === "Done"} variant="secondary" onClick={() => updateProgress(task, "In Progress")}>Start</Button>
                    {task.status === "In Progress" && (
                      <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateProgress(task, "Pending")}>Pause</Button>
                    )}
                    <Button disabled={actionStatus.loading || task.status === "Done"} variant="secondary" onClick={() => updateProgress(task, "Done")}>Done</Button>
                  </div>
                ])}
              />
            ) : (
              <EmptyState title="No tasks match" text="Adjust filters or wait for the organizer to assign new work." />
            )}
          </Panel>

          <LayoutPanel eventId={selectedEventId} refreshKey={refreshKey} className="span-12" />
        </>
      )}
      {activePage === "operations" && (
        <>
          <PageIntro
            eyebrow="Day-of operations"
            title="Event execution dashboard"
            text="Monitor attendance, check guests in at the entrance, confirm vendor deliveries, update your assigned tasks, and use the shared floor plan during the event."
            items={["Live attendance", "Guest check-in", "Vendor deliveries", "Venue layout"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Active event</p>
                <h2>{selectedEvent?.name || "No event selected"}</h2>
                <p className="workspace-context-copy">
                  All panels below apply to this event. Switch events to work on a different assignment.
                </p>
              </div>
              {staffEvents.length > 0 && (
                <Field label="Event">
                  <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
                    {staffEvents.map((event) => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {selectedEvent && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Today</strong> {demoToday}</span>
                <span className="workspace-pill"><strong>Starts</strong> {selectedEvent.date} at {selectedEvent.time}</span>
                <span className="workspace-pill"><strong>Venue</strong> {venueLabel(selectedEvent.venueId)}</span>
                <span className="workspace-pill"><Badge value={selectedEvent.status} /></span>
                <span className="workspace-pill"><strong>Checked in</strong> {operationsAttendance.arrived} / {operationsAttendance.invited}</span>
                <span className="workspace-pill"><strong>RSVP yes</strong> {operationsAttendance.rsvpAttending}</span>
              </div>
            )}
          </section>

          <section className="stats-row span-12">
            <StatCard label="Checked in" value={`${operationsAttendance.arrived} / ${operationsAttendance.invited}`} hint="Guests at the entrance" />
            <StatCard label="RSVP yes" value={operationsAttendance.rsvpAttending} hint="Expected to attend" />
            <StatCard label="Pending deliveries" value={pendingDeliveries} hint="Not yet confirmed" />
            <StatCard label="Open tasks" value={eventOpenTasks.length} hint="Your assignments here" />
          </section>

          <Panel title="Guest Check-In" eyebrow="Entrance desk" className="span-7">
            <div className="filters-row">
              <Field label="Search"><input placeholder="Name or email..." value={guestFilters.search} onChange={(event) => setGuestFilters((current) => ({ ...current, search: event.target.value }))} /></Field>
              <Field label="RSVP"><select value={guestFilters.rsvp} onChange={(event) => setGuestFilters((current) => ({ ...current, rsvp: event.target.value }))}><option value="">All</option>{rsvpStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="Arrival"><select value={guestFilters.checkedIn} onChange={(event) => setGuestFilters((current) => ({ ...current, checkedIn: event.target.value }))}><option value="">All</option><option value="true">Checked in</option><option value="false">Not arrived</option></select></Field>
              <Field label="Dietary"><input placeholder="Vegetarian, halal..." value={guestFilters.dietary} onChange={(event) => setGuestFilters((current) => ({ ...current, dietary: event.target.value }))} /></Field>
            </div>
            <div className="stack">
              {eventGuests.length ? eventGuests.map((guest) => (
                <article className="compact-card" key={guest.id}>
                  <div>
                    <strong>{guest.name}</strong>
                    <span>{guest.qrCode} · {guest.email}</span>
                    {guest.dietary && <span>Dietary: {guest.dietary}</span>}
                  </div>
                  <div className="inline-actions">
                    <Badge value={guest.rsvp} />
                    {guest.checkedIn ? <Badge value="Checked In" /> : <Button disabled={actionStatus.loading} variant="secondary" onClick={() => checkIn(guest)}>Check in</Button>}
                  </div>
                </article>
              )) : <EmptyState title="No guests found" text="Try different filters or select another event." />}
            </div>
          </Panel>

          <Panel title="Attendance Monitor" eyebrow="Live totals" className="span-5 panel-side panel-side-attendance">
            <div className="stack panel-side-list panel-attendance-list">
              {allGuestsForEvent.length ? allGuestsForEvent.slice(0, 8).map((guest) => (
                <article className="compact-card compact-card-vertical attendance-card" key={guest.id}>
                  <strong>{guest.name}</strong>
                  <div className="inline-meta">
                    <Badge value={guest.rsvp} />
                    {guest.checkedIn ? <Badge value="Checked In" /> : <Badge value="Not Arrived" />}
                  </div>
                </article>
              )) : <EmptyState title="No guests yet" text="Guest records for this event will appear here." />}
            </div>
            <div className="attendance-progress-wrap">
              <ProgressBar value={operationsAttendance.arrived} max={operationsAttendance.invited || 1} />
            </div>
            {allGuestsForEvent.length > 8 && <p className="panel-footnote">Showing 8 of {allGuestsForEvent.length} guests.</p>}
          </Panel>

          <Panel title="Vendor Deliveries" eyebrow="Arrival desk" className="span-7">
            <div className="filters-row">
              <Field label="Status">
                <select value={vendorStatusFilter} onChange={(event) => setVendorStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {["Pending", "Accepted", "Preparing", "Out for Delivery", "Delivered", "Delayed"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="stack">
              {filteredVendorRequests.length ? filteredVendorRequests.map((request) => {
                const vendor = vendorDetails(request.vendorId);
                return (
                  <article className="compact-card" key={request.id}>
                    <div>
                      <strong>{vendorLabel(request.vendorId)}</strong>
                      <span>{request.requestedItems}</span>
                      <span>{request.quantities} · {request.deliveryDate} · {request.eventLocation}</span>
                      {vendor?.contact && <span>{vendor.mainLocation} · {vendor.contact}</span>}
                      {request.note && <span>Note: {request.note}</span>}
                    </div>
                    <div className="inline-actions">
                      <Badge value={request.status} />
                      <Button disabled={actionStatus.loading || request.status === "Delivered"} variant="secondary" onClick={() => markVendorArrived(request)}>Confirm arrival</Button>
                    </div>
                  </article>
                );
              }) : <EmptyState title="No deliveries found" text="Vendor requests for this event will appear here." />}
            </div>
          </Panel>

          <Panel title="Supplier Directory" eyebrow="Event vendors" className="span-5 panel-side">
            {(requests.data || []).length ? (
              <Table
                columns={["Supplier", "Services", "Deliveries"]}
                rows={[...new Map((requests.data || []).map((request) => {
                  const vendor = vendorDetails(request.vendorId);
                  return [request.vendorId, [
                    <strong>{vendorLabel(request.vendorId)}</strong>,
                    vendor?.supplies?.slice(0, 2).join(", ") || "—",
                    vendorActiveDeliveries(request.vendorId)
                  ]];
                })).values()]}
              />
            ) : (
              <EmptyState title="No suppliers linked" text="Suppliers appear once the organizer creates sourcing requests." />
            )}
          </Panel>

          <Panel title="Assigned Tasks" eyebrow="Your work" className="span-8">
            <div className="filters-row">
              <Field label="Task status">
                <select value={opsTaskStatusFilter} onChange={(event) => setOpsTaskStatusFilter(event.target.value)}>
                  <option value="">All open tasks</option>
                  {["Pending", "In Progress"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </Field>
            </div>
            {filteredOpsTasks.length ? (
              <div className="stack">
                {filteredOpsTasks.map((task) => (
                  <article className="compact-card" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>{task.category} · due {task.dueDate}{task.reminder ? " · due soon" : ""}</span>
                    </div>
                    <div className="inline-actions">
                      <Badge value={task.status} />
                      <Button disabled={actionStatus.loading || task.status === "In Progress"} variant="secondary" onClick={() => updateProgress(task, "In Progress")}>Start</Button>
                      {task.status === "In Progress" && (
                        <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateProgress(task, "Pending")}>Pause</Button>
                      )}
                      <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateProgress(task, "Done")}>Done</Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No tasks to show" text="Adjust the filter or mark your assignments as done." />
            )}
          </Panel>

          <Panel title="Organizer Announcements" eyebrow="Day-of updates" className="span-4 panel-side">
            {(messages.data || []).length ? (
              <div className="stack panel-side-list">
                {(messages.data || []).map((message) => (
                  <article className="compact-card compact-card-vertical" key={message.id}>
                    <strong>{message.body}</strong>
                    <span>Sent {formatDateTime(message.sentAt)}</span>
                    <span>Seen by {message.seenBy?.length || 0} guest{(message.seenBy?.length || 0) === 1 ? "" : "s"}</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No announcements" text="Organizer messages for this event will appear here." />
            )}
          </Panel>

          {selectedEvent && (
            <Panel title="Event Details" eyebrow="Day-of reference" className="span-12">
              <InfoList
                items={[
                  { title: "Agenda", text: selectedEvent.agenda || "No agenda provided.", badge: "Schedule" },
                  { title: "Dress code", text: selectedEvent.dressCode || "Not specified.", badge: "Guests" },
                  { title: "Expected attendance", text: `${selectedEvent.expectedGuests || "—"} invited · ${operationsAttendance.rsvpAttending} RSVP yes · ${operationsAttendance.arrived} checked in`, badge: "Capacity" },
                  { title: "Venue", text: `${venueLabel(selectedEvent.venueId)} · ${selectedEvent.date} at ${selectedEvent.time}`, badge: "Location" }
                ]}
              />
            </Panel>
          )}

          <LayoutPanel eventId={selectedEventId} refreshKey={refreshKey} className="span-12" />
        </>
      )}
      {activePage === "reports" && (
        <>
          <PageIntro
            eyebrow="Staff reporting"
            title="Review completed work"
            text="This report summarizes assigned work and progress so staff can explain what was completed during the event preparation and operations."
            items={["Task history", "Completion status", "Due dates", "Team accountability"]}
          />
          <Panel title="Staff Operations Summary" eyebrow="Reports" className="span-12">
            <Table
              columns={["Task", "Event", "Category", "Due", "Status"]}
              rows={staffTasks.map((task) => [
                <strong>{task.title}</strong>,
                (allEvents.data || []).find((event) => event.id === task.eventId)?.name || task.eventId,
                task.category,
                task.dueDate,
                <Badge value={task.status} />
              ])}
            />
          </Panel>
        </>
      )}
    </DashboardGrid>
  );
}

function VendorDashboard({ activePage, refresh, refreshKey, token }) {
  const { actionStatus, runAction } = useActionStatus();
  const profile = useApi("/vendor/me/profile", refreshKey, token);
  const allEvents = useApi("/events", refreshKey);
  const vendorId = profile.data?.id || VENDOR_ID;
  const requests = useApi(`/sourcing-requests?vendorId=${vendorId}`, refreshKey, token);
  const invoices = useApi(`/invoices?vendorId=${vendorId}`, refreshKey, token);
  const [requestFilters, setRequestFilters] = useState({ status: "", eventId: "" });
  const [selectedOpsEventId, setSelectedOpsEventId] = useState(EVENT_ID);
  const [invoiceEventId, setInvoiceEventId] = useState(EVENT_ID);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("");
  const [invoiceRequestId, setInvoiceRequestId] = useState("");
  const [invoiceBreakdown, setInvoiceBreakdown] = useState("");
  const [invoiceAttachment, setInvoiceAttachment] = useState("");
  const [clarificationDrafts, setClarificationDrafts] = useState({});
  const [profileDraft, setProfileDraft] = useState(null);

  const vendorRequests = requests.data || [];
  const vendorInvoices = invoices.data || [];
  const vendorEventIds = [...new Set(vendorRequests.map((request) => request.eventId))];
  const vendorEvents = (allEvents.data || []).filter((event) => vendorEventIds.includes(event.id));
  const pendingRequests = vendorRequests.filter((request) => request.status === "Pending");
  const activeDeliveries = vendorRequests.filter((request) =>
    ["Accepted", "Preparing", "Out for Delivery", "Delayed"].includes(request.status)
  );
  const filteredRequests = vendorRequests.filter((request) => {
    if (requestFilters.status && request.status !== requestFilters.status) return false;
    if (requestFilters.eventId && request.eventId !== requestFilters.eventId) return false;
    return true;
  });
  const opsRequests = vendorRequests.filter((request) =>
    request.eventId === selectedOpsEventId &&
    ["Accepted", "Preparing", "Out for Delivery", "Delayed"].includes(request.status)
  );
  const filteredInvoices = invoiceStatusFilter
    ? vendorInvoices.filter((invoice) => invoice.status === invoiceStatusFilter)
    : vendorInvoices;
  const billableRequests = vendorRequests.filter((request) => request.status === "Delivered");
  const billingAlerts = vendorInvoices.filter((invoice) => invoice.reviewNote);
  const deliveredCount = vendorRequests.filter((request) => request.status === "Delivered").length;
  const selectedOpsEvent = vendorEvents.find((event) => event.id === selectedOpsEventId) || vendorEvents[0];

  useEffect(() => {
    if (!profile.data) return;
    setProfileDraft({
      companyName: profile.data.companyName || "",
      mainLocation: profile.data.mainLocation || "",
      pricingList: profile.data.pricingList || "",
      contact: profile.data.contact || "",
      supplies: (profile.data.supplies || []).join(", ")
    });
  }, [JSON.stringify(profile.data)]);

  useEffect(() => {
    if (!vendorEventIds.length) return;
    setSelectedOpsEventId((current) => (vendorEventIds.includes(current) ? current : vendorEventIds[0]));
    setInvoiceEventId((current) => (vendorEventIds.includes(current) ? current : vendorEventIds[0]));
  }, [requests.data, allEvents.data]);

  useEffect(() => {
    if (!invoiceRequestId) return;
    if (!billableRequests.some((request) => request.id === invoiceRequestId)) {
      setInvoiceRequestId("");
    }
  }, [requests.data, invoiceRequestId]);

  function selectInvoiceRequest(requestId) {
    setInvoiceRequestId(requestId);
    const request = vendorRequests.find((entry) => entry.id === requestId);
    if (!request) return;
    setInvoiceEventId(request.eventId);
    setInvoiceBreakdown(`${request.requestedItems} — ${request.quantities}`);
  }

  function eventName(eventId) {
    return (allEvents.data || []).find((event) => event.id === eventId)?.name || eventId;
  }

  async function updateRequest(request, status, note = request.note) {
    await runAction(`Request marked as ${status}.`, async () => {
      await api(`/sourcing-requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ status, note }) }, token);
      refresh();
    });
  }

  async function sendClarification(request) {
    const draft = clarificationDrafts[request.id]?.trim();
    if (!draft) return;
    const note = `${request.note || ""} Vendor clarification: ${draft}`.trim();
    await runAction("Clarification sent to the organizer.", async () => {
      await api(`/sourcing-requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ status: request.status, note }) }, token);
      setClarificationDrafts((current) => ({ ...current, [request.id]: "" }));
      refresh();
    });
  }

  async function reportDelay(request) {
    await updateRequest(request, "Delayed", `${request.note || ""} Delivery delay reported by vendor.`.trim());
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!profileDraft) return;
    await runAction("Vendor profile updated.", async () => {
      await api("/vendor/me/profile", {
        method: "PATCH",
        body: JSON.stringify(profileDraft)
      }, token);
      refresh();
    });
  }

  async function submitInvoice(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const linkedRequest = vendorRequests.find((entry) => entry.id === (values.requestId || invoiceRequestId));
    await runAction("Invoice submitted to the organizer.", async () => {
      await api("/invoices", {
        method: "POST",
        body: JSON.stringify({
          vendorId,
          eventId: linkedRequest?.eventId || values.eventId || invoiceEventId,
          amount: Number(values.amount),
          breakdown: values.breakdown || invoiceBreakdown,
          attachment: invoiceAttachment
        })
      }, token);
      setInvoiceBreakdown("");
      setInvoiceRequestId("");
      setInvoiceAttachment("");
      event.currentTarget.reset();
      refresh();
    });
  }

  function renderRequestActions(request) {
    const isPending = request.status === "Pending";
    const isActive = ["Accepted", "Preparing", "Out for Delivery", "Delayed"].includes(request.status);
    const isClosed = request.status === "Declined" || request.status === "Delivered";

    return (
      <div className="inline-actions">
        <Badge value={request.status} />
        {isPending && (
          <>
            <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRequest(request, "Accepted")}>Accept</Button>
            <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRequest(request, "Declined")}>Decline</Button>
          </>
        )}
        {isActive && (
          <>
            {request.status !== "Preparing" && (
              <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRequest(request, "Preparing")}>Preparing</Button>
            )}
            {request.status !== "Out for Delivery" && (
              <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRequest(request, "Out for Delivery")}>Out for delivery</Button>
            )}
            <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRequest(request, "Delivered")}>Delivered</Button>
            <Button disabled={actionStatus.loading} variant="secondary" onClick={() => reportDelay(request)}>Report delay</Button>
          </>
        )}
        {isClosed && <span className="muted">No further action</span>}
      </div>
    );
  }

  return (
    <DashboardGrid>
      <ActionMessage status={actionStatus} />
      {activePage === "overview" && (
        <>
          <PageIntro
            eyebrow="Supplier snapshot"
            title="Vendor overview"
            text="Track incoming sourcing requests, active deliveries, invoice review status, and your supplier profile from one dashboard."
            items={["Pending requests", "Active deliveries", "Invoice review", "Supplier profile"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Supplier account</p>
                <h2>{profile.data?.companyName || "Vendor account"}</h2>
                <p className="workspace-context-copy">
                  {profile.data?.mainLocation || "Location not set"} · {profile.data?.contact || "No contact listed"}
                </p>
              </div>
            </div>
            {profile.data && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Supplies</strong> {(profile.data.supplies || []).slice(0, 2).join(", ") || "—"}</span>
                <span className="workspace-pill"><strong>Active events</strong> {vendorEvents.length}</span>
                <span className="workspace-pill"><strong>Total requests</strong> {vendorRequests.length}</span>
              </div>
            )}
          </section>

          <section className="stats-row span-12">
            <StatCard label="Pending requests" value={pendingRequests.length} hint="Awaiting accept or decline" />
            <StatCard label="Active deliveries" value={activeDeliveries.length} hint="Accepted through delayed" />
            <StatCard label="Invoices submitted" value={vendorInvoices.length} hint="Billing history" />
            <StatCard label="Awaiting payment" value={vendorInvoices.filter((invoice) => invoice.status === "Approved").length} hint="Approved by organizer" />
          </section>

          <Panel title="Pending Requests" eyebrow="Needs response" className="span-7">
            {pendingRequests.length ? (
              <div className="stack">
                {pendingRequests.slice(0, 4).map((request) => (
                  <article className="compact-card" key={request.id}>
                    <div>
                      <strong>{request.requestedItems}</strong>
                      <span>{eventName(request.eventId)} · {request.quantities} · delivery {request.deliveryDate}</span>
                      <span>{request.eventLocation} · {request.organizerContact}</span>
                    </div>
                    <div className="inline-actions">
                      <Badge value={request.status} />
                      <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRequest(request, "Accepted")}>Accept</Button>
                      <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRequest(request, "Declined")}>Decline</Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No pending requests" text="New organizer sourcing requests will appear here." />
            )}
          </Panel>

          <Panel title="Active Deliveries" eyebrow="In progress" className="span-5">
            {activeDeliveries.length ? (
              <div className="stack">
                {activeDeliveries.slice(0, 5).map((request) => (
                  <article className="compact-card compact-card-vertical delivery-card" key={request.id}>
                    <strong>{request.requestedItems}</strong>
                    <span>{eventName(request.eventId)} · {request.deliveryDate}</span>
                    <div className="inline-meta">
                      <Badge value={request.status === "Accepted" ? "Ready to prepare" : request.status} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No active deliveries" text="Accepted orders in progress will appear here." />
            )}
          </Panel>

          <Panel title="Recent Invoices" eyebrow="Billing" className="span-8">
            {vendorInvoices.length ? (
              <Table
                columns={["Event", "Amount", "Submitted", "Status", "Organizer note"]}
                rows={vendorInvoices.slice(0, 5).map((invoice) => [
                  eventName(invoice.eventId),
                  money(invoice.amount),
                  invoice.submittedAt,
                  <Badge value={invoice.status} />,
                  invoice.reviewNote || "—"
                ])}
              />
            ) : (
              <EmptyState title="No invoices yet" text="Submit invoices from Reports after completing deliveries." />
            )}
          </Panel>

          <Panel title="Billing Alerts" eyebrow="Review updates" className="span-4">
            {billingAlerts.length ? (
              <div className="stack">
                {billingAlerts.slice(0, 4).map((invoice) => (
                  <article className="compact-card compact-card-vertical" key={invoice.id}>
                    <strong>{eventName(invoice.eventId)} · {money(invoice.amount)}</strong>
                    <span>{invoice.reviewNote}</span>
                    <div className="inline-meta"><Badge value={invoice.status} /></div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No review updates" text="Organizer feedback on invoices will appear here." />
            )}
          </Panel>
        </>
      )}
      {activePage === "workspace" && (
        <>
          <PageIntro
            eyebrow="Request management"
            title="Respond to organizer sourcing"
            text="Review request details, accept or decline work, send clarifications to the organizer, and keep your supplier profile up to date."
            items={["Accept or decline", "Send clarifications", "Filter requests", "Update profile"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Supplier workspace</p>
                <h2>{profile.data?.companyName || "Vendor account"}</h2>
                <p className="workspace-context-copy">
                  Review incoming requests, update your profile, and respond to organizers from this workspace.
                </p>
              </div>
            </div>
            {profile.data && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Pending</strong> {pendingRequests.length}</span>
                <span className="workspace-pill"><strong>Active deliveries</strong> {activeDeliveries.length}</span>
                <span className="workspace-pill"><strong>Delivered</strong> {deliveredCount}</span>
                <span className="workspace-pill"><strong>Events</strong> {vendorEvents.length}</span>
              </div>
            )}
          </section>

          <Panel title="Supplier Profile" eyebrow="Account details" className="span-5">
            {profileDraft ? (
              <form className="form-grid" onSubmit={saveProfile}>
                <Field label="Company name"><input required value={profileDraft.companyName} onChange={(event) => setProfileDraft((current) => ({ ...current, companyName: event.target.value }))} /></Field>
                <Field label="Main location"><input required value={profileDraft.mainLocation} onChange={(event) => setProfileDraft((current) => ({ ...current, mainLocation: event.target.value }))} /></Field>
                <Field label="Contact"><input required value={profileDraft.contact} onChange={(event) => setProfileDraft((current) => ({ ...current, contact: event.target.value }))} /></Field>
                <Field label="Pricing list"><textarea rows="3" value={profileDraft.pricingList} onChange={(event) => setProfileDraft((current) => ({ ...current, pricingList: event.target.value }))} /></Field>
                <Field label="Supplies offered"><input placeholder="Buffet, Coffee breaks, Serving staff" value={profileDraft.supplies} onChange={(event) => setProfileDraft((current) => ({ ...current, supplies: event.target.value }))} /></Field>
                <Button disabled={actionStatus.loading}>Save profile</Button>
              </form>
            ) : (
              <EmptyState title="Profile loading" text="Your editable supplier profile will appear here." />
            )}
          </Panel>

          <Panel title="Sourcing Requests" eyebrow="Incoming work" className="span-7">
            <div className="filters-row">
              <Field label="Status">
                <select value={requestFilters.status} onChange={(event) => setRequestFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">All statuses</option>
                  {sourcingStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Event">
                <select value={requestFilters.eventId} onChange={(event) => setRequestFilters((current) => ({ ...current, eventId: event.target.value }))}>
                  <option value="">All events</option>
                  {vendorEvents.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="stack">
              {filteredRequests.length ? filteredRequests.map((request) => (
                <article className="compact-card compact-card-vertical" key={request.id}>
                  <div>
                    <strong>{request.requestedItems}</strong>
                    <span>{eventName(request.eventId)} · {request.quantities}</span>
                    <span>Delivery {request.deliveryDate} · {request.eventLocation}</span>
                    <span>Organizer: {request.organizerContact}</span>
                    {request.note && <span>Note: {request.note}</span>}
                  </div>
                  {renderRequestActions(request)}
                  {(request.status === "Pending" || request.status === "Accepted" || request.status === "Preparing" || request.status === "Out for Delivery" || request.status === "Delayed") && (
                    <div className="filters-row">
                      <Field label="Clarification to organizer">
                        <input
                          placeholder="Ask about quantities, timing, or setup..."
                          value={clarificationDrafts[request.id] || ""}
                          onChange={(event) => setClarificationDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                        />
                      </Field>
                      <Button disabled={actionStatus.loading || !clarificationDrafts[request.id]?.trim()} variant="secondary" onClick={() => sendClarification(request)}>Send note</Button>
                    </div>
                  )}
                </article>
              )) : <EmptyState title="No requests match" text="Adjust filters or wait for new organizer sourcing requests." />}
            </div>
          </Panel>
        </>
      )}
      {activePage === "operations" && (
        <>
          <PageIntro
            eyebrow="Fulfillment control"
            title="Track event deliveries"
            text="Update delivery status for accepted orders, confirm arrival at the venue, and report delays to the organizer on the day of the event."
            items={["Accepted orders", "Status updates", "Arrival confirmation", "Delay reporting"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Delivery event</p>
                <h2>{selectedOpsEvent?.name || "No event selected"}</h2>
                <p className="workspace-context-copy">
                  Only accepted and in-progress deliveries for the selected event are shown below.
                </p>
              </div>
              {vendorEvents.length > 0 && (
                <Field label="Event">
                  <select value={selectedOpsEventId} onChange={(event) => setSelectedOpsEventId(event.target.value)}>
                    {vendorEvents.map((event) => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {selectedOpsEvent && (
              <div className="workspace-meta">
                <span className="workspace-pill"><strong>Event date</strong> {selectedOpsEvent.date} at {selectedOpsEvent.time}</span>
                <span className="workspace-pill"><strong>Active deliveries</strong> {opsRequests.length}</span>
                <span className="workspace-pill"><strong>Delivered</strong> {vendorRequests.filter((request) => request.eventId === selectedOpsEventId && request.status === "Delivered").length}</span>
              </div>
            )}
          </section>

          <section className="stats-row span-12">
            <StatCard label="In progress" value={opsRequests.length} hint="Accepted through delayed" />
            <StatCard label="Preparing" value={opsRequests.filter((request) => request.status === "Preparing").length} hint="Being prepared" />
            <StatCard label="Out for delivery" value={opsRequests.filter((request) => request.status === "Out for Delivery").length} hint="En route" />
            <StatCard label="Delayed" value={opsRequests.filter((request) => request.status === "Delayed").length} hint="Organizer notified" />
          </section>

          <Panel title="Delivery Pipeline" eyebrow="Fulfillment" className="span-12">
            {opsRequests.length ? (
              <Table
                columns={["Request", "Event", "Delivery date", "Location", "Status", "Actions"]}
                rows={opsRequests.map((request) => [
                  <strong>{request.requestedItems}</strong>,
                  eventName(request.eventId),
                  request.deliveryDate,
                  request.eventLocation,
                  request.status === "Accepted"
                    ? <Badge value="Ready to prepare" />
                    : <Badge value={request.status} />,
                  renderRequestActions(request)
                ])}
              />
            ) : (
              <EmptyState title="No active deliveries" text="Accept sourcing requests in Workspace to manage deliveries here." />
            )}
          </Panel>
        </>
      )}
      {activePage === "reports" && (
        <>
          <PageIntro
            eyebrow="Vendor billing"
            title="Submit and track invoices"
            text="Submit itemized invoices for completed deliveries, choose the related event, and track organizer review outcomes including approval, rejection, and payment."
            items={["Event-linked billing", "Itemized breakdown", "Review status", "Organizer feedback"]}
          />

          <section className="stats-row span-12">
            <StatCard label="Submitted" value={vendorInvoices.length} hint="Total invoices" />
            <StatCard label="Pending review" value={vendorInvoices.filter((invoice) => invoice.status === "Pending Review").length} hint="Awaiting organizer" />
            <StatCard label="Approved" value={vendorInvoices.filter((invoice) => invoice.status === "Approved").length} hint="Ready for payment" />
            <StatCard label="Paid" value={vendorInvoices.filter((invoice) => invoice.status === "Paid").length} hint="Settled invoices" />
          </section>

          <Panel title="Submit Invoice" eyebrow="Billing" className="span-4">
            <form className="form-grid" onSubmit={submitInvoice}>
              <Field label="Completed delivery">
                <select name="requestId" value={invoiceRequestId} onChange={(event) => selectInvoiceRequest(event.target.value)}>
                  <option value="">Select a delivered order...</option>
                  {billableRequests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.requestedItems} · {eventName(request.eventId)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Related event">
                <select name="eventId" value={invoiceEventId} onChange={(event) => setInvoiceEventId(event.target.value)}>
                  {vendorEvents.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Amount (EGP)"><input min="1" name="amount" required type="number" placeholder="118800" /></Field>
              <Field label="Itemized breakdown">
                <textarea
                  name="breakdown"
                  required
                  rows="4"
                  placeholder="Buffet 220 x 540 EGP"
                  value={invoiceBreakdown}
                  onChange={(event) => setInvoiceBreakdown(event.target.value)}
                />
              </Field>
              <Field label="Attach supporting document (PDF/Image)">
                <input
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files[0];
                    if (file) {
                      setInvoiceAttachment(file.name);
                    }
                  }}
                />
              </Field>
              {invoiceAttachment && <p className="panel-footnote">Attached: <strong>{invoiceAttachment}</strong></p>}
              <p className="muted">Upload invoices and supporting receipts for validation.</p>
              <Button disabled={actionStatus.loading || !vendorEvents.length}>Submit invoice</Button>
            </form>
          </Panel>

          <Panel title="Invoice History" eyebrow="Billing records" className="span-8">
            <div className="filters-row">
              <Field label="Status">
                <select value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {["Pending Review", "Approved", "Rejected", "Paid"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </Field>
              <Button type="button" variant="secondary" onClick={printCurrentPage}>Print / Export</Button>
            </div>
            {filteredInvoices.length ? (
              <Table
                columns={["Event", "Amount", "Submitted", "Breakdown", "Status", "Organizer note"]}
                rows={filteredInvoices.map((invoice) => [
                  eventName(invoice.eventId),
                  money(invoice.amount),
                  invoice.submittedAt,
                  invoice.breakdown,
                  <Badge value={invoice.status} />,
                  invoice.reviewNote || "—"
                ])}
              />
            ) : (
              <EmptyState title="No invoices match" text="Submit a new invoice or adjust the status filter." />
            )}
          </Panel>
        </>
      )}
    </DashboardGrid>
  );
}

function GuestDashboard({ activePage, onNavBadges, refresh, refreshKey, setActivePage, token, user }) {
  const demoToday = "2026-06-24";
  const { actionStatus, runAction } = useActionStatus();
  const invitations = useApi("/guest/me/invitations", refreshKey, token);
  const profile = useApi("/guest/me/profile", refreshKey, token);
  const venues = useApi("/venues", refreshKey);
  const invitationList = invitations.data || [];
  const [selectedInvitationId, setSelectedInvitationId] = useState("");
  const invitation = invitationList.find((item) => item.id === selectedInvitationId) || invitationList[0];
  const eventId = invitation?.eventId || "";
  const messages = useApi(eventId ? `/messages?eventId=${eventId}` : null, refreshKey, token);
  const existingFeedback = useApi(eventId ? `/feedback?eventId=${eventId}` : null, refreshKey, token);
  const [diet, setDiet] = useState("No nuts");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [profileDraft, setProfileDraft] = useState(null);
  const [ratings, setRatings] = useState({ overall: 5, food: 5, venue: 5, organization: 5 });
  const [comments, setComments] = useState("");
  const [notice, setNotice] = useState("");
  const [checkInToast, setCheckInToast] = useState(false);
  const [dismissedInvites, setDismissedInvites] = useState({});
  const previousCheckedIn = useRef(null);
  const previousInvitationId = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!invitation) return;
    if (previousInvitationId.current !== invitation.id) {
      previousInvitationId.current = invitation.id;
      previousCheckedIn.current = invitation.checkedIn;
      return;
    }
    if (previousCheckedIn.current === false && invitation.checkedIn === true) {
      setCheckInToast(true);
    }
    previousCheckedIn.current = invitation.checkedIn;
  }, [invitation?.checkedIn, invitation?.id, invitation]);

  useEffect(() => {
    if (!invitationList.length) return;
    setSelectedInvitationId((current) => (
      invitationList.some((item) => item.id === current) ? current : invitationList[0].id
    ));
  }, [invitations.data]);

  useEffect(() => {
    if (!invitation) return;
    setDiet(invitation.dietaryPreference || "None");
    setSpecialRequirements(invitation.specialRequirements || "");
  }, [invitation?.id, invitation?.dietaryPreference, invitation?.specialRequirements]);

  useEffect(() => {
    if (!profile.data) return;
    setProfileDraft({
      name: profile.data.name || "",
      email: profile.data.email || ""
    });
  }, [JSON.stringify(profile.data)]);

  function venueName(venueId) {
    return (venues.data || []).find((venue) => venue.id === venueId)?.name || venueId || "—";
  }

  const guestMessages = (messages.data || []).filter((message) => message.receivedBy?.includes(invitation?.id));
  const unreadMessages = guestMessages.filter((message) => !message.seenBy?.includes(invitation?.id)).length;
  const submittedFeedback = (existingFeedback.data || []).find((entry) => entry.guestId === invitation?.id);
  const feedbackRequest = guestMessages.find((message) =>
    message.body.toLowerCase().includes("feedback") && message.receivedBy?.includes(invitation?.id)
  );
  const canSubmitFeedback = Boolean(
    invitation?.event && (invitation.event.date <= demoToday || invitation.event.status === "completed")
  );
  const showFeedbackPrompt = Boolean(feedbackRequest && !submittedFeedback && canSubmitFeedback);

  useEffect(() => {
    if (!onNavBadges) return;
    onNavBadges({
      operations: unreadMessages,
      reports: showFeedbackPrompt ? 1 : 0
    });
  }, [unreadMessages, showFeedbackPrompt, onNavBadges]);

  async function savePreferences() {
    if (!invitation) return;
    await runAction("Preferences saved.", async () => {
      await api(`/guests/${invitation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ dietaryPreference: diet, specialRequirements })
      }, token);
      setNotice("Your dietary preferences and special requirements were saved.");
      refresh();
    });
  }

  async function updateRsvp(value) {
    if (!invitation) return;
    await runAction(`RSVP updated to ${value}.`, async () => {
      await api(`/guests/${invitation.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          rsvp: value,
          dietaryPreference: diet,
          specialRequirements
        })
      }, token);
      setNotice(`Thank you — your RSVP is confirmed as "${value}". Dietary preference saved.`);
      refresh();
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!profileDraft) return;
    await runAction("Profile updated.", async () => {
      await api("/guest/me/profile", {
        method: "PATCH",
        body: JSON.stringify(profileDraft)
      }, token);
      refresh();
    });
  }

  async function markSeen(message) {
    if (!invitation) return;
    await runAction("Message marked as seen.", async () => {
      await api(`/messages/${message.id}/seen`, {
        method: "PATCH",
        body: JSON.stringify({ guestId: invitation.id })
      }, token);
      refresh();
    });
  }

  async function submitFeedback() {
    if (!invitation || !canSubmitFeedback) return;
    await runAction("Feedback submitted to the organizer.", async () => {
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify({
          eventId,
          guestId: invitation.id,
          overall: ratings.overall,
          food: ratings.food,
          venue: ratings.venue,
          organization: ratings.organization,
          comments
        })
      }, token);
      setNotice("Thank you — your feedback was submitted successfully.");
      refresh();
    });
  }

  if (invitations.loading) {
    return <EmptyState title="Loading invitations" text="Fetching your event invitations..." />;
  }

  if (!invitation) {
    return <EmptyState title="Invitation not found" text="Seed the database and sign in as the guest account." />;
  }

  const invitationSelector = invitationList.length > 1 ? (
    <section className="workspace-context span-12">
      <div className="workspace-context-header">
        <div>
          <p className="eyebrow">Your invitations</p>
          <h2>{invitation.event?.name || "Select an event"}</h2>
          <p className="workspace-context-copy">You have {invitationList.length} invitations. Switch events to manage RSVP and messages separately.</p>
        </div>
        <Field label="Event invitation">
          <select value={selectedInvitationId} onChange={(event) => setSelectedInvitationId(event.target.value)}>
            {invitationList.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.event?.name || entry.eventId}</option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  ) : null;

  const invitationBanner = invitation.invitationSent && !dismissedInvites[invitation.id] ? (
    <div className="guest-invitation-banner span-12">
      <div>
        <strong>Digital invitation received</strong>
        <p>You received an invitation for {invitation.event?.name} via email. Review details below and confirm your RSVP in Workspace.</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => setDismissedInvites((current) => ({ ...current, [invitation.id]: true }))}>Dismiss</Button>
    </div>
  ) : null;

  const checkInBanner = invitation.checkedIn ? (
    <div className="guest-status-bar guest-status-checked-in span-12">
      <strong>Checked in</strong>
      <span>Welcome to {invitation.event?.name}. Staff verified your arrival at the entrance.</span>
    </div>
  ) : (
    <div className="guest-status-bar span-12">
      <strong>Check-in pending</strong>
      <span>Present your QR code or name at the entrance. This page refreshes automatically when staff checks you in.</span>
    </div>
  );

  const feedbackPrompt = showFeedbackPrompt ? (
    <div className="guest-feedback-prompt span-12">
      <div>
        <strong>Post-event feedback requested</strong>
        <p>{feedbackRequest.body}</p>
      </div>
      <Button type="button" onClick={() => setActivePage("reports")}>Submit feedback</Button>
    </div>
  ) : null;

  const rsvpSummary = (
    <Panel title="RSVP Confirmation" eyebrow="Your response" className="span-12">
      <div className="guest-rsvp-summary">
        <StatCard label="Current RSVP" value={invitation.rsvp} hint="Update anytime in Workspace" />
        <StatCard label="Dietary" value={invitation.dietaryPreference || "None"} />
        <StatCard label="Special requirements" value={invitation.specialRequirements || "None"} />
        <StatCard label="Invitation delivery" value={invitation.invitationSent ? "Email sent" : "Pending"} hint={invitation.invitationSent ? "Digital invitation delivered" : "Organizer has not marked sent yet"} />
      </div>
    </Panel>
  );

  return (
    <DashboardGrid>
      <ActionMessage status={actionStatus} />
      {checkInToast && (
        <div className="toast success-toast guest-checkin-toast span-12">
          <strong>Check-in confirmed</strong>
          <span>You have been checked in for {invitation.event?.name}.</span>
          <button onClick={() => setCheckInToast(false)} type="button">Dismiss</button>
        </div>
      )}
      {invitationSelector}
      {invitationBanner}
      {checkInBanner}
      {feedbackPrompt}
      {activePage === "overview" && (
        <>
          <PageIntro
            eyebrow="Guest invitation"
            title="Your event at a glance"
            text="The guest overview collects the most important invitation details: event name, date, RSVP status, and the QR confirmation used by staff at check-in."
            items={["Invitation details", "RSVP status", "QR code", "Event date"]}
          />
          <section className="stats-row">
            <StatCard label="Event" value={invitation.event?.name || "—"} />
            <StatCard label="Date" value={invitation.event?.date || "—"} />
            <StatCard label="RSVP" value={invitation.rsvp} />
            <StatCard label="Check-in" value={invitation.checkedIn ? "Confirmed" : "Pending"} hint={invitation.checkedIn ? "Staff verified your arrival" : "Present QR at entrance"} />
          </section>
          {rsvpSummary}
          <Panel title="Digital Invitation" eyebrow="QR check-in" className="span-6">
            <div className="guest-invitation-card">
              <div className="feature-card">
                <p className="eyebrow">{invitation.event?.name}</p>
                <h3>{invitation.event?.date} at {invitation.event?.time}</h3>
                <p>{venueName(invitation.event?.venueId)}</p>
                <p>Dress code: {invitation.event?.dressCode || "—"}</p>
                <p className="guest-agenda-preview"><strong>Agenda:</strong> {invitation.event?.agenda || "Agenda will be shared soon."}</p>
              </div>
              <InvitationQr label={invitation.name} value={invitation.qrCode} />
              <p className="invitation-footnote">Present this QR code or your name at registration for check-in.</p>
            </div>
          </Panel>
          <Panel title="Guest Timeline" eyebrow="What to do next" className="span-6">
            <InfoList
              items={[
                { title: "Confirm attendance", text: "Use Workspace to update RSVP, dietary preferences, and special requirements before the event.", badge: "RSVP" },
                { title: "Watch live updates", text: "Use Operations to read organizer messages and mark them as seen during the event day.", badge: "Live" },
                { title: "Share feedback", text: "After the event, use Reports to rate the experience and help improve future events.", badge: "Feedback" }
              ]}
            />
          </Panel>
        </>
      )}
      {activePage === "workspace" && (
        <>
          <PageIntro
            eyebrow="Attendance response"
            title="Manage your invitation"
            text="Guests use this page before the event to read the agenda, confirm attendance, and share dietary preferences or special requirements."
            items={["Agenda", "Dress code", "RSVP", "Dietary preference"]}
          />
          <Panel title="My Profile" eyebrow="Account" className="span-12">
            {profileDraft ? (
              <form className="form-grid" onSubmit={saveProfile}>
                <Field label="Name"><input onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} required value={profileDraft.name} /></Field>
                <Field label="Email"><input onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} required type="email" value={profileDraft.email} /></Field>
                <Button disabled={actionStatus.loading}>Save profile</Button>
              </form>
            ) : (
              <EmptyState title="Loading profile" text="Your account details will appear here." />
            )}
          </Panel>
          <Panel title="Invitation Details" eyebrow="Guest portal" className="span-6">
            <div className="feature-card">
              <p className="eyebrow">Agenda</p>
              <h3>{invitation.event?.agenda || "Event agenda will be shared soon."}</h3>
              <p>Dress code: {invitation.event?.dressCode || "—"}</p>
              <p>Venue: {venueName(invitation.event?.venueId)}</p>
              <p>Time: {invitation.event?.date} at {invitation.event?.time}</p>
              <p>Delivery: {invitation.invitationSent ? "Invitation sent by email" : "Invitation pending delivery"}</p>
            </div>
          </Panel>
          <Panel title="RSVP & Preferences" eyebrow="Attendance" className="span-6">
            <div className="form-grid">
              <Field label="Dietary preference">
                <input value={diet} onChange={(event) => setDiet(event.target.value)} />
              </Field>
              <Field label="Special requirements">
                <textarea onChange={(event) => setSpecialRequirements(event.target.value)} placeholder="Accessibility, allergies, seating..." rows="3" value={specialRequirements} />
              </Field>
              <div className="inline-actions align-end">
                <Button disabled={actionStatus.loading} variant="secondary" onClick={savePreferences}>Save preferences</Button>
                <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRsvp("Attending")}>Attending</Button>
                <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRsvp("Maybe")}>Maybe</Button>
                <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateRsvp("Not Attending")}>Not Attending</Button>
              </div>
            </div>
            {notice && <p className="success-message">{notice}</p>}
          </Panel>
          <Panel title="Check-In QR Code" eyebrow="Entrance" className="span-12">
            <div className="guest-invitation-card guest-invitation-card-inline">
              <InvitationQr label={invitation.name} value={invitation.qrCode} />
              <div>
                <strong>{invitation.name}</strong>
                <p className="muted">Code: {invitation.qrCode}</p>
                <p className="muted">Show this at the entrance so staff can verify your RSVP and check you in.</p>
              </div>
            </div>
          </Panel>
        </>
      )}
      {activePage === "operations" && (
        <>
          <PageIntro
            eyebrow="Live updates"
            title="Follow day-of communication"
            text="Operations is where guests receive important day-of announcements, directions, schedule changes, and follow-up messages from the organizer."
            items={["Organizer messages", "Seen status", "Schedule changes", "Arrival guidance"]}
          />
          <Panel title="Day-Of Messages" eyebrow="Live updates" className="span-12">
            <p className="panel-footnote">Messages refresh automatically every few seconds.</p>
            <div className="stack">
              {guestMessages.length ? guestMessages.map((message) => (
                <article className="compact-card" key={message.id}>
                  <div>
                    <div className="inline-meta">
                      {message.audience === "unseen guests" ? <Badge value="Follow-up" /> : <Badge value="Update" />}
                      {message.seenBy?.includes(invitation.id) ? <Badge value="Seen" /> : <Badge value="Received" />}
                    </div>
                    <strong>{message.body}</strong>
                    <span>{new Date(message.sentAt).toLocaleString()}</span>
                  </div>
                  {!message.seenBy?.includes(invitation.id) && (
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => markSeen(message)}>Mark seen</Button>
                  )}
                </article>
              )) : (
                <EmptyState title="No messages yet" text="Organizer announcements for this event will appear here on the event day." />
              )}
            </div>
          </Panel>
        </>
      )}
      {activePage === "reports" && (
        <>
          <PageIntro
            eyebrow="Guest feedback"
            title="Share post-event experience"
            text="After the event, guests can submit feedback about the venue, food, organization, and overall experience. This helps the organizer improve future events."
            items={["Overall rating", "Food review", "Venue review", "Organizer feedback"]}
          />
          {feedbackRequest && (
            <Panel title="Organizer Request" eyebrow="Feedback" className="span-12">
              <p className="muted">{feedbackRequest.body}</p>
            </Panel>
          )}
          {submittedFeedback ? (
            <Panel title="Feedback Submitted" eyebrow="Thank you" className="span-12">
              <p className="success-message">Thank you — you already submitted feedback for {invitation.event?.name}.</p>
              <InfoList
                items={[
                  { title: "Overall", text: `${submittedFeedback.overall}/5`, badge: "Rating" },
                  { title: "Food", text: `${submittedFeedback.food}/5`, badge: "Food" },
                  { title: "Venue", text: `${submittedFeedback.venue}/5`, badge: "Venue" },
                  { title: "Organization", text: `${submittedFeedback.organization}/5`, badge: "Org" },
                  { title: "Comments", text: submittedFeedback.comments || "No additional comments.", badge: "Notes" }
                ]}
              />
            </Panel>
          ) : !canSubmitFeedback ? (
            <Panel title="Feedback Not Open Yet" eyebrow="After the event" className="span-12">
              <EmptyState
                title="Feedback opens after the event"
                text={`Feedback for ${invitation.event?.name} will be available on or after ${invitation.event?.date}.`}
              />
            </Panel>
          ) : (
            <Panel title="Post-Event Feedback" eyebrow="Experience" className="span-12">
              <div className="form-grid">
                {["overall", "food", "venue", "organization"].map((field) => (
                  <Field label={`${field[0].toUpperCase()}${field.slice(1)} rating`} key={field}>
                    <select value={ratings[field]} onChange={(event) => setRatings((current) => ({ ...current, [field]: Number(event.target.value) }))}>
                      <option value={5}>5 - Excellent</option>
                      <option value={4}>4 - Good</option>
                      <option value={3}>3 - Average</option>
                      <option value={2}>2 - Needs improvement</option>
                      <option value={1}>1 - Poor</option>
                    </select>
                  </Field>
                ))}
                <Field label="Open comments"><textarea onChange={(event) => setComments(event.target.value)} placeholder="Share anything the organizer should improve." rows="4" value={comments} /></Field>
                <Button disabled={actionStatus.loading} onClick={submitFeedback}>Submit Feedback</Button>
              </div>
              {notice && <p className="success-message">{notice}</p>}
            </Panel>
          )}
        </>
      )}
    </DashboardGrid>
  );
}

function VenueOwnerDashboard({ activePage, refresh, refreshKey, token, user }) {
  const { actionStatus, runAction } = useActionStatus();
  const ownerId = user?.id || "u5";
  const demoToday = "2026-06-24";
  const [bookingFilters, setBookingFilters] = useState({ status: "", venueId: "", dateFrom: "", dateTo: "" });
  const [ownerMessage, setOwnerMessage] = useState("Approved at listed price.");
  const [bookingMessageDrafts, setBookingMessageDrafts] = useState({});
  const [selectedAvailabilityVenueId, setSelectedAvailabilityVenueId] = useState("");
  const [blockedDates, setBlockedDates] = useState("");
  const [editingVenueId, setEditingVenueId] = useState("");
  const [editVenueDraft, setEditVenueDraft] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);
  const [deleteConfirmVenue, setDeleteConfirmVenue] = useState(null);
  const profile = useApi("/venue-owner/me/profile", refreshKey, token);
  const organizers = useApi("/users?role=organizer", refreshKey);
  const venues = useApi(`/venues?ownerId=${ownerId}`, refreshKey);
  const allBookings = useApi(`/bookings?ownerId=${ownerId}`, refreshKey);
  const bookings = useApi(`/bookings?${queryString({ ownerId, ...bookingFilters })}`, refreshKey);
  const reports = useApi(`/venue-owner/reports?ownerId=${ownerId}`, refreshKey);
  const allEvents = useApi("/events", refreshKey);
  const allFeedback = useApi("/feedback", refreshKey);

  const venueList = venues.data || [];
  const bookingList = allBookings.data || [];
  const filteredBookings = bookings.data || [];
  const pendingBookings = bookingList.filter((booking) => booking.status === "Pending");
  const approvedBookings = bookingList.filter((booking) => booking.status === "Approved");
  const declinedBookings = bookingList.filter((booking) => booking.status === "Declined");
  const upcomingApproved = approvedBookings
    .filter((booking) => booking.date >= demoToday)
    .sort((left, right) => left.date.localeCompare(right.date));
  const upcomingReminders = upcomingApproved.slice(0, 6);
  const totalRevenue = (reports.data || []).reduce((sum, report) => sum + report.revenue, 0);
  const messagePresets = [
    { label: "Approve standard", value: "Approved at listed price." },
    { label: "Approve with setup", value: "Approved with standard setup package included." },
    { label: "Decline — unavailable", value: "Declined — venue unavailable on requested date. Please propose an alternate." },
    { label: "Counter-offer", value: "Counter-offer: 10% premium applies for extended hours and overnight access." }
  ];
  const [bookingSearch, setBookingSearch] = useState("");
  const upcomingPanelRef = useRef(null);
  const [pairedPanelHeight, setPairedPanelHeight] = useState(null);

  useEffect(() => {
    if (!profile.data) return;
    setProfileDraft({
      name: profile.data.name || "",
      companyName: profile.data.companyName || "",
      contact: profile.data.contact || "",
      email: profile.data.email || ""
    });
  }, [JSON.stringify(profile.data)]);

  useEffect(() => {
    if (!venueList.length) return;
    setSelectedAvailabilityVenueId((current) => (
      venueList.some((venue) => venue.id === current) ? current : venueList[0].id
    ));
  }, [venues.data]);

  useEffect(() => {
    const venue = venueList.find((item) => item.id === selectedAvailabilityVenueId);
    if (!venue) return;
    setBlockedDates((venue.unavailableDates || []).join(", "));
  }, [selectedAvailabilityVenueId, JSON.stringify(venueList.find((item) => item.id === selectedAvailabilityVenueId)?.unavailableDates)]);

  useEffect(() => {
    if (!editingVenueId) {
      setEditVenueDraft(null);
      return;
    }
    const venue = venueList.find((item) => item.id === editingVenueId);
    if (!venue) return;
    setEditVenueDraft({
      name: venue.name,
      description: venue.description,
      location: venue.location,
      capacity: venue.capacity,
      sizeSqm: venue.sizeSqm,
      pricePerDay: venue.pricePerDay,
      amenities: (venue.amenities || []).join(", "),
      photos: (venue.photos || []).join(", "),
      floorPlan: venue.floorPlan || "",
      unavailableDates: (venue.unavailableDates || []).join(", ")
    });
  }, [editingVenueId, JSON.stringify(venueList.find((item) => item.id === editingVenueId))]);

  function venueById(venueId) {
    return venueList.find((venue) => venue.id === venueId);
  }

  function venueName(venueId) {
    return venueById(venueId)?.name || venueId;
  }

  function venuePrice(venueId) {
    return venueById(venueId)?.pricePerDay || 0;
  }

  function bookingsForVenue(venueId) {
    return bookingList.filter((booking) => booking.venueId === venueId);
  }

  function venuePendingCount(venueId) {
    return bookingsForVenue(venueId).filter((booking) => booking.status === "Pending").length;
  }

  function capacityStatus(booking) {
    const venue = venueById(booking.venueId);
    if (!venue) return null;
    if (booking.attendees > venue.capacity) return { label: "Over capacity", tone: "danger" };
    if (booking.attendees >= venue.capacity * 0.9) return { label: "Near limit", tone: "warning" };
    return { label: "Good fit", tone: "ok" };
  }

  function organizerLabel(organizerId) {
    const organizer = (organizers.data || []).find((entry) => entry.id === organizerId);
    return organizer ? `${organizer.name} (${organizer.email})` : organizerId;
  }

  function bookingMessage(booking) {
    return bookingMessageDrafts[booking.id] ?? ownerMessage;
  }

  function applyMessagePreset(bookingId, value) {
    setBookingMessageDrafts((current) => ({ ...current, [bookingId]: value }));
  }

  function daysUntil(date) {
    const start = new Date(`${demoToday}T00:00:00`);
    const target = new Date(`${date}T00:00:00`);
    return Math.round((target - start) / (1000 * 60 * 60 * 24));
  }

  const sortedPending = [...pendingBookings].sort((left, right) => left.date.localeCompare(right.date));
  const urgentPending = sortedPending.filter((booking) => {
    const days = daysUntil(booking.date);
    return days >= 0 && days <= 14;
  });
  const searchedBookings = filteredBookings.filter((booking) => {
    if (!bookingSearch.trim()) return true;
    const query = bookingSearch.trim().toLowerCase();
    return (
      booking.eventType.toLowerCase().includes(query) ||
      venueName(booking.venueId).toLowerCase().includes(query) ||
      organizerLabel(booking.organizerId).toLowerCase().includes(query) ||
      booking.specialRequirements.toLowerCase().includes(query)
    );
  });
  const pipelineMax = Math.max(pendingBookings.length, approvedBookings.length, declinedBookings.length, 1);
  const selectedAvailabilityVenue = venueById(selectedAvailabilityVenueId);
  const selectedVenueApprovedDates = approvedBookings
    .filter((booking) => booking.venueId === selectedAvailabilityVenueId)
    .map((booking) => booking.date);
  const venueRatingRows = buildVenueRatingRows(venueList, allEvents.data || [], allFeedback.data || []);
  const monthlyRevenue = Object.entries(
    approvedBookings.reduce((totals, booking) => {
      const monthKey = booking.date.slice(0, 7);
      if (!totals[monthKey]) totals[monthKey] = { revenue: 0, bookings: 0 };
      totals[monthKey].revenue += venuePrice(booking.venueId);
      totals[monthKey].bookings += 1;
      return totals;
    }, {})
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthKey, stats]) => ({
      monthKey,
      label: new Date(`${monthKey}-01T00:00:00`).toLocaleString(undefined, { month: "short", year: "numeric" }),
      ...stats
    }));
  const monthlyRevenueMax = monthlyRevenue.reduce((max, entry) => Math.max(max, entry.revenue), 0) || 1;
  const organizerStats = Object.values(
    bookingList.reduce((groups, booking) => {
      const current = groups[booking.organizerId] || {
        organizerId: booking.organizerId,
        requests: 0,
        approved: 0,
        revenue: 0
      };
      current.requests += 1;
      if (booking.status === "Approved") {
        current.approved += 1;
        current.revenue += venuePrice(booking.venueId);
      }
      groups[booking.organizerId] = current;
      return groups;
    }, {})
  ).sort((left, right) => right.revenue - left.revenue);
  const declineInsights = declinedBookings.reduce((groups, booking) => {
    const reason = booking.ownerMessage?.split(".")[0]?.trim() || "No reason recorded";
    const key = reason.length > 42 ? `${reason.slice(0, 42)}…` : reason;
    groups[key] = (groups[key] || 0) + 1;
    return groups;
  }, {});
  const declineInsightRows = Object.entries(declineInsights)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4);

  useLayoutEffect(() => {
    if (activePage !== "overview") return undefined;
    const node = upcomingPanelRef.current;
    if (!node) return undefined;

    function syncPairedHeight() {
      setPairedPanelHeight(node.offsetHeight);
    }

    syncPairedHeight();
    const observer = new ResizeObserver(syncPairedHeight);
    observer.observe(node);
    window.addEventListener("resize", syncPairedHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPairedHeight);
    };
  }, [activePage, upcomingApproved.length, sortedPending.length, refreshKey, venues.data, reports.data]);

  async function updateBooking(booking, status) {
    const message = bookingMessage(booking).trim();
    await runAction(`Booking request ${status.toLowerCase()}.`, async () => {
      await api(`/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ownerMessage: message })
      }, token);
      refresh();
    });
  }

  async function saveAvailability() {
    const venue = venueList.find((item) => item.id === selectedAvailabilityVenueId);
    if (!venue) return;
    const unavailableDates = blockedDates.split(",").map((date) => date.trim()).filter(Boolean);
    await runAction("Venue availability saved.", async () => {
      await api(`/venues/${venue.id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ unavailableDates })
      }, token);
      refresh();
    });
  }

  async function createVenue(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await runAction("Venue listing created.", async () => {
      await api("/venues", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          ownerId,
          capacity: Number(values.capacity),
          sizeSqm: Number(values.sizeSqm),
          pricePerDay: Number(values.pricePerDay),
          amenities: csvToArray(values.amenities),
          photos: csvToArray(values.photos),
          unavailableDates: csvToArray(values.unavailableDates)
        })
      }, token);
      event.currentTarget.reset();
      refresh();
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!profileDraft) return;
    await runAction("Owner profile updated.", async () => {
      await api("/venue-owner/me/profile", {
        method: "PATCH",
        body: JSON.stringify(profileDraft)
      }, token);
      refresh();
    });
  }

  async function saveVenueEdit(event) {
    event.preventDefault();
    if (!editVenueDraft || !editingVenueId) return;
    await runAction("Venue listing updated.", async () => {
      await api(`/venues/${editingVenueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editVenueDraft.name,
          description: editVenueDraft.description,
          location: editVenueDraft.location,
          capacity: Number(editVenueDraft.capacity),
          sizeSqm: Number(editVenueDraft.sizeSqm),
          pricePerDay: Number(editVenueDraft.pricePerDay),
          amenities: csvToArray(editVenueDraft.amenities),
          photos: csvToArray(editVenueDraft.photos),
          floorPlan: editVenueDraft.floorPlan,
          unavailableDates: csvToArray(editVenueDraft.unavailableDates)
        })
      }, token);
      setEditingVenueId("");
      refresh();
    });
  }

  async function patchVenue(venue, body) {
    await runAction("Venue listing updated.", async () => {
      await api(`/venues/${venue.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      refresh();
    });
  }

  async function deleteVenue(venue) {
    await runAction("Venue listing removed.", async () => {
      await api(`/venues/${venue.id}`, { method: "DELETE" }, token);
      setDeleteConfirmVenue(null);
      if (editingVenueId === venue.id) setEditingVenueId("");
      refresh();
    });
  }

  function renderBookingCard(booking, { showActions = true } = {}) {
    const isPending = booking.status === "Pending";
    const capacity = capacityStatus(booking);
    const days = daysUntil(booking.date);
    const urgent = isPending && days >= 0 && days <= 14;
    return (
      <article className={`compact-card compact-card-vertical booking-request-card${urgent ? " urgent-booking-card" : ""}`} key={booking.id}>
        <div className="booking-request-copy">
          <strong>{booking.eventType}</strong>
          <span>{venueName(booking.venueId)} · {booking.date} · {booking.attendees} attendees</span>
          <span>Organizer: {organizerLabel(booking.organizerId)}</span>
          <span>{booking.specialRequirements}</span>
          {booking.ownerMessage && <span>Owner reply: {booking.ownerMessage}</span>}
        </div>
        <div className="inline-meta">
          <Badge value={booking.status} />
          {urgent && <Badge value={`Due in ${days} days`} />}
          {capacity && <span className={`capacity-badge ${capacity.tone}`}>{capacity.label}</span>}
        </div>
        {showActions && isPending && (
          <div className="booking-request-actions">
            <Field label="Owner message / counter proposal">
              <input
                value={bookingMessage(booking)}
                onChange={(event) => setBookingMessageDrafts((current) => ({ ...current, [booking.id]: event.target.value }))}
              />
            </Field>
            <div className="message-presets">
              {messagePresets.map((preset) => (
                <button
                  className="filter-chip"
                  key={preset.label}
                  onClick={() => applyMessagePreset(booking.id, preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="booking-request-actions-row">
              <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateBooking(booking, "Approved")}>Approve</Button>
              <Button disabled={actionStatus.loading} variant="secondary" onClick={() => updateBooking(booking, "Declined")}>Decline</Button>
            </div>
          </div>
        )}
      </article>
    );
  }

  function renderVenuePortfolioCard(venue, { actions = null, showDescription = false } = {}) {
    const venueBookings = bookingsForVenue(venue.id);
    const venueApproved = venueBookings.filter((booking) => booking.status === "Approved").length;
    const venueRevenue = venueApproved * venue.pricePerDay;
    return (
      <article className="venue-portfolio-card" key={venue.id}>
        <div className="venue-photo-thumb">{(venue.photos || [])[0] || venue.name.slice(0, 12)}</div>
        <div>
          <strong>{venue.name}</strong>
          <span>{venue.location} · {venue.capacity} guests · {money(venue.pricePerDay)}/day</span>
          {showDescription && <span>{venue.description}</span>}
        </div>
        <div className="amenity-chips">
          {(venue.amenities || []).slice(0, 4).map((amenity) => (
            <span className="amenity-chip" key={amenity}>{amenity}</span>
          ))}
        </div>
        <div className="inline-meta">
          <Badge value={venue.active ? "Active" : "Inactive"} />
          {venuePendingCount(venue.id) > 0 && <Badge value={`${venuePendingCount(venue.id)} pending`} />}
        </div>
        <span className="panel-footnote">
          {showDescription
            ? `Blocked: ${(venue.unavailableDates || []).join(", ") || "None"}`
            : `${venueApproved} confirmed · ${money(venueRevenue)} earned · ${(venue.unavailableDates || []).length} blocked dates`}
        </span>
        {actions}
      </article>
    );
  }

  function renderRevenueBar(report) {
    const percent = totalRevenue ? Math.round((report.revenue / totalRevenue) * 100) : 0;
    return (
      <div className="venue-revenue-row" key={report.venueId}>
        <div className="venue-revenue-head">
          <strong>{report.venueName}</strong>
          <span>{money(report.revenue)} · {percent}%</span>
        </div>
        <div className="venue-revenue-bar"><span style={{ width: `${percent}%` }} /></div>
      </div>
    );
  }

  return (
    <DashboardGrid>
      <ActionMessage status={actionStatus} />
      <ConfirmModal
        confirmLabel="Delete listing"
        loading={actionStatus.loading}
        message={`Remove ${deleteConfirmVenue?.name || "this venue"} permanently? Related booking requests will also be removed.`}
        onCancel={() => setDeleteConfirmVenue(null)}
        onConfirm={() => deleteVenue(deleteConfirmVenue)}
        open={Boolean(deleteConfirmVenue)}
        title="Delete venue listing"
      />
      {activePage === "overview" && (
        <>
          <PageIntro
            eyebrow="Venue owner snapshot"
            title="Track venue business performance"
            text="Review pending approvals, confirmed bookings, and revenue generated from your venue portfolio."
            items={["Pending requests", "Confirmed bookings", "Availability", "Revenue"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Owner account</p>
                <h2>{profile.data?.companyName || profile.data?.name || "Venue owner"}</h2>
                <p className="workspace-context-copy">
                  Manage listings, respond to organizer requests, and keep availability calendars up to date.
                </p>
              </div>
            </div>
            <div className="workspace-meta">
              <span className="workspace-pill"><strong>Venues</strong> {venueList.length}</span>
              <span className="workspace-pill"><strong>Pending</strong> {pendingBookings.length}</span>
              <span className="workspace-pill"><strong>Confirmed</strong> {approvedBookings.length}</span>
              <span className="workspace-pill"><strong>Upcoming</strong> {upcomingApproved.length}</span>
            </div>
          </section>

          <section className="stats-row span-12">
            <StatCard label="Venues" value={venueList.length} hint="Active listings" />
            <StatCard label="Pending requests" value={pendingBookings.length} hint="Needs approval" />
            <StatCard label="Approved bookings" value={approvedBookings.length} hint="Confirmed revenue" />
            <StatCard label="Revenue" value={money(totalRevenue)} hint="From approved bookings" />
          </section>

          {urgentPending.length > 0 && (
            <div className="urgency-banner span-12">
              <strong>{urgentPending.length} requests need a response within 14 days.</strong>
              {" "}Next up: {urgentPending[0].eventType} at {venueName(urgentPending[0].venueId)} on {urgentPending[0].date}.
            </div>
          )}

          <Panel title="Booking Pipeline" eyebrow="Portfolio flow" className="span-4 panel-overview-column">
            <div className="booking-pipeline">
              {[
                ["Pending", pendingBookings.length, "pending"],
                ["Approved", approvedBookings.length, "approved"],
                ["Declined", declinedBookings.length, "declined"]
              ].map(([label, count, tone]) => (
                <div className="pipeline-row" key={label}>
                  <div className="pipeline-row-head">
                    <strong>{label}</strong>
                    <span>{count}</span>
                  </div>
                  <div className="pipeline-bar">
                    <span className={tone} style={{ width: `${Math.round((Number(count) / pipelineMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="section-divider overview-revenue-section">
              <p className="eyebrow">By venue</p>
              <h3 className="overview-section-title">Revenue Share</h3>
              {(reports.data || []).length ? (
                <div className="stack overview-revenue-list">{reports.data.map((report) => renderRevenueBar(report))}</div>
              ) : (
                <EmptyState title="No revenue yet" text="Approved bookings will populate revenue share." />
              )}
            </div>
          </Panel>

          <Panel title="Venue Portfolio" eyebrow="At a glance" className="span-8 panel-venue-portfolio">
            <div className="venue-portfolio-grid venue-portfolio-grid-wide">
              {venueList.map((venue) => renderVenuePortfolioCard(venue))}
            </div>
          </Panel>

          <div className="overview-pair-row span-12">
            <Panel
              title="Pending Booking Requests"
              eyebrow="Needs response"
              className="panel-booking-queue overview-pair-match"
              style={pairedPanelHeight ? { height: `${pairedPanelHeight}px` } : undefined}
            >
              {sortedPending.length ? (
                <div className="booking-request-list panel-booking-scroll">
                  {sortedPending.map((booking) => renderBookingCard(booking))}
                </div>
              ) : (
                <EmptyState title="No pending requests" text="New organizer booking requests will appear here." />
              )}
            </Panel>

            <div className="overview-pair-anchor" ref={upcomingPanelRef}>
              <Panel title="Upcoming Confirmed Bookings" eyebrow="Calendar preview" className="panel-upcoming-bookings panel-upcoming-compact">
                {upcomingApproved.length ? (
                  <div className="upcoming-booking-list">
                    {upcomingApproved.map((booking) => (
                      <article className="upcoming-booking-row" key={booking.id}>
                        <strong>{booking.eventType}</strong>
                        <span>{venueName(booking.venueId)} · {booking.date}</span>
                        <span>{organizerLabel(booking.organizerId)}</span>
                        <div className="inline-meta">
                          <Badge value={`In ${daysUntil(booking.date)} days`} />
                          <Badge value="Approved" />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No upcoming bookings" text="Approved bookings with future dates will appear here." />
                )}
              </Panel>
            </div>
          </div>

          <Panel title="Portfolio Performance" eyebrow="Revenue context" className="span-12">
            {(reports.data || []).length ? (
              <Table
                columns={["Venue", "Requests", "Approval rate", "Revenue"]}
                rows={(reports.data || []).map((report) => [
                  <strong>{report.venueName}</strong>,
                  report.totalBookings,
                  `${Math.round(report.bookingRate * 100)}%`,
                  money(report.revenue)
                ])}
              />
            ) : (
              <EmptyState title="No performance data" text="Venue metrics will appear once bookings are recorded." />
            )}
          </Panel>
        </>
      )}
      {activePage === "workspace" && (
        <>
          <PageIntro
            eyebrow="Listing management"
            title="Maintain venue inventory"
            text="Update your owner profile, edit listing details, control active status, and add new venues to your portfolio."
            items={["Owner profile", "Edit listings", "Activate or deactivate", "Create venues"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Listing workspace</p>
                <h2>{profile.data?.companyName || "Venue portfolio"}</h2>
                <p className="workspace-context-copy">
                  {venueList.length} listings · {pendingBookings.length} pending approvals · {approvedBookings.length} confirmed bookings
                </p>
              </div>
            </div>
            <div className="workspace-meta">
              <span className="workspace-pill"><strong>Active listings</strong> {venueList.filter((venue) => venue.active).length}</span>
              <span className="workspace-pill"><strong>Inactive</strong> {venueList.filter((venue) => !venue.active).length}</span>
              <span className="workspace-pill"><strong>Declined requests</strong> {declinedBookings.length}</span>
            </div>
          </section>

          <Panel title="Owner Profile" eyebrow="Account details" className="span-5">
            {profileDraft ? (
              <form className="form-grid" onSubmit={saveProfile}>
                <Field label="Display name"><input required value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
                <Field label="Company name"><input required value={profileDraft.companyName} onChange={(event) => setProfileDraft((current) => ({ ...current, companyName: event.target.value }))} /></Field>
                <Field label="Contact phone"><input required value={profileDraft.contact} onChange={(event) => setProfileDraft((current) => ({ ...current, contact: event.target.value }))} /></Field>
                <Field label="Email"><input required type="email" value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} /></Field>
                <Button disabled={actionStatus.loading}>Save profile</Button>
              </form>
            ) : (
              <EmptyState title="Profile loading" text="Your editable owner profile will appear here." />
            )}
          </Panel>

          <Panel title="Venue Listings" eyebrow="Inventory" className="span-7">
            <div className="venue-portfolio-grid">
              {venueList.map((venue) => renderVenuePortfolioCard(venue, {
                showDescription: true,
                actions: (
                  <div className="inline-actions">
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => setEditingVenueId(venue.id)}>Edit</Button>
                    <Button disabled={actionStatus.loading} variant="secondary" onClick={() => patchVenue(venue, { active: !venue.active })}>{venue.active ? "Deactivate" : "Activate"}</Button>
                    <Button disabled={actionStatus.loading} variant="ghost" onClick={() => setDeleteConfirmVenue(venue)}>Delete</Button>
                  </div>
                )
              }))}
            </div>
          </Panel>

          {editVenueDraft && (
            <Panel title="Edit Venue Listing" eyebrow="Update details" className="span-12">
              <form className="form-grid" onSubmit={saveVenueEdit}>
                <Field label="Name"><input required value={editVenueDraft.name} onChange={(event) => setEditVenueDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
                <Field label="Description"><input required value={editVenueDraft.description} onChange={(event) => setEditVenueDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
                <Field label="Location"><input required value={editVenueDraft.location} onChange={(event) => setEditVenueDraft((current) => ({ ...current, location: event.target.value }))} /></Field>
                <Field label="Capacity"><input min="1" required type="number" value={editVenueDraft.capacity} onChange={(event) => setEditVenueDraft((current) => ({ ...current, capacity: event.target.value }))} /></Field>
                <Field label="Size sqm"><input min="1" required type="number" value={editVenueDraft.sizeSqm} onChange={(event) => setEditVenueDraft((current) => ({ ...current, sizeSqm: event.target.value }))} /></Field>
                <Field label="Price per day"><input min="1" required type="number" value={editVenueDraft.pricePerDay} onChange={(event) => setEditVenueDraft((current) => ({ ...current, pricePerDay: event.target.value }))} /></Field>
                <Field label="Amenities, comma separated"><input value={editVenueDraft.amenities} onChange={(event) => setEditVenueDraft((current) => ({ ...current, amenities: event.target.value }))} /></Field>
                <Field label="Photos/floor plan files"><input id="edit-venue-photos-input" value={editVenueDraft.photos} onChange={(event) => setEditVenueDraft((current) => ({ ...current, photos: event.target.value }))} /></Field>
                <Field label="Upload new photos or floor plan (PDF/Image)">
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      const files = event.target.files;
                      if (files && files.length) {
                        const fileNames = Array.from(files).map((f) => f.name).join(", ");
                        setEditVenueDraft((current) => ({ ...current, photos: fileNames }));
                      }
                    }}
                  />
                </Field>
                <Field label="Floor plan notes"><input value={editVenueDraft.floorPlan} onChange={(event) => setEditVenueDraft((current) => ({ ...current, floorPlan: event.target.value }))} /></Field>
                <Field label="Unavailable dates, comma separated"><input value={editVenueDraft.unavailableDates} onChange={(event) => setEditVenueDraft((current) => ({ ...current, unavailableDates: event.target.value }))} /></Field>
                <div className="inline-actions">
                  <Button disabled={actionStatus.loading}>Save changes</Button>
                  <Button disabled={actionStatus.loading} type="button" variant="ghost" onClick={() => setEditingVenueId("")}>Cancel</Button>
                </div>
              </form>
            </Panel>
          )}

          <Panel title="Create Venue Listing" eyebrow="Inventory form" className="span-12">
            <form className="form-grid" onSubmit={createVenue}>
              <Field label="Name"><input name="name" required /></Field>
              <Field label="Description"><input name="description" required /></Field>
              <Field label="Location"><input name="location" required /></Field>
              <Field label="Capacity"><input name="capacity" min="1" required type="number" /></Field>
              <Field label="Size sqm"><input name="sizeSqm" min="1" required type="number" /></Field>
              <Field label="Price per day"><input name="pricePerDay" min="1" required type="number" /></Field>
              <Field label="Amenities, comma separated"><input name="amenities" /></Field>
              <Field label="Photos/floor plan files"><input name="photos" placeholder="hall.jpg, floor-plan.pdf" /></Field>
              <Field label="Upload photos or floor plan (PDF/Image)">
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files && files.length) {
                      const fileNames = Array.from(files).map((f) => f.name).join(", ");
                      const input = event.target.form.elements["photos"];
                      if (input) input.value = fileNames;
                    }
                  }}
                />
              </Field>
              <Field label="Unavailable dates, comma separated"><input name="unavailableDates" placeholder="2026-06-20, 2026-06-29" /></Field>
              <Button disabled={actionStatus.loading}>Create listing</Button>
            </form>
          </Panel>
        </>
      )}
      {activePage === "operations" && (
        <>
          <PageIntro
            eyebrow="Booking operations"
            title="Control availability and requests"
            text="Block unavailable dates per venue, review incoming requests, and track confirmed bookings with organizer contact details."
            items={["Per-venue calendar", "Booking approvals", "Confirmed bookings", "Organizer contact"]}
          />

          <section className="workspace-context span-12">
            <div className="workspace-context-header">
              <div>
                <p className="eyebrow">Operations desk</p>
                <h2>{pendingBookings.length ? `${pendingBookings.length} requests awaiting response` : "All requests reviewed"}</h2>
                <p className="workspace-context-copy">
                  {upcomingApproved.length} confirmed bookings upcoming · {declinedBookings.length} declined in history
                </p>
              </div>
            </div>
            <div className="workspace-meta">
              <span className="workspace-pill"><strong>Pending</strong> {pendingBookings.length}</span>
              <span className="workspace-pill"><strong>Approved</strong> {approvedBookings.length}</span>
              <span className="workspace-pill"><strong>Declined</strong> {declinedBookings.length}</span>
            </div>
          </section>

          <Panel title="Availability Calendar" eyebrow="Per venue" className="span-5">
            {venueList.length ? (
              <div className="form-grid">
                <Field label="Venue">
                  <select value={selectedAvailabilityVenueId} onChange={(event) => setSelectedAvailabilityVenueId(event.target.value)}>
                    {venueList.map((venue) => (
                      <option key={venue.id} value={venue.id}>{venue.name}</option>
                    ))}
                  </select>
                </Field>
                {selectedAvailabilityVenue && (
                  <>
                    <p className="panel-footnote">
                      {selectedAvailabilityVenue.capacity} guest capacity · {money(selectedAvailabilityVenue.pricePerDay)}/day · {venuePendingCount(selectedAvailabilityVenue.id)} pending requests
                    </p>
                    <div className="date-chips">
                      {(selectedAvailabilityVenue.unavailableDates || []).map((date) => (
                        <span className="date-chip blocked" key={`blocked-${date}`}>Blocked {date}</span>
                      ))}
                      {selectedVenueApprovedDates.map((date) => (
                        <span className="date-chip booked" key={`booked-${date}`}>Booked {date}</span>
                      ))}
                    </div>
                  </>
                )}
                <Field label="Blocked dates, comma separated">
                  <input value={blockedDates} onChange={(event) => setBlockedDates(event.target.value)} placeholder="2026-06-20, 2026-06-29" />
                </Field>
                <Button disabled={actionStatus.loading || !selectedAvailabilityVenueId} onClick={saveAvailability}>Save Availability</Button>
              </div>
            ) : (
              <EmptyState title="No venues" text="Create a venue listing in Workspace first." />
            )}
          </Panel>

          <Panel title="Confirmed Bookings" eyebrow="Organizer contact" className="span-7">
            {approvedBookings.length ? (
              <Table
                columns={["Event", "Venue", "Date", "Organizer", "Attendees", "Revenue"]}
                rows={approvedBookings
                  .sort((left, right) => left.date.localeCompare(right.date))
                  .map((booking) => [
                    <strong>{booking.eventType}</strong>,
                    venueName(booking.venueId),
                    booking.date,
                    organizerLabel(booking.organizerId),
                    booking.attendees,
                    money(venuePrice(booking.venueId))
                  ])}
              />
            ) : (
              <EmptyState title="No confirmed bookings" text="Approved requests will appear here with organizer contact." />
            )}
          </Panel>

          <Panel title="Booking Requests" eyebrow="Approvals" className="span-12">
            <div className="filters-row">
              <Field label="Status"><select value={bookingFilters.status} onChange={(event) => setBookingFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All</option>{bookingStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="Venue"><select value={bookingFilters.venueId} onChange={(event) => setBookingFilters((current) => ({ ...current, venueId: event.target.value }))}><option value="">All</option>{venueList.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></Field>
              <Field label="From"><input type="date" value={bookingFilters.dateFrom} onChange={(event) => setBookingFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></Field>
              <Field label="To"><input type="date" value={bookingFilters.dateTo} onChange={(event) => setBookingFilters((current) => ({ ...current, dateTo: event.target.value }))} /></Field>
              <Field label="Search"><input placeholder="Event, venue, organizer..." value={bookingSearch} onChange={(event) => setBookingSearch(event.target.value)} /></Field>
              <Field label="Default owner message"><input value={ownerMessage} onChange={(event) => setOwnerMessage(event.target.value)} /></Field>
            </div>
            <div className="filter-chips">
              <button className={`filter-chip${bookingFilters.status === "Pending" ? " active" : ""}`} onClick={() => setBookingFilters((current) => ({ ...current, status: "Pending" }))} type="button">Pending only</button>
              <button className={`filter-chip${bookingFilters.status === "Approved" ? " active" : ""}`} onClick={() => setBookingFilters((current) => ({ ...current, status: "Approved" }))} type="button">Approved only</button>
              <button className={`filter-chip${bookingFilters.status === "Declined" ? " active" : ""}`} onClick={() => setBookingFilters((current) => ({ ...current, status: "Declined" }))} type="button">Declined only</button>
              <button className="filter-chip" onClick={() => { setBookingFilters({ status: "", venueId: "", dateFrom: "", dateTo: "" }); setBookingSearch(""); }} type="button">Clear filters</button>
            </div>
            <div className="stack workspace-bookings booking-request-list">
              {searchedBookings.length ? searchedBookings.map((booking) => renderBookingCard(booking)) : (
                <EmptyState title="No bookings match" text="Adjust filters or wait for new organizer requests." />
              )}
            </div>
          </Panel>
        </>
      )}
      {activePage === "reports" && (
        <>
          <PageIntro
            eyebrow="Revenue analytics"
            title="Measure venue performance"
            text="Review booking rate and revenue by venue, browse historical requests, and track upcoming confirmed events."
            items={["Booking rate", "Revenue", "Historical activity", "Upcoming reminders"]}
          />

          <section className="stats-row span-12">
            <StatCard label="Total requests" value={bookingList.length} hint="All statuses" />
            <StatCard label="Approval rate" value={bookingList.length ? `${Math.round((approvedBookings.length / bookingList.length) * 100)}%` : "0%"} hint="Portfolio average" />
            <StatCard label="Upcoming confirmed" value={upcomingApproved.length} hint="Future approved bookings" />
            <StatCard label="Total revenue" value={money((reports.data || []).reduce((sum, report) => sum + report.revenue, 0))} hint="Approved bookings" />
          </section>

          <Panel title="Venue Performance" eyebrow="Reporting" className="span-7">
            <div className="inline-actions">
              <Button variant="secondary" onClick={printCurrentPage}>Print / Export</Button>
            </div>
            <Table
              columns={["Venue", "Bookings", "Rate", "Revenue"]}
              rows={(reports.data || []).map((report) => [
                <strong>{report.venueName}</strong>,
                report.totalBookings,
                `${Math.round(report.bookingRate * 100)}%`,
                money(report.revenue)
              ])}
            />
            {(reports.data || []).length > 0 && (
              <div className="section-divider">
                <p className="eyebrow">Revenue share</p>
                <div className="stack">{reports.data.map((report) => renderRevenueBar(report))}</div>
              </div>
            )}
          </Panel>

          <Panel title="Request Status Mix" eyebrow="Portfolio" className="span-5">
            <div className="booking-pipeline">
              {[
                ["Pending", pendingBookings.length, "pending"],
                ["Approved", approvedBookings.length, "approved"],
                ["Declined", declinedBookings.length, "declined"]
              ].map(([label, count, tone]) => (
                <div className="pipeline-row" key={label}>
                  <div className="pipeline-row-head">
                    <strong>{label}</strong>
                    <span>{count} · {bookingList.length ? Math.round((Number(count) / bookingList.length) * 100) : 0}%</span>
                  </div>
                  <div className="pipeline-bar">
                    <span className={tone} style={{ width: `${bookingList.length ? Math.round((Number(count) / bookingList.length) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Upcoming Booking Reminders" eyebrow="Confirmed events" className="span-5 panel-report-reminders">
            {upcomingReminders.length ? (
              <div className="report-reminder-list">
                {upcomingReminders.map((booking) => (
                  <article className="upcoming-booking-row" key={booking.id}>
                    <strong>{booking.eventType}</strong>
                    <span>{venueName(booking.venueId)} · {booking.date}</span>
                    <span>{organizerLabel(booking.organizerId)}</span>
                    <div className="inline-meta">
                      <Badge value={`In ${daysUntil(booking.date)} days`} />
                      <Badge value="Approved" />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No upcoming reminders" text="Future approved bookings will appear here." />
            )}
          </Panel>

          <Panel title="Portfolio Insights" eyebrow="Analytics" className="span-7 panel-report-insights">
            <div className="report-insights-grid">
              <section className="report-insight-block">
                <p className="eyebrow">Revenue trend</p>
                <h3 className="overview-section-title">Monthly confirmed revenue</h3>
                {monthlyRevenue.length ? (
                  <div className="stack">
                    {monthlyRevenue.map((entry) => (
                      <div className="report-month-row" key={entry.monthKey}>
                        <div className="venue-revenue-head">
                          <strong>{entry.label}</strong>
                          <span>{money(entry.revenue)} · {entry.bookings} booking{entry.bookings === 1 ? "" : "s"}</span>
                        </div>
                        <div className="venue-revenue-bar">
                          <span style={{ width: `${Math.round((entry.revenue / monthlyRevenueMax) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No revenue yet" text="Approved bookings will populate monthly revenue." />
                )}
              </section>

              <section className="report-insight-block">
                <p className="eyebrow">Guest feedback</p>
                <h3 className="overview-section-title">Venue ratings</h3>
                {venueRatingRows.some((row) => row.average !== null) ? (
                  <Table
                    columns={["Venue", "Rating", "Reviews"]}
                    rows={venueRatingRows.map(({ venue, average, count }) => [
                      <strong>{venue.name}</strong>,
                      average !== null ? (
                        <span className="venue-rating-score"><strong>{average}</strong> / 5</span>
                      ) : (
                        <span className="venue-rating-empty">No ratings yet</span>
                      ),
                      count || "—"
                    ])}
                  />
                ) : (
                  <EmptyState title="No guest ratings" text="Post-event feedback will appear here after events complete." />
                )}
              </section>

              <section className="report-insight-block">
                <p className="eyebrow">Organizer activity</p>
                <h3 className="overview-section-title">Top organizers</h3>
                {organizerStats.length ? (
                  <Table
                    columns={["Organizer", "Requests", "Approved", "Revenue"]}
                    rows={organizerStats.slice(0, 4).map((entry) => [
                      organizerLabel(entry.organizerId),
                      entry.requests,
                      entry.approved,
                      money(entry.revenue)
                    ])}
                  />
                ) : (
                  <EmptyState title="No organizer data" text="Booking requests will build organizer stats here." />
                )}
              </section>

              <section className="report-insight-block">
                <p className="eyebrow">Decline patterns</p>
                <h3 className="overview-section-title">Common decline reasons</h3>
                {declineInsightRows.length ? (
                  <div className="stack">
                    {declineInsightRows.map(([reason, count]) => (
                      <article className="report-decline-row" key={reason}>
                        <strong>{reason}</strong>
                        <Badge value={`${count} decline${count === 1 ? "" : "s"}`} />
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No declines recorded" text="Declined request reasons will appear here." />
                )}
              </section>
            </div>
          </Panel>

          <Panel title="Booking History" eyebrow="All requests" className="span-12">
            {bookingList.length ? (
              <Table
                columns={["Event", "Venue", "Date", "Organizer", "Attendees", "Status", "Owner reply", "Est. revenue"]}
                rows={[...bookingList]
                  .sort((left, right) => right.date.localeCompare(left.date))
                  .map((booking) => [
                    <strong>{booking.eventType}</strong>,
                    venueName(booking.venueId),
                    booking.date,
                    organizerLabel(booking.organizerId),
                    booking.attendees,
                    <Badge value={booking.status} />,
                    booking.ownerMessage || "—",
                    booking.status === "Approved" ? money(venuePrice(booking.venueId)) : "—"
                  ])}
              />
            ) : (
              <EmptyState title="No booking history" text="Organizer requests will appear here once submitted." />
            )}
          </Panel>
        </>
      )}
    </DashboardGrid>
  );
}

function buildVenueRatingRows(venues, events, feedback) {
  return venues.map((venue) => {
    const eventIds = events.filter((event) => event.venueId === venue.id).map((event) => event.id);
    const venueFeedback = feedback.filter((entry) => eventIds.includes(entry.eventId));
    if (!venueFeedback.length) {
      return { venue, average: null, count: 0 };
    }
    const average = venueFeedback.reduce((sum, entry) => sum + entry.venue, 0) / venueFeedback.length;
    return { venue, average: Number(average.toFixed(1)), count: venueFeedback.length };
  });
}

function ReportAndLayout({
  report,
  invoices = [],
  budget,
  feedback = [],
  tasks = [],
  sourcingRequests = [],
  guests = [],
  messagesCount = 0,
  allVenues = [],
  allEvents = [],
  allFeedback = [],
  selectedEvent,
  selectedEventId,
  organizerEvents = [],
  onEventChange,
  venueLabel,
  vendorLabel,
  refreshKey,
  refresh,
  token,
  eventId = EVENT_ID
}) {
  const completedTasks = tasks.filter((task) => task.status === "Done").length;
  const openTasks = tasks.length - completedTasks;
  const venueRatingRows = buildVenueRatingRows(allVenues, allEvents, allFeedback);

  function guestName(guestId) {
    return guests.find((guest) => guest.id === guestId)?.name || guestId;
  }

  return (
    <>
      <section className="workspace-context span-12">
        <div className="workspace-context-header">
          <div>
            <p className="eyebrow">Report event</p>
            <h2>{selectedEvent?.name || report?.event?.name || "No event selected"}</h2>
            <p className="workspace-context-copy">
              Report data reflects the selected event. Switch events to compare outcomes across your portfolio.
            </p>
          </div>
          {organizerEvents.length > 0 && onEventChange && (
            <Field label="Switch event">
              <select value={selectedEventId} onChange={(event) => onEventChange(event.target.value)}>
                {organizerEvents.map((event) => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {selectedEvent && (
          <div className="workspace-meta">
            <span className="workspace-pill"><strong>Date</strong> {selectedEvent.date} at {selectedEvent.time}</span>
            <span className="workspace-pill"><strong>Venue</strong> {venueLabel?.(selectedEvent.venueId) || selectedEvent.venueId}</span>
            <span className="workspace-pill"><strong>Type</strong> {selectedEvent.type}</span>
            <span className="workspace-pill"><Badge value={selectedEvent.status} /></span>
          </div>
        )}
      </section>

      <Panel title="Venue Ratings" eyebrow="Portfolio" className="span-12">
        <p className="workspace-context-copy">Average guest venue scores across all events hosted at each location (from post-event feedback).</p>
        {allVenues.length ? (
          <Table
            columns={["Venue", "Location", "Capacity", "Average rating", "Reviews"]}
            rows={venueRatingRows.map(({ venue, average, count }) => [
              <strong>{venue.name}</strong>,
              venue.location,
              `${venue.capacity} guests`,
              average !== null ? (
                <span className="venue-rating-score"><strong>{average}</strong> / 5</span>
              ) : (
                <span className="venue-rating-empty">No ratings yet</span>
              ),
              count || "—"
            ])}
          />
        ) : (
          <EmptyState title="No venues" text="Venues from the database will appear here." />
        )}
      </Panel>

      <Panel title="Event Report" eyebrow="Outcome" className="span-8">
        {report ? (
          <>
            <div className="inline-actions no-print">
              <Button variant="secondary" onClick={printCurrentPage}>Print / Export</Button>
            </div>
            <div className="mini-stats report-stats-grid">
              <StatCard label="Invited" value={report.attendance.invited} hint="Guest list size" />
              <StatCard label="Arrived" value={report.attendance.arrived} hint="Checked in" />
              <StatCard label="Absent" value={report.attendance.invited - report.attendance.arrived} hint="Did not check in" />
              <StatCard label="RSVP yes" value={report.attendance.rsvpAttending} hint="Expected arrivals" />
            </div>
            <div className="mini-stats report-stats-grid">
              <StatCard label="Planned" value={money(report.costs?.totalPlanned)} />
              <StatCard label="Actual" value={money(report.costs?.actualTotal)} />
              <StatCard label="Difference" value={money(report.costs?.difference)} hint={report.costs?.difference >= 0 ? "Under budget" : "Over budget"} />
              <StatCard label="Invoices" value={invoices.length} hint="Submitted for this event" />
            </div>
            {report.costs && (
              <ProgressBar value={report.costs.actualTotal} max={report.costs.totalPlanned || 1} />
            )}
            <div className="mini-stats report-stats-grid">
              <StatCard label="Average rating" value={report.outcome.averageRating || "—"} hint="Guest feedback" />
              <StatCard label="Feedback entries" value={report.outcome.feedbackCount} />
              <StatCard label="Positive" value={report.outcome.positiveFeedback} hint="Rating 4+" />
              <StatCard label="Needs attention" value={report.outcome.negativeFeedback} hint="Rating 2 or below" />
            </div>
          </>
        ) : (
          <EmptyState title="No report available" text="Select an event to generate its post-event report." />
        )}
      </Panel>

      <Panel title="Operations Summary" eyebrow="Execution" className="span-4">
        <div className="mini-stats">
          <StatCard label="Tasks done" value={`${completedTasks} / ${tasks.length}`} hint={`${openTasks} still open`} />
          <StatCard label="Vendor requests" value={sourcingRequests.length} hint="Sourcing pipeline" />
          <StatCard label="Messages sent" value={messagesCount} hint="Day-of broadcasts" />
        </div>
        <div className="section-divider">
          <p className="eyebrow">Task completion</p>
          {tasks.length ? (
            <Table
              columns={["Task", "Status"]}
              rows={tasks.map((task) => [<strong>{task.title}</strong>, <Badge value={task.status} />])}
            />
          ) : (
            <EmptyState title="No tasks" text="Tasks for this event will appear here." />
          )}
        </div>
        <div className="section-divider">
          <p className="eyebrow">Vendor deliveries</p>
          {sourcingRequests.length ? (
            <Table
              columns={["Vendor", "Status"]}
              rows={sourcingRequests.map((request) => [
                <strong>{vendorLabel?.(request.vendorId) || request.vendorId}</strong>,
                <Badge value={request.status} />
              ])}
            />
          ) : (
            <EmptyState title="No vendor requests" text="Sourcing activity for this event will appear here." />
          )}
        </div>
      </Panel>

      <Panel title="Guest Feedback" eyebrow="Experience" className="span-7">
        {feedback.length ? (
          <Table
            columns={["Guest", "Overall", "Food", "Venue", "Organization", "Comments"]}
            rows={feedback.map((entry) => [
              <strong>{guestName(entry.guestId)}</strong>,
              entry.overall,
              entry.food,
              entry.venue,
              entry.organization,
              entry.comments || "—"
            ])}
          />
        ) : (
          <EmptyState title="No feedback yet" text="Guest ratings and comments will appear here after the event." />
        )}
      </Panel>

      <Panel title="Cost And Invoice Detail" eyebrow="Finance" className="span-5">
        {budget ? (
          <>
            <div className="section-divider">
              <p className="eyebrow">Planned items</p>
              <Table columns={["Item", "Amount"]} rows={(budget.plannedItems || []).map((item) => [<strong>{item.name}</strong>, money(item.amount)])} />
            </div>
            <div className="section-divider">
              <p className="eyebrow">Actual expenses</p>
              {(budget.actualExpenses || []).length ? (
                <Table
                  columns={["Expense", "Amount", "Paid on"]}
                  rows={(budget.actualExpenses || []).map((expense) => [
                    <strong>{expense.name}</strong>,
                    money(expense.amount),
                    expense.paidOn || "—"
                  ])}
                />
              ) : (
                <EmptyState title="No expenses recorded" text="Actual spending lines will appear here." />
              )}
            </div>
            <div className="section-divider">
              <p className="eyebrow">Invoices</p>
              {invoices.length ? (
                <Table
                  columns={["Vendor", "Amount", "Breakdown", "Status"]}
                  rows={invoices.map((invoice) => [
                    <strong>{vendorLabel?.(invoice.vendorId) || invoice.vendorId}</strong>,
                    money(invoice.amount),
                    invoice.breakdown,
                    <Badge value={invoice.status} />
                  ])}
                />
              ) : (
                <EmptyState title="No invoices" text="Vendor invoices for this event will appear here." />
              )}
            </div>
          </>
        ) : (
          <EmptyState title="No budget data" text="Budget information for this event is not available." />
        )}
      </Panel>

      <LayoutPanel eventId={eventId} refresh={refresh} refreshKey={refreshKey} token={token} editable={false} className="span-12" />
    </>
  );
}

function LayoutPanel({ eventId = EVENT_ID, refreshKey, refresh, token, editable = false, className = "span-6" }) {
  const layout = useApi(`/events/${eventId}/layout`, refreshKey);
  const [localItems, setLocalItems] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  useEffect(() => {
    if (layout.data) {
      setLocalItems(layout.data);
    }
  }, [layout.data]);

  async function saveLayout(event) {
    if (event) event.preventDefault();
    const nextLayout = localItems.map(({ id, label, x, y }) => ({ id, label, x: Math.round(x), y: Math.round(y) }));
    await api(`/events/${eventId}/layout`, { method: "PUT", body: JSON.stringify({ layout: nextLayout }) }, token);
    refresh?.();
  }

  function handlePointerDown(e, item) {
    if (!editable) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM().inverse());
    setDraggingId(item.id);
    setDragOffset({ x: cursor.x - item.x, y: cursor.y - item.y });
    e.target.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!draggingId || !editable) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM().inverse());
    setLocalItems((prev) =>
      prev.map((item) =>
        item.id === draggingId
          ? { ...item, x: cursor.x - dragOffset.x, y: cursor.y - dragOffset.y }
          : item
      )
    );
  }

  function handlePointerUp(e) {
    if (!draggingId || !editable) return;
    setDraggingId(null);
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }

  return (
    <Panel title="Venue Layout" eyebrow="Floor plan" className={className}>
      <div className="inline-actions no-print">
        {editable && <Button disabled={!token} onClick={saveLayout}>Save layout</Button>}
        <Button type="button" variant="secondary" onClick={printCurrentPage}>Print layout</Button>
      </div>
      {editable && <p className="panel-footnote">Drag and drop the dark elements on the floor plan below to position them.</p>}
      <div className="floor-plan" style={{ touchAction: "none" }}>
        <svg
          ref={svgRef}
          className="venue-map festival-map"
          viewBox="0 0 900 620"
          aria-label="Festival venue floor plan"
          role="img"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <rect className="chart-paper" x="30" y="24" width="700" height="930" rx="26" />
          <rect className="festival-stage" x="340" y="42" width="220" height="76" rx="4" />
          <text className="festival-label dark" x="450" y="84" textAnchor="middle">Stage</text>

          <path className="festival-walkway" d="M405 118 L495 118 L495 210 C548 236 583 287 591 354 L542 354 C530 305 497 273 450 263 C403 273 370 305 358 354 L309 354 C317 287 352 236 405 210 Z" />
          <path className="festival-walkway" d="M405 263 L495 263 L495 548 L405 548 Z" />

          <path className="golden left" d="M258 168 L352 168 L352 320 C316 305 289 279 270 243 C258 219 254 194 258 168 Z" />
          <path className="golden right" d="M548 168 L642 168 C646 194 642 219 630 243 C611 279 584 305 548 320 Z" />
          <text className="festival-label" x="305" y="235" textAnchor="middle">Golden</text>
          <text className="festival-label" x="305" y="258" textAnchor="middle">Circle</text>
          <text className="festival-label" x="595" y="235" textAnchor="middle">Golden</text>
          <text className="festival-label" x="595" y="258" textAnchor="middle">Circle</text>

          <path className="standing left" d="M150 205 L255 205 C257 285 289 350 335 383 L335 518 L150 518 Z" />
          <path className="standing right" d="M645 205 L750 205 L750 518 L565 518 L565 383 C611 350 643 285 645 205 Z" />
          <text className="festival-label white" x="205" y="380" textAnchor="middle">General Standing</text>
          <text className="festival-label white" x="205" y="405" textAnchor="middle">SUD</text>
          <text className="festival-label white" x="695" y="380" textAnchor="middle">General Standing</text>
          <text className="festival-label white" x="695" y="405" textAnchor="middle">NORD</text>

          <g className="side-blocks left">
            <path className="blue-zone" d="M48 62 L142 28 L100 156 L48 156 Z" />
            <text className="festival-label white" x="84" y="95" textAnchor="middle">General</text>
            <text className="festival-label white" x="84" y="118" textAnchor="middle">Standing</text>
            <path className="pink-zone" d="M170 52 L246 72 L218 134 L170 126 Z" />
            <path className="seat-tower" d="M170 145 L230 145 L230 498 L178 520 C165 392 162 266 170 145 Z" />
            {[0, 1, 2, 3, 4].map((row) => <rect className="seat-small" key={row} x="44" y={178 + row * 72} width="92" height="52" rx="8" />)}
          </g>
          <g className="side-blocks right">
            <path className="blue-zone" d="M852 62 L758 28 L800 156 L852 156 Z" />
            <text className="festival-label white" x="816" y="95" textAnchor="middle">General</text>
            <text className="festival-label white" x="816" y="118" textAnchor="middle">Standing</text>
            <path className="pink-zone" d="M730 52 L654 72 L682 134 L730 126 Z" />
            <path className="seat-tower" d="M730 145 L670 145 L670 498 L722 520 C735 392 738 266 730 145 Z" />
            {[0, 1, 2, 3, 4].map((row) => <rect className="seat-small" key={row} x="764" y={178 + row * 72} width="92" height="52" rx="8" />)}
          </g>

          <text className="festival-label white" x="200" y="295" textAnchor="middle">Seats A</text>
          <text className="festival-label white" x="700" y="295" textAnchor="middle">Seats A</text>
          <text className="festival-label white" x="92" y="207" textAnchor="middle">C B A</text>
          <text className="festival-label white" x="810" y="207" textAnchor="middle">A B C</text>

          <rect className="greenroom" x="312" y="535" width="276" height="62" rx="8" />
          <text className="festival-label dark" x="450" y="572" textAnchor="middle">Greenroom</text>

          {/* DYNAMIC DRAGGABLE ITEMS */}
          {localItems.map(item => (
            <g
              key={item.id}
              transform={`translate(${item.x}, ${item.y})`}
              onPointerDown={(e) => handlePointerDown(e, item)}
              style={{ cursor: editable ? "grab" : "default", opacity: draggingId === item.id ? 0.8 : 1 }}
            >
              <rect x="0" y="0" width="130" height="42" rx="8" fill="#0f172a" stroke="rgba(255,255,255,0.2)" strokeWidth="2" style={{filter: draggingId === item.id ? "drop-shadow(0 10px 15px rgba(0,0,0,0.3))" : "drop-shadow(0 4px 6px rgba(0,0,0,0.1))"}} />
              <text x="65" y="26" fill="#ffffff" fontSize="13" fontWeight="600" textAnchor="middle" pointerEvents="none">{item.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </Panel>
  );
}

function DashboardGrid({ children }) {
  return <main className="dashboard-grid" id="workspace">{children}</main>;
}

function ProgressBar({ value, max }) {
  const percent = Math.min(100, Math.round((Number(value) / Number(max || 1)) * 100));
  return (
    <div className="progress">
      <span style={{ width: `${percent}%` }} />
      <small>{percent}% used</small>
    </div>
  );
}

function Table({ columns, rows }) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => {
    const stored = localStorage.getItem("event-platform-session");
    return stored ? JSON.parse(stored) : null;
  });

  function handleLogin(nextSession) {
    const sessionWithToast = { ...nextSession, justLoggedIn: true };
    localStorage.setItem("event-platform-session", JSON.stringify({ ...nextSession, justLoggedIn: false }));
    setSession(sessionWithToast);
  }

  function handleLogout() {
    localStorage.removeItem("event-platform-session");
    setSession(null);
  }

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  return <AppShell session={session} onLogout={handleLogout} />;
}

createRoot(document.getElementById("root")).render(<App />);
