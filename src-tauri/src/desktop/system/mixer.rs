use serde::Serialize;

use super::audio::Volume;

#[derive(Serialize)]
pub struct AudioSession {
    pub id: String,
    pub name: String,
    pub path: String,
    pub level: f32,
    pub muted: bool,
    pub system: bool,
}

#[derive(Serialize)]
pub struct Mixer {
    pub master: Option<Volume>,
    pub sessions: Vec<AudioSession>,
}

#[tauri::command(async)]
pub fn audio_mixer() -> Mixer {
    Mixer {
        master: super::audio::volume(),
        sessions: win::sessions(),
    }
}

#[tauri::command(async)]
pub fn set_session_volume(id: String, level: f32) -> Result<(), String> {
    let level = level.clamp(0.0, 1.0);

    win::apply(&id, |volume| unsafe {
        volume.SetMasterVolume(level, std::ptr::null())
    })
}

#[tauri::command(async)]
pub fn set_session_mute(id: String, muted: bool) -> Result<(), String> {
    win::apply(&id, |volume| unsafe {
        volume.SetMute(muted, std::ptr::null())
    })
}

fn stem(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default()
}

mod win {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    use windows::Win32::Foundation::{CloseHandle, S_OK};
    use windows::Win32::Media::Audio::{
        AudioSessionStateExpired, IAudioSessionControl2, IAudioSessionManager2, ISimpleAudioVolume,
        eConsole, eRender,
    };
    use windows::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
    };
    use windows::Win32::System::Com::{
        CLSCTX_ALL, COINIT_APARTMENTTHREADED, CoInitializeEx, CoTaskMemFree,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };
    use windows::core::{HSTRING, Interface, PWSTR};

    use super::AudioSession;

    const SYSTEM: &str = "system";

    struct Entry {
        key: String,
        path: String,
        control: IAudioSessionControl2,
    }

    fn names() -> &'static Mutex<HashMap<String, String>> {
        static NAMES: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

        NAMES.get_or_init(Default::default)
    }

    fn process_path(pid: u32) -> Option<String> {
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;

        let query = unsafe {
            QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        };

        unsafe {
            let _ = CloseHandle(process);
        }

        query.ok()?;

        Some(String::from_utf16_lossy(&buffer[..length as usize]))
    }

    fn version_value(data: &[u8], key: &str) -> Option<(*const u16, usize)> {
        let mut value = std::ptr::null_mut();
        let mut length = 0u32;

        let found = unsafe {
            VerQueryValueW(
                data.as_ptr().cast(),
                &HSTRING::from(key),
                &mut value,
                &mut length,
            )
        }
        .as_bool();

        (found && length > 0).then_some((value as *const u16, length as usize))
    }

    fn description(path: &str) -> Option<String> {
        let file = HSTRING::from(path);
        let size = unsafe { GetFileVersionInfoSizeW(&file, None) };

        if size == 0 {
            return None;
        }

        let mut data = vec![0u8; size as usize];

        unsafe { GetFileVersionInfoW(&file, None, size, data.as_mut_ptr().cast()) }.ok()?;

        // VerQueryValueW reports the translation table in bytes but string values in characters
        let (pairs, bytes) = version_value(&data, "\\VarFileInfo\\Translation")?;

        if bytes < 4 {
            return None;
        }

        let pair = unsafe { std::slice::from_raw_parts(pairs, 2) };
        let key = format!(
            "\\StringFileInfo\\{:04x}{:04x}\\FileDescription",
            pair[0], pair[1]
        );
        let (text, chars) = version_value(&data, &key)?;
        let text = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, chars) });
        let text = text.trim_end_matches('\0').trim();

        (!text.is_empty()).then(|| text.to_string())
    }

    fn display_name(control: &IAudioSessionControl2) -> Option<String> {
        unsafe {
            let raw = control.GetDisplayName().ok()?;
            let text = raw.to_string().ok();

            CoTaskMemFree(Some(raw.0 as *const _));

            text.filter(|text| !text.is_empty() && !text.starts_with('@'))
        }
    }

    fn name(entry: &Entry) -> String {
        if entry.key == SYSTEM {
            return String::new();
        }

        if let Some(name) = display_name(&entry.control) {
            return name;
        }

        if entry.path.is_empty() {
            return String::new();
        }

        names()
            .lock()
            .unwrap()
            .entry(entry.key.clone())
            .or_insert_with(|| description(&entry.path).unwrap_or_else(|| super::stem(&entry.path)))
            .clone()
    }

    fn entry(control: IAudioSessionControl2) -> Option<Entry> {
        if unsafe { control.GetState() }.ok()? == AudioSessionStateExpired {
            return None;
        }

        if unsafe { control.IsSystemSoundsSession() } == S_OK {
            return Some(Entry {
                key: SYSTEM.into(),
                path: String::new(),
                control,
            });
        }

        let pid = unsafe { control.GetProcessId() }.ok()?;
        let path = process_path(pid).unwrap_or_default();
        let key = if path.is_empty() {
            format!("pid:{pid}")
        } else {
            path.to_lowercase()
        };

        Some(Entry { key, path, control })
    }

    fn entries() -> windows::core::Result<Vec<Entry>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            let device = crate::desktop::system::audio::win::enumerator()?
                .GetDefaultAudioEndpoint(eRender, eConsole)?;
            let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            let sessions = manager.GetSessionEnumerator()?;
            let count = sessions.GetCount()?;

            Ok((0..count)
                .filter_map(|index| entry(sessions.GetSession(index).ok()?.cast().ok()?))
                .collect())
        }
    }

    pub fn sessions() -> Vec<AudioSession> {
        let Ok(entries) = entries() else {
            return Vec::new();
        };

        let mut grouped: Vec<AudioSession> = Vec::new();

        for entry in entries {
            let Ok(volume) = entry.control.cast::<ISimpleAudioVolume>() else {
                continue;
            };

            let level = unsafe { volume.GetMasterVolume() }.unwrap_or(1.0);
            let muted = unsafe { volume.GetMute() }.is_ok_and(|muted| muted.as_bool());

            if let Some(group) = grouped.iter_mut().find(|group| group.id == entry.key) {
                group.muted &= muted;

                continue;
            }

            grouped.push(AudioSession {
                name: name(&entry),
                system: entry.key == SYSTEM,
                id: entry.key,
                path: entry.path,
                level,
                muted,
            });
        }

        grouped.sort_by_cached_key(|session| (!session.system, session.name.to_lowercase()));

        grouped
    }

    pub fn apply(
        id: &str,
        change: impl Fn(&ISimpleAudioVolume) -> windows::core::Result<()>,
    ) -> Result<(), String> {
        let entries = entries().map_err(|e| e.to_string())?;
        let mut found = false;

        for entry in entries.iter().filter(|entry| entry.key == id) {
            let volume: ISimpleAudioVolume = entry.control.cast().map_err(|e| e.to_string())?;

            change(&volume).map_err(|e| e.to_string())?;
            found = true;
        }

        if found { Ok(()) } else { Err("missing".into()) }
    }
}
