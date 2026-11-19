#![cfg(mobile)]

use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("calendar-sync")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("com.arixlab.calendarsync", "CalendarSyncPlugin")?;
            Ok(())
        })
        .build()
}
