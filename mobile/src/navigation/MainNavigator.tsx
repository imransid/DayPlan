import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text } from 'react-native';

import { HomeScreen } from '../screens/home/HomeScreen';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { IntegrationsScreen } from '../screens/integrations/IntegrationsScreen';
import { ChannelManagerScreen } from '../screens/integrations/ChannelManagerScreen';
import { ChannelPickerScreen } from '../screens/integrations/ChannelPickerScreen';
import { colors } from '../theme';
import type { MainTabParamList, MainStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          borderTopColor: colors.borderStrong,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: 'rgba(255, 253, 248, 0.88)',
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Today"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📋</Text> }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📅</Text> }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Integrations" component={IntegrationsScreen} />
      <Stack.Screen name="ChannelManager" component={ChannelManagerScreen} />
      <Stack.Screen name="ChannelPicker" component={ChannelPickerScreen} />
    </Stack.Navigator>
  );
}
