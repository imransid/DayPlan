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
    private var unsubscribeProgress: (() -> Unit)? = null

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
        unsubscribeProgress = MockLocationStatusBus.subscribeProgress(::emitProgress)
    }

    override fun invalidate() {
        unsubscribe?.invoke()
        unsubscribe = null
        unsubscribeProgress?.invoke()
        unsubscribeProgress = null
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

    /**
     * Called from the injector thread about once a second.
     *
     * Returns immediately when no React instance is attached, so a backgrounded
     * or torn-down JS context never costs the injection loop anything.
     */
    private fun emitProgress(progress: MockProgress) {
        val ctx = reactApplicationContext
        if (!ctx.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply {
            putDouble("fraction", progress.fraction)
            putDouble("metresTravelled", progress.metresTravelled)
            putDouble("metresRemaining", progress.metresRemaining)
            putDouble("speedMps", progress.speedMps.toDouble())
            putDouble("bearingDegrees", progress.bearingDegrees.toDouble())
            if (progress.etaMs != null) putDouble("etaMs", progress.etaMs.toDouble())
            else putNull("etaMs")
            putDouble("latitude", progress.latitude)
            putDouble("longitude", progress.longitude)
            putBoolean("finished", progress.finished)
            putBoolean("reversed", progress.reversed)
        }
        runCatching {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_PROGRESS, payload)
        }
    }

    /**
     * The gates start() and startRoute() share.
     *
     * @return an error code and message, or null when everything is in place.
     */
    private fun blockingPrecondition(): Pair<String, String>? {
        val ctx = reactApplicationContext
        return when {
            !MockLocationEngine.hasFineLocationPermission(ctx) ->
                E_PERMISSION to MockLocationEngine.PERMISSION_MESSAGE
            !MockLocationEngine.hasNotificationPermission(ctx) ->
                E_NOTIFICATIONS to MockLocationEngine.NOTIFICATION_MESSAGE
            !MockLocationEngine.areNotificationsDeliverable(ctx) ->
                E_NOTIFICATIONS to MockLocationEngine.NOTIFICATION_BLOCKED_MESSAGE
            !MockLocationEngine.isMockAppSelected(ctx) ->
                E_NOT_SELECTED to MockLocationEngine.NOT_SELECTED_MESSAGE
            else -> null
        }
    }

    /**
     * Straight-line route between two points.
     *
     * Geometry is generated here and written to internal storage rather than
     * passed through the Intent: a 10k-point route is ~160 KB of doubles, close
     * enough to the Binder transaction limit to be a bad idea. The service reads
     * it back by session id. Road geometry in step 4 substitutes the points and
     * changes nothing else.
     */
    override fun startRoute(options: ReadableMap, promise: Promise) {
        val ctx = reactApplicationContext

        blockingPrecondition()?.let { (code, message) ->
            promise.reject(code, message)
            return
        }

        val startLat = options.optDouble("startLatitude")
        val startLng = options.optDouble("startLongitude")
        val endLat = options.optDouble("endLatitude")
        val endLng = options.optDouble("endLongitude")
        if (startLat == null || startLng == null || endLat == null || endLng == null) {
            promise.reject(E_INVALID_OPTIONS, "A route needs both a start and an end point.")
            return
        }

        val template = try {
            MockTarget.fromReadableMap(
                Arguments.createMap().apply {
                    merge(options)
                    putDouble(MockTarget.KEY_LAT, startLat)
                    putDouble(MockTarget.KEY_LNG, startLng)
                }
            )
        } catch (e: IllegalArgumentException) {
            promise.reject(E_INVALID_OPTIONS, e.message, e)
            return
        }

        val geometry = try {
            RouteGeometry.straightLine(startLat, startLng, endLat, endLng)
        } catch (e: IllegalArgumentException) {
            promise.reject(E_INVALID_OPTIONS, e.message, e)
            return
        }

        val sessionId = "r${System.currentTimeMillis()}"
        if (!MockLocationStore.writeRoute(ctx, sessionId, geometry.toFlatArray())) {
            promise.reject(E_SERVICE, "Couldn't save the route to this device's storage.")
            return
        }

        val speedKmh = options.optDouble("speedKmh") ?: MockLocationService.DEFAULT_SPEED_KMH
        if (speedKmh <= 0.0) {
            promise.reject(E_INVALID_OPTIONS, "Speed must be greater than 0 km/h.")
            return
        }

        try {
            MockLocationService.startRoute(
                context = ctx,
                sessionId = sessionId,
                template = template,
                endBehaviour = RouteEndBehaviour.parse(options.optString("endBehaviour")).name,
                speedKmh = speedKmh,
            )
            promise.resolve(null)
        } catch (e: Throwable) {
            Log.e(MockLocationEngine.TAG, "could not start the route service", e)
            promise.reject(E_SERVICE, e.message ?: "Android wouldn't start the route.", e)
        }
    }

    private fun ReadableMap.optDouble(key: String): Double? =
        if (hasKey(key) && !isNull(key)) getDouble(key) else null

    private fun ReadableMap.optString(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

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

        // E_MOCK_NOTIFICATIONS covers two different remedies — re-prompt when
        // the runtime permission is missing, notification settings when the app
        // or channel is switched off — which is why the messages differ.
        blockingPrecondition()?.let { (code, message) ->
            promise.reject(code, message)
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

    /** Freezes a route in place. The frozen fix keeps being injected. */
    override fun pauseRoute(promise: Promise) {
        if (!MockLocationService.isRunning) {
            promise.reject(E_NOT_RUNNING, "No simulated location is running.")
            return
        }
        MockLocationService.pause(reactApplicationContext)
        promise.resolve(null)
    }

    override fun resumeRoute(promise: Promise) {
        if (!MockLocationService.isRunning) {
            promise.reject(E_NOT_RUNNING, "No simulated location is running.")
            return
        }
        MockLocationService.resume(reactApplicationContext)
        promise.resolve(null)
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
        const val EVENT_PROGRESS = "mockLocationProgress"

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
