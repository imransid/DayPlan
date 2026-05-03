import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';

import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { useAppSelector } from '../store/hooks';
import { config } from '../config';

const linking: LinkingOptions<any> = {
  prefixes: [config.deepLinkScheme],
  config: {
    screens: {
      Integrations: 'discord-connected',
    },
  },
};

export function RootNavigator() {
  const token = useAppSelector((s) => s.auth.accessToken);

  return (
    <NavigationContainer linking={linking}>
      {token ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
