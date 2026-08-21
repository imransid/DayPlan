package com.dayplan.app.mocklocation

import android.Manifest
import android.app.AppOpsManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.Log

/** The mock-location app op isn't granted to us — the user hasn't picked DayPlan. */
internal class MockLocationNotSelectedException(message: String) : Exception(message)

/** ACCESS_FINE_LOCATION isn't granted. */
internal class MockLocationPermissionException(message: String) : Exception(message)

/**
 * All of the platform test-provider mechanics, and nothing else — no lifecycle,
 * no threading, no notification. [MockLocationService] owns those.
 *
 * The contract this leans on (AOSP `LocationManager` / `Location`, verified
 * against the API 34 sources):
 *
 *  - `addTestProvider`, `removeTestProvider`, `setTestProviderEnabled` and
 *    `setTestProviderLocation` all throw SecurityException when the
 *    OPSTR_MOCK_LOCATION app op is not MODE_ALLOWED. That is the *only* signal
 *    the platform gives for "user hasn't selected us in Developer Options".
 *  - `setTestProviderLocation` throws IllegalArgumentException if the Location
 *    is "incomplete". `Location.isComplete()` defines complete as: non-null
 *    provider, accuracy set, non-zero time, AND non-zero elapsed realtime. The
 *    last one is the classic silent-drop cause — see [buildLocation].
 */
internal object MockLocationEngine {

    const val TAG = "MockLocation"

    const val NOT_SELECTED_MESSAGE =
        "DayPlan isn't set as the mock location app. Open Developer Options -> " +
            "\"Select mock location app\" and choose DayPlan."

    const val PERMISSION_MESSAGE =
        "Precise location permission is required before a location can be simulated."

    /**
     * Notifications are load-bearing here, not decoration: the persistent
     * notification is the only always-visible indicator that the session is
     * running and the only place the Stop action lives. Running the service
     * without it would silently drop the "you can never forget this is on"
     * guarantee, so a denial is a hard failure rather than a warning.
     *
     * Worth knowing: notifee only requests POST_NOTIFICATIONS inside the alarm
     * flow, so anyone who declined hourly alarms has it denied right now.
     */
    const val NOTIFICATION_MESSAGE =
        "Notification permission is required. The simulated location runs behind a " +
            "permanent notification — it's how you can tell it's on, and how you turn it off."

    /**
     * Distinct from [NOTIFICATION_MESSAGE] because the fix is different: the
     * runtime permission is granted, but notifications are switched off for the
     * app or this channel is set to IMPORTANCE_NONE. PermissionsAndroid.request
     * is a no-op in that state, so the message has to point at settings.
     */
    const val NOTIFICATION_BLOCKED_MESSAGE =
        "Notifications for the \"Simulated location\" channel are turned off. The " +
            "session runs behind a permanent notification, so turn that channel " +
            "back on in notification settings before starting."

    /** Shared with the service so both create and query the same channel. */
    const val CHANNEL_ID = "dayplan-mock-location"

    /**
     * Small but non-zero secondary accuracies. Android 8+ consumers (notably
     * Play Services' fused provider) drop fixes that leave these unset.
     */
    private const val VERTICAL_ACCURACY_M = 3.0f
    private const val SPEED_ACCURACY_MPS = 0.5f
    private const val BEARING_ACCURACY_DEG = 5.0f

    /**
     * Every provider a consumer might actually read.
     *
     * GPS and NETWORK are what Play Services' FusedLocationProviderClient is
     * fed from, and that's the path Google Maps / WhatsApp / Facebook take.
     * FUSED_PROVIDER ("fused", API 31+) is best-effort on top: on several OEM
     * builds the platform fused provider is owned by Play Services and
     * addTestProvider rejects it. That's handled, not fatal.
     */
    fun providers(): List<String> = buildList {
        add(LocationManager.GPS_PROVIDER)
        add(LocationManager.NETWORK_PROVIDER)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
    }

