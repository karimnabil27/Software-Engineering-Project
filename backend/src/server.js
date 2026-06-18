import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { hashPassword, nextId, readDb, writeDb } from "./db.js";

const app = express();
const port = process.env.PORT || 4000;
const jwtSecret = process.env.JWT_SECRET || "event-platform-demo-secret";

const roles = ["organizer", "staff", "vendor", "guest", "venue-owner"];
const userStatuses = ["active", "inactive"];
const eventStatuses = ["planning", "upcoming", "completed", "cancelled"];
const taskStatuses = ["Not Assigned", "Pending", "In Progress", "Done"];
const bookingStatuses = ["Pending", "Approved", "Declined"];
const sourcingStatuses = ["Pending", "Accepted", "Declined", "Preparing", "Out for Delivery", "Delivered", "Delayed"];
const invoiceStatuses = ["Pending Review", "Approved", "Paid", "Rejected"];
const rsvpStatuses = ["Attending", "Maybe", "Not Attending"];

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

function base64Url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function signToken(user) {
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const payload = base64Url({
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8
  });
  const signature = crypto.createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  const [header, payload, signature] = String(token || "").split(".");
  if (!header || !payload || !signature) return null;

  const expected = crypto.createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
  return decoded;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ message: "A valid bearer token is required." });

  const user = readDb().users.find((item) => item.id === decoded.sub && item.status === "active");
  if (!user) return res.status(401).json({ message: "Authenticated user was not found or is inactive." });
  req.user = publicUser(user);
  next();
}

function requireRole(...allowedRoles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: "Your role is not allowed to perform this action." });
      }
      next();
    }
  ];
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function isRating(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5;
}

function validateAllowed(value, allowedValues, fieldName) {
  if (value === undefined || allowedValues.includes(value)) return null;
  return `${fieldName} must be one of: ${allowedValues.join(", ")}.`;
}

function validationError(res, message) {
  return res.status(400).json({ message });
}

