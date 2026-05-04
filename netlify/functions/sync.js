const { Pool } = require("pg");
const { APP_USER_ID, isAuthenticated } = require("./_auth");

const DEFAULT_TIME_ROWS = [
  "07:00-08:00",
  "08:00-09:00",
  "09:00-10:00",
  "10:00-11:00",
  "11:00-12:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00"
];
const MAX_SYNC_BODY_BYTES = 3 * 1024 * 1024;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function normalizeState(input = {}) {
  const preferences = input.preferences || {};
  return {
    timeRows: Array.isArray(input.timeRows) && input.timeRows.length ? input.timeRows.map(String) : DEFAULT_TIME_ROWS,
    schedule: input.schedule && typeof input.schedule === "object" && !Array.isArray(input.schedule) ? input.schedule : {},
    reminders: Array.isArray(input.reminders) ? input.reminders : [],
    alarms: Array.isArray(input.alarms) ? input.alarms : [],
    profile: {
      photo: typeof input.profile?.photo === "string" ? input.profile.photo : ""
    },
    preferences: {
      theme: ["ocean", "pandora"].includes(preferences.theme) ? preferences.theme : "ocean",
      animations: typeof preferences.animations === "boolean" ? preferences.animations : true,
      alarmSound: typeof preferences.alarmSound === "boolean" ? preferences.alarmSound : true,
      pandoraMusicPaused: typeof preferences.pandoraMusicPaused === "boolean" ? preferences.pandoraMusicPaused : false,
      pandoraMusicVolume: Number.isFinite(Number(preferences.pandoraMusicVolume))
        ? Math.min(1, Math.max(0, Number(preferences.pandoraMusicVolume)))
        : 0.42
    }
  };
}

async function loadState(client) {
  const [profile, preferences, timeRows, subjects, reminders, alarms] = await Promise.all([
    client.query("SELECT photo_data_url FROM public.profiles WHERE user_id = $1", [APP_USER_ID]),
    client.query("SELECT theme, animations, alarm_sound, pandora_music_paused, pandora_music_volume FROM public.preferences WHERE user_id = $1", [APP_USER_ID]),
    client.query("SELECT id, label, position FROM public.schedule_time_rows WHERE user_id = $1 ORDER BY position", [APP_USER_ID]),
    client.query(
      `SELECT s.name, s.color, s.position, s.day_of_week, r.position AS row_position
       FROM public.schedule_subjects s
       JOIN public.schedule_time_rows r ON r.id = s.time_row_id
       WHERE s.user_id = $1
       ORDER BY r.position, s.day_of_week, s.position`,
      [APP_USER_ID]
    ),
    client.query(
      `SELECT id, title, description, reminder_date, reminder_time, priority, done
       FROM public.reminders
       WHERE user_id = $1
       ORDER BY done, reminder_date NULLS LAST, reminder_time NULLS LAST, created_at`,
      [APP_USER_ID]
    ),
    client.query(
      `SELECT id, alarm_time, label, days, active
       FROM public.alarms
       WHERE user_id = $1
       ORDER BY alarm_time, created_at`,
      [APP_USER_ID]
    )
  ]);

  const schedule = {};
  subjects.rows.forEach((subject) => {
    const key = `${subject.row_position}_${subject.day_of_week}`;
    if (!schedule[key]) schedule[key] = [];
    schedule[key].push({ name: subject.name, color: subject.color });
  });

  const prefs = preferences.rows[0] || {};

  return normalizeState({
    timeRows: timeRows.rows.length ? timeRows.rows.map((row) => row.label) : DEFAULT_TIME_ROWS,
    schedule,
    reminders: reminders.rows.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      desc: reminder.description || "",
      date: normalizeDate(reminder.reminder_date),
      time: normalizeTime(reminder.reminder_time),
      priority: reminder.priority,
      done: reminder.done
    })),
    alarms: alarms.rows.map((alarm) => ({
      id: alarm.id,
      time: normalizeTime(alarm.alarm_time),
      label: alarm.label,
      days: alarm.days || [],
      active: alarm.active
    })),
    profile: {
      photo: profile.rows[0]?.photo_data_url || ""
    },
    preferences: {
      theme: prefs.theme,
      animations: prefs.animations,
      alarmSound: prefs.alarm_sound,
      pandoraMusicPaused: prefs.pandora_music_paused,
      pandoraMusicVolume: prefs.pandora_music_volume === undefined ? undefined : Number(prefs.pandora_music_volume)
    }
  });
}

