package com.dayplan.app.mocklocation

import android.content.Context

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
