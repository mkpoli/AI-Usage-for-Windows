//! Where the app looks for coding-CLI credentials and transcripts.
//!
//! Coding CLIs keep their state under the user's home directory. On a machine where the CLIs run
//! inside WSL, that home is the distro's, reachable from Windows as `\\wsl.localhost\<distro>`.
//! The selected environment decides what `~` means for plugin file reads.

use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// Setting value for the Windows user profile.
pub const WINDOWS_SETTING: &str = "windows";
/// Setting prefix for a WSL distro, e.g. `wsl:Ubuntu`.
pub const WSL_SETTING_PREFIX: &str = "wsl:";

/// Home-relative roots that stay in the Windows profile whatever the setting says: the app's own
/// config, and the state directories of Windows applications.
const WINDOWS_ONLY_ROOTS: [&str; 2] = [".ai-usage", "appdata"];

/// Distros WSL manages for other products; they hold no user home worth reading.
const SYSTEM_DISTROS: [&str; 2] = ["docker-desktop", "docker-desktop-data"];

const WSL_COMMAND_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CliEnvironment {
    Windows,
    Wsl(WslEnvironment),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslEnvironment {
    pub distro: String,
    /// The distro's home as Windows sees it, e.g. `\\wsl.localhost\Ubuntu\home\ada`.
    pub windows_home: PathBuf,
    /// The same home as the distro sees it, e.g. `/home/ada`.
    pub linux_home: String,
}

static ACTIVE: RwLock<Option<CliEnvironment>> = RwLock::new(None);

/// The environment in force. Defaults to the Windows profile.
pub fn active() -> CliEnvironment {
    ACTIVE
        .read()
        .ok()
        .and_then(|value| value.clone())
        .unwrap_or(CliEnvironment::Windows)
}

/// The active WSL distro, for callers that run commands inside it.
pub fn active_wsl() -> Option<WslEnvironment> {
    match active() {
        CliEnvironment::Wsl(wsl) => Some(wsl),
        CliEnvironment::Windows => None,
    }
}

fn store(environment: CliEnvironment) {
    if let Ok(mut guard) = ACTIVE.write() {
        *guard = Some(environment);
    }
}

/// Applies a stored setting value (`windows`, or `wsl:<distro>`).
///
/// A distro that cannot be reached falls back to the Windows profile, so a renamed or removed
/// distro leaves the app working instead of reporting every provider as signed out.
pub fn apply_setting(value: &str) -> CliEnvironment {
    let trimmed = value.trim();
    let Some(distro) = trimmed.strip_prefix(WSL_SETTING_PREFIX) else {
        if !trimmed.is_empty() && trimmed != WINDOWS_SETTING {
            log::warn!("[cli-env] unknown environment setting, using the Windows profile");
        }
        store(CliEnvironment::Windows);
        return CliEnvironment::Windows;
    };

    let distro = distro.trim();
    match resolve_wsl(distro) {
        Some(wsl) => {
            log::info!("[cli-env] reading CLI state from WSL distro {}", wsl.distro);
            let environment = CliEnvironment::Wsl(wsl);
            store(environment.clone());
            environment
        }
        None => {
            log::warn!(
                "[cli-env] WSL distro {} is unavailable, using the Windows profile",
                distro
            );
            store(CliEnvironment::Windows);
            CliEnvironment::Windows
        }
    }
}

/// Resolves a home-relative path (the part after `~/`) inside the active environment.
///
/// A path missing from the selected distro falls back to the Windows profile, which keeps mixed
/// setups working: coding CLIs in WSL, Windows applications where Windows put them.
pub fn resolve_home_relative(rest: &str) -> Option<PathBuf> {
    let windows_home = dirs::home_dir();
    if rest.is_empty() {
        return match active() {
            CliEnvironment::Wsl(wsl) => Some(wsl.windows_home),
            CliEnvironment::Windows => windows_home,
        };
    }

    let windows_path = windows_home.as_ref().map(|home| join_relative(home, rest));

    if is_windows_only_root(rest) {
        return windows_path;
    }

    let CliEnvironment::Wsl(wsl) = active() else {
        return windows_path;
    };

    let wsl_path = join_relative(&wsl.windows_home, rest);
    if wsl_path.exists() {
        return Some(wsl_path);
    }
    match windows_path {
        Some(path) if path.exists() => Some(path),
        // Neither side holds it: report the selected environment, so failures name the place the
        // user pointed the app at.
        _ => Some(wsl_path),
    }
}

/// The distro-side path for a home-relative location, for commands run inside WSL.
pub fn linux_home_relative(wsl: &WslEnvironment, rest: &str) -> String {
    let trimmed = rest.trim_matches(|c| c == '/' || c == '\\');
    if trimmed.is_empty() {
        return wsl.linux_home.clone();
    }
    format!("{}/{}", wsl.linux_home, trimmed.replace('\\', "/"))
}

/// Turns a Windows path back into a distro path when it sits under the active distro's home.
pub fn to_linux_path(wsl: &WslEnvironment, path: &str) -> Option<String> {
    let normalized = path.replace('/', "\\");
    let prefix = wsl.windows_home.to_string_lossy().replace('/', "\\");
    let rest = normalized.strip_prefix(prefix.as_str())?;
    Some(linux_home_relative(wsl, rest))
}

fn is_windows_only_root(rest: &str) -> bool {
    let first = rest
        .split(|c| c == '/' || c == '\\')
        .find(|segment| !segment.is_empty())
        .unwrap_or("")
        .to_ascii_lowercase();
    WINDOWS_ONLY_ROOTS.contains(&first.as_str())
}

fn join_relative(base: &Path, rest: &str) -> PathBuf {
    let mut path = base.to_path_buf();
    for segment in rest.split(|c| c == '/' || c == '\\') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        path.push(segment);
    }
    path
}

