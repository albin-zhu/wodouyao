import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTeamStore } from "../../store/teamStore";
import { useTerminalStore } from "../../store/terminalStore";
import { teamsCreate, teamsJoin } from "../../services/tauriCommands";
import type { Team, Role } from "../../types/team";
import { starLayout } from "../../utils/teamLayout";

const PALETTE_EMOJI: Record<string, string> = {
  blue: "\uD83D\uDD35",
  orange: "\uD83D\uDFE0",
  green: "\uD83D\uDFE2",
  purple: "\uD83D\uDFE3",
  red: "\uD83D\uDD34",
  yellow: "\uD83D\uDFE1",
  sunset: "\uD83C\uDF05",
  forest: "\uD83C\uDF32",
};

const ROLE_ORDER: Role[] = ["lead", "worker", "observer"];
const PALETTE_OPTIONS = ["blue", "sunset", "forest"] as const;

function paletteEmoji(key: string): string {
  return PALETTE_EMOJI[key] ?? "\u25CF";
}

function TeamCard({
  team,
  focusedTerminalId,
  onDissolve,
  onJoin,
  onArrange,
}: {
  team: Team;
  focusedTerminalId: string | null;
  onDissolve: () => void;
  onJoin: () => void;
  onArrange: () => void;
}) {
  const { t } = useTranslation();
  const grouped: Record<Role, typeof team.members> = {
    lead: [],
    worker: [],
    observer: [],
  };
  for (const m of team.members) grouped[m.role].push(m);

  const focusedIsMember =
    focusedTerminalId !== null &&
    team.members.some((m) => m.term_id === focusedTerminalId);
  const canJoin = focusedTerminalId !== null && !focusedIsMember;

  return (
    <div
      style={{
        background: "#13141b",
        border: `1px solid ${team.palette.base}55`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>{paletteEmoji(team.palette.key)}</span>
          <span
            style={{
              color: "#c0caf5",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {team.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {team.members.length > 1 && (
            <button
              onClick={onArrange}
              title={t("teams.arrangeTitle")}
              style={{
                background: "#292e42",
                color: "#7aa2f7",
                border: "none",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t("teams.arrange")}
            </button>
          )}
          {canJoin && (
            <button
              onClick={onJoin}
              title={t("teams.joinTitle")}
              style={{
                background: "#292e42",
                color: "#9ece6a",
                border: "none",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t("teams.join")}
            </button>
          )}
          <button
            onClick={onDissolve}
            style={{
              background: "#292e42",
              color: "#f7768e",
              border: "none",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {t("teams.dissolve")}
          </button>
        </div>
      </div>
      <div style={{ color: "#565f89", fontSize: 11, marginBottom: 8 }}>
        {t("teams.memberCount", { count: team.members.length })}
        {"  \u00B7  "}
        {t("teams.taskCount", { count: team.tasks.length })}
      </div>
      {ROLE_ORDER.map((role) =>
        grouped[role].length > 0 ? (
          <div key={role} style={{ marginTop: 6 }}>
            <div
              style={{
                color: "#7aa2f7",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 2,
              }}
            >
              {role}
            </div>
            {grouped[role].map((m) => (
              <div
                key={m.term_id}
                style={{
                  color: "#c0caf5",
                  fontSize: 11,
                  fontFamily: "monospace",
                  paddingLeft: 6,
                }}
              >
                {m.term_id}
              </div>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}

function NewTeamForm({ focusedTerminalId }: { focusedTerminalId: string | null }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [palette, setPalette] = useState<string>("blue");
  const [asLead, setAsLead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setPalette("blue");
    setAsLead(false);
    setError(null);
  };

  const handleCancel = () => {
    reset();
    setExpanded(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await teamsCreate({
        name: name.trim(),
        palette,
        asLead: asLead && focusedTerminalId !== null,
        callerTermId: focusedTerminalId,
      });
      reset();
      setExpanded(false);
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error).message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const canBeLead = focusedTerminalId !== null;
  const leadTooltip = canBeLead
    ? t("teams.leadTooltipAvailable")
    : t("teams.leadTooltipUnavailable");

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          width: "100%",
          background: "#13141b",
          color: "#7aa2f7",
          border: "1px dashed #292e42",
          borderRadius: 6,
          padding: "10px 12px",
          fontSize: 12,
          cursor: "pointer",
          marginBottom: 12,
          textAlign: "left",
        }}
      >
        {t("teams.newTeam")}
      </button>
    );
  }

  return (
    <div
      style={{
        background: "#13141b",
        border: "1px solid #292e42",
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          color: "#c0caf5",
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        New team
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Team name"
        autoFocus
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "#1a1b26",
          color: "#c0caf5",
          border: "1px solid #292e42",
          borderRadius: 4,
          padding: "6px 8px",
          fontSize: 12,
          marginBottom: 8,
          outline: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <label
          style={{
            color: "#565f89",
            fontSize: 11,
            minWidth: 56,
          }}
        >
          Palette
        </label>
        <select
          value={palette}
          onChange={(e) => setPalette(e.target.value)}
          style={{
            flex: 1,
            background: "#1a1b26",
            color: "#c0caf5",
            border: "1px solid #292e42",
            borderRadius: 4,
            padding: "5px 6px",
            fontSize: 12,
            outline: "none",
          }}
        >
          {PALETTE_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {paletteEmoji(p)}  {p}
            </option>
          ))}
        </select>
      </div>
      <label
        title={leadTooltip}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: canBeLead ? "#c0caf5" : "#565f89",
          fontSize: 11,
          marginBottom: 10,
          cursor: canBeLead ? "pointer" : "help",
        }}
      >
        <input
          type="checkbox"
          checked={asLead && canBeLead}
          disabled={!canBeLead}
          onChange={(e) => setAsLead(e.target.checked)}
        />
        As lead?
        {!canBeLead && (
          <span style={{ color: "#565f89", marginLeft: 4 }}>
            (needs focused terminal)
          </span>
        )}
      </label>
      {error && (
        <div
          style={{
            color: "#f7768e",
            fontSize: 11,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleCreate}
          disabled={busy}
          style={{
            flex: 1,
            background: "#7aa2f7",
            color: "#1a1b26",
            border: "none",
            borderRadius: 4,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Creating\u2026" : "Create"}
        </button>
        <button
          onClick={handleCancel}
          disabled={busy}
          style={{
            background: "#292e42",
            color: "#c0caf5",
            border: "none",
            borderRadius: 4,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function TeamsDrawer() {
  const drawerOpen = useTeamStore((s) => s.drawerOpen);
  const closeDrawer = useTeamStore((s) => s.closeDrawer);
  const teamsMap = useTeamStore((s) => s.teams);
  const dissolve = useTeamStore((s) => s.dissolve);
  const terminalsMap = useTerminalStore((s) => s.terminals);

  const focusedTerminalId = useMemo(() => {
    let bestId: string | null = null;
    let bestZ = -Infinity;
    for (const t of terminalsMap.values()) {
      if (t.zIndex > bestZ) {
        bestZ = t.zIndex;
        bestId = t.id;
      }
    }
    return bestId;
  }, [terminalsMap]);

  if (!drawerOpen) return null;

  const teams = Array.from(teamsMap.values());

  const handleDissolve = (team: Team) => {
    const ok = window.confirm(
      `Dissolve ${team.name}? This will kill all member terminals.`
    );
    if (ok) dissolve(team.id);
  };

  const handleArrange = (team: Team) => {
    const terminals = useTerminalStore.getState().terminals;
    const updateTerminal = useTerminalStore.getState().updateTerminal;
    for (const { id, position } of starLayout(team, terminals)) {
      updateTerminal(id, { position });
    }
  };

  const handleJoin = async (team: Team) => {
    if (!focusedTerminalId) return;
    try {
      await teamsJoin({
        teamId: team.id,
        termId: focusedTerminalId,
        role: "worker",
      });
    } catch (e) {
      console.error("Failed to join team:", e);
    }
  };

  return (
    <>
      <div
        onClick={closeDrawer}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8999,
          background: "rgba(0,0,0,0.3)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 320,
          height: "100vh",
          zIndex: 9000,
          background: "#1f2335",
          borderLeft: "1px solid #292e42",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid #292e42",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#c0caf5", fontWeight: 600, fontSize: 14 }}>
            Teams
          </span>
          <button
            onClick={closeDrawer}
            style={{
              background: "none",
              border: "none",
              color: "#565f89",
              cursor: "pointer",
              fontSize: 18,
              padding: "2px 6px",
            }}
          >
            {"\u2715"}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <NewTeamForm focusedTerminalId={focusedTerminalId} />
          {teams.length === 0 ? (
            <div
              style={{
                color: "#565f89",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              No teams yet. Create one above, or from a terminal:
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "monospace",
                  color: "#7aa2f7",
                  background: "#13141b",
                  padding: "6px 8px",
                  borderRadius: 4,
                }}
              >
                wodouyao team create &lt;name&gt;
              </div>
            </div>
          ) : (
            teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                focusedTerminalId={focusedTerminalId}
                onDissolve={() => handleDissolve(team)}
                onJoin={() => handleJoin(team)}
                onArrange={() => handleArrange(team)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
