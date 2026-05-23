import { Pool } from "pg";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

const REQUIRED_TABLES = ["users", "arenas", "arena_memberships", "courts", "reservations", "reservation_participants", "activity_logs"];
const RESERVATION_DURATION_MINUTES = Number(process.env.RESERVATION_DURATION_MINUTES ?? 90);
const RESERVATION_STEP_MINUTES = Number(process.env.RESERVATION_STEP_MINUTES ?? RESERVATION_DURATION_MINUTES);
const BILLING_SECRET = process.env.BILLING_SIGNATURE_SECRET ?? process.env.JWT_SECRET ?? "ultima-billing-secret";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_CANDIDATE_PATHS = [path.resolve(__dirname, "../src/assets/ultima_logo.jpg"), path.resolve(__dirname, "../public/ultima_logo.jpg")];
const DB_STARTUP_RETRY_ATTEMPTS = Number(process.env.DB_STARTUP_RETRY_ATTEMPTS ?? 240);
const DB_STARTUP_RETRY_DELAY_MS = Number(process.env.DB_STARTUP_RETRY_DELAY_MS ?? 1000);
const mkCourt = (name, opts = {}) => ({
  name,
  sport: "Padel",
  status: "available",
  has_summa: opts.has_summa ?? false,
  location: opts.location ?? name,
  min_players: 2,
  max_players: 4,
  opening_time: opts.opening_time ?? "08:00",
  closing_time: opts.closing_time ?? "22:00",
  court_type: opts.court_type ?? "indoor",
  surface_type: opts.surface_type ?? "Gazon artificiel padel",
  has_lighting: opts.has_lighting ?? true,
  is_panoramic: opts.is_panoramic ?? false,
  price_per_hour: opts.price_per_hour ?? null,
  currency: "TND",
  image_url: opts.image_url ?? null,
  description: opts.description ?? null,
});

const PADEL_PLACES = [
  {
    name: "Arena Padel Premium",
    slug: "arena-padel-premium",
    location: "La Soukra, Ariana",
    description: "Le complexe padel premium de référence à La Soukra. 5 courts professionnels indoor avec revêtement haut de gamme, éclairage LED et espace lounge.",
    city: "La Soukra",
    region: "Ariana",
    address: "Rue du Parc, La Soukra, Ariana",
    phone: null,
    website: null,
    instagram: null,
    facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–00:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Cafétéria", "Pro Shop", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80&auto=format&fit=crop",
    gallery_images: ["https://picsum.photos/seed/arena-soukra-g1/800/500", "https://picsum.photos/seed/arena-soukra-g2/800/500"],
    has_padel: true,
    courts: [
      mkCourt("Arena Court 1", { location: "Arena Padel Premium", opening_time: "08:00", closing_time: "23:00", price_per_hour: 50, image_url: "https://picsum.photos/seed/arena-c1/600/400" }),
      mkCourt("Arena Court 2", { location: "Arena Padel Premium", opening_time: "08:00", closing_time: "23:00", price_per_hour: 50, image_url: "https://picsum.photos/seed/arena-c2/600/400" }),
      mkCourt("Arena Court 3", { location: "Arena Padel Premium", opening_time: "08:00", closing_time: "23:00", price_per_hour: 50, image_url: "https://picsum.photos/seed/arena-c3/600/400" }),
      mkCourt("Arena Court 4 Panoramic", { location: "Arena Padel Premium", opening_time: "08:00", closing_time: "23:00", price_per_hour: 60, is_panoramic: true, image_url: "https://picsum.photos/seed/arena-c4/600/400" }),
      mkCourt("Arena Court 5 SUMMA", { location: "Arena Padel Premium", opening_time: "08:00", closing_time: "23:00", price_per_hour: 70, is_panoramic: true, has_summa: true, image_url: "https://picsum.photos/seed/arena-c5/600/400" }),
    ],
  },
  {
    name: "Padel Indoor La Soukra",
    slug: "padel-indoor-la-soukra",
    location: "La Soukra, Ariana",
    description: "Club padel indoor au cœur de La Soukra. Courts professionnels avec ambiance chaleureuse et encadrement de qualité.",
    city: "La Soukra",
    region: "Ariana",
    address: "V6CJ+P4H, La Soukra",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–22:00" },
    amenities: ["Parking", "Vestiaires", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Soukra Court 1", { location: "Padel Indoor La Soukra", price_per_hour: 45, image_url: "https://picsum.photos/seed/soukra-indoor-c1/600/400" }),
      mkCourt("Soukra Court 2", { location: "Padel Indoor La Soukra", price_per_hour: 45, image_url: "https://picsum.photos/seed/soukra-indoor-c2/600/400" }),
    ],
  },
  {
    name: "Padel Marsa",
    slug: "padel-marsa",
    location: "La Marsa, Tunis",
    description: "Club padel indoor situé dans la zone du Tennis Club ASM à La Marsa. Cadre de qualité avec vue sur la côte nord de Tunis.",
    city: "La Marsa",
    region: "Tunis",
    address: "Tennis Club ASM, La Marsa, Tunis",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Bar"],
    hero_image_url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Marsa Court 1", { location: "Padel Marsa", price_per_hour: 50, image_url: "https://picsum.photos/seed/marsa-c1/600/400" }),
      mkCourt("Marsa Court 2", { location: "Padel Marsa", price_per_hour: 50, image_url: "https://picsum.photos/seed/marsa-c2/600/400" }),
      mkCourt("Marsa Court 3", { location: "Padel Marsa", price_per_hour: 50, image_url: "https://picsum.photos/seed/marsa-c3/600/400" }),
    ],
  },
  {
    name: "Padel House Tunisia",
    slug: "padel-house-ariana",
    location: "Sidi Amor, Ariana",
    description: "L'un des premiers clubs padel indoor à Ariana. Ambiance conviviale, courts de qualité et espace lounge.",
    city: "Ariana",
    region: "Ariana",
    address: "676 Sidi Amor, Avenue Jaafer, Ariana",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Cafétéria", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("House Court 1", { location: "Padel House Tunisia", price_per_hour: 48, image_url: "https://picsum.photos/seed/house-c1/600/400" }),
      mkCourt("House Court 2", { location: "Padel House Tunisia", price_per_hour: 48, image_url: "https://picsum.photos/seed/house-c2/600/400" }),
      mkCourt("House Court 3 SUMMA", { location: "Padel House Tunisia", price_per_hour: 55, is_panoramic: true, has_summa: true, image_url: "https://picsum.photos/seed/house-c3/600/400" }),
    ],
  },
  {
    name: "Olympysky Club",
    slug: "olympysky-club",
    location: "Berges du Lac 2, Tunis",
    description: "Club multi-sports aux Berges du Lac 2. 3 courts padel indoor avec grande salle de fitness et piscine.",
    city: "Tunis",
    region: "Tunis",
    address: "Berges du Lac 2, Tunis",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "07:00–23:00", sat_sun: "08:00–22:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Salle de sport", "Piscine", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1592659762303-90081d34b277?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Sky Court 1", { location: "Olympysky Club", opening_time: "07:00", closing_time: "23:00", price_per_hour: 55, image_url: "https://picsum.photos/seed/olymp-c1/600/400" }),
      mkCourt("Sky Court 2 SUMMA", { location: "Olympysky Club", opening_time: "07:00", closing_time: "23:00", price_per_hour: 65, is_panoramic: true, has_summa: true, image_url: "https://picsum.photos/seed/olymp-c2/600/400" }),
      mkCourt("Sky Court 3", { location: "Olympysky Club", opening_time: "07:00", closing_time: "23:00", price_per_hour: 55, image_url: "https://picsum.photos/seed/olymp-c3/600/400" }),
    ],
  },
  {
    name: "Padel Connection",
    slug: "padel-connection",
    location: "Borj Louzir, Ariana",
    description: "Club padel moderne à Borj Louzir. Courts indoor de qualité professionnelle avec encadrement de haut niveau.",
    city: "Borj Louzir",
    region: "Ariana",
    address: "Borj Louzir, Ariana",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–22:00" },
    amenities: ["Parking", "Vestiaires", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Connection Court 1", { location: "Padel Connection", price_per_hour: 45, image_url: "https://picsum.photos/seed/conn-c1/600/400" }),
      mkCourt("Connection Court 2", { location: "Padel Connection", price_per_hour: 45, image_url: "https://picsum.photos/seed/conn-c2/600/400" }),
    ],
  },
  {
    name: "Tennis Club de Tunis",
    slug: "tennis-club-de-tunis",
    location: "Belvédère, Tunis",
    description: "Le plus ancien club de tennis de Tunisie, avec 2 courts padel dans son enceinte historique au Belvédère.",
    city: "Tunis",
    region: "Tunis",
    address: "Parc du Belvédère, Tunis",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "07:00–22:00", sat_sun: "08:00–20:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Restaurant", "Pro Shop"],
    hero_image_url: "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Padel Court A", { location: "Tennis Club de Tunis", court_type: "outdoor", opening_time: "07:00", price_per_hour: 45, image_url: "https://picsum.photos/seed/tct-c1/600/400" }),
      mkCourt("Padel Court B", { location: "Tennis Club de Tunis", court_type: "outdoor", opening_time: "07:00", price_per_hour: 45, image_url: "https://picsum.photos/seed/tct-c2/600/400" }),
    ],
  },
  {
    name: "Padel Megrine",
    slug: "padel-megrine",
    location: "Mégrine, Ben Arous",
    description: "Club padel moderne à Mégrine. Destination sportive accessible depuis Tunis et Ben Arous.",
    city: "Mégrine",
    region: "Ben Arous",
    address: "Mégrine, Ben Arous",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1484516994939-f50b1f456e39?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Megrine Court 1", { location: "Padel Megrine", price_per_hour: 40, image_url: "https://picsum.photos/seed/meg-c1/600/400" }),
      mkCourt("Megrine Court 2", { location: "Padel Megrine", price_per_hour: 40, image_url: "https://picsum.photos/seed/meg-c2/600/400" }),
    ],
  },
  {
    name: "Sassi Padel",
    slug: "sassi-padel",
    location: "Sidi Hssine, Tunis",
    description: "Club padel situé à Sidi Hssine. Courts bien entretenus et ambiance sportive locale.",
    city: "Sidi Hssine",
    region: "Tunis",
    address: "Sidi Hssine, Tunis",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–22:00" },
    amenities: ["Parking", "Vestiaires"],
    hero_image_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Sassi Court 1", { location: "Sassi Padel", price_per_hour: 38, image_url: "https://picsum.photos/seed/sassi-c1/600/400" }),
      mkCourt("Sassi Court 2", { location: "Sassi Padel", price_per_hour: 38, image_url: "https://picsum.photos/seed/sassi-c2/600/400" }),
    ],
  },
  {
    name: "Yalla Padel Sousse",
    slug: "yalla-padel-sousse",
    location: "Sousse",
    description: "Complexe padel moderne à Sousse, près du Jaz Tour Khalef. 3 courts indoor avec équipements de compétition.",
    city: "Sousse",
    region: "Sousse",
    address: "Zone hôtelière, Sousse",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Cafétéria", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Yalla Court 1", { location: "Yalla Padel Sousse", opening_time: "08:00", closing_time: "23:00", price_per_hour: 45, image_url: "https://picsum.photos/seed/yalla-c1/600/400" }),
      mkCourt("Yalla Court 2", { location: "Yalla Padel Sousse", opening_time: "08:00", closing_time: "23:00", price_per_hour: 45, image_url: "https://picsum.photos/seed/yalla-c2/600/400" }),
      mkCourt("Yalla Court 3 Panoramic", { location: "Yalla Padel Sousse", opening_time: "08:00", closing_time: "23:00", price_per_hour: 55, is_panoramic: true, image_url: "https://picsum.photos/seed/yalla-c3/600/400" }),
    ],
  },
  {
    name: "Padelium Marhaba",
    slug: "padelium-marhaba",
    location: "Sousse Marhaba",
    description: "Club padel adossé à l'Occidental Sousse Marhaba. Infrastructure de qualité hôtelière, accès courts pour résidents et public.",
    city: "Sousse",
    region: "Sousse",
    address: "Occidental Sousse Marhaba, Sousse",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–22:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Piscine hôtel", "Restaurant"],
    hero_image_url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Marhaba Court 1", { location: "Padelium Marhaba", court_type: "outdoor", price_per_hour: 50, image_url: "https://picsum.photos/seed/marh-c1/600/400" }),
      mkCourt("Marhaba Court 2", { location: "Padelium Marhaba", court_type: "outdoor", price_per_hour: 50, image_url: "https://picsum.photos/seed/marh-c2/600/400" }),
      mkCourt("Marhaba Court 3 Indoor", { location: "Padelium Marhaba", price_per_hour: 55, image_url: "https://picsum.photos/seed/marh-c3/600/400" }),
    ],
  },
  {
    name: "Stars Padel Club",
    slug: "stars-padel-club",
    location: "Akouda, Sousse",
    description: "Club padel à Akouda, entre Sousse et Monastir. 3 courts outdoor éclairés pour jouer le soir en bord de mer.",
    city: "Akouda",
    region: "Sousse",
    address: "Akouda, Sousse",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "09:00–23:00", sat_sun: "09:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Bar"],
    hero_image_url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Stars Court 1", { location: "Stars Padel Club", court_type: "outdoor", opening_time: "09:00", closing_time: "23:00", price_per_hour: 40, image_url: "https://picsum.photos/seed/stars-c1/600/400" }),
      mkCourt("Stars Court 2", { location: "Stars Padel Club", court_type: "outdoor", opening_time: "09:00", closing_time: "23:00", price_per_hour: 40, image_url: "https://picsum.photos/seed/stars-c2/600/400" }),
      mkCourt("Stars Court 3", { location: "Stars Padel Club", court_type: "outdoor", opening_time: "09:00", closing_time: "23:00", price_per_hour: 40, image_url: "https://picsum.photos/seed/stars-c3/600/400" }),
    ],
  },
  {
    name: "One Padel Monastir",
    slug: "one-padel-monastir",
    location: "Monastir",
    description: "Club padel moderne à Monastir. Courts indoor et outdoor de qualité professionnelle, tous niveaux bienvenus.",
    city: "Monastir",
    region: "Monastir",
    address: "Monastir",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1592659762303-90081d34b277?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Monastir Court 1", { location: "One Padel Monastir", opening_time: "08:00", closing_time: "23:00", price_per_hour: 42, image_url: "https://picsum.photos/seed/opm-c1/600/400" }),
      mkCourt("Monastir Court 2", { location: "One Padel Monastir", opening_time: "08:00", closing_time: "23:00", price_per_hour: 42, image_url: "https://picsum.photos/seed/opm-c2/600/400" }),
      mkCourt("Monastir Court 3 Outdoor", { location: "One Padel Monastir", court_type: "outdoor", opening_time: "08:00", closing_time: "23:00", price_per_hour: 38, image_url: "https://picsum.photos/seed/opm-c3/600/400" }),
    ],
  },
  {
    name: "Padel Club Rivage Monastir",
    slug: "padel-club-rivage-monastir",
    location: "Monastir",
    description: "Club padel en bord de mer à Monastir. Vue sur la Méditerranée depuis les courts outdoor, ambiance unique.",
    city: "Monastir",
    region: "Monastir",
    address: "Monastir, bord de mer",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Bar", "Vue mer"],
    hero_image_url: "https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Rivage Court 1", { location: "Padel Club Rivage Monastir", court_type: "outdoor", price_per_hour: 40, image_url: "https://picsum.photos/seed/rivage-c1/600/400" }),
      mkCourt("Rivage Court 2", { location: "Padel Club Rivage Monastir", court_type: "outdoor", price_per_hour: 40, image_url: "https://picsum.photos/seed/rivage-c2/600/400" }),
    ],
  },
  {
    name: "O Padel Nabeul",
    slug: "o-padel-nabeul",
    location: "Nabeul",
    description: "O Padel Nabeul propose des courts panoramiques en verre de haute qualité dans la ville de Nabeul. Expérience immersive unique.",
    city: "Nabeul",
    region: "Nabeul",
    address: "Nabeul, Cap Bon",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Cafétéria"],
    hero_image_url: "https://images.unsplash.com/photo-1484516994939-f50b1f456e39?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Panoramic Court 1", { location: "O Padel Nabeul", opening_time: "08:00", closing_time: "23:00", price_per_hour: 55, is_panoramic: true, image_url: "https://picsum.photos/seed/opn-c1/600/400" }),
      mkCourt("Panoramic Court 2", { location: "O Padel Nabeul", opening_time: "08:00", closing_time: "23:00", price_per_hour: 55, is_panoramic: true, image_url: "https://picsum.photos/seed/opn-c2/600/400" }),
    ],
  },
  {
    name: "One Padel Hammamet",
    slug: "one-padel-hammamet",
    location: "Hammamet",
    description: "Club padel moderne à Hammamet, proche de la zone touristique. 3 courts de qualité pour tous niveaux.",
    city: "Hammamet",
    region: "Nabeul",
    address: "Zone touristique, Hammamet",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–00:00" },
    amenities: ["Parking", "Vestiaires", "Cafétéria", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Hammamet One Court 1", { location: "One Padel Hammamet", court_type: "outdoor", opening_time: "08:00", closing_time: "23:00", price_per_hour: 45, image_url: "https://picsum.photos/seed/oph-c1/600/400" }),
      mkCourt("Hammamet One Court 2", { location: "One Padel Hammamet", court_type: "outdoor", opening_time: "08:00", closing_time: "23:00", price_per_hour: 45, image_url: "https://picsum.photos/seed/oph-c2/600/400" }),
      mkCourt("Hammamet One Court 3 Indoor", { location: "One Padel Hammamet", opening_time: "08:00", closing_time: "23:00", price_per_hour: 50, image_url: "https://picsum.photos/seed/oph-c3/600/400" }),
    ],
  },
  {
    name: "Padel Hammamet",
    slug: "padel-hammamet",
    location: "Hammamet",
    description: "Club padel outdoor bien établi à Hammamet. Courts avec vue agréable, idéaux pour jouer en après-midi ou en soirée.",
    city: "Hammamet",
    region: "Nabeul",
    address: "Hammamet",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires"],
    hero_image_url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Hammamet Court 1", { location: "Padel Hammamet", court_type: "outdoor", price_per_hour: 40, image_url: "https://picsum.photos/seed/ph-c1/600/400" }),
      mkCourt("Hammamet Court 2", { location: "Padel Hammamet", court_type: "outdoor", price_per_hour: 40, image_url: "https://picsum.photos/seed/ph-c2/600/400" }),
    ],
  },
  {
    name: "Casa del Padel Sfax",
    slug: "casa-del-padel-sfax",
    location: "Sfax",
    description: "Le club de référence à Sfax sur la route Sidi Mansour km 6. 3 courts indoor professionnels avec infrastructure complète.",
    city: "Sfax",
    region: "Sfax",
    address: "Route Sidi Mansour km 6, Sfax",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Douches", "Cafétéria", "WiFi"],
    hero_image_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Casa Sfax Court 1", { location: "Casa del Padel Sfax", opening_time: "08:00", closing_time: "23:00", price_per_hour: 40, image_url: "https://picsum.photos/seed/cdp-c1/600/400" }),
      mkCourt("Casa Sfax Court 2", { location: "Casa del Padel Sfax", opening_time: "08:00", closing_time: "23:00", price_per_hour: 40, image_url: "https://picsum.photos/seed/cdp-c2/600/400" }),
      mkCourt("Casa Sfax Court 3 Panoramic", { location: "Casa del Padel Sfax", opening_time: "08:00", closing_time: "23:00", price_per_hour: 50, is_panoramic: true, image_url: "https://picsum.photos/seed/cdp-c3/600/400" }),
    ],
  },
  {
    name: "Vamos Sport Sfax",
    slug: "vamos-sport-sfax",
    location: "Sfax",
    description: "Centre sportif Vamos Sport (Route Teniour, Sfax). Courts padel modernes dans un complexe multi-sport.",
    city: "Sfax",
    region: "Sfax",
    address: "Route Teniour, Sfax",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–22:00" },
    amenities: ["Parking", "Vestiaires", "Salle de sport"],
    hero_image_url: "https://images.unsplash.com/photo-1592659762303-90081d34b277?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Vamos Court 1", { location: "Vamos Sport Sfax", price_per_hour: 38, image_url: "https://picsum.photos/seed/vamos-c1/600/400" }),
      mkCourt("Vamos Court 2", { location: "Vamos Sport Sfax", price_per_hour: 38, image_url: "https://picsum.photos/seed/vamos-c2/600/400" }),
    ],
  },
  {
    name: "Le Padel Sfax",
    slug: "le-padel-sfax",
    location: "Sfax",
    description: "Atlas World Padel Sfax, route de Gabès km 4. Courts de compétition avec encadrement professionnel.",
    city: "Sfax",
    region: "Sfax",
    address: "Route de Gabès km 4, Sfax",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–23:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Pro Shop"],
    hero_image_url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Atlas Sfax Court 1", { location: "Le Padel Sfax", opening_time: "08:00", closing_time: "23:00", price_per_hour: 42, image_url: "https://picsum.photos/seed/lps-c1/600/400" }),
      mkCourt("Atlas Sfax Court 2", { location: "Le Padel Sfax", opening_time: "08:00", closing_time: "23:00", price_per_hour: 42, image_url: "https://picsum.photos/seed/lps-c2/600/400" }),
    ],
  },
  {
    name: "Club Padel Djerba",
    slug: "club-padel-djerba",
    location: "Houmt Souk, Djerba",
    description: "Club padel à Houmt Souk, centre de l'île de Djerba. Courts outdoor avec vue sur le paysage insulaire.",
    city: "Houmt Souk",
    region: "Médenine",
    address: "Houmt Souk, Djerba",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires"],
    hero_image_url: "https://images.unsplash.com/photo-1484516994939-f50b1f456e39?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Djerba Court 1", { location: "Club Padel Djerba", court_type: "outdoor", price_per_hour: 35, image_url: "https://picsum.photos/seed/djb-c1/600/400" }),
      mkCourt("Djerba Court 2", { location: "Club Padel Djerba", court_type: "outdoor", price_per_hour: 35, image_url: "https://picsum.photos/seed/djb-c2/600/400" }),
    ],
  },
  {
    name: "Padel Club Djerba Radisson",
    slug: "padel-club-djerba-radisson",
    location: "Djerba",
    description: "Courts padel du Radisson Blu Palace Resort & Thalasso Djerba. Accès semi-public avec équipements hôteliers haut de gamme.",
    city: "Djerba",
    region: "Médenine",
    address: "Radisson Blu Palace Resort & Thalasso, Djerba",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–20:00", sat_sun: "08:00–20:00" },
    amenities: ["Parking", "Vestiaires", "Piscine hôtel", "Restaurant", "Spa"],
    hero_image_url: "https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Radisson Court 1", { location: "Padel Club Djerba Radisson", court_type: "outdoor", closing_time: "20:00", price_per_hour: 55, image_url: "https://picsum.photos/seed/rad-c1/600/400" }),
      mkCourt("Radisson Court 2", { location: "Padel Club Djerba Radisson", court_type: "outdoor", closing_time: "20:00", price_per_hour: 55, image_url: "https://picsum.photos/seed/rad-c2/600/400" }),
      mkCourt("Radisson Court 3 Panoramic", { location: "Padel Club Djerba Radisson", court_type: "outdoor", closing_time: "20:00", price_per_hour: 65, is_panoramic: true, image_url: "https://picsum.photos/seed/rad-c3/600/400" }),
    ],
  },
  {
    name: "Bourgo Arena Djerba",
    slug: "bourgo-arena-djerba",
    location: "Djerba",
    description: "Arena padel moderne à Djerba. Courts indoor avec infrastructure complète dans un cadre insulaire unique.",
    city: "Djerba",
    region: "Médenine",
    address: "Djerba",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–22:00", sat_sun: "08:00–23:00" },
    amenities: ["Parking", "Vestiaires", "Cafétéria"],
    hero_image_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Bourgo Court 1", { location: "Bourgo Arena Djerba", price_per_hour: 38, image_url: "https://picsum.photos/seed/bourgo-c1/600/400" }),
      mkCourt("Bourgo Court 2", { location: "Bourgo Arena Djerba", price_per_hour: 38, image_url: "https://picsum.photos/seed/bourgo-c2/600/400" }),
    ],
  },
  {
    name: "Club Med Djerba",
    slug: "club-med-djerba",
    location: "Midoun, Djerba",
    description: "Club padel du Club Med Djerba La Douce à Midoun. Accès privilégié pour les membres avec équipements all-inclusive.",
    city: "Midoun",
    region: "Médenine",
    address: "Club Med Djerba La Douce, Midoun, Djerba",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "08:00–20:00", sat_sun: "08:00–20:00" },
    amenities: ["Parking", "Vestiaires", "Piscine", "Restaurant", "Animation"],
    hero_image_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("ClubMed Court 1", { location: "Club Med Djerba", court_type: "outdoor", closing_time: "20:00", price_per_hour: 60, image_url: "https://picsum.photos/seed/clubmed-c1/600/400" }),
      mkCourt("ClubMed Court 2", { location: "Club Med Djerba", court_type: "outdoor", closing_time: "20:00", price_per_hour: 60, image_url: "https://picsum.photos/seed/clubmed-c2/600/400" }),
    ],
  },
  {
    name: "Le Club de Gammarth",
    slug: "le-club-de-gammarth",
    location: "Cap Gammarth, Tunis",
    description: "Club multi-sports à Cap Gammarth avec courts padel outdoor vue mer. Cadre exceptionnel sur la côte nord de Tunis.",
    city: "Gammarth",
    region: "Tunis",
    address: "Zone touristique Cap Gammarth, Tunis",
    phone: null, website: null, instagram: null, facebook: null,
    opening_hours: { mon_fri: "07:00–22:00", sat_sun: "07:00–22:00" },
    amenities: ["Parking", "Vestiaires", "Restaurant", "Piscine"],
    hero_image_url: "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80&auto=format&fit=crop",
    gallery_images: [],
    has_padel: true,
    courts: [
      mkCourt("Gammarth Court 1", { location: "Le Club de Gammarth", court_type: "outdoor", opening_time: "07:00", price_per_hour: 48, image_url: "https://picsum.photos/seed/gamm-c1/600/400" }),
      mkCourt("Gammarth Court 2", { location: "Le Club de Gammarth", court_type: "outdoor", opening_time: "07:00", price_per_hour: 48, image_url: "https://picsum.photos/seed/gamm-c2/600/400" }),
      mkCourt("Gammarth Court 3 SUMMA", { location: "Le Club de Gammarth", court_type: "outdoor", opening_time: "07:00", price_per_hour: 60, has_summa: true, image_url: "https://picsum.photos/seed/gamm-c3/600/400" }),
    ],
  },
];

