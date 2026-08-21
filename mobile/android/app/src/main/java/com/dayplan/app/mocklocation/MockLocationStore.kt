package com.dayplan.app.mocklocation

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Survives process death and reboots so we can answer two questions on the next
 * start: "were we faking when we died?" and "where?".
 *
 * SharedPreferences rather than the app's AsyncStorage because the service and
 * the boot receiver both need this without a React context alive.
 */
internal object MockLocationStore {

    private const val PREFS = "dayplan-mock-location"
    private const val KEY_ACTIVE = "active"

    /**
     * Set when a reboot interrupted an active session. The boot receiver
     * refuses to silently resume faking — it flips this instead, and the UI
     * surfaces a "resume?" prompt on next launch.
     */
    private const val KEY_BOOT_INTERRUPTED = "bootInterrupted"

    // ── Route session ────────────────────────────────────────────────────────
    private const val KEY_SESSION_ID = "sessionId"
    private const val KEY_MODE = "mode"
    private const val KEY_END_BEHAVIOUR = "endBehaviour"
    private const val KEY_SPEED_KMH = "speedKmh"

    /**
     * Metres into the current leg where a pause froze the route, or absent when
     * running. Written once per pause, never per tick — pause stores travelled
     * distance so that resuming preserves position even if the speed model
     * changed meanwhile.
     */
    private const val KEY_PAUSED_METRES = "pausedMetres"

    /**
     * The session's elapsed-realtime baseline, written once at start.
     *
     * This — not a periodically-updated travelled distance — is what a sticky
     * restart restores, so recovery costs no per-tick disk writes and the clock
     * stays the single source of truth. See docs/mock-location.md.
     */
    private const val KEY_START_REALTIME = "startRealtime"

    /**
     * Wall clock at start, stored only as a cross-check. elapsedRealtime resets
     * on boot, so a stored baseline greater than the current elapsed realtime
     * proves a reboot happened.
     */
    private const val KEY_START_WALL_CLOCK = "startWallClock"

    private const val ROUTE_PREFIX = "mock-route-"
    private const val ROUTE_SUFFIX = ".json"

    const val MODE_STATIC = "STATIC"
    const val MODE_ROUTE = "ROUTE"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveSession(context: Context, target: MockTarget) {
        prefs(context).edit()
            .putBoolean(KEY_ACTIVE, true)
            .putString(MockTarget.KEY_LAT, target.latitude.toString())
            .putString(MockTarget.KEY_LNG, target.longitude.toString())
            .putString(MockTarget.KEY_ALT, target.altitude.toString())
            .putFloat(MockTarget.KEY_ACC, target.accuracy)
            .putFloat(MockTarget.KEY_BEARING, target.bearing)
            .putFloat(MockTarget.KEY_SPEED, target.speed)
            .putLong(MockTarget.KEY_INTERVAL, target.intervalMs)
            .putString(MockTarget.KEY_LABEL, target.label)
            .apply()
    }

    /** Ends the session record. Does NOT touch the boot-interrupted flag. */
    fun clearSession(context: Context) {
        prefs(context).edit().putBoolean(KEY_ACTIVE, false).apply()
    }

    fun isActive(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ACTIVE, false)

    /**
     * The last target, whether or not the session is still marked active — the
     * UI restores it as the pre-filled selection either way.
     */
    fun lastTarget(context: Context): MockTarget? {
        val p = prefs(context)
        val lat = p.getString(MockTarget.KEY_LAT, null)?.toDoubleOrNull() ?: return null
        val lng = p.getString(MockTarget.KEY_LNG, null)?.toDoubleOrNull() ?: return null
        return MockTarget(
            latitude = lat,
            longitude = lng,
            altitude = p.getString(MockTarget.KEY_ALT, null)?.toDoubleOrNull() ?: 0.0,
            accuracy = p.getFloat(MockTarget.KEY_ACC, MockTarget.DEFAULT_ACCURACY_M),
            bearing = p.getFloat(MockTarget.KEY_BEARING, 0f),
            speed = p.getFloat(MockTarget.KEY_SPEED, 0f),
            intervalMs = p.getLong(MockTarget.KEY_INTERVAL, MockTarget.DEFAULT_INTERVAL_MS),
            label = p.getString(MockTarget.KEY_LABEL, null),
        )
    }

