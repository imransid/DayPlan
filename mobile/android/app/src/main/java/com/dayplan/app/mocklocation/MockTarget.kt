package com.dayplan.app.mocklocation

import android.content.Intent
import android.os.Bundle
import com.facebook.react.bridge.ReadableMap

/**
 * A validated mock-location target.
 *
 * Deliberately a plain data class rather than a Parcelable: kotlin-parcelize
 * isn't applied in this module's build.gradle and adding it for one class isn't
 * worth it. [writeTo] / [fromIntent] move it across the module -> service
 * boundary as flat extras instead.
 */
internal data class MockTarget(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val accuracy: Float,
    val bearing: Float,
    val speed: Float,
    val intervalMs: Long,
    val label: String?,
) {
    /** What the persistent notification shows. */
    fun displayName(): String =
        label?.takeIf { it.isNotBlank() }
            ?: String.format("%.5f, %.5f", latitude, longitude)

    fun writeTo(intent: Intent): Intent = intent.apply {
        putExtra(KEY_LAT, latitude)
        putExtra(KEY_LNG, longitude)
        putExtra(KEY_ALT, altitude)
        putExtra(KEY_ACC, accuracy)
        putExtra(KEY_BEARING, bearing)
        putExtra(KEY_SPEED, speed)
        putExtra(KEY_INTERVAL, intervalMs)
        putExtra(KEY_LABEL, label)
    }

    fun toBundle(): Bundle = Bundle().apply {
        putDouble(KEY_LAT, latitude)
        putDouble(KEY_LNG, longitude)
        putDouble(KEY_ALT, altitude)
        putFloat(KEY_ACC, accuracy)
        putFloat(KEY_BEARING, bearing)
        putFloat(KEY_SPEED, speed)
        putLong(KEY_INTERVAL, intervalMs)
        putString(KEY_LABEL, label)
    }

    companion object {
        const val KEY_LAT = "latitude"
        const val KEY_LNG = "longitude"
        const val KEY_ALT = "altitude"
        const val KEY_ACC = "accuracy"
        const val KEY_BEARING = "bearing"
        const val KEY_SPEED = "speed"
        const val KEY_INTERVAL = "intervalMs"
        const val KEY_LABEL = "label"

        /**
         * Anything at or below zero fails Location.isComplete() and gets the fix
         * rejected outright, so 0 is never a legal accuracy. 3 m reads as a good
         * GPS lock without claiming implausible precision.
         */
        const val DEFAULT_ACCURACY_M = 3.0f
        const val DEFAULT_INTERVAL_MS = 1_000L

        /**
         * Below ~250 ms we're just burning battery — no consumer samples that
         * fast. Above 60 s the fix is stale enough that Play Services starts
         * preferring the real one, which defeats the point.
         */
        const val MIN_INTERVAL_MS = 250L
        const val MAX_INTERVAL_MS = 60_000L

        /**
         * Parses and validates the JS-supplied options object.
         *
         * @throws IllegalArgumentException with a message safe to surface in the UI.
         */
        fun fromReadableMap(map: ReadableMap?): MockTarget {
            requireNotNull(map) { "Mock location options are required." }

            val lat = map.optDouble(KEY_LAT)
                ?: throw IllegalArgumentException("latitude is required.")
            val lng = map.optDouble(KEY_LNG)
                ?: throw IllegalArgumentException("longitude is required.")

            require(!lat.isNaN() && lat >= -90.0 && lat <= 90.0) {
                "latitude must be between -90 and 90 (got $lat)."
            }
            require(!lng.isNaN() && lng >= -180.0 && lng <= 180.0) {
                "longitude must be between -180 and 180 (got $lng)."
            }

            val accuracy = map.optDouble(KEY_ACC)?.toFloat() ?: DEFAULT_ACCURACY_M
            require(accuracy > 0f && !accuracy.isNaN()) {
                "accuracy must be greater than 0 (got $accuracy)."
            }

            return MockTarget(
                latitude = lat,
                longitude = lng,
                altitude = map.optDouble(KEY_ALT) ?: 0.0,
                accuracy = accuracy,
                bearing = map.optDouble(KEY_BEARING)?.toFloat() ?: 0f,
                speed = map.optDouble(KEY_SPEED)?.toFloat() ?: 0f,
                intervalMs = (map.optDouble(KEY_INTERVAL)?.toLong() ?: DEFAULT_INTERVAL_MS)
                    .coerceIn(MIN_INTERVAL_MS, MAX_INTERVAL_MS),
                label = map.optString(KEY_LABEL),
            )
        }

        fun fromIntent(intent: Intent?): MockTarget? {
            if (intent == null || !intent.hasExtra(KEY_LAT) || !intent.hasExtra(KEY_LNG)) return null
            return MockTarget(
                latitude = intent.getDoubleExtra(KEY_LAT, 0.0),
                longitude = intent.getDoubleExtra(KEY_LNG, 0.0),
                altitude = intent.getDoubleExtra(KEY_ALT, 0.0),
                accuracy = intent.getFloatExtra(KEY_ACC, DEFAULT_ACCURACY_M),
                bearing = intent.getFloatExtra(KEY_BEARING, 0f),
                speed = intent.getFloatExtra(KEY_SPEED, 0f),
                intervalMs = intent.getLongExtra(KEY_INTERVAL, DEFAULT_INTERVAL_MS),
                label = intent.getStringExtra(KEY_LABEL),
            )
        }

        private fun ReadableMap.optDouble(key: String): Double? =
            if (hasKey(key) && !isNull(key)) getDouble(key) else null

        private fun ReadableMap.optString(key: String): String? =
            if (hasKey(key) && !isNull(key)) getString(key) else null
    }
}
