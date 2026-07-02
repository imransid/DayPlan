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

export interface Note {
  id: string;
  title: string;
  body: string;
  /** ISO 8601 UTC instant. */
  createdAt: string;
  /** ISO 8601 UTC instant. */
  updatedAt: string;
  attachment: NoteAttachment | null;
}
