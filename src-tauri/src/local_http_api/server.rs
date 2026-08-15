use super::cache::{cache_state, enabled_snapshots_ordered};
use super::rainmeter;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use time::OffsetDateTime;

const BIND_ADDR: &str = "127.0.0.1:6736";
/// How long a stopped server keeps its socket open, at most.
const ACCEPT_POLL_MS: u64 = 200;
/// How long a start or stop waits for the accept loop to release the port.
/// The loop wakes every `ACCEPT_POLL_MS`, so this leaves wide margin.
const STOP_GRACE: Duration = Duration::from_secs(2);

static RUNNING: AtomicBool = AtomicBool::new(false);
/// True while an accept loop owns the listener socket.
static LOOP_ALIVE: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

pub fn is_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Bind the loopback socket and serve until `stop_server`. Binding happens on
/// the caller's thread so a port clash reaches the settings UI as an error
/// instead of disappearing into a worker.
pub fn start_server() -> Result<(), String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    // A previous loop may still be in its last poll cycle; bind only after it
    // has dropped the listener, so a quick stop-then-start does not race it.
    wait_for_loop_exit();

    let listener = match TcpListener::bind(BIND_ADDR) {
        Ok(listener) => listener,
        Err(e) => {
            RUNNING.store(false, Ordering::SeqCst);
            log::warn!("failed to bind local HTTP API on {}: {}", BIND_ADDR, e);
            return Err(format!("{} is not available: {}", BIND_ADDR, e));
        }
    };

    // Polling accept is what lets the loop notice a stop request; a blocking
    // accept would hold the port until the next connection arrived.
    if let Err(e) = listener.set_nonblocking(true) {
        RUNNING.store(false, Ordering::SeqCst);
        log::warn!("failed to configure local HTTP API socket: {}", e);
        return Err(format!("could not configure {}: {}", BIND_ADDR, e));
    }

    LOOP_ALIVE.store(true, Ordering::SeqCst);
    std::thread::spawn(move || accept_loop(listener));
    Ok(())
}

/// Stop serving and wait until the accept loop has released the port, so the
/// next `start_server` can bind again at once.
pub fn stop_server() {
    if !RUNNING.swap(false, Ordering::SeqCst) {
        return;
    }
    log::info!("local HTTP API stopping");
    wait_for_loop_exit();
}

fn wait_for_loop_exit() {
    let deadline = Instant::now() + STOP_GRACE;
    while LOOP_ALIVE.load(Ordering::SeqCst) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    if LOOP_ALIVE.load(Ordering::SeqCst) {
        log::warn!("local HTTP API accept loop did not release the port in time");
    }
}

fn accept_loop(listener: TcpListener) {
    log::info!("local HTTP API listening on {}", BIND_ADDR);
    while RUNNING.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, _)) => {
                std::thread::spawn(move || handle_connection(stream));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(ACCEPT_POLL_MS));
            }
            Err(e) => {
                // Sleep on unexpected errors too, so a persistent one does
                // not spin this loop at full CPU.
                log::debug!("local HTTP API accept error: {}", e);
                std::thread::sleep(Duration::from_millis(ACCEPT_POLL_MS));
            }
        }
    }
    LOOP_ALIVE.store(false, Ordering::SeqCst);
    log::info!("local HTTP API stopped");
}

fn handle_connection(mut stream: TcpStream) {
    // Windows hands out accepted sockets in the listener's non-blocking mode,
    // where a read can return before the request has arrived.
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

    // Routing only reads the request line, but one recv can return before the
    // line is complete on a fragmented or slow connection, so keep reading
    // until the terminator arrives or the buffer is full.
    let mut buf = [0u8; 4096];
    let mut filled = 0usize;
    loop {
        match stream.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => {
                filled += n;
                if buf[..filled].iter().any(|&byte| byte == b'\n') || filled == buf.len() {
                    break;
                }
            }
            Err(_) => return,
        }
    }
    if filled == 0 {
        return;
    }
    let request = String::from_utf8_lossy(&buf[..filled]);

    // Parse request line: "METHOD /path HTTP/1.x\r\n..."
    let first_line = request.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("");

    // Strip query string and trailing slash (but keep root "/v1/usage" intact)
    let path = raw_path.split('?').next().unwrap_or(raw_path);
    let path = if path.len() > 1 {
        path.trim_end_matches('/')
    } else {
        path
    };

    let response = route(method, path);
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn route(method: &str, path: &str) -> String {
    // Match routes
    if path == "/v1/usage" {
        return match method {
            "GET" => handle_get_usage_collection(),
            "OPTIONS" => response_no_content(),
            _ => response_method_not_allowed(),
        };
    }

    if path == "/v1/rainmeter" {
        return match method {
            "GET" => handle_get_rainmeter_collection(),
            "OPTIONS" => response_no_content(),
            _ => response_method_not_allowed(),
        };
    }

    if let Some(provider_id) = path.strip_prefix("/v1/usage/") {
        if !provider_id.is_empty() && !provider_id.contains('/') {
            return match method {
                "GET" => handle_get_usage_single(provider_id),
                "OPTIONS" => response_no_content(),
                _ => response_method_not_allowed(),
            };
        }
    }

    if let Some(provider_id) = path.strip_prefix("/v1/rainmeter/") {
        if !provider_id.is_empty() && !provider_id.contains('/') {
            return match method {
                "GET" => handle_get_rainmeter_single(provider_id),
                "OPTIONS" => response_no_content(),
                _ => response_method_not_allowed(),
            };
        }
    }

    response_not_found("not_found")
}

