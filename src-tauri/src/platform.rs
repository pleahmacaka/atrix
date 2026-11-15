use std::ffi::OsStr;
use std::process::Command;

use process_wrap::std::CommandWrap;

pub use imp::{make_executable, make_private};

pub fn tree(command: Command) -> CommandWrap {
    let mut command = CommandWrap::from(command);

    #[cfg(windows)]
    {
        use process_wrap::std::{CreationFlags, JobObject};
        use windows::Win32::System::Threading::CREATE_NO_WINDOW;

        // JobObject overwrites creation_flags; CreationFlags keeps CREATE_NO_WINDOW
        command
            .wrap(CreationFlags(CREATE_NO_WINDOW))
            .wrap(JobObject);
    }

    #[cfg(unix)]
    command.wrap(process_wrap::std::ProcessGroup::leader());

    command
}

pub fn hidden(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        use windows::Win32::System::Threading::CREATE_NO_WINDOW;

        command.creation_flags(CREATE_NO_WINDOW.0);
    }

    command
}

#[cfg(unix)]
mod imp {
    use std::fs::{self, Permissions};
    use std::io;
    use std::os::unix::fs::PermissionsExt;
    use std::path::Path;

    pub fn make_executable(path: &Path) -> io::Result<()> {
        fs::set_permissions(path, Permissions::from_mode(0o755))
    }

    pub fn make_private(path: &Path) -> io::Result<()> {
        fs::set_permissions(path, Permissions::from_mode(0o600))
    }
}

#[cfg(not(unix))]
mod imp {
    use std::io;
    use std::path::Path;

    pub fn make_executable(_: &Path) -> io::Result<()> {
        Ok(())
    }

    pub fn make_private(_: &Path) -> io::Result<()> {
        Ok(())
    }
}