const toIso = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const parseJsonColumn = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
};

const resolveRole = (user) => (user?.platform_role === "super_admin" ? "super_admin" : user?.membership_role ?? user?.role ?? "player");
const resolveStatus = (user) => (user?.platform_role === "super_admin" ? user?.status ?? "inactive" : user?.membership_status ?? user?.status ?? "inactive");
const isAdminLike = (actor) => actor?.effective_role === "admin" || actor?.effective_role === "super_admin";
const isCoachLike = (actor) => ["coach", "admin", "super_admin"].includes(actor?.effective_role);
const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const sanitizeCourt = (court) => ({ ...court, created_at: toIso(court.created_at) });
const sanitizeLog = (log) => ({ ...log, created_at: toIso(log.created_at) });
const sanitizeCompetition = (competition) => ({ ...competition, created_at: toIso(competition.created_at) });
const sanitizeReservation = (reservation) => ({
  ...reservation,
  created_at: toIso(reservation.created_at),
  cancelled_at: toIso(reservation.cancelled_at),
  reservation_date: String(reservation.reservation_date).slice(0, 10),
  start_time: String(reservation.start_time).slice(0, 8),
  end_time: String(reservation.end_time).slice(0, 8),
  participants: parseJsonColumn(reservation.participants),
});
const sanitizeMembershipUser = (row) => ({
  id: row.id,
  first_name: row.first_name,
  last_name: row.last_name,
  email: row.email,
  role: row.platform_role === "super_admin" ? "super_admin" : row.membership_role,
  status: row.membership_status ?? row.status,
  account_status: row.status,
  platform_role: row.platform_role,
  arena_id: row.arena_id,
  arena_name: row.arena_name,
  created_at: toIso(row.created_at),
  cin_number: row.cin_number ?? null,
});

const normalizeUser = (row) => ({
  id: Number(row.id),
  first_name: row.first_name,
  last_name: row.last_name,
  email: row.email,
  password_hash: row.password_hash,
  role: row.role,
  status: row.status,
  created_at: toIso(row.created_at),
  platform_role: row.platform_role ?? "member",
  membership_id: row.membership_id ?? null,
  membership_role: row.membership_role ?? null,
  membership_status: row.membership_status ?? null,
  arena_id: row.arena_id ?? null,
  arena_name: row.arena_name ?? null,
  arena_location: row.arena_location ?? null,
  cin_number: row.cin_number ?? null,
  email_verified_at: toIso(row.email_verified_at),
  effective_role: resolveRole(row),
  effective_status: resolveStatus(row),
});

const timeToMinutes = (value) => {
  if (!value || typeof value !== "string") return null;
  const parts = value.split(":").map(Number);
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;
  return parts[0] * 60 + parts[1];
};
const minutesToTime = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const generateSixDigitCode = () => {
  const buffer = randomBytes(4);
  const numeric = buffer.readUInt32BE(0) % 1000000;
  return String(numeric).padStart(6, "0");
};

async function queryUsersBy(whereClause, params = [], client = pool) {
  const { rows } = await client.query(
    `SELECT
       users.*,
       arena_memberships.id AS membership_id,
       arena_memberships.role AS membership_role,
       arena_memberships.status AS membership_status,
       arenas.id AS arena_id,
       arenas.name AS arena_name,
       arenas.location AS arena_location
     FROM users
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN arenas ON arenas.id = arena_memberships.arena_id
     ${whereClause}`,
    params
  );
  return rows.map(normalizeUser);
}

async function findUserById(id, client = pool) {
  const users = await queryUsersBy("WHERE users.id = $1 ORDER BY arena_memberships.id ASC LIMIT 1", [id], client);
  return users[0] ?? null;
}

export async function getUserById(id) {
  return findUserById(Number(id));
}

export async function updateUserProfile(userId, { firstName, lastName }) {
  const fields = [];
  const params = [];
  const set = (col, val) => { fields.push(`${col} = $${params.length + 1}`); params.push(val); };
  if (firstName !== undefined) {
    const fn = String(firstName ?? "").trim();
    if (!fn) throw new Error("First name cannot be empty");
    set("first_name", fn);
  }
  if (lastName !== undefined) {
    const ln = String(lastName ?? "").trim();
    if (!ln) throw new Error("Last name cannot be empty");
    set("last_name", ln);
  }
  if (!fields.length) return findUserById(Number(userId));
  params.push(Number(userId));
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = $${params.length}`, params);
  return findUserById(Number(userId));
}

async function requireActiveActor(userId, client = pool) {
  const actor = await findUserById(Number(userId), client);
  if (!actor) throw new Error("User not found");
  if (actor.effective_status !== "active") throw new Error("This account is inactive");
  return actor;
}

const normalizeRelationshipPermissions = (permissions = {}) => ({
  canViewPerformance: permissions.canViewPerformance !== false,
  canViewReservations: permissions.canViewReservations !== false,
  canScheduleSessions: permissions.canScheduleSessions !== false,
  canViewNotes: permissions.canViewNotes === true,
});

const normalizeRelationship = (row) => {
  const startDate = row.start_date ? String(row.start_date).split("T")[0] : null;
  const endDate = row.end_date ? String(row.end_date).split("T")[0] : null;
  return {
    id: row.id,
    arenaId: row.arena_id,
    coachUserId: row.coach_user_id,
    coachName: row.coach_name ?? null,
    playerUserId: row.player_user_id,
    playerName: row.player_name ?? null,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    respondedByUserId: row.responded_by_user_id ?? null,
    permissions: {
      canViewPerformance: Boolean(row.can_view_performance),
      canViewReservations: Boolean(row.can_view_reservations),
      canScheduleSessions: Boolean(row.can_schedule_sessions),
      canViewNotes: Boolean(row.can_view_notes),
    },
    consentVersion: Number(row.consent_version ?? 1),
    consentGrantedAt: toIso(row.consent_granted_at),
    startDate,
    endDate,
    notes: row.notes ?? "",
    respondedAt: toIso(row.responded_at),
    lastReminderAt: toIso(row.last_reminder_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
};

async function getActiveCoachRelationshipForStudent(coachUserId, studentId, client = pool) {
  const { rows } = await client.query(
    `SELECT *
     FROM coach_player_relationships
     WHERE coach_user_id = $1
       AND player_user_id = $2
       AND status = 'active'
       AND start_date <= CURRENT_DATE
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [coachUserId, studentId]
  );
  return rows[0] ?? null;
}

async function getCoachActor(userId) {
  const actor = await requireActiveActor(userId);
  if (!isCoachLike(actor)) throw new Error("Coach access required");
  if (!actor.arena_id) throw new Error("Coach must belong to an arena");
  return actor;
}

async function getCourtByIdInternal(id, client = pool) {
  const { rows } = await client.query(
    `SELECT courts.*, arenas.name AS arena_name, arenas.location AS arena_location
     FROM courts
     JOIN arenas ON arenas.id = courts.arena_id
     WHERE courts.id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] ? sanitizeCourt(rows[0]) : null;
}

async function addActivityLog(client, { arenaId = null, actorUserId = null, actorName, action, detail }) {
  await client.query(
    `INSERT INTO activity_logs (arena_id, action, actor_user_id, actor_name, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [arenaId, action, actorUserId, actorName, detail]
  );
}

async function hasReservationConflict(courtId, reservationDate, startTime, endTime, client) {
  const { rows } = await client.query(
    `SELECT id FROM reservations
     WHERE court_id = $1
       AND reservation_date = $2::date
       AND status = 'confirmed'
       AND NOT (end_time <= $3::time OR start_time >= $4::time)
     LIMIT 1`,
    [courtId, reservationDate, startTime, endTime]
  );
  return rows.length > 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDatabaseStarting(error) {
  return error?.code === "57P03" || error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT" || error?.code === "ENOTFOUND";
}

async function waitForDatabaseReady() {
  const attempts = Math.max(1, DB_STARTUP_RETRY_ATTEMPTS);
  const delayMs = Math.max(0, DB_STARTUP_RETRY_DELAY_MS);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      if (attempt > 1) {
        console.log(`PostgreSQL accepted connections after ${attempt} attempts.`);
      }
      return;
    } catch (error) {
      if (!isDatabaseStarting(error) || attempt === attempts) {
        throw error;
      }
      console.warn(`PostgreSQL is not ready yet (${error.code ?? error.message}). Retrying in ${delayMs}ms (${attempt}/${attempts})...`);
      await sleep(delayMs);
    }
  }
}

