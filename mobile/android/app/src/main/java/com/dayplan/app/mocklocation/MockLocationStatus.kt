package com.dayplan.app.mocklocation

import java.util.concurrent.CopyOnWriteArrayList

/**
 * Mirrors the `MockStatus` union in src/services/mockLocation.ts. The names are
 * the wire format — they cross to JS verbatim via `name`, so don't rename one
 * side without the other.
 *
 * UNSUPPORTED is never produced here; the JS wrapper synthesises it off Android.
 */
internal enum class MockStatus {
    UNSUPPORTED,
    PERMISSION_MISSING,
    NOT_SELECTED,
    READY,
    RUNNING,
}

internal data class MockStatusEvent(
    val status: MockStatus,
    val error: String? = null,
)

/**
 * A tiny in-process pub/sub between [MockLocationService] and
 * [MockLocationModule].
 *
 * The service and the React module always live in the same process, so a
 * broadcast (or the androidx LocalBroadcastManager dependency, which is
 * deprecated anyway) would be pure ceremony. The service is the only publisher;
 * the module is normally the only subscriber, but the list is thread-safe
 * because the service publishes from its injection thread while the module
 * subscribes on the JS thread.
 */
internal object MockLocationStatusBus {

    private val listeners = CopyOnWriteArrayList<(MockStatusEvent) -> Unit>()

    /**
     * Separate from the status listeners: progress fires roughly once a second
     * for the whole of a route, and folding it into the status channel would
     * mean every status subscriber re-rendering on every tick.
     */
    private val progressListeners = CopyOnWriteArrayList<(MockProgress) -> Unit>()

    /**
     * Last event published, used only to suppress duplicate emissions — a
     * long-running session would otherwise push an identical RUNNING event on
     * every tick. Null until the service publishes something.
     */
    @Volatile
    private var last: MockStatusEvent? = null

    /** @return an unsubscribe function. Safe to call more than once. */
    fun subscribe(listener: (MockStatusEvent) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    /** @return an unsubscribe function. */
    fun subscribeProgress(listener: (MockProgress) -> Unit): () -> Unit {
        progressListeners.add(listener)
        return { progressListeners.remove(listener) }
    }

    /**
     * Called from the injector thread. Never deduplicated — successive progress
     * values legitimately differ — and never blocking: the injection loop must
     * not be slowed by a slow or absent subscriber.
     */
    fun publishProgress(progress: MockProgress) {
        progressListeners.forEach { listener -> runCatching { listener(progress) } }
    }

    fun publish(event: MockStatusEvent) {
        if (event == last) return
        last = event
        listeners.forEach { listener ->
            // One bad subscriber must not stop the others (or kill the
            // injection thread this is called from).
            runCatching { listener(event) }
        }
    }

    /** Called when a session ends so the next start re-emits from a clean slate. */
    fun reset() {
        last = null
    }
}
