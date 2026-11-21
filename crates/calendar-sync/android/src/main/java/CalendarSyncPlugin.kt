package com.arixlab.calendarsync

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.ContentValues
import android.database.ContentObserver
import android.database.Cursor
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.TimeZone
import java.util.concurrent.Executors

private const val ACCOUNT = "Atrix"
private const val ALIAS = "calendar"

@InvokeArg
class Upsert {
    var id: Long? = null
    var syncId: String = ""
    var signature: String? = null
    var title: String = ""
    var description: String = ""
    var dtstart: Long = 0
    var dtend: Long? = null
    var duration: String? = null
    var allDay: Boolean = false
    var rrule: String? = null
    var exdate: String? = null
    var timezone: String = "UTC"
}

@InvokeArg
class Clean {
    var id: Long = 0
    var syncId: String = ""
    var signature: String? = null
}

@InvokeArg
class ApplyArgs {
    var upserts: Array<Upsert> = arrayOf()
    var deletes: Array<Long> = arrayOf()
    var cleans: Array<Clean> = arrayOf()
}

@TauriPlugin(
    permissions = [
        Permission(
            strings = [Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR],
            alias = ALIAS
        )
    ]
)
class CalendarSyncPlugin(private val activity: Activity) : Plugin(activity) {

    private val worker = Executors.newSingleThreadExecutor()

    private var observer: ContentObserver? = null

    private val resolver get() = activity.contentResolver

    private fun asAdapter(uri: Uri): Uri = uri.buildUpon()
        .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(Calendars.ACCOUNT_NAME, ACCOUNT)
        .appendQueryParameter(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
        .build()

    private fun granted() = getPermissionState(ALIAS) == PermissionState.GRANTED

    private fun background(invoke: Invoke, work: () -> Unit) {
        worker.execute {
            try {
                work()
            } catch (e: Exception) {
                invoke.reject(e.message ?: e.toString())
            }
        }
    }

    private fun calendarId(): Long {
        resolver.query(
            Calendars.CONTENT_URI,
            arrayOf(Calendars._ID),
            "${Calendars.ACCOUNT_NAME} = ? AND ${Calendars.ACCOUNT_TYPE} = ?",
            arrayOf(ACCOUNT, CalendarContract.ACCOUNT_TYPE_LOCAL),
            null
        )?.use { if (it.moveToFirst()) return it.getLong(0) }

        val values = ContentValues().apply {
            put(Calendars.ACCOUNT_NAME, ACCOUNT)
            put(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            put(Calendars.NAME, ACCOUNT)
            put(Calendars.CALENDAR_DISPLAY_NAME, ACCOUNT)
            put(Calendars.CALENDAR_COLOR, 0xFF6366F1.toInt())
            put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER)
            put(Calendars.OWNER_ACCOUNT, ACCOUNT)
            put(Calendars.VISIBLE, 1)
            put(Calendars.SYNC_EVENTS, 1)
            put(Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().id)
        }
        val created = resolver.insert(asAdapter(Calendars.CONTENT_URI), values)
            ?: throw IllegalStateException("calendar_create_failed")

        return ContentUris.parseId(created)
    }

    private fun watch() {
        if (observer != null) {
            return
        }

        val next = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                trigger("change", JSObject())
            }
        }

