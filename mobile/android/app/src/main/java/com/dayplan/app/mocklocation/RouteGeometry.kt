package com.dayplan.app.mocklocation

import android.location.Location
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * A polyline with its per-segment metrics precomputed once.
 *
 * Everything the injection loop needs is an array lookup plus a binary search:
 * no trigonometry per tick, and no allocation beyond the returned point.
 *
 * Distances and bearings come from [Location.distanceBetween], which is defined
 * on the WGS84 ellipsoid — more accurate than a hand-rolled spherical haversine,
 * and it yields the distance and the initial bearing from a single call.
 */
internal class RouteGeometry private constructor(
    private val latitudes: DoubleArray,
    private val longitudes: DoubleArray,
    /** `cumulative[i]` = metres from point 0 to point i. Strictly increasing. */
    private val cumulative: DoubleArray,
    /** `bearings[i]` = initial bearing of segment i to i+1, degrees. Size n-1. */
    private val bearings: FloatArray,
) {

    val pointCount: Int get() = latitudes.size

    val totalMetres: Double get() = cumulative[cumulative.size - 1]

    data class PointOnRoute(
        val latitude: Double,
        val longitude: Double,
        /** Direction of travel along the segment, degrees clockwise from north. */
        val bearing: Float,
    )

    /**
     * Position at [metres] along the route, clamped to the ends.
     *
     * Interpolation within a segment is linear in lat/lng rather than a
     * great-circle slerp: at the point spacing we generate (~10 m) the
     * difference is far below the accuracy we report, and this runs every tick.
     */
    fun pointAt(metres: Double): PointOnRoute {
        val clamped = metres.coerceIn(0.0, totalMetres)
        val i = segmentIndexFor(clamped)

        val segmentStart = cumulative[i]
        val segmentLength = cumulative[i + 1] - segmentStart
        // Zero-length segments are stripped at construction, so this is safe.
        val f = ((clamped - segmentStart) / segmentLength).coerceIn(0.0, 1.0)

        return PointOnRoute(
            latitude = latitudes[i] + (latitudes[i + 1] - latitudes[i]) * f,
            longitude = longitudes[i] + (longitudes[i + 1] - longitudes[i]) * f,
            bearing = bearings[i],
        )
    }

    /** Largest i such that `cumulative[i] <= metres`, bounded to a real segment. */
    private fun segmentIndexFor(metres: Double): Int {
        var lo = 0
        var hi = cumulative.size - 1
        while (lo < hi) {
            val mid = (lo + hi + 1) ushr 1
            if (cumulative[mid] <= metres) lo = mid else hi = mid - 1
        }
        return lo.coerceAtMost(cumulative.size - 2)
    }

    /** Flat [lat, lng, lat, lng, ...] for persisting to the route file. */
    fun toFlatArray(): DoubleArray {
        val out = DoubleArray(latitudes.size * 2)
        for (i in latitudes.indices) {
            out[i * 2] = latitudes[i]
            out[i * 2 + 1] = longitudes[i]
        }
        return out
    }

    companion object {

        /**
         * Hard ceiling on point count. A long road route can be tens of
         * thousands of points; callers simplify before getting here, and a route
         * still over the cap is reported rather than silently truncated.
         */
        const val MAX_POINTS = 10_000

        /** Target spacing for generated straight lines. */
        const val DEFAULT_SPACING_M = 10.0

        /**
         * Builds from an explicit polyline.
         *
         * Consecutive duplicate points are dropped: a zero-length segment would
         * divide by zero during interpolation, and routing APIs do emit them.
         *
         * @throws IllegalArgumentException on fewer than 2 usable points, a
         * point count above [MAX_POINTS], or a route with no length.
         */
        fun fromPoints(latitudes: DoubleArray, longitudes: DoubleArray): RouteGeometry {
            require(latitudes.size == longitudes.size) {
                "Route latitude and longitude arrays must be the same length."
            }
            require(latitudes.size >= 2) { "A route needs at least 2 points." }
            require(latitudes.size <= MAX_POINTS) {
                "Route has ${latitudes.size} points, more than the $MAX_POINTS supported. " +
                    "Simplify it further before starting."
            }

            val lat = ArrayList<Double>(latitudes.size)
            val lng = ArrayList<Double>(longitudes.size)
            val cum = ArrayList<Double>(latitudes.size)
            val bear = ArrayList<Float>(latitudes.size)
            val scratch = FloatArray(3)

            lat.add(latitudes[0])
            lng.add(longitudes[0])
            cum.add(0.0)

            for (i in 1 until latitudes.size) {
                val prevLat = lat[lat.size - 1]
                val prevLng = lng[lng.size - 1]
                Location.distanceBetween(prevLat, prevLng, latitudes[i], longitudes[i], scratch)
                val metres = scratch[0].toDouble()
                // Skip points that add no length — they would make a segment of
                // zero length and break the interpolation fraction.
                if (metres <= 0.0) continue
                bear.add(normaliseBearing(scratch[1]))
                lat.add(latitudes[i])
                lng.add(longitudes[i])
                cum.add(cum[cum.size - 1] + metres)
            }

            require(lat.size >= 2 && cum[cum.size - 1] > 0.0) {
                "The start and end points are the same, so there is no route to drive."
            }

            return RouteGeometry(
                latitudes = lat.toDoubleArray(),
                longitudes = lng.toDoubleArray(),
                cumulative = cum.toDoubleArray(),
                bearings = bear.toFloatArray(),
            )
        }

        /**
         * A great-circle path between two points, sampled every [spacingMetres].
         *
         * This is the offline fallback and the thing route mode is built against
         * first: it exercises the whole interpolation engine with no network. The
         * samples are true great-circle positions, so the per-segment linear
         * interpolation in [pointAt] only ever cuts a ~10 m chord.
         */
        fun straightLine(
            startLatitude: Double,
            startLongitude: Double,
            endLatitude: Double,
            endLongitude: Double,
            spacingMetres: Double = DEFAULT_SPACING_M,
        ): RouteGeometry {
            val scratch = FloatArray(1)
            Location.distanceBetween(
                startLatitude, startLongitude, endLatitude, endLongitude, scratch
            )
            val total = scratch[0].toDouble()
            require(total > 0.0) {
                "The start and end points are the same, so there is no route to drive."
            }

            val spacing = spacingMetres.coerceAtLeast(1.0)
            // +1 because n segments need n+1 points.
            val requested = ceil(total / spacing).toInt() + 1
            val count = requested.coerceIn(2, MAX_POINTS)

            val lat = DoubleArray(count)
            val lng = DoubleArray(count)
            for (i in 0 until count) {
                val f = i.toDouble() / (count - 1)
                slerp(startLatitude, startLongitude, endLatitude, endLongitude, f, i, lat, lng)
            }
            return fromPoints(lat, lng)
        }

        /**
         * Spherical linear interpolation along the great circle.
         *
         * Plain lat/lng averaging would bow away from the true path over long
         * distances and break down entirely near the poles.
         */
        private fun slerp(
            lat1Deg: Double,
            lng1Deg: Double,
            lat2Deg: Double,
            lng2Deg: Double,
            f: Double,
            index: Int,
            outLat: DoubleArray,
            outLng: DoubleArray,
        ) {
            val lat1 = Math.toRadians(lat1Deg)
            val lng1 = Math.toRadians(lng1Deg)
            val lat2 = Math.toRadians(lat2Deg)
            val lng2 = Math.toRadians(lng2Deg)

            val dLat = lat2 - lat1
            val dLng = lng2 - lng1
            val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2)
            val delta = 2 * atan2(sqrt(a), sqrt(1 - a))

            if (abs(delta) < 1e-12) {
                outLat[index] = lat1Deg
                outLng[index] = lng1Deg
                return
            }

            val aCoef = sin((1 - f) * delta) / sin(delta)
            val bCoef = sin(f * delta) / sin(delta)
            val x = aCoef * cos(lat1) * cos(lng1) + bCoef * cos(lat2) * cos(lng2)
            val y = aCoef * cos(lat1) * sin(lng1) + bCoef * cos(lat2) * sin(lng2)
            val z = aCoef * sin(lat1) + bCoef * sin(lat2)

            outLat[index] = Math.toDegrees(atan2(z, sqrt(x * x + y * y)))
            outLng[index] = Math.toDegrees(atan2(y, x))
        }

        /** distanceBetween returns bearings in -180..180; Location wants 0..360. */
        private fun normaliseBearing(bearing: Float): Float =
            ((bearing % 360f) + 360f) % 360f
    }
}