function save(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

function budgetSummary(budget) {
  const actualTotal = budget.actualExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  return {
    ...budget,
    actualTotal,
    difference: budget.totalPlanned - actualTotal
  };
}

function eventReport(db, eventId) {
  const event = db.events.find((item) => item.id === eventId);
  if (!event) return null;

  const guests = db.guests.filter((guest) => guest.eventId === eventId);
  const feedback = db.feedback.filter((item) => item.eventId === eventId);
  const budget = db.budgets.find((item) => item.eventId === eventId);
  const ratings = feedback.map((item) => item.overall);
  const averageRating = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;

  return {
    event,
    attendance: {
      invited: guests.length,
      arrived: guests.filter((guest) => guest.checkedIn).length,
      rsvpAttending: guests.filter((guest) => guest.rsvp === "Attending").length
    },
    costs: budget ? budgetSummary(budget) : null,
    outcome: {
      feedbackCount: feedback.length,
      averageRating: Number(averageRating.toFixed(1)),
      positiveFeedback: feedback.filter((item) => item.overall >= 4).length,
      negativeFeedback: feedback.filter((item) => item.overall <= 2).length
    }
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return validationError(res, "Email and password are required.");

  const user = readDb().users.find((item) => item.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.status !== "active" || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password, role, companyName, contact, supplies, mainLocation } = req.body;
  if (!name || !email || !password || !role) {
    return validationError(res, "Name, email, password, and role are required.");
  }
  if (!isEmail(email)) return validationError(res, "Email must be valid.");
  if (!["vendor", "venue-owner"].includes(role)) {
    return validationError(res, "Self-registration is available for vendor and venue-owner accounts only.");
  }

  const created = save((db) => {
    if (db.users.some((item) => item.email.toLowerCase() === String(email).toLowerCase())) {
      return { duplicate: true };
    }

    const user = {
      id: nextId("u", db.users),
      name: String(name).trim(),
      email: String(email).trim(),
      role,
      status: "active",
      passwordHash: hashPassword(password)
    };

    if (role === "venue-owner") {
      user.companyName = String(companyName || name).trim();
      user.contact = String(contact || "").trim();
    }

    db.users.push(user);

    if (role === "vendor") {
      db.vendors.push({
        id: nextId("vendor", db.vendors),
        userId: user.id,
        companyName: String(companyName || name).trim(),
        supplies: supplies
          ? String(supplies).split(",").map((item) => item.trim()).filter(Boolean)
          : ["General supplies"],
        mainLocation: String(mainLocation || "Cairo").trim(),
        pricingList: "Contact vendor for pricing",
        contact: String(contact || "").trim(),
        deliveryStatus: "Not Ordered"
      });
    }

    return user;
  });

  if (created?.duplicate) return validationError(res, "A user with this email already exists.");
  res.status(201).json({ token: signToken(created), user: publicUser(created) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json(req.user);
});

app.get("/api/dashboard", (_req, res) => {
  const db = readDb();
  const today = process.env.DEMO_DATE || "2026-06-24";
  const todayEvents = db.events.filter((event) => event.date === today);
  const allFeedback = db.feedback;
  const positive = allFeedback.filter((item) => item.overall >= 4).length;
  const negative = allFeedback.filter((item) => item.overall <= 2).length;

  res.json({
    today,
    todayEvents,
    upcomingEvents: db.events.filter((event) => event.status !== "completed"),
    pendingTasks: db.tasks.filter((task) => task.status !== "Done"),
    feedback: { positive, negative },
    guestTotals: db.events.map((event) => {
      const guests = db.guests.filter((guest) => guest.eventId === event.id);
      return {
        eventId: event.id,
        eventName: event.name,
        totalGuests: guests.length,
        arrivedGuests: guests.filter((guest) => guest.checkedIn).length
      };
    })
  });
});

app.get("/api/users", (req, res) => {
  const { role, status } = req.query;
  let users = readDb().users;
  if (role) users = users.filter((user) => user.role === role);
  if (status) users = users.filter((user) => user.status === status);
  res.json(users.map(publicUser));
});

app.post("/api/users", ...requireRole("organizer"), (req, res) => {
  const { name, email, role, password = "password123" } = req.body;
  if (!name || !email || !role) {
    return validationError(res, "Name, email, and role are required.");
  }
  if (!isEmail(email)) return validationError(res, "Email must be valid.");
  if (!roles.includes(role)) return validationError(res, `Role must be one of: ${roles.join(", ")}.`);

  const user = save((db) => {
    const duplicate = db.users.some((item) => item.email.toLowerCase() === String(email).toLowerCase());
    if (duplicate) return { duplicate: true };
    const created = { id: nextId("u", db.users), name, email, role, status: "active", passwordHash: hashPassword(password) };
    db.users.push(created);
    return created;
  });

  if (user.duplicate) return validationError(res, "A user with this email already exists.");
  res.status(201).json(publicUser(user));
});

app.patch("/api/users/:id", ...requireRole("organizer"), (req, res) => {
  const roleError = validateAllowed(req.body.role, roles, "Role");
  const statusError = validateAllowed(req.body.status, userStatuses, "Status");
  if (roleError || statusError) return validationError(res, roleError || statusError);
  if (req.params.id === req.user.id && req.body.status === "inactive") {
    return validationError(res, "You cannot deactivate the account currently signed in.");
  }
  if (req.body.email && !isEmail(req.body.email)) return validationError(res, "Email must be valid.");

  const updated = save((db) => {
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user) return null;
    if (req.body.email && db.users.some((item) => item.id !== user.id && item.email.toLowerCase() === String(req.body.email).toLowerCase())) {
      return { duplicate: true };
    }
    if (req.body.password) {
      req.body.passwordHash = hashPassword(req.body.password);
      delete req.body.password;
    }
    Object.assign(user, req.body);
    return user;
  });

  if (updated?.duplicate) return validationError(res, "A user with this email already exists.");
  if (!updated) return res.status(404).json({ message: "User not found." });
  res.json(publicUser(updated));
});

app.delete("/api/users/:id", ...requireRole("organizer"), (req, res) => {
  if (req.params.id === req.user.id) {
    return validationError(res, "You cannot delete the account currently signed in.");
  }

  const deleted = save((db) => {
    const index = db.users.findIndex((item) => item.id === req.params.id);
    if (index === -1) return null;
    const [removed] = db.users.splice(index, 1);
    return publicUser(removed);
  });

  if (!deleted) return res.status(404).json({ message: "User not found." });
  res.json({ message: "User deleted.", user: deleted });
});

app.get("/api/venues", (req, res) => {
  const { location, date, minCapacity, active, ownerId } = req.query;
  let venues = readDb().venues;
  const { minSizeSqm } = req.query;
  if (location) venues = venues.filter((venue) => venue.location.toLowerCase().includes(String(location).toLowerCase()));
  if (date) venues = venues.filter((venue) => !venue.unavailableDates.includes(date));
  if (minCapacity) venues = venues.filter((venue) => venue.capacity >= Number(minCapacity));
  if (minSizeSqm) venues = venues.filter((venue) => venue.sizeSqm >= Number(minSizeSqm));
  if (active) venues = venues.filter((venue) => String(venue.active) === String(active));
  if (ownerId) venues = venues.filter((venue) => venue.ownerId === ownerId);
  res.json(venues);
});

app.post("/api/venues", ...requireRole("venue-owner", "organizer"), (req, res) => {
  const { ownerId, name, location, capacity, sizeSqm, pricePerDay } = req.body;
  if (!ownerId || !name || !location || !capacity || !sizeSqm || !pricePerDay) {
    return validationError(res, "Owner, name, location, capacity, size, and price are required.");
  }
  if (!isPositiveNumber(capacity) || !isPositiveNumber(sizeSqm) || !isPositiveNumber(pricePerDay)) {
    return validationError(res, "Capacity, size, and price must be positive numbers.");
  }
  if (req.body.unavailableDates?.some((date) => !isDate(date))) {
    return validationError(res, "All unavailable dates must use YYYY-MM-DD format.");
  }

  const venue = save((db) => {
    const owner = db.users.find((user) => user.id === ownerId && user.role === "venue-owner");
    if (!owner) return { missingOwner: true };
    const created = {
      id: nextId("v", db.venues),
      ownerId,
      name,
      description: req.body.description || "",
      location,
      capacity: Number(capacity),
      sizeSqm: Number(sizeSqm),
      pricePerDay: Number(pricePerDay),
      amenities: req.body.amenities || [],
      photos: req.body.photos || [],
      floorPlan: req.body.floorPlan || "",
      active: true,
      unavailableDates: req.body.unavailableDates || []
    };
    db.venues.push(created);
    return created;
  });

  if (venue.missingOwner) return validationError(res, "Owner must be an existing venue-owner user.");
  res.status(201).json(venue);
});

app.patch("/api/venues/:id", ...requireRole("venue-owner", "organizer"), (req, res) => {
  if (req.body.capacity !== undefined && !isPositiveNumber(req.body.capacity)) return validationError(res, "Capacity must be a positive number.");
  if (req.body.sizeSqm !== undefined && !isPositiveNumber(req.body.sizeSqm)) return validationError(res, "Size must be a positive number.");
  if (req.body.pricePerDay !== undefined && !isPositiveNumber(req.body.pricePerDay)) return validationError(res, "Price must be a positive number.");
  if (req.body.unavailableDates?.some((date) => !isDate(date))) {
    return validationError(res, "All unavailable dates must use YYYY-MM-DD format.");
  }

  const venue = save((db) => {
    const item = db.venues.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    Object.assign(item, req.body);
    return item;
  });

  if (!venue) return res.status(404).json({ message: "Venue not found." });
  res.json(venue);
});

app.patch("/api/venues/:id/availability", ...requireRole("venue-owner", "organizer"), (req, res) => {
  const { unavailableDates } = req.body || {};
  if (!Array.isArray(unavailableDates)) return validationError(res, "unavailableDates must be an array.");
  if (unavailableDates.some((date) => !isDate(date))) return validationError(res, "All unavailable dates must use YYYY-MM-DD format.");

  const venue = save((db) => {
    const item = db.venues.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    item.unavailableDates = [...new Set(unavailableDates)].sort();
    return item;
  });

  if (!venue) return res.status(404).json({ message: "Venue not found." });
  res.json(venue);
});

app.get("/api/bookings", (req, res) => {
  const { status, venueId, organizerId, ownerId, dateFrom, dateTo } = req.query;
  if (status && !bookingStatuses.includes(status)) return validationError(res, `Status must be one of: ${bookingStatuses.join(", ")}.`);
  if (dateFrom && !isDate(dateFrom)) return validationError(res, "dateFrom must use YYYY-MM-DD format.");
  if (dateTo && !isDate(dateTo)) return validationError(res, "dateTo must use YYYY-MM-DD format.");

  const db = readDb();
  let bookings = db.bookingRequests;
  if (status) bookings = bookings.filter((item) => item.status === status);
  if (venueId) bookings = bookings.filter((item) => item.venueId === venueId);
  if (organizerId) bookings = bookings.filter((item) => item.organizerId === organizerId);
  if (ownerId) {
    const ownerVenueIds = db.venues.filter((venue) => venue.ownerId === ownerId).map((venue) => venue.id);
    bookings = bookings.filter((item) => ownerVenueIds.includes(item.venueId));
  }
  if (dateFrom) bookings = bookings.filter((item) => item.date >= dateFrom);
  if (dateTo) bookings = bookings.filter((item) => item.date <= dateTo);
  res.json(bookings);
});

app.post("/api/bookings", ...requireRole("organizer"), (req, res) => {
  const { organizerId, venueId, eventType, date, attendees } = req.body;
  if (!organizerId || !venueId || !eventType || !date || !attendees) {
    return validationError(res, "Organizer, venue, event type, date, and attendees are required.");
  }
  if (!isDate(date)) return validationError(res, "Date must use YYYY-MM-DD format.");
  if (!isPositiveNumber(attendees)) return validationError(res, "Attendees must be a positive number.");

  const booking = save((db) => {
    const organizer = db.users.find((user) => user.id === organizerId && user.role === "organizer");
    const venue = db.venues.find((item) => item.id === venueId);
    if (!organizer || !venue) return { missingReference: true };
    if (venue.unavailableDates.includes(date)) return { unavailable: true };
    const created = {
      id: nextId("br", db.bookingRequests),
      organizerId,
      venueId,
      eventType,
      date,
      attendees: Number(attendees),
      specialRequirements: req.body.specialRequirements || "",
      status: "Pending",
      ownerMessage: ""
    };
    db.bookingRequests.push(created);
    return created;
  });

  if (booking.missingReference) return validationError(res, "Organizer and venue must exist.");
  if (booking.unavailable) return validationError(res, "Venue is unavailable on the requested date.");
  res.status(201).json(booking);
});

app.patch("/api/bookings/:id", ...requireRole("venue-owner", "organizer"), (req, res) => {
  const statusError = validateAllowed(req.body.status, bookingStatuses, "Status");
  if (statusError) return validationError(res, statusError);
  if (req.body.date && !isDate(req.body.date)) return validationError(res, "Date must use YYYY-MM-DD format.");
  if (req.body.attendees !== undefined && !isPositiveNumber(req.body.attendees)) return validationError(res, "Attendees must be a positive number.");

  const booking = save((db) => {
    const item = db.bookingRequests.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    Object.assign(item, req.body);
    return item;
  });

  if (!booking) return res.status(404).json({ message: "Booking not found." });
  res.json(booking);
});

app.get("/api/events", (req, res) => {
  const { date, status, organizerId, venueId } = req.query;
  if (date && !isDate(date)) return validationError(res, "Date must use YYYY-MM-DD format.");
  if (status && !eventStatuses.includes(status)) return validationError(res, `Status must be one of: ${eventStatuses.join(", ")}.`);

  let events = readDb().events;
  if (date) events = events.filter((event) => event.date === date);
  if (status) events = events.filter((event) => event.status === status);
  if (organizerId) events = events.filter((event) => event.organizerId === organizerId);
  if (venueId) events = events.filter((event) => event.venueId === venueId);
  res.json(events);
});

app.post("/api/events", ...requireRole("organizer"), (req, res) => {
  const { organizerId, venueId, name, type, date, time, expectedGuests } = req.body;
  if (!organizerId || !venueId || !name || !type || !date || !time || !expectedGuests) {
    return validationError(res, "Organizer, venue, name, type, date, time, and expected guests are required.");
  }
  if (!isDate(date)) return validationError(res, "Date must use YYYY-MM-DD format.");
  if (!isPositiveNumber(expectedGuests)) return validationError(res, "Expected guests must be a positive number.");
  const statusError = validateAllowed(req.body.status, eventStatuses, "Status");
  if (statusError) return validationError(res, statusError);

  const event = save((db) => {
    const organizer = db.users.find((user) => user.id === organizerId && user.role === "organizer");
    const venue = db.venues.find((item) => item.id === venueId);
    if (!organizer || !venue) return { missingReference: true };
    const created = {
      id: nextId("e", db.events),
      organizerId,
      venueId,
      name,
      type,
      date,
      time,
      dressCode: req.body.dressCode || "",
      agenda: req.body.agenda || "",
      expectedGuests: Number(expectedGuests),
      status: req.body.status || "planning",
      layout: []
    };
    db.events.push(created);
    return created;
  });

  if (event.missingReference) return validationError(res, "Organizer and venue must exist.");
  res.status(201).json(event);
});

app.patch("/api/events/:id", ...requireRole("organizer"), (req, res) => {
  const statusError = validateAllowed(req.body.status, eventStatuses, "Status");
  if (statusError) return validationError(res, statusError);
  if (req.body.date && !isDate(req.body.date)) return validationError(res, "Date must use YYYY-MM-DD format.");
  if (req.body.expectedGuests !== undefined && !isPositiveNumber(req.body.expectedGuests)) {
    return validationError(res, "Expected guests must be a positive number.");
  }

  const event = save((db) => {
    const item = db.events.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    if (req.body.venueId && !db.venues.some((venue) => venue.id === req.body.venueId)) return { missingVenue: true };
    if (req.body.expectedGuests !== undefined) req.body.expectedGuests = Number(req.body.expectedGuests);
    Object.assign(item, req.body);
    return item;
  });

  if (event?.missingVenue) return validationError(res, "Venue must exist.");
  if (!event) return res.status(404).json({ message: "Event not found." });
  res.json(event);
});

app.get("/api/events/:id/layout", (req, res) => {
  const event = readDb().events.find((item) => item.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  res.json(event.layout);
});

app.put("/api/events/:id/layout", ...requireRole("organizer"), (req, res) => {
  if (!Array.isArray(req.body.layout)) return validationError(res, "Layout must be an array.");
  const invalidElement = req.body.layout.some((item) => !item.id || !item.label || !Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.y)));
  if (invalidElement) return validationError(res, "Each layout element needs id, label, x, and y.");

  const layout = save((db) => {
    const event = db.events.find((item) => item.id === req.params.id);
    if (!event) return null;
    event.layout = req.body.layout || [];
    return event.layout;
  });

  if (!layout) return res.status(404).json({ message: "Event not found." });
  res.json(layout);
});

app.get("/api/tasks", (req, res) => {
  const { eventId, status, assignedTo } = req.query;
  if (status && !taskStatuses.includes(status)) return validationError(res, `Status must be one of: ${taskStatuses.join(", ")}.`);

  let tasks = readDb().tasks;
  if (eventId) tasks = tasks.filter((task) => task.eventId === eventId);
  if (status) tasks = tasks.filter((task) => task.status === status);
  if (assignedTo) tasks = tasks.filter((task) => task.assignedTo === assignedTo);
  res.json(tasks);
});

app.post("/api/tasks", ...requireRole("organizer"), (req, res) => {
  const { eventId, title, category, dueDate } = req.body;
  if (!eventId || !title || !category || !dueDate) {
    return validationError(res, "Event, title, category, and due date are required.");
  }
  if (!isDate(dueDate)) return validationError(res, "Due date must use YYYY-MM-DD format.");
  const statusError = validateAllowed(req.body.status, taskStatuses, "Status");
  if (statusError) return validationError(res, statusError);

  const task = save((db) => {
    const event = db.events.find((item) => item.id === eventId);
    const assignee = req.body.assignedTo ? db.users.find((user) => user.id === req.body.assignedTo && user.role === "staff") : null;
    if (!event || (req.body.assignedTo && !assignee)) return { missingReference: true };
    const created = {
      id: nextId("t", db.tasks),
      eventId,
      title,
      category,
      status: req.body.status || "Pending",
      dueDate,
      assignedTo: req.body.assignedTo || null,
      reminder: Boolean(req.body.reminder)
    };
    db.tasks.push(created);
    return created;
  });

  if (task.missingReference) return validationError(res, "Event must exist, and assignedTo must be a staff user when provided.");
  res.status(201).json(task);
});

app.patch("/api/tasks/:id", ...requireRole("organizer"), (req, res) => {
  const statusError = validateAllowed(req.body.status, taskStatuses, "Status");
  if (statusError) return validationError(res, statusError);
  if (req.body.dueDate && !isDate(req.body.dueDate)) return validationError(res, "Due date must use YYYY-MM-DD format.");

  const task = save((db) => {
    const item = db.tasks.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    if (req.body.assignedTo && !db.users.some((user) => user.id === req.body.assignedTo && user.role === "staff")) {
      return { missingAssignee: true };
    }
    Object.assign(item, req.body);
    return item;
  });

  if (task?.missingAssignee) return validationError(res, "assignedTo must be an existing staff user.");
  if (!task) return res.status(404).json({ message: "Task not found." });
  res.json(task);
});

app.delete("/api/tasks/:id", ...requireRole("organizer"), (req, res) => {
  const task = save((db) => {
    const index = db.tasks.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) return null;
    const [removed] = db.tasks.splice(index, 1);
    return removed;
  });

  if (!task) return res.status(404).json({ message: "Task not found." });
  res.json({ message: "Task deleted.", task });
});

