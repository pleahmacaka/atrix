use crate::error::Result;

#[cfg(windows)]
mod imp {
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE};
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows::Win32::System::Console::{
        AttachConsole, FreeConsole, INPUT_RECORD, INPUT_RECORD_0, KEY_EVENT, KEY_EVENT_RECORD,
        KEY_EVENT_RECORD_0, WriteConsoleInputW,
    };
    use windows::core::w;

    use crate::error::Result;

    const VK_RETURN: u16 = 0x0D;

    const VK_J: u16 = 0x4A;

    const LEFT_CTRL_PRESSED: u32 = 0x0008;

    // a burst of keys reads as a paste, which turns Enter into a newline, so submit after a pause
    const SUBMIT_DELAY: Duration = Duration::from_millis(150);

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

    fn send_keys(text: &[INPUT_RECORD], submit: &[INPUT_RECORD]) -> Result<()> {
        let input = unsafe {
            CreateFileW(
                w!("CONIN$"),
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAGS_AND_ATTRIBUTES(0),
                None,
            )
        }?;
        let wrote = write(input, text).and_then(|_| {
            thread::sleep(SUBMIT_DELAY);
            write(input, submit)
        });
        let _ = unsafe { CloseHandle(input) };

        Ok(wrote?)
    }

    pub fn type_into(pid: u32, text: &str) -> Result<()> {
        let _guard = ATTACH.lock()?;
        let records = records_of(text);
        let mut submit = Vec::new();

        press(&mut submit, u16::from(b'\r'), VK_RETURN, 0);

        let _ = unsafe { FreeConsole() };
        unsafe { AttachConsole(pid) }?;

        let result = send_keys(&records, &submit);
        let _ = unsafe { FreeConsole() };

        result
    }
}

#[cfg(not(windows))]
mod imp {
    use crate::error::Result;

    pub fn type_into(_: u32, _: &str) -> Result<()> {
        Err("unsupported".into())
    }
}

#[tauri::command]
pub async fn terminal_type(pid: u32, text: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || imp::type_into(pid, &text)).await?
}
