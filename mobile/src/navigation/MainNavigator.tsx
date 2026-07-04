import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { HomeScreen } from '../screens/home/HomeScreen';
import { AddTaskScreen } from '../screens/home/AddTaskScreen';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { NotesListScreen } from '../screens/notes/NotesListScreen';
import { NoteEditorScreen } from '../screens/notes/NoteEditorScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { IntegrationsScreen } from '../screens/integrations/IntegrationsScreen';
import { ChannelManagerScreen } from '../screens/integrations/ChannelManagerScreen';
import { ChannelPickerScreen } from '../screens/integrations/ChannelPickerScreen';
import { JoinTeamChannelScreen } from '../screens/integrations/JoinTeamChannelScreen';
import { AnimatedTabBar } from '../components/AnimatedTabBar';
import type { MainTabParamList, MainStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      // The custom tab bar handles its own appearance — we just provide the
      // routes here. screen-fade transition makes the cross-tab navigation
      // feel less jarring than the default crossfade.
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        animation: 'shift',
      }}
    >
      <Tab.Screen name="Today" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Notes" component={NotesListScreen} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="NoteEditor" component={NoteEditorScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Integrations" component={IntegrationsScreen} />
      <Stack.Screen name="ChannelManager" component={ChannelManagerScreen} />
      <Stack.Screen name="ChannelPicker" component={ChannelPickerScreen} />
      <Stack.Screen name="JoinTeamChannel" component={JoinTeamChannelScreen} />

      {/*
        AddTask — bottom-sheet screen.
          - presentation: 'transparentModal' keeps the previous screen
            (HomeScreen) mounted and visible underneath, so the dim
            backdrop reveals the task list through it.
          - animation: 'slide_from_bottom' gives the sheet-rising feel.
          - contentStyle: transparent so the dim layer comes from the
            screen itself, not from a navigator-level fill.
          - gestureEnabled: false because the screen ITSELF handles its
            tap-outside-to-dismiss; we don't want a half-finished swipe
            collision with the keyboard or the text input.
        See AddTaskScreen for the rationale on why this replaced the
        previous broken <Modal>.
      */}
      <Stack.Screen
        name="AddTask"
        component={AddTaskScreen}
        options={{
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: 'transparent' },
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}