import { useContext, useEffect, useMemo, useState } from "react";
import AppHeader from "../components/AppHeader.jsx";
import mockEmployees from "../data/mockEmployees.js";
import { readValidationQueue } from "../utils/validationStorage.js";
import { readAllHistory } from "../utils/historyStorage.js";
import calculateRiskScore, { mapScoreToRisk } from "../utils/riskUtils.js";
import {
  MEDICAL_HISTORY_UPDATED_EVENT,
  MEDICAL_VALIDATIONS_UPDATED_EVENT,
  PREVENTIVE_PLANS_UPDATED_EVENT,
} from "../utils/storageKeys.js";
import { readAllPlans } from "../utils/planStorage.js";
import {
  generatePreventivePlanTemplate,
  shapePlanForDisplay,
} from "../utils/preventivePlan.js";
import AuthContext from "../context/AuthContext.jsx";

const levelToneMap = {
  Alta: "bg-rose-100 text-rose-700",
  Media: "bg-amber-100 text-amber-700",
  Baja: "bg-emerald-100 text-emerald-700",
};

const employeeIndexById = new Map();
const employeeIndexByName = new Map();
mockEmployees.forEach((employee) => {
  employeeIndexById.set(employee.employeeId, employee);
  employeeIndexByName.set(employee.fullName.toLowerCase(), employee);
});

const normalizeText = (value = "") =>
  value
    .replace(/certificado medico\s*-/gi, "")
    .replace(/certificado\s*-/gi, "")
    .replace(/cm-\d+/gi, "")
    .trim();

const extractScoreValue = (input) => {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string") {
    const match = input.match(/-?\d+(\.\d+)?/);
    if (match) return parseFloat(match[0]);
  }
  return null;
};

const MIN_RECURRENT_COUNT = 3;
const AUTO_SYNC_INTERVAL_MS = 150 * 1000;

