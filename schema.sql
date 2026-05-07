-- London Pub Finder MVP database schema
-- PostgreSQL 15+

create extension if not exists "uuid-ossp";
create extension if not exists cube;
create extension if not exists earthdistance;

create table admin_users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  display_name text not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pubs (
  id uuid primary key default uuid_generate_v4(),
  google_place_id text unique,
  name text not null,
  address text not null,
  area text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  website_url text,
  google_maps_url text,
  google_rating numeric(2, 1) check (google_rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  price_level smallint check (price_level between 0 and 4),
  estimated_pint_price numeric(4, 2),
  transit_score smallint not null default 6 check (transit_score between 1 and 10),
  opening_hours jsonb not null default '{}'::jsonb,
  open_now boolean,
  review_sentiment text,
  review_themes text[] not null default '{}',
  review_concerns text[] not null default '{}',
  busy_base text not null default 'moderate' check (busy_base in ('quiet', 'moderate', 'busy')),
  centrality_score smallint not null default 5 check (centrality_score between 1 and 10),
  quiz_day smallint check (quiz_day between 0 and 6),
  sports_pull smallint not null default 1 check (sports_pull between 0 and 3),
  roast_pull smallint not null default 1 check (roast_pull between 0 and 3),
  admin_notes text,
  last_google_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pubs_area_idx on pubs (area);
create index pubs_rating_idx on pubs (google_rating desc, review_count desc);
create index pubs_location_earth_idx on pubs using gist (ll_to_earth(latitude::float8, longitude::float8));

create table pub_features (
  pub_id uuid primary key references pubs(id) on delete cascade,
  sunday_roast boolean not null default false,
  dog_friendly boolean not null default false,
  beer_garden boolean not null default false,
  pub_quiz boolean not null default false,
  live_music boolean not null default false,
  craft_beer boolean not null default false,
  dart_board boolean not null default false,
  pool_table boolean not null default false,
  showing_football boolean not null default false,
  updated_by uuid references admin_users(id),
  updated_at timestamptz not null default now()
);

create table pub_feature_audit (
  id uuid primary key default uuid_generate_v4(),
  pub_id uuid not null references pubs(id) on delete cascade,
  changed_by uuid references admin_users(id),
  changed_fields jsonb not null,
  previous_values jsonb not null default '{}'::jsonb,
  next_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table search_sessions (
  id uuid primary key default uuid_generate_v4(),
  share_token text unique,
  meetup_style text not null default 'middle'
    check (meetup_style in ('middle', 'best', 'closest_me', 'closest_person', 'near_area')),
  selected_person_id uuid,
  target_area_input text,
  target_latitude numeric(9, 6),
  target_longitude numeric(9, 6),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table search_people (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references search_sessions(id) on delete cascade,
  display_name text not null,
  location_input text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  transit_score smallint not null default 6 check (transit_score between 1 and 10),
  created_at timestamptz not null default now()
);

create index search_people_session_idx on search_people (session_id);

create table recommendation_results (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references search_sessions(id) on delete cascade,
  pub_id uuid not null references pubs(id) on delete cascade,
  rank integer not null,
  total_score numeric(5, 2) not null,
  travel_score numeric(5, 2) not null,
  preference_score numeric(5, 2) not null,
  rating_score numeric(5, 2) not null,
  opening_score numeric(5, 2) not null,
  busyness_score numeric(5, 2) not null,
  average_travel_time_minutes integer not null,
  max_travel_time_minutes integer not null,
  travel_times jsonb not null,
  matched_preferences text[] not null default '{}',
  missing_preferences text[] not null default '{}',
  explanation text not null,
  created_at timestamptz not null default now(),
  unique (session_id, pub_id)
);

create index recommendation_results_session_rank_idx on recommendation_results (session_id, rank);

create table pub_crowd_reports (
  id uuid primary key default uuid_generate_v4(),
  pub_id uuid not null references pubs(id) on delete cascade,
  session_id uuid references search_sessions(id) on delete set null,
  reported_level text not null check (reported_level in ('quiet', 'moderate', 'packed')),
  reported_at timestamptz not null default now()
);

create table pub_votes (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references search_sessions(id) on delete cascade,
  pub_id uuid not null references pubs(id) on delete cascade,
  voter_name text not null,
  vote_value smallint not null default 1 check (vote_value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (session_id, pub_id, voter_name)
);
