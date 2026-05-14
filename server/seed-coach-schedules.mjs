/**
 * seed-coach-schedules.mjs
 *
 * Fills coach_availability_rules (and optionally coach_profiles) for every
 * coach user found in the database.  Safe to re-run — existing rules are
 * replaced, profiles are upserted.
 *
 * Usage:
 *   node server/seed-coach-schedules.mjs
 */

import { default as pool } from "./pg-pool.mjs";
import bcrypt from "bcryptjs";

// ── Coach schedule templates ──────────────────────────────────────────────────
// Each template defines a realistic weekly availability pattern.
// dow: 0 = Sun, 1 = Mon … 6 = Sat

const TEMPLATES = [
  {
    name: "Standard weekday",
    // Mon–Fri  08:00–12:00 & 14:00–18:00 (lunch break)
    // Saturday 09:00–13:00
    // Sunday off
    rules: [
      // Monday–Friday: morning block
      ...[ 1, 2, 3, 4, 5 ].map(dow => ({ dow, start: "08:00", end: "12:00", available: true })),
      // Monday–Friday: break
      ...[ 1, 2, 3, 4, 5 ].map(dow => ({ dow, start: "12:00", end: "14:00", available: false })),
      // Monday–Friday: afternoon block
      ...[ 1, 2, 3, 4, 5 ].map(dow => ({ dow, start: "14:00", end: "18:00", available: true })),
      // Saturday morning
      { dow: 6, start: "09:00", end: "13:00", available: true },
    ],
  },
  {
    name: "Morning specialist",
    // Mon–Sat  07:00–12:00, afternoon off
    // Sunday off
    rules: [
      ...[ 1, 2, 3, 4, 5, 6 ].map(dow => ({ dow, start: "07:00", end: "12:00", available: true })),
    ],
  },
  {
    name: "Afternoon / evening",
    // Mon–Fri  15:00–21:00
    // Saturday 10:00–15:00
    // Sunday off
    rules: [
      ...[ 1, 2, 3, 4, 5 ].map(dow => ({ dow, start: "15:00", end: "21:00", available: true })),
      { dow: 6, start: "10:00", end: "15:00", available: true },
    ],
  },
  {
    name: "Full week with mid-week rest",
    // Mon, Tue, Thu, Fri, Sat  08:00–17:00 with a break 12–13
    // Wednesday & Sunday off
    rules: [
      ...[ 1, 2, 4, 5, 6 ].map(dow => ({ dow, start: "08:00", end: "12:00", available: true })),
      ...[ 1, 2, 4, 5, 6 ].map(dow => ({ dow, start: "12:00", end: "13:00", available: false })),
      ...[ 1, 2, 4, 5, 6 ].map(dow => ({ dow, start: "13:00", end: "17:00", available: true })),
    ],
  },
  {
    name: "Weekend warrior",
    // Sat & Sun full day  08:00–18:00 with 13–14 break
    // Tue, Thu evenings  17:00–21:00
    rules: [
      ...[ 0, 6 ].map(dow => ({ dow, start: "08:00", end: "13:00", available: true })),
      ...[ 0, 6 ].map(dow => ({ dow, start: "13:00", end: "14:00", available: false })),
      ...[ 0, 6 ].map(dow => ({ dow, start: "14:00", end: "18:00", available: true })),
      ...[ 2, 4 ].map(dow => ({ dow, start: "17:00", end: "21:00", available: true })),
    ],
  },
];

// ── Coach profile seed data (indexed by position, cycles) ─────────────────────