    fun locationManager(context: Context): LocationManager? =
        context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager

    /**
     * Whether the user has picked DayPlan under Developer Options.
     *
     * Checked via the app op directly rather than by calling addTestProvider
     * and catching: this is instant, side-effect free, and doesn't mutate
     * provider state just to answer a question.
     */
    fun isMockAppSelected(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
            ?: return false
        return try {
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_MOCK_LOCATION, Process.myUid(), context.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_MOCK_LOCATION, Process.myUid(), context.packageName
                )
            }
            mode == AppOpsManager.MODE_ALLOWED
        } catch (t: Throwable) {
            // Some heavily-modified ROMs throw from checkOp entirely. Treating
            // that as "not selected" sends the user to the setup guide, which
            // is the right place to be if we genuinely can't tell.
            Log.w(TAG, "mock location app op check failed", t)
            false
        }
    }

    fun hasFineLocationPermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /** Always true below API 33, where notifications need no runtime grant. */
    fun hasNotificationPermission(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

    fun notificationManager(context: Context): NotificationManager? =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

    /**
     * Creates the foreground-service channel if it doesn't exist yet.
     *
     * Must be called before querying the channel's importance, otherwise the
     * check is a false negative on the very first run — the channel simply
     * doesn't exist until something creates it. Creating it cannot un-block a
     * channel the user has already silenced; importance is only honoured at
     * creation time, which is exactly why we read it back rather than assume.
     */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Simulated location",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shown the whole time DayPlan is reporting a fake location to other apps."
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        runCatching { notificationManager(context)?.createNotificationChannel(channel) }
    }

    /**
     * Whether the persistent notification would actually be visible.
     *
     * Holding POST_NOTIFICATIONS is not sufficient: the user can switch the app
     * off in notification settings, or set this channel to IMPORTANCE_NONE, and
     * startForeground still succeeds while showing nothing. That produces the
     * same invisible-session failure the permission gate exists to prevent.
     */
    fun areNotificationsDeliverable(context: Context): Boolean {
        val nm = notificationManager(context) ?: return false
        ensureChannel(context)
        if (!nm.areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = runCatching { nm.getNotificationChannel(CHANNEL_ID) }.getOrNull()
            if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) {
                return false
            }
        }
        return true
    }

    /** The message for whichever notification/location precondition is unmet, or null. */
    fun missingPermissionMessage(context: Context): String? = when {
        !hasFineLocationPermission(context) -> PERMISSION_MESSAGE
        !hasNotificationPermission(context) -> NOTIFICATION_MESSAGE
        !areNotificationsDeliverable(context) -> NOTIFICATION_BLOCKED_MESSAGE
        else -> null
    }

    fun computeStatus(context: Context): MockStatus = when {
        MockLocationService.isRunning -> MockStatus.RUNNING
        missingPermissionMessage(context) != null -> MockStatus.PERMISSION_MISSING
        !isMockAppSelected(context) -> MockStatus.NOT_SELECTED
        else -> MockStatus.READY
    }

    /**
     * Clears test providers left registered by a previous process.
     *
     * Test providers live in system_server, not in our process, so a crash (or
     * a swipe-away that kills us before stop() runs) leaves the device stuck
     * reporting the fake fix with no UI anywhere to turn it off. Called at
     * module init, and guarded by the caller against wiping a live session.
     */
    fun sweepOrphanProviders(context: Context) {
        if (!isMockAppSelected(context)) return
        val lm = locationManager(context) ?: return
        for (p in providers()) {
            // removeTestProvider is documented to do nothing when no test
            // provider by that name exists, so this can't disturb the real
            // gps/network providers. There's no public way to ask whether one
            // *was* registered, so this is unconditional and unlogged rather
            // than pretending to a count we can't measure.
            runCatching { lm.removeTestProvider(p) }
        }
    }

    /**
     * Registers and enables the test providers.
     *
     * @return the providers that actually took, which may be a subset.
     * @throws MockLocationNotSelectedException if the app op denied every one.
     */
    fun addProviders(lm: LocationManager): List<String> {
        val added = ArrayList<String>(3)
        var denied: SecurityException? = null

        for (p in providers()) {
            // A leftover registration from a crashed session would make
            // addTestProvider behave unpredictably; clear it first.
            runCatching { lm.removeTestProvider(p) }
            try {
                @Suppress("DEPRECATION")
                lm.addTestProvider(
                    p,
                    /* requiresNetwork = */ false,
                    /* requiresSatellite = */ false,
                    /* requiresCell = */ false,
                    /* hasMonetaryCost = */ false,
                    /* supportsAltitude = */ true,
                    /* supportsSpeed = */ true,
                    /* supportsBearing = */ true,
                    // Criteria is a deprecated *class*, but this addTestProvider
                    // overload is not, and its ProviderProperties replacements
                    // are API 31+ while we still support 24.
                    android.location.Criteria.POWER_LOW,
                    android.location.Criteria.ACCURACY_FINE,
                )
                lm.setTestProviderEnabled(p, true)
                added.add(p)
            } catch (e: SecurityException) {
                denied = e
                Log.w(TAG, "addTestProvider($p) denied — mock location app op not granted")
            } catch (e: IllegalArgumentException) {
                Log.w(TAG, "addTestProvider($p) rejected by this ROM; continuing without it", e)
            } catch (t: Throwable) {
                Log.w(TAG, "addTestProvider($p) failed unexpectedly; continuing without it", t)
            }
        }

        if (added.isEmpty()) {
            if (denied != null) throw MockLocationNotSelectedException(NOT_SELECTED_MESSAGE)
            throw IllegalStateException(
                "This device refused every location provider. Mock location may be " +
                    "blocked by the manufacturer's software."
            )
        }
        return added
    }

    fun removeProviders(lm: LocationManager, providers: Collection<String>) {
        for (p in providers) {
            runCatching { lm.setTestProviderEnabled(p, false) }
            runCatching { lm.removeTestProvider(p) }
        }
    }

    /**
     * Pushes one fix to each registered provider.
     *
     * @return how many providers accepted it.
     * @throws MockLocationNotSelectedException if the user revoked the app op
     *         while the session was running.
     */
    fun push(lm: LocationManager, providers: Collection<String>, target: MockTarget): Int {
        var accepted = 0
        for (p in providers) {
            try {
                lm.setTestProviderLocation(p, buildLocation(p, target))
                accepted++
            } catch (e: SecurityException) {
                throw MockLocationNotSelectedException(NOT_SELECTED_MESSAGE)
            } catch (e: IllegalArgumentException) {
                Log.w(TAG, "setTestProviderLocation($p) rejected the fix", e)
            }
        }
        return accepted
    }

    /**
     * Builds a fix the platform will accept.
     *
     * `time` and especially `elapsedRealtimeNanos` are not optional: without a
     * non-zero elapsed realtime the Location fails `isComplete()` and
     * setTestProviderLocation throws — and when a consumer does accept a fix
     * with a stale elapsed realtime it silently prefers the real one instead.
     * Both are re-stamped on every push, which is the whole reason the service
     * re-injects on a timer rather than setting the location once.
     */
    private fun buildLocation(provider: String, t: MockTarget): Location =
        Location(provider).apply {
            latitude = t.latitude
            longitude = t.longitude
            altitude = t.altitude
            accuracy = t.accuracy
            bearing = t.bearing
            speed = t.speed
            time = System.currentTimeMillis()
            elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                verticalAccuracyMeters = VERTICAL_ACCURACY_M
                speedAccuracyMetersPerSecond = SPEED_ACCURACY_MPS
                bearingAccuracyDegrees = BEARING_ACCURACY_DEG
            }
        }
}
