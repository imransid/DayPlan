import type { NoteAttachment } from '../types';

export type AuthStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  SignIn: undefined;
};

export type MainTabParamList = {
  Today: undefined;
  History: undefined;
  Notes: undefined;
  SettingsTab: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  Settings: undefined;
  Integrations: undefined;
  ChannelManager: { guildId: string; guildName: string };
  ChannelPicker: { guildId: string; guildName: string };
  // Enter a code to join a shared team channel (member flow).
  JoinTeamChannel: undefined;
  // Note editor — create (no params) or edit (noteId). `notebookId` seeds the
  // notebook a newly-created note lands in. `doodleAttachment` is how the Doodle
  // screen hands its rasterised drawing back (merged onto this route on return).
  // Full pushed screen so the body + inline media get the whole viewport.
  NoteEditor:
    | { noteId?: string; notebookId?: string; doodleAttachment?: NoteAttachment }
    | undefined;
  // Full-screen freehand drawing canvas; returns an image attachment.
  Doodle: undefined;
  // Trash — soft-deleted notes, restore / delete permanently.
  RecentlyDeleted: undefined;
  // Bottom-sheet add-task screen. Presented as a transparent modal so
  // HomeScreen stays visible underneath; `date` is the UTC task-day key
  // the new task should be created against (passed from HomeScreen).
  AddTask: { date: string };
};