export async function initializeDatabase() {
  await waitForDatabaseReady();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES]
  );
  if (rows[0].count < REQUIRED_TABLES.length) throw new Error("Required PostgreSQL tables are missing.");

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS cin_number VARCHAR(32)");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE arena_memberships ADD COLUMN IF NOT EXISTS head_coach_flag BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE arena_memberships ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_cin_number ON users (cin_number) WHERE cin_number IS NOT NULL");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pool.query("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pool.query("CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON email_verification_tokens(expires_at)");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token VARCHAR(256) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pool.query("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      title VARCHAR(191) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(64) NOT NULL DEFAULT 'info',
      link_url VARCHAR(255) NULL,
      read_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pool.query("CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)");
  await pool.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS uploader_user_id BIGINT NULL");
  await pool.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS subject_user_id BIGINT NULL");
  await pool.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS match_id BIGINT NULL");
  await pool.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS storage_path VARCHAR(255) NULL");
  await pool.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NULL");
  await pool.query(
    `UPDATE users
     SET cin_number = LPAD(id::text, 8, '0')
     WHERE role IN ('player', 'coach')
       AND (cin_number IS NULL OR cin_number = '')`
  );
  await pool.query(
    `UPDATE users
     SET email_verified_at = NOW()
     WHERE email_verified_at IS NULL
       AND created_at < TIMESTAMPTZ '2026-04-12 00:00:00+00'`
  );
  // Padel places extended fields
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS description TEXT");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS city VARCHAR(100)");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS region VARCHAR(100)");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS address TEXT");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS phone VARCHAR(50)");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS email_contact VARCHAR(191)");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS website VARCHAR(255)");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS instagram VARCHAR(255)");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS facebook VARCHAR(255)");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS hero_image_url TEXT");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS has_padel BOOLEAN DEFAULT false");
  await pool.query("ALTER TABLE arenas ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS description TEXT");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS court_type VARCHAR(32) DEFAULT 'indoor'");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS surface_type VARCHAR(64)");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS has_lighting BOOLEAN DEFAULT true");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS is_panoramic BOOLEAN DEFAULT false");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS price_per_hour NUMERIC(10,2)");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'TND'");
  await pool.query("ALTER TABLE courts ADD COLUMN IF NOT EXISTS image_url TEXT");

  // Competition extended fields
  await pool.query("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS rules TEXT NULL");
  await pool.query("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS prizes TEXT NULL");
  await pool.query("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS end_date DATE NULL");
  await pool.query("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS registration_deadline DATE NULL");
  await pool.query("ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()").catch(() => {});

  // SmartPlay AI tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS smartplay_analysis_jobs (
      id                    SERIAL PRIMARY KEY,
      user_id               INT NOT NULL REFERENCES users(id),
      match_id              INT NULL,
      job_type              VARCHAR(64) NOT NULL DEFAULT 'full_match',
      source_video_path     VARCHAR(512) NULL,
      status                VARCHAR(32) NOT NULL DEFAULT 'queued',
      requested_by_user_id  INT NULL REFERENCES users(id),
      result_data           JSONB NULL,
      error_message         TEXT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_smartplay_jobs_user ON smartplay_analysis_jobs (user_id, created_at DESC)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_analysis (
      id            SERIAL PRIMARY KEY,
      match_id      INT NOT NULL,
      heatmap_data  JSONB NULL,
      raw_analysis  JSONB NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
      id                    SERIAL PRIMARY KEY,
      match_id              INT NULL REFERENCES matches(id) ON DELETE CASCADE,
      external_match_key    TEXT NULL,
      camera_id             TEXT NOT NULL DEFAULT 'camera_01',
      requested_by_user_id  INT NULL REFERENCES users(id) ON DELETE SET NULL,
      job_id                TEXT NOT NULL UNIQUE,
      status                TEXT NOT NULL DEFAULT 'queued',
      ai_service_url        TEXT NULL,
      input_video_path      TEXT NULL,
      ball_tracks_path      TEXT NULL,
      player_tracks_path    TEXT NULL,
      output_dir            TEXT NULL,
      debug_video_path      TEXT NULL,
      error_message         TEXT NULL,
      started_at            TIMESTAMPTZ NULL,
      finished_at           TIMESTAMPTZ NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_external_match ON ai_analysis_jobs(external_match_key, camera_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_requested_by ON ai_analysis_jobs(requested_by_user_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status ON ai_analysis_jobs(status)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_scoring_events (
      id                 SERIAL PRIMARY KEY,
      analysis_job_id    INT NULL REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
      match_id           INT NULL REFERENCES matches(id) ON DELETE CASCADE,
      external_match_key TEXT NULL,
      camera_id          TEXT NOT NULL DEFAULT 'camera_01',
      frame              INT NOT NULL,
      time_sec           NUMERIC NULL,
      event_type         TEXT NOT NULL,
      winner_side        TEXT NULL,
      confidence         NUMERIC NULL,
      reason             TEXT NULL,
      raw                JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_scoring_events_job ON ai_scoring_events(analysis_job_id, frame)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_scoring_events_external_match ON ai_scoring_events(external_match_key, camera_id, frame)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_performance_summaries (
      id              SERIAL PRIMARY KEY,
      analysis_job_id INT NULL REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
      match_id        INT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_user_id  INT NULL REFERENCES users(id) ON DELETE SET NULL,
      summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_performance_summaries_job ON ai_performance_summaries(analysis_job_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_performance_summaries_player ON ai_performance_summaries(player_user_id, created_at DESC)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_uploaded_clips (
      id                   SERIAL PRIMARY KEY,
      match_id             INT NULL REFERENCES matches(id) ON DELETE SET NULL,
      external_match_key   TEXT NULL,
      player_user_id       INT NULL REFERENCES users(id) ON DELETE SET NULL,
      uploaded_by_user_id  INT NULL REFERENCES users(id) ON DELETE SET NULL,
      camera_id            TEXT NOT NULL DEFAULT 'camera_01',
      sport_type           TEXT NOT NULL DEFAULT 'padel',
      original_filename    TEXT NOT NULL,
      stored_video_path    TEXT NOT NULL,
      duration_sec         NUMERIC NULL,
      fps                  NUMERIC NULL,
      frame_count          INT NULL,
      width                INT NULL,
      height               INT NULL,
      status               TEXT NOT NULL DEFAULT 'awaiting_court_annotation',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_match ON ai_uploaded_clips(match_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_external_match ON ai_uploaded_clips(external_match_key, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_player ON ai_uploaded_clips(player_user_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_status ON ai_uploaded_clips(status)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_clip_jobs (
      id                  SERIAL PRIMARY KEY,
      clip_id             INT NOT NULL REFERENCES ai_uploaded_clips(id) ON DELETE CASCADE,
      external_job_id     TEXT NULL UNIQUE,
      job_type            TEXT NOT NULL DEFAULT 'clip_full_pipeline',
      status              TEXT NOT NULL DEFAULT 'uploaded',
      current_step        TEXT NOT NULL DEFAULT 'upload',
      ai_service_url      TEXT NULL,
      input_video_path    TEXT NULL,
      homography_path     TEXT NULL,
      court_surfaces_path TEXT NULL,
      ball_tracks_path    TEXT NULL,
      player_tracks_path  TEXT NULL,
      scoring_out_dir     TEXT NULL,
      rendered_video_path TEXT NULL,
      error_message       TEXT NULL,
      started_at          TIMESTAMPTZ NULL,
      finished_at         TIMESTAMPTZ NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_clip_jobs_clip ON ai_clip_jobs(clip_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_clip_jobs_status ON ai_clip_jobs(status)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_clip_events (
      id          SERIAL PRIMARY KEY,
      clip_id     INT NOT NULL REFERENCES ai_uploaded_clips(id) ON DELETE CASCADE,
      job_id      INT NULL REFERENCES ai_clip_jobs(id) ON DELETE CASCADE,
      frame       INT NOT NULL,
      time_sec    NUMERIC NULL,
      event_type  TEXT NOT NULL,
      winner_side TEXT NULL,
      confidence  NUMERIC NULL,
      reason      TEXT NULL,
      raw         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_clip_events_clip ON ai_clip_events(clip_id, frame)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_ai_clip_events_job ON ai_clip_events(job_id, frame)");

  // Training sessions (old coach system)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_sessions (
      id              SERIAL PRIMARY KEY,
      arena_id        INT NOT NULL REFERENCES arenas(id),
      coach_user_id   INT NOT NULL REFERENCES users(id),
      reservation_id  INT NULL REFERENCES reservations(id),
      session_type    VARCHAR(64) NOT NULL DEFAULT 'group',
      title           VARCHAR(255) NOT NULL DEFAULT '',
      focus_areas     TEXT NOT NULL DEFAULT '',
      notes           TEXT NOT NULL DEFAULT '',
      status          VARCHAR(32) NOT NULL DEFAULT 'scheduled',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_training_sessions_coach ON training_sessions (coach_user_id)");

  // Billing tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id                   SERIAL PRIMARY KEY,
      code                 VARCHAR(64) NOT NULL UNIQUE,
      name                 VARCHAR(128) NOT NULL,
      max_admins           INT NOT NULL DEFAULT 2,
      max_coaches          INT NOT NULL DEFAULT 5,
      max_players          INT NOT NULL DEFAULT 100,
      features_json        JSONB NOT NULL DEFAULT '{}',
      monthly_price_cents  INT NOT NULL DEFAULT 0,
      yearly_price_cents   INT NOT NULL DEFAULT 0,
      is_active            SMALLINT NOT NULL DEFAULT 1
    )
  `);
  await pool.query(`
    INSERT INTO billing_plans (code, name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents)
    VALUES
      ('starter',      'Starter',      2,  3,  50,  '{"analytics":false,"ai":false}',    0,       0),
      ('pro',          'Pro',          5,  10, 200, '{"analytics":true,"ai":false}',     4900,    49000),
      ('elite',        'Elite',        10, 25, 999, '{"analytics":true,"ai":true}',      9900,    99000)
    ON CONFLICT (code) DO NOTHING
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS arena_subscriptions (
      id                          SERIAL PRIMARY KEY,
      arena_id                    INT NOT NULL REFERENCES arenas(id),
      plan_id                     INT NOT NULL REFERENCES billing_plans(id),
      status                      VARCHAR(32) NOT NULL DEFAULT 'active',
      provider                    VARCHAR(64) NOT NULL DEFAULT 'manual',
      provider_customer_id        VARCHAR(255) NULL,
      provider_subscription_id    VARCHAR(255) NULL,
      current_period_start        TIMESTAMPTZ NULL,
      current_period_end          TIMESTAMPTZ NULL,
      trial_end                   TIMESTAMPTZ NULL,
      cancel_at_period_end        SMALLINT NOT NULL DEFAULT 0,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Coach booking wizard support
  await pool.query("ALTER TABLE coaching_requests ADD COLUMN IF NOT EXISTS preferred_court_id INT NULL REFERENCES courts(id)");

  // Stripe payment support
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255) NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2) NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(10) DEFAULT 'TND'");
  await pool.query("ALTER TABLE coaching_requests ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255) NULL");
  await pool.query("ALTER TABLE coaching_requests ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2) NULL");
  await pool.query("ALTER TABLE coaching_requests ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'pending'");
  await pool.query("ALTER TABLE coaching_requests ADD COLUMN IF NOT EXISTS coaching_reservation_id INT NULL REFERENCES reservations(id)");

  // Cancellation metadata and refund tracking
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancelled_by_user_id INT NULL REFERENCES users(id)");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancellation_actor_role VARCHAR(50) NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS refund_status VARCHAR(30) NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stripe_refund_id VARCHAR(255) NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) NULL");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS refund_error TEXT NULL");
  await pool.query("ALTER TABLE reservation_participants ALTER COLUMN user_id DROP NOT NULL");
  await pool.query("ALTER TABLE reservation_participants ADD COLUMN IF NOT EXISTS email VARCHAR(191) NULL");
  await pool.query("ALTER TABLE reservation_participants ADD COLUMN IF NOT EXISTS display_name VARCHAR(191) NULL");
  await pool.query("ALTER TABLE reservation_participants ADD COLUMN IF NOT EXISTS role VARCHAR(32) NULL");
  await pool.query("ALTER TABLE reservation_participants ADD COLUMN IF NOT EXISTS slot INT NULL");
  await pool.query("ALTER TABLE reservation_participants ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'confirmed'");
  await pool.query("ALTER TABLE reservation_participants ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(128) NULL");
  await pool.query("ALTER TABLE reservation_participants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await pool.query(
    `UPDATE reservation_participants rp
     SET email = users.email,
         display_name = CONCAT(users.first_name, ' ', users.last_name),
         updated_at = NOW()
     FROM users
     WHERE rp.user_id = users.id
       AND (rp.email IS NULL OR rp.email = '')`
  );
  await pool.query("CREATE INDEX IF NOT EXISTS idx_reservation_participants_email ON reservation_participants (LOWER(email))");

  await seedShowcaseArenas();
}

export async function closePool() {
  await pool.end();
}

export async function listArenas() {
  const { rows } = await pool.query("SELECT id, name, slug, location, created_at FROM arenas ORDER BY name ASC");
  return rows.map((row) => ({ ...row, created_at: toIso(row.created_at) }));
}

export async function createArena({ name, location }) {
  const baseSlug = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "arena";
  let slug = baseSlug;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO arenas (name, slug, location, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, name, slug, location, created_at`,
        [name, slug, location]
      );
      return { ...rows[0], created_at: toIso(rows[0].created_at) };
    } catch (error) {
      if (error?.code !== "23505") throw error;
      slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
    }
  }
  throw new Error("Unable to create arena slug");
}

export async function findUserByEmail(email) {
  const users = await queryUsersBy("WHERE users.email = $1 ORDER BY arena_memberships.id ASC LIMIT 1", [email]);
  return users[0] ?? null;
}

export async function createUser({
  firstName,
  lastName,
  email,
  passwordHash,
  membershipRole = "player",
  cinNumber = null,
  emailVerifiedAt = new Date().toISOString(),
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insert = await client.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status, platform_role, cin_number, email_verified_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', 'member', $6, $7, NOW())
       RETURNING id`,
      [firstName, lastName, email, passwordHash, membershipRole, cinNumber, emailVerifiedAt]
    );
    const userId = Number(insert.rows[0].id);
    await client.query(
      `INSERT INTO arena_memberships (arena_id, user_id, role, status, created_at)
       SELECT id, $1, $2, 'active', NOW() FROM arenas
       ON CONFLICT DO NOTHING`,
      [userId, membershipRole]
    );
    await client.query(
      `UPDATE reservation_participants
       SET user_id = $1,
           display_name = $2,
           status = CASE WHEN status = 'pending_account' THEN 'confirmed' ELSE status END,
           updated_at = NOW()
       WHERE user_id IS NULL
         AND LOWER(email) = LOWER($3)`,
      [userId, `${firstName} ${lastName}`.trim(), email]
    );
    await client.query("COMMIT");
    return findUserByEmail(email);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCourts(actor = null) {
  const params = [];
  let where = "";
  if (actor?.effective_role !== "super_admin" && actor?.effective_role !== "player" && actor?.arena_id) {
    params.push(actor.arena_id);
    where = `WHERE courts.arena_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT courts.*, arenas.name AS arena_name, arenas.location AS arena_location
     FROM courts
     JOIN arenas ON arenas.id = courts.arena_id
     ${where}
     ORDER BY courts.id ASC`,
    params
  );
  return rows.map(sanitizeCourt);
}

export async function getCourtById(id) {
  return getCourtByIdInternal(id);
}

export async function getCourtAvailability(courtId, reservationDate) {
  const court = await getCourtById(courtId);
  if (!court) return null;
  const openingMinutes = timeToMinutes(String(court.opening_time).slice(0, 5));
  const closingMinutes = timeToMinutes(String(court.closing_time).slice(0, 5));
  const duration = Number.isFinite(RESERVATION_DURATION_MINUTES) && RESERVATION_DURATION_MINUTES > 0 ? RESERVATION_DURATION_MINUTES : 90;
  const step = Number.isFinite(RESERVATION_STEP_MINUTES) && RESERVATION_STEP_MINUTES > 0 ? RESERVATION_STEP_MINUTES : duration;
  const { rows: reservedRows } = await pool.query(
    `SELECT start_time, end_time
     FROM reservations
     WHERE court_id = $1 AND reservation_date = $2::date AND status = 'confirmed'
     ORDER BY start_time ASC`,
    [courtId, reservationDate]
  );
  const reserved = reservedRows.map((row) => ({ startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5) }));
  const slots = [];
  for (let cursor = openingMinutes; cursor + duration <= closingMinutes; cursor += step) {
    const slotStart = minutesToTime(cursor);
    const slotEnd = minutesToTime(cursor + duration);
    const isReserved = reserved.some((range) => !(range.endTime <= slotStart || range.startTime >= slotEnd));
    slots.push({ startTime: slotStart, endTime: slotEnd, available: !isReserved });
  }
  return { courtId: court.id, reservationDate, openingTime: String(court.opening_time).slice(0, 5), closingTime: String(court.closing_time).slice(0, 5), slots, reserved };
}

export async function lookupParticipantsForArena(arenaId, emails) {
  if (!arenaId || !emails.length) return [];
  const uniqueEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!uniqueEmails.length) return [];
  const placeholders = uniqueEmails.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await pool.query(
    `SELECT users.id, users.first_name, users.last_name, users.email, users.platform_role,
            users.status AS account_status, arena_memberships.role AS membership_role,
            arena_memberships.status AS membership_status, arenas.id AS arena_id, arenas.name AS arena_name
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     JOIN arenas ON arenas.id = arena_memberships.arena_id
     WHERE arena_memberships.arena_id = $1
       AND users.status = 'active'
       AND arena_memberships.status = 'active'
       AND users.email IN (${placeholders})`,
    [arenaId, ...uniqueEmails]
  );
  return rows.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email, role: row.platform_role === "super_admin" ? "super_admin" : row.membership_role, status: row.membership_status, accountStatus: row.account_status, arenaId: row.arena_id, arenaName: row.arena_name }));
}

export async function listReservationsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT
       reservations.id, reservations.user_id, reservations.court_id,
       reservations.reservation_date, reservations.start_time, reservations.end_time,
       reservations.status, reservations.qr_token, reservations.notes, reservations.created_at,
       reservations.cancelled_at, reservations.cancellation_reason, reservations.refund_status,
       reservations.refunded_amount, reservations.payment_status, reservations.payment_amount,
       reservations.payment_currency,
       courts.name AS court_name, courts.sport, courts.arena_id, arenas.name AS arena_name,
       COALESCE(
         json_agg(
           json_build_object(
             'id', rp_all.id,
             'userId', participants.id,
             'firstName', participants.first_name,
             'lastName', participants.last_name,
             'displayName', COALESCE(rp_all.display_name, NULLIF(TRIM(CONCAT(participants.first_name, ' ', participants.last_name)), '')),
             'email', COALESCE(rp_all.email, participants.email),
             'status', COALESCE(rp_all.status, 'confirmed'),
             'role', COALESCE(rp_all.role, CASE WHEN participants.id = reservations.user_id THEN 'creator' ELSE 'participant' END),
             'slot', rp_all.slot
           )
           ORDER BY COALESCE(rp_all.slot, 999), rp_all.id
         )
         FILTER (WHERE rp_all.id IS NOT NULL),
         '[]'::json
       ) AS participants
     FROM reservation_participants rp_self
     JOIN reservations ON reservations.id = rp_self.reservation_id
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     LEFT JOIN reservation_participants rp_all ON rp_all.reservation_id = reservations.id
     LEFT JOIN users AS participants ON participants.id = rp_all.user_id
     WHERE rp_self.user_id = $1
     GROUP BY reservations.id, courts.name, courts.sport, courts.arena_id, arenas.name
     ORDER BY reservations.reservation_date DESC, reservations.start_time DESC`,
    [userId]
  );
  return rows.map(sanitizeReservation);
}

export async function getReservationForUser(reservationId, actor) {
  const { rows } = await pool.query(
    `SELECT
       reservations.id, reservations.user_id, reservations.court_id,
       reservations.reservation_date, reservations.start_time, reservations.end_time,
       reservations.status, reservations.qr_token, reservations.notes, reservations.created_at,
       reservations.cancelled_at, reservations.cancellation_reason,
       reservations.refund_status, reservations.refunded_amount, reservations.payment_status,
       reservations.payment_amount, reservations.payment_currency, reservations.stripe_session_id,
       courts.name AS court_name, courts.sport, courts.arena_id, arenas.name AS arena_name,
       arenas.location AS arena_location,
       COALESCE(
         json_agg(
           json_build_object(
             'id', rp_all.id,
             'userId', participants.id,
             'firstName', participants.first_name,
             'lastName', participants.last_name,
             'displayName', COALESCE(rp_all.display_name, NULLIF(TRIM(CONCAT(participants.first_name, ' ', participants.last_name)), '')),
             'email', COALESCE(rp_all.email, participants.email),
             'status', COALESCE(rp_all.status, 'confirmed'),
             'role', COALESCE(rp_all.role, CASE WHEN participants.id = reservations.user_id THEN 'creator' ELSE 'participant' END),
             'slot', rp_all.slot
           )
           ORDER BY COALESCE(rp_all.slot, 999), rp_all.id
         )
         FILTER (WHERE rp_all.id IS NOT NULL),
         '[]'::json
       ) AS participants
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     LEFT JOIN reservation_participants rp_all ON rp_all.reservation_id = reservations.id
     LEFT JOIN users AS participants ON participants.id = rp_all.user_id
     WHERE reservations.id = $1
     GROUP BY reservations.id, courts.name, courts.sport, courts.arena_id, arenas.name, arenas.location
     LIMIT 1`,
    [reservationId]
  );
  const reservation = rows[0] ? sanitizeReservation(rows[0]) : null;
  if (!reservation) return null;
  const isParticipant = reservation.participants.some((participant) => Number(participant.userId) === Number(actor?.id));
  const canAccess =
    actor?.effective_role === "super_admin" ||
    (actor?.effective_role === "admin" && actor?.arena_id && Number(actor.arena_id) === Number(reservation.arena_id)) ||
    Number(reservation.user_id) === Number(actor?.id) ||
    isParticipant;
  if (!canAccess) throw new Error("You do not have access to this reservation");
  return reservation;
}

export async function createReservation({ userId, courtId, reservationDate, startTime, endTime, qrToken, notes = "", participantEmails = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actorRows = await queryUsersBy("WHERE users.id = $1 ORDER BY arena_memberships.id ASC LIMIT 1", [userId], client);
    const creator = actorRows[0];
    if (!creator) throw new Error("User not found");
    if (creator.effective_status !== "active") throw new Error("This account is inactive");
    if (!creator.arena_id) throw new Error("Only arena members can create reservations");

    const court = await getCourtByIdInternal(courtId, client);
    if (!court) throw new Error("Court not found");
    if (court.status !== "available") throw new Error("This court is not available for booking");
    if (!["player", "super_admin"].includes(creator.effective_role) && court.arena_id !== creator.arena_id) throw new Error("You can only reserve courts in your arena");

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const openingMinutes = timeToMinutes(String(court.opening_time).slice(0, 5));
    const closingMinutes = timeToMinutes(String(court.closing_time).slice(0, 5));
    if (startMinutes === null || endMinutes === null || openingMinutes === null || closingMinutes === null || endMinutes <= startMinutes) throw new Error("Invalid reservation time");
    if (startMinutes < openingMinutes || endMinutes > closingMinutes) throw new Error("Reservation must stay within the arena opening hours");
    if (await hasReservationConflict(courtId, reservationDate, startTime, endTime, client)) throw new Error("This slot is already reserved");

    const guestEmails = participantEmails.map(normalizeEmail).filter(Boolean);
    const uniqueGuestEmails = [...new Set(guestEmails)];
    if (uniqueGuestEmails.length !== guestEmails.length) throw new Error("The same email cannot be used twice in a reservation");
    if (uniqueGuestEmails.some((email) => !isValidEmail(email))) throw new Error("Please enter valid participant emails");
    if (uniqueGuestEmails.some((email) => email === normalizeEmail(creator.email))) throw new Error("The reservation creator is already included automatically");

    const totalPlayers = 1 + uniqueGuestEmails.length;
    if (totalPlayers < Number(court.min_players) || totalPlayers > Number(court.max_players)) throw new Error(`This court accepts between ${court.min_players} and ${court.max_players} players`);

    let participantRows = [];
    if (uniqueGuestEmails.length) {
      const placeholders = uniqueGuestEmails.map((_, index) => `$${index + 2}`).join(", ");
      const queryResult = await client.query(
        `SELECT users.id, users.first_name, users.last_name, users.email, users.platform_role,
                users.status AS account_status, arena_memberships.status AS membership_status
         FROM users
         JOIN arena_memberships ON arena_memberships.user_id = users.id
         WHERE arena_memberships.arena_id = $1
           AND users.email IN (${placeholders})`,
        [court.arena_id, ...uniqueGuestEmails]
      );
      participantRows = queryResult.rows;
    }
    const invalid = participantRows.find((participant) => participant.platform_role === "super_admin" || participant.account_status !== "active" || participant.membership_status !== "active");
    if (invalid) throw new Error("Only active player accounts can be linked to a reservation");
    const participantByEmail = new Map(participantRows.map((participant) => [normalizeEmail(participant.email), participant]));

    const created = await client.query(
      `INSERT INTO reservations (user_id, court_id, reservation_date, start_time, end_time, status, qr_token, notes, created_at)
       VALUES ($1, $2, $3::date, $4::time, $5::time, 'confirmed', $6, $7, NOW())
       RETURNING id`,
      [userId, courtId, reservationDate, startTime, endTime, qrToken, notes]
    );
    const reservationId = Number(created.rows[0].id);
    await client.query(
      `INSERT INTO reservation_participants (reservation_id, user_id, email, display_name, role, slot, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'creator', 1, 'confirmed', NOW(), NOW())`,
      [reservationId, creator.id, normalizeEmail(creator.email), `${creator.first_name} ${creator.last_name}`.trim()]
    );
    for (const [index, email] of uniqueGuestEmails.entries()) {
      const participant = participantByEmail.get(email);
      const displayName = participant ? `${participant.first_name} ${participant.last_name}`.trim() : null;
      const status = participant ? "confirmed" : "pending_account";
      await client.query(
        `INSERT INTO reservation_participants (reservation_id, user_id, email, display_name, role, slot, status, invitation_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'participant', $5, $6, $7, NOW(), NOW())`,
        [reservationId, participant?.id ?? null, email, displayName, index + 2, status, participant ? null : randomUUID()]
      );
      if (participant?.id) {
        await createNotification({
          userId: participant.id,
          title: "You were added to a reservation",
          body: `${creator.first_name} ${creator.last_name} added you to ${court.name} on ${reservationDate} from ${startTime} to ${endTime}.`,
          type: "reservation",
          linkUrl: `/reservations/${reservationId}`,
        });
      }
    }
    await addActivityLog(client, { arenaId: court.arena_id, actorUserId: creator.id, actorName: `${creator.first_name} ${creator.last_name}`, action: "Reservation confirmee", detail: `${court.name} - ${reservationDate} ${startTime}-${endTime}` });
    await client.query("COMMIT");
    const reservations = await listReservationsForUser(userId);
    return reservations.find((reservation) => reservation.id === reservationId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelReservation(id, actor, reason = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT reservations.*, courts.arena_id, courts.name AS court_name,
              arenas.name AS arena_name,
              CONCAT(owner.first_name, ' ', owner.last_name) AS owner_name
       FROM reservations
       JOIN courts ON courts.id = reservations.court_id
       JOIN arenas ON arenas.id = courts.arena_id
       JOIN users AS owner ON owner.id = reservations.user_id
       WHERE reservations.id = $1
       LIMIT 1`,
      [id]
    );
    const reservation = rows[0];
    if (!reservation) {
      await client.query("ROLLBACK");
      return { changes: 0 };
    }
    if (reservation.status === "cancelled") {
      await client.query("ROLLBACK");
      return { success: true, alreadyCancelled: true, reservation };
    }
    const participants = await client.query("SELECT user_id FROM reservation_participants WHERE reservation_id = $1", [id]);
    const isParticipant = participants.rows.some((p) => Number(p.user_id) === actor.id);
    const canCancelRole = actor.effective_role === "super_admin" || (actor.effective_role === "admin" && actor.arena_id === reservation.arena_id);
    if (!canCancelRole && !isParticipant) throw new Error("You do not have permission to cancel this reservation");
    if (!canCancelRole) {
      const reservationStart = new Date(`${String(reservation.reservation_date).slice(0, 10)}T${String(reservation.start_time).slice(0, 8)}`);
      const diffHours = (reservationStart.getTime() - Date.now()) / (1000 * 60 * 60);
      if (diffHours < 24) throw new Error("Reservations can only be cancelled at least 24 hours in advance");
    }
    const actorRole = canCancelRole ? (actor.effective_role === "super_admin" ? "super_admin" : "admin") : "player";
    const result = await client.query(
      `UPDATE reservations
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by_user_id = $2,
           cancellation_reason = $3,
           cancellation_actor_role = $4
       WHERE id = $1`,
      [id, actor.id, reason ?? null, actorRole]
    );
    // Cancel any linked training sessions and capture coach user id
    const { rows: sessionRows } = await client.query(
      `UPDATE training_sessions SET status = 'cancelled'
       WHERE reservation_id = $1 AND status != 'cancelled'
       RETURNING id, coach_user_id`,
      [id]
    );
    const cancelledSession = sessionRows[0] ?? null;
    await addActivityLog(client, {
      arenaId: reservation.arena_id,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: canCancelRole ? "Reservation annulee (admin)" : "Reservation annulee",
      detail: `${reservation.court_name} - ${reservation.reservation_date} ${String(reservation.start_time).slice(0, 5)}`,
    });
    await client.query("COMMIT");
    return { changes: result.rowCount, success: true, reservation, cancelledSession };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateReservationRefund(id, { refundStatus, stripeRefundId = null, refundedAmount = null, refundError = null }) {
  await pool.query(
    `UPDATE reservations
     SET refund_status = $2, stripe_refund_id = $3, refunded_amount = $4, refund_error = $5
     WHERE id = $1`,
    [id, refundStatus, stripeRefundId ?? null, refundedAmount ?? null, refundError ?? null]
  );
}

export async function listAdminReservations(actor) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const params = [];
  let whereClause = "";
  if (actor.effective_role !== "super_admin") {
    params.push(actor.arena_id);
    whereClause = `WHERE courts.arena_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT reservations.id, reservations.reservation_date, reservations.start_time, reservations.end_time,
            reservations.status, reservations.notes, reservations.created_at, reservations.qr_token,
            courts.name AS court_name, arenas.name AS arena_name,
            creator.email AS owner_email, CONCAT(creator.first_name, ' ', creator.last_name) AS owner_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS creator ON creator.id = reservations.user_id
     ${whereClause}
     ORDER BY reservations.reservation_date DESC, reservations.start_time DESC`,
    params
  );
  return rows.map((row) => ({ ...row, created_at: toIso(row.created_at), reservation_date: String(row.reservation_date).slice(0, 10), start_time: String(row.start_time).slice(0, 5), end_time: String(row.end_time).slice(0, 5), special_code: `ULT-${row.id}-${String(row.qr_token ?? "").slice(0, 8).toUpperCase()}` }));
}

export async function updateAdminReservationStatus(actor, reservationId, nextStatus) {
  if (!["confirmed", "cancelled"].includes(nextStatus)) throw new Error("Invalid reservation status");
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT reservations.*, courts.arena_id, courts.name AS court_name
       FROM reservations
       JOIN courts ON courts.id = reservations.court_id
       WHERE reservations.id = $1
       LIMIT 1`,
      [reservationId]
    );
    const reservation = rows[0];
    if (!reservation) throw new Error("Reservation not found");
    if (actor.effective_role === "admin" && reservation.arena_id !== actor.arena_id) throw new Error("You can only manage reservations in your arena");
    await client.query(`UPDATE reservations SET status = $1 WHERE id = $2`, [nextStatus, reservationId]);
    await addActivityLog(client, { arenaId: reservation.arena_id, actorUserId: actor.id, actorName: `${actor.first_name} ${actor.last_name}`, action: `Reservation ${nextStatus === "cancelled" ? "annulee (admin)" : "validee (admin)"}`, detail: `${reservation.court_name} - ${reservation.reservation_date} ${String(reservation.start_time).slice(0, 5)}` });
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    role: user.effective_role,
    status: user.effective_status,
    accountStatus: user.status,
    platformRole: user.platform_role,
    membershipRole: user.membership_role,
    membershipStatus: user.membership_status,
    arenaId: user.arena_id,
    arenaName: user.arena_name,
    cinNumber: user.cin_number ?? null,
    emailVerified: Boolean(user.email_verified_at),
    emailVerifiedAt: toIso(user.email_verified_at),
    createdAt: toIso(user.created_at),
  };
}

export async function requestPasswordReset(email) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) return { sent: true, token: null };
  const token = randomBytes(32).toString("hex");
  const code = generateSixDigitCode();
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL", [user.id]);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
     VALUES ($1, $2, NOW() + INTERVAL '20 minutes', NOW())`,
    [user.id, `${token}:${code}`]
  );
  return {
    sent: true,
    token,
    code,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  };
}

export async function requestEmailVerification(email) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) return { sent: true, token: null };
  if (user.email_verified_at) return { sent: true, token: null, alreadyVerified: true };
  const token = randomBytes(32).toString("hex");
  const code = generateSixDigitCode();
  await pool.query("DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL", [user.id]);
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at, created_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours', NOW())`,
    [user.id, `${token}:${code}`]
  );
  return {
    sent: true,
    token,
    code,
    alreadyVerified: false,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  };
}

