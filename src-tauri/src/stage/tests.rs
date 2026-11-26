use std::sync::{Arc, Mutex};

use super::engine::*;
use super::store::{FakeLease, FakeSettings, FileJournalStore};
use super::StageService;
use crate::models::StageConfig;

const SONAR: SettingId = SettingId::MouseSonar;
const ON: SettingValue = SettingValue::Bool(true);
const OFF: SettingValue = SettingValue::Bool(false);

/// In-memory journal with a save budget to simulate storage failures.
#[derive(Clone, Default)]
struct MemoryStore {
    journal: Arc<Mutex<Option<Journal>>>,
    /// Saves left before every save fails. `None` means unlimited.
    saves_left: Arc<Mutex<Option<usize>>>,
}

impl MemoryStore {
    fn fail_after(&self, saves: usize) {
        *self.saves_left.lock().unwrap() = Some(saves);
    }
    fn heal(&self) {
        *self.saves_left.lock().unwrap() = None;
    }
    fn get(&self) -> Option<Journal> {
        self.journal.lock().unwrap().clone()
    }
}

impl JournalStore for MemoryStore {
    fn load(&self) -> Result<Option<Journal>, String> {
        Ok(self.get())
    }
    fn save(&mut self, journal: &Journal) -> Result<(), String> {
        let mut left = self.saves_left.lock().unwrap();
        if let Some(n) = left.as_mut() {
            if *n == 0 {
                return Err("disk full".into());
            }
            *n -= 1;
        }
        *self.journal.lock().unwrap() = Some(journal.clone());
        Ok(())
    }
    fn clear(&mut self) -> Result<(), String> {
        *self.journal.lock().unwrap() = None;
        Ok(())
    }
    fn describe(&self) -> String {
        "memory".into()
    }
}

fn me() -> Identity {
    Identity {
        machine: "PC".into(),
        user: "seth".into(),
    }
}

struct Rig {
    settings: FakeSettings,
    store: MemoryStore,
    lease: FakeLease,
}

impl Rig {
    fn new(initial: SettingValue) -> Self {
        Self {
            settings: FakeSettings::in_memory(initial),
            store: MemoryStore::default(),
            lease: FakeLease::default(),
        }
    }

    /// A fresh engine over the same machine state, like a restarted app.
    fn engine(&self) -> StageEngine {
        StageEngine::new(
            "fake",
            Box::new(self.settings.clone()),
            Box::new(self.store.clone()),
            Box::new(self.lease.clone()),
            me(),
        )
    }

    fn sonar(&self) -> SettingValue {
        self.settings.get(SONAR)
    }

    fn writes(&self) -> usize {
        self.settings.knobs.lock().unwrap().writes
    }
}

fn config(sonar: bool, keep_awake: bool) -> StageConfig {
    let mut config = StageConfig::default();
    config.windows.mouse_sonar = sonar;
    config.shared.keep_awake = keep_awake;
    config
}

fn sonar_entry(journal: &Journal) -> &JournalEntry {
    journal.entries.iter().find(|e| e.id == SONAR).unwrap()
}

#[test]
fn stage_then_unstage_puts_the_setting_back() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    let report = engine.stage("/a", "A", &config(true, true)).unwrap();
    assert_eq!(report.outcome, StageOutcome::Staged);
    assert_eq!(report.status.state, StageState::Staged);
    assert!(report.status.keep_awake.active);
    assert_eq!(rig.sonar(), ON);
    let journal = rig.store.get().unwrap();
    assert_eq!(journal.phase, Phase::Staged);
    let entry = sonar_entry(&journal);
    assert_eq!(entry.original, Some(OFF));
    assert_eq!(entry.applied, Some(ON));
    assert!(entry.owned);
    assert_eq!(entry.status, EntryState::Applied);

    let report = engine.unstage().unwrap();
    assert_eq!(report.outcome, StageOutcome::Unstaged);
    assert_eq!(rig.sonar(), OFF);
    assert!(rig.store.get().is_none());
    assert!(!rig.lease.is_held());
    assert_eq!(report.status.state, StageState::NotStaged);
}