app.patch("/api/staff/:staffId/tasks/:taskId/progress", ...requireRole("staff", "organizer"), (req, res) => {
  const { status } = req.body;
  if (!taskStatuses.includes(status)) return validationError(res, `Status must be one of: ${taskStatuses.join(", ")}.`);

  const task = save((db) => {
    const item = db.tasks.find((entry) => entry.id === req.params.taskId && entry.assignedTo === req.params.staffId);
    if (!item) return null;
    item.status = status;
    item.updatedAt = new Date().toISOString();
    return item;
  });

  if (!task) return res.status(404).json({ message: "Assigned task not found." });
  res.json(task);
});

app.get("/api/budgets/:eventId", (req, res) => {
  const budget = readDb().budgets.find((item) => item.eventId === req.params.eventId);
  if (!budget) return res.status(404).json({ message: "Budget not found." });
  res.json(budgetSummary(budget));
});

app.put("/api/budgets/:eventId/plan", ...requireRole("organizer"), (req, res) => {
  const { totalPlanned, plannedItems = [] } = req.body;
  if (!isPositiveNumber(totalPlanned)) return validationError(res, "totalPlanned must be a positive number.");
  if (!Array.isArray(plannedItems)) return validationError(res, "plannedItems must be an array.");
  if (plannedItems.some((item) => !item.name || !isPositiveNumber(item.amount))) {
    return validationError(res, "Each planned item needs a name and positive amount.");
  }

  const budget = save((db) => {
    if (!db.events.some((event) => event.id === req.params.eventId)) return { missingEvent: true };
    let item = db.budgets.find((entry) => entry.eventId === req.params.eventId);
    if (!item) {
      item = { id: nextId("b", db.budgets), eventId: req.params.eventId, totalPlanned: 0, plannedItems: [], actualExpenses: [] };
      db.budgets.push(item);
    }
    item.totalPlanned = Number(totalPlanned);
    item.plannedItems = plannedItems.map((plannedItem) => ({ name: plannedItem.name, amount: Number(plannedItem.amount) }));
    return budgetSummary(item);
  });

  if (budget.missingEvent) return res.status(404).json({ message: "Event not found." });
  res.json(budget);
});