export async function verifyEmailWithToken(token) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT *
       FROM email_verification_tokens
       WHERE (token = $1 OR token LIKE ($1 || ':%'))
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Invalid or expired verification token");
    await client.query("UPDATE users SET email_verified_at = NOW() WHERE id = $1", [row.user_id]);
    await client.query("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyEmailWithCode(email, code) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) {
    throw new Error("Invalid verification code");
  }
  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Invalid verification code");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT *
       FROM email_verification_tokens
       WHERE user_id = $1
         AND token LIKE $2
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [user.id, `%:${normalizedCode}`]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Invalid or expired verification code");
    await client.query("UPDATE users SET email_verified_at = NOW() WHERE id = $1", [row.user_id]);
    await client.query("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetPasswordWithToken(token, passwordHash) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT *
       FROM password_reset_tokens
       WHERE (token = $1 OR token LIKE ($1 || ':%'))
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Invalid or expired reset token");
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, row.user_id]);
    await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetPasswordWithCode(email, code, passwordHash) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) {
    throw new Error("Invalid reset code");
  }
  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Invalid reset code");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT *
       FROM password_reset_tokens
       WHERE user_id = $1
         AND token LIKE $2
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [user.id, `%:${normalizedCode}`]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Invalid or expired reset code");
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, row.user_id]);
    await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const notYet = (name) => {
  throw new Error(`Postgres adapter: "${name}" is not migrated yet in Phase 2.`);
};

async function getArenaRoleUsage(arenaId) {
  const { rows } = await pool.query(
    `SELECT role, COUNT(*)::int AS count
     FROM arena_memberships
     WHERE arena_id = $1 AND status = 'active'
     GROUP BY role`,
    [arenaId]
  );
  const usage = { admins: 0, coaches: 0, players: 0 };
  for (const row of rows) {
    if (row.role === "admin") usage.admins = Number(row.count);
    if (row.role === "coach") usage.coaches = Number(row.count);
    if (row.role === "player") usage.players = Number(row.count);
  }
  return usage;
}

