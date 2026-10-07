use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;

use crate::models::{AutomationContribution, Script};
use tauri_plugin_auditaur::IpcTraceContext;

const OPEN_SITE_SETTLE_MS: u64 = 500;

#[derive(Debug, Default)]
struct AutomationRunSummary {
    opened: Vec<String>,
    skipped: Vec<String>,
}

impl AutomationRunSummary {
    fn message(&self) -> String {
        let opened_count = self.opened.len();
        let skipped_count = self.skipped.len();
        let mut message = format!(
            "Opened {} site{}",
            opened_count,
            if opened_count == 1 { "" } else { "s" }
        );

        if !self.opened.is_empty() {
            message.push_str(": ");
            message.push_str(&self.opened.join(", "));
        }

        if skipped_count > 0 {
            message.push_str(&format!(
                ". Skipped {} duplicate{}",
                skipped_count,
                if skipped_count == 1 { "" } else { "s" }
            ));
        }

        message.push('.');
        message
    }
}

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
                .unwrap_or_else(|| format!("openSite:{}", url.trim()));
            if key.trim().is_empty() {
                id.clone()
            } else {
                key
            }
        }
    }
}

fn contribution_label(contribution: &AutomationContribution) -> String {
    match contribution {
        AutomationContribution::OpenSite { title, url, .. } => title
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| url.trim())
            .to_string(),
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
    open_site_windows(url)?;
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

#[cfg(target_os = "windows")]
fn open_site_windows(url: &str) -> Result<(), String> {
    match default_browser_command(url) {
        Ok((program, args)) => {
            Command::new(&program)
                .args(&args)
                .spawn()
                .map_err(|e| format!("open site error: failed to launch default browser: {}", e))?;
            tracing::info!(
                url,
                browser = %program,
                "Launched open site URL in default browser"
            );
            Ok(())
        }
        Err(error) => {
            tracing::warn!(
                url,
                error = %error,
                "Falling back to Windows shell for open site URL"
            );
            shell_execute_url(url)
        }
    }
}

#[cfg(target_os = "windows")]
fn shell_execute_url(url: &str) -> Result<(), String> {
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
        return Err(format!(
            "open site error: ShellExecuteW failed with code {:?}",
            result.0
        ));
    }

    tracing::info!(url, shell_result = ?result.0, "Windows shell accepted open site URL");
    Ok(())
}

#[cfg(target_os = "windows")]
fn default_browser_command(url: &str) -> Result<(String, Vec<String>), String> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let user_choice = hkcu
        .open_subkey(
            r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice",
        )
        .map_err(|e| format!("failed to read default HTTPS association: {}", e))?;
    let prog_id: String = user_choice
        .get_value("ProgId")
        .map_err(|e| format!("failed to read default HTTPS ProgId: {}", e))?;

    let classes_root = RegKey::predef(HKEY_CLASSES_ROOT);
    let command_key = classes_root
        .open_subkey(format!(r"{}\shell\open\command", prog_id))
        .map_err(|e| format!("failed to read browser command for {}: {}", prog_id, e))?;
    let command_template: String = command_key.get_value("").map_err(|e| {
        format!(
            "failed to read browser command value for {}: {}",
            prog_id, e
        )
    })?;

    command_from_template(&command_template, url)
}

#[cfg(target_os = "windows")]
fn command_from_template(
    command_template: &str,
    url: &str,
) -> Result<(String, Vec<String>), String> {
    let mut parts = split_windows_command_line(command_template);
    if parts.is_empty() {
        return Err("default browser command is empty".into());
    }

    let program = parts.remove(0);
    let mut replaced_url = false;
    let mut args = Vec::new();
    for arg in parts {
        let mut replaced = arg;
        for placeholder in ["%1", "%L", "%l", "%u", "%U"] {
            if replaced.contains(placeholder) {
                replaced = replaced.replace(placeholder, url);
                replaced_url = true;
            }
        }

        if !replaced.trim().is_empty() {
            args.push(replaced);
        }
    }

    if !replaced_url {
        args.push(url.to_string());
    }

    Ok((program, args))
}

#[cfg(target_os = "windows")]
fn split_windows_command_line(command: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in command.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ch if ch.is_whitespace() && !in_quotes => {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        parts.push(current);
    }

    parts
}

fn execute_contribution(contribution: &AutomationContribution) -> Result<(), String> {
    match contribution {
        AutomationContribution::OpenSite { url, .. } => open_site(url),
    }
}

fn execute_contribution_groups(script: &Script) -> Result<AutomationRunSummary, String> {
    let mut executed = HashSet::new();
    let mut summary = AutomationRunSummary::default();
    for group in &script.contribution_groups {
        for contribution in &group.contributions {
            let key = idempotency_key(contribution);
            let label = contribution_label(contribution);
            if !executed.insert(key.clone()) {
                tracing::info!(
                    group = %group.title,
                    contribution = %label,
                    idempotency_key = %key,
                    "Skipping already executed automation contribution"
                );
                summary.skipped.push(label);
                continue;
            }
            tracing::info!(
                group = %group.title,
                contribution = %label,
                idempotency_key = %key,
                "Executing automation contribution"
            );
            execute_contribution(contribution).map_err(|error| format!("{label}: {error}"))?;
            tracing::info!(
                group = %group.title,
                contribution = %label,
                idempotency_key = %key,
                "Automation contribution accepted"
            );
            summary.opened.push(label);
            std::thread::sleep(std::time::Duration::from_millis(OPEN_SITE_SETTLE_MS));
        }
    }
    Ok(summary)
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn run_automation(
    project_path: String,
    script_id: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<String, String> {
    let script = load_automation(&project_path, &script_id)?;

    let summary =
        tauri::async_runtime::spawn_blocking(move || execute_contribution_groups(&script))
            .await
            .map_err(|error| format!("Automation task failed: {error}"))??;

    Ok(summary.message())
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

    #[test]
    fn default_idempotency_key_preserves_url_case() {
        let first = AutomationContribution::OpenSite {
            id: "site-1".into(),
            title: None,
            url: "https://example.com/Path".into(),
            idempotency_key: None,
        };
        let second = AutomationContribution::OpenSite {
            id: "site-2".into(),
            title: None,
            url: "https://example.com/path".into(),
            idempotency_key: None,
        };

        assert_ne!(idempotency_key(&first), idempotency_key(&second));
    }

    #[test]
    fn automation_run_summary_lists_opened_and_skipped_sites() {
        let summary = AutomationRunSummary {
            opened: vec!["Caldova".into(), "Teams".into()],
            skipped: vec!["Teams duplicate".into()],
        };

        assert_eq!(
            summary.message(),
            "Opened 2 sites: Caldova, Teams. Skipped 1 duplicate."
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn default_browser_command_preserves_query_string_as_one_argument() {
        let url =
            "https://teams.microsoft.com/v2/l/chat/0/0?tenantId=tenant&users=contracts@caldova.com";
        let (program, args) = command_from_template(
            r#""C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --single-argument "%1""#,
            url,
        )
        .unwrap();

        assert_eq!(
            program,
            r#"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"#
        );
        assert_eq!(args, vec!["--single-argument", url]);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn default_browser_command_appends_url_without_placeholder() {
        let (program, args) = command_from_template(
            r#""C:\Browser\browser.exe" --new-tab"#,
            "https://snipsy.dev",
        )
        .unwrap();

        assert_eq!(program, r#"C:\Browser\browser.exe"#);
        assert_eq!(args, vec!["--new-tab", "https://snipsy.dev"]);
    }
}
