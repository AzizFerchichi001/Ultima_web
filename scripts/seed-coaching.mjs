/**
 * Seed coaching data: coach profiles, availability rules, and sample requests.
 *
 * Usage:
 *   PG_PORT=5433 PG_PASSWORD=admin PG_DATABASE=ultima_web node scripts/seed-coaching.mjs
 */
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function findUserByEmail(email) {
  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  return rows[0] ?? null;
}

async function findFirstArena() {
  const { rows } = await pool.query("SELECT id FROM arenas LIMIT 1");
  return rows[0] ?? null;
}

// ── 1. Ensure coach users exist ───────────────────────────────────────────────

const coachEmails = [
  { email: "coach@ultima-arena.test", firstName: "Rania", lastName: "Ben Amor" },
];

// Try to also find any user with role=coach in arena_memberships
const { rows: existingCoaches } = await pool.query(`
  SELECT u.id, u.email, u.first_name, u.last_name
  FROM users u
  JOIN arena_memberships am ON am.user_id = u.id
  WHERE am.role = 'coach'
  LIMIT 5
`);

console.log(`Found ${existingCoaches.length} existing coach member(s).`);

const arena = await findFirstArena();
if (!arena) {
  console.error("No arena found — run the main seed first.");
  process.exit(1);
}
console.log(`Using arena id=${arena.id}`);

// ── 2. Upsert coach profiles ──────────────────────────────────────────────────

const coachProfilesData = [
  {
    email: "coach@ultima-arena.test",
    headline: "Certified Padel Coach | Former National Player",
    bio: "Passionate padel coach with 8 years of competitive experience. I specialise in technique refinement, tactical play, and mental coaching. Whether you're a complete beginner or an advanced player looking to compete, I tailor every session to your goals.",
    expertise: ["Serve & Return", "Net Play", "Match Tactics", "Beginner Fundamentals"],
    qualities: ["Patient", "Motivating", "Detail-oriented", "Competitive mindset"],
    certifications: ["FTP Level 2 Coach", "World Padel Tour Academy Graduate"],
    previousWorkplaces: ["Club Padel Tunis", "Académie Sport Elite"],
    languages: ["Arabic", "French", "English"],
    yearsExperience: 8,
    hourlyRate: 80,
    currency: "TND",
  },
];

for (const coachData of existingCoaches) {
  const profileData = coachProfilesData[0]; // apply same profile template to all found coaches

  // Check if coach has an email matching our templates
  const match = coachProfilesData.find((c) => c.email === coachData.email);
  const pd = match ?? profileData;

  try {
    await pool.query(
      `INSERT INTO coach_profiles (
        user_id, arena_id, headline, bio,
        expertise, qualities, certifications, previous_workplaces, languages,
        years_experience, hourly_rate, currency, is_active, is_verified
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true)
      ON CONFLICT (user_id) DO UPDATE SET
        headline = EXCLUDED.headline,
        bio = EXCLUDED.bio,
        expertise = EXCLUDED.expertise,
        qualities = EXCLUDED.qualities,
        certifications = EXCLUDED.certifications,
        previous_workplaces = EXCLUDED.previous_workplaces,
        languages = EXCLUDED.languages,
        years_experience = EXCLUDED.years_experience,
        hourly_rate = EXCLUDED.hourly_rate,
        currency = EXCLUDED.currency,
        is_verified = true,
        updated_at = NOW()`,
      [
        coachData.id,
        arena.id,
        pd.headline,
        pd.bio,
        JSON.stringify(pd.expertise),
        JSON.stringify(pd.qualities),
        JSON.stringify(pd.certifications),
        JSON.stringify(pd.previousWorkplaces),
        JSON.stringify(pd.languages),
        pd.yearsExperience,
        pd.hourlyRate,
        pd.currency,
      ]
    );
    console.log(`✓ Coach profile upserted for user_id=${coachData.id} (${coachData.email})`);
  } catch (err) {
    console.error(`✗ coach_profiles for user ${coachData.id}:`, err.message);
  }
}