    /** Records the clocks and route settings that survive process death. */
    fun saveSessionClock(
        context: Context,
        sessionId: String,
        mode: String,
        startRealtime: Long,
        startWallClock: Long,
        endBehaviour: String?,
        speedKmh: Double?,
    ) {
        prefs(context).edit()
            .putString(KEY_SESSION_ID, sessionId)
            .putString(KEY_MODE, mode)
            .putLong(KEY_START_REALTIME, startRealtime)
            .putLong(KEY_START_WALL_CLOCK, startWallClock)
            .putString(KEY_END_BEHAVIOUR, endBehaviour)
            .putString(KEY_SPEED_KMH, speedKmh?.toString())
            .apply()
    }

    fun sessionId(context: Context): String? =
        prefs(context).getString(KEY_SESSION_ID, null)

    fun mode(context: Context): String =
        prefs(context).getString(KEY_MODE, MODE_STATIC) ?: MODE_STATIC

    fun startRealtime(context: Context): Long =
        prefs(context).getLong(KEY_START_REALTIME, 0L)

    fun startWallClock(context: Context): Long =
        prefs(context).getLong(KEY_START_WALL_CLOCK, 0L)

    fun endBehaviour(context: Context): String? =
        prefs(context).getString(KEY_END_BEHAVIOUR, null)

    fun speedKmh(context: Context): Double? =
        prefs(context).getString(KEY_SPEED_KMH, null)?.toDoubleOrNull()

    fun setPausedMetres(context: Context, metres: Double?) {
        prefs(context).edit().putString(KEY_PAUSED_METRES, metres?.toString()).apply()
    }

    fun pausedMetres(context: Context): Double? =
        prefs(context).getString(KEY_PAUSED_METRES, null)?.toDoubleOrNull()

    // ── Route geometry file ──────────────────────────────────────────────────

    private fun routeFile(context: Context, sessionId: String): File =
        File(context.applicationContext.filesDir, "$ROUTE_PREFIX$sessionId$ROUTE_SUFFIX")

    /**
     * Route points are far too large for SharedPreferences — 10k points is 20k
     * doubles — so they go to internal storage as a flat [lat, lng, ...] array.
     */
    fun writeRoute(context: Context, sessionId: String, flat: DoubleArray): Boolean = try {
        routeFile(context, sessionId).bufferedWriter().use { w ->
            w.write("[")
            for (i in flat.indices) {
                if (i > 0) w.write(",")
                w.write(flat[i].toString())
            }
            w.write("]")
        }
        true
    } catch (t: Throwable) {
        Log.w(MockLocationEngine.TAG, "could not write the route file", t)
        false
    }

    fun readRoute(context: Context, sessionId: String): DoubleArray? = try {
        val text = routeFile(context, sessionId).readText().trim()
        if (!text.startsWith("[") || !text.endsWith("]")) {
            null
        } else {
            val body = text.substring(1, text.length - 1)
            if (body.isBlank()) null
            else body.split(',').map { it.trim().toDouble() }.toDoubleArray()
        }
    } catch (t: Throwable) {
        Log.w(MockLocationEngine.TAG, "could not read the route file", t)
        null
    }

    /**
     * Removes every route file except [keepSessionId].
     *
     * Called on stop and again at process start, for the same reason the
     * test-provider sweep is: a crash must not leave debris that only a visit to
     * the feature screen would clean up.
     */
    fun sweepRouteFiles(context: Context, keepSessionId: String?) {
        val dir = context.applicationContext.filesDir ?: return
        val keep = keepSessionId?.let { "$ROUTE_PREFIX$it$ROUTE_SUFFIX" }
        runCatching {
            dir.listFiles { f ->
                f.isFile && f.name.startsWith(ROUTE_PREFIX) && f.name.endsWith(ROUTE_SUFFIX)
            }?.forEach { f ->
                if (f.name != keep && f.delete()) {
                    Log.i(MockLocationEngine.TAG, "swept stale route file ${f.name}")
                }
            }
        }
    }

    fun setBootInterrupted(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_BOOT_INTERRUPTED, value).apply()
    }

    /**
     * Read-only. Deliberately not a read-and-clear: the JS side has to be able
     * to ask without committing, because a screen that unmounts before its
     * async read resolves would otherwise swallow the notice permanently. The
     * flag is cleared explicitly once the user has actually seen it.
     */
    fun isBootInterrupted(context: Context): Boolean =
        prefs(context).getBoolean(KEY_BOOT_INTERRUPTED, false)
}