app.post("/api/budgets/:eventId/expenses", ...requireRole("organizer"), (req, res) => {
  const { name, amount } = req.body;
  if (!name || !amount) return validationError(res, "Expense name and amount are required.");
  if (!isPositiveNumber(amount)) return validationError(res, "Expense amount must be a positive number.");
  if (req.body.paidOn && !isDate(req.body.paidOn)) return validationError(res, "paidOn must use YYYY-MM-DD format.");

  const budget = save((db) => {
    if (!db.events.some((event) => event.id === req.params.eventId)) return { missingEvent: true };
    let item = db.budgets.find((entry) => entry.eventId === req.params.eventId);
    if (!item) {
      item = { id: nextId("b", db.budgets), eventId: req.params.eventId, totalPlanned: 0, plannedItems: [], actualExpenses: [] };
      db.budgets.push(item);
    }
    item.actualExpenses.push({ id: nextId("ex", item.actualExpenses), name, amount: Number(amount), paidOn: req.body.paidOn || new Date().toISOString().slice(0, 10) });
    return budgetSummary(item);
  });

  if (budget.missingEvent) return res.status(404).json({ message: "Event not found." });
  res.status(201).json(budget);
});

app.delete("/api/budgets/:eventId/expenses/:expenseId", ...requireRole("organizer"), (req, res) => {
  const budget = save((db) => {
    const item = db.budgets.find((entry) => entry.eventId === req.params.eventId);
    if (!item) return null;
    const index = item.actualExpenses.findIndex((expense) => expense.id === req.params.expenseId);
    if (index === -1) return { missingExpense: true };
    item.actualExpenses.splice(index, 1);
    return budgetSummary(item);
  });

  if (budget?.missingExpense) return res.status(404).json({ message: "Expense not found." });
  if (!budget) return res.status(404).json({ message: "Budget not found." });
  res.json(budget);
});