async function getArenaSubscriptionWithPlan(arenaId) {
  const { rows } = await pool.query(
    `SELECT
       arena_subscriptions.id,
       arena_subscriptions.arena_id,
       arena_subscriptions.status,
       arena_subscriptions.provider,
       arena_subscriptions.provider_customer_id,
       arena_subscriptions.provider_subscription_id,
       arena_subscriptions.current_period_start,
       arena_subscriptions.current_period_end,
       arena_subscriptions.trial_end,
       arena_subscriptions.cancel_at_period_end,
       billing_plans.code AS plan_code,
       billing_plans.name AS plan_name,
       billing_plans.max_admins,
       billing_plans.max_coaches,
       billing_plans.max_players,
       billing_plans.features_json,
       billing_plans.monthly_price_cents,
       billing_plans.yearly_price_cents
     FROM arena_subscriptions
     JOIN billing_plans ON billing_plans.id = arena_subscriptions.plan_id
     WHERE arena_subscriptions.arena_id = $1
     ORDER BY arena_subscriptions.id DESC
     LIMIT 1`,
    [arenaId]
  );
  if (rows[0]) return rows[0];

  const { rows: plans } = await pool.query(
    `SELECT code AS plan_code, name AS plan_name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents
     FROM billing_plans
     WHERE is_active = 1
     ORDER BY CASE WHEN code = 'starter' THEN 0 ELSE 1 END, monthly_price_cents ASC
     LIMIT 1`
  );
  const plan = plans[0];
  if (!plan) throw new Error("No billing plan configured");
  return {
    id: null,
    arena_id: arenaId,
    status: "active",
    provider: "manual",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_start: new Date(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    trial_end: null,
    cancel_at_period_end: false,
    ...plan,
  };
}

async function seedShowcaseArenas() {
  for (const place of PADEL_PLACES) {
    const { rows: upsertRows } = await pool.query(
      `INSERT INTO arenas (name, slug, location, description, city, region, address, phone, email_contact, website, instagram, facebook, opening_hours, amenities, hero_image_url, gallery_images, has_padel, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16::jsonb, true, true, NOW())
       ON CONFLICT (slug) DO UPDATE SET
         description = EXCLUDED.description,
         city = EXCLUDED.city,
         region = EXCLUDED.region,
         address = EXCLUDED.address,
         opening_hours = EXCLUDED.opening_hours,
         amenities = EXCLUDED.amenities,
         hero_image_url = EXCLUDED.hero_image_url,
         gallery_images = EXCLUDED.gallery_images,
         has_padel = true,
         is_active = true
       RETURNING id`,
      [
        place.name,
        place.slug,
        place.location,
        place.description ?? null,
        place.city ?? null,
        place.region ?? null,
        place.address ?? null,
        place.phone ?? null,
        null,
        place.website ?? null,
        place.instagram ?? null,
        place.facebook ?? null,
        JSON.stringify(place.opening_hours ?? {}),
        JSON.stringify(place.amenities ?? []),
        place.hero_image_url ?? null,
        JSON.stringify(place.gallery_images ?? []),
      ]
    );
    const arenaId = Number(upsertRows[0].id);

    for (const court of place.courts) {
      const { rows: existingCourt } = await pool.query(
        `SELECT id FROM courts WHERE arena_id = $1 AND name = $2 LIMIT 1`,
        [arenaId, court.name]
      );
      if (existingCourt[0]) {
        await pool.query(
          `UPDATE courts SET
             court_type = COALESCE(court_type, $1),
             surface_type = COALESCE(surface_type, $2),
             has_lighting = $3,
             is_panoramic = $4,
             price_per_hour = COALESCE(price_per_hour, $5),
             currency = 'TND',
             image_url = COALESCE(image_url, $6)
           WHERE id = $7`,
          [court.court_type, court.surface_type, court.has_lighting, court.is_panoramic, court.price_per_hour ?? null, court.image_url ?? null, existingCourt[0].id]
        );
        continue;
      }
      try {
        await pool.query(
          `INSERT INTO courts (arena_id, name, sport, status, has_summa, location, min_players, max_players, opening_time, closing_time, court_type, surface_type, has_lighting, is_panoramic, price_per_hour, currency, image_url, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::time, $10::time, $11, $12, $13, $14, $15, 'TND', $16, $17, NOW())`,
          [
            arenaId,
            court.name,
            court.sport,
            court.status,
            court.has_summa ? 1 : 0,
            court.location,
            court.min_players,
            court.max_players,
            court.opening_time,
            court.closing_time,
            court.court_type,
            court.surface_type ?? null,
            court.has_lighting ? true : false,
            court.is_panoramic ? true : false,
            court.price_per_hour ?? null,
            court.image_url ?? null,
            court.description ?? null,
          ]
        );
      } catch (err) {
        if (err?.code !== "23505") throw err;
      }
    }
  }
}

async function assertCanAddArenaMember(arenaId, membershipRole) {
  const subscription = await getArenaSubscriptionWithPlan(arenaId);
  if (!subscription) {
    throw new Error("No active subscription found for this arena");
  }

  if (!["trialing", "active"].includes(subscription.status)) {
    throw new Error("Subscription is not active. Please update billing before adding users.");
  }

  const usage = await getArenaRoleUsage(arenaId);
  const limits = {
    admin: Number(subscription.max_admins ?? 0),
    coach: Number(subscription.max_coaches ?? 0),
    player: Number(subscription.max_players ?? 0),
  };
  const current = {
    admin: usage.admins,
    coach: usage.coaches,
    player: usage.players,
  };

  if (!Object.prototype.hasOwnProperty.call(limits, membershipRole)) {
    return;
  }

  if (current[membershipRole] >= limits[membershipRole]) {
    throw new Error(`Plan limit reached for ${membershipRole} accounts. Please upgrade your subscription.`);
  }
}

export async function createManagedUser({
  actor,
  firstName,
  lastName,
  email,
  passwordHash,
  arenaId,
  membershipRole,
  arenaName,
  cinNumber = null,
  emailVerifiedAt = new Date().toISOString(),
}) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  let finalArenaId = arenaId;
  let managedFirstName = firstName;
  let managedLastName = lastName;

  if (actor.effective_role === "super_admin" && membershipRole === "admin" && arenaName) {
    const arena = await createArena({ name: arenaName, location: "Plateforme ULTIMA" });
    finalArenaId = arena.id;
    managedFirstName = "Admin";
    managedLastName = arenaName;
  }
  if (actor.effective_role === "admin") {
    if (Number(finalArenaId) !== Number(actor.arena_id)) throw new Error("You can only create users in your arena");
    if (!["player", "coach"].includes(membershipRole)) throw new Error("Arena admins can only create players and coaches");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertCanAddArenaMember(finalArenaId, membershipRole);
    const insert = await client.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status, platform_role, cin_number, email_verified_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', 'member', $6, $7, NOW())
       RETURNING id`,
      [managedFirstName, managedLastName, email, passwordHash, membershipRole, cinNumber, emailVerifiedAt]
    );
    const userId = Number(insert.rows[0].id);
    await client.query(
      `INSERT INTO arena_memberships (arena_id, user_id, role, status, created_at)
       VALUES ($1, $2, $3, 'active', NOW())`,
      [finalArenaId, userId, membershipRole]
    );
    await addActivityLog(client, { arenaId: finalArenaId, actorUserId: actor.id, actorName: `${actor.first_name} ${actor.last_name}`, action: "Compte cree par le staff", detail: `${managedFirstName} ${managedLastName} (${membershipRole})` });
    await client.query("COMMIT");
    return findUserById(userId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateMembershipRole(actor, targetUserId, nextRole, nextArenaId = null) {
  if (!["player", "coach", "admin"].includes(nextRole)) throw new Error("Invalid role");
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  if (actor.id === targetUserId) throw new Error("You cannot change your own role");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await findUserById(targetUserId, client);
    if (!target) throw new Error("User not found");
    if (target.platform_role === "super_admin") throw new Error("Super admin roles cannot be changed here");

    let resolvedArenaId = nextArenaId ? Number(nextArenaId) : Number(target.arena_id);
    if (actor.effective_role === "super_admin") {
      if (!resolvedArenaId) throw new Error("Arena is required");
    } else {
      if (Number(target.arena_id) !== Number(actor.arena_id)) throw new Error("You can only manage users in your arena");
      if (!["player", "coach"].includes(nextRole)) throw new Error("Arena admins can only assign player or coach roles");
      if (target.membership_role === "admin") throw new Error("Only a super admin can change admin roles");
      resolvedArenaId = Number(actor.arena_id);
    }

    if (target.membership_role === nextRole && Number(target.arena_id) === Number(resolvedArenaId)) {
      await client.query("COMMIT");
      return target;
    }

    await assertCanAddArenaMember(resolvedArenaId, nextRole);
    await client.query("UPDATE users SET role = $1 WHERE id = $2", [nextRole, targetUserId]);
    const memberships = await client.query("SELECT id, arena_id FROM arena_memberships WHERE user_id = $1 ORDER BY id ASC", [targetUserId]);
    const existingForArena = memberships.rows.find((row) => Number(row.arena_id) === Number(resolvedArenaId));
    const keptMembership = existingForArena ?? memberships.rows[0] ?? null;
    if (keptMembership?.id) {
      await client.query(
        "UPDATE arena_memberships SET arena_id = $1, role = $2, status = 'active' WHERE id = $3",
        [resolvedArenaId, nextRole, keptMembership.id]
      );
      await client.query("DELETE FROM arena_memberships WHERE user_id = $1 AND id <> $2", [targetUserId, keptMembership.id]);
    } else {
      await client.query(
        `INSERT INTO arena_memberships (arena_id, user_id, role, status, created_at)
         VALUES ($1, $2, $3, 'active', NOW())`,
        [resolvedArenaId, targetUserId, nextRole]
      );
    }
    await addActivityLog(client, {
      arenaId: resolvedArenaId,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: "Role utilisateur mis a jour",
      detail: `${target.first_name} ${target.last_name}: ${target.membership_role} -> ${nextRole}`,
    });
    await client.query("COMMIT");
    return findUserById(targetUserId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createCourt({ actor, arenaId, name, sport, location, hasSumma = 0, minPlayers = 2, maxPlayers = 4, openingTime = "08:00", closingTime = "22:00" }) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const resolvedArenaId = Number(arenaId);
  if (!resolvedArenaId) throw new Error("Arena is required");
  if (actor.effective_role === "admin" && resolvedArenaId !== actor.arena_id) throw new Error("You can only create courts in your arena");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insert = await client.query(
      `INSERT INTO courts (arena_id, name, sport, status, has_summa, location, min_players, max_players, opening_time, closing_time, created_at)
       VALUES ($1, $2, $3, 'available', $4, $5, $6, $7, $8::time, $9::time, NOW())
       RETURNING id`,
      [resolvedArenaId, name, sport, Number(hasSumma) ? 1 : 0, location, Number(minPlayers), Number(maxPlayers), openingTime, closingTime]
    );
    await addActivityLog(client, { arenaId: resolvedArenaId, actorUserId: actor.id, actorName: `${actor.first_name} ${actor.last_name}`, action: "Terrain cree", detail: `${name} (${sport})` });
    await client.query("COMMIT");
    return getCourtByIdInternal(Number(insert.rows[0].id));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createAnalysis({ userId, title, videoName, uploaderUserId = null, subjectUserId = null, matchId = null, storagePath = null, status = "queued", summary = null }) {
  const created = await pool.query(
    `INSERT INTO ai_analyses (user_id, title, video_name, status, summary, uploader_user_id, subject_user_id, match_id, storage_path, uploaded_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     RETURNING id`,
    [userId, title, videoName, status, summary ?? "Analyse en attente de traitement par le module IA.", uploaderUserId ?? userId, subjectUserId ?? userId, matchId, storagePath]
  );
  const id = Number(created.rows[0].id);
  const { rows } = await pool.query(
    `SELECT id, user_id AS "userId", title, video_name AS "videoName", status, summary,
            uploader_user_id AS "uploaderUserId", subject_user_id AS "subjectUserId", match_id AS "matchId",
            storage_path AS "storagePath", uploaded_at AS "uploadedAt", created_at AS "createdAt"
     FROM ai_analyses
     WHERE id = $1`,
    [id]
  );
  return { ...rows[0], uploadedAt: toIso(rows[0].uploadedAt), createdAt: toIso(rows[0].createdAt) };
}

export async function getAdminOverview(actor) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const params = [];
  const whereArena = actor.effective_role === "super_admin" ? "" : "WHERE arena_memberships.arena_id = $1";
  if (whereArena) params.push(actor.arena_id);

  const statsResult = await pool.query(
    `SELECT
       COUNT(DISTINCT users.id)::int AS users,
       COUNT(DISTINCT CASE WHEN competitions.status = 'open' THEN competitions.id END)::int AS "activeCompetitions",
       COUNT(DISTINCT competition_registrations.id)::int AS "totalRegistrations",
       COUNT(DISTINCT matches.id)::int AS "matchesThisWeek"
     FROM users
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN competitions ON competitions.arena_id = arena_memberships.arena_id
     LEFT JOIN competition_registrations ON competition_registrations.competition_id = competitions.id
     LEFT JOIN matches ON matches.arena_id = arena_memberships.arena_id
     ${whereArena}`,
    params
  );
  const userRows = await pool.query(
    `SELECT DISTINCT ON (users.id)
            users.id, users.first_name, users.last_name, users.email, users.platform_role, users.status,
            arena_memberships.role AS membership_role, arena_memberships.status AS membership_status,
            arenas.id AS arena_id, arenas.name AS arena_name, users.created_at
     FROM users
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN arenas ON arenas.id = arena_memberships.arena_id
     ${whereArena}
     ORDER BY users.id ASC`,
    params
  );
  const courtRows = await pool.query(
    `SELECT courts.*, arenas.name AS arena_name
     FROM courts
     JOIN arenas ON arenas.id = courts.arena_id
     ${actor.effective_role === "super_admin" ? "" : "WHERE courts.arena_id = $1"}
     ORDER BY courts.id ASC`,
    actor.effective_role === "super_admin" ? [] : [actor.arena_id]
  );
  const logRows = await pool.query(
    `SELECT activity_logs.*, arenas.name AS arena_name
     FROM activity_logs
     LEFT JOIN arenas ON arenas.id = activity_logs.arena_id
     ${actor.effective_role === "super_admin" ? "" : "WHERE activity_logs.arena_id = $1"}
     ORDER BY activity_logs.created_at DESC
     LIMIT 12`,
    actor.effective_role === "super_admin" ? [] : [actor.arena_id]
  );
  return {
    stats: statsResult.rows[0],
    users: userRows.rows.map(sanitizeMembershipUser),
    courts: courtRows.rows.map(sanitizeCourt),
    logs: logRows.rows.map(sanitizeLog),
    arenas: actor.effective_role === "super_admin" ? await listArenas() : [],
  };
}

export async function getArenaBillingSummary(actor) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const arenaId = actor.arena_id;
  if (!arenaId) throw new Error("Arena billing is not available for this account");
  const subscription = await getArenaSubscriptionWithPlan(arenaId);
  const usage = await getArenaRoleUsage(arenaId);
  let features = subscription.features_json ?? {};
  if (typeof features === "string") {
    try {
      features = JSON.parse(features);
    } catch {
      features = {};
    }
  }
  return {
    arenaId,
    subscription: {
      id: subscription.id,
      status: subscription.status,
      provider: subscription.provider,
      providerCustomerId: subscription.provider_customer_id,
      providerSubscriptionId: subscription.provider_subscription_id,
      plan: {
        code: subscription.plan_code,
        name: subscription.plan_name,
        monthlyPriceCents: Number(subscription.monthly_price_cents ?? 0),
        yearlyPriceCents: Number(subscription.yearly_price_cents ?? 0),
      },
      period: {
        currentStart: toIso(subscription.current_period_start),
        currentEnd: toIso(subscription.current_period_end),
        trialEnd: toIso(subscription.trial_end),
      },
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    },
    limits: {
      admins: Number(subscription.max_admins ?? 0),
      coaches: Number(subscription.max_coaches ?? 0),
      players: Number(subscription.max_players ?? 0),
    },
    usage,
    features,
  };
}

export async function listBillingPlans() {
  const { rows } = await pool.query(
    `SELECT code, name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents
     FROM billing_plans
     WHERE is_active = 1
     ORDER BY monthly_price_cents ASC`
  );
  return rows.map((row) => {
    let features = row.features_json ?? {};
    if (typeof features === "string") {
      try {
        features = JSON.parse(features);
      } catch {
        features = {};
      }
    }
    return {
      code: row.code,
      name: row.name,
      limits: { admins: Number(row.max_admins ?? 0), coaches: Number(row.max_coaches ?? 0), players: Number(row.max_players ?? 0) },
      prices: { monthlyCents: Number(row.monthly_price_cents ?? 0), yearlyCents: Number(row.yearly_price_cents ?? 0) },
      features,
    };
  });
}

export async function changeArenaPlan(actor, planCode, cycle = "monthly") {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  if (!actor.arena_id) throw new Error("Arena not found for this account");
  const planQuery = await pool.query(
    `SELECT id, code, max_admins, max_coaches, max_players
     FROM billing_plans
     WHERE code = $1 AND is_active = 1
     LIMIT 1`,
    [planCode]
  );
  const selectedPlan = planQuery.rows[0];
  if (!selectedPlan) throw new Error("Plan not found");
  const usage = await getArenaRoleUsage(actor.arena_id);
  if (usage.admins > Number(selectedPlan.max_admins) || usage.coaches > Number(selectedPlan.max_coaches) || usage.players > Number(selectedPlan.max_players)) {
    throw new Error("Current user count exceeds limits for the selected plan.");
  }
  await upsertArenaSubscriptionFromProvider({
    arenaId: actor.arena_id,
    planCode: selectedPlan.code,
    status: "active",
    provider: "manual",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + (String(cycle) === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
    trialEnd: null,
    cancelAtPeriodEnd: false,
  });
  return getArenaBillingSummary(actor);
}

export async function getLeaderboard(actor = null) {
  const params = [];
  let whereClause = "";
  if (actor?.effective_role !== "super_admin" && actor?.arena_id) {
    params.push(actor.arena_id);
    whereClause = `WHERE arena_memberships.arena_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY MAX(performance_snapshots.ranking_score) DESC) AS rank,
       CONCAT(users.first_name, ' ', LEFT(users.last_name, 1), '.') AS name,
       MAX(performance_snapshots.ranking_score) AS points,
       SUM(performance_snapshots.wins)::int AS wins,
       SUM(performance_snapshots.losses)::int AS losses
     FROM users
     JOIN performance_snapshots ON performance_snapshots.user_id = users.id
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     ${whereClause}
     GROUP BY users.id
     ORDER BY points DESC
     LIMIT 5`,
    params
  );
  return rows;
}

export async function getCompetitionDetails(competitionId) {
  const comp = await pool.query(
    `SELECT competitions.*, arenas.name AS arena_name
     FROM competitions
     LEFT JOIN arenas ON arenas.id = competitions.arena_id
     WHERE competitions.id = $1
     LIMIT 1`,
    [competitionId]
  );
  const competition = comp.rows[0];
  if (!competition) return null;
  const participants = await pool.query(
    `SELECT users.id, users.first_name, users.last_name, latest.ranking_score AS ranking,
            competition_registrations.registered_at
     FROM competition_registrations
     JOIN users ON users.id = competition_registrations.user_id
     LEFT JOIN (
       SELECT user_id, ranking_score, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) AS rn
       FROM performance_snapshots
     ) latest ON latest.user_id = users.id AND latest.rn = 1
     WHERE competition_registrations.competition_id = $1
       AND competition_registrations.status = 'registered'
     ORDER BY competition_registrations.id ASC`,
    [competitionId]
  );
  return {
    ...sanitizeCompetition(competition),
    participants: participants.rows.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      ranking: Number(p.ranking ?? 1000),
      registeredAt: toIso(p.registered_at),
    })),
    rules: competition.rules ?? null,
    prizes: competition.prizes ?? null,
  };
}

export async function createCompetition(actor, { name, sport, description, startDate, endDate, registrationDeadline, location, maxParticipants, rules, prizes }) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const arenaId = actor.effective_role === "super_admin" ? (actor.arena_id ?? null) : actor.arena_id;
  if (!arenaId) throw new Error("No arena associated with this admin account");
  const { rows } = await pool.query(
    `INSERT INTO competitions (arena_id, name, sport, description, start_date, end_date, registration_deadline, location, max_participants, status, rules, prizes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, NOW())
     RETURNING *`,
    [arenaId, name, sport, description ?? null, startDate, endDate ?? null, registrationDeadline ?? null, location, maxParticipants, rules ?? null, prizes ?? null]
  );
  return sanitizeCompetition(rows[0]);
}

export async function updateCompetition(actor, competitionId, { name, sport, description, startDate, endDate, registrationDeadline, location, maxParticipants, status, rules, prizes }) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const existing = await pool.query("SELECT * FROM competitions WHERE id = $1 LIMIT 1", [competitionId]);
  if (!existing.rows[0]) throw new Error("Competition not found");
  if (actor.effective_role !== "super_admin" && Number(existing.rows[0].arena_id) !== Number(actor.arena_id)) {
    throw new Error("Not authorized to edit this competition");
  }
  const { rows } = await pool.query(
    `UPDATE competitions
     SET name = COALESCE($2, name),
         sport = COALESCE($3, sport),
         description = COALESCE($4, description),
         start_date = COALESCE($5, start_date),
         end_date = $6,
         registration_deadline = $7,
         location = COALESCE($8, location),
         max_participants = COALESCE($9, max_participants),
         status = COALESCE($10, status),
         rules = $11,
         prizes = $12
     WHERE id = $1
     RETURNING *`,
    [competitionId, name, sport, description, startDate, endDate ?? null, registrationDeadline ?? null, location, maxParticipants, status, rules ?? null, prizes ?? null]
  );
  return sanitizeCompetition(rows[0]);
}

export async function deleteCompetition(actor, competitionId) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const existing = await pool.query("SELECT * FROM competitions WHERE id = $1 LIMIT 1", [competitionId]);
  if (!existing.rows[0]) throw new Error("Competition not found");
  if (actor.effective_role !== "super_admin" && Number(existing.rows[0].arena_id) !== Number(actor.arena_id)) {
    throw new Error("Not authorized to delete this competition");
  }
  await pool.query("DELETE FROM competition_registrations WHERE competition_id = $1", [competitionId]);
  await pool.query("DELETE FROM competitions WHERE id = $1", [competitionId]);
  return { success: true };
}

export async function listCompetitionRegistrations(actor, competitionId) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const comp = await pool.query("SELECT * FROM competitions WHERE id = $1 LIMIT 1", [competitionId]);
  if (!comp.rows[0]) throw new Error("Competition not found");
  if (actor.effective_role !== "super_admin" && Number(comp.rows[0].arena_id) !== Number(actor.arena_id)) {
    throw new Error("Not authorized");
  }
  const { rows } = await pool.query(
    `SELECT cr.id, cr.user_id, cr.status, cr.registered_at,
            u.first_name, u.last_name, u.email,
            COALESCE(ps.ranking_score, 1000) AS ranking_score
     FROM competition_registrations cr
     JOIN users u ON u.id = cr.user_id
     LEFT JOIN LATERAL (
       SELECT ranking_score FROM performance_snapshots WHERE user_id = u.id ORDER BY id DESC LIMIT 1
     ) ps ON true
     WHERE cr.competition_id = $1
     ORDER BY cr.registered_at ASC`,
    [competitionId]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    status: r.status,
    rankingScore: Number(r.ranking_score),
    registeredAt: toIso(r.registered_at),
  }));
}

export async function removeCompetitionRegistration(actor, competitionId, userId) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const comp = await pool.query("SELECT * FROM competitions WHERE id = $1 LIMIT 1", [competitionId]);
  if (!comp.rows[0]) throw new Error("Competition not found");
  if (actor.effective_role !== "super_admin" && Number(comp.rows[0].arena_id) !== Number(actor.arena_id)) {
    throw new Error("Not authorized");
  }
  await pool.query("DELETE FROM competition_registrations WHERE competition_id = $1 AND user_id = $2", [competitionId, userId]);
  return { success: true };
}
export async function getReservationTicketDetails(reservationId, actor) {
  const details = await pool.query(
    `SELECT reservations.id, reservations.reservation_date, reservations.start_time, reservations.end_time,
            reservations.status, reservations.qr_token, reservations.notes, reservations.created_at,
            reservations.payment_status, reservations.payment_amount, reservations.payment_currency,
            courts.name AS court_name, courts.sport, arenas.id AS arena_id, arenas.name AS arena_name, arenas.location AS arena_location,
            owner.first_name AS owner_first_name, owner.last_name AS owner_last_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS owner ON owner.id = reservations.user_id
     WHERE reservations.id = $1
     LIMIT 1`,
    [reservationId]
  );
  const reservation = details.rows[0];
  if (!reservation) throw new Error("Reservation not found");

  const participantsQuery = await pool.query(
    `SELECT reservation_participants.id, reservation_participants.user_id,
            reservation_participants.email, reservation_participants.display_name,
            reservation_participants.status, reservation_participants.role,
            users.first_name, users.last_name, users.email AS user_email
     FROM reservation_participants
     LEFT JOIN users ON users.id = reservation_participants.user_id
     WHERE reservation_participants.reservation_id = $1
     ORDER BY COALESCE(reservation_participants.slot, 999), reservation_participants.id`,
    [reservationId]
  );
  const participants = participantsQuery.rows;
  const canAccess =
    actor?.effective_role === "super_admin" ||
    (actor?.effective_role === "admin" && actor?.arena_id && Number(actor.arena_id) === Number(reservation.arena_id)) ||
    participants.some((participant) => Number(participant.user_id) === Number(actor?.id));
  if (!canAccess) throw new Error("You do not have access to this reservation ticket");

  const payload = `${reservation.id}|${reservation.qr_token}|${String(reservation.reservation_date).slice(0, 10)}|${String(reservation.start_time).slice(0, 8)}|${String(reservation.end_time).slice(0, 8)}`;
  const signature = createHmac("sha256", BILLING_SECRET).update(payload).digest("hex").slice(0, 32).toUpperCase();
  const specialCode = `ULT-${reservation.id}-${signature.slice(0, 8)}`;
  return {
    id: reservation.id,
    reservationDate: String(reservation.reservation_date).slice(0, 10),
    startTime: String(reservation.start_time).slice(0, 5),
    endTime: String(reservation.end_time).slice(0, 5),
    status: reservation.status,
    paymentStatus: reservation.payment_status ?? "paid",
    paymentAmount: reservation.payment_amount,
    paymentCurrency: reservation.payment_currency ?? "TND",
    qrToken: reservation.qr_token,
    notes: reservation.notes ?? "",
    createdAt: toIso(reservation.created_at),
    courtName: reservation.court_name,
    sport: reservation.sport,
    arenaName: reservation.arena_name,
    arenaLocation: reservation.arena_location,
    ownerName: `${reservation.owner_first_name} ${reservation.owner_last_name}`,
    participants: participants.map((participant) => ({
      id: participant.user_id,
      name: participant.display_name ?? `${participant.first_name ?? ""} ${participant.last_name ?? ""}`.trim() ?? participant.email,
      email: participant.email ?? participant.user_email,
      status: participant.status,
      role: participant.role,
    })),
    signature,
    specialCode,
  };
}

export async function getReservationTicketDetailsByQr(reservationId, qrToken) {
  const details = await pool.query(
    `SELECT reservations.id, reservations.reservation_date, reservations.start_time, reservations.end_time,
            reservations.status, reservations.qr_token, reservations.notes, reservations.created_at,
            reservations.payment_status, reservations.payment_amount, reservations.payment_currency,
            courts.name AS court_name, courts.sport, arenas.name AS arena_name, arenas.location AS arena_location,
            owner.first_name AS owner_first_name, owner.last_name AS owner_last_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS owner ON owner.id = reservations.user_id
     WHERE reservations.id = $1
       AND reservations.qr_token = $2
     LIMIT 1`,
    [reservationId, qrToken]
  );
  const reservation = details.rows[0];
  if (!reservation) throw new Error("Invalid ticket link or reservation");
  if (reservation.payment_status !== "paid") throw new Error("Payment required");
  const participantsQuery = await pool.query(
    `SELECT reservation_participants.id, reservation_participants.user_id,
            reservation_participants.email, reservation_participants.display_name,
            reservation_participants.status, reservation_participants.role,
            users.first_name, users.last_name, users.email AS user_email
     FROM reservation_participants
     LEFT JOIN users ON users.id = reservation_participants.user_id
     WHERE reservation_participants.reservation_id = $1
     ORDER BY COALESCE(reservation_participants.slot, 999), reservation_participants.id`,
    [reservationId]
  );
  const payload = `${reservation.id}|${reservation.qr_token}|${String(reservation.reservation_date).slice(0, 10)}|${String(reservation.start_time).slice(0, 8)}|${String(reservation.end_time).slice(0, 8)}`;
  const signature = createHmac("sha256", BILLING_SECRET).update(payload).digest("hex").slice(0, 32).toUpperCase();
  const specialCode = `ULT-${reservation.id}-${signature.slice(0, 8)}`;
  return {
    id: reservation.id,
    reservationDate: String(reservation.reservation_date).slice(0, 10),
    startTime: String(reservation.start_time).slice(0, 5),
    endTime: String(reservation.end_time).slice(0, 5),
    status: reservation.status,
    paymentStatus: reservation.payment_status ?? "paid",
    paymentAmount: reservation.payment_amount,
    paymentCurrency: reservation.payment_currency ?? "TND",
    qrToken: reservation.qr_token,
    notes: reservation.notes ?? "",
    createdAt: toIso(reservation.created_at),
    courtName: reservation.court_name,
    sport: reservation.sport,
    arenaName: reservation.arena_name,
    arenaLocation: reservation.arena_location,
    ownerName: `${reservation.owner_first_name} ${reservation.owner_last_name}`,
    participants: participantsQuery.rows.map((participant) => ({
      id: participant.user_id,
      name: participant.display_name ?? `${participant.first_name ?? ""} ${participant.last_name ?? ""}`.trim() ?? participant.email,
      email: participant.email ?? participant.user_email,
      status: participant.status,
      role: participant.role,
    })),
    signature,
    specialCode,
  };
}

function buildQrPdfCommands(value, x, y, size) {
  const qr = QRCode.create(String(value), { errorCorrectionLevel: "M", margin: 0 });
  const moduleCount = qr.modules.size;
  const moduleSize = size / moduleCount;
  const commands = ["1 1 1 rg", `${x} ${y} ${size} ${size} re`, "f", "0 0 0 rg"];
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.modules.get(row, col)) continue;
      const px = x + col * moduleSize;
      const py = y + (moduleCount - 1 - row) * moduleSize;
      commands.push(`${px.toFixed(2)} ${py.toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re`);
      commands.push("f");
    }
  }
  return commands;
}

function getJpegSize(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

function loadUltimaLogoJpeg() {
  for (const candidate of LOGO_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      const bytes = fs.readFileSync(candidate);
      const size = getJpegSize(bytes);
      if (size) return { bytes, ...size };
    }
  }
  return null;
}

export function generateReservationTicketPdfBuffer(ticket) {
  const line = (text = "") => String(text).replace(/[()\\]/g, "").slice(0, 96);
  const participantStatus = (status) => status === "pending_account" ? "Pending account" : status === "invited" ? "Invited" : status === "cancelled" ? "Cancelled" : "Confirmed";
  const participants = (ticket.participants || []).slice(0, 10).map((participant, index) => {
    const role = participant.role === "creator" ? "Creator" : `Participant ${index + 1}`;
    return `${role}: ${participant.name || participant.email} - ${participant.email} - ${participantStatus(participant.status)}`;
  });
  const specialCode = ticket.specialCode || `ULT-${ticket.id}-${ticket.signature.slice(0, 8)}`;
  const qrPayload = `ULTIMA|TICKET|${ticket.id}|${ticket.qrToken}|${specialCode}`;
  const durationMinutes = (() => {
    const [sh, sm] = String(ticket.startTime).split(":").map(Number);
    const [eh, em] = String(ticket.endTime).split(":").map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) return "N/A";
    return `${(eh * 60 + em) - (sh * 60 + sm)} min`;
  })();
  const paymentAmount = ticket.paymentAmount ? `${Number(ticket.paymentAmount).toFixed(3)} ${ticket.paymentCurrency || "TND"}` : "Paid via Stripe";
  const card = (x, y, w, h) => [
    "1 1 1 rg", `${x} ${y} ${w} ${h} re`, "f",
    "0.86 0.88 0.93 RG", "0.8 w", `${x} ${y} ${w} ${h} re`, "S",
  ];
  const text = (x, y, value, size = 10, font = "F2", color = "0.10 0.13 0.22") => [
    `${color} rg`, "BT", `/${font} ${size} Tf`, `${x} ${y} Td`, `(${line(value)}) Tj`, "ET",
  ];
  const pill = (x, y, w, label) => [
    "0.98 0.78 0.22 rg", `${x} ${y} ${w} 24 re`, "f",
    ...text(x + 12, y + 8, label, 8, "F1", "0.05 0.07 0.14"),
  ];
  const rows = [
    ["ARENA", ticket.arenaName],
    ["LOCATION", ticket.arenaLocation || "N/A"],
    ["COURT", `${ticket.courtName} - ${ticket.sport}`],
    ["DATE", ticket.reservationDate],
    ["TIME", `${ticket.startTime} - ${ticket.endTime}`],
    ["DURATION", durationMinutes],
    ["BOOKED BY", ticket.ownerName],
    ["PAYMENT", `${ticket.paymentStatus || "paid"} - ${paymentAmount}`],
  ];

  const stream = [
    "0.04 0.06 0.13 rg", "0 0 595 842 re", "f",
    "0.07 0.10 0.20 rg", "26 26 543 790 re", "f",
    "0.98 0.78 0.22 rg", "26 26 6 790 re", "f",
    "0.12 0.16 0.28 rg", "52 56 491 720 re", "f",
    "1 1 1 rg", "52 56 491 720 re", "f",
    "0.05 0.07 0.14 rg", "52 654 491 122 re", "f",
    "0.98 0.78 0.22 rg", "52 654 491 5 re", "f",
    "q", "76 0 0 56 74 692 cm", "/Im1 Do", "Q",
    ...text(160, 730, "ULTIMA COURT PASS", 26, "F1", "1 1 1"),
    ...text(162, 710, "Paid reservation ticket with SmartPlay-ready details", 9, "F2", "0.78 0.83 0.92"),
    ...pill(418, 710, 94, "STRIPE PAID"),
    ...text(74, 628, `Reservation #${ticket.id}`, 19, "F1"),
    ...text(74, 608, `${ticket.status} court reservation`, 9, "F2", "0.38 0.43 0.53"),
    ...card(74, 500, 280, 88),
    ...text(92, 560, "MATCH WINDOW", 8, "F1", "0.48 0.52 0.62"),
    ...text(92, 538, ticket.reservationDate, 17, "F1"),
    ...text(92, 518, `${ticket.startTime} - ${ticket.endTime}   (${durationMinutes})`, 10, "F2", "0.24 0.28 0.38"),
    ...card(74, 390, 280, 88),
    ...text(92, 450, "VENUE", 8, "F1", "0.48 0.52 0.62"),
    ...text(92, 428, ticket.arenaName, 15, "F1"),
    ...text(92, 410, `${ticket.courtName} - ${ticket.sport}`, 10, "F2", "0.24 0.28 0.38"),
    ...card(374, 390, 138, 198),
    "0.98 0.78 0.22 rg", "388 526 110 110 re", "f",
    "1 1 1 rg", "394 532 98 98 re", "f",
    ...buildQrPdfCommands(qrPayload, 400, 538, 86),
    ...text(394, 508, "SCAN TO VERIFY", 8, "F1"),
    ...text(390, 492, "QR appears only after", 7, "F2", "0.38 0.43 0.53"),
    ...text(392, 480, "Stripe payment is paid.", 7, "F2", "0.38 0.43 0.53"),
    ...card(74, 252, 438, 110),
    ...text(92, 334, "PARTICIPANTS", 9, "F1", "0.48 0.52 0.62"),
  ];
  const participantLines = participants.length ? participants.slice(0, 6) : ["No participants listed"];
  participantLines.forEach((participant, index) => {
    stream.push(...text(92, 314 - index * 15, participant, 8, "F2"));
  });
  if (participants.length > 6) stream.push(...text(92, 314 - 6 * 15, `+${participants.length - 6} more participants`, 8, "F2", "0.38 0.43 0.53"));

  stream.push(
    ...card(74, 126, 438, 94),
    ...text(92, 194, "RESERVATION DETAILS", 9, "F1", "0.48 0.52 0.62"),
  );
  rows.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? 92 : 292;
    const y = 174 - Math.floor(index / 2) * 24;
    stream.push(...text(x, y + 10, label, 6, "F1", "0.52 0.56 0.66"));
    stream.push(...text(x, y, value, 8, "F2"));
  });

  stream.push(
    "0.05 0.07 0.14 rg", "74 76 438 30 re", "f",
    ...text(92, 92, `VERIFY: ${specialCode}`, 9, "F1", "1 1 1"),
    ...text(310, 92, `SIGNATURE: ${ticket.signature}`, 6, "F2", "0.78 0.83 0.92"),
    ...text(74, 42, `Generated ${new Date().toISOString()} - ULTIMA SmartPlay Arena Platform`, 7, "F2", "0.78 0.83 0.92")
  );
  const contentStream = `${stream.join("\n")}\n`;
  const contentLength = Buffer.byteLength(contentStream, "utf8");
  const logo = loadUltimaLogoJpeg();
  const objects = [];
  objects.push(Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "utf8"));
  objects.push(Buffer.from("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n", "utf8"));
  objects.push(Buffer.from("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 7 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>\nendobj\n", "utf8"));
  objects.push(Buffer.from("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n", "utf8"));
  objects.push(Buffer.from(`5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}endstream\nendobj\n`, "utf8"));
  if (logo) {
    const imageHeader = Buffer.from(`6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`, "utf8");
    const imageFooter = Buffer.from("\nendstream\nendobj\n", "utf8");
    objects.push(Buffer.concat([imageHeader, logo.bytes, imageFooter]));
  } else {
    objects.push(Buffer.from("6 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n\xFF\xFF\xFF\nendstream\nendobj\n", "binary"));
  }
  objects.push(Buffer.from("7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "utf8"));
  let offset = Buffer.byteLength("%PDF-1.4\n", "utf8");
  const xrefOffsets = [0];
  for (const object of objects) {
    xrefOffsets.push(offset);
    offset += object.length;
  }
  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) xref += `${String(xrefOffsets[index]).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.concat([Buffer.from("%PDF-1.4\n", "utf8"), ...objects, Buffer.from(xref, "utf8"), Buffer.from(trailer, "utf8")]);
}

export async function verifyReservationTicketSignature(reservationId, signature) {
  const result = await pool.query(
    `SELECT reservations.id, reservations.reservation_date, reservations.start_time, reservations.end_time, reservations.qr_token, reservations.status,
            courts.name AS court_name, arenas.name AS arena_name, CONCAT(owner.first_name, ' ', owner.last_name) AS owner_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS owner ON owner.id = reservations.user_id
     WHERE reservations.id = $1
     LIMIT 1`,
    [reservationId]
  );
  const reservation = result.rows[0];
  if (!reservation) return { valid: false, reason: "Reservation not found" };
  const payload = `${reservation.id}|${reservation.qr_token}|${String(reservation.reservation_date).slice(0, 10)}|${String(reservation.start_time).slice(0, 8)}|${String(reservation.end_time).slice(0, 8)}`;
  const expectedSignature = createHmac("sha256", BILLING_SECRET).update(payload).digest("hex").slice(0, 32).toUpperCase();
  const provided = String(signature || "").trim().toUpperCase();
  const specialCode = `ULT-${reservation.id}-${expectedSignature.slice(0, 8)}`;
  return {
    valid: provided === expectedSignature || provided === specialCode,
    expectedSignature,
    reservationId: reservation.id,
    details: {
      reservationDate: String(reservation.reservation_date).slice(0, 10),
      startTime: String(reservation.start_time).slice(0, 5),
      endTime: String(reservation.end_time).slice(0, 5),
      status: reservation.status,
      courtName: reservation.court_name,
      arenaName: reservation.arena_name,
      ownerName: reservation.owner_name,
      specialCode,
    },
  };
}

export async function listCoachesForPlayer(playerUserId) {
  const actor = await requireActiveActor(playerUserId);
  if (!actor.arena_id) throw new Error("Player must belong to an arena");
  const { rows } = await pool.query(
    `SELECT users.id, users.first_name, users.last_name, users.email, arena_memberships.role AS membership_role
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     WHERE arena_memberships.arena_id = $1
       AND arena_memberships.status = 'active'
       AND users.status = 'active'
       AND arena_memberships.role IN ('coach', 'admin')
     ORDER BY users.first_name ASC, users.last_name ASC`,
    [actor.arena_id]
  );
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.membership_role,
  }));
}

export async function listCoachRelationshipsForUser(userId) {
  const actor = await requireActiveActor(userId);
  const { rows } = await pool.query(
    `SELECT links.*, CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name, CONCAT(player.first_name, ' ', player.last_name) AS player_name
     FROM coach_player_relationships links
     JOIN users coach ON coach.id = links.coach_user_id
     JOIN users player ON player.id = links.player_user_id
     WHERE links.coach_user_id = $1 OR links.player_user_id = $1
     ORDER BY links.updated_at DESC`,
    [actor.id]
  );
  return rows.map(normalizeRelationship);
}

export async function listCoachRelationshipExpiryReminders(userId, days = 7) {
  const actor = await requireActiveActor(userId);
  const safeDays = Math.min(60, Math.max(1, Number(days) || 7));
  const { rows } = await pool.query(
    `SELECT
       links.*,
       CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name,
       CONCAT(player.first_name, ' ', player.last_name) AS player_name
     FROM coach_player_relationships links
     JOIN users coach ON coach.id = links.coach_user_id
     JOIN users player ON player.id = links.player_user_id
     WHERE links.status = 'active'
       AND links.end_date IS NOT NULL
       AND links.end_date >= CURRENT_DATE
       AND links.end_date <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
       AND (
         ($2::int IN (links.coach_user_id, links.player_user_id))
         OR ($3::text = 'super_admin')
         OR ($3::text = 'admin' AND $4::int = links.arena_id)
       )
     ORDER BY links.end_date ASC`,
    [safeDays, actor.id, actor.effective_role, actor.arena_id]
  );
  return rows.map((row) => ({
    ...normalizeRelationship(row),
    reminder: `Relationship expires on ${String(row.end_date).split("T")[0]}`,
  }));
}
export async function getPerformanceForUser(userId) {
  try {
    const snapshots = await pool.query(
      `SELECT week_label, ranking_score, wins, losses, created_at
       FROM performance_snapshots
       WHERE user_id = $1
       ORDER BY id ASC`,
      [userId]
    );
    const profile = await pool.query(
      `SELECT service, return_skill, volley, endurance, strategy, mental, updated_at
       FROM performance_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    const rows = snapshots.rows;
    const latest = rows.at(-1) ?? null;
    const p = profile.rows[0] ?? null;
    const totalWins = rows.reduce((sum, row) => sum + Number(row.wins ?? 0), 0);
    const totalLosses = rows.reduce((sum, row) => sum + Number(row.losses ?? 0), 0);
    const totalMatches = totalWins + totalLosses;

    return {
      summary: latest
        ? {
            rankingScore: Number(latest.ranking_score),
            winRate: totalMatches ? `${Math.round((totalWins / totalMatches) * 100)}%` : "0%",
            streak: `${Math.min(5, rows.length)} victoires`,
            matchesThisMonth: rows.length,
            wins: totalWins,
            losses: totalLosses,
          }
        : null,
      progress: rows.map((row) => ({ semaine: row.week_label, score: row.ranking_score, victoires: row.wins, defaites: row.losses })),
      radar: p
        ? [
            { skill: "Service", value: p.service },
            { skill: "Retour", value: p.return_skill },
            { skill: "Volee", value: p.volley },
            { skill: "Endurance", value: p.endurance },
            { skill: "Strategie", value: p.strategy },
            { skill: "Mental", value: p.mental },
          ]
        : [],
    };
  } catch {
    return {
      summary: null,
      progress: [],
      radar: [],
    };
  }
}
export async function listAnalysesForUser(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id AS "userId", title, video_name AS "videoName", status, summary,
              uploader_user_id AS "uploaderUserId", subject_user_id AS "subjectUserId", match_id AS "matchId",
              storage_path AS "storagePath", uploaded_at AS "uploadedAt", created_at AS "createdAt"
       FROM ai_analyses
       WHERE user_id = $1 OR subject_user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map((row) => ({ ...row, uploadedAt: toIso(row.uploadedAt), createdAt: toIso(row.createdAt) }));
  } catch {
    return [];
  }
}