const formatDateTimeLabel = (value) => {
  if (!value) return "--";
  return value.toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDateValue = (value) => {
  if (!value) return "--";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const resolvePathologyLabel = (payload = {}) => {
  const fields = [
    payload.pathology,
    payload.certificateType,
    payload.absenceType,
    payload.detailedReason,
    payload.detail,
    payload.title,
    payload.notes,
  ];
  const match = fields.find((field) => field && field.trim().length > 0);
  if (!match) return null;
  const cleaned = normalizeText(match);
  if (!cleaned) return null;
  // use only first sentence to keep label short
  const [firstSentence] = cleaned.split(/[.,;]/);
  return firstSentence.trim();
};

const summaryMetrics = [
  {
    title: "Tasa de Ausentismo General",
    value: "8.7%",
    badge: "-12%",
    badgeVariant: "danger",
    primaryLabel: "vs mes anterior",
    primaryValue: "+1.3%",
    secondaryLabel: "Promedio sector",
    secondaryValue: "7.2%",
  },
  {
    title: "Riesgo Promedio del Personal",
    value: "4.6",
    badge: "+0.3",
    badgeVariant: "warning",
    primaryLabel: "Mes anterior (4.7)",
    primaryValue: "Mejora de riesgo",
    secondaryLabel: "Rango esperado",
    secondaryValue: "4.0 - 6.0",
  },
  {
    title: "Alertas Activas",
    value: "23",
    badge: "Critico",
    badgeVariant: "danger",
    primaryLabel: "Requieren atencion inmediata",
    primaryValue: "8 casos",
    secondaryLabel: "Alertas moderadas",
    secondaryValue: "15",
  },
];

const sectorRisk = [
  {
    name: "Produccion",
    stats: "12 ausencias - 8 alertas",
    status: "Riesgo alto",
    score: "6.9/10",
    tone: "from-rose-500/90 to-amber-400/90",
  },
  {
    name: "Mantenimiento",
    stats: "9 ausencias - 5 alertas",
    status: "Riesgo alto",
    score: "7.2/10",
    tone: "from-red-500/90 to-amber-400/90",
  },
  {
    name: "Atencion al cliente",
    stats: "4 ausencias - 1 alerta",
    status: "Riesgo medio",
    score: "5.0/10",
    tone: "from-amber-400/90 to-lime-300/90",
  },
];

/* codigo comentado para referencia futura
const legendLevels = [
  { label: 'Alto (>= 7)', tone: 'bg-rose-500', description: 'Intervencion inmediata y seguimiento continuo.' },
  {
    label: 'Medio (5.0-6.9)',
    tone: 'bg-amber-400',
    description: 'Monitoreo regular y medidas preventivas.',
  },
  {
    label: 'Bajo (< 5)',
    tone: 'bg-emerald-400',
    description: 'Seguimiento de rutina y prevencion general.',
  },
]
*/

const fallbackEmployees = []


function Dashboard({ isDark, onToggleTheme }) {
  const auth = useContext(AuthContext);
  const [validationQueue, setValidationQueue] = useState(() =>
    typeof window === "undefined" ? [] : readValidationQueue(),
  );
  const [historySnapshot, setHistorySnapshot] = useState(() =>
    typeof window === "undefined" ? {} : readAllHistory(),
  );
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [countdownLabel, setCountdownLabel] = useState("02:30");
  const [historyModal, setHistoryModal] = useState({
    isOpen: false,
    employee: "",
    records: [],
  });
  const [planModal, setPlanModal] = useState({
    isOpen: false,
    employee: "",
    plan: null,
    employeeKey: "",
    planSource: "auto",
  });
  const [planStore, setPlanStore] = useState(() =>
    typeof window === "undefined" ? {} : readAllPlans(),
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refreshAll = () => {
      setValidationQueue(readValidationQueue());
      setHistorySnapshot(readAllHistory());
      setLastRefresh(new Date());
    };
    refreshAll();
    window.addEventListener(MEDICAL_VALIDATIONS_UPDATED_EVENT, refreshAll);
    window.addEventListener(MEDICAL_HISTORY_UPDATED_EVENT, refreshAll);
    window.addEventListener("storage", refreshAll);
    return () => {
      window.removeEventListener(
        MEDICAL_VALIDATIONS_UPDATED_EVENT,
        refreshAll,
      );
      window.removeEventListener(
        MEDICAL_HISTORY_UPDATED_EVENT,
        refreshAll,
      );
      window.removeEventListener("storage", refreshAll);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncPlans = () => {
      setPlanStore(readAllPlans());
    };
    window.addEventListener(PREVENTIVE_PLANS_UPDATED_EVENT, syncPlans);
    window.addEventListener("storage", syncPlans);
    return () => {
      window.removeEventListener(
        PREVENTIVE_PLANS_UPDATED_EVENT,
        syncPlans,
      );
      window.removeEventListener("storage", syncPlans);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateCountdown = () => {
      if (!lastRefresh) return;
      const now = Date.now();
      const elapsed = now - lastRefresh.getTime();
      const remaining = Math.max(0, AUTO_SYNC_INTERVAL_MS - elapsed);
      const minutes = String(Math.floor(remaining / 60000)).padStart(2, "0");
      const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(
        2,
        "0",
      );
      setCountdownLabel(`${minutes}:${seconds}`);
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [lastRefresh]);

  const dynamicEmployees = useMemo(() => {
    const buckets = new Map(); // employee -> Map(pathology -> info)

    const registerOccurrence = (payload = {}, options = {}) => {
      const { isCountable = true } = options;
      const pathologyLabel = resolvePathologyLabel(payload);
      if (!pathologyLabel) return;

      const baseInfo =
        (payload.employeeId && employeeIndexById.get(payload.employeeId)) ||
        (payload.employee
          ? employeeIndexByName.get(payload.employee.toLowerCase())
          : null);
      const displayName =
        payload.employee ||
        baseInfo?.fullName ||
        (payload.employeeId ? `Colaborador ${payload.employeeId}` : null);
      if (!displayName) return;

      const employeeKey = payload.employeeId || displayName;
      const legajoLabel = payload.employeeId
        ? `Legajo ${payload.employeeId}`
        : baseInfo?.employeeId
          ? `Legajo ${baseInfo.employeeId}`
          : payload.reference
            ? `Ref ${payload.reference}`
            : "Sin identificacion";
      const updatedAt =
        Date.parse(
          payload.updatedAt || payload.submitted || payload.issued || "",
        ) || Date.now();
      const manualScore =
        extractScoreValue(payload.riskScoreValue) ??
        extractScoreValue(payload.riskScore);
      const riskSource =
        manualScore != null
          ? mapScoreToRisk(manualScore)
          : calculateRiskScore({
              absenceType:
                payload.absenceType ||
                payload.certificateType ||
                payload.title ||
                "",
              detailedReason:
                payload.detailedReason ||
                payload.detail ||
                payload.notes ||
                "",
            });

      if (!buckets.has(employeeKey)) {
        buckets.set(employeeKey, new Map());
      }
      const employeeBucket = buckets.get(employeeKey);
      const existing = employeeBucket.get(pathologyLabel) || {
        count: 0,
        latest: 0,
        scoreValue: 0,
        display: null,
      };

      const count = existing.count + (isCountable ? 1 : 0);
      const next = {
        count,
        latest: Math.max(existing.latest, updatedAt),
        scoreValue: Math.max(existing.scoreValue, riskSource.score),
        display: {
          key: `${employeeKey}-${pathologyLabel}`,
          employeeKey,
          name: displayName,
          dni: legajoLabel,
          sector: payload.sector || baseInfo?.sector || "Sin sector",
          pathology: pathologyLabel,
          riskScore: `${riskSource.score.toFixed(1)} / 10`,
          level: riskSource.level,
          levelTone: levelToneMap[riskSource.level] || "bg-slate-200 text-slate-700",
          riskHistory: "Ver historial",
          actions: ["Plan Preventivo", "Intervencion"],
          plan: planStore[employeeKey] || null,
          updatedAt,
        },
      };

      employeeBucket.set(pathologyLabel, next);
    };

    validationQueue.forEach((entry) => {
      registerOccurrence(
        {
          employeeId: entry.employeeId,
          employee: entry.employee,
          sector: entry.sector,
          detailedReason: entry.detailedReason,
          absenceType: entry.absenceType,
          certificateType: entry.certificateType,
          detail: entry.notes,
          reference: entry.reference,
          updatedAt: entry.lastDecisionAt || entry.submitted,
          riskScoreValue: entry.riskScoreValue,
          riskScore: entry.riskScore,
        },
        { isCountable: false },
      );
    });

    Object.entries(historySnapshot || {}).forEach(([employeeId, records]) => {
      if (!Array.isArray(records)) return;
      records.forEach((record) => {
        registerOccurrence({
          employeeId,
          employee: employeeIndexById.get(employeeId)?.fullName || record.employee,
          sector: employeeIndexById.get(employeeId)?.sector,
          certificateType: record.title,
          detail: record.notes,
          detailedReason: record.detailedReason,
          reference: record.id,
          updatedAt: record.issued,
          riskScoreValue: record.riskScore,
          riskScore: record.riskScore,
          planActions: record.planActions,
          planFollowUps: record.planFollowUps,
          planRecommendations: record.planRecommendations,
        });
      });
    });

    const candidates = [];
    buckets.forEach((pathologies) => {
      pathologies.forEach((info) => {
        if (info.count >= MIN_RECURRENT_COUNT && info.display) {
          candidates.push({
            ...info.display,
            count: info.count,
            scoreValue: info.scoreValue,
          });
        }
      });
    });

    return candidates.sort(
      (a, b) => b.scoreValue - a.scoreValue || b.updatedAt - a.updatedAt,
    );
  }, [validationQueue, historySnapshot, planStore]);

  const employeesToDisplay = dynamicEmployees.map((employee) => ({
    ...employee,
    plan: employee.plan || planStore[employee.employeeKey] || null,
  }));
  const hasEmployees = employeesToDisplay.length > 0;
  const formattedLastRefresh = formatDateTimeLabel(lastRefresh);

  const openHistoryModal = (employee) => {
    const employeeKey =
      employee.employeeKey ||
      employee.employeeId ||
      employee.name ||
      employee.dni;
    const normalizedKey = employeeKey || employee.name;
    const validatedRecords = historySnapshot[normalizedKey] ?? [];
    const pendingRecords = validationQueue.filter((item) =>
      entryBelongsToEmployee(item, employee, normalizedKey),
    );

    const normalizedHistory = validatedRecords.map((record) => ({
      id: record.id || `${record.title}-${record.issued || Date.now()}`,
      title: record.title || record.certificateType || "Certificado medico",
      status: record.status || "Validado",
      issued: formatDateValue(record.issued),
      notes: record.notes || "Sin observaciones",
      institution: record.institution || "No indicado",
      riskLabel: record.riskLevel
        ? `${record.riskLevel} (${Number(record.riskScore).toFixed?.(1) ?? record.riskScore})`
        : null,
    }));

    const normalizedPending = pendingRecords.map((record) => ({
      id: record.reference || `PENDING-${record.employee}`,
      title: record.certificateType || record.absenceType || "Certificado pendiente",
      status: record.status || "En Revision",
      issued: formatDateValue(record.submitted || record.issueDate),
      notes:
        record.notes ||
        record.detailedReason ||
        "Sin observaciones adicionales.",
      institution: record.institution || "No indicado",
      riskLabel: record.riskLevel
        ? `${record.riskLevel} (${Number(record.riskScoreValue).toFixed?.(1) ?? record.riskScoreValue})`
        : null,
    }));

    const recordMap = new Map();
    const registerRecord = (entry, allowOverride = false) => {
      if (!entry) return;
      const key =
        entry.id ||
        entry.reference ||
        `${entry.title || "registro"}-${entry.issued || Date.now()}`;
      if (!key) return;
      if (!recordMap.has(key) || allowOverride) {
        recordMap.set(key, entry);
      }
    };

    normalizedPending.forEach((entry) => registerRecord(entry, true));
    normalizedHistory.forEach((entry) => {
      const key =
        entry.id ||
        entry.reference ||
        `${entry.title || "registro"}-${entry.issued || Date.now()}`;
      if (!recordMap.has(key)) {
        recordMap.set(key, entry);
      }
    });

    const combined = Array.from(recordMap.values());
    setHistoryModal({
      isOpen: true,
      employee: employee.name,
      records: combined.length
        ? combined
        : [
            {
              id: "empty",
              title: "Sin registros",
              status: "N/A",
              issued: "--",
              notes: "Todavia no se registraron certificados para este colaborador.",
              institution: "",
              riskLabel: null,
            },
          ],
    });
  };

  const closeHistoryModal = () =>
    setHistoryModal({ isOpen: false, employee: "", records: [] });

  const openPlanModal = (employee) => {
    const employeeKey =
      employee.employeeKey ||
      employee.employeeId ||
      employee.name ||
      employee.dni;
    const storedPlan =
      (employeeKey && planStore[employeeKey]) ||
      (employee.employeeId && planStore[employee.employeeId]) ||
      employee.plan ||
      null;
    const fallbackPlan = generatePreventivePlanTemplate(employee.level);
    setPlanModal({
      isOpen: true,
      employee: employee.name,
      employeeKey: employeeKey || "",
      plan: shapePlanForDisplay(storedPlan || fallbackPlan),
      planSource: storedPlan ? "custom" : "auto",
    });
  };

  const closePlanModal = () =>
    setPlanModal({
      isOpen: false,
      employee: "",
      employeeKey: "",
      plan: null,
      planSource: "auto",
    });
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-blue-100 to-slate-200 transition dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <AppHeader
        active="Panel de Control"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="flex w-full flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-10 lg:gap-8">
        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Resumen de ausentismo y gestion de ausencias
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Panel de Control
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Ultima actualizacion: {formattedLastRefresh}
                </span>
                <span className="hidden rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400 md:block">
                  Siguiente sync automatica en {countdownLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {summaryMetrics.map((metric) => (
              <article
                key={metric.title}
                className="flex flex-col justify-between rounded-3xl bg-white p-5 shadow-lg shadow-slate-300/30 ring-1 ring-slate-100 transition dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50"
              >
                <header className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {metric.title}
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
                      {metric.value}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      metric.badgeVariant === "danger"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-600/20 dark:text-rose-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    }`}
                  >
                    {metric.badge}
                  </span>
                </header>
                <dl className="mt-6 space-y-3 text-sm">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                    <dt>{metric.primaryLabel}</dt>
                    <dd className="font-semibold text-slate-700 dark:text-slate-200">
                      {metric.primaryValue}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                    <dt>{metric.secondaryLabel}</dt>
                    <dd className="font-semibold text-slate-700 dark:text-slate-200">
                      {metric.secondaryValue}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="col-span-full rounded-3xl bg-white p-6 shadow-lg shadow-slate-300/30 ring-1 ring-slate-100 transition dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50 lg:col-span-2">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Mapa de calor por sector
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Visualizacion de riesgo y ausentismos por departamento
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
              >
                Descargar reporte
              </button>
            </header>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {sectorRisk.map((item) => (
                <div
                  key={item.name}
                  className={`flex flex-col justify-between rounded-3xl bg-gradient-to-br ${item.tone} p-5 text-white shadow-inner`}
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      Sector
                    </p>
                    <h3 className="text-xl font-semibold">{item.name}</h3>
                    <p className="text-sm opacity-90">{item.stats}</p>
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide opacity-80">
                        Estado
                      </p>
                      <p className="text-sm font-semibold">{item.status}</p>
                    </div>
                    <p className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold">
                      {item.score}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
              Alto (&gt;= 7): intervencion inmediata - Medio (5 - 6.9):
              monitoreo continuo - Bajo (&lt; 5): seguimiento general
            </p>
          </article>

          <article className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-300/30 ring-1 ring-slate-100 transition dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50">
            <header className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Evolucion del riesgo promedio
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tendencia del riesgo promedio del personal en los ultimos 12
                meses
              </p>
            </header>
            <div className="mt-6 h-52 rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
              <svg viewBox="0 0 400 160" className="h-full w-full">
                <defs>
                  <linearGradient id="trend" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop
                      offset="0%"
                      stopColor="rgb(248,113,113)"
                      stopOpacity="0.35"
                    />
                    <stop
                      offset="100%"
                      stopColor="rgb(248,113,113)"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                <polyline
                  fill="url(#trend)"
                  stroke="none"
                  points="0,130 30,120 60,110 90,105 120,95 150,85 180,90 210,92 240,89 270,87 300,85 330,90 360,96 390,102 390,160 0,160"
                />
                <polyline
                  fill="none"
                  stroke="rgb(239,68,68)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points="0,130 30,120 60,110 90,105 120,95 150,85 180,90 210,92 240,89 270,87 300,85 330,90 360,96 390,102"
                />
                <line
                  x1="0"
                  y1="70"
                  x2="390"
                  y2="70"
                  stroke="rgb(248,113,113)"
                  strokeDasharray="6 6"
                />
                <line
                  x1="0"
                  y1="110"
                  x2="390"
                  y2="110"
                  stroke="rgb(234,179,8)"
                  strokeDasharray="6 6"
                />
                <line
                  x1="0"
                  y1="140"
                  x2="390"
                  y2="140"
                  stroke="rgb(52,211,153)"
                  strokeDasharray="6 6"
                />
              </svg>
            </div>
            <ul className="mt-6 space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Riesgo
                Alto (&gt;=7)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Riesgo
                Medio (5-6.9)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Riesgo
                Bajo (&lt;5)
              </li>
            </ul>
          </article>
        </section>

        <section>
          <article className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-300/30 ring-1 ring-slate-100 transition dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Empleados con riesgo individual
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Lista detallada de empleados ordenada por puntuacion de riesgo
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 font-semibold transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:hover:border-slate-600"
                >
                  Exportar CSV
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 font-semibold transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:hover:border-slate-600"
                >
                  Ver filtros
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Sector</th>
                    <th className="px-4 py-3">Patologia mas recurrente</th>
                    <th className="px-4 py-3">Puntuacion de riesgo</th>
                    <th className="px-4 py-3">Nivel</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-xs text-slate-600 dark:divide-slate-800 dark:bg-transparent dark:text-slate-300">
                  {hasEmployees ? (
                    employeesToDisplay.map((employee) => (
                      <tr key={employee.name}>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {employee.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {employee.dni}
                          </p>
                        </td>
                        <td className="px-4 py-4">{employee.sector}</td>
                        <td className="px-4 py-4">{employee.pathology}</td>
                        <td className="px-4 py-4 font-semibold text-slate-900 dark:text-white">
                          {employee.riskScore}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${employee.levelTone}`}
                          >
                            {employee.level}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openHistoryModal(employee)}
                            className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                          >
                            {employee.riskHistory || "Historial"}
                          </button>
                          {employee.actions.map((action) => (
                            <button
                              type="button"
                              key={action}
                              onClick={
                                action === "Plan Preventivo"
                                  ? () => openPlanModal(employee)
                                  : undefined
                              }
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                                action === "Intervencion"
                                  ? "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
                                  : action === "Plan Preventivo"
                                    ? "border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                                    : "border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        Aun no hay empleados con riesgo individual registrado.
                        Registra ausencias o ejecuta <code>window.runDemoSeed()</code> para ver datos de ejemplo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-300/30 ring-1 ring-slate-100 transition dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Criterios de puntuacion de riesgo
          </h2>
          <div className="mt-4 grid gap-4 text-sm text-slate-500 dark:text-slate-300 md:grid-cols-3">
            <div className="rounded-2xl border border-rose-200/60 bg-rose-50/80 p-4 font-semibold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
              Alto Riesgo 7.0 - 10.0 - Requiere intervencion inmediata y
              seguimiento continuo.
            </div>
            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 p-4 font-semibold text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
              Riesgo Medio 5.0 - 6.9 - Monitoreo regular y medidas preventivas.
            </div>
            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/80 p-4 font-semibold text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              {
                "Riesgo Bajo < 5.0 - Seguimiento de rutina y prevencion general."
              }
            </div>
          </div>
        </section>
      </main>
      {historyModal.isOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Historial de certificados
                </p>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {historyModal.employee}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Registros validados y pendientes del colaborador.
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300"
                aria-label="Cerrar historial"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 1 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-6 space-y-4">
              {historyModal.records.map((record) => (
                <div
                  key={record.id}
                  className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-5 text-sm shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {record.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Registrado: {record.issued}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow dark:bg-slate-800 dark:text-slate-200">
                      {record.status}
                    </span>
                  </div>
                  <p className="mt-4 text-slate-600 dark:text-slate-300">
                    {record.notes}
                  </p>
                  <div className="mt-4 grid gap-3 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                    <div>
                      <p className="font-semibold uppercase tracking-wide">
                        Institucion
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        {record.institution || "No indicado"}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-wide">
                        Riesgo
                      </p>
                      {record.riskLabel ? (
                        <p className="text-slate-700 dark:text-slate-200">
                          {record.riskLabel}
                        </p>
                      ) : (
                        <p className="text-slate-400">Sin asignar</p>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-wide">
                        Referencia
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        {record.id}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {planModal.isOpen && planModal.plan ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {planModal.planSource === "custom"
                    ? "Plan preventivo registrado"
                    : "Plan preventivo sugerido"}
                </p>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {planModal.employee}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {planModal.planSource === "custom"
                    ? "Plan definido por el profesional tratante."
                    : "Plantilla automatica basada en el nivel de riesgo."}
                </p>
              </div>
              <button
                type="button"
                onClick={closePlanModal}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300"
                aria-label="Cerrar plan preventivo"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 1 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-6 space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Acciones inmediatas
                </p>
                <ul className="mt-3 space-y-3">
                  {planModal.plan.baseActions.map((action) => (
                    <li
                      key={action.title}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {action.title}
                      </p>
                      <p>{action.description}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Responsable: {action.owner} · Plazo: {action.due}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Seguimientos programados
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {planModal.plan.followUps.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
                    >
                      <p className="text-base text-slate-900 dark:text-white">
                        {item.date}
                      </p>
                      <p>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Recomendaciones del medico
                </p>
                <ul className="mt-3 space-y-2">
                  {planModal.plan.recommendations.map((note, index) => (
                    <li
                      key={note}
                      className="flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                    >
                      <span className="mt-0.5 h-2 w-2 rounded-full bg-rose-500" />
                      <span>
                        #{index + 1} · {note}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Dashboard;
const entryBelongsToEmployee = (entry, employee, normalizedKey) => {
  const lowerName = (employee.name || "").toLowerCase();
  const entryName = (entry.employee || "").toLowerCase();
  return (
    entry.employeeId === employee.employeeKey ||
    entry.employeeId === normalizedKey ||
    entry.employeeId === employee.employeeId ||
    entryName === lowerName ||
    entryName === normalizedKey?.toLowerCase()
  );
};
