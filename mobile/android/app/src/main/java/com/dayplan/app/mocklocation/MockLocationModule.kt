package com.dayplan.app.mocklocation

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.facebook.fbreact.specs.NativeMockLocationSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JS-facing surface. Deliberately thin: it validates, delegates to
 * [MockLocationService] / [MockLocationEngine], and translates failures into
 * stable error codes the JS layer can branch on.
 *
 * Status events go out over RCTDeviceEventEmitter rather than a codegen'd
 * EventEmitter, so `addListener` / `removeListeners` exist below as no-ops for
 * NativeEventEmitter's benefit.
 */
class MockLocationModule(reactContext: ReactApplicationContext) :
    NativeMockLocationSpec(reactContext) {

    private var unsubscribe: (() -> Unit)? = null

    // getName() is not overridden: the generated spec already returns NAME.

    init {
        // Deliberately an init block rather than an initialize() override: this
        // has to happen exactly once per module instance, and the constructor is
        // the one hook we know the TurboModule manager always runs.

        // Test providers outlive our process — they're registered in
        // system_server. If a previous run crashed or was swiped away before
        // stop() ran, the device is still reporting a fake fix with no UI
        // anywhere to turn it off. Clear that on first JS access, but never
        // while a legitimate session is live.
        if (!MockLocationService.isRunning) {
            runCatching { MockLocationEngine.sweepOrphanProviders(reactApplicationContext) }
        }

        unsubscribe = MockLocationStatusBus.subscribe(::emitStatus)
    }

    override fun invalidate() {
        unsubscribe?.invoke()
        unsubscribe = null
        super.invalidate()
    }

    private fun emitStatus(event: MockStatusEvent) {
        val ctx = reactApplicationContext
        if (!ctx.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply {
            putString("status", event.status.name)
            if (event.error != null) putString("error", event.error) else putNull("error")
        }
        runCatching {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_STATUS_CHANGED, payload)
        }.onFailure { Log.w(MockLocationEngine.TAG, "failed to emit status to JS", it) }
    }

    // ── Status ───────────────────────────────────────────────────────────────

    override fun isMockLocationEnabled(promise: Promise) {
        promise.resolve(MockLocationEngine.isMockAppSelected(reactApplicationContext))
    }

    override fun getStatus(promise: Promise) {
        promise.resolve(MockLocationEngine.computeStatus(reactApplicationContext).name)
    }

    override fun peekBootInterrupted(promise: Promise) {
        promise.resolve(MockLocationStore.isBootInterrupted(reactApplicationContext))
    }

    override fun clearBootInterrupted(promise: Promise) {
        MockLocationStore.setBootInterrupted(reactApplicationContext, false)
        promise.resolve(null)
    }

    // ── Session ──────────────────────────────────────────────────────────────

    override fun start(options: ReadableMap, promise: Promise) {
        val ctx = reactApplicationContext

        val target = try {
            MockTarget.fromReadableMap(options)
        } catch (e: IllegalArgumentException) {
            promise.reject(E_INVALID_OPTIONS, e.message, e)
            return
        }

        if (!MockLocationEngine.hasFineLocationPermission(ctx)) {
            promise.reject(E_PERMISSION, MockLocationEngine.PERMISSION_MESSAGE)
            return
        }
        // Separate code from E_PERMISSION: the UI has to prompt for a different
        // permission, and on API 33+ this one is commonly already denied because
        // notifee only asks for it inside the alarm flow.
        if (!MockLocationEngine.hasNotificationPermission(ctx)) {
            promise.reject(E_NOTIFICATIONS, MockLocationEngine.NOTIFICATION_MESSAGE)
            return
        }
        // Same code, different remedy: the permission is granted but the app or
        // the channel is switched off, so the UI must route to notification
        // settings instead of re-prompting.
        if (!MockLocationEngine.areNotificationsDeliverable(ctx)) {
            promise.reject(E_NOTIFICATIONS, MockLocationEngine.NOTIFICATION_BLOCKED_MESSAGE)
            return
        }
        if (!MockLocationEngine.isMockAppSelected(ctx)) {
            promise.reject(E_NOT_SELECTED, MockLocationEngine.NOT_SELECTED_MESSAGE)
            return
        }

        try {
            MockLocationService.start(ctx, target)
            promise.resolve(null)
        } catch (e: Throwable) {
            // Notably ForegroundServiceStartNotAllowedException (API 31+, an
            // IllegalStateException subclass) when start() is somehow reached
            // while the app is in the background.
            Log.e(MockLocationEngine.TAG, "could not start the mock location service", e)
            promise.reject(
                E_SERVICE,
                "Android wouldn't start the location service: ${e.message ?: e::class.java.simpleName}",
                e,
            )
        }
    }

    override fun update(options: ReadableMap, promise: Promise) {
        val ctx = reactApplicationContext

        if (!MockLocationService.isRunning) {
            promise.reject(E_NOT_RUNNING, "No simulated location is running — call start() first.")
            return
        }

        val target = try {
            MockTarget.fromReadableMap(options)
        } catch (e: IllegalArgumentException) {
            promise.reject(E_INVALID_OPTIONS, e.message, e)
            return
        }

        try {
            MockLocationService.update(ctx, target)
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject(E_SERVICE, e.message, e)
        }
    }

    override fun stop(promise: Promise) {
        val ctx = reactApplicationContext
        if (MockLocationService.isRunning) {
            MockLocationService.stop(ctx)
        } else {
            // Nothing running, but a crashed session may still have providers
            // registered. Make stop() mean "the real GPS is restored" either way.
            runCatching { MockLocationEngine.sweepOrphanProviders(ctx) }
            MockLocationStore.clearSession(ctx)
            MockLocationStatusBus.publish(
                MockStatusEvent(MockLocationEngine.computeStatus(ctx))
            )
        }
        promise.resolve(null)
    }

    // ── Settings deep links ──────────────────────────────────────────────────

    override fun openDeveloperOptions(promise: Promise) {
        // Developer options is hidden until the user taps Build number 7 times,
        // in which case the first intent doesn't resolve — fall back to the
        // About phone screen where Build number lives, then to Settings root.
        val opened = launch(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                launch(Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))) ||
            launch(Intent(Settings.ACTION_SETTINGS))

        if (opened) promise.resolve(null)
        else promise.reject(E_SETTINGS, "Couldn't open the system settings on this device.")
    }

    /**
     * Notification settings, as deep as the platform allows: the specific
     * channel on API 26+, then the app's notification screen, then app details.
     * Used for E_MOCK_NOTIFICATIONS when the block is at the channel level,
     * where re-requesting the runtime permission would do nothing.
     */
    override fun openNotificationSettings(promise: Promise) {
        val pkg = reactApplicationContext.packageName
        val opened = (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                launch(
                    Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                        .putExtra(Settings.EXTRA_CHANNEL_ID, MockLocationEngine.CHANNEL_ID)
                )
            ) ||
            (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                    launch(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                    )
                ) ||
            launch(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.fromParts("package", pkg, null))
            )

        if (opened) promise.resolve(null)
        else promise.reject(E_SETTINGS, "Couldn't open DayPlan's notification settings.")
    }

    override fun openAppSettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", reactApplicationContext.packageName, null))
        if (launch(intent)) promise.resolve(null)
        else promise.reject(E_SETTINGS, "Couldn't open DayPlan's app settings.")
    }

    // ── Battery optimisation (suggestion only, never forced) ─────────────────

    override fun isIgnoringBatteryOptimizations(promise: Promise) {
        val pm = reactApplicationContext
            .getSystemService(Context.POWER_SERVICE) as? PowerManager
        promise.resolve(
            pm?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) ?: false
        )
    }

    override fun requestIgnoreBatteryOptimizations(promise: Promise) {
        @Suppress("BatteryLife") // Ships via GitHub Releases, not Play.
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:${reactApplicationContext.packageName}"))

        val opened = launch(direct) ||
            launch(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))

        if (opened) promise.resolve(null)
        else promise.reject(E_SETTINGS, "Couldn't open the battery optimisation settings.")
    }

    private fun launch(intent: Intent): Boolean {
        val ctx = reactApplicationContext
        // currentActivity keeps the settings screen in our task where possible;
        // NEW_TASK is required when falling back to the application context.
        val activity = currentActivity
        return try {
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            true
        } catch (e: Throwable) {
            Log.w(MockLocationEngine.TAG, "no activity for ${intent.action}", e)
            false
        }
    }

    // ── NativeEventEmitter bookkeeping ───────────────────────────────────────
    //
    // Intentional no-ops: the status bus is process-wide and always live while
    // the module is, so there is nothing to set up or tear down per listener.
    // They exist because NativeEventEmitter warns without them.

    override fun addListener(eventName: String) = Unit

    override fun removeListeners(count: Double) = Unit

    companion object {
        val NAME: String = NativeMockLocationSpec.NAME

        const val EVENT_STATUS_CHANGED = "mockLocationStatusChanged"

        // Stable across versions — src/services/mockLocation.ts branches on these.
        const val E_INVALID_OPTIONS = "E_MOCK_INVALID_OPTIONS"
        const val E_PERMISSION = "E_MOCK_PERMISSION"
        const val E_NOTIFICATIONS = "E_MOCK_NOTIFICATIONS"
        const val E_NOT_SELECTED = "E_MOCK_NOT_SELECTED"
        const val E_NOT_RUNNING = "E_MOCK_NOT_RUNNING"
        const val E_SERVICE = "E_MOCK_SERVICE"
        const val E_SETTINGS = "E_MOCK_SETTINGS"
    }
}