export async function persistRefreshToken(userId, token, expiresAt) {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [userId, token, expiresAt]
  );
}

export async function consumeRefreshToken(token) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM refresh_tokens
       WHERE token = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [token]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", [rows[0].id]);
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeRefreshTokensForUser(userId) {
  await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
}

export async function listNotificationsForUser(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, body, type, link_url AS "linkUrl", read_at AS "readAt", created_at AS "createdAt"
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    return rows.map((row) => ({ ...row, readAt: toIso(row.readAt), createdAt: toIso(row.createdAt) }));
  } catch {
    return [];
  }
}

export async function createNotification({ userId, title, body, type = "info", linkUrl = null }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, title, body, type, link_url, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, title, body, type, link_url AS "linkUrl", read_at AS "readAt", created_at AS "createdAt"`,
    [userId, title, body, type, linkUrl]
  );
  return { ...rows[0], readAt: toIso(rows[0].readAt), createdAt: toIso(rows[0].createdAt) };
}

export async function markNotificationRead(userId, notificationId) {
  const { rows } = await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, body, type, link_url AS "linkUrl", read_at AS "readAt", created_at AS "createdAt"`,
    [notificationId, userId]
  );
  return rows[0] ? { ...rows[0], readAt: toIso(rows[0].readAt), createdAt: toIso(rows[0].createdAt) } : null;
}
export async function listCoachStudents(coachUserId) {
  const actor = await getCoachActor(coachUserId);
  const { rows } = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       users.created_at,
       COALESCE(latest_snapshot.ranking_score, 1000) AS ranking_score,
       COALESCE(match_stats.matches_played, 0) AS matches_played,
       COALESCE(match_stats.wins, 0) AS wins,
       COALESCE(match_stats.losses, 0) AS losses,
       links.id AS relationship_id,
       links.start_date,
       links.end_date,
       links.can_view_performance,
       links.can_view_reservations,
       links.can_schedule_sessions,
       links.can_view_notes
     FROM coach_player_relationships links
     JOIN users ON users.id = links.player_user_id
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN (
       SELECT ps.user_id, ps.ranking_score
       FROM performance_snapshots ps
       JOIN (
         SELECT user_id, MAX(id) AS max_id
         FROM performance_snapshots
         GROUP BY user_id
       ) latest_ids ON latest_ids.user_id = ps.user_id AND latest_ids.max_id = ps.id
     ) latest_snapshot ON latest_snapshot.user_id = users.id
     LEFT JOIN (
       SELECT
         u.user_id,
         COUNT(*)::int AS matches_played,
         SUM(CASE WHEN m.winner_team = u.player_team THEN 1 ELSE 0 END)::int AS wins,
         SUM(CASE WHEN m.status = 'finished' AND m.winner_team <> u.player_team AND m.winner_team IN (1, 2) THEN 1 ELSE 0 END)::int AS losses
       FROM (
         SELECT id, winner_team, team1_player1_id AS user_id, 1 AS player_team, status FROM matches WHERE team1_player1_id IS NOT NULL
         UNION ALL SELECT id, winner_team, team1_player2_id, 1, status FROM matches WHERE team1_player2_id IS NOT NULL
         UNION ALL SELECT id, winner_team, team2_player1_id, 2, status FROM matches WHERE team2_player1_id IS NOT NULL
         UNION ALL SELECT id, winner_team, team2_player2_id, 2, status FROM matches WHERE team2_player2_id IS NOT NULL
       ) u
       JOIN matches m ON m.id = u.id
       WHERE m.status = 'finished'
       GROUP BY u.user_id
     ) match_stats ON match_stats.user_id = users.id
     WHERE links.coach_user_id = $1
       AND links.arena_id = $2
       AND links.status = 'active'
       AND links.start_date <= CURRENT_DATE
       AND (links.end_date IS NULL OR links.end_date >= CURRENT_DATE)
       AND links.can_view_performance = 1
       AND arena_memberships.role = 'player'
       AND arena_memberships.status = 'active'
       AND users.status = 'active'
     ORDER BY match_stats.matches_played DESC, users.first_name ASC, users.last_name ASC`,
    [actor.id, actor.arena_id]
  );
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    rankingScore: Number(row.ranking_score ?? 1000),
    matchesPlayed: Number(row.matches_played ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    createdAt: toIso(row.created_at),
    relationship: {
      id: row.relationship_id,
      startDate: row.start_date ? String(row.start_date).split("T")[0] : null,
      endDate: row.end_date ? String(row.end_date).split("T")[0] : null,
      permissions: {
        canViewPerformance: Boolean(row.can_view_performance),
        canViewReservations: Boolean(row.can_view_reservations),
        canScheduleSessions: Boolean(row.can_schedule_sessions),
        canViewNotes: Boolean(row.can_view_notes),
      },
    },
  }));
}

export async function getCoachStudentStats(coachUserId, studentId) {
  const actor = await getCoachActor(coachUserId);
  const relationship = await getActiveCoachRelationshipForStudent(actor.id, Number(studentId));
  if (!relationship) throw new Error("This player is not assigned to you");
  if (!relationship.can_view_performance) throw new Error("Player did not grant performance access");
  const { rows } = await pool.query(
    `SELECT users.id, users.first_name, users.last_name, users.email, users.created_at
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     WHERE users.id = $1
       AND arena_memberships.arena_id = $2
       AND arena_memberships.role = 'player'
     LIMIT 1`,
    [studentId, actor.arena_id]
  );
  if (!rows[0]) throw new Error("Student not found in your arena");
  const dashboard = await getPlayerDashboardData(studentId);
  const performance = await getPerformanceForUser(studentId);
  const matches = await listPlayerMatches(studentId);
  return {
    student: {
      id: rows[0].id,
      firstName: rows[0].first_name,
      lastName: rows[0].last_name,
      email: rows[0].email,
      createdAt: toIso(rows[0].created_at),
    },
    dashboard,
    performance,
    recentMatches: matches.slice(0, 12),
  };
}
export async function listCompetitions(actor = null) {
  const params = [];
  let whereClause = "";
  if (actor?.effective_role !== "super_admin" && actor?.arena_id) {
    params.push(actor.arena_id);
    whereClause = `WHERE competitions.arena_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT competitions.*, arenas.name AS arena_name, COUNT(competition_registrations.id)::int AS participants
     FROM competitions
     LEFT JOIN arenas ON arenas.id = competitions.arena_id
     LEFT JOIN competition_registrations
       ON competition_registrations.competition_id = competitions.id
      AND competition_registrations.status = 'registered'
     ${whereClause}
     GROUP BY competitions.id, arenas.name
     ORDER BY competitions.start_date ASC`,
    params
  );
  return rows.map(sanitizeCompetition);
}
export async function listMatches(actor = null) {
  const params = [];
  let whereClause = "";

  if (actor?.effective_role !== "super_admin" && actor?.arena_id) {
    params.push(actor.arena_id);
    whereClause = `WHERE matches.arena_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       matches.*,
       courts.name AS court_name,
       arenas.name AS arena_name
     FROM matches
     LEFT JOIN courts ON courts.id = matches.court_id
     LEFT JOIN arenas ON arenas.id = matches.arena_id
     ${whereClause}
     ORDER BY
       CASE matches.status
         WHEN 'live' THEN 0
         WHEN 'upcoming' THEN 1
         WHEN 'finished' THEN 2
         ELSE 3
       END,
       matches.id`,
    params
  );

  return rows.map((row) => ({
    ...row,
    scheduled_at: toIso(row.scheduled_at),
    created_at: toIso(row.created_at),
    score1: parseJsonColumn(row.score1),
    score2: parseJsonColumn(row.score2),
  }));
}
export async function registerForCompetition(competitionId, actor) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!actor?.arena_id || actor.effective_status !== "active") {
      await client.query("ROLLBACK");
      return { error: "Only active arena members can register" };
    }
    const competitionRows = await client.query("SELECT * FROM competitions WHERE id = $1 LIMIT 1", [competitionId]);
    const competition = competitionRows.rows[0];
    if (!competition) {
      await client.query("ROLLBACK");
      return { error: "Competition not found" };
    }
    if (Number(competition.arena_id) !== Number(actor.arena_id)) {
      await client.query("ROLLBACK");
      return { error: "You can only register for competitions in your arena" };
    }
    const existing = await client.query(
      `SELECT id
       FROM competition_registrations
       WHERE competition_id = $1 AND user_id = $2 AND status = 'registered'
       LIMIT 1`,
      [competitionId, actor.id]
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return { error: "Already registered" };
    }
    const countRows = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM competition_registrations
       WHERE competition_id = $1 AND status = 'registered'`,
      [competitionId]
    );
    if (competition.status !== "open" || Number(countRows.rows[0]?.count ?? 0) >= Number(competition.max_participants ?? 0)) {
      await client.query("ROLLBACK");
      return { error: "Competition is full or closed" };
    }
    await client.query(
      `INSERT INTO competition_registrations (competition_id, user_id, status, created_at)
       VALUES ($1, $2, 'registered', NOW())`,
      [competitionId, actor.id]
    );
    await addActivityLog(client, { arenaId: actor.arena_id, actorUserId: actor.id, actorName: `${actor.first_name} ${actor.last_name}`, action: "Inscription tournoi", detail: competition.name });
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function requestCoachRelationship(
  playerUserId,
  { coachUserId, startDate = null, endDate = null, notes = "", permissions = {}, consentVersion = 1 }
) {
  const player = await requireActiveActor(playerUserId);
  if (!player.arena_id) throw new Error("Player must belong to an arena");
  const coach = await findUserById(Number(coachUserId));
  if (!coach) throw new Error("Coach not found");
  if (Number(coach.arena_id) !== Number(player.arena_id)) throw new Error("Coach must be in the same arena");
  if (!["coach", "admin", "super_admin"].includes(coach.effective_role)) throw new Error("Selected user is not a coach");
  if (coach.effective_status !== "active") throw new Error("Selected coach is inactive");
  if (coach.id === player.id) throw new Error("You cannot request yourself as coach");

  const normalizedPermissions = normalizeRelationshipPermissions(permissions);
  const resolvedStartDate = startDate || new Date().toISOString().split("T")[0];
  if (endDate && endDate < resolvedStartDate) throw new Error("End date must be greater than or equal to start date");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id
       FROM coach_player_relationships
       WHERE coach_user_id = $1
         AND player_user_id = $2
         AND status IN ('pending', 'active', 'paused')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [coach.id, player.id]
    );
    if (existing.rows[0]) throw new Error("A relationship request already exists with this coach");

    const inserted = await client.query(
      `INSERT INTO coach_player_relationships
        (arena_id, coach_user_id, player_user_id, status, requested_by_user_id, can_view_performance, can_view_reservations, can_schedule_sessions, can_view_notes, consent_version, start_date, end_date, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12, NOW(), NOW())
       RETURNING id`,
      [
        player.arena_id,
        coach.id,
        player.id,
        player.id,
        normalizedPermissions.canViewPerformance ? 1 : 0,
        normalizedPermissions.canViewReservations ? 1 : 0,
        normalizedPermissions.canScheduleSessions ? 1 : 0,
        normalizedPermissions.canViewNotes ? 1 : 0,
        Number(consentVersion) || 1,
        resolvedStartDate,
        endDate || null,
        String(notes || "").trim(),
      ]
    );
    await addActivityLog(client, { arenaId: player.arena_id, actorUserId: player.id, actorName: `${player.first_name} ${player.last_name}`, action: "Coach request", detail: `Player requested coach ${coach.first_name} ${coach.last_name}` });
    await client.query("COMMIT");
    const id = Number(inserted.rows[0].id);
    const { rows } = await pool.query(
      `SELECT links.*, CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name, CONCAT(player.first_name, ' ', player.last_name) AS player_name
       FROM coach_player_relationships links
       JOIN users coach ON coach.id = links.coach_user_id
       JOIN users player ON player.id = links.player_user_id
       WHERE links.id = $1`,
      [id]
    );
    return normalizeRelationship(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function respondCoachRelationship(responderUserId, relationshipId, decision) {
  const responder = await requireActiveActor(responderUserId);
  const normalizedDecision = String(decision || "").toLowerCase();
  if (!["accept", "reject"].includes(normalizedDecision)) throw new Error("Decision must be accept or reject");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const relRes = await client.query("SELECT * FROM coach_player_relationships WHERE id = $1 LIMIT 1", [Number(relationshipId)]);
    const relationship = relRes.rows[0];
    if (!relationship) throw new Error("Relationship not found");
    const canRespond = responder.id === relationship.coach_user_id || (isAdminLike(responder) && Number(responder.arena_id) === Number(relationship.arena_id));
    if (!canRespond) throw new Error("You cannot respond to this relationship request");
    if (relationship.status !== "pending") throw new Error("Only pending requests can be responded to");
    const nextStatus = normalizedDecision === "accept" ? "active" : "rejected";
    await client.query(
      `UPDATE coach_player_relationships
       SET status = $1,
           responded_by_user_id = $2,
           responded_at = NOW(),
           consent_granted_at = CASE WHEN $1 = 'active' THEN NOW() ELSE consent_granted_at END,
           updated_at = NOW()
       WHERE id = $3`,
      [nextStatus, responder.id, relationship.id]
    );
    await addActivityLog(client, { arenaId: relationship.arena_id, actorUserId: responder.id, actorName: `${responder.first_name} ${responder.last_name}`, action: nextStatus === "active" ? "Coach request accepted" : "Coach request rejected", detail: `Relationship #${relationship.id}` });
    await client.query("COMMIT");
    const { rows } = await pool.query(
      `SELECT links.*, CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name, CONCAT(player.first_name, ' ', player.last_name) AS player_name
       FROM coach_player_relationships links
       JOIN users coach ON coach.id = links.coach_user_id
       JOIN users player ON player.id = links.player_user_id
       WHERE links.id = $1`,
      [relationship.id]
    );
    return normalizeRelationship(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function tickLiveMatches() {
  const { rows } = await pool.query("SELECT id, score1, score2 FROM matches WHERE status = 'live'");

  for (const row of rows) {
    const score1 = parseJsonColumn(row.score1);
    const score2 = parseJsonColumn(row.score2);
    const lastIndex = Math.max(score1.length, score2.length) - 1;

    if (lastIndex < 0) continue;

    if (Math.random() > 0.5) {
      score1[lastIndex] = Math.min(7, Number(score1[lastIndex] ?? 0) + 1);
    } else {
      score2[lastIndex] = Math.min(7, Number(score2[lastIndex] ?? 0) + 1);
    }

    await pool.query("UPDATE matches SET score1 = $1, score2 = $2 WHERE id = $3", [JSON.stringify(score1), JSON.stringify(score2), row.id]);
  }
}
export async function upsertArenaSubscriptionFromProvider({ arenaId, planCode, status, provider = "stripe", providerCustomerId = null, providerSubscriptionId = null, currentPeriodStart = null, currentPeriodEnd = null, trialEnd = null, cancelAtPeriodEnd = false }) {
  const planResult = await pool.query("SELECT id FROM billing_plans WHERE code = $1 LIMIT 1", [planCode]);
  const planId = planResult.rows[0]?.id;
  if (!planId) throw new Error("Invalid billing plan");
  await pool.query(
    `INSERT INTO arena_subscriptions
      (arena_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, current_period_start, current_period_end, trial_end, cancel_at_period_end, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $8::timestamp, $9::timestamp, $10, NOW(), NOW())`,
    [arenaId, planId, status, provider, providerCustomerId, providerSubscriptionId, currentPeriodStart, currentPeriodEnd, trialEnd, cancelAtPeriodEnd ? 1 : 0]
  );
  const { rows } = await pool.query(
    `SELECT id, arena_id, plan_id, status
     FROM arena_subscriptions
     WHERE arena_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [arenaId]
  );
  return rows[0] ?? null;
}

export async function updateMembershipStatus(actor, targetUserId, nextStatus) {
  if (!["active", "inactive"].includes(nextStatus)) throw new Error("Invalid status");
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  if (actor.id === targetUserId) throw new Error("You cannot change your own status");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await findUserById(targetUserId, client);
    if (!target) throw new Error("User not found");
    if (actor.effective_role === "admin") {
      if (target.platform_role === "super_admin" || target.membership_role === "admin") throw new Error("Only a super admin can activate or deactivate admins");
      if (Number(target.arena_id) !== Number(actor.arena_id)) throw new Error("You can only manage users in your arena");
    }
    if (target.platform_role === "super_admin") throw new Error("Super admin status cannot be changed here");
    await client.query("UPDATE users SET status = $1 WHERE id = $2", [nextStatus, targetUserId]);
    await client.query("UPDATE arena_memberships SET status = $1 WHERE user_id = $2", [nextStatus, targetUserId]);
    await addActivityLog(client, { arenaId: target.arena_id, actorUserId: actor.id, actorName: `${actor.first_name} ${actor.last_name}`, action: nextStatus === "active" ? "Compte reactive" : "Compte desactive", detail: `${target.first_name} ${target.last_name}` });
    await client.query("COMMIT");
    return findUserById(targetUserId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteUser(actor, targetUserId) {
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  if (actor.id === targetUserId) throw new Error("You cannot delete your own account");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await findUserById(targetUserId, client);
    if (!target) throw new Error("User not found");
    if (target.effective_status !== "inactive") throw new Error("Only inactive users can be deleted");
    if (actor.effective_role === "admin") {
      if (target.platform_role === "super_admin" || target.membership_role === "admin") throw new Error("Only a super admin can delete admins");
      if (Number(target.arena_id) !== Number(actor.arena_id)) throw new Error("You can only delete users in your arena");
    }
    if (target.platform_role === "super_admin") throw new Error("Super admin accounts cannot be deleted");
    await client.query("DELETE FROM reservation_participants WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM reservations WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM competition_registrations WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM performance_snapshots WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM performance_profiles WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM ai_analyses WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM activity_logs WHERE actor_user_id = $1", [targetUserId]);
    await client.query("DELETE FROM arena_memberships WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM users WHERE id = $1", [targetUserId]);
    await addActivityLog(client, { arenaId: target.arena_id, actorUserId: actor.id, actorName: `${actor.first_name} ${actor.last_name}`, action: "Compte supprime", detail: `${target.first_name} ${target.last_name}` });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPlayerDashboardData(userId) {
  const matchStats = await pool.query(
    `SELECT
       COUNT(*)::int AS "totalMatches",
       SUM(CASE WHEN winner_team = (CASE WHEN team1_player1_id = $1 OR team1_player2_id = $1 THEN 1 ELSE 2 END) THEN 1 ELSE 0 END)::int AS wins,
       SUM(CASE WHEN winner_team != (CASE WHEN team1_player1_id = $1 OR team1_player2_id = $1 THEN 1 ELSE 2 END) THEN 1 ELSE 0 END)::int AS losses
     FROM matches
     WHERE (team1_player1_id = $1 OR team1_player2_id = $1 OR team2_player1_id = $1 OR team2_player2_id = $1)
       AND status = 'finished'`,
    [userId]
  );
  const upcoming = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM reservations
     WHERE id IN (SELECT reservation_id FROM reservation_participants WHERE user_id = $1)
       AND reservation_date >= CURRENT_DATE
       AND status = 'confirmed'`,
    [userId]
  );
  const ranking = await pool.query(
    `SELECT ranking_score
     FROM performance_snapshots
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [userId]
  );
  const stats = matchStats.rows[0] || { totalMatches: 0, wins: 0, losses: 0 };
  const totalMatches = Number(stats.totalMatches ?? 0);
  const wins = Number(stats.wins ?? 0);
  const losses = Number(stats.losses ?? 0);
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
  return { totalMatches, winRate: `${winRate}%`, ranking: Number(ranking.rows[0]?.ranking_score ?? 1000), upcomingBookings: Number(upcoming.rows[0]?.count ?? 0), wins, losses };
}
export async function listPlayerMatches(userId) {
  const { rows } = await pool.query(
    `SELECT
       matches.*,
       courts.name AS court_name,
       arenas.name AS arena_name
     FROM matches
     JOIN courts ON courts.id = matches.court_id
     JOIN arenas ON arenas.id = matches.arena_id
     WHERE (
       matches.team1_player1_id = $1 OR
       matches.team1_player2_id = $1 OR
       matches.team2_player1_id = $1 OR
       matches.team2_player2_id = $1
     )
     ORDER BY matches.scheduled_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    ...row,
    scheduled_at: toIso(row.scheduled_at),
    created_at: toIso(row.created_at),
    score1: parseJsonColumn(row.score1),
    score2: parseJsonColumn(row.score2),
  }));
}
export async function finalizeMatch(reservationId, score1, score2) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reservationQuery = await client.query(
      `SELECT reservations.*, courts.arena_id
       FROM reservations
       JOIN courts ON courts.id = reservations.court_id
       WHERE reservations.id = $1 AND reservations.status = 'confirmed'
       LIMIT 1`,
      [reservationId]
    );
    const reservation = reservationQuery.rows[0];
    if (!reservation) throw new Error("Reservation non trouvee ou deja terminee");

    const s1 = Array.isArray(score1) ? score1 : [0];
    const s2 = Array.isArray(score2) ? score2 : [0];
    const sum1 = s1.reduce((a, b) => a + Number(b ?? 0), 0);
    const sum2 = s2.reduce((a, b) => a + Number(b ?? 0), 0);
    const winnerTeam = sum1 > sum2 ? 1 : sum2 > sum1 ? 2 : 0;

    const participantsQuery = await client.query(
      `SELECT user_id FROM reservation_participants WHERE reservation_id = $1 ORDER BY id ASC`,
      [reservationId]
    );
    const playerIds = participantsQuery.rows.map((row) => Number(row.user_id));
    const splitIndex = Math.ceil(playerIds.length / 2);
    const team1Ids = playerIds.slice(0, splitIndex);
    const team2Ids = playerIds.slice(splitIndex);

    await client.query(
      `INSERT INTO matches
        (reservation_id, court_id, arena_id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, score1, score2, winner_team, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'finished', $11)`,
      [
        reservationId,
        reservation.court_id,
        reservation.arena_id,
        team1Ids[0] ?? null,
        team1Ids[1] ?? null,
        team2Ids[0] ?? null,
        team2Ids[1] ?? null,
        JSON.stringify(s1),
        JSON.stringify(s2),
        winnerTeam,
        `${String(reservation.reservation_date).slice(0, 10)} ${String(reservation.start_time).slice(0, 8)}`,
      ]
    );

    await client.query("UPDATE reservations SET status = 'completed' WHERE id = $1", [reservationId]);

    for (const playerId of playerIds) {
      const isWinner = (winnerTeam === 1 && team1Ids.includes(playerId)) || (winnerTeam === 2 && team2Ids.includes(playerId));
      const latestQuery = await client.query(
        `SELECT ranking_score, wins, losses
         FROM performance_snapshots
         WHERE user_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [playerId]
      );
      const latest = latestQuery.rows[0];
      const oldScore = Number(latest?.ranking_score ?? 1000);
      const oldWins = Number(latest?.wins ?? 0);
      const oldLosses = Number(latest?.losses ?? 0);

      await client.query(
        `INSERT INTO performance_snapshots (user_id, ranking_score, wins, losses, streak, snapshot_date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
        [
          playerId,
          isWinner ? oldScore + 50 : Math.max(0, oldScore - 20),
          isWinner ? oldWins + 1 : oldWins,
          isWinner ? oldLosses : oldLosses + 1,
          isWinner ? "WIN" : "LOSS",
        ]
      );
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function createOrUpdateCoachRelationshipSeed({ coachUserId, playerUserId, status = "active", requestedByUserId = null, startDate = null, endDate = null, notes = "Seeded relationship" }) {
  const coach = await findUserById(Number(coachUserId));
  const player = await findUserById(Number(playerUserId));
  if (!coach || !player) throw new Error("Seed relationship users not found");
  const resolvedStartDate = startDate || new Date().toISOString().split("T")[0];
  const existing = await pool.query(
    `SELECT id
     FROM coach_player_relationships
     WHERE coach_user_id = $1
       AND player_user_id = $2
     ORDER BY id DESC
     LIMIT 1`,
    [coach.id, player.id]
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE coach_player_relationships
       SET status = $1,
           requested_by_user_id = $2,
           start_date = $3::date,
           end_date = $4::date,
           notes = $5,
           consent_granted_at = CASE WHEN $1 = 'active' THEN NOW() ELSE consent_granted_at END,
           updated_at = NOW()
       WHERE id = $6`,
      [status, requestedByUserId || player.id, resolvedStartDate, endDate || null, String(notes || "").trim(), existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await pool.query(
    `INSERT INTO coach_player_relationships
      (arena_id, coach_user_id, player_user_id, status, requested_by_user_id, can_view_performance, can_view_reservations, can_schedule_sessions, can_view_notes, consent_version, consent_granted_at, start_date, end_date, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, 1, 1, 0, 1, CASE WHEN $4 = 'active' THEN NOW() ELSE NULL END, $6::date, $7::date, $8, NOW(), NOW())
     RETURNING id`,
    [player.arena_id, coach.id, player.id, status, requestedByUserId || player.id, resolvedStartDate, endDate || null, String(notes || "").trim()]
  );
  return inserted.rows[0].id;
}

export async function updateCoachRelationshipSettings(actorUserId, relationshipId, { status, endDate, permissions, notes }) {
  const actor = await requireActiveActor(actorUserId);
  const relRows = await pool.query("SELECT * FROM coach_player_relationships WHERE id = $1 LIMIT 1", [Number(relationshipId)]);
  const relationship = relRows.rows[0];
  if (!relationship) throw new Error("Relationship not found");
  const isOwner = actor.id === relationship.player_user_id || actor.id === relationship.coach_user_id;
  const isArenaAdmin = isAdminLike(actor) && Number(actor.arena_id) === Number(relationship.arena_id);
  if (!isOwner && !isArenaAdmin) throw new Error("Not allowed to update this relationship");

  const updates = [];
  const params = [];
  if (status) {
    const allowedStatuses = ["active", "paused", "ended"];
    if (!allowedStatuses.includes(status)) throw new Error("Invalid relationship status");
    updates.push(`status = $${params.length + 1}`);
    params.push(status);
  }
  if (typeof endDate !== "undefined") {
    updates.push(`end_date = $${params.length + 1}::date`);
    params.push(endDate || null);
  }
  if (typeof notes !== "undefined") {
    updates.push(`notes = $${params.length + 1}`);
    params.push(String(notes || "").trim());
  }
  if (permissions && typeof permissions === "object") {
    const normalizedPermissions = normalizeRelationshipPermissions(permissions);
    updates.push(`can_view_performance = $${params.length + 1}`);
    params.push(normalizedPermissions.canViewPerformance ? 1 : 0);
    updates.push(`can_view_reservations = $${params.length + 1}`);
    params.push(normalizedPermissions.canViewReservations ? 1 : 0);
    updates.push(`can_schedule_sessions = $${params.length + 1}`);
    params.push(normalizedPermissions.canScheduleSessions ? 1 : 0);
    updates.push(`can_view_notes = $${params.length + 1}`);
    params.push(normalizedPermissions.canViewNotes ? 1 : 0);
  }
  if (!updates.length) throw new Error("No changes submitted");
  updates.push("updated_at = NOW()");
  params.push(Number(relationshipId));
  await pool.query(`UPDATE coach_player_relationships SET ${updates.join(", ")} WHERE id = $${params.length}`, params);
  const { rows } = await pool.query(
    `SELECT links.*, CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name, CONCAT(player.first_name, ' ', player.last_name) AS player_name
     FROM coach_player_relationships links
     JOIN users coach ON coach.id = links.coach_user_id
     JOIN users player ON player.id = links.player_user_id
     WHERE links.id = $1`,
    [Number(relationshipId)]
  );
  return normalizeRelationship(rows[0]);
}

export async function createCoachSession(
  coachUserId,
  { courtId, reservationDate, startTime, endTime, studentIds, title = "Training Session", sessionType = "individual", focusAreas = "", notes = "" }
) {
  const actor = await getCoachActor(coachUserId);
  const normalizedStudentIds = [...new Set((Array.isArray(studentIds) ? studentIds : []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!courtId || !reservationDate || !startTime || !endTime || !normalizedStudentIds.length) throw new Error("Court, date, times, and at least one student are required");
  const court = await getCourtById(Number(courtId));
  if (!court) throw new Error("Court not found");
  if (Number(court.arena_id) !== Number(actor.arena_id)) throw new Error("You can only schedule sessions in your arena");

  const placeholders = normalizedStudentIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows: studentRows } = await pool.query(
    `SELECT users.id, users.email, users.first_name, users.last_name, links.can_schedule_sessions
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     JOIN coach_player_relationships links
       ON links.player_user_id = users.id
      AND links.coach_user_id = $1
      AND links.status = 'active'
      AND links.start_date <= CURRENT_DATE
      AND (links.end_date IS NULL OR links.end_date >= CURRENT_DATE)
     WHERE users.id IN (${placeholders})
       AND arena_memberships.arena_id = $${normalizedStudentIds.length + 2}
       AND arena_memberships.role = 'player'
       AND arena_memberships.status = 'active'
       AND users.status = 'active'`,
    [actor.id, ...normalizedStudentIds, actor.arena_id]
  );
  if (studentRows.length !== normalizedStudentIds.length) throw new Error("Every selected student must be actively assigned to this coach");
  const denied = studentRows.find((row) => !row.can_schedule_sessions);
  if (denied) throw new Error("One or more players have not granted session scheduling permission");
  const participantCount = studentRows.length + 1;
  if (participantCount < Number(court.min_players) || participantCount > Number(court.max_players)) throw new Error(`This court accepts between ${court.min_players} and ${court.max_players} players`);

  const reservation = await createReservation({
    userId: actor.id,
    courtId: Number(courtId),
    reservationDate,
    startTime,
    endTime,
    qrToken: `coach-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    notes: `[Coach Session] ${title}${notes ? ` - ${notes}` : ""}`,
    participantEmails: studentRows.map((student) => student.email),
  });

  const inserted = await pool.query(
    `INSERT INTO training_sessions (arena_id, coach_user_id, reservation_id, session_type, title, focus_areas, notes, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', NOW())
     RETURNING id`,
    [actor.arena_id, actor.id, reservation.id, sessionType, String(title).trim(), String(focusAreas || "").trim(), String(notes || "").trim()]
  );
  const sessionId = Number(inserted.rows[0].id);
  const { rows } = await pool.query(
    `SELECT
       training_sessions.id,
       training_sessions.session_type,
       training_sessions.title,
       training_sessions.focus_areas,
       training_sessions.notes,
       training_sessions.status,
       training_sessions.created_at,
       reservations.id AS reservation_id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       courts.id AS court_id,
       courts.name AS court_name,
       arenas.name AS arena_name,
       COALESCE(
         json_agg(json_build_object('id', participants.id, 'firstName', participants.first_name, 'lastName', participants.last_name, 'email', participants.email))
         FILTER (WHERE participants.id IS NOT NULL AND participants.id <> training_sessions.coach_user_id),
         '[]'::json
       ) AS students
     FROM training_sessions
     JOIN reservations ON reservations.id = training_sessions.reservation_id
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     LEFT JOIN reservation_participants ON reservation_participants.reservation_id = reservations.id
     LEFT JOIN users AS participants ON participants.id = reservation_participants.user_id
     WHERE training_sessions.id = $1
     GROUP BY training_sessions.id, reservations.id, courts.id, arenas.name`,
    [sessionId]
  );
  const row = rows[0];
  return {
    id: row.id,
    sessionType: row.session_type,
    title: row.title,
    focusAreas: row.focus_areas,
    notes: row.notes,
    status: row.status,
    createdAt: toIso(row.created_at),
    reservationId: row.reservation_id,
    reservationDate: String(row.reservation_date).split("T")[0],
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    court: { id: row.court_id, name: row.court_name, arenaName: row.arena_name },
    students: parseJsonColumn(row.students),
  };
}

export async function listCoachSessions(coachUserId) {
  const actor = await getCoachActor(coachUserId);
  const params = [];
  let whereClause = "";
  if (actor.effective_role === "coach") {
    params.push(actor.id);
    whereClause = `WHERE training_sessions.coach_user_id = $${params.length}`;
  } else {
    params.push(actor.arena_id);
    whereClause = `WHERE training_sessions.arena_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT
       training_sessions.id,
       training_sessions.coach_user_id,
       training_sessions.session_type,
       training_sessions.title,
       training_sessions.focus_areas,
       training_sessions.notes,
       training_sessions.status,
       training_sessions.created_at,
       reservations.id AS reservation_id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       courts.id AS court_id,
       courts.name AS court_name,
       arenas.name AS arena_name,
       coach.first_name AS coach_first_name,
       coach.last_name AS coach_last_name,
       COALESCE(
         json_agg(json_build_object('id', participants.id, 'firstName', participants.first_name, 'lastName', participants.last_name, 'email', participants.email))
         FILTER (WHERE participants.id IS NOT NULL AND participants.id <> training_sessions.coach_user_id),
         '[]'::json
       ) AS students
     FROM training_sessions
     JOIN reservations ON reservations.id = training_sessions.reservation_id
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS coach ON coach.id = training_sessions.coach_user_id
     LEFT JOIN reservation_participants ON reservation_participants.reservation_id = reservations.id
     LEFT JOIN users AS participants ON participants.id = reservation_participants.user_id
     ${whereClause}
     GROUP BY
       training_sessions.id,
       training_sessions.coach_user_id,
       training_sessions.session_type,
       training_sessions.title,
       training_sessions.focus_areas,
       training_sessions.notes,
       training_sessions.status,
       training_sessions.created_at,
       reservations.id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       courts.id,
       courts.name,
       arenas.name,
       coach.first_name,
       coach.last_name
     ORDER BY reservations.reservation_date DESC, reservations.start_time DESC`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    coachUserId: row.coach_user_id,
    coachName: `${row.coach_first_name} ${row.coach_last_name}`,
    sessionType: row.session_type,
    title: row.title,
    focusAreas: row.focus_areas,
    notes: row.notes,
    status: row.status,
    createdAt: toIso(row.created_at),
    reservationId: row.reservation_id,
    reservationDate: String(row.reservation_date).split("T")[0],
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    court: {
      id: row.court_id,
      name: row.court_name,
      arenaName: row.arena_name,
    },
    students: parseJsonColumn(row.students),
  }));
}