const PROFILE_SEEDS = [
  {
    headline: "Padel & Tennis specialist with 8 years of competitive experience",
    bio: "Former national-level player turned coach. I focus on technique, tactical awareness, and mental resilience. Available for beginners through advanced players.",
    expertise: ["Padel", "Tennis"],
    qualities: ["Patient", "Analytical", "Motivating"],
    certifications: ["ITF Level 2", "FPT Certified Coach"],
    languages: ["French", "Arabic", "English"],
    yearsExperience: 8,
    hourlyRate: 80,
  },
  {
    headline: "High-performance coach — Padel, fitness & injury prevention",
    bio: "Specialising in high-intensity training and injury prevention. I combine sports science with court time to get the most out of each session.",
    expertise: ["Padel", "Fitness"],
    qualities: ["Rigorous", "Supportive", "Detail-oriented"],
    certifications: ["STAPS Degree", "First Aid Certified"],
    languages: ["French", "English"],
    yearsExperience: 5,
    hourlyRate: 70,
  },
  {
    headline: "Youth & junior development coach",
    bio: "Passionate about developing young talent from 6 years old upwards. Patient approach with strong fundamentals methodology.",
    expertise: ["Youth Coaching", "Padel", "Tennis"],
    qualities: ["Patient", "Fun", "Encouraging"],
    certifications: ["Child Sports Coaching Level 1", "CPR Certified"],
    languages: ["Arabic", "French"],
    yearsExperience: 4,
    hourlyRate: 60,
  },
  {
    headline: "Technical padel coach & video analysis expert",
    bio: "I use video analysis to break down technique and build personalised improvement plans. Former touring pro with 10 years coaching experience.",
    expertise: ["Padel", "Video Analysis", "Technical Coaching"],
    qualities: ["Technical", "Data-driven", "Experienced"],
    certifications: ["WPT Certified", "UEFA Futsal Analytic Badge"],
    languages: ["French", "Spanish", "English"],
    yearsExperience: 10,
    hourlyRate: 100,
  },
  {
    headline: "Wellness & sport performance coach",
    bio: "Holistic coach covering physical conditioning, mental preparation and nutrition basics alongside court training.",
    expertise: ["Wellness", "Padel", "Conditioning"],
    qualities: ["Holistic", "Calm", "Goal-oriented"],
    certifications: ["Sports Nutrition Certificate", "Mindfulness Coach Level 1"],
    languages: ["French", "Arabic"],
    yearsExperience: 6,
    hourlyRate: 75,
  },
];

// ── Extra demo coaches to create if fewer than 4 exist in DB ─────────────────

const DEMO_COACHES = [
  { firstName: "Karim",    lastName: "Benali",   email: "karim.benali@ultima-arena.test" },
  { firstName: "Sonia",    lastName: "Maaloul",  email: "sonia.maaloul@ultima-arena.test" },
  { firstName: "Mehdi",    lastName: "Triki",    email: "mehdi.triki@ultima-arena.test" },
  { firstName: "Yasmine",  lastName: "Chaabane", email: "yasmine.chaabane@ultima-arena.test" },
  { firstName: "Amine",    lastName: "Jouini",   email: "amine.jouini@ultima-arena.test" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick(arr, idx) { return arr[idx % arr.length]; }

async function ensureCoachProfile(coachId, arenaId, profileData) {
  const existing = await pool.query("SELECT id FROM coach_profiles WHERE user_id = $1", [coachId]);
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE coach_profiles SET
         headline = $2, bio = $3, expertise = $4, qualities = $5,
         certifications = $6, languages = $7, years_experience = $8,
         hourly_rate = $9, is_active = true, updated_at = NOW()
       WHERE user_id = $1`,
      [
        coachId,
        profileData.headline,
        profileData.bio,
        JSON.stringify(profileData.expertise),
        JSON.stringify(profileData.qualities),
        JSON.stringify(profileData.certifications),
        JSON.stringify(profileData.languages),
        profileData.yearsExperience,
        profileData.hourlyRate,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO coach_profiles
         (user_id, arena_id, headline, bio, expertise, qualities,
          certifications, languages, years_experience, hourly_rate,
          currency, is_active, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TND',true,true)`,
      [
        coachId,
        arenaId,
        profileData.headline,
        profileData.bio,
        JSON.stringify(profileData.expertise),
        JSON.stringify(profileData.qualities),
        JSON.stringify(profileData.certifications),
        JSON.stringify(profileData.languages),
        profileData.yearsExperience,
        profileData.hourlyRate,
      ]
    );
  }
}

