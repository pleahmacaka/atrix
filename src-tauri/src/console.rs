use tauri::ipc::{InvokeBody, Request};

use crate::error::{Error, Result};

#[cfg(windows)]
mod imp {
    use std::borrow::Cow;
    use std::sync::Mutex;
    use std::thread;
    use std::time::{Duration, Instant};

    use arboard::{Clipboard, ImageData};
    use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE};
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows::Win32::System::Console::{
        AttachConsole, CONSOLE_SCREEN_BUFFER_INFO, COORD, FreeConsole, GetConsoleScreenBufferInfo,
        INPUT_RECORD, INPUT_RECORD_0, KEY_EVENT, KEY_EVENT_RECORD, KEY_EVENT_RECORD_0,
        ReadConsoleOutputCharacterW, WriteConsoleInputW,
    };
    use windows::core::w;

    use crate::error::{Error, Result};

    const VK_RETURN: u16 = 0x0D;

    const VK_ESCAPE: u16 = 0x1B;

    const VK_TAB: u16 = 0x09;
    const VK_LEFT: u16 = 0x25;
    const VK_UP: u16 = 0x26;
    const VK_RIGHT: u16 = 0x27;
    const VK_DOWN: u16 = 0x28;

    // the CLI shows this placeholder while a subagent is selected, and prompts typed then go to it
    const SUBAGENT_PROMPT: &str = "❯ Message @";

    const VK_J: u16 = 0x4A;

    const VK_V: u16 = 0x56;

    const LEFT_ALT_PRESSED: u32 = 0x0002;

    const LEFT_CTRL_PRESSED: u32 = 0x0008;

    // a burst of keys reads as a paste, which turns Enter into a newline, so submit after a pause
    const SUBMIT_DELAY: Duration = Duration::from_millis(150);

    // the question dialog re-renders between keys and drops ones that arrive mid-render
    const STEP_DELAY: Duration = Duration::from_millis(300);

    // Claude Code reads the clipboard through a PowerShell child and reports no completion
    const CLIPBOARD_READ: Duration = Duration::from_millis(1500);

    const CLIPBOARD_POLL: Duration = Duration::from_millis(40);

    const IMAGE_MARKER: &str = "[Image #";

    // another process holding the clipboard makes SetClipboardData fail with 1418 for a moment
    const CLIPBOARD_RETRY: Duration = Duration::from_millis(50);

    const CLIPBOARD_TRIES: u32 = 40;

    static ATTACH: Mutex<()> = Mutex::new(());

    // the clipboard is opened per process, so a read on another thread closes it under a pending write
    static CLIPBOARD: Mutex<()> = Mutex::new(());

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

    fn open_output() -> windows::core::Result<HANDLE> {
        unsafe {
            CreateFileW(
                w!("CONOUT$"),
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAGS_AND_ATTRIBUTES(0),
                None,
            )
        }
    }

    fn screen_lines() -> Vec<String> {
        let Ok(output) = open_output() else {
            return Vec::new();
        };
        let mut info = CONSOLE_SCREEN_BUFFER_INFO::default();
        let mut lines = Vec::new();

        if unsafe { GetConsoleScreenBufferInfo(output, &mut info) }.is_ok() {
            for y in info.srWindow.Top..=info.srWindow.Bottom {
                let mut line = vec![0u16; info.dwSize.X.max(0) as usize];
                let mut read = 0;

                if unsafe {
                    ReadConsoleOutputCharacterW(output, &mut line, COORD { X: 0, Y: y }, &mut read)
                }
                .is_ok()
                {
                    lines.push(String::from_utf16_lossy(&line[..read as usize]));
                }
            }
        }

        let _ = unsafe { CloseHandle(output) };

        lines
    }

    fn subagent_selected() -> bool {
        screen_lines()
            .iter()
            .any(|line| line.trim_start().starts_with(SUBAGENT_PROMPT))
    }

    fn image_markers() -> usize {
        screen_lines()
            .iter()
            .map(|line| line.matches(IMAGE_MARKER).count())
            .sum()
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

    pub fn screen(pid: u32) -> Result<Vec<String>> {
        let mut lines = Vec::new();

        with_input(pid, |_| {
            lines = screen_lines();

            Ok(())
        })?;

        Ok(lines)
    }

    pub fn type_into(pid: u32, text: &str) -> Result<()> {
        let records = records_of(text);
        let mut submit = Vec::new();
        let mut blocked = false;

        press(&mut submit, u16::from(b'\r'), VK_RETURN, 0);

        with_input(pid, |input| {
            if subagent_selected() {
                blocked = true;

                return Ok(());
            }

            write(input, &records)?;
            thread::sleep(SUBMIT_DELAY);
            write(input, &submit)
        })?;

        if blocked {
            return Err(Error::code("subagent_selected", pid));
        }

        Ok(())
    }

    pub fn strokes(pid: u32, strokes: &[super::Stroke]) -> Result<()> {
        let batches: Vec<Vec<INPUT_RECORD>> = strokes
            .iter()
            .map(|stroke| {
                let mut records = Vec::new();

                match stroke {
                    super::Stroke::Digit { digit } => {
                        let code = u16::from(b'0' + digit % 10);

                        press(&mut records, code, code, 0);
                    }
                    super::Stroke::Text { text } => records = records_of(text),
                    super::Stroke::Tab => press(&mut records, 0x09, VK_TAB, 0),
                    super::Stroke::Enter => press(&mut records, 0x0D, VK_RETURN, 0),
                    super::Stroke::Escape => press(&mut records, VK_ESCAPE, VK_ESCAPE, 0),
                    super::Stroke::Up => press(&mut records, 0, VK_UP, 0),
                    super::Stroke::Down => press(&mut records, 0, VK_DOWN, 0),
                    super::Stroke::Left => press(&mut records, 0, VK_LEFT, 0),
                    super::Stroke::Right => press(&mut records, 0, VK_RIGHT, 0),
                }

                records
            })
            .collect();

        with_input(pid, |input| {
            for batch in &batches {
                write(input, batch)?;
                thread::sleep(STEP_DELAY);
            }

            Ok(())
        })
    }

    pub fn interrupt(pid: u32) -> Result<()> {
        let mut escape = Vec::new();

        press(&mut escape, VK_ESCAPE, VK_ESCAPE, 0);

        with_input(pid, |input| write(input, &escape))
    }

    pub fn paste_image(pid: u32, bytes: &[u8]) -> Result<()> {
        let image = image::load_from_memory(bytes)
            .map_err(|e| Error::code("image_invalid", e))?
            .to_rgba8();
        let _guard = CLIPBOARD.lock()?;
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

        let pasted = with_input(pid, |input| {
            let before = image_markers();
            let deadline = Instant::now() + CLIPBOARD_READ;

            write(input, &paste)?;

            while Instant::now() < deadline && image_markers() <= before {
                thread::sleep(CLIPBOARD_POLL);
            }

            Ok(())
        });

        if let Some(text) = previous {
            let _ = clipboard.set_text(text);
        }

        pasted
    }

    pub fn clipboard_png() -> Result<Vec<u8>> {
        let _guard = CLIPBOARD.lock()?;
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

    pub fn interrupt(_: u32) -> Result<()> {
        Err("unsupported".into())
    }

    pub fn strokes(_: u32, _: &[super::Stroke]) -> Result<()> {
        Err("unsupported".into())
    }

    pub fn screen(_: u32) -> Result<Vec<String>> {
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

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Stroke {
    Digit { digit: u8 },
    Text { text: String },
    Tab,
    Enter,
    Escape,
    Up,
    Down,
    Left,
    Right,
}

#[tauri::command]
pub async fn terminal_screen(pid: u32) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || imp::screen(pid)).await?
}

#[tauri::command]
pub async fn terminal_keys(pid: u32, strokes: Vec<Stroke>) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || imp::strokes(pid, &strokes)).await?
}

#[tauri::command]
pub async fn terminal_interrupt(pid: u32) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || imp::interrupt(pid)).await?
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
