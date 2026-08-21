package com.dayplan.app.mocklocation

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * DayPlan's first custom native package. Registered by hand in
 * MainApplication.getPackages() — autolinking only covers node_modules.
 */
class MockLocationPackage : BaseReactPackage() {

    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? = if (name == MockLocationModule.NAME) {
        MockLocationModule(reactContext)
    } else {
        null
    }

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
            MockLocationModule.NAME to ReactModuleInfo(
                MockLocationModule.NAME,
                MockLocationModule::class.java.name,
                /* canOverrideExistingModule = */ false,
                /* needsEagerInit = */ false,
                /* isCxxModule = */ false,
                /* isTurboModule = */ true,
            )
        )
    }
}
