-- VNSVault Database Schema
-- Run this on your Aiven PostgreSQL instance

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username    VARCHAR(50) UNIQUE NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_url  TEXT,
  -- VIP: vip_permanent=TRUE means "never expires" regardless of
  -- vip_expires_at. Otherwise the account is VIP only while
  -- vip_expires_at IS NOT NULL AND vip_expires_at > NOW(). See
  -- src/lib/vip.ts for the single source of truth on this logic.
  vip_permanent   BOOLEAN NOT NULL DEFAULT FALSE,
  vip_expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent add-columns for shards set up before VIP existed — `CREATE
-- TABLE IF NOT EXISTS` above is a no-op on an existing table, so an
-- already-provisioned shard needs these added explicitly. Safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_permanent  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ;

-- Translators / Translation groups
CREATE TABLE IF NOT EXISTS translators (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  bio         TEXT,
  discord_url TEXT,
  website_url TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Games / Visual Novels
CREATE TABLE IF NOT EXISTS games (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) UNIQUE NOT NULL,
  description     TEXT NOT NULL,
  cover_url       TEXT,
  banner_url      TEXT,
  developer       VARCHAR(255),
  engine          VARCHAR(50) CHECK (engine IN ('renpy', 'kirikiri', 'unity', 'rpgmaker', 'tyranobuild', 'godot', 'wolfrpg', 'unreal', 'artemis', 'catsystem2', 'other')),
  status          VARCHAR(30) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('completed', 'in_progress', 'paused', 'demo')),
  age_rating      VARCHAR(5) NOT NULL DEFAULT 'all' CHECK (age_rating IN ('all', '16+', '18+')),
  translator_id   UUID REFERENCES translators(id),
  translator_note TEXT,
  view_count      INTEGER NOT NULL DEFAULT 0,
  download_count  INTEGER NOT NULL DEFAULT 0,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  published       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate legacy engine value + broaden the CHECK constraint on shards
-- provisioned before TyranoBuild/Godot/Wolf RPG/Unreal Engine/Artemis/Cat
-- System 2 existed. CREATE TABLE IF NOT EXISTS above is a no-op on an
-- already-existing `games` table, so the constraint has to be migrated
-- explicitly here — same idempotent add-column pattern as vip_permanent/
-- vip_expires_at above. Safe to re-run: the UPDATE is a no-op once no row
-- still has the old value, and the constraint is simply dropped + recreated.
--
-- IMPORTANT: DROP the old constraint BEFORE the UPDATE, not after. On a
-- shard that predates this migration, the existing constraint only allows
-- the OLD engine values (e.g. 'tyranoscript', not yet 'tyranobuild') — an
-- UPDATE that writes 'tyranobuild' while that narrower constraint is still
-- active gets rejected with "new row ... violates check constraint", even
-- though the very next statement was about to broaden the constraint to
-- allow it. Dropping first removes the restriction before we write the
-- new value, so the migration can never race against its own constraint.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_engine_check;
UPDATE games SET engine = 'tyranobuild' WHERE engine = 'tyranoscript';
ALTER TABLE games ADD CONSTRAINT games_engine_check
  CHECK (engine IN ('renpy', 'kirikiri', 'unity', 'rpgmaker', 'tyranobuild', 'godot', 'wolfrpg', 'unreal', 'artemis', 'catsystem2', 'other'));

-- Genres / Tags
CREATE TABLE IF NOT EXISTS genres (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL
);

