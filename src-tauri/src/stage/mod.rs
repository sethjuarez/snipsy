//! Stage: put this PC into a presentation-friendly state, and put it back.
//!
//! PR 1 covers Windows mouse sonar ("find my pointer") and keeping the PC
//! awake while Snipsy runs. Every change is journaled per setting so Unstage
//! (even after a crash or restart) restores only what Snipsy still owns.

pub mod engine;
pub mod store;
#[cfg(windows)]
mod windows;

#[cfg(test)]
mod tests;

use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Emitter, Manager};
use tauri_plugin_auditaur::IpcTraceContext;

use crate::models::{Project, StageConfig};
pub use engine::{StageEngine, StageReport, StageState, StageStatus, WINDOWS_ONLY};
use engine::Identity;
use store::{FakeLease, FakeSettings, FileJournalStore};

pub const STAGE_CHANGED_EVENT: &str = "stage-changed";
/// Use simulated settings instead of the real desktop (tests and drills).
pub const FAKE_ENV: &str = "SNIPSY_STAGE_FAKE";
/// How often the keep-awake request is renewed and the journal re-checked.
/// Covers sleep/resume (Windows drops power requests on sleep) and
/// Unstage from another Snipsy process.
const RECONCILE_INTERVAL: Duration = Duration::from_secs(30);

/// Serializes Stage operations within this process (mutex) and across
/// processes (an exclusive lock on `stage.lock`).
pub struct StageService {
    engine: Mutex<Option<StageEngine>>,
    lock_path: Option<PathBuf>,
    /// Stamped on every snapshot while the operation lock is held.
    revision: AtomicU64,
    /// Newest revision sent to the tray and frontend.
    published: AtomicU64,
}

impl StageService {
    pub fn new(engine: Option<StageEngine>, lock_path: Option<PathBuf>) -> Self {
        Self {
            engine: Mutex::new(engine),
            lock_path,
            revision: AtomicU64::new(0),
            published: AtomicU64::new(0),
        }
    }

    pub fn unsupported() -> Self {
        Self::new(None, None)
    }

    fn with_engine<T>(
        &self,
        op: impl FnOnce(&mut StageEngine) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .engine
            .lock()
            .map_err(|_| "Stage is unavailable after an earlier error.".to_string())?;
        let engine = guard.as_mut().ok_or_else(|| WINDOWS_ONLY.to_string())?;
        let _lock = self.lock_path.as_deref().map(lock_file).transpose()?;
        op(engine)
    }

    fn next_revision(&self) -> u64 {
        self.revision.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn status(&self) -> StageStatus {
        self.with_engine(|engine| {
            let mut status = engine.status();
            status.revision = self.next_revision();
            Ok(status)
        })
        .unwrap_or_else(|error| {
            let mut status = StageStatus::unsupported();
            if error != WINDOWS_ONLY {
                status.error = Some(error);
            }
            status.revision = self.next_revision();
            status
        })
    }

    /// True when `status` is newer than anything published so far.
    fn claim_publish(&self, status: &StageStatus) -> bool {
        self.published.fetch_max(status.revision, Ordering::SeqCst) < status.revision
    }

    /// Renew or release the keep-awake lease to match the journal.
    pub fn reconcile(&self, renew: bool) {
        let _ = self.with_engine(|engine| {
            engine.reconcile_lease(renew);
            Ok(())
        });
    }

    pub fn stage(
        &self,
        project_path: &str,
        project_name: &str,
        config: &StageConfig,
    ) -> Result<StageReport, String> {
        self.with_engine(|engine| {
            let mut report = engine.stage(project_path, project_name, config)?;
            report.status.revision = self.next_revision();
            Ok(report)
        })
    }

    pub fn unstage(&self) -> Result<StageReport, String> {
        self.with_engine(|engine| {
            let mut report = engine.unstage()?;
            report.status.revision = self.next_revision();
            Ok(report)
        })
    }

    pub fn recover_on_launch(&self) {
        let _ = self.with_engine(|engine| {
            engine.recover_on_launch();
            Ok(())
        });
    }

    pub fn release_lease(&self) {
        if let Ok(mut guard) = self.engine.lock() {
            if let Some(engine) = guard.as_mut() {
                engine.release_lease();
            }
        }
    }
}

fn lock_file(path: &Path) -> Result<File, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
        .map_err(|e| format!("Couldn't open {}: {e}", path.display()))?;
    file.lock()
        .map_err(|e| format!("Couldn't lock {}: {e}", path.display()))?;
    Ok(file)
}

fn fake_requested() -> bool {
    std::env::var(FAKE_ENV).is_ok_and(|value| value == "1")
}

/// Builds the service for this platform. Stage data lives in local (not
/// roaming) app data, because it describes this machine.
pub fn build_service(local_data_dir: &Path) -> StageService {
    if fake_requested() {
        let dir = local_data_dir.join("stage-fake");
        tracing::info!(dir = %dir.display(), "Stage is using simulated settings");
        let engine = StageEngine::new(
            "fake",
            Box::new(FakeSettings::persisted(dir.join("fake-settings.json"))),
            Box::new(FileJournalStore::new(&dir)),
            Box::new(FakeLease::default()),
            Identity::current(),
        );
        return StageService::new(Some(engine), Some(dir.join("stage.lock")));
    }
    platform_service(local_data_dir)
}

