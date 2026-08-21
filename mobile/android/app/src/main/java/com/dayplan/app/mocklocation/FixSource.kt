package com.dayplan.app.mocklocation

/**
 * Live progress through a finite route. Null for sources that never finish.
 *
 * Reported to JS over the existing status bus and, far less often, to the
 * persistent notification.
 */
internal data class MockProgress(
    /** 0.0 at the start, 1.0 at the destination. */
    val fraction: Double,
    val metresTravelled: Double,
    val metresRemaining: Double,
    val speedMps: Float,
    val bearingDegrees: Float,
    /** Milliseconds to the destination at the current speed model, null if unknown. */
    val etaMs: Long?,
    val latitude: Double,
    val longitude: Double,
)

/**
 * Where the injected fix comes from at a given instant in a session.
 *
 * **Every implementation must be a pure function of `elapsedMs`.** Nothing may
 * accumulate across ticks — no `travelled += speed * interval`. That style
 * drifts, and worse, it lags permanently after a single missed tick and never
 * recovers.
 *
 * Purity is what makes a dropped tick free: [MockLocationService] recomputes
 * `elapsedMs` from [android.os.SystemClock.elapsedRealtime] on every tick, so
 * the next fix lands exactly where it should have regardless of what happened
 * to the previous one.
 *
 * That distinction is not academic here. `Handler.postDelayed` schedules on the
 * `uptimeMillis` clock, which does *not* advance during deep sleep, whereas
 * `elapsedRealtime` does. So the injection loop genuinely can stall with the
 * screen off and then resume — and when it does, position must jump to where
 * the wall clock says it belongs, not carry on from where it left off.
 *
 * Implementations must also be safe to call from the injector thread while the
 * main thread swaps sources: keep them immutable after construction.
 */
internal interface FixSource {

    /** The fix this many milliseconds after the session's clock baseline. */
    fun fixAt(elapsedMs: Long): MockTarget

    /** True once a finite route has been fully traversed. Always false for static. */
    fun isFinished(elapsedMs: Long): Boolean

    /** For the notification and the JS progress events. Null when not applicable. */
    fun progressAt(elapsedMs: Long): MockProgress?
}

/**
 * A location that doesn't move — the behaviour shipped and verified on device.
 *
 * Ignores elapsed time entirely, which is why swapping the target mid-session
 * does not need the session clock rebased.
 */
internal class StaticFixSource(private val target: MockTarget) : FixSource {

    override fun fixAt(elapsedMs: Long): MockTarget = target

    override fun isFinished(elapsedMs: Long): Boolean = false

    override fun progressAt(elapsedMs: Long): MockProgress? = null
}