/// Distros a user can pick, newest WSL naming first, system distros left out.
pub fn list_distros() -> Vec<String> {
    let Some(output) = run_wsl(&["-l", "-q"]) else {
        return Vec::new();
    };

    decode_utf16_lossy(&output)
        .lines()
        .map(|line| line.trim().trim_matches('\u{0}').to_string())
        .filter(|line| !line.is_empty())
        .filter(|line| !SYSTEM_DISTROS.contains(&line.to_ascii_lowercase().as_str()))
        .collect()
}

fn resolve_wsl(distro: &str) -> Option<WslEnvironment> {
    if distro.is_empty() {
        return None;
    }

    let output = run_wsl(&["-d", distro, "-e", "sh", "-c", "printf %s \"$HOME\""])?;
    let linux_home = String::from_utf8_lossy(&output).trim().to_string();
    if linux_home.is_empty() || !linux_home.starts_with('/') {
        return None;
    }

    let windows_home = PathBuf::from(format!(
        r"\\wsl.localhost\{}{}",
        distro,
        linux_home.replace('/', "\\")
    ));
    if !windows_home.exists() {
        return None;
    }

    Some(WslEnvironment {
        distro: distro.to_string(),
        windows_home,
        linux_home,
    })
}

#[cfg(target_os = "windows")]
fn run_wsl(args: &[&str]) -> Option<Vec<u8>> {
    use std::process::{Command, Stdio};

    let mut command = Command::new("wsl.exe");
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::plugin_engine::host_api::configure_hidden_command_window(&mut command);

    let mut child = command.spawn().ok()?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(WSL_COMMAND_TIMEOUT_SECS);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                break;
            }
            Ok(None) => {
                if std::time::Instant::now() > deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    log::warn!("[cli-env] wsl.exe timed out");
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => return None,
        }
    }

    let mut stdout = child.stdout.take()?;
    let mut buffer = Vec::new();
    std::io::Read::read_to_end(&mut stdout, &mut buffer).ok()?;
    Some(buffer)
}

#[cfg(not(target_os = "windows"))]
fn run_wsl(_args: &[&str]) -> Option<Vec<u8>> {
    None
}

