//! Durable storage for the Stage journal and the fake settings backend.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use super::engine::{
    Journal, JournalStore, PowerLease, SettingId, SettingValue, SettingsBackend, JOURNAL_VERSION,
};

/// Writes `contents` to `path` so a reader sees either the old or the new
/// file, never a partial one.
pub fn write_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| format!("{} has no folder", path.display()))?;
    fs::create_dir_all(dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    let tmp = dir.join(format!(
        ".{}.{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("file"),
        uuid::Uuid::new_v4()
    ));
    let result = (|| {
        let mut file =
            fs::File::create(&tmp).map_err(|e| format!("Couldn't write {}: {e}", tmp.display()))?;
        file.write_all(contents)
            .and_then(|_| file.sync_all())
            .map_err(|e| format!("Couldn't write {}: {e}", tmp.display()))?;
        drop(file);
        replace_file(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let wide = |p: &Path| -> Vec<u16> { p.as_os_str().encode_wide().chain(Some(0)).collect() };
    let (from_w, to_w) = (wide(from), wide(to));
    unsafe {
        MoveFileExW(
            PCWSTR(from_w.as_ptr()),
            PCWSTR(to_w.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|e| format!("Couldn't replace {}: {e}", to.display()))
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|e| format!("Couldn't replace {}: {e}", to.display()))?;
    if let Some(dir) = to.parent() {
        let _ = fs::File::open(dir).and_then(|d| d.sync_all());
    }
    Ok(())
}

pub struct FileJournalStore {
    path: PathBuf,
}

impl FileJournalStore {
    pub fn new(dir: &Path) -> Self {
        Self {
            path: dir.join("stage-journal.json"),
        }
    }
}

impl JournalStore for FileJournalStore {
    fn load(&self) -> Result<Option<Journal>, String> {
        let text = match fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("Couldn't read {}: {e}", self.path.display())),
        };
        let raw: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("The Stage journal at {} is damaged: {e}", self.path.display()))?;
        let version = raw.get("version").and_then(|v| v.as_u64()).unwrap_or(0);
        if version != u64::from(JOURNAL_VERSION) {
            return Err(format!(
                "The Stage journal at {} is version {version}; this Snipsy reads version {JOURNAL_VERSION}.",
                self.path.display()
            ));
        }
        serde_json::from_value(raw)
            .map(Some)
            .map_err(|e| format!("The Stage journal at {} is damaged: {e}", self.path.display()))
    }

    fn save(&mut self, journal: &Journal) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(journal).map_err(|e| e.to_string())?;
        write_atomic(&self.path, &json)
    }

    fn clear(&mut self) -> Result<(), String> {
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Couldn't remove {}: {e}", self.path.display())),
        }
    }

    fn describe(&self) -> String {
        self.path.display().to_string()
    }
}

/// Simulated OS settings for tests and Auditaur drills (`SNIPSY_STAGE_FAKE=1`).
/// The values live in a file, so they survive an app restart like real ones.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct FakeValues {
    pub mouse_sonar: Option<SettingValue>,
}

#[derive(Debug, Default)]
pub struct FakeKnobs {
    pub fail_reads: bool,
    pub fail_writes: bool,
    /// Writes "succeed" but this value is read back.
    pub sticky: Option<SettingValue>,
    pub writes: usize,
}

#[derive(Clone)]
pub struct FakeSettings {
    pub values: Arc<Mutex<FakeValues>>,
    pub knobs: Arc<Mutex<FakeKnobs>>,
    file: Option<PathBuf>,
}

impl FakeSettings {
    #[cfg(test)]
    pub fn in_memory(initial: SettingValue) -> Self {
        Self {
            values: Arc::new(Mutex::new(FakeValues {
                mouse_sonar: Some(initial),
            })),
            knobs: Arc::default(),
            file: None,
        }
    }

    pub fn persisted(file: PathBuf) -> Self {
        let values = fs::read_to_string(&file)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self {
            values: Arc::new(Mutex::new(values)),
            knobs: Arc::default(),
            file: Some(file),
        }
    }

    pub fn get(&self, id: SettingId) -> SettingValue {
        let values = self.values.lock().unwrap();
        match id {
            SettingId::MouseSonar => values
                .mouse_sonar
                .clone()
                .unwrap_or(SettingValue::Bool(false)),
        }
    }

    /// Simulates the user (or Windows) changing a setting.
    pub fn set(&self, id: SettingId, value: SettingValue) {
        {
            let mut values = self.values.lock().unwrap();
            match id {
                SettingId::MouseSonar => values.mouse_sonar = Some(value),
            }
        }
        self.persist();
    }

    fn persist(&self) {
        if let Some(file) = &self.file {
            let values = self.values.lock().unwrap().clone();
            if let Ok(json) = serde_json::to_vec_pretty(&values) {
                let _ = write_atomic(file, &json);
            }
        }
    }
}

impl SettingsBackend for FakeSettings {
    fn read(&mut self, id: SettingId) -> Result<SettingValue, String> {
        if self.knobs.lock().unwrap().fail_reads {
            return Err("simulated read failure".into());
        }
        Ok(self.get(id))
    }

    fn write(&mut self, id: SettingId, value: &SettingValue) -> Result<(), String> {
        let sticky = {
            let mut knobs = self.knobs.lock().unwrap();
            if knobs.fail_writes {
                return Err("simulated write failure".into());
            }
            knobs.writes += 1;
            knobs.sticky.clone()
        };
        self.set(id, sticky.unwrap_or_else(|| value.clone()));
        Ok(())
    }
}

/// Keep-awake lease that only records whether it's held.
#[derive(Clone, Default)]
pub struct FakeLease {
    pub held: Arc<Mutex<bool>>,
    pub fail: Arc<Mutex<bool>>,
}

impl PowerLease for FakeLease {
    fn acquire(&mut self) -> Result<(), String> {
        if *self.fail.lock().unwrap() {
            return Err("simulated power request failure".into());
        }
        *self.held.lock().unwrap() = true;
        Ok(())
    }

    fn release(&mut self) {
        *self.held.lock().unwrap() = false;
    }

    fn is_held(&self) -> bool {
        *self.held.lock().unwrap()
    }
}