#[test]
fn unchanged_settings_are_not_owned_or_touched() {
    let rig = Rig::new(ON);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, false)).unwrap();
    let entry = sonar_entry(&rig.store.get().unwrap()).clone();
    assert_eq!(entry.status, EntryState::AlreadySet);
    assert!(!entry.owned);
    engine.unstage().unwrap();
    assert_eq!(rig.sonar(), ON);
    assert_eq!(rig.writes(), 0);
}

#[test]
fn staging_again_reapplies_drift_only() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, false)).unwrap();
    let again = engine.stage("/a", "A", &config(true, false)).unwrap();
    assert_eq!(again.outcome, StageOutcome::AlreadyStaged);
    assert!(again.fixed.is_empty());
    assert_eq!(rig.writes(), 1);

    rig.settings.set(SONAR, OFF);
    let status = engine.status();
    assert_eq!(status.state, StageState::Degraded);
    assert!(status.settings[0].drifted);

    let fixed = engine.stage("/a", "A", &config(true, false)).unwrap();
    assert_eq!(fixed.fixed, ["Find my pointer"]);
    assert_eq!(rig.sonar(), ON);
    assert_eq!(fixed.status.state, StageState::Staged);
    // Unstage still restores the original baseline, not the drifted value.
    engine.unstage().unwrap();
    assert_eq!(rig.sonar(), OFF);
}

#[test]
fn config_is_frozen_while_staged() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, false)).unwrap();
    let report = engine.stage("/a", "A", &config(false, true)).unwrap();
    assert!(report.config_changed);
    assert!(!rig.lease.is_held());
    assert_eq!(report.status.config, Some(config(true, false)));
}

#[test]
fn another_project_must_unstage_first() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, false)).unwrap();
    let error = engine.stage("/b", "B", &config(true, false)).unwrap_err();
    assert!(error.contains("staged for \"A\""), "{error}");
    assert!(error.contains("Unstage it first"), "{error}");
    assert_eq!(rig.store.get().unwrap().project_path, "/a");
    engine.unstage().unwrap();
    engine.stage("/b", "B", &config(true, false)).unwrap();
}

#[test]
fn unstage_without_stage_is_a_no_op() {
    let rig = Rig::new(ON);
    let report = rig.engine().unstage().unwrap();
    assert_eq!(report.outcome, StageOutcome::NotStaged);
    assert_eq!(rig.writes(), 0);
    assert_eq!(rig.sonar(), ON);
}

#[test]
fn nothing_enabled_is_rejected() {
    let rig = Rig::new(OFF);
    let error = rig.engine().stage("/a", "A", &config(false, false)).unwrap_err();
    assert!(error.contains("at least one"), "{error}");
    assert!(rig.store.get().is_none());
}

#[test]
fn values_changed_by_someone_else_are_kept() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, false)).unwrap();
    // Another app or policy set something Snipsy never applied.
    rig.settings.set(SONAR, SettingValue::Dword(7));
    let report = engine.unstage().unwrap();
    assert_eq!(report.conflicts, ["Find my pointer"]);
    assert_eq!(rig.sonar(), SettingValue::Dword(7));
    assert!(rig.store.get().is_none());
}

#[test]
fn value_already_back_to_original_is_not_rewritten() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, false)).unwrap();
    rig.settings.set(SONAR, OFF);
    let before = rig.writes();
    let report = engine.unstage().unwrap();
    assert!(report.conflicts.is_empty());
    assert_eq!(rig.writes(), before);
}

#[test]
fn baseline_save_failure_changes_nothing() {
    let rig = Rig::new(OFF);
    rig.store.fail_after(0);
    let error = rig.engine().stage("/a", "A", &config(true, true)).unwrap_err();
    assert!(error.contains("nothing was changed"), "{error}");
    assert_eq!(rig.sonar(), OFF);
    assert_eq!(rig.writes(), 0);
    assert!(!rig.lease.is_held());
}