#[cfg(windows)]
fn platform_service(local_data_dir: &Path) -> StageService {
    let dir = local_data_dir.join("stage");
    let engine = StageEngine::new(
        "windows",
        Box::new(windows::WindowsSettings),
        Box::new(FileJournalStore::new(&dir)),
        Box::new(windows::WindowsLease::new()),
        Identity::current(),
    );
    StageService::new(Some(engine), Some(dir.join("stage.lock")))
}

#[cfg(not(windows))]
fn platform_service(_local_data_dir: &Path) -> StageService {
    StageService::unsupported()
}

/// Call from `setup()` before the tray is built.
pub fn init(app: &tauri::AppHandle) {
    let service = match app.path().app_local_data_dir() {
        Ok(dir) => build_service(&dir),
        Err(error) => {
            tracing::warn!(%error, "No local app data folder; Stage is unavailable");
            StageService::unsupported()
        }
    };
    service.recover_on_launch();
    let status = service.status();
    service.claim_publish(&status);
    let supported = status.supported;
    app.manage(service);
    crate::tray::set_stage_indicator(&status);
    if supported {
        spawn_reconciler(app.clone());
    }
}

fn spawn_reconciler(app: tauri::AppHandle) {
    let spawned = std::thread::Builder::new()
        .name("stage-reconcile".into())
        .spawn(move || {
            let mut last = None;
            loop {
                std::thread::sleep(RECONCILE_INTERVAL);
                let Ok(service) = service(&app) else { return };
                service.reconcile(true);
                let status = service.status();
                let mut comparable = status.clone();
                comparable.revision = 0;
                if last.as_ref() != Some(&comparable) {
                    last = Some(comparable);
                    publish(&app, &status);
                }
            }
        });
    if let Err(error) = spawned {
        tracing::warn!(%error, "Couldn't start Stage keep-awake renewal");
    }
}

fn publish(app: &tauri::AppHandle, status: &StageStatus) {
    if let Ok(service) = service(app) {
        if !service.claim_publish(status) {
            return;
        }
    }
    crate::tray::set_stage_indicator(status);
    if let Err(error) = crate::tray::refresh_tray(app) {
        tracing::warn!(%error, "Couldn't update the tray for Stage");
    }
    let _ = app.emit(STAGE_CHANGED_EVENT, status);
}

fn service(app: &tauri::AppHandle) -> Result<tauri::State<'_, StageService>, String> {
    app.try_state::<StageService>()
        .ok_or_else(|| WINDOWS_ONLY.to_string())
}

/// Unstage from outside the UI (tray menu).
pub fn unstage_from_tray(app: &tauri::AppHandle) {
    let result = service(app).and_then(|service| service.unstage());
    match result {
        Ok(report) => {
            publish(app, &report.status);
            let _ = app.emit("stage-report", &report);
        }
        Err(error) => {
            tracing::warn!(%error, "Unstage from the tray failed");
            if let Ok(service) = service(app) {
                publish(app, &service.status());
            }
            let _ = app.emit("stage-error", error);
        }
    }
}

pub fn release_on_exit(app: &tauri::AppHandle) {
    if let Some(service) = app.try_state::<StageService>() {
        service.release_lease();
    }
}

fn read_project(project_path: &str) -> Result<Project, String> {
    let file = Path::new(project_path).join("project.json");
    let text = std::fs::read_to_string(&file)
        .map_err(|e| format!("Couldn't read {}: {e}", file.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("Couldn't read {}: {e}", file.display()))
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub async fn get_stage_status(
    app: tauri::AppHandle,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<StageStatus, String> {
    // Off the main thread: it can wait on a running Stage/Unstage.
    tauri::async_runtime::spawn_blocking(move || {
        service(&app)
            .map(|service| service.status())
            .unwrap_or_else(|_| StageStatus::unsupported())
    })
    .await
    .map_err(|e| format!("Stage status stopped unexpectedly: {e}"))
}

/// Stage the project saved at `project_path`, using its saved Stage settings.
#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub async fn stage_project(
    app: tauri::AppHandle,
    project_path: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<StageReport, String> {
    let project = read_project(&project_path)?;
    let config = project.stage.unwrap_or_default();
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        service(&worker)?.stage(&project_path, &project.name, &config)
    })
    .await
    .map_err(|e| format!("Stage stopped unexpectedly: {e}"))?;
    let status = match &result {
        Ok(report) => report.status.clone(),
        Err(_) => service(&app)?.status(),
    };
    publish(&app, &status);
    result
}

/// Put back what Stage changed. Doesn't need the project.
#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub async fn unstage(
    app: tauri::AppHandle,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<StageReport, String> {
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || service(&worker)?.unstage())
        .await
        .map_err(|e| format!("Unstage stopped unexpectedly: {e}"))?;
    let status = match &result {
        Ok(report) => report.status.clone(),
        Err(_) => service(&app)?.status(),
    };
    publish(&app, &status);
    result
}