        resolver.registerContentObserver(Events.CONTENT_URI, true, next)
        observer = next
    }

    @Command
    fun ensure(invoke: Invoke) {
        if (!granted()) {
            invoke.resolve(JSObject().put("granted", false))
            return
        }

        background(invoke) {
            calendarId()
            activity.runOnUiThread { watch() }
            invoke.resolve(JSObject().put("granted", true))
        }
    }

    private fun Cursor.text(column: String): Any {
        val index = getColumnIndexOrThrow(column)

        return if (isNull(index)) JSONObject.NULL else getString(index)
    }

    private fun Cursor.number(column: String): Any {
        val index = getColumnIndexOrThrow(column)

        return if (isNull(index)) JSONObject.NULL else getLong(index)
    }

    private fun Cursor.flag(column: String): Boolean {
        val index = getColumnIndexOrThrow(column)

        return !isNull(index) && getInt(index) != 0
    }

    @Command
    fun rows(invoke: Invoke) {
        background(invoke) {
            val id = calendarId()
            val rows = JSArray()
            val columns = arrayOf(
                Events._ID, Events._SYNC_ID, Events.SYNC_DATA2, Events.DIRTY, Events.DELETED,
                Events.TITLE, Events.DESCRIPTION, Events.DTSTART, Events.DTEND, Events.DURATION,
                Events.ALL_DAY, Events.RRULE, Events.EXDATE, Events.ORIGINAL_ID,
                Events.ORIGINAL_SYNC_ID, Events.ORIGINAL_INSTANCE_TIME, Events.STATUS
            )

            resolver.query(
                asAdapter(Events.CONTENT_URI),
                columns,
                "${Events.CALENDAR_ID} = ?",
                arrayOf(id.toString()),
                null
            )?.use { c ->
                while (c.moveToNext()) {
                    rows.put(JSObject().apply {
                        put("id", c.getLong(c.getColumnIndexOrThrow(Events._ID)))
                        put("syncId", c.text(Events._SYNC_ID))
                        put("signature", c.text(Events.SYNC_DATA2))
                        put("dirty", c.flag(Events.DIRTY))
                        put("deleted", c.flag(Events.DELETED))
                        put("title", (c.text(Events.TITLE) as? String) ?: "")
                        put("description", (c.text(Events.DESCRIPTION) as? String) ?: "")
                        put("dtstart", c.number(Events.DTSTART))
                        put("dtend", c.number(Events.DTEND))
                        put("duration", c.text(Events.DURATION))
                        put("allDay", c.flag(Events.ALL_DAY))
                        put("rrule", c.text(Events.RRULE))
                        put("exdate", c.text(Events.EXDATE))
                        put("originalId", c.number(Events.ORIGINAL_ID))
                        put("originalSyncId", c.text(Events.ORIGINAL_SYNC_ID))
                        put("originalInstanceTime", c.number(Events.ORIGINAL_INSTANCE_TIME))
                        put(
                            "canceled",
                            c.number(Events.STATUS) == Events.STATUS_CANCELED.toLong()
                        )
                    })
                }
            }

            invoke.resolve(JSObject().put("rows", rows))
        }
    }

    private fun valuesOf(row: Upsert) = ContentValues().apply {
        put(Events._SYNC_ID, row.syncId)
        put(Events.SYNC_DATA2, row.signature)
        put(Events.DIRTY, 0)
        put(Events.TITLE, row.title)
        put(Events.DESCRIPTION, row.description)
        put(Events.DTSTART, row.dtstart)
        put(Events.ALL_DAY, if (row.allDay) 1 else 0)
        put(Events.EVENT_TIMEZONE, row.timezone)

        if (row.rrule != null) {
            putNull(Events.DTEND)
            put(Events.DURATION, row.duration)
            put(Events.RRULE, row.rrule)
            put(Events.EXDATE, row.exdate)
        } else {
            put(Events.DTEND, row.dtend)
            putNull(Events.DURATION)
            putNull(Events.RRULE)
            putNull(Events.EXDATE)
        }
    }

    @Command
    fun apply(invoke: Invoke) {
        val args = invoke.parseArgs(ApplyArgs::class.java)

        background(invoke) {
            val calendar = calendarId()
            val events = asAdapter(Events.CONTENT_URI)

            for (row in args.upserts) {
                val values = valuesOf(row)
                val id = row.id

                if (id == null) {
                    values.put(Events.CALENDAR_ID, calendar)
                    resolver.insert(events, values)
                } else {
                    resolver.update(ContentUris.withAppendedId(events, id), values, null, null)
                }
            }

            for (id in args.deletes) {
                resolver.delete(ContentUris.withAppendedId(events, id), null, null)
            }

            for (clean in args.cleans) {
                val values = ContentValues().apply {
                    put(Events.DIRTY, 0)
                    put(Events._SYNC_ID, clean.syncId)
                    put(Events.SYNC_DATA2, clean.signature)
                }

                resolver.update(ContentUris.withAppendedId(events, clean.id), values, null, null)
            }

            invoke.resolve()
        }
    }

}