-- IDs are explicit so that re-running db-setup.mjs on any shard — whether
-- freshly provisioned or existing — always produces the same id→name mapping.
-- ON CONFLICT DO NOTHING handles both the PRIMARY KEY collision (re-run on a
-- shard that already has these rows) and the UNIQUE(name)/UNIQUE(slug) collision
-- (shard was set up with an older schema that auto-assigned different IDs).
-- After the insert, setval() advances the sequence past the highest explicit ID
-- so that any future plain INSERT (no id column) never collides with these rows.
INSERT INTO genres (id, name, slug) VALUES
  -- Core genres
  (1,  'Romance',               'romance'),
  (2,  'Drama',                 'drama'),
  (3,  'Action',                'action'),
  (4,  'Fantasy',               'fantasy'),
  (5,  'Mystery',               'mystery'),
  (6,  'Sci-Fi',                'sci-fi'),
  (7,  'Psychological',         'psychological'),
  (8,  'Thriller',              'thriller'),
  (9,  'Horror',                'horror'),
  (10, 'Gothic',                'gothic'),
  (11, 'Slice of Life',         'slice-of-life'),
  (12, 'School Life',           'school-life'),
  (13, 'Tragedy',               'tragedy'),
  (14, 'Comedy',                'comedy'),
  -- Presentation / Format
  (15, '3D Game',               '3d-game'),
  (16, '3DCG',                  '3dcg'),
  (17, '2D Game',               '2d-game'),
  (18, '2DCG',                  '2dcg'),
  (19, 'AI CG',                 'ai-cg'),
  (20, 'Animated',              'animated'),
  (21, 'Censored',              'censored'),
  (22, 'Uncensored',            'uncensored'),
  (23, 'Kinetic Novel',         'kinetic-novel'),
  (24, 'Text Based',            'text-based'),
  (25, 'Virtual Reality',       'virtual-reality'),
  (26, 'Voiced',                'voiced'),
  (27, 'Mobile Game',           'mobile-game'),
  (28, 'Japanese Game',         'japanese-game'),
  -- Protagonist type
  (29, 'Male Protagonist',      'male-protagonist'),
  (30, 'Female Protagonist',    'female-protagonist'),
  (31, 'Futa/Trans Protagonist','futa-trans-protagonist'),
  (32, 'Multiple Protagonist',  'multiple-protagonist'),
  -- Game mechanics / gameplay
  (33, 'Adventure',             'adventure'),
  (34, 'Character Creation',    'character-creation'),
  (35, 'Combat',                'combat'),
  (36, 'Cosplay',               'cosplay'),
  (37, 'Dating Sim',            'dating-sim'),
  (38, 'Management',            'management'),
  (39, 'Platformer',            'platformer'),
  (40, 'Point & Click',         'point-and-click'),
  (41, 'Puzzle',                'puzzle'),
  (42, 'RPG',                   'rpg'),
  (43, 'Sandbox',               'sandbox'),
  (44, 'Shooter',               'shooter'),
  (45, 'Side-scroller',         'side-scroller'),
  (46, 'Simulator',             'simulator'),
  (47, 'Strategy',              'strategy'),
  (48, 'Trainer',               'trainer'),
  (49, 'Turn Based Combat',     'turn-based-combat'),
  -- Narrative / story tags
  (50, 'Dystopian Setting',     'dystopian-setting'),
  (51, 'Graphic Violence',      'graphic-violence'),
  (52, 'Humor',                 'humor'),
  (53, 'Mind Control',          'mind-control'),
  (54, 'Monster',               'monster'),
  (55, 'Monster Girl',          'monster-girl'),
  (56, 'Multiple Endings',      'multiple-endings'),
  (57, 'No Sexual Content',     'no-sexual-content'),
  (58, 'Paranormal',            'paranormal'),
  (59, 'Parody',                'parody'),
  (60, 'Possession',            'possession'),
  (61, 'PoV',                   'pov'),
  (62, 'Religion',              'religion'),
  (63, 'School Setting',        'school-setting'),
  (64, 'Superpowers',           'superpowers'),
  (65, 'Twins',                 'twins'),
  -- Relationship / romance tags
  (66, 'Harem',                 'harem'),
  (67, 'Reverse Harem',         'reverse-harem'),
  (68, 'Yuri',                  'yuri'),
  (69, 'Yaoi',                  'yaoi'),
  (70, 'Otome',                 'otome'),
  (71, 'NTR',                   'ntr'),
  (72, 'Cheating',              'cheating'),
  (73, 'Corruption',            'corruption'),
  (74, 'Blackmail',             'blackmail'),
  (75, 'Incest',                'incest'),
  (76, 'Milf',                  'milf'),
  (77, 'Pregnancy',             'pregnancy'),
  (78, 'BDSM',                  'bdsm'),
  (79, 'Voyeurism',             'voyeurism'),
  (80, 'Exhibitionism',         'exhibitionism'),
  -- Setting / world
  (81, 'Isekai',                'isekai'),
  (82, 'Historical',            'historical'),
  (83, 'Mythology',             'mythology'),
  (84, 'Post-apocalyptic',      'post-apocalyptic'),
  (85, 'Cyberpunk',             'cyberpunk'),
  (86, 'Steampunk',             'steampunk'),
  (87, 'Vampires',              'vampires'),
  (88, 'Zombies',               'zombies'),
  -- Gameplay mechanics
  (89, 'Survival',              'survival'),
  (90, 'Open World',            'open-world'),
  (91, 'Crafting',              'crafting'),
  (92, 'Martial Arts',          'martial-arts')
