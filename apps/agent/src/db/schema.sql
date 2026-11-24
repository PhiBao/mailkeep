CREATE TABLE households (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_display TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0, clock_offset_days INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  box_root_folder_id TEXT, box_cases_folder_id TEXT, box_other_folder_id TEXT, box_careful_folder_id TEXT, box_trials_folder_id TEXT,
  pinecone_namespace TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE members (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id),
  email TEXT NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent','family')), created_at TEXT NOT NULL,
  UNIQUE (household_id, email)
);
CREATE TABLE login_tokens (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE letters (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('email','upload','sample','seed','eval')),
  trial INTEGER NOT NULL DEFAULT 0, submitted_by TEXT,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','reading','recalling','deciding','acting','done','needs_retake','failed')),
  mime TEXT NOT NULL, sha256 TEXT NOT NULL, local_path TEXT NOT NULL, box_file_id TEXT,
  quality_json TEXT, transcript TEXT, sender_org TEXT, claims_government INTEGER,
  title TEXT, summary_parent TEXT, todo_parent TEXT,
  kind TEXT, lane TEXT CHECK (lane IN ('handled','headsup','needs_you','careful')),
  amount_cents INTEGER, due_date TEXT, account_tail TEXT, phones_json TEXT,
  scam_rule_hits_json TEXT, case_id TEXT, error TEXT,
  jev_tokens INTEGER DEFAULT 0, ollama_in_tokens INTEGER DEFAULT 0, ollama_out_tokens INTEGER DEFAULT 0, cost_microusd INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (household_id, sha256)
);
CREATE TABLE decisions (
  id TEXT PRIMARY KEY, letter_id TEXT NOT NULL, household_id TEXT NOT NULL, model_id TEXT NOT NULL,
  request_json TEXT NOT NULL, response_json TEXT NOT NULL, latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE checks (
  id TEXT PRIMARY KEY, letter_id TEXT NOT NULL, household_id TEXT NOT NULL,
  key TEXT NOT NULL, label TEXT NOT NULL, qtype TEXT NOT NULL CHECK (qtype IN ('noul','choice','code')),
  answer TEXT NOT NULL, probability REAL, confidence REAL, threshold REAL, outcome TEXT NOT NULL
);
CREATE TABLE relations (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL, letter_id TEXT NOT NULL, other_letter_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('same_matter','follow_up','completes','contradicts','sender_mismatch')),
  probability REAL NOT NULL, recall_score REAL, status TEXT NOT NULL CHECK (status IN ('accepted','asked','rejected')),
  created_at TEXT NOT NULL
);
CREATE TABLE cases (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL, title TEXT NOT NULL, counterparty TEXT NOT NULL,
  account_tail TEXT, kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','overdue','paid','closed','watch')),
  amount_cents INTEGER, due_date TEXT, second_notice INTEGER NOT NULL DEFAULT 0, contradiction INTEGER NOT NULL DEFAULT 0,
  box_folder_id TEXT, box_casefile_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE case_events (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL, case_id TEXT NOT NULL, letter_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('opened','linked','reminder_received','paid_signal','marked_paid','contradiction','asked','answered','escalated','overdue','closed','reopened')),
  actor TEXT NOT NULL CHECK (actor IN ('agent','member')), member_id TEXT, detail_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE asks (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL, letter_id TEXT, case_id TEXT,
  qtype TEXT NOT NULL CHECK (qtype IN ('link','paid','scam','kind','check','retake')),
  question TEXT NOT NULL, evidence TEXT NOT NULL, options_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','answered','expired')),
  agentmail_thread_id TEXT, answer_key TEXT, answered_by TEXT, answered_via TEXT CHECK (answered_via IN ('email','web')),
  created_at TEXT NOT NULL, answered_at TEXT
);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL, to_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('parent_note','family_alert','ask','digest','login','retake')),
  subject TEXT NOT NULL, body_text TEXT NOT NULL, related_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','failed','suppressed')),
  suppressed_reason TEXT, attempts INTEGER NOT NULL DEFAULT 0, agentmail_message_id TEXT, agentmail_thread_id TEXT,
  created_at TEXT NOT NULL, sent_at TEXT
);
CREATE TABLE inbound_seen (agentmail_message_id TEXT PRIMARY KEY, outcome TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE INDEX idx_letters_hh ON letters(household_id, received_at);
CREATE INDEX idx_letters_tail ON letters(household_id, account_tail);
CREATE INDEX idx_cases_hh ON cases(household_id, status, due_date);
CREATE INDEX idx_asks_hh ON asks(household_id, status);