#[test]
fn pending_save_failure_changes_nothing() {
    let rig = Rig::new(OFF);
    rig.store.fail_after(1);
    let error = rig.engine().stage("/a", "A", &config(true, false)).unwrap_err();
    assert!(error.contains("wasn't changed"), "{error}");
    assert_eq!(rig.sonar(), OFF);
    assert_eq!(rig.writes(), 0);
}

#[test]
fn unrecorded_change_is_rolled_back() {
    let rig = Rig::new(OFF);
    // Baseline and pending are saved; recording the result fails.
    rig.store.fail_after(2);
    let error = rig.engine().stage("/a", "A", &config(true, false)).unwrap_err();
    assert!(error.contains("put back"), "{error}");
    assert_eq!(rig.sonar(), OFF);
    // The durable journal still says Pending, which Unstage handles.
    rig.store.heal();
    let journal = rig.store.get().unwrap();
    assert_eq!(sonar_entry(&journal).status, EntryState::Pending);
    rig.engine().unstage().unwrap();
    assert_eq!(rig.sonar(), OFF);
    assert!(rig.store.get().is_none());
}

/// A crash after the write but before the result was recorded.
fn crashed_mid_write(rig: &Rig, value_now: SettingValue) {
    rig.store.fail_after(2);
    let _ = rig.engine().stage("/a", "A", &config(true, false));
    rig.store.heal();
    rig.settings.set(SONAR, value_now);
}

#[test]
fn crash_mid_write_then_unstage_restores() {
    let rig = Rig::new(OFF);
    crashed_mid_write(&rig, ON);
    let mut engine = rig.engine();
    engine.recover_on_launch();
    assert_eq!(engine.status().state, StageState::Staging);
    assert!(engine.status().recovered);
    engine.unstage().unwrap();
    assert_eq!(rig.sonar(), OFF);
}

#[test]
fn crash_mid_write_then_stage_finishes() {
    let rig = Rig::new(OFF);
    crashed_mid_write(&rig, ON);
    let mut engine = rig.engine();
    let report = engine.stage("/a", "A", &config(true, false)).unwrap();
    assert_eq!(report.status.state, StageState::Staged);
    let entry = sonar_entry(&rig.store.get().unwrap()).clone();
    assert_eq!(entry.status, EntryState::Applied);
    assert!(entry.owned);
    engine.unstage().unwrap();
    assert_eq!(rig.sonar(), OFF);
}

#[test]
fn partial_restore_keeps_the_journal_for_retry() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, true)).unwrap();
    rig.settings.knobs.lock().unwrap().fail_writes = true;
    let report = engine.unstage().unwrap();
    assert_eq!(report.outcome, StageOutcome::UnstageIncomplete);
    assert_eq!(report.status.state, StageState::Unstaging);
    assert_eq!(rig.store.get().unwrap().phase, Phase::Restoring);
    assert_eq!(rig.sonar(), ON);

    let error = engine.stage("/a", "A", &config(true, true)).unwrap_err();
    assert!(error.contains("Unstage again"), "{error}");

    rig.settings.knobs.lock().unwrap().fail_writes = false;
    let report = engine.unstage().unwrap();
    assert_eq!(report.outcome, StageOutcome::Unstaged);
    assert_eq!(rig.sonar(), OFF);
    assert!(rig.store.get().is_none());
}

#[test]
fn failed_apply_is_degraded_and_unstage_is_clean() {
    let rig = Rig::new(OFF);
    rig.settings.knobs.lock().unwrap().fail_writes = true;
    let mut engine = rig.engine();
    let report = engine.stage("/a", "A", &config(true, false)).unwrap();
    assert_eq!(report.outcome, StageOutcome::Degraded);
    assert_eq!(report.status.state, StageState::Degraded);
    assert_eq!(report.failures.len(), 1);
    rig.settings.knobs.lock().unwrap().fail_writes = false;
    engine.unstage().unwrap();
    assert_eq!(rig.sonar(), OFF);
    assert_eq!(rig.writes(), 0);
}

