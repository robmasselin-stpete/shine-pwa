-- mural-quest analytics — first-party event log (v1.5).
-- Anonymous session ids only; no PII, no IP stored.
CREATE TABLE IF NOT EXISTS events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,   -- epoch ms (client clock)
  day    TEXT    NOT NULL,   -- YYYY-MM-DD (UTC) for grouping
  sid    TEXT    NOT NULL,   -- anonymous session id
  event  TEXT    NOT NULL,   -- app_open, screen_view, mural_open, book_buy_click, …
  props  TEXT                -- JSON string of extra fields
);
CREATE INDEX IF NOT EXISTS idx_events_day   ON events(day);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_sid   ON events(sid);
