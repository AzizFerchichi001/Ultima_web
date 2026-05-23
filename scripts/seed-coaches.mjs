/**
 * Seed realistic padel coaches across multiple arenas.
 * Password for all new accounts: Coach123!
 */

import pool from '../server/pg-pool.mjs';
import bcrypt from 'bcryptjs';

const PASSWORD = 'Coach123!';
const hash = await bcrypt.hash(PASSWORD, 10);

const coaches = [
  {
    firstName: 'Ahmed', lastName: 'Karray',
    email: 'ahmed.karray@ultima.tn',
    arenaId: 2, // Arena Padel Premium – La Soukra
    profile: {
      headline: 'Certified Padel Pro · 10+ years experience',
      bio: 'Former national padel champion turned full-time coach. I specialize in competitive match preparation, technical corrections, and mental game. My sessions are structured, intense, and always results-oriented.',
      expertise: ['Serve technique', 'Match strategy', 'Bandeja & Vibora', 'Competitive prep'],
      qualities: ['Patient', 'Motivating', 'Detail-oriented', 'Competitive mindset'],
      certifications: ['FTP Padel Level 3', 'WPT Certified Coach', 'First Aid Certificate'],
      previousWorkplaces: ['Tunis Padel Club', 'Club Med Hammamet', 'Carthage Padel Academy'],
      languages: ['Arabic', 'French', 'English'],
      yearsExperience: 10,
      hourlyRate: 90,
      currency: 'TND',
    },
    availability: [
      { dayOfWeek: 1, startTime: '08:00', endTime: '13:00' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '13:00' },
      { dayOfWeek: 3, startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 4, startTime: '08:00', endTime: '13:00' },
      { dayOfWeek: 5, startTime: '08:00', endTime: '13:00' },
      { dayOfWeek: 6, startTime: '09:00', endTime: '18:00' },
    ],
  },
  {
    firstName: 'Sana', lastName: 'Ouertani',
    email: 'sana.ouertani@ultima.tn',
    arenaId: 3, // Padel Indoor La Soukra
    profile: {
      headline: 'Women\'s Padel Specialist · FTP Level 2',
      bio: 'Passionate about growing women\'s padel in Tunisia. I offer beginner-friendly sessions to advanced tactical training. My approach is encouraging, structured, and adapted to every level. Come as you are, leave as a player.',
      expertise: ['Beginner courses', 'Women\'s padel', 'Footwork & positioning', 'Net play'],
      qualities: ['Encouraging', 'Empathetic', 'Structured', 'Fun'],
      certifications: ['FTP Padel Level 2', 'Sports Nutrition Certificate'],
      previousWorkplaces: ['La Soukra Tennis Academy', 'Padel Friends Club'],
      languages: ['Arabic', 'French'],
      yearsExperience: 5,
      hourlyRate: 70,
      currency: 'TND',
    },
    availability: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '19:00' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '19:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '19:00' },
      { dayOfWeek: 4, startTime: '09:00', endTime: '19:00' },
      { dayOfWeek: 5, startTime: '09:00', endTime: '12:00' },
      { dayOfWeek: 6, startTime: '10:00', endTime: '17:00' },
    ],
  },
  {
    firstName: 'Karim', lastName: 'Belhaj',
    email: 'karim.belhaj@ultima.tn',
    arenaId: 4, // Padel Marsa
    profile: {
      headline: 'High Performance Coach · Ex-WPT Junior Circuit',
      bio: 'I competed on the WPT Junior circuit for 3 years before transitioning to coaching. My strength is helping intermediate players break plateaus — I will fix your mechanics, sharpen your decision-making, and push you further than you think you can go.',
      expertise: ['Advanced tactics', 'Power shots', 'Smash & lob', 'Tournament prep'],
      qualities: ['Demanding', 'Precise', 'Experienced', 'Goal-driven'],
      certifications: ['WPT Academy Certification', 'FTP Padel Level 3', 'Performance Coaching Diploma'],
      previousWorkplaces: ['WPT Junior Circuit', 'Marsa Padel Elite', 'Côte d\'Azur Padel Club (France)'],
      languages: ['Arabic', 'French', 'Spanish'],
      yearsExperience: 8,
      hourlyRate: 100,
      currency: 'TND',
    },
    availability: [
      { dayOfWeek: 2, startTime: '14:00', endTime: '21:00' },
      { dayOfWeek: 3, startTime: '14:00', endTime: '21:00' },
      { dayOfWeek: 4, startTime: '14:00', endTime: '21:00' },
      { dayOfWeek: 5, startTime: '14:00', endTime: '21:00' },
      { dayOfWeek: 6, startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 0, startTime: '09:00', endTime: '18:00' },
    ],
  },
  {
    firstName: 'Yasmine', lastName: 'Dridi',
    email: 'yasmine.dridi@ultima.tn',
    arenaId: 5, // Padel House Tunisia
    profile: {
      headline: 'Junior & Family Coach · 6 years coaching',
      bio: 'I specialize in junior development and family sessions. Whether your child is 8 or you want to play with your partner, I design sessions that are enjoyable, safe, and progressively challenging. Padel is a sport for life — I help you build it right from the start.',
      expertise: ['Junior development', 'Family sessions', 'Beginner to intermediate', 'Consistency training'],
      qualities: ['Playful', 'Safe', 'Adaptive', 'Warm'],
      certifications: ['FTP Padel Level 2', 'Youth Sports Coaching Certificate'],
      previousWorkplaces: ['Padel House Academy', 'El Menzah Sports Club'],
      languages: ['Arabic', 'French', 'English'],
      yearsExperience: 6,
      hourlyRate: 65,
      currency: 'TND',
    },
    availability: [
      { dayOfWeek: 1, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 2, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 3, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 4, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 5, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 6, startTime: '08:00', endTime: '14:00' },
    ],
  },
  {
    firstName: 'Mehdi', lastName: 'Chaabane',
    email: 'mehdi.chaabane@ultima.tn',
    arenaId: 11, // Yalla Padel Sousse
    profile: {
      headline: 'Sousse\'s Top Rated Padel Coach · FTP Level 3',
      bio: 'Based in Sousse, I bring 12 years of competitive and coaching experience to every session. I have trained players from total beginner to regional champion level. My philosophy: master the fundamentals and the rest follows.',
      expertise: ['Fundamentals mastery', 'Competitive play', 'Doubles strategy', 'Physical conditioning'],
      qualities: ['Rigorous', 'Supportive', 'Experienced', 'Communicative'],
      certifications: ['FTP Padel Level 3', 'Strength & Conditioning Certificate', 'Sports Psychology Basics'],
      previousWorkplaces: ['Sousse Padel Academy', 'Club Sportif Sfaxien', 'Monastir Padel Club'],
      languages: ['Arabic', 'French'],
      yearsExperience: 12,
      hourlyRate: 80,
      currency: 'TND',
    },
    availability: [
      { dayOfWeek: 1, startTime: '07:00', endTime: '20:00' },
      { dayOfWeek: 2, startTime: '07:00', endTime: '20:00' },
      { dayOfWeek: 3, startTime: '07:00', endTime: '20:00' },
      { dayOfWeek: 4, startTime: '07:00', endTime: '20:00' },
      { dayOfWeek: 5, startTime: '07:00', endTime: '12:00' },
      { dayOfWeek: 6, startTime: '08:00', endTime: '20:00' },
    ],
  },
  {
    firstName: 'Leila', lastName: 'Hammami',
    email: 'leila.hammami@ultima.tn',
    arenaId: 26, // Le Club de Gammarth
    profile: {
      headline: 'Elite Performance & Mindset Coach',
      bio: 'I combine technical padel coaching with sports psychology to help players perform at their peak under pressure. My background in sports science gives my sessions a unique edge. If you want to play better AND smarter, this is the session for you.',
      expertise: ['Sports psychology', 'Elite performance', 'Pressure handling', 'Advanced positioning'],
      qualities: ['Analytical', 'Inspiring', 'Science-based', 'Holistic'],
      certifications: ['FTP Padel Level 3', 'Sports Science MSc', 'Mental Performance Coaching'],
      previousWorkplaces: ['Gammarth Sports Club', 'Institut National du Sport de Tunis', 'Padel Elite Academy'],
      languages: ['Arabic', 'French', 'English', 'Italian'],
      yearsExperience: 9,
      hourlyRate: 110,
      currency: 'TND',
    },
    availability: [
      { dayOfWeek: 1, startTime: '10:00', endTime: '20:00' },
      { dayOfWeek: 2, startTime: '10:00', endTime: '20:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '20:00' },
      { dayOfWeek: 5, startTime: '10:00', endTime: '20:00' },
      { dayOfWeek: 6, startTime: '09:00', endTime: '19:00' },
      { dayOfWeek: 0, startTime: '10:00', endTime: '17:00' },
    ],
  },
];