/// `wsl.exe -l -q` answers in UTF-16LE.
fn decode_utf16_lossy(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes[1] == 0 {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    String::from_utf8_lossy(bytes).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wsl_fixture() -> WslEnvironment {
        WslEnvironment {
            distro: "Ubuntu".to_string(),
            windows_home: PathBuf::from(r"\\wsl.localhost\Ubuntu\home\ada"),
            linux_home: "/home/ada".to_string(),
        }
    }

    #[test]
    fn app_config_and_appdata_stay_on_windows() {
        assert!(is_windows_only_root(".ai-usage/config.json"));
        assert!(is_windows_only_root("AppData/Roaming/Cursor/state.vscdb"));
        assert!(is_windows_only_root("appdata\\Roaming\\Cursor"));
        assert!(!is_windows_only_root(".claude/.credentials.json"));
        assert!(!is_windows_only_root(".codex/auth.json"));
    }

    #[test]
    fn join_relative_accepts_both_separators() {
        let base = Path::new(r"C:\Users\ada");
        assert_eq!(
            join_relative(base, ".claude/.credentials.json"),
            PathBuf::from(r"C:\Users\ada\.claude\.credentials.json")
        );
        assert_eq!(
            join_relative(base, ".codex\\auth.json"),
            PathBuf::from(r"C:\Users\ada\.codex\auth.json")
        );
    }

    #[test]
    fn linux_home_relative_builds_distro_paths() {
        let wsl = wsl_fixture();
        assert_eq!(linux_home_relative(&wsl, ".claude"), "/home/ada/.claude");
        assert_eq!(
            linux_home_relative(&wsl, "\\.claude\\projects"),
            "/home/ada/.claude/projects"
        );
        assert_eq!(linux_home_relative(&wsl, ""), "/home/ada");
    }

    #[test]
    fn to_linux_path_maps_back_inside_the_distro() {
        let wsl = wsl_fixture();
        assert_eq!(
            to_linux_path(&wsl, r"\\wsl.localhost\Ubuntu\home\ada\.claude").as_deref(),
            Some("/home/ada/.claude")
        );
        assert_eq!(to_linux_path(&wsl, r"C:\Users\ada\.claude"), None);
    }

    #[test]
    fn unknown_setting_falls_back_to_windows() {
        assert_eq!(apply_setting("nonsense"), CliEnvironment::Windows);
        assert_eq!(apply_setting(WINDOWS_SETTING), CliEnvironment::Windows);
    }

    /// Exercises the real bridge: run with `cargo test -- --ignored` on a machine with WSL.
    #[test]
    #[ignore = "requires an installed WSL distro"]
    fn resolves_credentials_inside_a_real_distro() {
        let distros = list_distros();
        assert!(!distros.is_empty(), "no distros to test against");
        assert!(!distros.iter().any(|name| name.starts_with("docker-desktop")));

        let environment = apply_setting(&format!("{}{}", WSL_SETTING_PREFIX, distros[0]));
        let CliEnvironment::Wsl(wsl) = environment else {
            panic!("distro {} did not resolve", distros[0]);
        };
        assert!(wsl.windows_home.exists());
        assert!(wsl.linux_home.starts_with('/'));

        let claude = resolve_home_relative(".claude").expect("resolved path");
        assert!(claude.starts_with(&wsl.windows_home));

        // The app's own config stays in the Windows profile.
        let app_config = resolve_home_relative(".ai-usage/config.json").expect("resolved path");
        assert!(!app_config.starts_with(&wsl.windows_home));

        apply_setting(WINDOWS_SETTING);
    }

    #[test]
    fn decode_utf16_lossy_reads_wsl_listings() {
        let utf16: Vec<u8> = "Ubuntu\n"
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect();
        assert_eq!(decode_utf16_lossy(&utf16).trim(), "Ubuntu");
        assert_eq!(decode_utf16_lossy(b"Ubuntu\n").trim(), "Ubuntu");
    }
}