app.patch("/api/budgets/:eventId/expenses/:expenseId", ...requireRole("organizer"), (req, res) => {
  const { name, amount, paidOn } = req.body;
  if (amount !== undefined && !isPositiveNumber(amount)) return validationError(res, "Expense amount must be a positive number.");
  if (paidOn && !isDate(paidOn)) return validationError(res, "paidOn must use YYYY-MM-DD format.");

  const budget = save((db) => {
    const item = db.budgets.find((entry) => entry.eventId === req.params.eventId);
    if (!item) return null;
    const expense = item.actualExpenses.find((exp) => exp.id === req.params.expenseId);
    if (!expense) return { missingExpense: true };
    if (name !== undefined) expense.name = name;
    if (amount !== undefined) expense.amount = Number(amount);
    if (paidOn !== undefined) expense.paidOn = paidOn;
    return budgetSummary(item);
  });

  if (budget?.missingExpense) return res.status(404).json({ message: "Expense not found." });
  if (!budget) return res.status(404).json({ message: "Budget not found." });
  res.json(budget);
});

app.get("/api/vendors", (req, res) => {
  const { search, supply } = req.query;
  let vendors = readDb().vendors;
  if (search) {
    vendors = vendors.filter((vendor) => vendor.companyName.toLowerCase().includes(String(search).toLowerCase()) || vendor.mainLocation.toLowerCase().includes(String(search).toLowerCase()));
  }
  if (supply) vendors = vendors.filter((vendor) => vendor.supplies.some((item) => item.toLowerCase().includes(String(supply).toLowerCase())));
  res.json(vendors);
});

app.get("/api/sourcing-requests", (req, res) => {
  const { vendorId, status, organizerId, eventId } = req.query;
  if (status && !sourcingStatuses.includes(status)) return validationError(res, `Status must be one of: ${sourcingStatuses.join(", ")}.`);

  let requests = readDb().sourcingRequests;
  if (vendorId) requests = requests.filter((request) => request.vendorId === vendorId);
  if (status) requests = requests.filter((request) => request.status === status);
  if (organizerId) requests = requests.filter((request) => request.organizerId === organizerId);
  if (eventId) requests = requests.filter((request) => request.eventId === eventId);
  res.json(requests);
});

app.post("/api/sourcing-requests", ...requireRole("organizer"), (req, res) => {
  const { organizerId, vendorId, eventId, requestedItems, quantities, deliveryDate } = req.body;
  if (!organizerId || !vendorId || !eventId || !requestedItems || !quantities || !deliveryDate) {
    return validationError(res, "Organizer, vendor, event, items, quantities, and delivery date are required.");
  }
  if (!isDate(deliveryDate)) return validationError(res, "Delivery date must use YYYY-MM-DD format.");

  const request = save((db) => {
    const event = db.events.find((item) => item.id === eventId);
    const organizer = db.users.find((user) => user.id === organizerId && user.role === "organizer");
    const vendor = db.vendors.find((item) => item.id === vendorId);
    if (!event || !organizer || !vendor) return { missingReference: true };
    const created = {
      id: nextId("sr", db.sourcingRequests),
      organizerId,
      vendorId,
      eventId,
      requestedItems,
      quantities,
      deliveryDate,
      eventLocation: event ? db.venues.find((venue) => venue.id === event.venueId)?.name || "" : "",
      organizerContact: db.users.find((user) => user.id === organizerId)?.email || "",
      status: "Pending",
      note: req.body.note || ""
    };
    db.sourcingRequests.push(created);
    return created;
  });

  if (request.missingReference) return validationError(res, "Organizer, vendor, and event must exist.");
  res.status(201).json(request);
});

