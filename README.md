# Event Management Platform

A full-stack event management platform for organizers, staff, vendors, guests, and venue owners. The app implements the supplied GUC user journeys with a React frontend, a Node.js/Express backend, and a seeded JSON database.

## Team Members

-Jonathan Mesdary 22001210
-Philopateer Hany 22001315
-Youssef Azer 22001286
-Karim Nabil 19002105
## Technologies Used

- Frontend: React and Vite
- Backend: Node.js and Express
- Database: Seeded JSON file stored at `backend/data/db.json`
- Tooling: npm, concurrently

## Implemented User Journeys

- Organizer account/stakeholder management through user APIs.
- Venue browsing, filtering by location/date/capacity, and booking request submission.
- Daily organizer dashboard with upcoming events, task reminders, and feedback counts.
- Event planning with task status tracking, budget summary, vendor requests, guest invitations, day-of messages, venue layout view, and report export.
- Staff dashboard with assigned events/tasks, layout view, guest check-in, and vendor arrival coordination.
- Vendor dashboard with sourcing request review, accept/decline actions, delivery status updates, and invoice submission.
- Guest dashboard with invitation details, RSVP update, dietary preferences, QR code display, day-of messages, and post-event feedback.
- Venue owner dashboard with listing management, booking approval/decline, confirmed booking overview, and revenue reporting.

## Assumptions

- The frontend still uses role tabs for quick demos, but the backend also provides JWT login and role-protected workflow endpoints.
- The database is a JSON file to keep local setup simple while still supporting persistent read/write operations and seeding.
- Email, messaging, QR scanning, file uploads, and PDF/image exports are simulated in the UI. Export actions use browser print.
- The digital floor plan stores positioned layout elements. Full drag-and-drop editing can be added later if required.
- The demo date is set to `2026-06-24` by default through the backend dashboard route.

## Setup

Install dependencies from the project root:

```bash
npm install
npm run install:all
```

Seed or reset the dummy database:

```bash
npm run seed
```

Run frontend and backend together:

```bash
npm run dev
```

Open the frontend at:

```text
http://localhost:5173
```

The backend API runs at:

```text
http://localhost:4000/api
```

## Backend Commands

```bash
cd backend
npm install
npm run seed
npm run dev
```

## Frontend Commands

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Backend:

```text
PORT=4000
CLIENT_URL=http://localhost:5173
DEMO_DATE=2026-06-24
JWT_SECRET=replace-this-for-real-deployments
```

Frontend:

```text
VITE_API_URL=http://localhost:4000/api
```

These values are optional because defaults are already included in the code.

## Dummy Data

The seed script creates realistic sample data for:

- Users and roles
- Venues and venue owners
- Events
- Tasks
- Budgets and expenses
- Vendors, sourcing requests, and invoices
- Guests, RSVPs, check-in statuses, and dietary preferences
- Day-of messages
- Booking requests
- Feedback and reports

Reset the database at any time with:

```bash
npm run seed
```

## Backend Authentication

The backend includes simple JWT authentication for demo and API testing. The organizer account uses your requested login:

```text
jonathan@giuberlin
1234
```

Other seeded users use this password:

```text
password123
```

Demo accounts:

- Organizer: `jonathan@giuberlin`
- Staff: `omar@events.test`
- Vendor: `hello@nilecatering.test`
- Venue owner: `owner@zamalekvenues.test`
- Guest: `youssef@example.test`

Login:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "jonathan@giuberlin",
  "password": "1234"
}
```

Use the returned token on protected routes:

```text
Authorization: Bearer <token>
```

## Backend Smoke Test

Start the backend in one terminal:

```bash
cd backend
npm run seed
npm run dev
```

Run the smoke test in another terminal:

```bash
cd backend
npm run smoke
```

The smoke test logs in, checks auth, updates venue availability, updates a budget plan, changes staff task progress, marks a message as seen, and reviews an invoice.

## API Overview

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`
- `GET /api/venues`, `POST /api/venues`, `PATCH /api/venues/:id`, `PATCH /api/venues/:id/availability`
- `GET /api/bookings`, `POST /api/bookings`, `PATCH /api/bookings/:id`
- `GET /api/events`, `POST /api/events`
- `GET /api/events/:id/layout`, `PUT /api/events/:id/layout`
- `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`
- `PATCH /api/staff/:staffId/tasks/:taskId/progress`
- `GET /api/budgets/:eventId`, `PUT /api/budgets/:eventId/plan`, `POST /api/budgets/:eventId/expenses`
- `GET /api/vendors`
- `GET /api/sourcing-requests`, `POST /api/sourcing-requests`, `PATCH /api/sourcing-requests/:id`
- `GET /api/invoices`, `POST /api/invoices`, `PATCH /api/invoices/:id`, `PATCH /api/invoices/:id/review`
- `GET /api/guests`, `POST /api/guests`, `PATCH /api/guests/:id`
- `GET /api/messages`, `POST /api/messages`, `PATCH /api/messages/:id/seen`, `POST /api/messages/:id/follow-up`
- `GET /api/feedback`, `POST /api/feedback`
- `GET /api/reports/:eventId`
- `GET /api/organizer/me/overview`
- `GET /api/staff/me/tasks`
- `GET /api/vendor/me/requests`
- `GET /api/guest/me/invitations`
- `GET /api/venue-owner/reports`