ON CONFLICT DO NOTHING;

-- Advance the sequence so a future plain INSERT (no explicit id) never
-- collides with the rows we just pinned above.
SELECT setval('genres_id_seq', COALESCE((SELECT MAX(id) FROM genres), 92));

CREATE TABLE IF NOT EXISTS game_genres (
  game_id  UUID REFERENCES games(id) ON DELETE CASCADE,
  genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, genre_id)
);

-- Download links (versioned)
CREATE TABLE IF NOT EXISTS game_downloads (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id    UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version    VARCHAR(50) NOT NULL,
  platform   VARCHAR(20) NOT NULL CHECK (platform IN ('windows', 'android', 'macos', 'ios', 'linux', 'webhtml5')),
  url        TEXT NOT NULL,
  -- Display label for the link ITSELF (the file host, e.g. "Google
  -- Drive", "Pixeldrain") — NOT the version. The version is a property of
  -- the game/release and is shown in the game's info sidebar instead; the
  -- label is what the visitor actually sees on the download button, since
  -- several links for the same version/platform may point at different
  -- hosts.
  label      VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotent add-column for shards set up before the label/host-name
-- concept existed — same pattern as vip_permanent/vip_expires_at above.
ALTER TABLE game_downloads ADD COLUMN IF NOT EXISTS label VARCHAR(50);

-- Broken/incorrect download-link reports submitted from the game detail
-- page. Pinned to the GAME's shard (located via withRowTransaction on
-- games.slug before insert), so both FKs stay co-located: a game's reports
-- always live on the same shard as the game and its game_downloads rows.
CREATE TABLE IF NOT EXISTS link_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  download_id UUID REFERENCES game_downloads(id) ON DELETE SET NULL,
  reason      TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User bookmarks
--
-- NOTE on sharding: user_id and game_id are independently-sharded entities
-- that can each land on ANY shard based on capacity at creation time. A
-- bookmark row can only physically live on ONE shard, so it cannot satisfy
-- a DB-level FK to both parents at once (the parent not co-located there
-- simply wouldn't exist in that shard's local table). FK/CASCADE removed —
-- referential integrity for this table is enforced in application code,
-- and a bookmark row should always be written to whichever shard holds the
-- `game_id` it refers to (see withRowTransaction('games', 'id', ...)).
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id UUID NOT NULL,
  game_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

-- Game requests
CREATE TABLE IF NOT EXISTS game_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        VARCHAR(255) NOT NULL,
  source_url   TEXT,
  engine       VARCHAR(50),
  description  TEXT,
  submitted_by VARCHAR(100),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_progress', 'rejected')),
  vote_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same cross-shard caveat as bookmarks above: user_id has no FK since the
-- referenced user may live on a different shard than this request. Every
-- request_votes row is always written to the SAME shard as its
-- game_requests parent (request_id), which DOES stay an FK since that
-- parent is always co-located by construction (see vote/route.ts).
CREATE TABLE IF NOT EXISTS request_votes (
  request_id UUID REFERENCES game_requests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  PRIMARY KEY (request_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_published     ON games(published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_status        ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_featured      ON games(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_games_downloads     ON games(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_game_genres_game    ON game_genres(game_id);
CREATE INDEX IF NOT EXISTS idx_game_downloads_game ON game_downloads(game_id);
CREATE INDEX IF NOT EXISTS idx_link_reports_game   ON link_reports(game_id);
CREATE INDEX IF NOT EXISTS idx_link_reports_status ON link_reports(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_bookmarks_user      ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_game       ON bookmarks(game_id);
CREATE INDEX IF NOT EXISTS idx_request_votes_user   ON request_votes(user_id);

-- Trigger: auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Postgres has no `CREATE TRIGGER IF NOT EXISTS` — DROP + CREATE is the
-- portable way to make this safe to re-run (new shard added later, script
-- re-run after a partial failure, etc.), consistent with every other
-- statement in this file already being idempotent.
DROP TRIGGER IF EXISTS games_updated_at ON games;
CREATE TRIGGER games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
