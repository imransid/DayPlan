import React from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, ActivityIndicator, View } from 'react-native';

import { store, persistor } from './src/store/store';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';
import { LiquidGlassBackground } from './src/components/LiquidGlassBackground';

function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={colors.textMuted} />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <LiquidGlassBackground />
        <View style={{ flex: 1, backgroundColor: colors.screen }}>
          <Provider store={store}>
            <PersistGate loading={<Loading />} persistor={persistor}>
              <SafeAreaProvider>
                <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
                <RootNavigator />
              </SafeAreaProvider>
            </PersistGate>
          </Provider>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}
