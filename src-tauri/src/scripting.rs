use std::collections::HashSet;
use std::path::PathBuf;

#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::process::Command;

use crate::models::{AutomationContribution, Script};
use tauri_plugin_auditaur::IpcTraceContext;

fn automation_file(project_path: &str, script_id: &str) -> PathBuf {
    PathBuf::from(project_path)
        .join("automations")
        .join(format!("{}.json", script_id))
}

fn load_automation(project_path: &str, script_id: &str) -> Result<Script, String> {
    let script_file = automation_file(project_path, script_id);
    let content = std::fs::read_to_string(&script_file)
        .map_err(|e| format!("Failed to read automation: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse automation: {}", e))
}

fn idempotency_key(contribution: &AutomationContribution) -> String {
    match contribution {
        AutomationContribution::OpenSite {
            id,
            url,
            idempotency_key,
            ..
        } => {
            let key = idempotency_key
                .clone()
                .unwrap_or_else(|| format!("openSite:{}", url.trim().to_ascii_lowercase()));
            if key.trim().is_empty() {
                id.clone()
            } else {
                key
            }
        }
    }
}

fn validate_site_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Open site contributions require an http:// or https:// URL.".into());
    }
    if trimmed.chars().any(char::is_control) || trimmed.contains('"') {
        return Err("Open site URL contains unsupported characters.".into());
    }
    Ok(())
}

fn open_site(url: &str) -> Result<(), String> {
    validate_site_url(url)?;
    let url = url.trim();
    #[cfg(target_os = "windows")]
    {
        use windows::core::{w, HSTRING, PCWSTR};
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let target = HSTRING::from(url);
        let result = unsafe {
            ShellExecuteW(
                None,
                w!("open"),
                &target,
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };

        if result.0 as isize <= 32 {
            return Err(format!("open site error: ShellExecuteW failed with code {:?}", result.0));
        }
    }
    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| format!("open site error: {}", e))?;
    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map_err(|e| format!("open site error: {}", e))?;
    Ok(())
}

fn execute_contribution(contribution: &AutomationContribution) -> Result<(), String> {
    match contribution {
        AutomationContribution::OpenSite { url, .. } => open_site(url),
    }
}

fn execute_contribution_groups(script: &Script) -> Result<usize, String> {
    let mut executed = HashSet::new();
    let mut count = 0;
    for group in &script.contribution_groups {
        for contribution in &group.contributions {
            let key = idempotency_key(contribution);
            if !executed.insert(key.clone()) {
                tracing::info!(idempotency_key = %key, "Skipping already executed automation contribution");
                continue;
            }
            tracing::info!(idempotency_key = %key, "Executing automation contribution");
            execute_contribution(contribution)?;
            count += 1;
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }
    Ok(count)
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn run_automation(
    project_path: String,
    script_id: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<String, String> {
    let script = load_automation(&project_path, &script_id)?;

    let contribution_count = execute_contribution_groups(&script)?;

    Ok(format!(
        "Ran {} contribution{}.",
        contribution_count,
        if contribution_count == 1 { "" } else { "s" },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_http_open_site_urls() {
        assert!(validate_site_url("file:///tmp/demo").is_err());
        assert!(validate_site_url("https://snipsy.dev").is_ok());
    }

    #[test]
    fn duplicate_contribution_keys_are_idempotent_per_run() {
        let script = Script {
            id: "automation-1".into(),
            title: "Demo".into(),
            description: "".into(),
            hotkey: None,
            contribution_groups: vec![crate::models::AutomationContributionGroup {
                id: "group-1".into(),
                title: "Setup".into(),
                contributions: vec![
                    AutomationContribution::OpenSite {
                        id: "site-1".into(),
                        title: None,
                        url: "https://snipsy.dev".into(),
                        idempotency_key: Some("docs".into()),
                    },
                    AutomationContribution::OpenSite {
                        id: "site-2".into(),
                        title: None,
                        url: "https://snipsy.dev".into(),
                        idempotency_key: Some("docs".into()),
                    },
                ],
            }],
            stream_deck_icon: None,
        };

        let keys = script.contribution_groups[0]
            .contributions
            .iter()
            .map(idempotency_key)
            .collect::<Vec<_>>();

        assert_eq!(keys, vec!["docs", "docs"]);
    }
}
