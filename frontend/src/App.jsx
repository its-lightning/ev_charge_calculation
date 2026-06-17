import { useState, useEffect, useRef, useCallback } from "react";
import "./index.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHMS(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatFinishTime(remainingSeconds) {
  if (!isFinite(remainingSeconds) || remainingSeconds <= 0) return null;
  const finish = new Date(Date.now() + remainingSeconds * 1000);
  return finish.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFinishDate(remainingSeconds) {
  if (!isFinite(remainingSeconds) || remainingSeconds <= 0) return null;
  const finish = new Date(Date.now() + remainingSeconds * 1000);
  const now = new Date();
  if (finish.toDateString() === now.toDateString()) return "Today";
  if (
    finish.toDateString() ===
    new Date(now.getTime() + 86400000).toDateString()
  )
    return "Tomorrow";
  return finish.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Pure client-side fallback calculation (used while API fetches) */
function calcLocal(batteryCapacity, startPct, targetPct, currentKw, energyCharged) {
  if (startPct >= targetPct)
    return { status: "invalid_range", timeRemaining: 0, energyRemaining: 0, totalEnergyNeeded: 0, progress: 0 };
  const totalEnergyNeeded = batteryCapacity * ((targetPct - startPct) / 100);
  const energyRemaining = totalEnergyNeeded - energyCharged;
  const progress =
    totalEnergyNeeded > 0
      ? Math.min(100, Math.max(0, (energyCharged / totalEnergyNeeded) * 100))
      : 0;
  if (energyRemaining <= 0)
    return { status: "complete", timeRemaining: 0, energyRemaining: 0, totalEnergyNeeded, progress: 100 };
  if (currentKw === 0)
    return { status: "paused", timeRemaining: Infinity, energyRemaining, totalEnergyNeeded, progress };
  return {
    status: "charging",
    timeRemaining: (energyRemaining / currentKw) * 3600,
    energyRemaining,
    totalEnergyNeeded,
    progress,
  };
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar({ apiStatus }) {
  return (
    <header className="zeon-navbar">
      <div className="zeon-navbar-logo">
        <div className="zeon-navbar-diamond">
          <div className="zeon-navbar-diamond-inner" />
        </div>
        <span className="zeon-navbar-title">Zeon Charge</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="zeon-navbar-meta">EV · kWh · Live</span>
        <span className={`api-badge ${apiStatus}`}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "currentColor",
              display: "inline-block",
            }}
          />
          {apiStatus === "ok" ? "API" : apiStatus === "err" ? "offline" : "—"}
        </span>
      </div>
    </header>
  );
}

// ─── Pulse dot ────────────────────────────────────────────────────────────────

function PulseDot({ status }) {
  const cls =
    status === "paused"
      ? "paused"
      : status === "complete"
      ? "complete"
      : status === "invalid_range"
      ? "error"
      : "";
  return <div className={`pulse-dot ${cls}`} />;
}

// ─── Timer display ────────────────────────────────────────────────────────────

function TimerDisplay({ status, displaySeconds, isTicking }) {
  const cls = [
    "zeon-timer",
    status === "paused" ? "paused" : "",
    status === "complete" ? "complete" : "",
    status === "invalid_range" ? "error" : "",
    isTicking ? "timer-ticking" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const text =
    status === "complete"
      ? "DONE ✓"
      : status === "invalid_range"
      ? "– – –"
      : formatHMS(displaySeconds);

  return <div className={cls}>{text}</div>;
}

// ─── Charging power badge ─────────────────────────────────────────────────────

function ChargingPowerBadge({ currentKw, status }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.25rem 0.625rem 0.25rem 0.5rem",
        borderRadius: "0.375rem",
        background: "var(--zeon-surface)",
        border: "1px solid var(--zeon-border)",
      }}
    >
      {/* lightning bolt icon */}
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke={status === "paused" || status === "invalid_range" ? "oklch(0.38 0.008 240)" : "var(--zeon-red)"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
      <span
        className={`zeon-kw-display${status === "paused" || status === "invalid_range" ? " paused" : ""}`}
        style={{ fontSize: "0.9rem" }}
      >
        {currentKw}
      </span>
      <span style={{ fontSize: "0.6875rem", color: "oklch(0.40 0.008 240)", fontFamily: "var(--zeon-mono)" }}>
        kW
      </span>
    </div>
  );
}

