-- ============================================================
-- Document Approval System — Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Write model (event-sourced / command side)
-- ------------------------------------------------------------

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);

CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  author_id   UUID NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pending_approval','approved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE blocks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE block_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_id    UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- immutability enforced via trigger below; no UPDATE allowed
);

CREATE TABLE references (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  target_block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  target_version_id UUID NOT NULL REFERENCES block_versions(id),
  target_hash     TEXT NOT NULL,
  is_outdated     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_block_id, target_block_id)
);

CREATE TABLE approvals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES users(id),
  delegated_from_id UUID REFERENCES users(id),
  decision    TEXT CHECK (decision IN ('approved','rejected')),
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE delegations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delegator_id  UUID NOT NULL REFERENCES users(id),
  delegate_id   UUID NOT NULL REFERENCES users(id),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  CHECK (delegator_id <> delegate_id)
);

-- ------------------------------------------------------------
-- Read model (CQRS projection side)
-- ------------------------------------------------------------

CREATE TABLE document_views (
  id              UUID PRIMARY KEY,
  title           TEXT NOT NULL,
  author_id       UUID NOT NULL,
  author_name     TEXT NOT NULL,
  status          TEXT NOT NULL,
  block_count     INTEGER NOT NULL DEFAULT 0,
  has_outdated_refs BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE block_views (
  id              UUID PRIMARY KEY,
  document_id     UUID NOT NULL,
  position        INTEGER NOT NULL,
  current_content TEXT,
  current_hash    TEXT,
  version_count   INTEGER NOT NULL DEFAULT 0,
  last_updated_by UUID,
  last_updated_at TIMESTAMPTZ
);

CREATE TABLE reference_views (
  id                UUID PRIMARY KEY,
  source_block_id   UUID NOT NULL,
  target_block_id   UUID NOT NULL,
  target_version_id UUID NOT NULL,
  target_hash       TEXT NOT NULL,
  is_outdated       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ NOT NULL
);

-- ------------------------------------------------------------
-- Event store (append-only)
-- ------------------------------------------------------------

CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type  TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  aggregate_type TEXT NOT NULL,
  payload     JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sequence_nr BIGSERIAL
);

CREATE INDEX idx_events_aggregate ON events(aggregate_type, aggregate_id, sequence_nr);
CREATE INDEX idx_events_type ON events(event_type);

-- ------------------------------------------------------------
-- Immutability: block_versions cannot be updated or deleted
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_block_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'block_versions is immutable — UPDATE and DELETE are not allowed (id: %)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_versions_immutable
  BEFORE UPDATE OR DELETE ON block_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_block_version_mutation();

-- ------------------------------------------------------------
-- Useful indexes
-- ------------------------------------------------------------

CREATE INDEX idx_block_versions_block_id ON block_versions(block_id, created_at DESC);
CREATE INDEX idx_references_target ON references(target_block_id);
CREATE INDEX idx_references_outdated ON references(is_outdated) WHERE is_outdated = TRUE;
CREATE INDEX idx_approvals_document ON approvals(document_id);
CREATE INDEX idx_delegations_delegator ON delegations(delegator_id) WHERE is_active = TRUE;
CREATE INDEX idx_delegations_delegate ON delegations(delegate_id) WHERE is_active = TRUE;
