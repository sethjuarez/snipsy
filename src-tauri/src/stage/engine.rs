//! Stage journal and recovery engine.
//!
//! Every setting Stage changes gets its own journal entry. The original value
//! and the pending operation are written to disk *before* the setting changes,
//! and the read-back result is written after. Unstage restores a setting only
//! when its current value is still the one Snipsy applied, so values that
//! differ (changed by hand, by another app or by Windows) are kept and
//! reported as conflicts.

use serde::{Deserialize, Serialize};

use crate::models::StageConfig;

pub const JOURNAL_VERSION: u32 = 1;
pub const WINDOWS_ONLY: &str = "Stage is Windows-only for now.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SettingId {
    MouseSonar,
}

impl SettingId {
    pub fn label(self) -> &'static str {
        match self {
            Self::MouseSonar => "Find my pointer",
        }
    }
}

/// A raw OS value. `Absent` and the typed variants keep registry-backed
/// settings exact (a missing value is restored by deleting it again).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum SettingValue {
    Absent,
    Bool(bool),
    Dword(u32),
    String(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum EntryState {
    /// A write may be in flight. After a crash, the current value decides.
    Pending,
    /// Snipsy changed this setting and owns it.
    Applied,
    /// The setting already had the Stage value, so Snipsy doesn't own it.
    AlreadySet,
    Failed { error: String },
    Restored,
    /// Unstage found a value Snipsy didn't apply and kept it.
    Conflict { current: SettingValue },
    RestoreFailed { error: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: SettingId,
    /// Value before Stage. `None` only when it couldn't be read (and so
    /// nothing was written).
    pub original: Option<SettingValue>,
    pub target: SettingValue,
    /// Value read back after Snipsy wrote it. `None` when unknown.
    pub applied: Option<SettingValue>,
    pub owned: bool,
    pub status: EntryState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Applying,
    Staged,
    Degraded,
    Restoring,
}

/// The per-machine record of what Stage changed. Never stored in a project.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Journal {
    pub version: u32,
    pub machine: String,
    pub user: String,
    pub project_path: String,
    pub project_name: String,
    /// Frozen when staging starts; edits apply the next time.
    pub config: StageConfig,
    pub staged_at: String,
    pub phase: Phase,
    pub entries: Vec<JournalEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub machine: String,
    pub user: String,
}

impl Identity {
    pub fn current() -> Self {
        let var = |names: &[&str]| {
            names
                .iter()
                .find_map(|name| std::env::var(name).ok().filter(|v| !v.is_empty()))
                .unwrap_or_else(|| "unknown".into())
        };
        Self {
            machine: var(&["COMPUTERNAME", "HOSTNAME"]),
            user: var(&["USERNAME", "USER"]),
        }
    }
}

pub trait SettingsBackend: Send {
    fn read(&mut self, id: SettingId) -> Result<SettingValue, String>;
    fn write(&mut self, id: SettingId, value: &SettingValue) -> Result<(), String>;
}

pub trait JournalStore: Send {
    fn load(&self) -> Result<Option<Journal>, String>;
    fn save(&mut self, journal: &Journal) -> Result<(), String>;
    fn clear(&mut self) -> Result<(), String>;
    /// Where the journal lives, for error messages.
    fn describe(&self) -> String;
}

/// Runtime keep-awake lease. Lives only as long as the process.
pub trait PowerLease: Send {
    fn acquire(&mut self) -> Result<(), String>;
    fn release(&mut self);
    fn is_held(&self) -> bool;
    /// Replace the held request with a fresh one. Windows drops power
    /// requests on sleep without closing the handle, so the holder renews.
    fn renew(&mut self) -> Result<(), String> {
        self.release();
        self.acquire()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StageState {
    NotStaged,
    /// Stage was interrupted before it finished.
    Staging,
    Staged,
    Degraded,
    /// Unstage didn't finish; run it again.
    Unstaging,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingStatus {
    pub id: SettingId,
    pub label: String,
    pub status: EntryState,
    pub owned: bool,
    /// The setting no longer has its Stage value. Stage again to fix it.
    pub drifted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepAwakeStatus {
    pub requested: bool,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageStatus {
    pub supported: bool,
    /// `windows`, `fake` (tests and drills) or `unsupported`.
    pub backend: String,
    pub state: StageState,
    pub project_path: Option<String>,
    pub project_name: Option<String>,
    pub staged_at: Option<String>,
    pub config: Option<StageConfig>,
    pub keep_awake: KeepAwakeStatus,
    pub settings: Vec<SettingStatus>,
    /// A journal from an earlier run was found at launch.
    pub recovered: bool,
    pub error: Option<String>,
    /// Increases with every snapshot in this process. Consumers drop
    /// snapshots older than the one they have.
    #[serde(default)]
    pub revision: u64,
}

impl StageStatus {
    pub fn unsupported() -> Self {
        Self {
            supported: false,
            backend: "unsupported".into(),
            state: StageState::NotStaged,
            project_path: None,
            project_name: None,
            staged_at: None,
            config: None,
            keep_awake: KeepAwakeStatus {
                requested: false,
                active: false,
            },
            settings: Vec::new(),
            recovered: false,
            error: None,
            revision: 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StageOutcome {
    Staged,
    AlreadyStaged,
    Degraded,
    Unstaged,
    NotStaged,
    UnstageIncomplete,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageReport {
    pub outcome: StageOutcome,
    /// Settings re-applied because they had drifted.
    pub fixed: Vec<String>,
    /// Settings Unstage kept because their value differed from what Snipsy applied.
    pub conflicts: Vec<String>,
    pub failures: Vec<String>,
    /// The project's Stage settings changed since staging; they apply next time.
    pub config_changed: bool,
    pub status: StageStatus,
}

impl StageReport {
    fn new(outcome: StageOutcome) -> Self {
        Self {
            outcome,
            fixed: Vec::new(),
            conflicts: Vec::new(),
            failures: Vec::new(),
            config_changed: false,
            status: StageStatus::unsupported(),
        }
    }
}

/// Settings Stage should apply for a config, in apply order.
pub fn desired_settings(config: &StageConfig) -> Vec<(SettingId, SettingValue)> {
    let mut desired = Vec::new();
    if config.windows.mouse_sonar {
        desired.push((SettingId::MouseSonar, SettingValue::Bool(true)));
    }
    desired
}

pub struct StageEngine {
    backend_name: String,
    backend: Box<dyn SettingsBackend>,
    store: Box<dyn JournalStore>,
    lease: Box<dyn PowerLease>,
    identity: Identity,
    recovered: bool,
}

impl StageEngine {
    pub fn new(
        backend_name: impl Into<String>,
        backend: Box<dyn SettingsBackend>,
        store: Box<dyn JournalStore>,
        lease: Box<dyn PowerLease>,
        identity: Identity,
    ) -> Self {
        Self {
            backend_name: backend_name.into(),
            backend,
            store,
            lease,
            identity,
            recovered: false,
        }
    }

    fn load(&self) -> Result<Option<Journal>, String> {
        let Some(journal) = self.store.load()? else {
            return Ok(None);
        };
        if journal.machine != self.identity.machine || journal.user != self.identity.user {
            return Err(format!(
                "The Stage journal at {} belongs to {} on {}, not {} on {}.",
                self.store.describe(),
                journal.user,
                journal.machine,
                self.identity.user,
                self.identity.machine
            ));
        }
        Ok(Some(journal))
    }

    /// Call once at launch. Never restores anything: staying staged across
    /// restarts is intended. Re-takes the keep-awake lease when staged.
    pub fn recover_on_launch(&mut self) {
        match self.load() {
            Ok(Some(journal)) => {
                self.recovered = true;
                tracing::info!(phase = ?journal.phase, project = %journal.project_name, "Stage journal found at launch");
                if journal.phase != Phase::Restoring && journal.config.shared.keep_awake {
                    if let Err(error) = self.lease.acquire() {
                        tracing::warn!(%error, "Couldn't keep the machine awake after launch");
                    }
                }
            }
            Ok(None) => {}
            Err(error) => tracing::warn!(%error, "Couldn't read the Stage journal at launch"),
        }
    }

    /// Match the lease to the journal: release it when nothing wants it
    /// (for example another Snipsy process unstaged), take it when it's
    /// missing, and renew it when asked. Leaves it alone if the journal
    /// can't be read.
    pub fn reconcile_lease(&mut self, renew: bool) {
        let wanted = match self.load() {
            Ok(Some(journal)) => journal.phase != Phase::Restoring && journal.config.shared.keep_awake,
            Ok(None) => false,
            Err(_) => return,
        };
        if !wanted {
            self.lease.release();
            return;
        }
        let result = if !self.lease.is_held() {
            self.lease.acquire()
        } else if renew {
            self.lease.renew()
        } else {
            Ok(())
        };
        if let Err(error) = result {
            tracing::warn!(%error, "Couldn't keep the machine awake for Stage");
        }
    }

    pub fn release_lease(&mut self) {
        self.lease.release();
    }

    pub fn status(&mut self) -> StageStatus {
        let mut status = StageStatus::unsupported();
        status.supported = true;
        status.backend = self.backend_name.clone();
        status.recovered = self.recovered;
        status.keep_awake.active = self.lease.is_held();
        let journal = match self.load() {
            Ok(Some(journal)) => journal,
            Ok(None) => return status,
            Err(error) => {
                status.error = Some(error);
                return status;
            }
        };
        let mut drift = false;
        for entry in &journal.entries {
            let drifted = matches!(entry.status, EntryState::Applied | EntryState::AlreadySet)
                && journal.phase != Phase::Restoring
                && self
                    .backend
                    .read(entry.id)
                    .map(|current| current != entry.target)
                    .unwrap_or(false);
            drift |= drifted;
            status.settings.push(SettingStatus {
                id: entry.id,
                label: entry.id.label().into(),
                status: entry.status.clone(),
                owned: entry.owned,
                drifted,
            });
        }
        status.keep_awake.requested = journal.config.shared.keep_awake;
        let lease_missing = status.keep_awake.requested && !status.keep_awake.active;
        status.state = match journal.phase {
            Phase::Applying => StageState::Staging,
            Phase::Restoring => StageState::Unstaging,
            Phase::Degraded => StageState::Degraded,
            Phase::Staged if drift || lease_missing => StageState::Degraded,
            Phase::Staged => StageState::Staged,
        };
        status.project_path = Some(journal.project_path);
        status.project_name = Some(journal.project_name);
        status.staged_at = Some(journal.staged_at);
        status.config = Some(journal.config);
        status
    }

    /// Stage a project. Idempotent: when already staged for the same project
    /// it re-applies drifted settings using the frozen config.
    pub fn stage(
        &mut self,
        project_path: &str,
        project_name: &str,
        config: &StageConfig,
    ) -> Result<StageReport, String> {
        let mut report = StageReport::new(StageOutcome::Staged);
        let mut journal = match self.load()? {
            Some(journal) if journal.project_path != project_path => {
                return Err(format!(
                    "This machine is staged for \"{}\". Unstage it first, then Stage this project.",
                    journal.project_name
                ));
            }
            Some(journal) if journal.phase == Phase::Restoring => {
                return Err("The last Unstage didn't finish. Unstage again before staging.".into());
            }
            Some(journal) => {
                report.outcome = StageOutcome::AlreadyStaged;
                report.config_changed = journal.config != *config;
                journal
            }
            None => self.begin(project_path, project_name, config)?,
        };

        for index in 0..journal.entries.len() {
            self.apply_entry(&mut journal, index, &mut report)?;
        }

        let all_good = journal
            .entries
            .iter()
            .all(|entry| matches!(entry.status, EntryState::Applied | EntryState::AlreadySet));
        journal.phase = if all_good {
            Phase::Staged
        } else {
            Phase::Degraded
        };
        self.store
            .save(&journal)
            .map_err(|e| format!("Couldn't record Stage: {e}"))?;

        if journal.config.shared.keep_awake && !self.lease.is_held() {
            if let Err(error) = self.lease.acquire() {
                report.failures.push(format!("Keep awake: {error}"));
            }
        }

        if !report.failures.is_empty() {
            report.outcome = StageOutcome::Degraded;
        }
        report.status = self.status();
        Ok(report)
    }

    /// Records the baseline before anything changes.
    fn begin(
        &mut self,
        project_path: &str,
        project_name: &str,
        config: &StageConfig,
    ) -> Result<Journal, String> {
        let desired = desired_settings(config);
        if desired.is_empty() && !config.shared.keep_awake {
            return Err("Turn on at least one Stage setting first.".into());
        }
        let mut entries = Vec::new();
        for (id, target) in desired {
            let original = self.backend.read(id).ok();
            entries.push(JournalEntry {
                id,
                original,
                target,
                applied: None,
                owned: false,
                status: EntryState::Pending,
            });
        }
        let journal = Journal {
            version: JOURNAL_VERSION,
            machine: self.identity.machine.clone(),
            user: self.identity.user.clone(),
            project_path: project_path.into(),
            project_name: project_name.into(),
            config: config.clone(),
            staged_at: chrono::Utc::now().to_rfc3339(),
            phase: Phase::Applying,
            entries,
        };
        self.store
            .save(&journal)
            .map_err(|e| format!("Couldn't record Stage, so nothing was changed: {e}"))?;
        Ok(journal)
    }

    fn apply_entry(
        &mut self,
        journal: &mut Journal,
        index: usize,
        report: &mut StageReport,
    ) -> Result<(), String> {
        let id = journal.entries[index].id;
        let label = id.label();
        let target = journal.entries[index].target.clone();

        let current = match self.backend.read(id) {
            Ok(value) => value,
            Err(error) => {
                report.failures.push(format!("{label}: {error}"));
                if !matches!(journal.entries[index].status, EntryState::Applied) {
                    journal.entries[index].status = EntryState::Failed { error };
                }
                return self.save_progress(journal, index);
            }
        };
        let entry = &mut journal.entries[index];
        let settled = matches!(entry.status, EntryState::Applied | EntryState::AlreadySet);
        // A missing baseline means the first read failed and nothing was
        // written, so the current value is still the original.
        let original = entry
            .original
            .get_or_insert_with(|| current.clone())
            .clone();

        if current == target {
            if !settled {
                // After a crash mid-write (Pending), a target value may be ours.
                entry.owned = original != target;
                entry.applied = entry.owned.then(|| current.clone());
                entry.status = settled_state(entry.owned);
                return self.save_progress(journal, index);
            }
            return Ok(());
        }

        // Record the intent before writing so a crash mid-write is recoverable.
        entry.status = EntryState::Pending;
        self.store.save(journal).map_err(|e| {
            format!("Couldn't record Stage progress, so {label} wasn't changed: {e}")
        })?;

        let written = self.backend.write(id, &target);
        let read_back = self.backend.read(id);
        let entry = &mut journal.entries[index];
        match (written, read_back) {
            (Ok(()), Ok(value)) if value == target => {
                entry.owned = original != target;
                entry.applied = entry.owned.then_some(value);
                entry.status = settled_state(entry.owned);
                if settled {
                    report.fixed.push(label.into());
                }
            }
            (written, read_back) => {
                let error = match (&written, &read_back) {
                    (Err(error), _) => error.clone(),
                    (_, Err(error)) => format!("couldn't read it back: {error}"),
                    (_, Ok(value)) => format!("read back {value:?} instead of {target:?}"),
                };
                match read_back {
                    Ok(value) => {
                        entry.owned = value != original;
                        entry.applied = entry.owned.then_some(value);
                    }
                    Err(_) => {
                        // Unknown: leave it Pending-like for Unstage to judge by target.
                        entry.owned = true;
                        entry.applied = None;
                    }
                }
                report.failures.push(format!("{label}: {error}"));
                entry.status = EntryState::Failed { error };
            }
        }
        self.save_progress(journal, index)
    }

    /// Saves after a setting changed. If the journal can't record it, the
    /// setting is put back so the machine never holds an unrecorded change.
    fn save_progress(&mut self, journal: &Journal, index: usize) -> Result<(), String> {
        let Err(error) = self.store.save(journal) else {
            return Ok(());
        };
        let entry = &journal.entries[index];
        let label = entry.id.label();
        if entry.owned {
            if let Some(original) = &entry.original {
                if let Err(rollback) = self.backend.write(entry.id, original) {
                    return Err(format!(
                        "Couldn't record Stage progress ({error}) or put {label} back ({rollback})."
                    ));
                }
            }
        }
        Err(format!(
            "Couldn't record Stage progress, so {label} was put back: {error}"
        ))
    }

    /// Restores what Snipsy owns. A no-op when nothing is staged. Works
    /// without the original project, because the journal has everything.
    pub fn unstage(&mut self) -> Result<StageReport, String> {
        let Some(mut journal) = self.load()? else {
            self.lease.release();
            let mut report = StageReport::new(StageOutcome::NotStaged);
            report.status = self.status();
            return Ok(report);
        };
        let mut report = StageReport::new(StageOutcome::Unstaged);
        journal.phase = Phase::Restoring;
        self.store
            .save(&journal)
            .map_err(|e| format!("Couldn't record Unstage, so nothing was changed: {e}"))?;

        for index in 0..journal.entries.len() {
            self.restore_entry(&mut journal, index, &mut report)?;
        }
        self.lease.release();

        let incomplete = journal
            .entries
            .iter()
            .any(|entry| matches!(entry.status, EntryState::RestoreFailed { .. }));
        if incomplete {
            report.outcome = StageOutcome::UnstageIncomplete;
        } else {
            self.store.clear().map_err(|e| {
                format!("Settings were restored, but the Stage journal couldn't be removed: {e}")
            })?;
            self.recovered = false;
        }
        report.status = self.status();
        Ok(report)
    }

    fn restore_entry(
        &mut self,
        journal: &mut Journal,
        index: usize,
        report: &mut StageReport,
    ) -> Result<(), String> {
        let entry = &journal.entries[index];
        let id = entry.id;
        let label = id.label();
        if matches!(
            entry.status,
            EntryState::Restored | EntryState::Conflict { .. } | EntryState::AlreadySet
        ) {
            return Ok(());
        }
        let Some(original) = entry.original.clone() else {
            // Never read, so never written.
            journal.entries[index].status = EntryState::Restored;
            return self.save_restore(journal);
        };
        // A failed entry whose read-back showed no change was never ours.
        if matches!(entry.status, EntryState::Failed { .. }) && !entry.owned {
            journal.entries[index].status = EntryState::Restored;
            return self.save_restore(journal);
        }

        let current = match self.backend.read(id) {
            Ok(value) => value,
            Err(error) => {
                report.failures.push(format!("{label}: {error}"));
                journal.entries[index].status = EntryState::RestoreFailed { error };
                return self.save_restore(journal);
            }
        };
        let entry = &journal.entries[index];
        let ours = match &entry.applied {
            Some(applied) => *applied == current,
            None => current == entry.target,
        };

        let status = if current == original {
            EntryState::Restored
        } else if ours {
            let written = self.backend.write(id, &original);
            match (written, self.backend.read(id)) {
                (Ok(()), Ok(value)) if value == original => EntryState::Restored,
                (Err(error), _) | (_, Err(error)) => EntryState::RestoreFailed { error },
                (_, Ok(value)) => EntryState::RestoreFailed {
                    error: format!("read back {value:?} instead of {original:?}"),
                },
            }
        } else {
            report.conflicts.push(label.into());
            EntryState::Conflict { current }
        };
        if let EntryState::RestoreFailed { error } = &status {
            report.failures.push(format!("{label}: {error}"));
        }
        journal.entries[index].status = status;
        self.save_restore(journal)
    }

    fn save_restore(&mut self, journal: &Journal) -> Result<(), String> {
        // Restoring is idempotent, so a failed save is safe to retry.
        self.store
            .save(journal)
            .map_err(|e| format!("Couldn't record Unstage progress; run Unstage again: {e}"))
    }
}

fn settled_state(owned: bool) -> EntryState {
    if owned {
        EntryState::Applied
    } else {
        EntryState::AlreadySet
    }
}
