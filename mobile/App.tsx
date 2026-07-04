import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, ActivityIndicator, View } from 'react-native';

import { store, persistor } from './src/store/store';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';
import { LiquidGlassBackground } from './src/components/LiquidGlassBackground';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { LockProvider } from './src/context/LockContext';
import { registerAlarmActionHandler } from './src/services/notifications';
import { checkForUpdate } from './src/services/appUpdate';

function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={colors.textMuted} />
    </View>
  );
}

export default function App() {
  // The ALARM background handler is registered in index.js (it must be
  // outside React so it survives app teardown). This handles the case where
  // the user is INSIDE the app when the alarm fires and taps Dismiss/Snooze
  // from the notification.
  useEffect(() => {
    const unsubscribe = registerAlarmActionHandler();
    return () => unsubscribe();
  }, []);

  // Silent auto-update check on launch: if CI has published a newer build to
  // GitHub Releases, offer to download + install it (Android). No-op on iOS and
  // when already current. Runs in the background — never blocks the UI.
  useEffect(() => {
    checkForUpdate({ silent: true }).catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <LiquidGlassBackground />
        <View style={{ flex: 1, backgroundColor: colors.screen }}>
          <Provider store={store}>
            <PersistGate loading={<Loading />} persistor={persistor}>
              <SafeAreaProvider>
                <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
                <ErrorBoundary>
                  <LockProvider>
                    <RootNavigator />
                  </LockProvider>
                </ErrorBoundary>
              </SafeAreaProvider>
            </PersistGate>
          </Provider>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}
