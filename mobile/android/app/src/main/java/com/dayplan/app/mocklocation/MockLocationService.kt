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
     * The live session: fix source, clock baseline and seed target as one
     * immutable value behind one volatile reference, so a swap is atomic and a
     * tick can never pair a new source with a stale baseline.
     */
    @Volatile
    private var session: Session? = null

    /**
     * Throttles, in elapsed-realtime millis. Progress goes to JS about once a
     * second; the notification is rewritten far less often because redrawing it
     * every second is a visible battery cost.
     */
    @Volatile
    private var lastProgressPublish: Long = 0L

    @Volatile
    private var lastNotificationUpdate: Long = 0L

    /**
     * Whether the "arrived" notification is already showing.
     *
     * A separate flag rather than a sentinel value in [lastNotificationUpdate]:
     * overloading the timestamp with -1 made the throttle comparison
     * `now - (-1) >= interval` true on every subsequent tick, so a finished
     * route re-posted its notification once a second, forever.
     */
    @Volatile
    private var arrivalShown: Boolean = false

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
            // One read: the source and its baseline always belong together.
            val active = session ?: return
            val lm = locationManager ?: return

            // Recomputed from the clock every tick, never accumulated, so a
            // late or dropped tick costs nothing — the next fix lands where the
            // elapsed time says it should rather than lagging by the stall.
            val elapsedMs = SystemClock.elapsedRealtime() - active.startRealtime
            val t = active.source.fixAt(elapsedMs)

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
            publishProgressThrottled(active, elapsedMs)

            // Re-checked *after* the push, not only before it: the session can
            // be torn down while we are injecting.
            if (!live) return
            injector?.postDelayed(this, t.intervalMs)
        }
    }

    /**
     * Emits progress to JS and, far less often, to the notification.
     *
     * Runs on the injector thread and must stay cheap: [MockLocationStatusBus]
     * hands off without blocking, and the React module drops the event outright
     * when no React instance is attached, so the loop is never gated on JS being
     * present or responsive.
     */
    private fun publishProgressThrottled(active: Session, elapsedMs: Long) {
        val progress = active.source.progressAt(elapsedMs) ?: return
        val now = SystemClock.elapsedRealtime()

        if (now - lastProgressPublish >= PROGRESS_INTERVAL_MS) {
            lastProgressPublish = now
            MockLocationStatusBus.publishProgress(progress)
        }

        if (progress.finished) {
            // Show arrival at once rather than up to 10s late, then stop
            // touching the notification entirely — nothing changes after this.
            if (!arrivalShown) {
                arrivalShown = true
                main.post { updateNotification(active.seed, progress) }
            }
            return
        }

        if (now - lastNotificationUpdate >= NOTIFICATION_INTERVAL_MS) {
            lastNotificationUpdate = now
            main.post { updateNotification(active.seed, progress) }
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
        // the process was killed. Recover from disk.
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

        return when {
            action == ACTION_UPDATE && isRunning -> {
                // Defence in depth — the module rejects this first. applyTarget
                // installs a StaticFixSource, so letting it through during a
                // route would silently replace the route with a frozen point.
                if (currentMode == MockSessionMode.STATIC) {
                    applyTarget(requested)
                } else {
                    Log.w(
                        MockLocationEngine.TAG,
                        "ignoring a static update() while a route session is running",
                    )
                }
                START_STICKY
            }

            action == ACTION_PAUSE -> {
                pauseRoute()
                START_STICKY
            }

            action == ACTION_RESUME -> {
                resumeRoute()
                START_STICKY
            }

            action == ACTION_START_ROUTE -> {
                startRouteSession(
                    // intent is smart-cast non-null here: a null intent would
                    // have made `action` null, and this branch unreachable.
                    sessionId = intent.getStringExtra(EXTRA_SESSION_ID)
                        ?: return START_NOT_STICKY,
                    template = requested,
                    endBehaviour = RouteEndBehaviour.parse(
                        intent.getStringExtra(EXTRA_END_BEHAVIOUR)
                    ),
                    speedKmh = intent.getDoubleExtra(EXTRA_SPEED_KMH, DEFAULT_SPEED_KMH),
                    resumeFromRealtime = null,
                )
                START_STICKY
            }

            // Null intent + a persisted route session = sticky restart mid-route.
            intent == null && MockLocationStore.mode(this) == MockLocationStore.MODE_ROUTE ->
                recoverRouteSession(requested)

            else -> {
                startSession(requested)
                START_STICKY
            }
        }
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

        installSession(StaticFixSource(t), seed = t, rebaseClock = true)
        MockLocationStore.saveSession(this, t)
        MockLocationStore.saveSessionClock(
            context = this,
            sessionId = "static",
            mode = MockLocationStore.MODE_STATIC,
            startRealtime = session?.startRealtime ?: SystemClock.elapsedRealtime(),
            startWallClock = System.currentTimeMillis(),
            endBehaviour = null,
            speedKmh = null,
        )
        val wakeLockWarning = acquireWakeLock()

        ensureInjectorThread()
        restartInjection()

        Log.i(
            MockLocationEngine.TAG,
            "session started at ${t.latitude},${t.longitude} on ${activeProviders.joinToString()}"
        )
        MockLocationStatusBus.publish(MockStatusEvent(MockStatus.RUNNING, wakeLockWarning))
        updateNotification(t)
    }

    /**
     * Starts (or resumes) a route.
     *
     * @param resumeFromRealtime the original clock baseline when recovering from
     * process death, so the route continues from where the elapsed time says it
     * should be. Null starts a fresh traversal. See docs/mock-location.md.
     */
    private fun startRouteSession(
        sessionId: String,
        template: MockTarget,
        endBehaviour: RouteEndBehaviour,
        speedKmh: Double,
        resumeFromRealtime: Long?,
    ) {
        val lm = locationManager
        if (lm == null) {
            stopSession(null, "This device has no location service.")
            return
        }

        val flat = MockLocationStore.readRoute(this, sessionId)
        if (flat == null || flat.size < 4) {
            stopSession(null, "The route data is missing or unreadable.")
            return
        }

        val geometry = try {
            val n = flat.size / 2
            val lat = DoubleArray(n) { flat[it * 2] }
            val lng = DoubleArray(n) { flat[it * 2 + 1] }
            RouteGeometry.fromPoints(lat, lng)
        } catch (e: IllegalArgumentException) {
            stopSession(null, e.message)
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

        val speed = ConstantSpeedModel.fromKmh(geometry.totalMetres, speedKmh)
        val route = RouteFixSource(geometry, speed, endBehaviour, template)

        // A session killed while paused must come back paused; restoring the
        // clock baseline alone would silently start it moving again.
        val pausedAt = MockLocationStore.pausedMetres(this)
        val source: FixSource =
            if (resumeFromRealtime != null && pausedAt != null) {
                PausedRouteFixSource(route, route.elapsedForProfileMetres(pausedAt))
            } else {
                route
            }

        val startRealtime = resumeFromRealtime ?: SystemClock.elapsedRealtime()
        setRunning(Session(source, startRealtime, template))

        MockLocationStore.saveSession(this, template)
        MockLocationStore.saveSessionClock(
            context = this,
            sessionId = sessionId,
            mode = MockLocationStore.MODE_ROUTE,
            startRealtime = startRealtime,
            startWallClock = System.currentTimeMillis(),
            endBehaviour = endBehaviour.name,
            speedKmh = speedKmh,
        )
        // Anything left from an earlier session is debris now.
        MockLocationStore.sweepRouteFiles(this, keepSessionId = sessionId)

        val wakeLockWarning = acquireWakeLock()
        ensureInjectorThread()
        restartInjection()

        Log.i(
            MockLocationEngine.TAG,
            "route session $sessionId: ${geometry.pointCount} points, " +
                "${geometry.totalMetres.toInt()} m, ${speed.totalDurationMs / 1000} s, " +
                "$endBehaviour" + if (resumeFromRealtime != null) " (resumed)" else "",
        )
        MockLocationStatusBus.publish(MockStatusEvent(MockStatus.RUNNING, wakeLockWarning))
        updateNotification(template)
    }

    /**
     * Freezes the route where it is, without stopping injection.
     *
     * The session keeps pushing the frozen fix: a location that stops being
     * refreshed goes stale within seconds and consumers fall back to the real
     * GPS, which would be a far more surprising outcome than standing still.
     */
    private fun pauseRoute() {
        val active = session ?: return
        val route = active.source as? RouteFixSource ?: return

        val elapsedMs = SystemClock.elapsedRealtime() - active.startRealtime
        val metres = route.progressAt(elapsedMs).metresTravelled

        setRunning(
            Session(PausedRouteFixSource(route, elapsedMs), active.startRealtime, active.seed)
        )
        MockLocationStore.setPausedMetres(this, metres)
        Log.i(MockLocationEngine.TAG, "route paused at ${metres.toInt()} m")

        MockLocationStatusBus.publish(MockStatusEvent(MockStatus.RUNNING))
        updateNotification(active.seed, session?.source?.progressAt(0L))
    }

    /**
     * Resumes by rebasing the clock so the route is exactly where the pause left
     * it, converting through distance rather than reusing the frozen elapsed
     * value — that is what makes position, not time, the thing preserved.
     */
    private fun resumeRoute() {
        val active = session ?: return
        val paused = active.source as? PausedRouteFixSource ?: return

        val metres = MockLocationStore.pausedMetres(this)
            ?: paused.route.progressAt(paused.frozenElapsedMs).metresTravelled
        val elapsedForMetres = paused.route.elapsedForProfileMetres(metres)

        setRunning(
            Session(
                paused.route,
                SystemClock.elapsedRealtime() - elapsedForMetres,
                active.seed,
            )
        )
        MockLocationStore.setPausedMetres(this, null)
        arrivalShown = false
        Log.i(MockLocationEngine.TAG, "route resumed at ${metres.toInt()} m")

        MockLocationStatusBus.publish(MockStatusEvent(MockStatus.RUNNING))
    }

    /**
     * START_STICKY recovery for a route.
     *
     * elapsedRealtime resets to ~0 on boot, so a stored baseline *greater* than
     * the current elapsed realtime can only mean the device rebooted. That goes
     * down the boot-interrupted path rather than silently resuming — the same
     * rule the boot receiver applies.
     */
    private fun recoverRouteSession(template: MockTarget): Int {
        val sessionId = MockLocationStore.sessionId(this)
        val storedStart = MockLocationStore.startRealtime(this)

        if (sessionId == null) {
            stopSession(null, null)
            return START_NOT_STICKY
        }

        if (storedStart > SystemClock.elapsedRealtime()) {
            Log.i(MockLocationEngine.TAG, "reboot detected during a route; not resuming")
            MockLocationStore.setBootInterrupted(this, true)
            stopSession(null, null)
            return START_NOT_STICKY
        }

        startRouteSession(
            sessionId = sessionId,
            template = template,
            endBehaviour = RouteEndBehaviour.parse(MockLocationStore.endBehaviour(this)),
            speedKmh = MockLocationStore.speedKmh(this) ?: DEFAULT_SPEED_KMH,
            // The whole point: keep the original baseline so the route is where
            // the clock says, not back at the start.
            resumeFromRealtime = storedStart,
        )
        return START_STICKY
    }

    private fun ensureInjectorThread() {
        if (injectorThread == null) {
            injectorThread = HandlerThread("dayplan-mock-location").also { it.start() }
            injector = Handler(injectorThread!!.looper)
        }
    }

    /**
     * The one place session state is written.
     *
     * `session`, `isRunning` and `currentMode` describe the same thing and have
     * to move together — assigning one and forgetting another is how a running
     * route ends up reporting READY, or a route session accepting a static-only
     * operation. Nothing else in this class assigns any of the three.
     */
    private fun setRunning(next: Session?) {
        session = next
        isRunning = next != null
        currentMode = next?.source?.mode
    }

    /**
     * Publishes a new session for the injection loop to read.
     *
     * @param rebaseClock restart elapsed time at zero. Required whenever the new
     * source's geometry differs from the old one, so positions are computed
     * against the right baseline. A static source ignores elapsed time, so it
     * genuinely does not care either way.
     */
    private fun installSession(source: FixSource, seed: MockTarget, rebaseClock: Boolean) {
        val startRealtime =
            if (rebaseClock) SystemClock.elapsedRealtime()
            else session?.startRealtime ?: SystemClock.elapsedRealtime()
        setRunning(Session(source, startRealtime, seed))
    }

    /** Move the target without tearing down providers or the loop. */
    private fun applyTarget(t: MockTarget) {
        installSession(StaticFixSource(t), seed = t, rebaseClock = false)
        MockLocationStore.saveSession(this, t)
        restartInjection()
        updateNotification(t)
    }

    /** @param finalStatus null to report whatever the real status is once we've stopped. */
    private fun stopSession(finalStatus: MockStatus?, error: String?) {
        retireInjection()
        setRunning(null)

        locationManager?.let { MockLocationEngine.removeProviders(it, activeProviders) }
        activeProviders = emptyList()

        MockLocationStore.clearSession(this)
        MockLocationStore.sweepRouteFiles(this, keepSessionId = null)
        MockLocationStore.setPausedMetres(this, null)
        lastProgressPublish = 0L
        lastNotificationUpdate = 0L
        arrivalShown = false
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
            setRunning(null)
        }
        retireInjection()
        injectorThread?.quitSafely()
        releaseWakeLock()
        super.onDestroy()
    }

    // ── Wake lock ────────────────────────────────────────────────────────────

    /**
     * @return null on success, or a user-facing warning when the lock could not
     * be taken.
     *
     * Failure is not fatal — the session still runs, and deriving position from
     * elapsed time means it stays correct rather than drifting. But it does mean
     * the loop can be suspended with the screen off and the fix go stale, which
     * the user has no other way to find out about. Previously this swallowed the
     * failure entirely: acquire() was wrapped in runCatching and nothing ever
     * checked isHeld afterwards.
     */
    private fun acquireWakeLock(): String? {
        if (wakeLock?.isHeld == true) return null

        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (pm == null) {
            Log.w(MockLocationEngine.TAG, "no PowerManager; running without a wake lock")
            return WAKE_LOCK_WARNING
        }

        val lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
            setReferenceCounted(false)
        }
        wakeLock = lock

        val held = runCatching {
            lock.acquire()
            lock.isHeld
        }.getOrElse { t ->
            Log.w(MockLocationEngine.TAG, "wake lock acquire threw", t)
            false
        }

        if (!held) {
            Log.w(
                MockLocationEngine.TAG,
                "wake lock not held after acquire — the injector may be suspended when the screen is off",
            )
            return WAKE_LOCK_WARNING
        }
        return null
    }

    private fun releaseWakeLock() {
        runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
        wakeLock = null
    }

    // ── Notification ─────────────────────────────────────────────────────────

    private fun notificationManager(): NotificationManager? =
        MockLocationEngine.notificationManager(this)

    private fun buildNotification(t: MockTarget?, progress: MockProgress? = null): Notification {
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
            .setContentText(notificationText(t, progress))
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

    private fun notificationText(t: MockTarget?, progress: MockProgress?): String {
        val where = t?.displayName() ?: return "Starting…"
        if (progress == null) return "Other apps see $where"
        if (progress.finished) return "Arrived at $where"
        val percent = (progress.fraction * 100).toInt()
        val km = progress.metresRemaining / 1000.0
        val kmh = (progress.speedMps * 3.6f).toInt()
        return String.format("%d%% · %.1f km left · %d km/h · %s", percent, km, kmh, where)
    }

    private fun updateNotification(t: MockTarget, progress: MockProgress? = null) {
        runCatching {
            notificationManager()?.notify(NOTIFICATION_ID, buildNotification(t, progress))
        }
    }

    companion object {
        private const val NOTIFICATION_ID = 8321
        private const val WAKE_LOCK_TAG = "DayPlan:MockLocation"

        /** Roughly once a second to JS. */
        private const val PROGRESS_INTERVAL_MS = 1_000L

        /** Far rarer for the notification — a 1 Hz redraw is a visible battery cost. */
        private const val NOTIFICATION_INTERVAL_MS = 10_000L


        /**
         * Surfaced on the status bus alongside RUNNING. Most likely cause is an
         * OEM battery manager, which is why the remedy points at the Doze
         * exemption the screen already offers.
         */
        const val WAKE_LOCK_WARNING =
            "Android wouldn't let DayPlan keep the CPU awake, so the simulated location " +
                "may stall while the screen is off. Exempting DayPlan from battery " +
                "optimisation usually fixes this."

        const val ACTION_START = "com.dayplan.app.mocklocation.START"
        const val ACTION_START_ROUTE = "com.dayplan.app.mocklocation.START_ROUTE"
        const val ACTION_PAUSE = "com.dayplan.app.mocklocation.PAUSE"
        const val ACTION_RESUME = "com.dayplan.app.mocklocation.RESUME"
        const val EXTRA_SESSION_ID = "sessionId"
        const val EXTRA_END_BEHAVIOUR = "endBehaviour"
        const val EXTRA_SPEED_KMH = "speedKmh"

        /** Used when a stored session has no speed recorded. */
        const val DEFAULT_SPEED_KMH = 50.0
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

        /**
         * Which mode the live session is, or null when nothing is running.
         *
         * Read by the React module so static-only and route-only operations can
         * be rejected with a clear code instead of quietly doing the wrong
         * thing. Written only by setRunning, alongside isRunning.
         */
        @Volatile
        var currentMode: MockSessionMode? = null
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

        fun startRoute(
            context: Context,
            sessionId: String,
            template: MockTarget,
            endBehaviour: String,
            speedKmh: Double,
        ) {
            send(
                context,
                template.writeTo(
                    Intent(context, MockLocationService::class.java)
                        .setAction(ACTION_START_ROUTE)
                        .putExtra(EXTRA_SESSION_ID, sessionId)
                        .putExtra(EXTRA_END_BEHAVIOUR, endBehaviour)
                        .putExtra(EXTRA_SPEED_KMH, speedKmh)
                ),
            )
        }

        fun pause(context: Context) {
            runCatching {
                context.startService(
                    Intent(context, MockLocationService::class.java).setAction(ACTION_PAUSE)
                )
            }
        }

        fun resume(context: Context) {
            runCatching {
                context.startService(
                    Intent(context, MockLocationService::class.java).setAction(ACTION_RESUME)
                )
            }
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