#[test]
fn read_back_mismatch_is_a_failure() {
    let rig = Rig::new(OFF);
    rig.settings.knobs.lock().unwrap().sticky = Some(OFF);
    let report = rig.engine().stage("/a", "A", &config(true, false)).unwrap();
    assert_eq!(report.outcome, StageOutcome::Degraded);
    let entry = sonar_entry(&rig.store.get().unwrap()).clone();
    assert!(matches!(entry.status, EntryState::Failed { .. }));
    assert!(!entry.owned);
}

#[test]
fn keep_awake_failure_is_degraded() {
    let rig = Rig::new(OFF);
    *rig.lease.fail.lock().unwrap() = true;
    let report = rig.engine().stage("/a", "A", &config(false, true)).unwrap();
    assert_eq!(report.outcome, StageOutcome::Degraded);
    assert_eq!(report.status.state, StageState::Degraded);
    assert!(report.status.keep_awake.requested);
    assert!(!report.status.keep_awake.active);
}

#[test]
fn restart_stays_staged_and_retakes_keep_awake() {
    let rig = Rig::new(OFF);
    rig.engine().stage("/a", "A", &config(true, true)).unwrap();
    // Process exit drops the runtime lease; settings stay.
    rig.lease.clone().release();

    let mut engine = rig.engine();
    assert_eq!(engine.status().state, StageState::Degraded);
    engine.recover_on_launch();
    let status = engine.status();
    assert!(status.recovered);
    assert_eq!(status.state, StageState::Staged);
    assert!(status.keep_awake.active);
    assert_eq!(status.project_name.as_deref(), Some("A"));
    assert_eq!(rig.sonar(), ON);
}

#[test]
fn journal_from_another_user_is_refused() {
    let rig = Rig::new(OFF);
    rig.engine().stage("/a", "A", &config(true, false)).unwrap();
    let mut other = StageEngine::new(
        "fake",
        Box::new(rig.settings.clone()),
        Box::new(rig.store.clone()),
        Box::new(rig.lease.clone()),
        Identity {
            machine: "PC".into(),
            user: "someone".into(),
        },
    );
    assert!(other.status().error.unwrap().contains("belongs to seth"));
    assert!(other.unstage().is_err());
    assert_eq!(rig.sonar(), ON);
}

