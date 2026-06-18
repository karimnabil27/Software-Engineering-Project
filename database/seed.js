import { seedDatabase } from "../backend/src/db.js";

const dbPath = seedDatabase();
console.log(`Seeded database at ${dbPath}`);
