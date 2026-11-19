use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use crate::Result;
use crate::provider::FileKind;

const MANIFEST: &str = ".acp-harness.json";

#[derive(Default)]
pub(crate) struct Desired {
    files: BTreeMap<PathBuf, (Vec<u8>, FileKind)>,
}

impl Desired {
    pub(crate) fn put(&mut self, path: PathBuf, bytes: impl Into<Vec<u8>>, kind: FileKind) {
        self.files.insert(path, (bytes.into(), kind));
    }

    pub(crate) fn copy_dir(&mut self, source: &Path, target: &Path) -> Result<()> {
        for entry in walkdir::WalkDir::new(source).follow_links(true) {
            let entry = entry.map_err(io::Error::from)?;

            if !entry.file_type().is_file() {
                continue;
            }

            let rel = entry
                .path()
                .strip_prefix(source)
                .map_err(io::Error::other)?;

            self.put(target.join(rel), fs::read(entry.path())?, FileKind::Plain);
        }

        Ok(())
    }

    pub(crate) fn sync(self, base: &Path) -> Result<()> {
        let manifest = base.join(MANIFEST);
        let previous: Vec<PathBuf> = match fs::read(&manifest) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e.into()),
        };

        for (rel, (bytes, kind)) in &self.files {
            write_if_changed(&base.join(rel), bytes, *kind)?;
        }

        let stale = previous
            .iter()
            .filter(|p| p.components().all(|c| matches!(c, Component::Normal(_))))
            .filter(|p| !self.files.contains_key(*p));

        for path in stale {
            remove(base, path)?;
        }

        let current: Vec<&PathBuf> = self.files.keys().collect();

        fs::write(manifest, serde_json::to_vec_pretty(&current)?)?;

        Ok(())
    }
}

fn write_if_changed(path: &Path, bytes: &[u8], kind: FileKind) -> Result<()> {
    if fs::read(path).is_ok_and(|existing| existing == bytes) {
        return Ok(());
    }

    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }

    let mut file = fs::File::create(path)?;

    if kind == FileKind::OwnerOnlySecret {
        owner_only(path)?;
    }

    file.write_all(bytes)?;

    Ok(())
}

#[cfg(unix)]
fn owner_only(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn owner_only(_path: &Path) -> io::Result<()> {
    Ok(())
}

fn remove(base: &Path, rel: &Path) -> Result<()> {
    match fs::remove_file(base.join(rel)) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }

    for dir in rel.ancestors().skip(1) {
        if dir.as_os_str().is_empty() || fs::remove_dir(base.join(dir)).is_err() {
            break;
        }
    }

    Ok(())
}