// Also try the hardcoded test coach
const testCoach = await findUserByEmail("coach@ultima-arena.test");
if (testCoach && !existingCoaches.some((c) => c.id === testCoach.id)) {
  const pd = coachProfilesData[0];
  try {
    await pool.query(
      `INSERT INTO coach_profiles (
        user_id, arena_id, headline, bio,
        expertise, qualities, certifications, previous_workplaces, languages,
        years_experience, hourly_rate, currency, is_active, is_verified
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true)
      ON CONFLICT (user_id) DO UPDATE SET
        headline = EXCLUDED.headline, bio = EXCLUDED.bio,
        expertise = EXCLUDED.expertise, qualities = EXCLUDED.qualities,
        certifications = EXCLUDED.certifications,
        previous_workplaces = EXCLUDED.previous_workplaces,
        languages = EXCLUDED.languages,
        years_experience = EXCLUDED.years_experience,
        hourly_rate = EXCLUDED.hourly_rate,
        currency = EXCLUDED.currency,
        is_verified = true, updated_at = NOW()`,
      [
        testCoach.id, arena.id, pd.headline, pd.bio,
        JSON.stringify(pd.expertise), JSON.stringify(pd.qualities),
        JSON.stringify(pd.certifications), JSON.stringify(pd.previousWorkplaces),
        JSON.stringify(pd.languages), pd.yearsExperience, pd.hourlyRate, pd.currency,
      ]
    );
    console.log(`✓ Coach profile upserted for test coach id=${testCoach.id}`);
  } catch (err) {
    console.error(`✗ coach_profiles for test coach:`, err.message);
  }
}

// ── 3. Seed availability rules (Mon–Fri 08:00–20:00, Sat 09:00–17:00) ────────

const allCoachIds = [
  ...existingCoaches.map((c) => c.id),
  ...(testCoach && !existingCoaches.some((c) => c.id === testCoach.id) ? [testCoach.id] : []),
];

for (const coachUserId of allCoachIds) {
  try {
    await pool.query(
      "DELETE FROM coach_availability_rules WHERE coach_user_id = $1",
      [coachUserId]
    );

    // Mon–Fri: 08:00–20:00
    for (const dow of [1, 2, 3, 4, 5]) {
      await pool.query(
        `INSERT INTO coach_availability_rules (coach_user_id, arena_id, day_of_week, start_time, end_time)
         VALUES ($1,$2,$3,'08:00','20:00')`,
        [coachUserId, arena.id, dow]
      );
    }
    // Saturday: 09:00–17:00
    await pool.query(
      `INSERT INTO coach_availability_rules (coach_user_id, arena_id, day_of_week, start_time, end_time)
       VALUES ($1,$2,6,'09:00','17:00')`,
      [coachUserId, arena.id]
    );

    console.log(`✓ Availability rules set for coach_user_id=${coachUserId}`);
  } catch (err) {
    console.error(`✗ availability_rules for coach ${coachUserId}:`, err.message);
  }
}

// ── 4. Sample coaching request (player1 → coach) ──────────────────────────────

const player1 = await findUserByEmail("player1@ultima-arena.test");

if (player1 && allCoachIds.length > 0) {
  const coachUserId = allCoachIds[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  try {
    await pool.query(
      `INSERT INTO coaching_requests
         (player_user_id, coach_user_id, arena_id, requested_date,
          requested_start_time, requested_end_time, players_count, message, status)
       VALUES ($1,$2,$3,$4,'10:00','11:00',2,
         'Hi! I would like to work on my serve technique. Looking forward to the session!',
         'pending')
       ON CONFLICT DO NOTHING`,
      [player1.id, coachUserId, arena.id, tomorrowStr]
    );
    console.log(`✓ Sample coaching request created: player ${player1.id} → coach ${coachUserId}`);
  } catch (err) {
    console.error(`✗ sample coaching_request:`, err.message);
  }
}

// ── Done ──────────────────────────────────────────────────────────────────────

await pool.end();
console.log("\nCoaching seed complete.");
