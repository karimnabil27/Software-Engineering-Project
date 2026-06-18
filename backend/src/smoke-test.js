const API_URL = process.env.API_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${body.message || response.statusText}`);
  }
  return body;
}

async function login(email, password = "password123") {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  return result.token;
}

async function main() {
  const organizerToken = await login("jonathan@giuberlin", "1234");
  const staffToken = await login("omar@events.test");
  const guestToken = await login("youssef@example.test");

  await request("/health");
  await request("/auth/me", { headers: { Authorization: `Bearer ${organizerToken}` } });
  await request("/venues/v1/availability", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ unavailableDates: ["2026-06-20", "2026-06-29", "2026-07-05"] })
  });
  await request("/budgets/e1/plan", {
    method: "PUT",
    headers: { Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({
      totalPlanned: 190000,
      plannedItems: [
        { name: "Venue", amount: 45000 },
        { name: "Catering", amount: 90000 },
        { name: "AV", amount: 35000 },
        { name: "Marketing", amount: 20000 }
      ]
    })
  });
  await request("/staff/u2/tasks/t1/progress", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ status: "In Progress" })
  });
  await request("/messages/m1/seen", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${guestToken}` },
    body: JSON.stringify({ guestId: "g1" })
  });
  await request("/invoices/inv1/review", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ status: "Approved", reviewNote: "Approved after itemized review." })
  });

  console.log("Backend smoke test passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
