export type ChannelFormat = "EMBED" | "PLAIN" | "COMPACT";

export interface User {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  // Legacy — no longer scheduled, kept for backward compat with older clients.
  endOfDayTime: string;
  // New: when to post "TODAY GOAL" list (all today's tasks)
  goalPostTime: string;
  // New: when to post "Work Updated" list (only completed tasks)
  workUpdateTime: string;
}

export interface Task {
  id: string;
  title: string;
  /** ISO 8601 UTC, task calendar day at `T00:00:00.000Z` */
  date: string;
  /** ISO 8601 UTC instant, or null */
  doneAt: string | null;
  position: number;
}

export interface DiscordChannel {
  id: string;
  channelId: string;
  channelName: string;
  enabled: boolean;
  format: ChannelFormat;
  // New per-channel routing
  postGoals: boolean;
  postUpdates: boolean;
}

export interface DiscordConnection {
  id: string;
  guildId: string;
  guildName: string;
  channels: DiscordChannel[];
}

export interface ReminderSchedule {
  startTime: string;
  endTime: string;
  hourlyEnabled: boolean;
  endOfDayEnabled: boolean;
}

// ─── Team / shared channels ────────────────────────────────────────────────
export interface OwnedSharedChannel {
  id: string;
  channelId: string;
  channelName: string;
  joinCode: string; // owner-only
  enabled: boolean;
  postGoals: boolean;
  postUpdates: boolean;
  memberCount: number;
  lastError: string | null;
}

export interface JoinedSharedChannel {
  id: string;
  channelName: string;
  enabled: boolean;
}

export interface MySharedChannels {
  owned: OwnedSharedChannel[];
  joined: JoinedSharedChannel[];
}

export interface SharedChannelSummary {
  id: string;
  channelName: string;
  joinCode: string;
  enabled: boolean;
  postGoals: boolean;
  postUpdates: boolean;
}

// ─── Notes ────────────────────────────────────────────────────────────────
// Local-first notes with an optional single file attachment. Stored on-device
// via redux-persist; the attached file's bytes live in the app sandbox and are
// referenced here by a path RELATIVE to the document directory (absolute iOS
// container paths change across reinstalls/OS updates, so we never persist them
// — the displayable file:// URI is rebuilt at render time from this).
export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

export interface NoteAttachment {
  /** Path under DocumentDir, e.g. "notes_attachments/att_1699..._ab12.jpg". */
  relativePath: string;
  kind: AttachmentKind;
  /** Original display filename. */
  name: string;
  /** MIME type, e.g. "image/jpeg". */
  mime: string;
  /** Size in bytes (0 if the picker didn't report it). */
  size: number;
  /** Duration for audio/video, in milliseconds. */
  durationMs?: number;
  /** Pixel dimensions for image/video. */
  width?: number;
  height?: number;
}

/** A single checkable line inside a note's checklist. */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  /** Optional checklist (the reference app's checkbox feature). */
  checklist?: ChecklistItem[];
  /** Optional spreadsheet: rows of cell strings. */
  sheet?: string[][];
  /** ISO 8601 UTC instant. */
  createdAt: string;
  /** ISO 8601 UTC instant. */
  updatedAt: string;
  attachment: NoteAttachment | null;
  /**
   * When true, the note is hidden behind the app-wide passcode: its content is
   * redacted in the list and gated in the editor until unlocked this session.
   * Optional so notes persisted before this feature (which lack the field)
   * default to unlocked. See securitySlice + LockContext.
   */
  locked?: boolean;
  /** Pinned notes float to the top in their own "Pin" section. */
  pinned?: boolean;
  /** Which notebook the note lives in. Missing ⇒ the default notebook. */
  notebookId?: string;
  /**
   * ISO instant the note was moved to "Recently deleted". Missing/null ⇒ the
   * note is active. Soft-deleted notes are hidden from the main list, kept for
   * 30 days, then purged. See notesSlice.
   */
  deletedAt?: string | null;
}

/** A notebook groups notes. The built-in "default" notebook always exists. */
export interface Notebook {
  id: string;
  name: string;
  /** ISO 8601 UTC instant. */
  createdAt: string;
}

/** Notes list layout — a staggered 2-column grid or a single-column list. */
export type NotesViewMode = 'grid' | 'list';

/** The built-in notebook every note falls back to. */
export const DEFAULT_NOTEBOOK_ID = 'default';
