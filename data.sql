--
-- PostgreSQL database dump
--

-- Dumped from database version 17.3
-- Dumped by pg_dump version 17.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ai_analyses_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ai_analyses_status_enum AS ENUM (
    'queued',
    'processing',
    'completed'
);


ALTER TYPE public.ai_analyses_status_enum OWNER TO postgres;

--
-- Name: arena_memberships_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.arena_memberships_role_enum AS ENUM (
    'admin',
    'coach',
    'player'
);


ALTER TYPE public.arena_memberships_role_enum OWNER TO postgres;

--
-- Name: arena_memberships_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.arena_memberships_status_enum AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE public.arena_memberships_status_enum OWNER TO postgres;

--
-- Name: arena_subscriptions_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.arena_subscriptions_status_enum AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'paused'
);


ALTER TYPE public.arena_subscriptions_status_enum OWNER TO postgres;

--
-- Name: coach_player_relationships_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.coach_player_relationships_status_enum AS ENUM (
    'pending',
    'active',
    'paused',
    'ended',
    'rejected'
);


ALTER TYPE public.coach_player_relationships_status_enum OWNER TO postgres;

--
-- Name: competition_registrations_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.competition_registrations_status_enum AS ENUM (
    'registered',
    'cancelled'
);


ALTER TYPE public.competition_registrations_status_enum OWNER TO postgres;

--
-- Name: competitions_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.competitions_status_enum AS ENUM (
    'open',
    'full',
    'closed'
);


ALTER TYPE public.competitions_status_enum OWNER TO postgres;

--
-- Name: courts_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.courts_status_enum AS ENUM (
    'available',
    'occupied',
    'maintenance'
);


ALTER TYPE public.courts_status_enum OWNER TO postgres;

--
-- Name: matches_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.matches_status_enum AS ENUM (
    'upcoming',
    'live',
    'finished'
);


ALTER TYPE public.matches_status_enum OWNER TO postgres;

--
-- Name: reservations_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.reservations_status_enum AS ENUM (
    'confirmed',
    'cancelled'
);


ALTER TYPE public.reservations_status_enum OWNER TO postgres;

--
-- Name: training_sessions_session_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.training_sessions_session_type_enum AS ENUM (
    'individual',
    'group',
    'match_practice'
);


ALTER TYPE public.training_sessions_session_type_enum OWNER TO postgres;

--
-- Name: training_sessions_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.training_sessions_status_enum AS ENUM (
    'scheduled',
    'completed',
    'cancelled'
);


ALTER TYPE public.training_sessions_status_enum OWNER TO postgres;

--
-- Name: users_platform_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.users_platform_role_enum AS ENUM (
    'member',
    'super_admin'
);


ALTER TYPE public.users_platform_role_enum OWNER TO postgres;

--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.users_role_enum AS ENUM (
    'player',
    'coach',
    'admin'
);


ALTER TYPE public.users_role_enum OWNER TO postgres;