fn handle_get_usage_collection() -> String {
    let snapshots = {
        let state = cache_state().lock().expect("cache state poisoned");
        enabled_snapshots_ordered(&state)
    };
    let body = serde_json::to_string(&snapshots).unwrap_or_else(|_| "[]".to_string());
    response_json(200, "OK", &body)
}

fn handle_get_usage_single(provider_id: &str) -> String {
    let state = cache_state().lock().expect("cache state poisoned");

    // Check if provider is known at all
    if !state.is_known(provider_id) {
        return response_not_found("provider_not_found");
    }

    match state.snapshots.get(provider_id) {
        Some(snapshot) => {
            let body = serde_json::to_string(snapshot).unwrap_or_else(|_| "{}".to_string());
            response_json(200, "OK", &body)
        }
        None => response_no_content(),
    }
}

fn handle_get_rainmeter_collection() -> String {
    let entries = {
        let state = cache_state().lock().expect("cache state poisoned");
        enabled_snapshots_ordered(&state)
            .into_iter()
            .map(|snapshot| {
                let meta = state.meta(&snapshot.provider_id).cloned();
                (snapshot, meta)
            })
            .collect::<Vec<_>>()
    };
    let body = rainmeter::render_collection(&entries, OffsetDateTime::now_utc());
    response_text(200, "OK", &body)
}

fn handle_get_rainmeter_single(provider_id: &str) -> String {
    let state = cache_state().lock().expect("cache state poisoned");

    if !state.is_known(provider_id) {
        return response_not_found("provider_not_found");
    }

    // A known provider always answers with the full key set, so a skin's regex
    // keeps matching in the gap before the first probe lands.
    let body = match state.snapshots.get(provider_id) {
        Some(snapshot) => rainmeter::render_provider_page(
            snapshot,
            state.meta(provider_id),
            OffsetDateTime::now_utc(),
        ),
        None => rainmeter::render_empty_provider_page(provider_id),
    };
    response_text(200, "OK", &body)
}

// ---------------------------------------------------------------------------
// HTTP response builders
// ---------------------------------------------------------------------------

const CORS_HEADERS: &str = "\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type";

fn response_with_type(status: u16, reason: &str, content_type: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {} {}\r\nConnection: close\r\nContent-Type: {}\r\n{}\r\nContent-Length: {}\r\n\r\n{}",
        status,
        reason,
        content_type,
        CORS_HEADERS,
        body.len(),
        body,
    )
}

fn response_json(status: u16, reason: &str, body: &str) -> String {
    response_with_type(status, reason, "application/json; charset=utf-8", body)
}

fn response_text(status: u16, reason: &str, body: &str) -> String {
    response_with_type(status, reason, "text/plain; charset=utf-8", body)
}

fn response_no_content() -> String {
    format!(
        "HTTP/1.1 204 No Content\r\nConnection: close\r\n{}\r\n\r\n",
        CORS_HEADERS,
    )
}

