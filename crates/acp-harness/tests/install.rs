use std::collections::BTreeMap;
use std::fs;
use std::thread;

use acp_harness::install::{Download, place};
use acp_harness::registry::BinaryTarget;
use tempfile::TempDir;

fn download(cache: &TempDir) -> Download {
    Download {
        target: BinaryTarget {
            archive: "https://agent.example/agent".to_owned(),
            cmd: "bin/agent".to_owned(),
            args: Vec::new(),
            env: BTreeMap::new(),
            sha256: None,
        },
        dir: cache.path().join("agent").join("1.0.0"),
    }
}

fn entries(download: &Download) -> Vec<String> {
    fs::read_dir(download.dir.parent().unwrap())
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect()
}

#[test]
fn installing_over_a_finished_install_keeps_it() {
    let cache = TempDir::new().unwrap();
    let download = download(&cache);

    place(&download, b"first").unwrap();

    let again = place(&download, b"second").unwrap();

    assert_eq!(again.command, download.dir.join("bin/agent"));
    assert_eq!(fs::read(&again.command).unwrap(), b"first");
    assert_eq!(entries(&download), ["1.0.0"]);
}

#[test]
fn concurrent_installs_of_one_version_all_succeed() {
    let cache = TempDir::new().unwrap();
    let download = download(&cache);

    thread::scope(|scope| {
        let runs: Vec<_> = (0..8)
            .map(|_| scope.spawn(|| place(&download, b"agent")))
            .collect();

        for run in runs {
            let installed = run.join().unwrap().unwrap();

            assert_eq!(installed.command, download.dir.join("bin/agent"));
        }
    });

    assert_eq!(fs::read(download.dir.join("bin/agent")).unwrap(), b"agent");
    assert_eq!(entries(&download), ["1.0.0"]);
}