--
-- Name: users_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.users_status_enum AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE public.users_status_enum OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_logs (
    id integer NOT NULL,
    arena_id integer,
    actor_user_id integer,
    actor_name character varying(255),
    action character varying(100),
    detail text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.activity_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_analyses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_analyses (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(191) NOT NULL,
    video_name character varying(191) NOT NULL,
    status public.ai_analyses_status_enum DEFAULT 'queued'::public.ai_analyses_status_enum NOT NULL,
    summary text,
    created_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.ai_analyses OWNER TO postgres;

--
-- Name: ai_analyses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_analyses ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.ai_analyses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: arena_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.arena_memberships (
    id integer NOT NULL,
    arena_id integer NOT NULL,
    user_id integer NOT NULL,
    role public.arena_memberships_role_enum NOT NULL,
    status public.arena_memberships_status_enum DEFAULT 'active'::public.arena_memberships_status_enum NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.arena_memberships OWNER TO postgres;

--
-- Name: arena_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.arena_memberships ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.arena_memberships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: arena_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.arena_subscriptions (
    id integer NOT NULL,
    arena_id integer NOT NULL,
    plan_id integer NOT NULL,
    status public.arena_subscriptions_status_enum DEFAULT 'trialing'::public.arena_subscriptions_status_enum NOT NULL,
    provider character varying(24) DEFAULT 'manual'::character varying NOT NULL,
    provider_customer_id character varying(191),
    provider_subscription_id character varying(191),
    current_period_start timestamp(3) without time zone,
    current_period_end timestamp(3) without time zone,
    trial_end timestamp(3) without time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.arena_subscriptions OWNER TO postgres;

--
-- Name: arena_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.arena_subscriptions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.arena_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: arenas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.arenas (
    id integer NOT NULL,
    name character varying(191) NOT NULL,
    slug character varying(191) NOT NULL,
    location character varying(191) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.arenas OWNER TO postgres;

--
-- Name: arenas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.arenas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.arenas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: billing_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.billing_plans (
    id integer NOT NULL,
    code character varying(48) NOT NULL,
    name character varying(96) NOT NULL,
    max_admins integer NOT NULL,
    max_coaches integer NOT NULL,
    max_players integer NOT NULL,
    features_json jsonb,
    monthly_price_cents integer DEFAULT 0 NOT NULL,
    yearly_price_cents integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.billing_plans OWNER TO postgres;

--
-- Name: billing_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.billing_plans ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.billing_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: coach_player_relationships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coach_player_relationships (
    id integer NOT NULL,
    arena_id integer NOT NULL,
    coach_user_id integer NOT NULL,
    player_user_id integer NOT NULL,
    status public.coach_player_relationships_status_enum DEFAULT 'pending'::public.coach_player_relationships_status_enum NOT NULL,
    requested_by_user_id integer NOT NULL,
    responded_by_user_id integer,
    can_view_performance boolean DEFAULT true NOT NULL,
    can_view_reservations boolean DEFAULT true NOT NULL,
    can_schedule_sessions boolean DEFAULT true NOT NULL,
    can_view_notes boolean DEFAULT false NOT NULL,
    consent_version integer DEFAULT 1 NOT NULL,
    consent_granted_at timestamp(3) without time zone,
    start_date date NOT NULL,
    end_date date,
    notes text,
    responded_at timestamp(3) without time zone,
    last_reminder_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.coach_player_relationships OWNER TO postgres;

--
-- Name: coach_player_relationships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.coach_player_relationships ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.coach_player_relationships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: competition_registrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competition_registrations (
    id integer NOT NULL,
    competition_id integer NOT NULL,
    user_id integer NOT NULL,
    status public.competition_registrations_status_enum DEFAULT 'registered'::public.competition_registrations_status_enum NOT NULL,
    created_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.competition_registrations OWNER TO postgres;

--
-- Name: competition_registrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.competition_registrations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.competition_registrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: competitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competitions (
    id integer NOT NULL,
    arena_id integer NOT NULL,
    name character varying(191) NOT NULL,
    sport character varying(100) NOT NULL,
    description text,
    start_date date NOT NULL,
    location character varying(191) NOT NULL,
    max_participants integer NOT NULL,
    status public.competitions_status_enum DEFAULT 'open'::public.competitions_status_enum NOT NULL,
    created_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.competitions OWNER TO postgres;

--
-- Name: competitions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.competitions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.competitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: courts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.courts (
    id integer NOT NULL,
    arena_id integer NOT NULL,
    name character varying(191) NOT NULL,
    sport character varying(100) NOT NULL,
    status public.courts_status_enum NOT NULL,
    has_summa boolean DEFAULT false NOT NULL,
    location character varying(191) NOT NULL,
    min_players integer DEFAULT 2 NOT NULL,
    max_players integer DEFAULT 4 NOT NULL,
    opening_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    closing_time time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    created_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.courts OWNER TO postgres;

--
-- Name: courts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.courts ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.courts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matches (
    id integer NOT NULL,
    reservation_id integer,
    court_id integer,
    arena_id integer,
    team1_player1_id integer,
    team1_player2_id integer,
    team2_player1_id integer,
    team2_player2_id integer,
    score1 jsonb,
    score2 jsonb,
    winner_team integer,
    status public.matches_status_enum DEFAULT 'upcoming'::public.matches_status_enum,
    scheduled_at timestamp without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.matches OWNER TO postgres;

--
-- Name: matches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.matches ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.matches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_tokens (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO postgres;

--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.password_reset_tokens_id_seq OWNER TO postgres;

--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: performance_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.performance_profiles (
    id integer NOT NULL,
    user_id integer,
    skill_power integer DEFAULT 50,
    skill_speed integer DEFAULT 50,
    skill_stamina integer DEFAULT 50,
    skill_technique integer DEFAULT 50,
    skill_tactics integer DEFAULT 50,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.performance_profiles OWNER TO postgres;

--
-- Name: performance_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.performance_profiles ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.performance_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: performance_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.performance_snapshots (
    id integer NOT NULL,
    user_id integer,
    ranking_score integer DEFAULT 1000,
    wins integer DEFAULT 0,
    losses integer DEFAULT 0,
    matches_this_month integer DEFAULT 0,
    streak character varying(20) DEFAULT '-'::character varying,
    snapshot_date date,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.performance_snapshots OWNER TO postgres;

--
-- Name: performance_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.performance_snapshots ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.performance_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reservation_participants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservation_participants (
    id integer NOT NULL,
    reservation_id integer NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.reservation_participants OWNER TO postgres;

--
-- Name: reservation_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.reservation_participants ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.reservation_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    court_id integer NOT NULL,
    reservation_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    status public.reservations_status_enum DEFAULT 'confirmed'::public.reservations_status_enum NOT NULL,
    qr_token character(36) NOT NULL,
    notes text,
    created_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.reservations OWNER TO postgres;

--
-- Name: reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.reservations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: training_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.training_sessions (
    id integer NOT NULL,
    arena_id integer NOT NULL,
    coach_user_id integer NOT NULL,
    reservation_id integer NOT NULL,
    session_type public.training_sessions_session_type_enum DEFAULT 'individual'::public.training_sessions_session_type_enum NOT NULL,
    title character varying(191) NOT NULL,
    focus_areas text,
    notes text,
    status public.training_sessions_status_enum DEFAULT 'scheduled'::public.training_sessions_status_enum NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.training_sessions OWNER TO postgres;

--
-- Name: training_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.training_sessions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.training_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(191) NOT NULL,
    phone character varying(20),
    photo_url text,
    password_hash character varying(255) NOT NULL,
    role public.users_role_enum NOT NULL,
    platform_role public.users_platform_role_enum DEFAULT 'member'::public.users_platform_role_enum NOT NULL,
    status public.users_status_enum DEFAULT 'active'::public.users_status_enum NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    cin_number character varying(32)
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_logs (id, arena_id, actor_user_id, actor_name, action, detail, created_at) FROM stdin;
1	2	12	Coach Test	Nouveau compte	Role: coach	2026-04-07 10:35:34.792
2	4	13	Arena Admin	Nouveau compte	Role: admin	2026-04-07 14:33:34.333
3	4	14	Ryad Coach	Nouveau compte	Role: coach	2026-04-07 14:33:34.542
4	4	15	Nour Player	Nouveau compte	Role: player	2026-04-07 14:33:34.815
5	4	16	Ines Player	Nouveau compte	Role: player	2026-04-07 14:33:34.927
6	2	9	Achref Ayadi	Reservation confirmee	Terrain taa wedhni A - 2026-04-25 10:00-11:30	2026-04-07 18:29:01.59
7	2	17	Client Lhaj	Nouveau compte	Role: player	2026-04-08 11:32:03.318
8	2	5	Aziz Ferchichi	Reservation annulee (admin)	Terrain taa wedhni A - Sat Apr 25 2026 00:00:00 GMT+0000 (Coordinated Universal Time) 10:00	2026-04-08 11:33:17.756
\.


--
-- Data for Name: ai_analyses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_analyses (id, user_id, title, video_name, status, summary, created_at) FROM stdin;
1	1	Analyse Match Demo	match-demo.mp4	completed	Heatmaps generees, patterns de deplacement detectes et recommandations pretes.	2026-04-02 18:02:54.852
\.


--
-- Data for Name: arena_memberships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.arena_memberships (id, arena_id, user_id, role, status, created_at) FROM stdin;
1	1	1	player	active	2026-04-04 12:46:26.412
2	1	3	player	active	2026-04-04 12:46:26.412
3	1	6	coach	active	2026-04-04 12:46:26.412
4	1	2	admin	active	2026-04-04 12:46:26.412
5	1	4	player	active	2026-04-04 12:46:26.412
8	2	7	admin	active	2026-04-04 21:57:45.774
9	2	8	player	active	2026-04-04 22:24:10.652
10	2	9	player	active	2026-04-04 22:24:47.077
11	1	10	player	active	2026-04-05 19:18:01.635
12	3	11	admin	active	2026-04-05 19:22:15.513
13	2	12	coach	active	2026-04-07 10:35:34.779
14	4	13	admin	active	2026-04-07 14:33:34.332
15	4	14	coach	active	2026-04-07 14:33:34.542
16	4	15	player	active	2026-04-07 14:33:34.814
17	4	16	player	active	2026-04-07 14:33:34.925
18	2	17	player	active	2026-04-08 11:32:03.284
19	2	18	player	active	2026-04-12 14:04:03.378
\.


--
-- Data for Name: arena_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.arena_subscriptions (id, arena_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, current_period_start, current_period_end, trial_end, cancel_at_period_end, created_at, updated_at) FROM stdin;
1	4	1	trialing	manual	\N	\N	2026-04-07 14:33:34.159	2026-05-07 14:33:34.159	2026-04-21 14:33:34.159	f	2026-04-07 14:33:34.159	2026-04-07 14:33:34.159
2	2	1	trialing	manual	\N	\N	2026-04-07 18:30:16.528	2026-05-07 18:30:16.528	2026-04-21 18:30:16.528	f	2026-04-07 18:30:16.528	2026-04-07 18:30:16.528
\.


--
-- Data for Name: arenas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.arenas (id, name, slug, location, created_at) FROM stdin;
1	ULTIMA Arena	ultima-arena	La Marsa	2026-04-04 12:46:20.431
2	Salle de Sport weld lhaj	salle-de-sport-weld-lhaj	Plateforme ULTIMA	2026-04-04 21:57:45.762
3	Salle Gammar ElDin	salle-gammar-eldin	Plateforme ULTIMA	2026-04-05 19:22:15.495
4	ULTIMA Arena Test Lab	ultima-arena-test-lab	Demo City	2026-04-07 14:33:34.139
\.


--
-- Data for Name: billing_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.billing_plans (id, code, name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents, is_active, created_at, updated_at) FROM stdin;
1	starter	Starter	1	2	50	{"liveScores": true, "smartPlayAi": false, "competitions": true}	9900	99000	t	2026-04-07 14:33:34.113	2026-04-07 14:33:34.113
2	pro	Pro	3	10	300	{"liveScores": true, "smartPlayAi": true, "competitions": true}	29900	299000	t	2026-04-07 14:33:34.113	2026-04-07 14:33:34.113
3	elite	Elite	10	30	2000	{"liveScores": true, "smartPlayAi": true, "competitions": true, "prioritySupport": true}	79900	799000	t	2026-04-07 14:33:34.113	2026-04-07 14:33:34.113
\.


--
-- Data for Name: coach_player_relationships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coach_player_relationships (id, arena_id, coach_user_id, player_user_id, status, requested_by_user_id, responded_by_user_id, can_view_performance, can_view_reservations, can_schedule_sessions, can_view_notes, consent_version, consent_granted_at, start_date, end_date, notes, responded_at, last_reminder_at, created_at, updated_at) FROM stdin;
1	4	14	15	active	15	\N	t	t	t	f	1	2026-04-07 14:33:34.943	2026-04-07	2026-04-12	Active test link (expires soon for reminder testing)	\N	\N	2026-04-07 14:33:34.943	2026-04-07 14:33:34.943
2	4	14	16	pending	16	\N	t	t	t	f	1	\N	2026-04-07	\N	Pending test request	\N	\N	2026-04-07 14:33:34.955	2026-04-07 14:33:34.955
\.


--
-- Data for Name: competition_registrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.competition_registrations (id, competition_id, user_id, status, created_at) FROM stdin;
1	1	1	registered	2026-04-02 18:02:54.852
2	1	2	registered	2026-04-02 18:02:54.852
3	1	3	registered	2026-04-02 18:02:54.852
4	1	4	registered	2026-04-02 18:02:54.852
5	2	1	registered	2026-04-02 18:02:54.852
6	2	2	registered	2026-04-02 18:02:54.852
7	2	3	registered	2026-04-02 18:02:54.852
8	2	4	registered	2026-04-02 18:02:54.852
9	3	1	registered	2026-04-02 18:02:54.852
10	3	2	registered	2026-04-02 18:02:54.852
11	3	3	registered	2026-04-02 18:02:54.852
12	3	4	registered	2026-04-02 18:02:54.852
13	4	1	registered	2026-04-02 18:02:54.852
14	4	2	registered	2026-04-02 18:02:54.852
15	4	3	registered	2026-04-02 18:02:54.852
16	4	4	registered	2026-04-02 18:02:54.852
\.


--
-- Data for Name: competitions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.competitions (id, arena_id, name, sport, description, start_date, location, max_participants, status, created_at) FROM stdin;
1	1	Tournoi Padel Printemps 2026	Padel	Tournoi de demonstration ULTIMA pour les joueurs confirmes.	2026-03-15	ULTIMA Arena	32	open	2026-04-02 18:02:54.852
2	1	Open Tennis La Marsa	Tennis	Competition open avec diffusion des scores en direct.	2026-04-22	Court Central	32	open	2026-04-02 18:02:54.852
3	1	Championnat Interclubs	Padel & Tennis	Tournoi complet reserve aux clubs partenaires.	2026-05-10	ULTIMA Arena	32	full	2026-04-02 18:02:54.852
4	1	Tournoi Junior Padel	Padel	Competition junior dediee a la detection de talents.	2026-06-05	Terrain B	16	open	2026-04-02 18:02:54.852
\.


--
-- Data for Name: courts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.courts (id, arena_id, name, sport, status, has_summa, location, min_players, max_players, opening_time, closing_time, created_at) FROM stdin;
1	1	Terrain Padel A	Padel	available	f	ULTIMA Arena	2	4	08:00:00	22:00:00	2026-04-02 18:02:54.851
2	1	Terrain Padel B	Padel	available	f	ULTIMA Arena	2	4	08:00:00	22:00:00	2026-04-02 18:02:54.851
3	1	Terrain Tennis 1	Tennis	occupied	f	Court Central	2	4	08:00:00	22:00:00	2026-04-02 18:02:54.851
4	1	Terrain Tennis 2	Tennis	available	f	Court Central	2	4	08:00:00	22:00:00	2026-04-02 18:02:54.851
5	1	Terrain Padel C (SUMMA)	Padel	available	t	ULTIMA Arena	2	4	08:00:00	22:00:00	2026-04-02 18:02:54.852
6	1	Terrain Tennis 3 (SUMMA)	Tennis	available	t	Court Central	2	4	08:00:00	22:00:00	2026-04-02 18:02:54.852
7	2	Terrain taa wedhni A	Padel	available	t	Salle de Sport weld lhaj	2	4	08:00:00	22:00:00	2026-04-04 22:22:54.198
\.


--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.matches (id, reservation_id, court_id, arena_id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, score1, score2, winner_team, status, scheduled_at, created_at) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_tokens (id, user_id, token, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: performance_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.performance_profiles (id, user_id, skill_power, skill_speed, skill_stamina, skill_technique, skill_tactics, updated_at) FROM stdin;
\.


--
-- Data for Name: performance_snapshots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.performance_snapshots (id, user_id, ranking_score, wins, losses, matches_this_month, streak, snapshot_date, created_at) FROM stdin;
\.


--
-- Data for Name: reservation_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservation_participants (id, reservation_id, user_id, created_at) FROM stdin;
1	2	1	2026-04-04 12:46:26.559
2	1	5	2026-04-04 12:46:26.559
3	3	5	2026-04-04 12:46:26.559
4	4	6	2026-04-04 12:46:26.559
8	5	8	2026-04-04 22:28:05.179
9	5	9	2026-04-04 22:28:05.195
10	6	8	2026-04-05 14:59:44.587
11	6	9	2026-04-05 14:59:44.589
12	7	10	2026-04-05 19:20:10.212
13	7	4	2026-04-05 19:20:10.214
14	8	9	2026-04-07 18:29:01.575
15	8	8	2026-04-07 18:29:01.585
\.


--
-- Data for Name: reservations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservations (id, user_id, court_id, reservation_date, start_time, end_time, status, qr_token, notes, created_at) FROM stdin;
1	5	1	2026-04-10	15:30:00	17:00:00	cancelled	214fe197-f225-4588-acb2-6722f570a8a2		2026-04-02 18:12:19.858
2	1	1	2004-05-11	17:00:00	18:30:00	cancelled	232a87b3-8908-4c20-94b9-2af4767195e6		2026-04-02 18:49:25.552
3	5	1	2025-01-01	08:00:00	09:30:00	cancelled	4bf73247-224f-4ee5-8fec-dcd0b2378e7a		2026-04-02 18:56:22.101
4	6	5	2026-04-03	08:00:00	09:30:00	cancelled	61fb38dc-4960-4d2c-acbd-0da3f5d4272c		2026-04-02 19:05:29.386
5	9	7	2026-04-09	11:30:00	13:00:00	confirmed	9fed8393-71fd-45a8-ab63-318acfe62bfd		2026-04-04 22:28:05.178
6	9	7	2026-04-08	11:30:00	13:00:00	confirmed	bf443834-4a8c-48de-95f9-3438ad48cfb9		2026-04-05 14:59:44.581
7	10	1	2026-04-08	08:30:00	10:00:00	confirmed	962a9841-4528-427b-a27d-9728899af0bd		2026-04-05 19:20:10.209
8	9	7	2026-04-25	10:00:00	11:30:00	cancelled	27fbd642-1b67-4b4b-8d79-7eed4b575dcb		2026-04-07 18:29:01.556
\.


--
-- Data for Name: training_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.training_sessions (id, arena_id, coach_user_id, reservation_id, session_type, title, focus_areas, notes, status, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, first_name, last_name, email, phone, photo_url, password_hash, role, platform_role, status, created_at, cin_number) FROM stdin;
5	Aziz	Ferchichi	aziz@email.com	\N	\N	$2b$10$k5R6s63aUjWiMRHpWV76v.1k6WgR1nKWDHPRj0Nr0NYXUoEHNGKre	admin	super_admin	active	2026-04-02 18:02:54.851	\N
7	Admin	Salle de Sport weld lhaj	lhaj@gmail.com	\N	\N	$2b$10$hP3teEz.SUWtR0SckvRJ8eAvpLYcybuUXgh7dSuJstJNGxeiE2mBa	admin	member	active	2026-04-04 21:57:45.774	\N
11	Admin	Salle Gammar ElDin	salle123@gmail.com	\N	\N	$2b$10$cqTsysdaZm074kjcU4Lq1O5KJsShoO8g7AxIY3EBFGtCmDC2hIJru	admin	member	active	2026-04-05 19:22:15.513	\N
13	Arena	Admin	admin@ultima-arena.test	\N	\N	$2b$10$MJSHORthS2/Bv.XXgY7Fdul.w490DqwYqSFsUJEmkPhVvLliIXHuS	admin	member	active	2026-04-07 14:33:34.331	\N
1	Ahmed	Bouazizi	ahmed@email.com	\N	\N	$2b$10$o3uQcXa5CZKz8fpHmsw4nO3NrSnNtoK4ijqkxWTlpaee4oH4.VKaG	player	member	active	2026-04-02 18:02:54.33	00000001
2	Imed	Trabelsi	sami@email.com	\N	\N	$2b$10$wS82IslNVJ4npYfocISd9exulsDWTmuQJ10ptDBxTdNIFUP2.BRAq	coach	member	active	2026-04-02 18:02:54.459	00000002
3	Meryam	Trbsli	mariem@email.com	\N	\N	$2b$10$F8SydrXWOrtb2ooWFxxfjui/QV5a72zfQOutlymkNlNohK6ZRklh6	player	member	active	2026-04-02 18:02:54.591	00000003
4	Youssef	Khelifi	youssef@email.com	\N	\N	$2b$10$Pmk5bKMDtfE0c2.ZpbZPJeVqpwUCBTpuf3ZkgXsRRQvEsSrrRYJqy	player	member	active	2026-04-02 18:02:54.722	00000004
6	NotFerchichi	NotAziz	Notaziz@email.com	\N	\N	$2b$10$I4FlnmpzIQJyUO60oCse/OWVjoPRUS9ysyJAQn.sJ6ZHzZ8M1kZCG	coach	member	active	2026-04-02 19:04:31.023	00000006
8	Wassim	Ayadi	wassim@gmail.com	\N	\N	$2b$10$Kjyj1n6jUyvg7J0y.FVV.OJMltuAwroV4SfhNKxnQGPpMEJVMVcZC	player	member	active	2026-04-04 22:24:10.65	00000008
9	Achref	Ayadi	achref@gmail.com	\N	\N	$2b$10$b8D5tlYZYPOmAVgux.irnOMCBcPxAETJAS4GE4H7G/PQPFzPK5g.6	player	member	active	2026-04-04 22:24:47.076	00000009
10	Emna	Ferchichi	emna@gmail.com	\N	\N	$2b$10$pVWx6OHX7vOFdppZwqAxfe7j1xGrjdNNu1DAOG7cDX2w0if18zeJy	player	member	active	2026-04-05 19:18:01.632	00000010
12	Coach	Test	coach@gmail.com	\N	\N	$2b$10$eMd284NCQG6tMJ7g8PvAwuW0RERQP/7xhOcpyZvzTjfVsdyPecjA6	coach	member	active	2026-04-07 10:35:34.74	00000012
14	Ryad	Coach	coach@ultima-arena.test	\N	\N	$2b$10$/j5umAgqDwwVg24jQ/w33.LJW6PnbFMJYWxfiVA5P3D7zc3X99Xmy	coach	member	active	2026-04-07 14:33:34.541	00000014
15	Nour	Player	player1@ultima-arena.test	\N	\N	$2b$10$G5H67DU1Og/IIiXZmkgnqet16.2ASMdVnsoLbQe4tFPNhffjA0TdW	player	member	active	2026-04-07 14:33:34.812	00000015
16	Ines	Player	player2@ultima-arena.test	\N	\N	$2b$10$vZ/1al/BT5cfzRbFchr1Tu42yGlz36k4K2X.y36rxHzZJUDrz1GAW	player	member	active	2026-04-07 14:33:34.924	00000016
17	Client	Lhaj	samir@gmail.com	\N	\N	$2b$10$a8giNvuc/dK9bNp4vTOAI.WGWvxg7FglFpckal7h6aQQx5qgkBLz2	player	member	active	2026-04-08 11:32:03.279	00000017
18	Jesus	Christ	jesus@gmail.com	\N	\N	$2b$10$508UpVRLXSvuUBVXcoCtjOb8qVOlaBHTbhM57SsfySS28yKfgCcey	player	member	active	2026-04-12 14:04:03.378	11111111
\.


--
-- Name: activity_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.activity_logs_id_seq', 8, true);


--
-- Name: ai_analyses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ai_analyses_id_seq', 1, true);


--
-- Name: arena_memberships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.arena_memberships_id_seq', 19, true);


--
-- Name: arena_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.arena_subscriptions_id_seq', 2, true);


--
-- Name: arenas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.arenas_id_seq', 4, true);


--
-- Name: billing_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.billing_plans_id_seq', 3, true);


--
-- Name: coach_player_relationships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.coach_player_relationships_id_seq', 2, true);


--
-- Name: competition_registrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.competition_registrations_id_seq', 16, true);


--
-- Name: competitions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.competitions_id_seq', 4, true);


--
-- Name: courts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.courts_id_seq', 7, true);


--
-- Name: matches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.matches_id_seq', 1, true);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.password_reset_tokens_id_seq', 1, false);


--
-- Name: performance_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.performance_profiles_id_seq', 1, true);


--
-- Name: performance_snapshots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.performance_snapshots_id_seq', 1, true);


--
-- Name: reservation_participants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reservation_participants_id_seq', 15, true);


--
-- Name: reservations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reservations_id_seq', 8, true);


--
-- Name: training_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.training_sessions_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 18, true);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_analyses ai_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_analyses
    ADD CONSTRAINT ai_analyses_pkey PRIMARY KEY (id);


--
-- Name: arena_memberships arena_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.arena_memberships
    ADD CONSTRAINT arena_memberships_pkey PRIMARY KEY (id);


--
-- Name: arena_subscriptions arena_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.arena_subscriptions
    ADD CONSTRAINT arena_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: arenas arenas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.arenas
    ADD CONSTRAINT arenas_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (id);


--
-- Name: coach_player_relationships coach_player_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_player_relationships
    ADD CONSTRAINT coach_player_relationships_pkey PRIMARY KEY (id);


--
-- Name: competition_registrations competition_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_registrations
    ADD CONSTRAINT competition_registrations_pkey PRIMARY KEY (id);


--
-- Name: competitions competitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_pkey PRIMARY KEY (id);


--
-- Name: courts courts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: performance_profiles performance_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_profiles
    ADD CONSTRAINT performance_profiles_pkey PRIMARY KEY (id);


--
-- Name: performance_snapshots performance_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_snapshots
    ADD CONSTRAINT performance_snapshots_pkey PRIMARY KEY (id);


--
-- Name: reservation_participants reservation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservation_participants
    ADD CONSTRAINT reservation_participants_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: training_sessions training_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_sessions
    ADD CONSTRAINT training_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_password_reset_tokens_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_reset_tokens_expires ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_password_reset_tokens_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_reset_tokens_user ON public.password_reset_tokens USING btree (user_id);


--
-- Name: ix_activity_logs__actor_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_activity_logs__actor_user_id ON public.activity_logs USING btree (actor_user_id);


--
-- Name: ix_activity_logs__arena_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_activity_logs__arena_id ON public.activity_logs USING btree (arena_id);


--
-- Name: ix_ai_analyses__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_ai_analyses__user_id ON public.ai_analyses USING btree (user_id);


--
-- Name: ix_arena_memberships__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_arena_memberships__user_id ON public.arena_memberships USING btree (user_id);


--
-- Name: ix_arena_subscriptions__arena_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_arena_subscriptions__arena_id ON public.arena_subscriptions USING btree (arena_id);


--
-- Name: ix_arena_subscriptions__provider__provider_customer_id__provide; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_arena_subscriptions__provider__provider_customer_id__provide ON public.arena_subscriptions USING btree (provider, provider_customer_id, provider_subscription_id);


--
-- Name: ix_coach_player_relationships__arena_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_coach_player_relationships__arena_id ON public.coach_player_relationships USING btree (arena_id);


--
-- Name: ix_coach_player_relationships__coach_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_coach_player_relationships__coach_user_id ON public.coach_player_relationships USING btree (coach_user_id);


--
-- Name: ix_coach_player_relationships__player_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_coach_player_relationships__player_user_id ON public.coach_player_relationships USING btree (player_user_id);


--
-- Name: ix_coach_player_relationships__status__start_date__end_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_coach_player_relationships__status__start_date__end_date ON public.coach_player_relationships USING btree (status, start_date, end_date);


--
-- Name: ix_competition_registrations__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_competition_registrations__user_id ON public.competition_registrations USING btree (user_id);


--
-- Name: ix_competitions__arena_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_competitions__arena_id ON public.competitions USING btree (arena_id);


--
-- Name: ix_courts__arena_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_courts__arena_id ON public.courts USING btree (arena_id);


--
-- Name: ix_matches__arena_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_matches__arena_id ON public.matches USING btree (arena_id);


--
-- Name: ix_matches__court_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_matches__court_id ON public.matches USING btree (court_id);


--
-- Name: ix_performance_snapshots__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_performance_snapshots__user_id ON public.performance_snapshots USING btree (user_id);


--
-- Name: ix_reservation_participants__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reservation_participants__user_id ON public.reservation_participants USING btree (user_id);


--
-- Name: ix_reservations__court_id__reservation_date__start_time__end_ti; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reservations__court_id__reservation_date__start_time__end_ti ON public.reservations USING btree (court_id, reservation_date, start_time, end_time);


--
-- Name: ix_reservations__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reservations__user_id ON public.reservations USING btree (user_id);


--
-- Name: ix_training_sessions__arena_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_training_sessions__arena_id ON public.training_sessions USING btree (arena_id);


--
-- Name: ix_training_sessions__coach_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_training_sessions__coach_user_id ON public.training_sessions USING btree (coach_user_id);


--
-- Name: ix_training_sessions__reservation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_training_sessions__reservation_id ON public.training_sessions USING btree (reservation_id);


--
-- Name: uq_users_cin_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_users_cin_number ON public.users USING btree (cin_number) WHERE (cin_number IS NOT NULL);


--
-- Name: ux_arena_memberships__arena_id__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_arena_memberships__arena_id__user_id ON public.arena_memberships USING btree (arena_id, user_id);


--
-- Name: ux_arenas__slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_arenas__slug ON public.arenas USING btree (slug);


--
-- Name: ux_billing_plans__code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_billing_plans__code ON public.billing_plans USING btree (code);


--
-- Name: ux_coach_player_relationships__coach_user_id__player_user_id__s; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_coach_player_relationships__coach_user_id__player_user_id__s ON public.coach_player_relationships USING btree (coach_user_id, player_user_id, start_date, end_date);


--
-- Name: ux_competition_registrations__competition_id__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_competition_registrations__competition_id__user_id ON public.competition_registrations USING btree (competition_id, user_id);


--
-- Name: ux_courts__name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_courts__name ON public.courts USING btree (name);


--
-- Name: ux_matches__reservation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_matches__reservation_id ON public.matches USING btree (reservation_id);


--
-- Name: ux_performance_profiles__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_performance_profiles__user_id ON public.performance_profiles USING btree (user_id);


--
-- Name: ux_reservation_participants__reservation_id__user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_reservation_participants__reservation_id__user_id ON public.reservation_participants USING btree (reservation_id, user_id);


--
-- Name: ux_reservations__qr_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_reservations__qr_token ON public.reservations USING btree (qr_token);


--
-- Name: ux_users__email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_users__email ON public.users USING btree (email);


--
-- Name: arena_subscriptions trg_arena_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_arena_subscriptions_updated_at BEFORE UPDATE ON public.arena_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: billing_plans trg_billing_plans_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_billing_plans_updated_at BEFORE UPDATE ON public.billing_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: coach_player_relationships trg_coach_player_relationships_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_coach_player_relationships_updated_at BEFORE UPDATE ON public.coach_player_relationships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: performance_profiles trg_performance_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_performance_profiles_updated_at BEFORE UPDATE ON public.performance_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_logs activity_logs_ibfk_1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_ibfk_1 FOREIGN KEY (arena_id) REFERENCES public.arenas(id);


--
-- Name: activity_logs activity_logs_ibfk_2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_ibfk_2 FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: ai_analyses fk_ai_analyses_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_analyses
    ADD CONSTRAINT fk_ai_analyses_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: arena_memberships fk_arena_memberships_arena; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.arena_memberships
    ADD CONSTRAINT fk_arena_memberships_arena FOREIGN KEY (arena_id) REFERENCES public.arenas(id);


--
-- Name: arena_memberships fk_arena_memberships_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.arena_memberships
    ADD CONSTRAINT fk_arena_memberships_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: competition_registrations fk_competition_registrations_competition; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_registrations
    ADD CONSTRAINT fk_competition_registrations_competition FOREIGN KEY (competition_id) REFERENCES public.competitions(id);


--
-- Name: competition_registrations fk_competition_registrations_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_registrations
    ADD CONSTRAINT fk_competition_registrations_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: competitions fk_competitions_arena; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT fk_competitions_arena FOREIGN KEY (arena_id) REFERENCES public.arenas(id);


--
-- Name: courts fk_courts_arena; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT fk_courts_arena FOREIGN KEY (arena_id) REFERENCES public.arenas(id);


--
-- Name: reservation_participants fk_reservation_participants_reservation; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservation_participants
    ADD CONSTRAINT fk_reservation_participants_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;


--
-- Name: reservation_participants fk_reservation_participants_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservation_participants
    ADD CONSTRAINT fk_reservation_participants_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: reservations fk_reservations_court; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT fk_reservations_court FOREIGN KEY (court_id) REFERENCES public.courts(id);


--
-- Name: reservations fk_reservations_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: matches matches_ibfk_1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_ibfk_1 FOREIGN KEY (reservation_id) REFERENCES public.reservations(id);


--
-- Name: matches matches_ibfk_2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_ibfk_2 FOREIGN KEY (court_id) REFERENCES public.courts(id);


--
-- Name: matches matches_ibfk_3; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_ibfk_3 FOREIGN KEY (arena_id) REFERENCES public.arenas(id);


--
-- Name: performance_profiles performance_profiles_ibfk_1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_profiles
    ADD CONSTRAINT performance_profiles_ibfk_1 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: performance_snapshots performance_snapshots_ibfk_1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_snapshots
    ADD CONSTRAINT performance_snapshots_ibfk_1 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