app.patch("/api/sourcing-requests/:id", ...requireRole("vendor", "organizer", "staff"), (req, res) => {
  const statusError = validateAllowed(req.body.status, sourcingStatuses, "Status");
  if (statusError) return validationError(res, statusError);

  const request = save((db) => {
    const item = db.sourcingRequests.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    Object.assign(item, req.body);
    return item;
  });

  if (!request) return res.status(404).json({ message: "Sourcing request not found." });
  res.json(request);
});

app.get("/api/invoices", (req, res) => {
  const { vendorId, status, eventId } = req.query;
  if (status && !invoiceStatuses.includes(status)) return validationError(res, `Status must be one of: ${invoiceStatuses.join(", ")}.`);

  let invoices = readDb().invoices;
  if (vendorId) invoices = invoices.filter((invoice) => invoice.vendorId === vendorId);
  if (status) invoices = invoices.filter((invoice) => invoice.status === status);
  if (eventId) invoices = invoices.filter((invoice) => invoice.eventId === eventId);
  res.json(invoices);
});

app.post("/api/invoices", ...requireRole("vendor"), (req, res) => {
  const { vendorId, eventId, amount, breakdown } = req.body;
  if (!vendorId || !eventId || !amount || !breakdown) {
    return validationError(res, "Vendor, event, amount, and breakdown are required.");
  }
  if (!isPositiveNumber(amount)) return validationError(res, "Invoice amount must be a positive number.");

  const invoice = save((db) => {
    const vendor = db.vendors.find((item) => item.id === vendorId);
    const event = db.events.find((item) => item.id === eventId);
    if (!vendor || !event) return { missingReference: true };
    const created = {
      id: nextId("inv", db.invoices),
      vendorId,
      eventId,
      amount: Number(amount),
      status: "Pending Review",
      breakdown,
      attachment: req.body.attachment || "",
      submittedAt: new Date().toISOString().slice(0, 10)
    };
    db.invoices.push(created);
    return created;
  });

  if (invoice.missingReference) return validationError(res, "Vendor and event must exist.");
  res.status(201).json(invoice);
});

app.patch("/api/invoices/:id", ...requireRole("vendor", "organizer"), (req, res) => {
  const statusError = validateAllowed(req.body.status, invoiceStatuses, "Status");
  if (statusError) return validationError(res, statusError);
  if (req.body.amount !== undefined && !isPositiveNumber(req.body.amount)) return validationError(res, "Invoice amount must be a positive number.");

  const invoice = save((db) => {
    const item = db.invoices.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    Object.assign(item, req.body);
    return item;
  });

  if (!invoice) return res.status(404).json({ message: "Invoice not found." });
  res.json(invoice);
});

app.patch("/api/invoices/:id/review", ...requireRole("organizer"), (req, res) => {
  const { status, reviewerId } = req.body;
  if (!["Approved", "Rejected", "Paid"].includes(status)) return validationError(res, "Status must be Approved, Rejected, or Paid.");

  const invoice = save((db) => {
    const item = db.invoices.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    if (reviewerId && !db.users.some((user) => user.id === reviewerId && user.role === "organizer")) {
      return { missingReviewer: true };
    }
    item.status = status;
    item.reviewedBy = reviewerId || req.user.id;
    item.reviewedAt = new Date().toISOString();
    item.reviewNote = req.body.reviewNote || "";
    return item;
  });

  if (invoice?.missingReviewer) return validationError(res, "reviewerId must be an organizer user.");
  if (!invoice) return res.status(404).json({ message: "Invoice not found." });
  res.json(invoice);
});

app.get("/api/guests", (req, res) => {
  const { eventId, rsvp, checkedIn, search, dietary } = req.query;
  if (rsvp && !rsvpStatuses.includes(rsvp)) return validationError(res, `RSVP must be one of: ${rsvpStatuses.join(", ")}.`);

  let guests = readDb().guests;
  if (eventId) guests = guests.filter((guest) => guest.eventId === eventId);
  if (rsvp) guests = guests.filter((guest) => guest.rsvp === rsvp);
  if (checkedIn) guests = guests.filter((guest) => String(guest.checkedIn) === String(checkedIn));
  if (dietary) guests = guests.filter((guest) => guest.dietaryPreference.toLowerCase().includes(String(dietary).toLowerCase()));
  if (search) guests = guests.filter((guest) => guest.name.toLowerCase().includes(String(search).toLowerCase()) || guest.email.toLowerCase().includes(String(search).toLowerCase()));
  res.json(guests);
});

app.post("/api/guests", ...requireRole("organizer"), (req, res) => {
  const { eventId, name, email } = req.body;
  if (!eventId || !name || !email) return validationError(res, "Event, name, and email are required.");
  if (!isEmail(email)) return validationError(res, "Email must be valid.");
  const rsvpError = validateAllowed(req.body.rsvp, rsvpStatuses, "RSVP");
  if (rsvpError) return validationError(res, rsvpError);

  const guest = save((db) => {
    if (!db.events.some((event) => event.id === eventId)) return { missingEvent: true };
    const created = {
      id: nextId("g", db.guests),
      eventId,
      name,
      email,
      rsvp: req.body.rsvp || "Maybe",
      dietaryPreference: req.body.dietaryPreference || "None",
      checkedIn: false,
      invitationSent: false,
      qrCode: `GUEST-${eventId}-${Date.now()}`
    };
    db.guests.push(created);
    return created;
  });

  if (guest.missingEvent) return res.status(404).json({ message: "Event not found." });
  res.status(201).json(guest);
});

