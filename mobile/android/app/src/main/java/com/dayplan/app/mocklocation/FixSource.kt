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
    /**
     * True once a STOP route has arrived. The session deliberately keeps
     * running and holding the final fix — snapping the user back to their real
     * location without warning would be worse than standing at the destination.
     */
    val finished: Boolean = false,
)

/**
 * Where the injected fix comes from at a given instant in a session.
 *
 * **Every implementation must be a pure function of `elapsedMs`.** Nothing may
 * accumulate across ticks — no `travelled += speed * interval`. Recomputing
 * position from the session's clock baseline on every tick is self-correcting;
 * an accumulator is not, and a single missed or late tick leaves it lagging
 * permanently.
 *
 * That matters even though [MockLocationService] holds a PARTIAL_WAKE_LOCK,
 * which by contract prevents CPU suspend — so while it is genuinely held there
 * is no deep sleep and the loop ticks on schedule. The reasons to derive rather
 * than accumulate are the ways that assumption fails, plus one that has nothing
 * to do with sleep at all:
 *
 *  - **The lock may not actually be held.** Acquisition can fail, and the
 *    service treats that as non-fatal so a session still starts.
 *  - **OEM battery managers strip wake locks** regardless of what the contract
 *    says. Aggressive ROMs are explicitly a known limitation of this feature.
 *  - **Tick jitter accumulates without bound.** `postDelayed` guarantees *at
 *    least* the delay, never exactly it; add the duration of each push and an
 *    accumulator drifts steadily even on a perfectly awake device.
 *  - **`elapsedRealtime` is immune to wall-clock changes**, unlike
 *    `currentTimeMillis` — an NTP correction or a manual clock change cannot
 *    move the simulated position.
 *
 * The wake lock is still load-bearing, not redundant: without it the loop stops
 * ticking with the screen off and the fix goes stale, which is a different and
 * worse failure than drift. Deriving from elapsed time is what makes the
 * recovery correct when it is dropped anyway.
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

/**
 * One session's immutable (source, clock baseline, seed) triple.
 *
 * Held behind a single volatile reference so swapping sources is atomic. Read
 * separately, the injector thread could pick up a new [source] against the old
 * [startRealtime] — for a route that is a position jump to a point on the wrong
 * geometry. One reference means a tick sees a wholly old or wholly new session,
 * never a mixture.
 */
internal data class Session(
    val source: FixSource,
    /** [android.os.SystemClock.elapsedRealtime] at the moment elapsed time is zero. */
    val startRealtime: Long,
    /** What seeded the session — drives the notification and the persisted record. */
    val seed: MockTarget,
)
