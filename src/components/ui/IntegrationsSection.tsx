import { useEffect, useState } from "react";
import {
  integrationsStatus,
  integrationsInstall,
  integrationsUninstall,
  type IntegrationAgent,
  type IntegrationStatus,
} from "../../services/tauriCommands";

interface AgentRow {
  agent: IntegrationAgent;
  label: string;
  target: string;
  docNote?: string;
}

const ROWS: AgentRow[] = [
  {
    agent: "claude",
    label: "Claude Code",
    target: "~/.claude/skills/wodouyao",
    docNote: "+ injects wodouyao block into ~/.claude/CLAUDE.md",
  },
  {
    agent: "codex",
    label: "Codex",
    target: "~/.codex/skills/wodouyao",
  },
];

export default function IntegrationsSection() {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [busy, setBusy] = useState<IntegrationAgent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    integrationsStatus().then(setStatuses).catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  const statusFor = (agent: IntegrationAgent) =>
    statuses.find((s) => s.agent === agent);

  const onInstall = async (agent: IntegrationAgent) => {
    setBusy(agent);
    setError(null);
    try {
      await integrationsInstall(agent);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const onUninstall = async (agent: IntegrationAgent) => {
    setBusy(agent);
    setError(null);
    try {
      await integrationsUninstall(agent);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {ROWS.map((row) => {
        const status = statusFor(row.agent);
        const installed = status?.skill_installed ?? false;
        const isBusy = busy === row.agent;
        return (
          <div
            key={row.agent}
            style={{
              background: "var(--color-bg)",
              borderRadius: 6,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: "var(--color-text)",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {row.label}
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: installed ? "color-mix(in srgb, var(--color-success) 20%, transparent)" : "color-mix(in srgb, var(--color-text-muted) 20%, transparent)",
                      color: installed ? "var(--color-success)" : "var(--color-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {installed ? "installed" : "not installed"}
                  </span>
                </div>
                <div
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: 11,
                    fontFamily: "monospace",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.target}
                </div>
                {row.docNote && (
                  <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 2 }}>
                    {row.docNote}
                    {status?.doc_installed === false && installed && (
                      <span style={{ color: "var(--color-danger)" }}> (missing)</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  disabled={isBusy}
                  onClick={() => onInstall(row.agent)}
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-bg-alt)",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 12,
                    cursor: isBusy ? "wait" : "pointer",
                    opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  {installed ? "Reinstall" : "Install"}
                </button>
                {installed && (
                  <button
                    disabled={isBusy}
                    onClick={() => onUninstall(row.agent)}
                    style={{
                      background: "var(--color-surface-alt)",
                      color: "var(--color-text)",
                      border: "none",
                      borderRadius: 4,
                      padding: "4px 10px",
                      fontSize: 12,
                      cursor: isBusy ? "wait" : "pointer",
                      opacity: isBusy ? 0.6 : 1,
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {error && (
        <div
          style={{
            color: "var(--color-danger)",
            fontSize: 11,
            fontFamily: "monospace",
            marginTop: 4,
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
