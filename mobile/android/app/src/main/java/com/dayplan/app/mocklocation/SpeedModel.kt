package com.dayplan.app.mocklocation

import kotlin.math.sqrt

/**
 * Distance travelled as a function of elapsed time.
 *
 * Kept separate from [RouteGeometry] because the two vary independently: the
 * same polyline can be driven at a fixed speed or at the routing API's own
 * per-step timings, and step 4 adds the latter as another implementation here
 * without touching geometry or interpolation.
 *
 * Implementations must be pure and immutable — see [FixSource].
 */
internal interface SpeedModel {

    /** How long one full traversal takes, milliseconds. */
    val totalDurationMs: Long

    /** Metres travelled after this many milliseconds. Clamped to the route length. */
    fun distanceAt(elapsedMs: Long): Double

    /** Speed in m/s at a given distance along the profile. */
    fun speedAt(metres: Double): Float

    /**
     * The elapsed time at which [distanceAt] reaches [metres] — the inverse of
     * [distanceAt].
     *
     * Resuming from a pause rebases the session clock through this, because
     * pause stores travelled *distance* rather than elapsed time (see
     * docs/mock-location.md). Bisection rather than an algebraic inverse so
     * every implementation gets it for free; distanceAt is monotonic
     * non-decreasing, which is all convergence needs.
     */
    fun elapsedForDistance(metres: Double): Long {
        val target = metres.coerceAtLeast(0.0)
        var lo = 0L
        var hi = totalDurationMs
        while (hi - lo > 1L) {
            val mid = lo + (hi - lo) / 2
            if (distanceAt(mid) < target) lo = mid else hi = mid
        }
        return hi
    }
}

/**
 * A fixed cruise speed with a gentle ramp at each end.
 *
 * Starting and stopping instantly is the most obvious tell that a track is
 * synthetic — a real vehicle's speed trace never contains a vertical edge. The
 * ramps are constant-acceleration over [rampMetres] at each end:
 *
 *     a = v² / 2R          (from v² = 2·a·R)
 *     accelerating:  s(t) = ½·a·t²      for t ≤ 2R/v
 *     cruising:      s(t) = R + v·(t − t₁)
 *     decelerating:  mirror of the acceleration phase
 *
 * On a route shorter than two ramps the ramp is halved so the profile is
 * accelerate-then-decelerate with no cruise, which stays continuous.
 */
internal class ConstantSpeedModel(
    private val totalMetres: Double,
    cruiseMetresPerSecond: Double,
    rampMetres: Double = DEFAULT_RAMP_M,
) : SpeedModel {

    private val cruise: Double = cruiseMetresPerSecond.coerceAtLeast(MIN_SPEED_MPS)

    /**
     * Capped at half the route length — one ramp at each end. At the cap the
     * two ramps meet and there is no cruise phase at all, which is the intended
     * profile for anything shorter than two full ramps.
     */
    private val ramp: Double = rampMetres.coerceIn(0.0, totalMetres / 2.0)

    /** Acceleration implied by reaching [cruise] over [ramp] metres. */
    private val acceleration: Double =
        if (ramp <= 0.0) 0.0 else (cruise * cruise) / (2.0 * ramp)

    private val rampSeconds: Double = if (ramp <= 0.0) 0.0 else 2.0 * ramp / cruise

    private val cruiseSeconds: Double =
        ((totalMetres - 2.0 * ramp).coerceAtLeast(0.0)) / cruise

    private val totalSeconds: Double = rampSeconds * 2.0 + cruiseSeconds

    override val totalDurationMs: Long = (totalSeconds * 1000.0).toLong()

    override fun distanceAt(elapsedMs: Long): Double {
        if (totalMetres <= 0.0) return 0.0
        val t = (elapsedMs.coerceAtLeast(0L) / 1000.0)
        if (t >= totalSeconds) return totalMetres

        return when {
            t < rampSeconds -> 0.5 * acceleration * t * t
            t < rampSeconds + cruiseSeconds -> ramp + cruise * (t - rampSeconds)
            else -> {
                val td = t - rampSeconds - cruiseSeconds
                (totalMetres - ramp) + cruise * td - 0.5 * acceleration * td * td
            }
        }.coerceIn(0.0, totalMetres)
    }

    override fun speedAt(metres: Double): Float {
        if (totalMetres <= 0.0 || ramp <= 0.0) return cruise.toFloat()
        val s = metres.coerceIn(0.0, totalMetres)
        // v = √(2·a·s) on the way up, mirrored on the way down.
        return when {
            s < ramp -> cruise * sqrt(s / ramp)
            s > totalMetres - ramp -> cruise * sqrt((totalMetres - s) / ramp)
            else -> cruise
        }.toFloat()
    }

    companion object {
        /** Roughly a city block — long enough to look natural, short enough not to distort a short route. */
        const val DEFAULT_RAMP_M = 50.0

        /** Guards against a zero or negative speed producing an infinite duration. */
        const val MIN_SPEED_MPS = 0.1

        fun fromKmh(totalMetres: Double, kmh: Double): ConstantSpeedModel =
            ConstantSpeedModel(totalMetres, kmh / 3.6)
    }
}
