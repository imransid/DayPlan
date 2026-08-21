package com.dayplan.app

import android.app.Application
import com.dayplan.app.mocklocation.MockLocationEngine
import com.dayplan.app.mocklocation.MockLocationStore
import com.dayplan.app.mocklocation.MockLocationPackage
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Autolinking only covers node_modules; app-local native modules
              // are registered by hand.
              add(MockLocationPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }

    // Clear mock-location test providers left registered by a previous run.
    //
    // They live in system_server, not in our process, so a crash or a
    // swipe-away leaves the device reporting a fake fix with nothing on screen
    // to stop it. MockLocationModule sweeps too, but TurboModules are
    // constructed lazily — that sweep only happens once JS imports the spec,
    // which makes a safety net depend on the JS import graph. This has no React
    // dependency, so process start is the right place for it.
    runCatching { MockLocationEngine.sweepOrphanProviders(this) }

    // Same reasoning for the route geometry a session writes to internal
    // storage: a crash must not leave debris that only a visit to the feature
    // screen would clear. Safe unconditionally — the service rewrites its file
    // before reading it back.
    runCatching { MockLocationStore.sweepRouteFiles(this, keepSessionId = null) }
  }
}