// ─── Progress bar with tick marks ─────────────────────────────────────────────

function ProgressBar({ value }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="zeon-progress-track">
      <div className="zeon-progress-fill" style={{ width: `${pct}%` }} />
      {[25, 50, 75].map((tick) => (
        <div
          key={tick}
          className="zeon-progress-tick"
          style={{ left: `${tick}%` }}
        />
      ))}
    </div>
  );
}

// ─── Stats grid ───────────────────────────────────────────────────────────────

function StatGrid({ items }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "0.75rem 1.25rem",
      }}
    >
      {items.map(({ label, value, unit }) => (
        <div key={label} className="zeon-stat">
          <span className="zeon-stat-label">{label}</span>
          <span className="zeon-stat-value">
            {value}
            {unit && <span className="zeon-stat-unit">{unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function SliderInput({ id, label, value, min, max, step = 1, unit, onChange }) {
  const fillPct = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <label
          htmlFor={id}
          style={{
            fontSize: "0.75rem",
            color: "var(--zeon-text-dim)",
            fontWeight: 500,
          }}
        >
          {label}
        </label>
        <span
          style={{
            fontFamily: "var(--zeon-mono)",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--zeon-red)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
          <span
            style={{
              marginLeft: "0.15rem",
              fontSize: "0.6875rem",
              fontWeight: 400,
              opacity: 0.55,
            }}
          >
            {unit}
          </span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="zeon-range"
        style={{ "--fill-pct": fillPct }}
      />
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  batteryCapacity: 75,
  startPct: 20,
  targetPct: 80,
  currentKw: 45,
  energyCharged: 10,
};

export default function App() {
  const [batteryCapacity, setBatteryCapacity] = useState(DEFAULTS.batteryCapacity);
  const [startPct, setStartPct]               = useState(DEFAULTS.startPct);
  const [targetPct, setTargetPct]             = useState(DEFAULTS.targetPct);
  const [currentKw, setCurrentKw]             = useState(DEFAULTS.currentKw);
  const [energyCharged, setEnergyCharged]     = useState(DEFAULTS.energyCharged);

  // API state
  const [apiDerived, setApiDerived]   = useState(null); // result from /calculate
  const [apiStatus, setApiStatus]     = useState("idle"); // "idle"|"ok"|"err"
  const debounceRef                   = useRef(null);

  // Local derived (instant, no lag)
  const localDerived = calcLocal(batteryCapacity, startPct, targetPct, currentKw, energyCharged);
  const derived      = apiDerived ?? localDerived;

  // Countdown timer
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const intervalRef = useRef(null);

  const startCountdown = useCallback((seconds) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isFinite(seconds) || seconds <= 0) { setDisplaySeconds(0); return; }
    let remaining = Math.floor(seconds);
    setDisplaySeconds(remaining);
    intervalRef.current = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      setDisplaySeconds(remaining);
      if (remaining <= 0) clearInterval(intervalRef.current);
    }, 1000);
  }, []);

  // Call /calculate API with debounce
  useEffect(() => {
    // Immediately update local display
    if (derived.status === "charging") {
      startCountdown(localDerived.timeRemaining);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setDisplaySeconds(0);
    }

    // Debounced API call
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            battery_capacity: batteryCapacity,
            start_pct:        startPct,
            target_pct:       targetPct,
            current_kw:       currentKw,
            energy_charged:   energyCharged,
          }),
        });
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        // Normalise API response into our shape
        const totalEnergyNeeded = data.total_energy_needed ?? localDerived.totalEnergyNeeded;
        const energyRemaining   = data.energy_remaining   ?? localDerived.energyRemaining;
        const timeRemaining     = data.time_remaining_seconds ?? 0;
        const progress =
          totalEnergyNeeded > 0
            ? Math.min(100, Math.max(0, ((totalEnergyNeeded - energyRemaining) / totalEnergyNeeded) * 100))
            : 0;

        const normalized = {
          status: data.status,
          timeRemaining: data.status === "paused" ? Infinity : timeRemaining,
          energyRemaining,
          totalEnergyNeeded,
          progress: data.status === "complete" ? 100 : progress,
        };
        setApiDerived(normalized);
        setApiStatus("ok");

        // Re-sync countdown with server answer
        if (data.status === "charging") startCountdown(timeRemaining);
        else {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setDisplaySeconds(0);
        }
      } catch {
        setApiStatus("err");
        setApiDerived(null); // fall back to local calc
      }
    }, 250);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batteryCapacity, startPct, targetPct, currentKw, energyCharged]);

  // Keyboard shortcut: R to reset
  useEffect(() => {
    function onKey(e) {
      if (
        e.key === "r" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
      ) {
        setBatteryCapacity(DEFAULTS.batteryCapacity);
        setStartPct(DEFAULTS.startPct);
        setTargetPct(DEFAULTS.targetPct);
        setCurrentKw(DEFAULTS.currentKw);
        setEnergyCharged(DEFAULTS.energyCharged);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isTicking  = derived.status === "charging" && displaySeconds > 0;
  const finishTime = derived.status === "charging" ? formatFinishTime(displaySeconds) : null;
  const finishDate = derived.status === "charging" ? formatFinishDate(displaySeconds) : null;
  const progressValue = derived.status === "complete" ? 100 : (derived.progress ?? 0);

  // Status label
  const statusLabel =
    derived.status === "paused"       ? "Charger Paused" :
    derived.status === "complete"     ? "Charge Complete" :
    derived.status === "invalid_range"? "Invalid Range" :
    "Time Remaining";

  // Stats grid items
  const statsItems = [
    {
      label: "Energy Charged",
      value: energyCharged.toFixed(1),
      unit: " kWh",
    },
    {
      label: "Remaining",
      value: derived.energyRemaining > 0
        ? derived.energyRemaining.toFixed(1)
        : "0.0",
      unit: " kWh",
    },
    {
      label: "Session Total",
      value: derived.totalEnergyNeeded > 0
        ? derived.totalEnergyNeeded.toFixed(1)
        : "—",
      unit: derived.totalEnergyNeeded > 0 ? " kWh" : "",
    },
    {
      label: "SoC Range",
      value: derived.status === "invalid_range"
        ? "—"
        : `${startPct}→${targetPct}`,
      unit: derived.status === "invalid_range" ? "" : "%",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: "var(--zeon-bg)" }}>

      {/* ── Navbar ── */}
      <Navbar apiStatus={apiStatus} />

      {/* ── Hero / Timer ── */}
      <header className="zeon-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
          <PulseDot status={derived.status} />
          <span
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "oklch(0.40 0.008 240)",
              fontFamily: "var(--zeon-mono)",
            }}
          >
            {statusLabel}
          </span>
          <ChargingPowerBadge currentKw={currentKw} status={derived.status} />
        </div>

        <TimerDisplay
          status={derived.status}
          displaySeconds={displaySeconds}
          isTicking={isTicking}
        />

        {finishTime && (
          <div className="zeon-pill" style={{ marginTop: "0.75rem" }}>
            <span style={{ fontSize: "0.6875rem", color: "var(--zeon-text-dim)" }}>
              Est. finish
            </span>
            <span
              style={{
                fontFamily: "var(--zeon-mono)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--zeon-red)",
                letterSpacing: "-0.01em",
              }}
            >
              {finishDate !== "Today" ? `${finishDate}, ` : ""}
              {finishTime}
            </span>
          </div>
        )}

        {derived.status === "invalid_range" && (
          <p
            style={{
              fontSize: "0.6875rem",
              marginTop: "0.5rem",
              color: "oklch(0.38 0.008 240)",
              fontFamily: "var(--zeon-mono)",
            }}
          >
            Start SoC must be below Target SoC
          </p>
        )}
        {derived.status === "paused" && (
          <p
            style={{
              fontSize: "0.6875rem",
              marginTop: "0.5rem",
              color: "oklch(0.38 0.008 240)",
              fontFamily: "var(--zeon-mono)",
            }}
          >
            Raise charging power to resume
          </p>
        )}
      </header>

      {/* ── Scrollable body ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "0.625rem",
          padding: "0.875rem 0.875rem 1.25rem",
          overflowY: "auto",
        }}
      >

        {/* Progress card */}
        <div className="zeon-card" style={{ padding: "0.875rem 1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.5rem",
            }}
          >
            <span className="zeon-section-label">Session Progress</span>
            <span
              style={{
                fontFamily: "var(--zeon-mono)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--zeon-red)",
                letterSpacing: "-0.01em",
              }}
            >
              {progressValue.toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={progressValue} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "0.5rem",
            }}
          >
            <span style={{ fontSize: "0.6875rem", color: "oklch(0.35 0.006 240)" }}>
              {energyCharged.toFixed(1)} kWh charged
            </span>
            <span style={{ fontSize: "0.6875rem", color: "oklch(0.35 0.006 240)" }}>
              {derived.totalEnergyNeeded > 0
                ? `${derived.totalEnergyNeeded.toFixed(1)} kWh total`
                : "—"}
            </span>
          </div>
        </div>

        {/* Stats grid card */}
        <div className="zeon-card" style={{ padding: "0.875rem 1rem" }}>
          <span className="zeon-section-label" style={{ display: "block", marginBottom: "0.625rem" }}>
            Session Stats
          </span>
          <StatGrid items={statsItems} />
        </div>

        {/* Sliders card */}
        <div className="zeon-card" style={{ padding: "0.875rem 1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <span className="zeon-section-label">Parameters</span>
            <button
              id="reset-btn"
              onClick={() => {
                setBatteryCapacity(DEFAULTS.batteryCapacity);
                setStartPct(DEFAULTS.startPct);
                setTargetPct(DEFAULTS.targetPct);
                setCurrentKw(DEFAULTS.currentKw);
                setEnergyCharged(DEFAULTS.energyCharged);
              }}
              title="Reset to defaults (R)"
              style={{
                fontSize: "0.625rem",
                fontFamily: "var(--zeon-mono)",
                color: "oklch(0.35 0.008 240)",
                background: "none",
                border: "1px solid var(--zeon-border)",
                borderRadius: "0.25rem",
                padding: "0.125rem 0.5rem",
                cursor: "pointer",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Reset [R]
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <SliderInput
              id="current-power"
              label="Charging Power"
              value={currentKw}
              min={0} max={350} step={0.5}
              unit=" kW"
              onChange={setCurrentKw}
            />

            <SliderInput
              id="energy-charged"
              label="Energy Charged"
              value={energyCharged}
              min={0} max={batteryCapacity} step={0.1}
              unit=" kWh"
              onChange={setEnergyCharged}
            />

            <div className="zeon-sep" style={{ margin: "0.25rem 0" }} />

            <SliderInput
              id="battery-capacity"
              label="Battery Capacity"
              value={batteryCapacity}
              min={10} max={200} step={0.5}
              unit=" kWh"
              onChange={setBatteryCapacity}
            />

            <SliderInput
              id="start-soc"
              label="Start SoC"
              value={startPct}
              min={0} max={99}
              unit="%"
              onChange={setStartPct}
            />

            <SliderInput
              id="target-soc"
              label="Target SoC"
              value={targetPct}
              min={1} max={100}
              unit="%"
              onChange={setTargetPct}
            />
          </div>
        </div>

        {/* Footer hint */}
        <p
          style={{
            textAlign: "center",
            fontSize: "0.5625rem",
            color: "oklch(0.25 0.006 240)",
            fontFamily: "var(--zeon-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            paddingTop: "0.25rem",
          }}
        >
          Press R to reset · Powered by Flask
        </p>
      </div>
    </div>
  );
}