app.patch("/api/guests/:id", ...requireRole("organizer", "staff", "guest"), (req, res) => {
  const rsvpError = validateAllowed(req.body.rsvp, rsvpStatuses, "RSVP");
  if (rsvpError) return validationError(res, rsvpError);
  if (req.body.email && !isEmail(req.body.email)) return validationError(res, "Email must be valid.");

  const guest = save((db) => {
    const item = db.guests.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    if (req.user.role === "guest") {
      if (item.email.toLowerCase() !== req.user.email.toLowerCase()) return { forbidden: true };
      const updates = {};
      if (req.body.rsvp !== undefined) updates.rsvp = req.body.rsvp;
      if (req.body.dietaryPreference !== undefined) updates.dietaryPreference = req.body.dietaryPreference;
      if (req.body.specialRequirements !== undefined) updates.specialRequirements = req.body.specialRequirements;
      Object.assign(item, updates);
      return item;
    }
    Object.assign(item, req.body);
    return item;
  });

  if (guest?.forbidden) return res.status(403).json({ message: "You can only update your own invitation." });
  if (!guest) return res.status(404).json({ message: "Guest not found." });
  res.json(guest);
});

app.delete("/api/guests/:id", ...requireRole("organizer"), (req, res) => {
  const guest = save((db) => {
    const index = db.guests.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) return null;
    const [removed] = db.guests.splice(index, 1);
    return removed;
  });

  if (!guest) return res.status(404).json({ message: "Guest not found." });
  res.json({ message: "Guest deleted.", guest });
});

app.post("/api/messages", ...requireRole("organizer"), (req, res) => {
  const { eventId, body } = req.body;
  if (!eventId || !body) return validationError(res, "Event and message body are required.");

  const message = save((db) => {
    if (!db.events.some((event) => event.id === eventId)) return { missingEvent: true };
    const recipients = db.guests.filter((guest) => guest.eventId === eventId).map((guest) => guest.id);
    const created = {
      id: nextId("m", db.messages),
      eventId,
      audience: req.body.audience || "guests",
      body,
      sentAt: new Date().toISOString(),
      seenBy: [],
      receivedBy: recipients
    };
    db.messages.push(created);
    return created;
  });

  if (message.missingEvent) return res.status(404).json({ message: "Event not found." });
  res.status(201).json(message);
});

app.post("/api/messages/:id/follow-up", ...requireRole("organizer"), (req, res) => {
  const message = save((db) => {
    const original = db.messages.find((entry) => entry.id === req.params.id);
    if (!original) return null;
    const unseenGuests = original.receivedBy.filter((guestId) => !original.seenBy.includes(guestId));
    const created = {
      id: nextId("m", db.messages),
      eventId: original.eventId,
      audience: "unseen guests",
      body: req.body.body || `Reminder: ${original.body}`,
      sentAt: new Date().toISOString(),
      seenBy: [],
      receivedBy: unseenGuests
    };
    db.messages.push(created);
    return created;
  });

  if (!message) return res.status(404).json({ message: "Message not found." });
  res.status(201).json(message);
});

app.get("/api/messages", (req, res) => {
  const { eventId, guestId } = req.query;
  let messages = readDb().messages;
  if (eventId) messages = messages.filter((message) => message.eventId === eventId);
  if (guestId) messages = messages.filter((message) => message.receivedBy.includes(guestId));
  res.json(messages);
});

app.patch("/api/messages/:id/seen", ...requireRole("guest", "organizer", "staff"), (req, res) => {
  const { guestId } = req.body;
  if (!guestId) return validationError(res, "guestId is required.");

  const message = save((db) => {
    const item = db.messages.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    if (!db.guests.some((guest) => guest.id === guestId)) return { missingGuest: true };
    if (!item.receivedBy.includes(guestId)) item.receivedBy.push(guestId);
    if (!item.seenBy.includes(guestId)) item.seenBy.push(guestId);
    return item;
  });

  if (message?.missingGuest) return res.status(404).json({ message: "Guest not found." });
  if (!message) return res.status(404).json({ message: "Message not found." });
  res.json(message);
});

app.get("/api/feedback", (req, res) => {
  const { eventId } = req.query;
  let feedback = readDb().feedback;
  if (eventId) feedback = feedback.filter((item) => item.eventId === eventId);
  res.json(feedback);
});

app.post("/api/feedback", ...requireRole("guest"), (req, res) => {
  const { eventId, guestId, overall, food, venue, organization } = req.body;
  if (!eventId || !guestId || !overall || !food || !venue || !organization) {
    return validationError(res, "Event, guest, and all rating fields are required.");
  }
  if (![overall, food, venue, organization].every(isRating)) return validationError(res, "Ratings must be whole numbers from 1 to 5.");

  const feedback = save((db) => {
    const event = db.events.find((item) => item.id === eventId);
    const guest = db.guests.find((item) => item.id === guestId && item.eventId === eventId);
    if (!event || !guest) return { missingReference: true };
    const created = {
      id: nextId("f", db.feedback),
      eventId,
      guestId,
      overall: Number(overall),
      food: Number(food),
      venue: Number(venue),
      organization: Number(organization),
      comments: req.body.comments || ""
    };
    db.feedback.push(created);
    return created;
  });

  if (feedback.missingReference) return validationError(res, "Event and guest must exist, and the guest must belong to the event.");
  res.status(201).json(feedback);
});

app.get("/api/reports/:eventId", (req, res) => {
  const db = readDb();
  const report = eventReport(db, req.params.eventId);
  if (!report) return res.status(404).json({ message: "Event not found." });
  res.json(report);
});

app.get("/api/organizer/me/overview", ...requireRole("organizer"), (req, res) => {
  const db = readDb();
  const events = db.events.filter((event) => event.organizerId === req.user.id);
  const eventIds = events.map((event) => event.id);
  res.json({
    organizer: req.user,
    events,
    bookings: db.bookingRequests.filter((booking) => booking.organizerId === req.user.id),
    tasks: db.tasks.filter((task) => eventIds.includes(task.eventId)),
    guests: db.guests.filter((guest) => eventIds.includes(guest.eventId)),
    sourcingRequests: db.sourcingRequests.filter((request) => request.organizerId === req.user.id),
    invoices: db.invoices.filter((invoice) => eventIds.includes(invoice.eventId))
  });
});

