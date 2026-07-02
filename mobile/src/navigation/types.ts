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
  // Note editor — create (no params) or edit (noteId). Full pushed screen so
  // the body + inline media get the whole viewport.
  NoteEditor: { noteId?: string } | undefined;
  // Bottom-sheet add-task screen. Presented as a transparent modal so
  // HomeScreen stays visible underneath; `date` is the UTC task-day key
  // the new task should be created against (passed from HomeScreen).
  AddTask: { date: string };
};
