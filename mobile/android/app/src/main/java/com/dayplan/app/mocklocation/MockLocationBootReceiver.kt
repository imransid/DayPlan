package com.dayplan.app.mocklocation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.dayplan.app.MainActivity
import com.dayplan.app.R

/**
 * Handles a reboot that interrupted an active session.
 *
 * We deliberately do NOT auto-resume. Silently putting the device back into a
 * faked location after a restart — with no interaction beyond the phone booting
 * — is exactly the behaviour that makes this kind of feature untrustworthy. The
 * session record is cleared and a dismissible notification offers to resume.
 *
 * (There are no test providers left to clean up here: they live in
 * system_server, which restarted along with everything else.)
 */
internal class MockLocationBootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!MockLocationStore.isActive(context)) return

        Log.i(MockLocationEngine.TAG, "reboot interrupted an active session; not auto-resuming")
        MockLocationStore.clearSession(context)
        MockLocationStore.setBootInterrupted(context, true)
        postResumePrompt(context)
    }

    private fun postResumePrompt(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return
        val label = MockLocationStore.lastTarget(context)?.displayName()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Simulated location alerts",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "Tells you when a simulated-location session ended unexpectedly."
                    setShowBadge(false)
                }
            )
        }

        val open = PendingIntent.getActivity(
            context,
            2,
            Intent(context, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            Notification.Builder(context).setPriority(Notification.PRIORITY_DEFAULT)
        }

        val notification = builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Location simulation stopped")
            .setContentText(
                label?.let { "Restarting the phone ended the session at $it. Tap to resume." }
                    ?: "Restarting the phone ended the session. Tap to resume."
            )
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()

        // No-op if POST_NOTIFICATIONS was never granted, which is fine — the
        // in-app banner covers that case via consumeBootInterrupted().
        runCatching { nm.notify(NOTIFICATION_ID, notification) }
    }

    private companion object {
        const val CHANNEL_ID = "dayplan-mock-location-info"
        const val NOTIFICATION_ID = 8322
    }
}