let created = 0;
let skipped = 0;

for (const coach of coaches) {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [coach.email]);

  let userId;
  if (existing.rows.length) {
    userId = existing.rows[0].id;
    console.log(`  SKIP user ${coach.email} (already exists, id=${userId})`);
    skipped++;
  } else {
    // Create user
    const userRow = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status, platform_role, email_verified_at, created_at)
       VALUES ($1,$2,$3,$4,'coach','active','member',NOW(),NOW())
       RETURNING id`,
      [coach.firstName, coach.lastName, coach.email, hash]
    );
    userId = userRow.rows[0].id;

    // Give them a CIN
    await pool.query(
      `UPDATE users SET cin_number = $1 WHERE id = $2`,
      [String(userId).padStart(8, '0'), userId]
    );

    // Arena membership
    await pool.query(
      `INSERT INTO arena_memberships (arena_id, user_id, role, status, created_at)
       VALUES ($1,$2,'coach','active',NOW())
       ON CONFLICT DO NOTHING`,
      [coach.arenaId, userId]
    );

    console.log(`  CREATE user ${coach.firstName} ${coach.lastName} <${coach.email}> id=${userId}`);
    created++;
  }

  // Upsert coach profile
  const { profile: p, arenaId } = coach;
  await pool.query(
    `INSERT INTO coach_profiles
       (user_id, arena_id, headline, bio, expertise, qualities, certifications,
        previous_workplaces, languages, years_experience, hourly_rate, currency, is_verified, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       arena_id = EXCLUDED.arena_id,
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
      userId, arenaId, p.headline, p.bio,
      JSON.stringify(p.expertise), JSON.stringify(p.qualities),
      JSON.stringify(p.certifications), JSON.stringify(p.previousWorkplaces),
      JSON.stringify(p.languages), p.yearsExperience, p.hourlyRate, p.currency,
    ]
  );

  // Replace availability rules
  await pool.query('DELETE FROM coach_availability_rules WHERE coach_user_id = $1', [userId]);
  for (const rule of coach.availability) {
    await pool.query(
      `INSERT INTO coach_availability_rules (coach_user_id, day_of_week, start_time, end_time)
       VALUES ($1,$2,$3,$4)`,
      [userId, rule.dayOfWeek, rule.startTime, rule.endTime]
    );
  }

  console.log(`    profile + ${coach.availability.length} availability rules saved`);
}

console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
console.log('\n--- Coach accounts to share ---');
for (const c of coaches.slice(0, 2)) {
  console.log(`Email: ${c.email}  |  Password: ${PASSWORD}  |  Arena: id=${c.arenaId}`);
}

process.exit(0);
