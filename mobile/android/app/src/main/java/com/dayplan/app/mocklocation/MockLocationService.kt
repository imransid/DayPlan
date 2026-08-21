package com.dayplan.app.mocklocation

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.dayplan.app.MainActivity
import com.dayplan.app.R
import java.util.concurrent.atomic.AtomicInteger

/**
 * Foreground service that keeps the fake fix alive.
 *
 * Why a service and not a JS timer: a single setTestProviderLocation() call
 * goes stale within seconds, after which consumers silently fall back to the
 * real fix. The location has to be re-pushed on a ~1 s cadence, and that has to
 * survive the RN app being backgrounded or its JS context being torn down —
 * which rules out anything driven from JS.
 *
 * Why a wake lock on top of the foreground service: an FGS keeps the *process*
 * alive but does not keep the CPU from suspending once the screen is off, and a
 * suspended CPU means the injection Handler stops firing and the fix goes
 * stale. WAKE_LOCK was already declared for the hourly alarms.
 */
internal class MockLocationService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var injectorThread: HandlerThread? = null
    private var injector: Handler? = null
    private val main = Handler(Looper.getMainLooper())

    /**
     * Seeds the notification and the persisted session record. For a static
     * session this is also exactly what gets injected.
     */
    @Volatile
    private var target: MockTarget? = null

    /**
     * Produces the fix for each tick. Static today; route sources slot in here
     * without the injection loop below changing at all.
     */
    @Volatile
    private var fixSource: FixSource? = null

    /**
     * Baseline for elapsed time, captured once per session.
     *
     * elapsedRealtime rather than uptimeMillis or currentTimeMillis: it counts
     * through deep sleep (so a screen-off stretch advances position correctly)
     * and is immune to the wall clock being changed under us.
     */
    @Volatile
    private var sessionStartRealtime: Long = 0L

    @Volatile
    private var activeProviders: List<String> = emptyList()

    private val locationManager: LocationManager? by lazy { MockLocationEngine.locationManager(this) }

    /**
     * Monotonic session id, bumped every time injection is (re)started or
     * retired.
     *
     * removeCallbacks alone cannot close the teardown race: it only unschedules
     * a tick that has not started yet. A tick that is already mid-push when
     * stopSession runs would re-arm itself with postDelayed afterwards and
     * resurrect a torn-down session. Each tick therefore carries the generation
     * it was created in and refuses to re-arm once that generation is retired.
     */
    private val generation = AtomicInteger(0)

    private inner class InjectionTick(private val id: Int) : Runnable {

        private val live: Boolean get() = id == generation.get()

        override fun run() {
            if (!live) return
            val source = fixSource ?: return
            val lm = locationManager ?: return

            // Recomputed from the wall clock every tick, never accumulated. A
            // tick dropped to Doze or a slow push therefore costs nothing: the
            // next fix lands where the elapsed time says it should, instead of
            // lagging by however long we were stalled.
            val elapsedMs = SystemClock.elapsedRealtime() - sessionStartRealtime
            val t = source.fixAt(elapsedMs)

            try {
                val accepted = MockLocationEngine.push(lm, activeProviders, t)
                if (accepted == 0) {
                    Log.w(MockLocationEngine.TAG, "no provider accepted the fix this tick")
                }
            } catch (e: MockLocationNotSelectedException) {
                // The user switched the mock location app away mid-session.
                main.post { stopSession(MockStatus.NOT_SELECTED, e.message) }
                return
            } catch (t2: Throwable) {
                Log.w(MockLocationEngine.TAG, "injection tick failed", t2)
            }
            // Re-checked *after* the push, not only before it: the session can
            // be torn down while we are injecting.
            if (!live) return
            injector?.postDelayed(this, t.intervalMs)
        }
    }

    /** Retires any in-flight tick and schedules a fresh one. */
    private fun restartInjection() {
        val tick = InjectionTick(generation.incrementAndGet())
        injector?.let { h ->
            h.removeCallbacksAndMessages(null)
            h.post(tick)
        }
    }

    /** Retires any in-flight tick without scheduling another. */
    private fun retireInjection() {
        generation.incrementAndGet()
        injector?.removeCallbacksAndMessages(null)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        if (action == ACTION_STOP) {
            stopSession(null, null)
            return START_NOT_STICKY
        }

        // A null intent means the system restarted us under START_STICKY after
        // the process was killed. Recover the target from disk.
        val requested = MockTarget.fromIntent(intent)
            ?: MockLocationStore.lastTarget(this)?.takeIf { MockLocationStore.isActive(this) }

        // Enter the foreground before anything else can fail: when we were
        // launched with startForegroundService() the platform gives us a few
        // seconds to call startForeground() or it kills us outright.
        if (!promoteToForeground(requested)) return START_NOT_STICKY

        if (requested == null) {
            // Sticky restart for a session the user had already ended.
            stopSession(null, null)
            return START_NOT_STICKY
        }

        if (action == ACTION_UPDATE && isRunning) {
            applyTarget(requested)
        } else {
            startSession(requested)
        }
        return START_STICKY
    }

    /** @return false if we could not legally go foreground; the service is stopping. */
    private fun promoteToForeground(t: MockTarget?): Boolean {
        // Two hard preconditions:
        //  - On Android 14+ a `location`-typed FGS without ACCESS_FINE_LOCATION
        //    is a SecurityException, so check rather than crash.
        //  - On Android 13+ startForeground still succeeds with POST_NOTIFICATIONS
        //    denied, it just shows nothing. That would leave the session running
        //    invisibly with no Stop action, so we refuse instead.
        val missing = MockLocationEngine.missingPermissionMessage(this)
        if (missing != null) {
            MockLocationStatusBus.publish(
                MockStatusEvent(MockStatus.PERMISSION_MISSING, missing)
            )
            MockLocationStore.clearSession(this)
            stopSelf()
            return false
        }

        return try {
            MockLocationEngine.ensureChannel(this)
            val notification = buildNotification(t)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            true
        } catch (t2: Throwable) {
            // ForegroundServiceStartNotAllowedException (background start),
            // MissingForegroundServiceTypeException, or an OEM-specific refusal.
            Log.e(MockLocationEngine.TAG, "startForeground failed", t2)
            MockLocationStatusBus.publish(
                MockStatusEvent(
                    MockLocationEngine.computeStatus(this),
                    "Android refused to start the location service: ${t2.message ?: t2::class.java.simpleName}"
                )
            )
            MockLocationStore.clearSession(this)
            stopSelf()
            false
        }
    }

    private fun startSession(t: MockTarget) {
        val lm = locationManager
        if (lm == null) {
            stopSession(null, "This device has no location service.")
            return
        }

        try {
            activeProviders = MockLocationEngine.addProviders(lm)
        } catch (e: MockLocationNotSelectedException) {
            stopSession(MockStatus.NOT_SELECTED, e.message)
            return
        } catch (t2: Throwable) {
            stopSession(null, t2.message)
            return
        }

        target = t
        installFixSource(StaticFixSource(t), rebaseClock = true)
        isRunning = true
        MockLocationStore.saveSession(this, t)
        acquireWakeLock()

        if (injectorThread == null) {
            injectorThread = HandlerThread("dayplan-mock-location").also { it.start() }
            injector = Handler(injectorThread!!.looper)
        }
        restartInjection()

        Log.i(
            MockLocationEngine.TAG,
            "session started at ${t.latitude},${t.longitude} on ${activeProviders.joinToString()}"
        )
        MockLocationStatusBus.publish(MockStatusEvent(MockStatus.RUNNING))
        updateNotification(t)
    }

    /**
     * Installs the source the injection loop reads from.
     *
     * @param rebaseClock restart elapsed time at zero. Required whenever the new
     * source's geometry differs from the old one, so positions are computed
     * against the right baseline. A static source ignores elapsed time, so it
     * genuinely does not care either way.
     */
    private fun installFixSource(source: FixSource, rebaseClock: Boolean) {
        if (rebaseClock) sessionStartRealtime = SystemClock.elapsedRealtime()
        fixSource = source
    }

    /** Move the target without tearing down providers or the loop. */
    private fun applyTarget(t: MockTarget) {
        target = t
        installFixSource(StaticFixSource(t), rebaseClock = false)
        MockLocationStore.saveSession(this, t)
        restartInjection()
        updateNotification(t)
    }

    /** @param finalStatus null to report whatever the real status is once we've stopped. */
    private fun stopSession(finalStatus: MockStatus?, error: String?) {
        retireInjection()
        target = null
        fixSource = null
        isRunning = false

        locationManager?.let { MockLocationEngine.removeProviders(it, activeProviders) }
        activeProviders = emptyList()

        MockLocationStore.clearSession(this)
        releaseWakeLock()

        injectorThread?.quitSafely()
        injectorThread = null
        injector = null

        MockLocationStatusBus.publish(
            MockStatusEvent(finalStatus ?: MockLocationEngine.computeStatus(this), error)
        )
        MockLocationStatusBus.reset()

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.i(MockLocationEngine.TAG, "session stopped ($finalStatus)")
    }

    override fun onDestroy() {
        // Belt and braces: if we're being torn down without stopSession having
        // run, the test providers would otherwise stay registered in
        // system_server and the device would keep reporting the fake fix.
        if (isRunning) {
            locationManager?.let { MockLocationEngine.removeProviders(it, activeProviders) }
            isRunning = false
        }
        retireInjection()
        injectorThread?.quitSafely()
        releaseWakeLock()
        super.onDestroy()
    }

    // ── Wake lock ────────────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
            setReferenceCounted(false)
            runCatching { acquire() }
        }
    }

    private fun releaseWakeLock() {
        runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
        wakeLock = null
    }

    // ── Notification ─────────────────────────────────────────────────────────

    private fun notificationManager(): NotificationManager? =
        MockLocationEngine.notificationManager(this)

    private fun buildNotification(t: MockTarget?): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, MockLocationService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, MockLocationEngine.CHANNEL_ID)
        } else {
            Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
        }

        return builder
            .setSmallIcon(R.drawable.ic_notification)
            // Deliberately blunt: the user should never be able to forget this
            // is on, or mistake it for a normal DayPlan notification.
            .setContentTitle("Your location is being simulated")
            .setContentText(
                t?.let { "Other apps see ${it.displayName()}" } ?: "Starting…"
            )
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(open)
            .addAction(
                Notification.Action.Builder(
                    null as Icon?, "Stop", stop
                ).build()
            )
            .build()
    }

    private fun updateNotification(t: MockTarget) {
        runCatching { notificationManager()?.notify(NOTIFICATION_ID, buildNotification(t)) }
    }

    companion object {
        private const val NOTIFICATION_ID = 8321
        private const val WAKE_LOCK_TAG = "DayPlan:MockLocation"

        const val ACTION_START = "com.dayplan.app.mocklocation.START"
        const val ACTION_UPDATE = "com.dayplan.app.mocklocation.UPDATE"
        const val ACTION_STOP = "com.dayplan.app.mocklocation.STOP"

        /**
         * Single source of truth for "are we injecting right now". Read from the
         * JS thread via MockLocationEngine.computeStatus, written on the main
         * thread by the service.
         */
        @Volatile
        var isRunning: Boolean = false
            private set

        private fun send(context: Context, intent: Intent) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun start(context: Context, target: MockTarget) {
            send(
                context,
                target.writeTo(
                    Intent(context, MockLocationService::class.java).setAction(ACTION_START)
                ),
            )
        }

        fun update(context: Context, target: MockTarget) {
            send(
                context,
                target.writeTo(
                    Intent(context, MockLocationService::class.java).setAction(ACTION_UPDATE)
                ),
            )
        }

        fun stop(context: Context) {
            // Not startForegroundService: if the service isn't running there is
            // nothing to promote, and we'd trip the "did not call
            // startForeground in time" watchdog for no reason.
            runCatching {
                context.startService(
                    Intent(context, MockLocationService::class.java).setAction(ACTION_STOP)
                )
            }
        }
    }
}