async function saveState(client, input) {
  const state = normalizeState(input);
  await client.query("BEGIN");

  try {
    await client.query(
      `INSERT INTO public.profiles (user_id, display_name, photo_data_url, updated_at)
       VALUES ($1, 'Duda', $2, now())
       ON CONFLICT (user_id) DO UPDATE SET photo_data_url = EXCLUDED.photo_data_url, updated_at = now()`,
      [APP_USER_ID, state.profile.photo || null]
    );

    await client.query(
      `INSERT INTO public.preferences (
        user_id, theme, animations, alarm_sound, pandora_music_paused, pandora_music_volume, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) DO UPDATE SET
        theme = EXCLUDED.theme,
        animations = EXCLUDED.animations,
        alarm_sound = EXCLUDED.alarm_sound,
        pandora_music_paused = EXCLUDED.pandora_music_paused,
        pandora_music_volume = EXCLUDED.pandora_music_volume,
        updated_at = now()`,
      [
        APP_USER_ID,
        state.preferences.theme,
        state.preferences.animations,
        state.preferences.alarmSound,
        state.preferences.pandoraMusicPaused,
        state.preferences.pandoraMusicVolume
      ]
    );

    await client.query("DELETE FROM public.schedule_subjects WHERE user_id = $1", [APP_USER_ID]);
    await client.query("DELETE FROM public.schedule_time_rows WHERE user_id = $1", [APP_USER_ID]);
    await client.query("DELETE FROM public.reminders WHERE user_id = $1", [APP_USER_ID]);
    await client.query("DELETE FROM public.alarms WHERE user_id = $1", [APP_USER_ID]);

    const rowIds = [];
    for (let index = 0; index < state.timeRows.length; index += 1) {
      const result = await client.query(
        `INSERT INTO public.schedule_time_rows (user_id, label, position)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [APP_USER_ID, state.timeRows[index], index]
      );
      rowIds[index] = result.rows[0].id;
    }

    for (const [key, subjects] of Object.entries(state.schedule)) {
      const [rowIndex, dayIndex] = key.split("_").map(Number);
      if (!rowIds[rowIndex] || !Number.isInteger(dayIndex)) continue;

      for (let index = 0; index < subjects.length; index += 1) {
        const subject = subjects[index] || {};
        if (!subject.name) continue;
        await client.query(
          `INSERT INTO public.schedule_subjects (user_id, time_row_id, day_of_week, name, color, position)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [APP_USER_ID, rowIds[rowIndex], dayIndex, String(subject.name), String(subject.color || "#1d6fc4"), index]
        );
      }
    }

    for (const reminder of state.reminders) {
      if (!reminder?.title) continue;
      await client.query(
        `INSERT INTO public.reminders (
          user_id, title, description, reminder_date, reminder_time, priority, done
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          APP_USER_ID,
          String(reminder.title),
          reminder.desc ? String(reminder.desc) : null,
          reminder.date || null,
          reminder.time || null,
          ["alta", "media", "baixa"].includes(reminder.priority) ? reminder.priority : "media",
          Boolean(reminder.done)
        ]
      );
    }

    for (const alarm of state.alarms) {
      if (!alarm?.time) continue;
      const days = Array.isArray(alarm.days) ? alarm.days.map(Number).filter((day) => day >= 0 && day <= 6) : [];
      await client.query(
        `INSERT INTO public.alarms (user_id, alarm_time, label, days, active)
         VALUES ($1, $2, $3, $4::smallint[], $5)`,
        [APP_USER_ID, alarm.time, String(alarm.label || "Alarme"), days, alarm.active !== false]
      );
    }

    await client.query("COMMIT");
    return loadState(client);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

exports.handler = async (event) => {
  if (!isAuthenticated(event)) {
    return json(401, { error: "Unauthorized." });
  }

  if (!process.env.DATABASE_URL) {
    return json(500, { error: "DATABASE_URL is not configured." });
  }

  const client = await pool.connect();

  try {
    if (event.httpMethod === "GET") {
      return json(200, await loadState(client));
    }

    if (event.httpMethod === "POST") {
      if (Buffer.byteLength(event.body || "", "utf8") > MAX_SYNC_BODY_BYTES) {
        return json(413, { error: "Payload too large." });
      }

      return json(200, await saveState(client, JSON.parse(event.body || "{}")));
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: "Sync failed." });
  } finally {
    client.release();
  }
};