// ── Padel Places & Terrains ─────────────────────────────────────────────────

const sanitizePadelPlace = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  location: row.location,
  description: row.description ?? null,
  city: row.city ?? null,
  region: row.region ?? null,
  address: row.address ?? null,
  phone: row.phone ?? null,
  website: row.website ?? null,
  instagram: row.instagram ?? null,
  facebook: row.facebook ?? null,
  openingHours: parseJsonColumn(row.opening_hours),
  amenities: parseJsonColumn(row.amenities),
  heroImageUrl: row.hero_image_url ?? null,
  galleryImages: parseJsonColumn(row.gallery_images),
  hasPadel: Boolean(row.has_padel),
  isActive: row.is_active !== false,
  terrainCount: Number(row.terrain_count ?? 0),
  hasIndoor: Boolean(row.has_indoor),
  hasOutdoor: Boolean(row.has_outdoor),
  createdAt: toIso(row.created_at),
});

const sanitizePadelTerrain = (row) => ({
  id: row.id,
  arenaId: row.arena_id,
  arenaName: row.arena_name ?? null,
  name: row.name,
  sport: row.sport,
  status: row.status,
  courtType: row.court_type ?? "indoor",
  surfaceType: row.surface_type ?? null,
  hasLighting: row.has_lighting !== false,
  isPanoramic: Boolean(row.is_panoramic),
  pricePerHour: row.price_per_hour != null ? Number(row.price_per_hour) : null,
  currency: row.currency ?? "TND",
  imageUrl: row.image_url ?? null,
  hasSumma: Boolean(row.has_summa),
  minPlayers: Number(row.min_players ?? 2),
  maxPlayers: Number(row.max_players ?? 4),
  openingTime: String(row.opening_time ?? "").slice(0, 5),
  closingTime: String(row.closing_time ?? "").slice(0, 5),
  description: row.description ?? null,
  createdAt: toIso(row.created_at),
});

export async function listArenasForCoachBooking() {
  const { rows } = await pool.query(
    `SELECT
       a.*,
       COUNT(c.id)::int AS terrain_count,
       COALESCE(bool_or(c.court_type = 'indoor'), false) AS has_indoor,
       COALESCE(bool_or(c.court_type IN ('outdoor', 'semi_covered')), false) AS has_outdoor
     FROM arenas a
     LEFT JOIN courts c ON c.arena_id = a.id
     GROUP BY a.id
     ORDER BY a.name ASC`
  );
  return rows.map(sanitizePadelPlace);
}

