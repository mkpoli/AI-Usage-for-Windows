(function () {
  const KEYCHAIN_SERVICE = "AI Usage-copilot";
  const GH_KEYCHAIN_SERVICE = "gh:github.com";
  const COPILOT_CLI_KEYCHAIN_SERVICE = "copilot-cli";
  const COPILOT_CONFIG_PATH = "~/.copilot/config.json";
  const COPILOT_SETTINGS_PATH = "~/.copilot/settings.json";
  const USAGE_URL = "https://api.github.com/copilot_internal/user";

  function readJson(ctx, path) {
    try {
      if (!ctx.host.fs.exists(path)) return null;
      const text = ctx.host.fs.readText(path);
      return ctx.util.tryParseJson(text);
    } catch (e) {
      ctx.host.log.warn("readJson failed for " + path + ": " + String(e));
      return null;
    }
  }

  function writeJson(ctx, path, value) {
    try {
      ctx.host.fs.writeText(path, JSON.stringify(value));
    } catch (e) {
      ctx.host.log.warn("writeJson failed for " + path + ": " + String(e));
    }
  }

  function saveToken(ctx, token) {
    try {
      ctx.host.keychain.writeGenericPassword(
        KEYCHAIN_SERVICE,
        JSON.stringify({ token: token }),
      );
    } catch (e) {
      ctx.host.log.warn("keychain write failed: " + String(e));
    }
    writeJson(ctx, ctx.app.pluginDataDir + "/auth.json", { token: token });
  }

  function clearCachedToken(ctx) {
    try {
      ctx.host.keychain.deleteGenericPassword(KEYCHAIN_SERVICE);
    } catch (e) {
      ctx.host.log.info("keychain delete failed: " + String(e));
    }
    writeJson(ctx, ctx.app.pluginDataDir + "/auth.json", null);
  }

  function loadTokenFromKeychain(ctx) {
    try {
      const raw = ctx.host.keychain.readGenericPassword(KEYCHAIN_SERVICE);
      if (raw) {
        const parsed = ctx.util.tryParseJson(raw);
        if (parsed && parsed.token) {
          ctx.host.log.info("token loaded from AI Usage keychain");
          return { token: parsed.token, source: "keychain" };
        }
      }
    } catch (e) {
      ctx.host.log.info("AI Usage keychain read failed: " + String(e));
    }
    return null;
  }

  function loadTokenFromGhCli(ctx) {
    try {
      const raw = ctx.host.keychain.readGenericPassword(GH_KEYCHAIN_SERVICE);
      if (raw) {
        let token = raw;
        if (
          typeof token === "string" &&
          token.indexOf("go-keyring-base64:") === 0
        ) {
          token = ctx.base64.decode(token.slice("go-keyring-base64:".length));
        }
        if (token) {
          ctx.host.log.info("token loaded from gh CLI keychain");
          return { token: token, source: "gh-cli" };
        }
      }
    } catch (e) {
      ctx.host.log.info("gh CLI keychain read failed: " + String(e));
    }
    return null;
  }

  function readEnvText(ctx, name) {
    try {
      if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null;
      const value = ctx.host.env.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch (e) {
      ctx.host.log.info("env read failed for " + name + ": " + String(e));
      return null;
    }
  }

  function loadTokenFromEnv(ctx) {
    const names = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
    for (let i = 0; i < names.length; i += 1) {
      const token = readEnvText(ctx, names[i]);
      if (token) {
        ctx.host.log.info("token loaded from Copilot-compatible environment");
        return { token: token, source: "env" };
      }
    }
    return null;
  }

  function loadTokenFromGhCliCommand(ctx) {
    try {
      if (
        !ctx.host.githubCli ||
        typeof ctx.host.githubCli.readAuthToken !== "function"
      ) {
        return null;
      }
      const token = ctx.host.githubCli.readAuthToken();
      if (typeof token === "string" && token.trim()) {
        ctx.host.log.info("token loaded from gh CLI command");
        return { token: token.trim(), source: "gh-cli" };
      }
    } catch (e) {
      ctx.host.log.info("gh CLI command token read failed: " + String(e));
    }
    return null;
  }

  function normalizeHost(host) {
    const value = typeof host === "string" && host.trim() ? host.trim() : "https://github.com";
    return value.replace(/\/+$/, "");
  }

  function copilotAccountFromUser(user) {
    if (!user || typeof user !== "object") return null;
    const login = typeof user.login === "string" ? user.login.trim() : "";
    if (!login) return null;
    return normalizeHost(user.host) + ":" + login;
  }

  function copilotAccountsFromConfig(ctx) {
    const config = readJson(ctx, COPILOT_CONFIG_PATH);
    const accounts = [];

    function add(account) {
      if (account && accounts.indexOf(account) === -1) accounts.push(account);
    }

    if (config) {
      add(copilotAccountFromUser(config.lastLoggedInUser));
      if (Array.isArray(config.loggedInUsers)) {
        for (let i = 0; i < config.loggedInUsers.length; i += 1) {
          add(copilotAccountFromUser(config.loggedInUsers[i]));
        }
      }
    }

    return accounts;
  }

  function hasCopilotLoginConfig(ctx) {
    return copilotAccountsFromConfig(ctx).length > 0;
  }

  function loadTokenFromCopilotPlaintextConfig(ctx, accounts) {
    const configs = [readJson(ctx, COPILOT_SETTINGS_PATH), readJson(ctx, COPILOT_CONFIG_PATH)];
    for (let i = 0; i < configs.length; i += 1) {
      const config = configs[i];
      if (!config || !config.copilotTokens || typeof config.copilotTokens !== "object") {
        continue;
      }

      for (let j = 0; j < accounts.length; j += 1) {
        const token = config.copilotTokens[accounts[j]];
        if (typeof token === "string" && token.trim()) {
          ctx.host.log.info("token loaded from Copilot CLI plaintext config");
          return { token: token.trim(), source: "copilot-cli" };
        }
      }

      const values = Object.keys(config.copilotTokens)
        .map((key) => config.copilotTokens[key])
        .filter((value) => typeof value === "string" && value.trim());
      if (values.length > 0) {
        ctx.host.log.info("token loaded from Copilot CLI plaintext config");
        return { token: values[0].trim(), source: "copilot-cli" };
      }
    }
    return null;
  }

  function loadTokenFromCopilotCli(ctx) {
    const accounts = copilotAccountsFromConfig(ctx);
    const keychain = ctx.host.keychain;
    if (
      keychain &&
      typeof keychain.readExternalKeytarPassword === "function"
    ) {
      for (let i = 0; i < accounts.length; i += 1) {
        try {
          const token = keychain.readExternalKeytarPassword(
            COPILOT_CLI_KEYCHAIN_SERVICE,
            accounts[i],
          );
          if (typeof token === "string" && token.trim()) {
            ctx.host.log.info("token loaded from Copilot CLI keychain");
            return { token: token.trim(), source: "copilot-cli" };
          }
        } catch (e) {
          ctx.host.log.info("Copilot CLI keychain read failed: " + String(e));
        }
      }
    }

    return loadTokenFromCopilotPlaintextConfig(ctx, accounts);
  }

  function loadTokenFromStateFile(ctx) {
    const data = readJson(ctx, ctx.app.pluginDataDir + "/auth.json");
    if (data && data.token) {
      ctx.host.log.info("token loaded from state file");
      return { token: data.token, source: "state" };
    }
    return null;
  }

  function loadToken(ctx) {
    return (
      loadTokenFromKeychain(ctx) ||
      loadTokenFromCopilotCli(ctx) ||
      loadTokenFromGhCli(ctx) ||
      loadTokenFromGhCliCommand(ctx) ||
      loadTokenFromEnv(ctx) ||
      loadTokenFromStateFile(ctx)
    );
  }

  function fetchUsage(ctx, token) {
    return ctx.util.request({
      method: "GET",
      url: USAGE_URL,
      headers: {
        Authorization: "token " + token,
        Accept: "application/json",
        "Editor-Version": "vscode/1.96.2",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "X-Github-Api-Version": "2025-04-01",
      },
      timeoutMs: 10000,
    });
  }

  function makeProgressLine(ctx, label, snapshot, resetDate) {
    if (!snapshot || typeof snapshot.percent_remaining !== "number")
      return null;
    const usedPercent = Math.min(100, Math.max(0, 100 - snapshot.percent_remaining));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  function makeLimitedProgressLine(ctx, label, remaining, total, resetDate) {
    if (typeof remaining !== "number" || typeof total !== "number" || total <= 0)
      return null;
    const used = total - remaining;
    const usedPercent = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  function probe(ctx) {
    const cred = loadToken(ctx);
    if (!cred) {
      if (hasCopilotLoginConfig(ctx)) {
        throw "Copilot session found, but no persistent token is saved. Run `copilot login` in PowerShell, not `/auth` inside Copilot.";
      }
      throw "Not logged in. Run `copilot login` or `gh auth login` first.";
    }

    let token = cred.token;
    let source = cred.source;

    let resp;
    try {
      resp = fetchUsage(ctx, token);
    } catch (e) {
      ctx.host.log.error("usage request exception: " + String(e));
      throw "Usage request failed. Check your connection.";
    }

    if (resp.status === 401 || resp.status === 403) {
      // If cached token is stale, clear it and try fallback sources
      if (source === "keychain") {
        ctx.host.log.info("cached token invalid, trying fallback sources");
        clearCachedToken(ctx);
        const fallback = loadTokenFromCopilotCli(ctx) || loadTokenFromGhCli(ctx) || loadTokenFromGhCliCommand(ctx) || loadTokenFromEnv(ctx);
        if (fallback) {
          try {
            resp = fetchUsage(ctx, fallback.token);
          } catch (e) {
            ctx.host.log.error("fallback usage request exception: " + String(e));
            throw "Usage request failed. Check your connection.";
          }
          if (resp.status >= 200 && resp.status < 300) {
            // Fallback worked, persist the new token
            saveToken(ctx, fallback.token);
            token = fallback.token;
            source = fallback.source;
          }
        }
      }
      // Still failing after retry
      if (resp.status === 401 || resp.status === 403) {
        throw "Token invalid. Run `copilot login` or `gh auth login` to re-authenticate.";
      }
    }

    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.error("usage returned error: status=" + resp.status);
      throw (
        "Usage request failed (HTTP " +
        String(resp.status) +
        "). Try again later."
      );
    }

    // Persist external tokens to AI Usage keychain for future use
    if (source === "gh-cli" || source === "copilot-cli" || source === "env") {
      saveToken(ctx, token);
    }

    const data = ctx.util.tryParseJson(resp.bodyText);
    if (data === null) {
      throw "Usage response invalid. Try again later.";
    }

    ctx.host.log.info("usage fetch succeeded");

    const lines = [];
    let plan = null;
    if (data.copilot_plan) {
      plan = ctx.fmt.planLabel(data.copilot_plan);
    }

    // Paid tier: quota_snapshots
    const snapshots = data.quota_snapshots;
    if (snapshots) {
      const premiumLine = makeProgressLine(
        ctx,
        "Premium",
        snapshots.premium_interactions,
        data.quota_reset_date,
      );
      if (premiumLine) lines.push(premiumLine);

      const chatLine = makeProgressLine(
        ctx,
        "Chat",
        snapshots.chat,
        data.quota_reset_date,
      );
      if (chatLine) lines.push(chatLine);
    }

    // Free tier: limited_user_quotas
    if (data.limited_user_quotas && data.monthly_quotas) {
      const lq = data.limited_user_quotas;
      const mq = data.monthly_quotas;
      const resetDate = data.limited_user_reset_date;

      const chatLine = makeLimitedProgressLine(ctx, "Chat", lq.chat, mq.chat, resetDate);
      if (chatLine) lines.push(chatLine);

      const completionsLine = makeLimitedProgressLine(ctx, "Completions", lq.completions, mq.completions, resetDate);
      if (completionsLine) lines.push(completionsLine);
    }

    if (lines.length === 0) {
      lines.push(
        ctx.line.badge({
          label: "Status",
          text: "No usage data",
          color: "#a3a3a3",
        }),
      );
    }

    return { plan: plan, lines: lines };
  }

  globalThis.__ai_usage_plugin = { id: "copilot", probe };
})();
