import mockEmployees from "../data/mockEmployees.js";
import {
  MEDICAL_HISTORY_STORAGE_KEY,
  MEDICAL_HISTORY_UPDATED_EVENT,
  MEDICAL_VALIDATIONS_STORAGE_KEY,
  MEDICAL_VALIDATIONS_UPDATED_EVENT,
  PREVENTIVE_PLANS_STORAGE_KEY,
  PREVENTIVE_PLANS_UPDATED_EVENT,
} from "../utils/storageKeys.js";
import { saveEntity } from "../utils/indexedDbClient.js";

const PLACEHOLDER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAYAAAAGCAYAAADgzO9IAAAAFElEQVR42mP8//8/AwXgPxQDAwMADIYH/qAnbcIAAAAASUVORK5CYII=";
const DEMO_CERTIFICATE_COUNT = 20;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const formatDateLabel = (date) =>
  date.toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const formatDateISO = (date) => date.toISOString().slice(0, 10);

const scenarioTemplates = [
  {
    priority: "Alta",
    status: "Pendiente",
    absenceType: "accidente",
    certificateType: "Accidente de trabajo",
    detailedReason:
      "Lesion lumbar luego de tareas de carga. Requiere reposo y fisioterapia.",
    institution: "Clinica del Sur",
    durationDays: 7,
    notes: "Esperando informe de estudios complementarios.",
  },
  {
    priority: "Media",
    status: "En Revision",
    absenceType: "enfermedad",
    certificateType: "Reposo gripal",
    detailedReason:
      "Cuadro febril con cefalea intensa. Indicacion de reposo domiciliario.",
    institution: "Hospital Central",
    durationDays: 5,
    notes: "Se solicito analitica complementaria.",
  },
  {
    priority: "Baja",
    status: "Pendiente",
    absenceType: "enfermedad",
    certificateType: "Chequeo preventivo",
    detailedReason:
      "Control cardiologico programado. Reposo 48hs post estudio.",
    institution: "Centro Cardiologico Norte",
    durationDays: 2,
    notes: "Sin observaciones adicionales.",
  },
  {
    priority: "Media",
    status: "Validado",
    absenceType: "enfermedad",
    certificateType: "Lesion musculoesqueletica",
    detailedReason:
      "Lumbalgia cronica reagudizada. Necesita kinesiologia supervisada.",
    institution: "Sanatorio Oeste",
    durationDays: 9,
    notes: "Plan preventivo asignado por medico laboral.",
  },
];

const createCertificateMeta = (name, uploadedAt) => ({
  name,
  size: "0.42 MB",
  uploadedAt,
  type: "image/png",
  previewUrl: PLACEHOLDER_IMAGE,
});

const createValidationEntry = (
  employee,
  {
    reference,
    priority,
    status,
    absenceType,
    certificateType,
    detailedReason,
    institution,
    startDate,
    endDate,
    notes,
    submittedDate,
  },
) => {
  const submittedLabel = formatDateLabel(submittedDate);
  return {
    reference,
    employee: employee.fullName,
    employeeId: employee.employeeId,
    position: employee.position,
    sector: employee.sector,
    status,
    priority,
    submitted: submittedLabel,
    receivedTimestamp: submittedDate.getTime(),
    badgeTone:
      status === "Pendiente"
        ? "bg-rose-100 text-rose-700"
        : status === "En Revision"
          ? "bg-amber-100 text-amber-700"
          : "bg-emerald-100 text-emerald-700",
    detailedReason,
    absenceDays:
      Math.max(
        1,
        Math.ceil(
          (Date.parse(endDate) - Date.parse(startDate)) /
            (1000 * 60 * 60 * 24),
        ) + 1,
      ) || 1,
    absenceType,
    certificateType,
    institution,
    startDate,
    endDate,
    issueDate: startDate,
    validityDate: endDate,
    notes,
    certificateFileMeta: createCertificateMeta(
      `${reference}.png`,
      submittedLabel,
    ),
  };
};

const createHistoryRecord = (
  employeeKey,
  reference,
  issued,
  status,
  riskLevel,
) => ({
  id: reference,
  reference,
  title: "Reposo Medico",
  issued,
  days: 5,
  status,
  document: `${reference}.pdf`,
  institution: "Sanatorio Central",
  notes: `Resultado: ${status}. Seguimiento medico semanal.`,
  reviewer: "Dr. Gabriel Caamano",
  riskScore: riskLevel === "Alta" ? 7.8 : riskLevel === "Media" ? 5.2 : 3.9,
  riskLevel,
  riskDescriptor:
    riskLevel === "Alta"
      ? "Intervencion inmediata"
      : riskLevel === "Media"
        ? "Monitoreo continuo"
        : "Seguimiento general",
  planActions: ["Reposo activo", "Trabajo remoto supervisado"],
  planFollowUps: ["Control clinico 10/05", "Evaluacion ergonomica 24/05"],
  planRecommendations: [
    "Pausas cada 2 horas",
    "Reportar sintomas en app de bienestar",
  ],
  employeeKey,
});