export async function listPadelPlaces({ city, region, search, indoor, outdoor } = {}) {
  const params = [];
  const conditions = ["a.has_padel = true", "a.is_active = true"];

  if (city) {
    params.push(`%${String(city).toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(a.city, '')) LIKE $${params.length}`);
  }
  if (region) {
    params.push(`%${String(region).toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(a.region, '')) LIKE $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(LOWER(a.name) LIKE $${idx} OR LOWER(COALESCE(a.city, '')) LIKE $${idx} OR LOWER(COALESCE(a.description, '')) LIKE $${idx})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT
       a.*,
       COUNT(c.id)::int AS terrain_count,
       COALESCE(bool_or(c.court_type = 'indoor'), false) AS has_indoor,
       COALESCE(bool_or(c.court_type IN ('outdoor', 'semi_covered')), false) AS has_outdoor
     FROM arenas a
     LEFT JOIN courts c ON c.arena_id = a.id
     ${where}
     GROUP BY a.id
     ORDER BY a.name ASC`,
    params
  );

  let places = rows.map(sanitizePadelPlace);
  if (indoor === "true" || indoor === true) places = places.filter((p) => p.hasIndoor);
  if (outdoor === "true" || outdoor === true) places = places.filter((p) => p.hasOutdoor);
  return places;
}

export async function getPadelPlace(idOrSlug) {
  const isNumeric = !Number.isNaN(Number(idOrSlug)) && String(idOrSlug).trim() !== "";
  const condition = isNumeric ? "a.id = $1" : "a.slug = $1";
  const param = isNumeric ? Number(idOrSlug) : String(idOrSlug);

  const { rows } = await pool.query(
    `SELECT
       a.*,
       COUNT(c.id)::int AS terrain_count,
       COALESCE(bool_or(c.court_type = 'indoor'), false) AS has_indoor,
       COALESCE(bool_or(c.court_type IN ('outdoor', 'semi_covered')), false) AS has_outdoor
     FROM arenas a
     LEFT JOIN courts c ON c.arena_id = a.id
     WHERE ${condition} AND a.has_padel = true
     GROUP BY a.id
     LIMIT 1`,
    [param]
  );
  return rows[0] ? sanitizePadelPlace(rows[0]) : null;
}

export async function listPadelTerrains(placeId) {
  const { rows } = await pool.query(
    `SELECT c.*, a.name AS arena_name
     FROM courts c
     JOIN arenas a ON a.id = c.arena_id
     WHERE c.arena_id = $1
     ORDER BY c.id ASC`,
    [Number(placeId)]
  );
  return rows.map(sanitizePadelTerrain);
}

export async function getPadelTerrain(terrainId) {
  const { rows } = await pool.query(
    `SELECT c.*, a.name AS arena_name
     FROM courts c
     JOIN arenas a ON a.id = c.arena_id
     WHERE c.id = $1
     LIMIT 1`,
    [Number(terrainId)]
  );
  return rows[0] ? sanitizePadelTerrain(rows[0]) : null;
}

export async function getPadelAvailability(placeId, date, startTime, durationMinutes) {
  const terrains = await listPadelTerrains(placeId);
  const dur = Number(durationMinutes) || 90;
  const startM = startTime ? timeToMinutes(startTime) : null;
  const endM = startM !== null ? startM + dur : null;
  const endTime = endM !== null ? minutesToTime(endM) : null;

  return Promise.all(
    terrains.map(async (terrain) => {
      if (terrain.status === "maintenance") return { ...terrain, available: false, availabilityReason: "maintenance" };

      if (startM !== null && endM !== null) {
        const openM = timeToMinutes(terrain.openingTime);
        const closeM = timeToMinutes(terrain.closingTime);
        if (openM !== null && startM < openM) return { ...terrain, available: false, availabilityReason: "before_opening" };
        if (closeM !== null && endM > closeM) return { ...terrain, available: false, availabilityReason: "after_closing" };

        if (date) {
          const conflict = await hasReservationConflict(terrain.id, date, startTime, endTime, pool);
          if (conflict) return { ...terrain, available: false, availabilityReason: "reserved" };
        }
      }

      return { ...terrain, available: true, availabilityReason: "available" };
    })
  );
}

export async function createPadelReservation({ userId, courtId, reservationDate, startTime, durationMinutes = 90 }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: userRows } = await client.query(
      "SELECT id, status FROM users WHERE id = $1 LIMIT 1",
      [Number(userId)]
    );
    const user = userRows[0];
    if (!user) throw new Error("User not found");
    if (user.status !== "active") throw new Error("This account is inactive");

    const court = await getCourtByIdInternal(Number(courtId), client);
    if (!court) throw new Error("Court not found");
    if (court.status === "maintenance") throw new Error("This court is under maintenance");

    const startM = timeToMinutes(startTime);
    if (startM === null) throw new Error("Invalid start time");
    const dur = Number(durationMinutes);
    if (!dur || dur < 30 || dur > 360) throw new Error("Duration must be between 30 and 360 minutes");
    const endM = startM + dur;
    const endTime = minutesToTime(endM);

    const openM = timeToMinutes(String(court.opening_time ?? "").slice(0, 5));
    const closeM = timeToMinutes(String(court.closing_time ?? "").slice(0, 5));
    if (openM !== null && startM < openM) throw new Error(`This court opens at ${String(court.opening_time).slice(0, 5)}`);
    if (closeM !== null && endM > closeM) throw new Error(`This court closes at ${String(court.closing_time).slice(0, 5)}`);

    if (await hasReservationConflict(Number(courtId), reservationDate, startTime, endTime, client)) {
      throw new Error("This time slot is already reserved");
    }

    const qrToken = randomUUID();
    const { rows: resRows } = await client.query(
      `INSERT INTO reservations (user_id, court_id, reservation_date, start_time, end_time, status, qr_token, notes, created_at)
       VALUES ($1, $2, $3::date, $4::time, $5::time, 'confirmed', $6, '', NOW())
       RETURNING *`,
      [Number(userId), Number(courtId), reservationDate, startTime, endTime, qrToken]
    );
    const reservation = resRows[0];

    await client.query(
      `INSERT INTO reservation_participants (reservation_id, user_id, created_at) VALUES ($1, $2, NOW())`,
      [reservation.id, Number(userId)]
    );

    await client.query("COMMIT");
    return {
      id: reservation.id,
      courtId: court.id,
      courtName: court.name,
      arenaName: court.arena_name,
      reservationDate,
      startTime,
      endTime,
      status: "confirmed",
      qrToken,
      createdAt: toIso(reservation.created_at),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COACHING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const parseJsonbArray = (val) => {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  try { return JSON.parse(String(val)); } catch { return []; }
};

function normalizeCoachProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    arenaId: row.arena_id,
    arenaName: row.arena_name ?? null,
    arenaCity: row.arena_city ?? null,
    arenaRegion: row.arena_region ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    email: row.email ?? null,
    profileImageUrl: row.profile_image_url ?? null,
    headline: row.headline ?? null,
    bio: row.bio ?? null,
    expertise: parseJsonbArray(row.expertise),
    qualities: parseJsonbArray(row.qualities),
    certifications: parseJsonbArray(row.certifications),
    previousWorkplaces: parseJsonbArray(row.previous_workplaces),
    languages: parseJsonbArray(row.languages),
    yearsExperience: row.years_experience ?? null,
    hourlyRate: row.hourly_rate ? Number(row.hourly_rate) : null,
    currency: row.currency ?? "TND",
    isActive: row.is_active ?? true,
    isVerified: row.is_verified ?? false,
    maxSessionsPerDay: row.max_sessions_per_day ?? null,
    sessionDurationMinutes: row.session_duration_minutes ?? 60,
    cooldownMinutes: row.cooldown_minutes ?? 0,
    userStatus: row.user_status ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function normalizeCoachingRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    playerUserId: row.player_user_id,
    playerName: row.player_name ?? null,
    coachUserId: row.coach_user_id,
    coachName: row.coach_name ?? null,
    arenaId: row.arena_id,
    arenaName: row.arena_name ?? null,
    arenaCity: row.arena_city ?? null,
    courtName: row.court_name ?? null,
    courtType: row.court_type ?? null,
    surfaceType: row.surface_type ?? null,
    coachHeadline: row.coach_headline ?? null,
    coachHourlyRate: row.coach_hourly_rate ? Number(row.coach_hourly_rate) : null,
    requestedDate: row.requested_date ? String(row.requested_date).slice(0, 10) : null,
    requestedStartTime: row.requested_start_time ? String(row.requested_start_time).slice(0, 5) : null,
    requestedEndTime: row.requested_end_time ? String(row.requested_end_time).slice(0, 5) : null,
    playersCount: row.players_count,
    message: row.message ?? null,
    status: row.status,
    coachReplyMessage: row.coach_reply_message ?? null,
    counterProposedDate: row.counter_proposed_date ? String(row.counter_proposed_date).slice(0, 10) : null,
    counterProposedStartTime: row.counter_proposed_start_time ? String(row.counter_proposed_start_time).slice(0, 5) : null,
    counterProposedEndTime: row.counter_proposed_end_time ? String(row.counter_proposed_end_time).slice(0, 5) : null,
    paymentStatus: row.payment_status ?? "pending",
    reservationId: row.coaching_reservation_id ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function normalizeCoachingSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    coachingRequestId: row.coaching_request_id,
    playerUserId: row.player_user_id,
    playerName: row.player_name ?? null,
    coachUserId: row.coach_user_id,
    coachName: row.coach_name ?? null,
    arenaId: row.arena_id,
    arenaName: row.arena_name ?? null,
    sessionDate: row.session_date ? String(row.session_date).slice(0, 10) : null,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    playersCount: row.players_count,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ── Coach Profiles ────────────────────────────────────────────────────────────

export async function getCoachProfile(coachUserId) {
  const { rows } = await pool.query(
    `SELECT cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
            a.name AS arena_name, a.city AS arena_city
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     WHERE u.id = $1`,
    [Number(coachUserId)]
  );
  return normalizeCoachProfile(rows[0]);
}

export async function upsertCoachProfile(actorUserId, targetCoachUserId, data) {
  const actor = await requireActiveActor(actorUserId);
  const isSelf = Number(actorUserId) === Number(targetCoachUserId);
  if (!isSelf && !isAdminLike(actor)) throw new Error("Not allowed to edit this coach profile");

  const {
    arenaId, profileImageUrl, headline, bio,
    expertise, qualities, certifications, previousWorkplaces,
    languages, yearsExperience, hourlyRate, currency, isActive, isVerified,
    maxSessionsPerDay, sessionDurationMinutes, cooldownMinutes,
  } = data;

  const safeArenaId = arenaId !== undefined ? (arenaId ? Number(arenaId) : null) : (actor.arena_id ?? null);
  const existing = await pool.query("SELECT id FROM coach_profiles WHERE user_id = $1", [Number(targetCoachUserId)]);

  if (existing.rows[0]) {
    const fields = [];
    const params = [];
    const set = (col, val) => { fields.push(`${col} = $${params.length + 1}`); params.push(val); };
    if (arenaId !== undefined) set("arena_id", safeArenaId);
    if (profileImageUrl !== undefined) set("profile_image_url", profileImageUrl);
    if (headline !== undefined) set("headline", String(headline || "").trim() || null);
    if (bio !== undefined) set("bio", String(bio || "").trim() || null);
    if (expertise !== undefined) set("expertise", JSON.stringify(Array.isArray(expertise) ? expertise : []));
    if (qualities !== undefined) set("qualities", JSON.stringify(Array.isArray(qualities) ? qualities : []));
    if (certifications !== undefined) set("certifications", JSON.stringify(Array.isArray(certifications) ? certifications : []));
    if (previousWorkplaces !== undefined) set("previous_workplaces", JSON.stringify(Array.isArray(previousWorkplaces) ? previousWorkplaces : []));
    if (languages !== undefined) set("languages", JSON.stringify(Array.isArray(languages) ? languages : []));
    if (yearsExperience !== undefined) set("years_experience", yearsExperience ? Number(yearsExperience) : null);
    if (hourlyRate !== undefined) set("hourly_rate", hourlyRate ? Number(hourlyRate) : null);
    if (currency !== undefined) set("currency", String(currency || "TND").trim());
    if (isActive !== undefined && isAdminLike(actor)) set("is_active", Boolean(isActive));
    if (isVerified !== undefined && isAdminLike(actor)) set("is_verified", Boolean(isVerified));
    if (maxSessionsPerDay !== undefined) set("max_sessions_per_day", maxSessionsPerDay !== null ? Math.max(1, Number(maxSessionsPerDay)) : null);
    if (sessionDurationMinutes !== undefined) set("session_duration_minutes", Math.max(15, Number(sessionDurationMinutes) || 60));
    if (cooldownMinutes !== undefined) set("cooldown_minutes", Math.max(0, Number(cooldownMinutes) || 0));
    fields.push("updated_at = NOW()");
    if (!params.length) return getCoachProfile(targetCoachUserId);
    params.push(Number(targetCoachUserId));
    await pool.query(`UPDATE coach_profiles SET ${fields.join(", ")} WHERE user_id = $${params.length}`, params);
  } else {
    await pool.query(
      `INSERT INTO coach_profiles
         (user_id, arena_id, profile_image_url, headline, bio, expertise, qualities,
          certifications, previous_workplaces, languages, years_experience, hourly_rate,
          currency, is_active, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        Number(targetCoachUserId), safeArenaId,
        profileImageUrl ?? null,
        headline ? String(headline).trim() : null,
        bio ? String(bio).trim() : null,
        JSON.stringify(Array.isArray(expertise) ? expertise : []),
        JSON.stringify(Array.isArray(qualities) ? qualities : []),
        JSON.stringify(Array.isArray(certifications) ? certifications : []),
        JSON.stringify(Array.isArray(previousWorkplaces) ? previousWorkplaces : []),
        JSON.stringify(Array.isArray(languages) ? languages : []),
        yearsExperience ? Number(yearsExperience) : null,
        hourlyRate ? Number(hourlyRate) : null,
        String(currency || "TND").trim(),
        isActive !== undefined ? Boolean(isActive) : true,
        isVerified !== undefined ? Boolean(isVerified) : false,
      ]
    );
  }
  return getCoachProfile(targetCoachUserId);
}

export async function updateCoachAvatar(coachUserId, imageUrl) {
  await pool.query(
    `INSERT INTO coach_profiles (user_id, profile_image_url)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET profile_image_url = $2, updated_at = NOW()`,
    [Number(coachUserId), imageUrl]
  );
}

export async function listCoachProfiles(filters = {}) {
  const { arenaId, city, search } = filters;
  const params = [];
  const where = ["u.role = 'coach'", "u.status = 'active'"];
  if (arenaId) { params.push(Number(arenaId)); where.push(`cp.arena_id = $${params.length}`); }
  if (city) { params.push(`%${city}%`); where.push(`a.city ILIKE $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR cp.headline ILIKE $${idx} OR a.name ILIKE $${idx} OR a.city ILIKE $${idx} OR a.region ILIKE $${idx})`);
  }
  const { rows } = await pool.query(
    `SELECT cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
            a.name AS arena_name, a.city AS arena_city, a.region AS arena_region
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     WHERE ${where.join(" AND ")}
     ORDER BY cp.is_verified DESC NULLS LAST, u.first_name ASC`,
    params
  );
  let result = rows.map(normalizeCoachProfile);
  const { expertise, language } = filters;
  if (expertise) {
    const exp = expertise.toLowerCase();
    result = result.filter((c) => c.expertise.some((e) => String(e).toLowerCase().includes(exp)));
  }
  if (language) {
    const lang = language.toLowerCase();
    result = result.filter((c) => c.languages.some((l) => String(l).toLowerCase().includes(lang)));
  }
  return result;
}

export async function getCoachPublicProfile(coachUserId) {
  const { rows } = await pool.query(
    `SELECT cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
            a.name AS arena_name, a.city AS arena_city, a.region AS arena_region
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     WHERE u.id = $1 AND u.role = 'coach' AND u.status = 'active'`,
    [Number(coachUserId)]
  );
  return normalizeCoachProfile(rows[0] ?? null);
}

// ── Availability ──────────────────────────────────────────────────────────────

export async function getCoachAvailability(coachUserId) {
  const [rulesRes, excRes, profileRes] = await Promise.all([
    pool.query(
      `SELECT * FROM coach_availability_rules WHERE coach_user_id = $1 ORDER BY day_of_week, start_time`,
      [Number(coachUserId)]
    ),
    pool.query(
      `SELECT * FROM coach_availability_exceptions WHERE coach_user_id = $1 AND exception_date >= CURRENT_DATE ORDER BY exception_date`,
      [Number(coachUserId)]
    ),
    pool.query(
      `SELECT max_sessions_per_day, session_duration_minutes, cooldown_minutes FROM coach_profiles WHERE user_id = $1`,
      [Number(coachUserId)]
    ),
  ]);
  const p = profileRes.rows[0];
  return {
    rules: rulesRes.rows.map((r) => ({
      id: r.id, dayOfWeek: r.day_of_week,
      startTime: String(r.start_time).slice(0, 5),
      endTime: String(r.end_time).slice(0, 5),
      isAvailable: r.is_available,
    })),
    exceptions: excRes.rows.map((r) => ({
      id: r.id, date: String(r.exception_date).slice(0, 10),
      startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
      endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
      isAvailable: r.is_available, reason: r.reason ?? null,
    })),
    sessionLimits: {
      maxSessionsPerDay: p?.max_sessions_per_day ?? null,
      sessionDurationMinutes: p?.session_duration_minutes ?? 60,
      cooldownMinutes: p?.cooldown_minutes ?? 0,
    },
  };
}

export async function setCoachAvailabilityRules(coachUserId, rules) {
  const actor = await requireActiveActor(coachUserId);
  if (!isCoachLike(actor)) throw new Error("Coach access required");
  if (!Array.isArray(rules)) throw new Error("rules must be an array");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM coach_availability_rules WHERE coach_user_id = $1", [actor.id]);
    for (const rule of rules) {
      const dow = Number(rule.dayOfWeek);
      if (dow < 0 || dow > 6 || !rule.startTime || !rule.endTime) continue;
      await client.query(
        `INSERT INTO coach_availability_rules (coach_user_id, arena_id, day_of_week, start_time, end_time, is_available)
         VALUES ($1, $2, $3, $4::time, $5::time, $6)`,
        [actor.id, actor.arena_id ?? null, dow, rule.startTime, rule.endTime, rule.isAvailable !== false]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getCoachAvailability(coachUserId);
}

export async function addCoachAvailabilityException(coachUserId, { date, startTime, endTime, isAvailable, reason }) {
  const actor = await requireActiveActor(coachUserId);
  if (!isCoachLike(actor)) throw new Error("Coach access required");
  if (!date) throw new Error("date is required");
  await pool.query(
    `INSERT INTO coach_availability_exceptions (coach_user_id, exception_date, start_time, end_time, is_available, reason)
     VALUES ($1, $2::date, $3, $4, $5, $6)`,
    [actor.id, date, startTime ?? null, endTime ?? null, isAvailable !== false, String(reason ?? "").trim() || null]
  );
  return getCoachAvailability(coachUserId);
}

export async function getCoachAvailableSlots(coachUserId, date) {
  if (!date) throw new Error("date is required");
  const d = new Date(date + "T00:00:00Z");
  const dow = d.getUTCDay();
  const [rulesRes, excRes, sessRes, profileRes] = await Promise.all([
    pool.query(
      `SELECT start_time, end_time FROM coach_availability_rules
       WHERE coach_user_id = $1 AND day_of_week = $2 AND is_available = true ORDER BY start_time`,
      [Number(coachUserId), dow]
    ),
    pool.query(
      `SELECT is_available, start_time, end_time FROM coach_availability_exceptions
       WHERE coach_user_id = $1 AND exception_date = $2::date`,
      [Number(coachUserId), date]
    ),
    pool.query(
      `SELECT start_time, end_time FROM coaching_sessions
       WHERE coach_user_id = $1 AND session_date = $2::date AND status = 'scheduled'`,
      [Number(coachUserId), date]
    ),
    pool.query(
      `SELECT max_sessions_per_day, session_duration_minutes, cooldown_minutes FROM coach_profiles WHERE user_id = $1`,
      [Number(coachUserId)]
    ),
  ]);
  const p = profileRes.rows[0];
  const SLOT = Math.max(15, Number(p?.session_duration_minutes) || 60);
  const maxPerDay = p?.max_sessions_per_day ? Number(p.max_sessions_per_day) : null;
  const cooldown = Math.max(0, Number(p?.cooldown_minutes) || 0);

  if (maxPerDay !== null && sessRes.rows.length >= maxPerDay) return [];

  let baseSlots;
  if (excRes.rows.length > 0) {
    const exc = excRes.rows[0];
    if (!exc.is_available) return [];
    baseSlots = exc.start_time && exc.end_time ? [exc] : rulesRes.rows;
  } else {
    baseSlots = rulesRes.rows;
  }
  if (!baseSlots.length) return [];

  const booked = sessRes.rows.map((s) => ({
    start: timeToMinutes(String(s.start_time).slice(0, 5)),
    end: timeToMinutes(String(s.end_time).slice(0, 5)) + cooldown,
  }));
  const slots = [];
  for (const base of baseSlots) {
    const sm = timeToMinutes(String(base.start_time).slice(0, 5));
    const em = timeToMinutes(String(base.end_time).slice(0, 5));
    if (sm === null || em === null) continue;
    for (let t = sm; t + SLOT <= em; t += SLOT) {
      const te = t + SLOT;
      if (!booked.some((b) => t < b.end && te > b.start)) {
        slots.push({ start: minutesToTime(t), end: minutesToTime(te) });
      }
    }
  }
  return slots;
}

// ── Coaching Requests ─────────────────────────────────────────────────────────

export async function createCoachingRequest(playerUserId, {
  coachUserId, arenaId, requestedDate, requestedStartTime,
  requestedEndTime, playersCount, message, preferredCourtId,
}) {
  const player = await requireActiveActor(playerUserId);
  const pc = Number(playersCount) || 1;
  if (pc < 1 || pc > 4) throw new Error("playersCount must be between 1 and 4");
  if (!requestedDate || !requestedStartTime || !requestedEndTime) throw new Error("Date and times are required");
  const slots = await getCoachAvailableSlots(Number(coachUserId), requestedDate);
  if (!slots.find((s) => s.start === requestedStartTime.slice(0, 5))) {
    throw new Error("The requested time slot is not available for this coach");
  }
  const { rows } = await pool.query(
    `INSERT INTO coaching_requests
       (player_user_id, coach_user_id, arena_id, requested_date, requested_start_time,
        requested_end_time, players_count, message, preferred_court_id)
     VALUES ($1,$2,$3,$4::date,$5::time,$6::time,$7,$8,$9) RETURNING *`,
    [player.id, Number(coachUserId), arenaId ? Number(arenaId) : null,
     requestedDate, requestedStartTime, requestedEndTime, pc, String(message ?? "").trim() || null,
     preferredCourtId ? Number(preferredCourtId) : null]
  );
  const req = rows[0];
  try {
    const coachUser = await findUserById(Number(coachUserId));
    if (coachUser) {
      await createNotification({
        userId: coachUser.id,
        title: "New coaching request",
        body: `${player.first_name} ${player.last_name} requested a session on ${requestedDate} at ${requestedStartTime.slice(0, 5)}`,
        type: "coaching_request_created",
        linkUrl: "/coach/requests",
      });
    }
  } catch (_) { /* non-critical */ }
  return normalizeCoachingRequest({ ...req, player_name: `${player.first_name} ${player.last_name}` });
}

export async function respondToCoachingRequest(coachUserId, requestId, {
  action, message, counterProposedDate, counterProposedStartTime, counterProposedEndTime,
}) {
  const coach = await requireActiveActor(coachUserId);
  if (!isCoachLike(coach)) throw new Error("Coach access required");
  const { rows } = await pool.query("SELECT * FROM coaching_requests WHERE id = $1", [Number(requestId)]);
  const req = rows[0];
  if (!req) throw new Error("Request not found");
  if (Number(req.coach_user_id) !== Number(coach.id)) throw new Error("This request is not for you");
  if (req.status !== "pending") throw new Error("Only pending requests can be responded to");
  const validActions = ["accept", "reject", "counter_propose"];
  if (!validActions.includes(action)) throw new Error("Invalid action");
  let newStatus;
  let session = null;
  if (action === "accept") {
    newStatus = "accepted";
    const { rows: sr } = await pool.query(
      `INSERT INTO coaching_sessions
         (coaching_request_id, player_user_id, coach_user_id, arena_id, session_date,
          start_time, end_time, players_count)
       VALUES ($1,$2,$3,$4,$5::date,$6::time,$7::time,$8) RETURNING *`,
      [req.id, req.player_user_id, req.coach_user_id, req.arena_id,
       req.requested_date, req.requested_start_time, req.requested_end_time, req.players_count]
    );
    session = sr[0];
    try { await createNotification({ userId: req.player_user_id, title: "Coaching request accepted", body: `${coach.first_name} ${coach.last_name} accepted your session for ${String(req.requested_date).slice(0, 10)}`, type: "coaching_request_accepted", linkUrl: "/coaching-requests" }); } catch (_) {}
  } else if (action === "reject") {
    newStatus = "rejected";
    try { await createNotification({ userId: req.player_user_id, title: "Coaching request declined", body: `${coach.first_name} ${coach.last_name} declined your session request`, type: "coaching_request_rejected", linkUrl: "/coaching-requests" }); } catch (_) {}
  } else {
    if (!counterProposedDate || !counterProposedStartTime || !counterProposedEndTime) throw new Error("Counter-proposal requires date and times");
    newStatus = "counter_proposed";
    try { await createNotification({ userId: req.player_user_id, title: "Coach proposed another time", body: `${coach.first_name} ${coach.last_name} proposed ${counterProposedDate} at ${counterProposedStartTime}`, type: "coaching_request_counter_proposed", linkUrl: "/coaching-requests" }); } catch (_) {}
  }
  const { rows: updated } = await pool.query(
    `UPDATE coaching_requests SET status=$1, coach_reply_message=$2,
       counter_proposed_date=$3, counter_proposed_start_time=$4, counter_proposed_end_time=$5,
       updated_at=NOW() WHERE id=$6 RETURNING *`,
    [newStatus, String(message ?? "").trim() || null,
     action === "counter_propose" ? counterProposedDate : null,
     action === "counter_propose" ? counterProposedStartTime : null,
     action === "counter_propose" ? counterProposedEndTime : null,
     req.id]
  );
  return { request: normalizeCoachingRequest(updated[0]), session: session ? normalizeCoachingSession(session) : null };
}

export async function listCoachingRequestsForCoach(coachUserId) {
  const { rows } = await pool.query(
    `SELECT cr.*, CONCAT(p.first_name,' ',p.last_name) AS player_name,
       CONCAT(c.first_name,' ',c.last_name) AS coach_name, a.name AS arena_name
     FROM coaching_requests cr
     JOIN users p ON p.id = cr.player_user_id
     JOIN users c ON c.id = cr.coach_user_id
     LEFT JOIN arenas a ON a.id = cr.arena_id
     WHERE cr.coach_user_id = $1 ORDER BY cr.created_at DESC`,
    [Number(coachUserId)]
  );
  return rows.map(normalizeCoachingRequest);
}

export async function listCoachingRequestsForPlayer(playerUserId) {
  const { rows } = await pool.query(
    `SELECT cr.*, CONCAT(p.first_name,' ',p.last_name) AS player_name,
       CONCAT(c.first_name,' ',c.last_name) AS coach_name,
       a.name AS arena_name, a.city AS arena_city,
       court.name AS court_name, court.court_type, court.surface_type,
       cp.headline AS coach_headline, cp.hourly_rate AS coach_hourly_rate
     FROM coaching_requests cr
     JOIN users p ON p.id = cr.player_user_id
     JOIN users c ON c.id = cr.coach_user_id
     LEFT JOIN arenas a ON a.id = cr.arena_id
     LEFT JOIN courts court ON court.id = cr.preferred_court_id
     LEFT JOIN coach_profiles cp ON cp.user_id = cr.coach_user_id
     WHERE cr.player_user_id = $1 ORDER BY cr.created_at DESC`,
    [Number(playerUserId)]
  );
  return rows.map(normalizeCoachingRequest);
}

export async function listCoachingSessionsForUser(userId) {
  const actor = await requireActiveActor(userId);
  const col = (isCoachLike(actor) && actor.effective_role !== "player") ? "coach_user_id" : "player_user_id";
  const { rows } = await pool.query(
    `SELECT cs.*, CONCAT(p.first_name,' ',p.last_name) AS player_name,
       CONCAT(c.first_name,' ',c.last_name) AS coach_name, a.name AS arena_name
     FROM coaching_sessions cs
     JOIN users p ON p.id = cs.player_user_id
     JOIN users c ON c.id = cs.coach_user_id
     LEFT JOIN arenas a ON a.id = cs.arena_id
     WHERE cs.${col} = $1
     ORDER BY cs.session_date DESC, cs.start_time DESC`,
    [actor.id]
  );
  return rows.map(normalizeCoachingSession);
}

export async function listAdminCoaches(actorUserId) {
  const actor = await requireActiveActor(actorUserId);
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  const params = [];
  const where = ["u.role = 'coach'"];
  if (actor.effective_role !== "super_admin") {
    params.push(actor.arena_id);
    where.push(`(cp.arena_id = $${params.length} OR am.arena_id = $${params.length})`);
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (u.id) cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
       a.name AS arena_name, a.city AS arena_city
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     LEFT JOIN arena_memberships am ON am.user_id = u.id AND am.role = 'coach'
     WHERE ${where.join(" AND ")} ORDER BY u.id, u.first_name`,
    params
  );
  return rows.map((r) => ({ ...normalizeCoachProfile(r), userStatus: r.user_status }));
}

export async function assignCoachToArena(actorUserId, coachUserId, arenaId) {
  const actor = await requireActiveActor(actorUserId);
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  if (actor.effective_role === "admin" && Number(actor.arena_id) !== Number(arenaId)) {
    throw new Error("You can only assign coaches to your own arena");
  }
  await pool.query(
    `INSERT INTO arena_memberships (arena_id, user_id, role, status) VALUES ($1,$2,'coach','active')
     ON CONFLICT (arena_id, user_id) DO UPDATE SET role='coach', status='active'`,
    [Number(arenaId), Number(coachUserId)]
  );
  await pool.query(
    `INSERT INTO coach_profiles (user_id, arena_id) VALUES ($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET arena_id=$2, updated_at=NOW()`,
    [Number(coachUserId), Number(arenaId)]
  );
}
