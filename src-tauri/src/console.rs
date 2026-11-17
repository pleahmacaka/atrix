use tauri::ipc::{InvokeBody, Request};

use crate::error::{Error, Result};

#[cfg(windows)]
mod imp {
    use std::borrow::Cow;
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    use arboard::{Clipboard, ImageData};
    use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE};
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows::Win32::System::Console::{
        AttachConsole, FreeConsole, INPUT_RECORD, INPUT_RECORD_0, KEY_EVENT, KEY_EVENT_RECORD,
        KEY_EVENT_RECORD_0, WriteConsoleInputW,
    };
    use windows::core::w;

    use crate::error::{Error, Result};

    const VK_RETURN: u16 = 0x0D;

    const VK_J: u16 = 0x4A;

    const VK_V: u16 = 0x56;

    const LEFT_ALT_PRESSED: u32 = 0x0002;

    const LEFT_CTRL_PRESSED: u32 = 0x0008;

    // a burst of keys reads as a paste, which turns Enter into a newline, so submit after a pause
    const SUBMIT_DELAY: Duration = Duration::from_millis(150);

    // Claude Code reads the clipboard through a PowerShell child and reports no completion
    const CLIPBOARD_READ: Duration = Duration::from_millis(1500);

    // another process holding the clipboard makes SetClipboardData fail with 1418 for a moment
    const CLIPBOARD_RETRY: Duration = Duration::from_millis(50);

    const CLIPBOARD_TRIES: u32 = 40;

    static ATTACH: Mutex<()> = Mutex::new(());

    fn key(unit: u16, virtual_key: u16, state: u32, down: bool) -> INPUT_RECORD {
        INPUT_RECORD {
            EventType: KEY_EVENT as u16,
            Event: INPUT_RECORD_0 {
                KeyEvent: KEY_EVENT_RECORD {
                    bKeyDown: down.into(),
                    wRepeatCount: 1,
                    wVirtualKeyCode: virtual_key,
                    wVirtualScanCode: 0,
                    uChar: KEY_EVENT_RECORD_0 { UnicodeChar: unit },
                    dwControlKeyState: state,
                },
            },
        }
    }

    fn press(records: &mut Vec<INPUT_RECORD>, unit: u16, virtual_key: u16, state: u32) {
        records.push(key(unit, virtual_key, state, true));
        records.push(key(unit, virtual_key, state, false));
    }

    fn records_of(text: &str) -> Vec<INPUT_RECORD> {
        let mut records = Vec::new();
        let newline = u16::from(b'\n');

        for unit in text.replace("\r\n", "\n").encode_utf16() {
            if unit == newline {
                press(&mut records, unit, VK_J, LEFT_CTRL_PRESSED);
            } else {
                press(&mut records, unit, 0, 0);
            }
        }

        records
    }

    fn write(input: HANDLE, records: &[INPUT_RECORD]) -> windows::core::Result<()> {
        let mut written = 0;

        unsafe { WriteConsoleInputW(input, records, &mut written) }
    }

    fn open_input() -> windows::core::Result<HANDLE> {
        unsafe {
            CreateFileW(
                w!("CONIN$"),
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAGS_AND_ATTRIBUTES(0),
                None,
            )
        }
    }

    fn with_input(pid: u32, work: impl FnOnce(HANDLE) -> windows::core::Result<()>) -> Result<()> {
        let _guard = ATTACH.lock()?;

        let _ = unsafe { FreeConsole() };
        unsafe { AttachConsole(pid) }?;

        let result = open_input().and_then(|input| {
            let done = work(input);
            let _ = unsafe { CloseHandle(input) };

            done
        });
        let _ = unsafe { FreeConsole() };

        Ok(result?)
    }

    pub fn type_into(pid: u32, text: &str) -> Result<()> {
        let records = records_of(text);
        let mut submit = Vec::new();

        press(&mut submit, u16::from(b'\r'), VK_RETURN, 0);

        with_input(pid, |input| {
            write(input, &records)?;
            thread::sleep(SUBMIT_DELAY);
            write(input, &submit)
        })
    }

    pub fn paste_image(pid: u32, bytes: &[u8]) -> Result<()> {
        let image = image::load_from_memory(bytes)
            .map_err(|e| Error::code("image_invalid", e))?
            .to_rgba8();
        let mut clipboard = Clipboard::new().map_err(|e| Error::code("clipboard", e))?;
        let previous = clipboard.get_text().ok();
        let data = ImageData {
            width: image.width() as usize,
            height: image.height() as usize,
            bytes: Cow::Owned(image.into_raw()),
        };

        let mut tries = 0;

        while let Err(e) = clipboard.set_image(data.clone()) {
            tries += 1;

            if tries == CLIPBOARD_TRIES {
                return Err(Error::code("clipboard", e));
            }

            thread::sleep(CLIPBOARD_RETRY);
        }

        let mut paste = Vec::new();

        press(&mut paste, u16::from(b'v'), VK_V, LEFT_ALT_PRESSED);

        let pasted = with_input(pid, |input| write(input, &paste));

        thread::sleep(CLIPBOARD_READ);

        if let Some(text) = previous {
            let _ = clipboard.set_text(text);
        }

        pasted
    }

    pub fn clipboard_png() -> Result<Vec<u8>> {
        let Ok(image) = Clipboard::new().and_then(|mut c| c.get_image()) else {
            return Ok(Vec::new());
        };
        let rgba = image::RgbaImage::from_raw(
            image.width as u32,
            image.height as u32,
            image.bytes.into_owned(),
        )
        .ok_or(Error::code("image_invalid", "clipboard"))?;
        let mut png = std::io::Cursor::new(Vec::new());

        rgba.write_to(&mut png, image::ImageFormat::Png)
            .map_err(|e| Error::code("image_invalid", e))?;

        Ok(png.into_inner())
    }
}

#[cfg(not(windows))]
mod imp {
    use crate::error::Result;

    pub fn type_into(_: u32, _: &str) -> Result<()> {
        Err("unsupported".into())
    }

    pub fn paste_image(_: u32, _: &[u8]) -> Result<()> {
        Err("unsupported".into())
    }

    pub fn clipboard_png() -> Result<Vec<u8>> {
        Ok(Vec::new())
    }
}

#[tauri::command(async)]
pub fn clipboard_image() -> Result<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(imp::clipboard_png()?))
}

#[tauri::command]
pub async fn terminal_type(pid: u32, text: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || imp::type_into(pid, &text)).await?
}

#[tauri::command(async)]
pub fn terminal_paste_image(request: Request<'_>) -> Result<()> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::code("image_invalid", "body"));
    };
    let pid = request
        .headers()
        .get("pid")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or(Error::code("image_invalid", "pid"))?;

    imp::paste_image(pid, bytes)
}