app.get("/api/staff/me/tasks", ...requireRole("staff"), (req, res) => {
  res.json(readDb().tasks.filter((task) => task.assignedTo === req.user.id));
});

app.get("/api/vendor/me/requests", ...requireRole("vendor"), (req, res) => {
  const db = readDb();
  const vendor = db.vendors.find((item) => item.userId === req.user.id);
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found." });
  res.json(db.sourcingRequests.filter((request) => request.vendorId === vendor.id));
});

app.get("/api/vendor/me/profile", ...requireRole("vendor"), (req, res) => {
  const vendor = readDb().vendors.find((item) => item.userId === req.user.id);
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found." });
  res.json(vendor);
});

app.patch("/api/vendor/me/profile", ...requireRole("vendor"), (req, res) => {
  const { companyName, mainLocation, pricingList, contact, supplies } = req.body;
  const vendor = save((db) => {
    const item = db.vendors.find((entry) => entry.userId === req.user.id);
    if (!item) return null;
    if (companyName) item.companyName = String(companyName).trim();
    if (mainLocation) item.mainLocation = String(mainLocation).trim();
    if (pricingList) item.pricingList = String(pricingList).trim();
    if (contact) item.contact = String(contact).trim();
    if (supplies !== undefined) {
      item.supplies = Array.isArray(supplies)
        ? supplies.map((entry) => String(entry).trim()).filter(Boolean)
        : String(supplies).split(",").map((entry) => entry.trim()).filter(Boolean);
    }
    return item;
  });

  if (!vendor) return res.status(404).json({ message: "Vendor profile not found." });
  res.json(vendor);
});

app.get("/api/guest/me/invitations", ...requireRole("guest"), (req, res) => {
  const db = readDb();
  const guestRecords = db.guests.filter((guest) => guest.email.toLowerCase() === req.user.email.toLowerCase());
  res.json(guestRecords.map((guest) => ({ ...guest, event: db.events.find((event) => event.id === guest.eventId) })));
});

app.get("/api/guest/me/profile", ...requireRole("guest"), (req, res) => {
  res.json(publicUser(readDb().users.find((item) => item.id === req.user.id)));
});

app.patch("/api/guest/me/profile", ...requireRole("guest"), (req, res) => {
  const { name } = req.body;
  const updated = save((db) => {
    const user = db.users.find((item) => item.id === req.user.id);
    if (!user) return null;
    const previousEmail = user.email;
    if (name) user.name = String(name).trim();
    if (req.body.email) {
      if (!isEmail(req.body.email)) return { invalidEmail: true };
      if (db.users.some((item) => item.id !== user.id && item.email.toLowerCase() === String(req.body.email).toLowerCase())) {
        return { duplicate: true };
      }
      user.email = String(req.body.email).trim();
      db.guests
        .filter((guest) => guest.email.toLowerCase() === previousEmail.toLowerCase())
        .forEach((guest) => {
          guest.email = user.email;
        });
    }
    return user;
  });

  if (!updated) return res.status(404).json({ message: "Guest profile not found." });
  if (updated.invalidEmail) return validationError(res, "Email must be valid.");
  if (updated.duplicate) return validationError(res, "A user with this email already exists.");
  res.json(publicUser(updated));
});

app.get("/api/venue-owner/me/profile", ...requireRole("venue-owner"), (req, res) => {
  res.json(publicUser(readDb().users.find((item) => item.id === req.user.id)));
});

app.patch("/api/venue-owner/me/profile", ...requireRole("venue-owner"), (req, res) => {
  const { name, companyName, contact } = req.body;
  const updated = save((db) => {
    const user = db.users.find((item) => item.id === req.user.id);
    if (!user) return null;
    if (name) user.name = String(name).trim();
    if (companyName) user.companyName = String(companyName).trim();
    if (contact) user.contact = String(contact).trim();
    if (req.body.email) {
      if (!isEmail(req.body.email)) return { invalidEmail: true };
      if (db.users.some((item) => item.id !== user.id && item.email.toLowerCase() === String(req.body.email).toLowerCase())) {
        return { duplicate: true };
      }
      user.email = String(req.body.email).trim();
    }
    return user;
  });

  if (!updated) return res.status(404).json({ message: "Venue owner profile not found." });
  if (updated.invalidEmail) return validationError(res, "Email must be valid.");
  if (updated.duplicate) return validationError(res, "A user with this email already exists.");
  res.json(publicUser(updated));
});

app.delete("/api/venues/:id", ...requireRole("venue-owner"), (req, res) => {
  const removed = save((db) => {
    const venue = db.venues.find((item) => item.id === req.params.id);
    if (!venue) return null;
    if (venue.ownerId !== req.user.id) return { forbidden: true };
    db.venues = db.venues.filter((item) => item.id !== venue.id);
    db.bookingRequests = db.bookingRequests.filter((booking) => booking.venueId !== venue.id);
    return venue;
  });

  if (!removed) return res.status(404).json({ message: "Venue not found." });
  if (removed.forbidden) return res.status(403).json({ message: "You can only delete your own venue listings." });
  res.json(removed);
});

app.get("/api/venue-owner/reports", (req, res) => {
  const db = readDb();
  const { ownerId } = req.query;
  const venues = ownerId ? db.venues.filter((venue) => venue.ownerId === ownerId) : db.venues;
  res.json(
    venues.map((venue) => {
      const bookings = db.bookingRequests.filter((booking) => booking.venueId === venue.id);
      const approved = bookings.filter((booking) => booking.status === "Approved");
      return {
        venueId: venue.id,
        venueName: venue.name,
        totalBookings: bookings.length,
        bookingRate: bookings.length ? Number((approved.length / bookings.length).toFixed(2)) : 0,
        revenue: approved.length * venue.pricePerDay
      };
    })
  );
});

app.listen(port, () => {
  console.log(`Event platform API running on http://localhost:${port}`);
});
