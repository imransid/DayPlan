package com.dayplan.app.mocklocation

/** What happens once the destination is reached. */
internal enum class RouteEndBehaviour {
    /** Hold at the destination as a static fix. Never tears the session down. */
    STOP,

    /** Jump back to the start and drive it again. */
    LOOP,

    /** Turn around and drive back, forever. */
    PING_PONG;

    companion object {
        fun parse(raw: String?): RouteEndBehaviour =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: STOP
    }
}

/**
 * Drives a [RouteGeometry] according to a [SpeedModel].
 *
 * Pure in `elapsedMs`, per the [FixSource] contract: nothing here accumulates,
 * so the position after a stalled loop is the position the clock implies.
 */
internal class RouteFixSource(
    private val geometry: RouteGeometry,
    private val speed: SpeedModel,
    private val endBehaviour: RouteEndBehaviour,
    /**
     * Supplies the fields the route does not compute — accuracy, altitude,
     * injection interval and the label shown in the notification.
     */
    private val template: MockTarget,
) : FixSource {

    /**
     * Where one traversal has got to.
     *
     * [routeMetres] is measured from the route's start, so it runs backwards on
     * a ping-pong return leg. [profileMetres] is measured along the *speed*
     * profile and therefore always runs forwards — the ramps have to apply to
     * the leg being driven, not to the underlying geometry.
     */
    private data class Traversal(
        val routeMetres: Double,
        val profileMetres: Double,
        val lapElapsedMs: Long,
        val reversed: Boolean,
    )

    private fun traversalAt(elapsedMs: Long): Traversal {
        val period = speed.totalDurationMs
        val t = elapsedMs.coerceAtLeast(0L)
        if (period <= 0L) return Traversal(0.0, 0.0, 0L, false)

        return when (endBehaviour) {
            RouteEndBehaviour.STOP -> {
                val lap = t.coerceAtMost(period)
                val d = speed.distanceAt(lap)
                Traversal(d, d, lap, false)
            }

            RouteEndBehaviour.LOOP -> {
                val lap = t % period
                val d = speed.distanceAt(lap)
                Traversal(d, d, lap, false)
            }

            RouteEndBehaviour.PING_PONG -> {
                val cycle = t % (period * 2)
                if (cycle < period) {
                    val d = speed.distanceAt(cycle)
                    Traversal(d, d, cycle, false)
                } else {
                    val lap = cycle - period
                    val d = speed.distanceAt(lap)
                    // Same profile, walked from the far end.
                    Traversal(geometry.totalMetres - d, d, lap, true)
                }
            }
        }
    }

    /** Elapsed time at which this source is [metres] into its current leg. */
    fun elapsedForProfileMetres(metres: Double): Long = speed.elapsedForDistance(metres)

    override fun fixAt(elapsedMs: Long): MockTarget {
        val tr = traversalAt(elapsedMs)
        val point = geometry.pointAt(tr.routeMetres)

        // Segment bearings are stored in the route's own direction, so a return
        // leg is the reciprocal. A heading that never turns is the giveaway that
        // movement isn't real.
        val bearing =
            if (tr.reversed) (point.bearing + 180f) % 360f else point.bearing

        return template.copy(
            latitude = point.latitude,
            longitude = point.longitude,
            bearing = bearing,
            speed = speed.speedAt(tr.profileMetres),
        )
    }

    override fun isFinished(elapsedMs: Long): Boolean =
        endBehaviour == RouteEndBehaviour.STOP &&
            speed.totalDurationMs > 0L &&
            elapsedMs >= speed.totalDurationMs

    override fun progressAt(elapsedMs: Long): MockProgress {
        val tr = traversalAt(elapsedMs)
        val total = geometry.totalMetres
        val point = geometry.pointAt(tr.routeMetres)
        val period = speed.totalDurationMs

        // All three are measured along the *profile* — the leg being driven —
        // so they always agree with each other and with the ETA. Measuring
        // fraction on the geometry instead made it count down on a return leg
        // while the distance remaining also counted down.
        return MockProgress(
            fraction = if (total <= 0.0) 1.0 else (tr.profileMetres / total).coerceIn(0.0, 1.0),
            metresTravelled = tr.profileMetres,
            metresRemaining = (total - tr.profileMetres).coerceAtLeast(0.0),
            speedMps = speed.speedAt(tr.profileMetres),
            bearingDegrees =
                if (tr.reversed) (point.bearing + 180f) % 360f else point.bearing,
            etaMs = if (period <= 0L) null else (period - tr.lapElapsedMs).coerceAtLeast(0L),
            latitude = point.latitude,
            longitude = point.longitude,
            finished = isFinished(elapsedMs),
            reversed = tr.reversed,
        )
    }
}

/**
 * A [RouteFixSource] held at one instant.
 *
 * Pausing swaps the session's source for this rather than stopping the
 * injection loop: a paused route must keep pushing its frozen position, because
 * a fix that stops being refreshed goes stale within seconds and consumers
 * quietly fall back to the real GPS. Progress keeps flowing too, so the UI can
 * show where the user is standing while paused.
 */
internal class PausedRouteFixSource(
    val route: RouteFixSource,
    /** The elapsed value the route is frozen at. */
    val frozenElapsedMs: Long,
) : FixSource {

    override fun fixAt(elapsedMs: Long): MockTarget = route.fixAt(frozenElapsedMs)

    override fun isFinished(elapsedMs: Long): Boolean = route.isFinished(frozenElapsedMs)

    override fun progressAt(elapsedMs: Long): MockProgress? =
        route.progressAt(frozenElapsedMs)?.copy(paused = true)
}