fn response_not_found(error_code: &str) -> String {
    let body = format!(r#"{{"error":"{}"}}"#, error_code);
    response_json(404, "Not Found", &body)
}

fn response_method_not_allowed() -> String {
    let body = r#"{"error":"method_not_allowed"}"#;
    response_json(405, "Method Not Allowed", body)
}

#[cfg(test)]
mod tests {
    use super::super::cache::{CachedPluginSnapshot, PluginMetricMeta, cache_state};
    use super::*;
    use crate::plugin_engine::runtime::{MetricLine, ProgressFormat};
    use serial_test::serial;

    fn make_snapshot(id: &str, name: &str) -> CachedPluginSnapshot {
        CachedPluginSnapshot {
            provider_id: id.to_string(),
            display_name: name.to_string(),
            plan: Some("Pro".to_string()),
            lines: vec![],
            fetched_at: "2026-03-26T08:15:30Z".to_string(),
        }
    }

    fn known(ids: &[&str]) -> Vec<PluginMetricMeta> {
        ids.iter()
            .map(|id| PluginMetricMeta {
                id: id.to_string(),
                primary_candidates: Vec::new(),
                gating_limits: Vec::new(),
            })
            .collect()
    }

    #[test]
    #[serial]
    fn route_get_usage_returns_200() {
        let resp = route("GET", "/v1/usage");
        assert!(resp.starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn route_unknown_path_returns_404() {
        let resp = route("GET", "/v2/something");
        assert!(resp.starts_with("HTTP/1.1 404"));
    }

    #[test]
    fn route_post_returns_405() {
        let resp = route("POST", "/v1/usage");
        assert!(resp.starts_with("HTTP/1.1 405"));
    }

    #[test]
    fn route_options_returns_204_with_cors() {
        let resp = route("OPTIONS", "/v1/usage");
        assert!(resp.starts_with("HTTP/1.1 204"));
        assert!(resp.contains("Access-Control-Allow-Origin: *"));
    }

    #[test]
    #[serial]
    fn route_unknown_provider_returns_404() {
        {
            let mut state = cache_state().lock().unwrap();
            state.plugins = known(&["claude"]);
            state.snapshots.clear();
        }

        let resp = route("GET", "/v1/usage/nonexistent");
        assert!(resp.starts_with("HTTP/1.1 404"));
        assert!(resp.contains("provider_not_found"));
    }

    #[test]
    #[serial]
    fn route_known_uncached_provider_returns_204() {
        {
            let mut state = cache_state().lock().unwrap();
            state.plugins = known(&["claude"]);
            state.snapshots.clear();
        }

        let resp = route("GET", "/v1/usage/claude");
        assert!(resp.starts_with("HTTP/1.1 204"));
    }

    #[test]
    #[serial]
    fn route_known_cached_provider_returns_200() {
        {
            let mut state = cache_state().lock().unwrap();
            state.plugins = known(&["claude"]);
            state
                .snapshots
                .insert("claude".to_string(), make_snapshot("claude", "Claude"));
        }

        let resp = route("GET", "/v1/usage/claude");
        assert!(resp.starts_with("HTTP/1.1 200"));
        assert!(resp.contains("fetchedAt"));
    }

    #[test]
    fn route_options_on_provider_returns_204() {
        let resp = route("OPTIONS", "/v1/usage/claude");
        assert!(resp.starts_with("HTTP/1.1 204"));
        assert!(resp.contains("Access-Control-Allow-Methods: GET, OPTIONS"));
    }

    #[test]
    fn response_json_includes_cors_headers() {
        let resp = response_json(200, "OK", "[]");
        assert!(resp.contains("Access-Control-Allow-Origin: *"));
        assert!(resp.contains("Content-Type: application/json; charset=utf-8"));
    }

    #[test]
    #[serial]
    fn route_rainmeter_collection_serves_plain_text() {
        let resp = route("GET", "/v1/rainmeter");
        assert!(resp.starts_with("HTTP/1.1 200"));
        assert!(resp.contains("Content-Type: text/plain; charset=utf-8"));
        assert!(resp.contains("Count="));
    }

    #[test]
    fn route_rainmeter_post_returns_405() {
        let resp = route("POST", "/v1/rainmeter");
        assert!(resp.starts_with("HTTP/1.1 405"));
    }

    #[test]
    #[serial]
    fn route_rainmeter_unknown_provider_returns_404() {
        {
            let mut state = cache_state().lock().unwrap();
            state.plugins = known(&["claude"]);
            state.snapshots.clear();
        }

        let resp = route("GET", "/v1/rainmeter/nonexistent");
        assert!(resp.starts_with("HTTP/1.1 404"));
        assert!(resp.contains("provider_not_found"));
    }

    #[test]
    #[serial]
    fn route_rainmeter_uncached_provider_still_serves_keys() {
        {
            let mut state = cache_state().lock().unwrap();
            state.plugins = known(&["claude"]);
            state.snapshots.clear();
        }

        let resp = route("GET", "/v1/rainmeter/claude");
        assert!(resp.starts_with("HTTP/1.1 200"));
        assert!(resp.contains("Id=claude"));
        assert!(resp.contains("Bars=0"));
    }

    #[test]
    #[serial]
    fn route_rainmeter_provider_reports_the_headline_bar() {
        {
            let mut state = cache_state().lock().unwrap();
            state.plugins = vec![PluginMetricMeta {
                id: "claude".to_string(),
                primary_candidates: vec!["Session".to_string()],
                gating_limits: vec!["Weekly".to_string()],
            }];
            let mut snapshot = make_snapshot("claude", "Claude");
            snapshot.lines = vec![
                MetricLine::Progress {
                    label: "Weekly".to_string(),
                    used: 80.0,
                    limit: 100.0,
                    format: ProgressFormat::Percent,
                    resets_at: None,
                    period_duration_ms: None,
                    color: None,
                },
                MetricLine::Progress {
                    label: "Session".to_string(),
                    used: 25.0,
                    limit: 100.0,
                    format: ProgressFormat::Percent,
                    resets_at: None,
                    period_duration_ms: None,
                    color: None,
                },
            ];
            state.snapshots.insert("claude".to_string(), snapshot);
        }

        let resp = route("GET", "/v1/rainmeter/claude");
        assert!(resp.starts_with("HTTP/1.1 200"));
        assert!(resp.contains("Label=Session"));
        assert!(resp.contains("\nPercent=25\n"));
        assert!(resp.contains("\nGatedPercent=80\n"));
        assert!(resp.contains("Bars=2"));
    }

    #[test]
    fn route_rainmeter_options_returns_204() {
        let resp = route("OPTIONS", "/v1/rainmeter/claude");
        assert!(resp.starts_with("HTTP/1.1 204"));
    }
}
