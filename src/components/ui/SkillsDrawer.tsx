import { useState, useEffect } from "react";
import { useSkillStore } from "../../store/skillStore";
import type { Skill, SkillSource } from "../../types/skill";

const EMPTY_SKILL: Omit<Skill, "source"> = {
  name: "",
  description: "",
  version: "",
  triggers: [],
  roles: [],
  author: "",
  tags: [],
  body: "",
};

function SkillRow({
  skill,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        marginBottom: 6,
        padding: "8px 10px 8px 14px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: skill.source === "project" ? "var(--color-accent)" : "var(--color-text-muted)",
          borderTopLeftRadius: 6,
          borderBottomLeftRadius: 6,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            color: "var(--color-text)",
            fontSize: 12,
            fontWeight: 600,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {skill.name}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: skill.source === "project" ? "var(--color-accent)" : "var(--color-text-muted)",
            background:
              skill.source === "project"
                ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                : "color-mix(in srgb, var(--color-text-muted) 12%, transparent)",
            border: `1px solid ${
              skill.source === "project"
                ? "color-mix(in srgb, var(--color-accent) 28%, transparent)"
                : "color-mix(in srgb, var(--color-text-muted) 28%, transparent)"
            }`,
            borderRadius: 3,
            padding: "1px 6px",
          }}
        >
          {skill.source}
        </span>
        {hovered && (
          <>
            <button
              onClick={() => onEdit(skill)}
              title="Edit"
              style={{
                background: "none",
                border: "none",
                color: "var(--color-info)",
                cursor: "pointer",
                fontSize: 11,
                padding: "0 4px",
              }}
            >
              ✎
            </button>
            <button
              onClick={() => onDelete(skill)}
              title="Delete"
              style={{
                background: "none",
                border: "none",
                color: "var(--color-danger)",
                cursor: "pointer",
                fontSize: 11,
                padding: "0 4px",
              }}
            >
              ✕
            </button>
          </>
        )}
      </div>
      {skill.description && (
        <div
          style={{
            marginTop: 3,
            color: "var(--color-text-muted)",
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {skill.description}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
        {skill.roles.map((r) => (
          <span
            key={r}
            style={{
              fontSize: 9,
              color: "var(--color-warning)",
              background: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-warning) 28%, transparent)",
              borderRadius: 3,
              padding: "0 5px",
            }}
          >
            {r}
          </span>
        ))}
        {skill.triggers.map((tr) => (
          <span
            key={tr}
            style={{
              fontSize: 9,
              color: "var(--color-text-muted)",
              background: "color-mix(in srgb, var(--color-text-muted) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-text-muted) 20%, transparent)",
              borderRadius: 3,
              padding: "0 5px",
            }}
          >
            {tr}
          </span>
        ))}
      </div>
    </div>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%",
    background: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: 5,
    padding: "6px 8px",
    color: "var(--color-text)",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
    ...extra,
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "block",
    color: "var(--color-text-muted)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  };
}

function SkillEditor({
  initial,
  onSave,
  onCancel,
  error,
}: {
  initial: Skill | null;
  onSave: (skill: Skill, scope: SkillSource, force: boolean) => void;
  onCancel: () => void;
  error: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [roles, setRoles] = useState((initial?.roles ?? []).join(", "));
  const [triggers, setTriggers] = useState((initial?.triggers ?? []).join(", "));
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [body, setBody] = useState(initial?.body ?? "");
  const [scope, setScope] = useState<SkillSource>(initial?.source ?? "project");
  const [force, setForce] = useState(false);

  const handleSave = () => {
    const skill: Skill = {
      name: name.trim(),
      description: description.trim() || undefined,
      triggers: triggers.split(",").map((s) => s.trim()).filter(Boolean),
      roles: roles.split(",").map((s) => s.trim()).filter(Boolean),
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      body,
      source: scope,
    };
    onSave(skill, scope, force);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label style={labelStyle()}>Name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="kebab-case-name"
          style={inputStyle()}
        />
      </div>
      <div>
        <label style={labelStyle()}>Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line summary"
          style={inputStyle()}
        />
      </div>
      <div>
        <label style={labelStyle()}>Roles (comma-separated)</label>
        <input
          value={roles}
          onChange={(e) => setRoles(e.target.value)}
          placeholder="backend, pm"
          style={inputStyle()}
        />
      </div>
      <div>
        <label style={labelStyle()}>Triggers (comma-separated)</label>
        <input
          value={triggers}
          onChange={(e) => setTriggers(e.target.value)}
          placeholder="rate limit, 429"
          style={inputStyle()}
        />
      </div>
      <div>
        <label style={labelStyle()}>Tags (comma-separated)</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="resilience, api"
          style={inputStyle()}
        />
      </div>
      <div>
        <label style={labelStyle()}>Body (Markdown)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"## Skill Name\n\nInstructions for the agent..."}
          rows={10}
          style={inputStyle({ resize: "vertical", fontFamily: "monospace", lineHeight: 1.5 })}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Scope:</label>
        {(["project", "user"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{
              background: scope === s ? "var(--color-accent)" : "transparent",
              color: scope === s ? "var(--color-bg-alt)" : "var(--color-text-muted)",
              border: "1px solid " + (scope === s ? "var(--color-accent)" : "var(--color-border)"),
              borderRadius: 4,
              padding: "3px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
        <label
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "var(--color-text-muted)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          Overwrite
        </label>
      </div>
      {error && (
        <div
          style={{
            color: "var(--color-danger)",
            fontSize: 11,
            background: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 28%, transparent)",
            borderRadius: 4,
            padding: "6px 8px",
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            background: "var(--color-accent)",
            color: "var(--color-bg-alt)",
            border: "none",
            borderRadius: 5,
            padding: "7px 0",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: "transparent",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            padding: "7px 0",
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

export default function SkillsDrawer() {
  const drawerOpen = useSkillStore((s) => s.drawerOpen);
  const closeDrawer = useSkillStore((s) => s.closeDrawer);
  const skills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const saveSkill = useSkillStore((s) => s.saveSkill);
  const deleteSkill = useSkillStore((s) => s.deleteSkill);

  const [editing, setEditing] = useState<Skill | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<"all" | "project" | "user">("all");

  useEffect(() => {
    if (drawerOpen) loadSkills();
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  const filtered = filterSource === "all" ? skills : skills.filter((s) => s.source === filterSource);

  const handleEdit = (skill: Skill) => {
    setEditing(skill);
    setIsNew(false);
    setSaveError(null);
  };

  const handleNew = () => {
    setEditing({ ...EMPTY_SKILL, source: "project" });
    setIsNew(true);
    setSaveError(null);
  };

  const handleDelete = async (skill: Skill) => {
    if (!confirm(`Delete skill "${skill.name}"?`)) return;
    try {
      await deleteSkill(skill.name, skill.source);
    } catch (e) {
      console.error("delete skill failed:", e);
    }
  };

  const handleSave = async (skill: Skill, scope: SkillSource, force: boolean) => {
    setSaveError(null);
    try {
      await saveSkill(skill, scope, force);
      setEditing(null);
    } catch (e) {
      setSaveError(String(e));
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
          width: 380,
          height: "100vh",
          zIndex: 9000,
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "var(--color-text)", fontWeight: 600, fontSize: 14 }}>
            Skills
            <span style={{ color: "var(--color-text-muted)", fontWeight: 400, marginLeft: 8 }}>
              {skills.length}
            </span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!editing && (
              <button
                onClick={handleNew}
                title="New skill"
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-bg-alt)",
                  border: "none",
                  borderRadius: 5,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + New
              </button>
            )}
            <button
              onClick={closeDrawer}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                fontSize: 18,
                padding: "2px 6px",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {editing ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 12 }}>
              {isNew ? "New skill" : `Editing: ${editing.name}`}
            </div>
            <SkillEditor
              initial={isNew ? null : editing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
              error={saveError}
            />
          </div>
        ) : (
          <>
            {/* Filter bar */}
            <div
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid var(--color-border)",
                flexShrink: 0,
                display: "flex",
                gap: 4,
              }}
            >
              {(["all", "project", "user"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterSource(f)}
                  style={{
                    background: filterSource === f ? "var(--color-accent)" : "transparent",
                    color: filterSource === f ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                    border:
                      "1px solid " +
                      (filterSource === f ? "var(--color-accent)" : "var(--color-surface-alt)"),
                    borderRadius: 4,
                    padding: "3px 10px",
                    fontSize: 11,
                    fontWeight: filterSource === f ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
              {filtered.length === 0 ? (
                <div style={{ color: "var(--color-text-muted)", fontSize: 12, lineHeight: 1.6 }}>
                  No skills yet. Click <strong>+ New</strong> to create one.
                </div>
              ) : (
                filtered.map((s) => (
                  <SkillRow key={s.name} skill={s} onEdit={handleEdit} onDelete={handleDelete} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