const IDB_TARGETS = {
  [MEDICAL_VALIDATIONS_STORAGE_KEY]: { store: "validations", key: "queue" },
  [MEDICAL_HISTORY_STORAGE_KEY]: { store: "history", key: "records" },
  [PREVENTIVE_PLANS_STORAGE_KEY]: { store: "plans", key: "plans" },
};

const persistWithEvent = (key, value, eventName) => {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(eventName));
  const target = IDB_TARGETS[key];
  if (target) {
    saveEntity(target.store, target.key, value).catch((error) =>
      console.warn("No se pudo sincronizar demo seed con IndexedDB:", error),
    );
  }
};

export const runDemoSeed = () => {
  if (typeof window === "undefined") return;
  const now = new Date();
  const validationEntries = Array.from({ length: DEMO_CERTIFICATE_COUNT }).map(
    (_, index) => {
      const employee = mockEmployees[index % mockEmployees.length];
      const scenario = scenarioTemplates[index % scenarioTemplates.length];
      const submittedDate = new Date(now.getTime() - index * 90 * 60 * 1000);
      const startDateObj = new Date(
        submittedDate.getTime() - (scenario.durationDays + 1) * DAY_IN_MS,
      );
      const endDateObj = new Date(
        startDateObj.getTime() + scenario.durationDays * DAY_IN_MS,
      );

      return createValidationEntry(employee, {
        reference: `CM-DEMO-${String(index + 1).padStart(4, "0")}`,
        priority: scenario.priority,
        status: scenario.status,
        absenceType: scenario.absenceType,
        certificateType: scenario.certificateType,
        detailedReason: scenario.detailedReason,
        institution: scenario.institution,
        startDate: formatDateISO(startDateObj),
        endDate: formatDateISO(endDateObj),
        notes: scenario.notes,
        submittedDate,
      });
    },
  );

  const historyPayload = mockEmployees.slice(0, 8).reduce((acc, employee, idx) => {
    const issuedDate = new Date(now.getTime() - (idx + 5) * DAY_IN_MS);
    acc[employee.employeeId] = [
      createHistoryRecord(
        employee.employeeId,
        `CM-HIS-${String(idx + 101).padStart(4, "0")}`,
        formatDateISO(issuedDate),
        "Validado",
        idx % 3 === 0 ? "Alta" : idx % 2 === 0 ? "Media" : "Baja",
      ),
    ];
    return acc;
  }, {});

  const plansPayload = mockEmployees.slice(0, 4).reduce((acc, employee, idx) => {
    acc[employee.employeeId] = {
      actions: [
        "Adaptar puesto sin esfuerzos de torsion",
        "Control clinico semanal",
      ],
      followUps: [
        `15 Mar - Kinesiologia ${idx + 1}`,
        `30 Mar - Clinica laboral ${idx + 1}`,
      ],
      recommendations: [
        "Registrar sintomas en la app corporativa",
        "Pausas activas cada 90 minutos",
      ],
    };
    return acc;
  }, {});

  persistWithEvent(
    MEDICAL_VALIDATIONS_STORAGE_KEY,
    validationEntries,
    MEDICAL_VALIDATIONS_UPDATED_EVENT,
  );
  persistWithEvent(
    MEDICAL_HISTORY_STORAGE_KEY,
    historyPayload,
    MEDICAL_HISTORY_UPDATED_EVENT,
  );
  persistWithEvent(
    PREVENTIVE_PLANS_STORAGE_KEY,
    plansPayload,
    PREVENTIVE_PLANS_UPDATED_EVENT,
  );

  window.dispatchEvent(new Event("storage"));
  console.info(
    "%cDemo seed completado",
    "background:#0f172a;color:#fff;padding:4px 8px;border-radius:6px",
    "Ejecuta window.runDemoSeed() nuevamente si queres regenerar los datos.",
  );
};

if (import.meta.env.MODE !== "production" && typeof window !== "undefined") {
  window.runDemoSeed = runDemoSeed;
  console.info(
    "%cDemo disponible",
    "background:#e0f2fe;color:#0f172a;padding:4px 8px;border-radius:6px",
    "Ejecuta window.runDemoSeed() en la consola para precargar certificados.",
  );
}