#[test]
fn file_store_round_trips_and_checks_version() {
    let tmp = tempfile::TempDir::new().unwrap();
    let rig = Rig::new(OFF);
    let mut engine = StageEngine::new(
        "fake",
        Box::new(rig.settings.clone()),
        Box::new(FileJournalStore::new(tmp.path())),
        Box::new(rig.lease.clone()),
        me(),
    );
    engine.stage("/a", "A", &config(true, false)).unwrap();
    let store = FileJournalStore::new(tmp.path());
    let journal = store.load().unwrap().unwrap();
    assert_eq!(journal.phase, Phase::Staged);
    let leftovers: Vec<_> = std::fs::read_dir(tmp.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(leftovers, ["stage-journal.json"]);

    let path = tmp.path().join("stage-journal.json");
    let text = std::fs::read_to_string(&path).unwrap();
    std::fs::write(&path, text.replace("\"version\": 1", "\"version\": 99")).unwrap();
    assert!(store.load().unwrap_err().contains("version 99"));

    std::fs::write(&path, "{").unwrap();
    assert!(store.load().unwrap_err().contains("damaged"));

    let mut store = store;
    store.clear().unwrap();
    store.clear().unwrap();
    assert!(store.load().unwrap().is_none());
}

#[test]
fn persisted_fake_settings_survive_restart() {
    let tmp = tempfile::TempDir::new().unwrap();
    let file = tmp.path().join("fake-settings.json");
    let mut first = FakeSettings::persisted(file.clone());
    first.write(SONAR, &ON).unwrap();
    assert_eq!(FakeSettings::persisted(file).get(SONAR), ON);
}

#[test]
fn concurrent_stage_requests_are_serialized() {
    let tmp = tempfile::TempDir::new().unwrap();
    let settings = FakeSettings::in_memory(OFF);
    let lock = tmp.path().join("stage.lock");
    // Two services (like two processes) share the journal and the lock file.
    let services: Vec<Arc<StageService>> = (0..2)
        .map(|_| {
            Arc::new(StageService::new(
                Some(StageEngine::new(
                    "fake",
                    Box::new(settings.clone()),
                    Box::new(FileJournalStore::new(tmp.path())),
                    Box::new(FakeLease::default()),
                    me(),
                )),
                Some(lock.clone()),
            ))
        })
        .collect();
    let handles: Vec<_> = (0..8)
        .map(|i| {
            let service = services[i % 2].clone();
            std::thread::spawn(move || service.stage("/a", "A", &config(true, false)).unwrap())
        })
        .collect();
    let outcomes: Vec<_> = handles
        .into_iter()
        .map(|h| h.join().unwrap().outcome)
        .collect();
    assert_eq!(
        outcomes
            .iter()
            .filter(|o| **o == StageOutcome::Staged)
            .count(),
        1
    );
    assert_eq!(settings.knobs.lock().unwrap().writes, 1);
    let journal = FileJournalStore::new(tmp.path()).load().unwrap().unwrap();
    assert_eq!(sonar_entry(&journal).original, Some(OFF));
}

#[test]
fn unsupported_service_reports_windows_only() {
    let service = StageService::unsupported();
    assert!(!service.status().supported);
    assert_eq!(service.unstage().unwrap_err(), WINDOWS_ONLY);
}

#[test]
fn reconcile_renews_a_wanted_lease_and_drops_an_unwanted_one() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, true)).unwrap();
    // Sleep dropped the request (simulated): renewing takes a fresh one.
    engine.reconcile_lease(true);
    assert_eq!(*rig.lease.renewals.lock().unwrap(), 1);
    assert!(rig.lease.is_held());

    // Another process unstaged: the journal is gone, so this lease goes too.
    let mut other = StageEngine::new(
        "fake",
        Box::new(rig.settings.clone()),
        Box::new(rig.store.clone()),
        Box::new(FakeLease::default()),
        me(),
    );
    other.unstage().unwrap();
    assert!(rig.lease.is_held());
    engine.reconcile_lease(true);
    assert!(!rig.lease.is_held());
    assert_eq!(*rig.lease.renewals.lock().unwrap(), 1);
}

#[test]
fn reconcile_takes_a_missing_lease_only_when_keep_awake_is_staged() {
    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, false)).unwrap();
    engine.reconcile_lease(false);
    assert!(!rig.lease.is_held());

    let rig = Rig::new(OFF);
    let mut engine = rig.engine();
    engine.stage("/a", "A", &config(true, true)).unwrap();
    rig.lease.clone().release();
    engine.reconcile_lease(false);
    assert!(rig.lease.is_held());
    assert_eq!(*rig.lease.renewals.lock().unwrap(), 0);
}

#[test]
fn service_snapshots_have_increasing_revisions() {
    let rig = Rig::new(OFF);
    let service = StageService::new(Some(rig.engine()), None);
    let first = service.status();
    let report = service.stage("/a", "A", &config(true, false)).unwrap();
    let after = service.status();
    assert!(first.revision < report.status.revision);
    assert!(report.status.revision < after.revision);
    assert!(service.claim_publish(&after));
    // An older snapshot arriving late must not overwrite the newer one.
    assert!(!service.claim_publish(&report.status));
}