async function setAvailabilityRules(coachId, arenaId, template) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM coach_availability_rules WHERE coach_user_id = $1", [coachId]);
    for (const r of template.rules) {
      await client.query(
        `INSERT INTO coach_availability_rules
           (coach_user_id, arena_id, day_of_week, start_time, end_time, is_available)
         VALUES ($1, $2, $3, $4::time, $5::time, $6)`,
        [coachId, arenaId, r.dow, r.start, r.end, r.available]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Coach Schedule Seeder ===\n");

  // Get the first arena (or create one)
  const { rows: arenaRows } = await pool.query(
    "SELECT id, name FROM arenas ORDER BY id LIMIT 1"
  );
  if (!arenaRows.length) {
    console.error("No arenas found. Run the main server first to create the test arena.");
    process.exit(1);
  }
  const arena = arenaRows[0];
  console.log(`Using arena: "${arena.name}" (id=${arena.id})\n`);

  // Get all existing coaches (distinct)
  let { rows: coaches } = await pool.query(
    `SELECT DISTINCT ON (u.id) u.id, u.first_name, u.last_name, u.email,
            COALESCE(cp.arena_id, am.arena_id, $1) AS arena_id
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arena_memberships am ON am.user_id = u.id AND am.role = 'coach'
     WHERE u.role = 'coach'
     ORDER BY u.id`,
    [arena.id]
  );

  console.log(`Found ${coaches.length} existing coach(es) in DB.`);

  // Create demo coaches if we have fewer than 4
  if (coaches.length < 4) {
    const defaultPassword = process.env.ULTIMA_TEST_PASSWORD ?? "Ultima123!";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const needed = DEMO_COACHES.slice(coaches.length, Math.max(coaches.length, 4));
    for (const dc of needed) {
      const existing = await pool.query("SELECT id FROM users WHERE email = $1", [dc.email]);
      if (existing.rows.length > 0) {
        console.log(`  → ${dc.email} already exists, skipping create`);
        coaches.push({ id: existing.rows[0].id, first_name: dc.firstName, last_name: dc.lastName, email: dc.email, arena_id: arena.id });
        continue;
      }
      const { rows: newUser } = await pool.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'coach', 'active')
         RETURNING id`,
        [dc.firstName, dc.lastName, dc.email, passwordHash]
      );
      const userId = newUser[0].id;
      // Add arena membership
      await pool.query(
        `INSERT INTO arena_memberships (user_id, arena_id, role) VALUES ($1, $2, 'coach')
         ON CONFLICT (user_id, arena_id) DO NOTHING`,
        [userId, arena.id]
      );
      coaches.push({ id: userId, first_name: dc.firstName, last_name: dc.lastName, email: dc.email, arena_id: arena.id });
      console.log(`  ✓ Created coach: ${dc.firstName} ${dc.lastName} <${dc.email}>`);
    }
  }

  console.log(`\nSeeding schedules for ${coaches.length} coach(es)...\n`);

  for (let i = 0; i < coaches.length; i++) {
    const coach    = coaches[i];
    const template = pick(TEMPLATES, i);
    const profile  = pick(PROFILE_SEEDS, i);
    const arenaId  = coach.arena_id ?? arena.id;

    console.log(`[${i + 1}/${coaches.length}] ${coach.first_name} ${coach.last_name} (id=${coach.id})`);
    console.log(`     Template : "${template.name}"`);
    console.log(`     Rules    : ${template.rules.filter(r => r.available).length} available blocks, ${template.rules.filter(r => !r.available).length} break(s)`);

    await ensureCoachProfile(coach.id, arenaId, profile);
    await setAvailabilityRules(coach.id, arenaId, template);

    console.log(`     ✓ Profile & availability saved\n`);
  }

  // Summary
  const { rows: summary } = await pool.query(
    `SELECT u.first_name || ' ' || u.last_name AS name,
            COUNT(CASE WHEN r.is_available THEN 1 END) AS available_blocks,
            COUNT(CASE WHEN NOT r.is_available THEN 1 END) AS break_blocks
     FROM users u
     JOIN coach_availability_rules r ON r.coach_user_id = u.id
     GROUP BY u.id, u.first_name, u.last_name
     ORDER BY u.first_name`
  );

  console.log("=== Final availability summary ===");
  console.table(summary);

  console.log("\nDone.");
  process.exit(0);
}

main().catch(err => {
  console.error("Seeder failed:", err.message);
  process.exit(1);
});
