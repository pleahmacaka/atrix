use std::fs;

use acp_harness::registry;
use tempfile::TempDir;

#[test]
fn unreadable_cache_counts_as_absent() {
    let dir = TempDir::new().unwrap();
    let cache = dir.path().join("registry.json");

    fs::write(&cache, "{ not json").unwrap();

    assert_eq!(registry::load(&cache), None);
}
