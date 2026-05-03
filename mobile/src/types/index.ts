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
  date: string;
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
