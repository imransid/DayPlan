export type AuthStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  SignIn: undefined;
};

export type MainTabParamList = {
  Today: undefined;
  History: undefined;
  SettingsTab: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  Settings: undefined;
  Integrations: undefined;
  ChannelManager: { guildId: string; guildName: string };
  ChannelPicker: { guildId: string; guildName: string };
};
