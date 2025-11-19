import { useContext, useEffect, useMemo, useState } from "react";
import AppHeader from "../components/AppHeader.jsx";
import DropdownSelect from "../components/DropdownSelect.jsx";
import mockEmployees from "../data/mockEmployees.js";
import { readValidationQueue, upsertValidationEntry } from "../utils/validationStorage.js";
import {
  readEmployeeHistory,
  appendEmployeeHistory,
  importHistoryFromJSON,
  importHistoryFromCSV,
  exportHistoryAsJSON,
} from "../utils/historyStorage.js";
import { MEDICAL_VALIDATIONS_UPDATED_EVENT } from "../utils/storageKeys.js";
import { calculateRiskScore, mapScoreToRisk } from "../utils/riskUtils.js";
import { readEmployeePlan, saveEmployeePlan } from "../utils/planStorage.js";
import {
  draftForRiskLevel,
  draftTextToPlan,
  planToDraftText,
} from "../utils/preventivePlan.js";
import {
  enqueueOperation,
  processQueue as processOperationQueue,
} from "../utils/operationQueue.js";
import { pathologyCategories } from "../data/pathologyCategories.js";
import AuthContext from "../context/AuthContext.jsx";

const riskLevelToneMap = {
  Alta: "bg-rose-100 text-rose-700",
  Media: "bg-amber-100 text-amber-700",
  Baja: "bg-emerald-100 text-emerald-700",
};

const pathologyCategoryMap = Object.fromEntries(
  pathologyCategories.map((item) => [item.value, item.label]),
);

const formatPathologyCategory = (value) =>
  pathologyCategoryMap[value] || value || "No indicado";

const statusOptions = [
  { value: "todos", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "revision", label: "En Revision" },
  { value: "validado", label: "Validado" },
  { value: "rechazado", label: "Rechazado" },
];

const priorityOptions = [
  { value: "todas", label: "Todas las prioridades" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

const baseValidationTemplates = [];
const baseValidations = [];

const statusFlow = ["pendiente", "en revision", "validado"];

const normalizeStatusValue = (status = "") => {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("revision")) return "revision";
  if (normalized.includes("pendiente")) return "pendiente";
  if (normalized.includes("validado")) return "validado";
  if (normalized.includes("rechazado")) return "rechazado";
  return normalized;
};

const modalSteps = [
  {
    key: "pendiente",
    title: "Recepcion y registro",
    description: "Se verifica la documentacion y se agenda para analisis.",
  },
  {
    key: "en revision",
    title: "Revision medica",
    description: "El equipo medico revisa antecedentes y validez del certificado.",
  },
  {
    key: "validado",
    title: "Dictamen final",
    description: "Se emite la resolucion y se notifica al empleado y RRHH.",
  },
];

const createEmptyPlanDraft = () => ({
  actions: "",
  followUps: "",
  recommendations: "",
});

const getDaysBetween = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
};

const extractScoreValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) return parseFloat(match[0]);
  }
  return null;
};

const parseLocalDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateValue = (value) => {
  if (!value) return "";
  const parsed = parseLocalDateValue(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getSortTimestamp = (item, fallbackIndex = 0) => {
  if (!item) return fallbackIndex;
  if (typeof item.receivedTimestamp === "number") return item.receivedTimestamp;
  if (typeof item.savedTimestamp === "number") return item.savedTimestamp;
  if (item.submitted) {
    const parsedSubmitted = Date.parse(item.submitted);
    if (!Number.isNaN(parsedSubmitted)) return parsedSubmitted;
  }
  const fallbackDate = item.issueDate || item.startDate || item.validityDate;
  if (fallbackDate) {
    const parsed = Date.parse(fallbackDate);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallbackIndex;
};

const resolveSortValue = (item, key) => {
  if (!item) return null;
  if (key === "receivedTimestamp") {
    return getSortTimestamp(item);
  }
  return item[key] ?? null;
};

const buildTimelineSteps = (status, submitted) => {
  const normalizedStatus = (status || "").toLowerCase();
  const currentIndex = statusFlow.indexOf(normalizedStatus);
  return modalSteps.map((step, index) => {
    const state =
      currentIndex === -1
        ? "pending"
        : currentIndex > index
          ? "done"
          : currentIndex === index
            ? "current"
            : "pending";
    const description =
      step.key === "pendiente" && submitted
        ? `Recibido ${submitted}`
        : step.description;
    return { ...step, state, description };
  });
};

const inputClasses =
  "w-full rounded-2xl border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-900 dark:focus:border-slate-500 dark:focus:ring-slate-800";

const historyStatusTone = {
  Validado: "bg-emerald-100 text-emerald-700",
  Observacion: "bg-amber-100 text-amber-700",
  Rechazado: "bg-rose-100 text-rose-700",
  "En Revision": "bg-slate-200 text-slate-700",
};

const getCurrentTimestamp = () =>
  new Date().toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function MedicalValidation({ isDark, onToggleTheme }) {
  const auth = useContext(AuthContext);
  const reviewerName =
    auth?.user?.fullName ||
    auth?.user?.roleLabel ||
    auth?.roleLabel ||
    "Equipo Medico";
  const [filters, setFilters] = useState({
    search: "",
    status: "todos",
    priority: "todas",
  });
  const [dynamicValidations, setDynamicValidations] = useState(() =>
    readValidationQueue()
  );
  const [staticValidations, setStaticValidations] = useState(baseValidations);
  const [sortConfig, setSortConfig] = useState({
    key: "receivedTimestamp",
    direction: "desc",
  });

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (field) => (value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () =>
    setFilters({ search: "", status: "todos", priority: "todas" });
  const toggleDateSort = () =>
    setSortConfig((prev) => {
      const isSameKey = prev.key === "receivedTimestamp";
      const nextDirection =
        isSameKey && prev.direction === "desc" ? "asc" : "desc";
      return { key: "receivedTimestamp", direction: nextDirection };
    });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleUpdate = () => {
      setDynamicValidations(readValidationQueue());
      setTableUpdatedAt(getCurrentTimestamp());
    };
    window.addEventListener(
      MEDICAL_VALIDATIONS_UPDATED_EVENT,
      handleUpdate
    );
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(
        MEDICAL_VALIDATIONS_UPDATED_EVENT,
        handleUpdate
      );
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const combinedValidations = useMemo(() => {
    const merged = [...dynamicValidations, ...staticValidations];
    return merged
      .map((entry, index) => ({
        entry,
        sortStamp: getSortTimestamp(entry, merged.length - index),
      }))
      .sort((a, b) => b.sortStamp - a.sortStamp)
      .map((item) => item.entry);
  }, [dynamicValidations, staticValidations]);

  const isDynamicReference = (reference) =>
    dynamicValidations.some((item) => item.reference === reference);

  const persistUpdatedEntry = (entry) => {
    if (!entry?.reference) return;
    if (isDynamicReference(entry.reference)) {
      setDynamicValidations((prev) => {
        const filtered = prev.filter((item) => item.reference !== entry.reference);
        return [...filtered, entry];
      });
      upsertValidationEntry(entry);
    } else {
      setStaticValidations((prev) =>
        prev.map((item) =>
          item.reference === entry.reference ? entry : item
        )
      );
    }
    setTableUpdatedAt(getCurrentTimestamp());
  };

  const filteredValidations = useMemo(() => {
    const filtered = combinedValidations.filter((item) => {
      const searchTerm = filters.search.trim().toLowerCase();
      const matchesSearch =
        !searchTerm ||
        item.reference.toLowerCase().includes(searchTerm) ||
        item.employee.toLowerCase().includes(searchTerm);

      const matchesStatus =
        filters.status === "todos" ||
        normalizeStatusValue(item.status) === filters.status.toLowerCase();

      const matchesPriority =
        filters.priority === "todas" ||
        item.priority.toLowerCase() === filters.priority.toLowerCase();

      return matchesSearch && matchesStatus && matchesPriority;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aValue = resolveSortValue(a, sortConfig.key);
      const bValue = resolveSortValue(b, sortConfig.key);

      if (aValue === bValue) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      const comparison =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [combinedValidations, filters, sortConfig]);

  const computedStats = useMemo(() => {
    const pendingCount = filteredValidations.filter(
      (item) => item.status === "Pendiente"
    ).length;
    const revisionCount = filteredValidations.filter(
      (item) => item.status === "En Revision"
    ).length;
    const validatedCount = filteredValidations.filter(
      (item) => item.status === "Validado"
    ).length;
    const todayCount = filteredValidations.filter((item) => item.isToday).length;

    return [
      {
        title: "Pendientes",
        value: pendingCount,
        badge: pendingCount ? "Urgente" : "Sin casos",
        badgeTone: "bg-rose-500",
        description: "Requieren validacion",
        icon: ClockIcon,
      },
      {
        title: "En revision",
        value: revisionCount,
        badge: revisionCount ? "Analisis" : "Sin casos",
        badgeTone: "bg-gray-500",
        description: "Revision adicional",
        icon: AlertIcon,
      },
      {
        title: "Hoy",
        value: todayCount,
        badge: todayCount ? "Nuevos" : "Sin nuevos",
        badgeTone: "bg-yellow-600",
        description: "Certificados recibidos",
        icon: CalendarIcon,
      },
      {
        title: "Validados",
        value: validatedCount,
        badge: validatedCount ? "Completo" : "Pendiente",
        badgeTone: "bg-slate-900 text-white",
        description: "Esta semana",
        icon: CheckIcon,
      },
    ];
  }, [filteredValidations]);

  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState("details");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [riskScoreInput, setRiskScoreInput] = useState(null);
  const [riskScoreError, setRiskScoreError] = useState(false);
  const [decisionLocked, setDecisionLocked] = useState(false);
  const [isEditingDecision, setIsEditingDecision] = useState(true);
  const [planDraft, setPlanDraft] = useState(() => createEmptyPlanDraft());
  const [planTemplateDraft, setPlanTemplateDraft] = useState(() =>
    draftForRiskLevel("Media"),
  );

  const applyPlanTemplate = () => {
    if (!isEditingDecision) return;
    setPlanDraft({ ...planTemplateDraft });
  };

  const clearPlanDraft = () => {
    if (!isEditingDecision) return;
    setPlanDraft(createEmptyPlanDraft());
  };
  const [historyModal, setHistoryModal] = useState({
    isOpen: false,
    employee: "",
    employeeId: "",
    records: [],
  });
  const riskScoreDetails = useMemo(() => {
    if (riskScoreInput == null) return null;
    return mapScoreToRisk(riskScoreInput);
  }, [riskScoreInput]);
  const [tableUpdatedAt, setTableUpdatedAt] = useState(getCurrentTimestamp());
  const [historyManagerOpen, setHistoryManagerOpen] = useState(false);
  const [historyImportText, setHistoryImportText] = useState("");
  const [historyImportFeedback, setHistoryImportFeedback] = useState("");
  const [decisionFeedback, setDecisionFeedback] = useState({
    visible: false,
    message: "",
    tone: "bg-slate-900 text-white",
  });

  const handleValidationAction = (actionType) => {
    if (!selectedCertificate) return;
    if (actionRequiresNotes(actionType) && !reviewNotes.trim()) return;
    if (actionType === "approve" && (riskScoreInput == null || Number.isNaN(riskScoreInput))) {
      setRiskScoreError(true);
      return;
    }
    const actionConfig = validationActions[actionType];
    if (!actionConfig) return;

    const timestamp = new Date().toLocaleString("es-AR");
    const trimmedNotes = reviewNotes.trim();
    const baseNotes =
      selectedCertificate.notes &&
      selectedCertificate.notes !== "Sin comentarios adicionales registrados."
        ? selectedCertificate.notes
        : "";
    const decisionNote = trimmedNotes
      ? `${actionConfig.status} (${timestamp}): ${trimmedNotes}`
      : "";
    const combinedNotes = [baseNotes, decisionNote]
      .filter(Boolean)
      .join(baseNotes ? " | " : "");
    const finalNotes =
      combinedNotes || "Sin comentarios adicionales registrados.";

    const manualRisk = riskScoreInput != null ? mapScoreToRisk(riskScoreInput) : null;
    const fallbackRisk = calculateRiskScore({
      absenceType: selectedCertificate.certificateType || selectedCertificate.absenceType,
      detailedReason: selectedCertificate.detailedReason,
    });
    const riskDetails = manualRisk || fallbackRisk;

    const planPayload = draftTextToPlan(planDraft);
    const hasPlan =
      planPayload.actions.length ||
      planPayload.followUps.length ||
      planPayload.recommendations.length;

    const updatedEntry = {
      ...selectedCertificate,
      status: actionConfig.status,
      badgeTone: actionConfig.badgeTone,
      notes: finalNotes,
      lastDecisionAt: timestamp,
      riskScoreValue: riskDetails.score,
      riskScore: `${riskDetails.score.toFixed(1)} / 10`,
      riskLevel: riskDetails.level,
      riskDescriptor: riskDetails.descriptor,
    };

    if (hasPlan) {
      updatedEntry.planActions = planPayload.actions;
      updatedEntry.planFollowUps = planPayload.followUps;
      updatedEntry.planRecommendations = planPayload.recommendations;
    } else if (
      selectedCertificate.planActions ||
      selectedCertificate.planFollowUps ||
      selectedCertificate.planRecommendations
    ) {
      updatedEntry.planActions = selectedCertificate.planActions || [];
      updatedEntry.planFollowUps =
        selectedCertificate.planFollowUps || [];
      updatedEntry.planRecommendations =
        selectedCertificate.planRecommendations || [];
    }

    persistUpdatedEntry(updatedEntry);
    const employeeKey = updatedEntry.employeeId || updatedEntry.employee;
    if (hasPlan) {
      saveEmployeePlan(employeeKey, planPayload);
    }
    const entryRisk =
      updatedEntry.riskScoreValue != null
        ? {
            score: updatedEntry.riskScoreValue,
            level: updatedEntry.riskLevel,
            descriptor: updatedEntry.riskDescriptor,
          }
        : fallbackRisk;
    const historyRecord = {
      id: updatedEntry.reference || `${updatedEntry.employeeId}-${Date.now()}`,
      reference: updatedEntry.reference,
      title:
        updatedEntry.certificateType ||
        updatedEntry.absenceType ||
        "Certificado medico cargado en sistema",
      employee: updatedEntry.employee || selectedCertificate.employee,
      sector: updatedEntry.sector || selectedCertificate.sector,
      issued: updatedEntry.issueDate || updatedEntry.startDate || timestamp,
      days:
        updatedEntry.absenceDays ??
        getDaysBetween(updatedEntry.startDate, updatedEntry.endDate) ??
        "-",
      status: actionConfig.status,
      document:
        updatedEntry.certificateFileMeta?.name ||
        `${updatedEntry.reference}.pdf`,
      documentMeta: updatedEntry.certificateFileMeta || null,
      institution: updatedEntry.institution || "No indicado",
      notes: trimmedNotes || `Resultado: ${actionConfig.status}`,
      reviewer: reviewerName,
      detailedReason:
        selectedCertificate.detailedReason ||
        updatedEntry.detailedReason ||
        selectedCertificate.notes ||
        updatedEntry.notes ||
        "",
      riskScore: entryRisk.score,
      riskLevel: entryRisk.level,
      riskDescriptor: entryRisk.descriptor,
      planActions: updatedEntry.planActions || [],
      planFollowUps: updatedEntry.planFollowUps || [],
      planRecommendations: updatedEntry.planRecommendations || [],
    };
    appendEmployeeHistory(employeeKey, historyRecord);
    enqueueOperation(
      "validateCertificate",
      {
        reference: updatedEntry.reference,
        employeeId: updatedEntry.employeeId,
        status: actionConfig.status,
        reviewer: reviewerName,
        notes: trimmedNotes,
        risk: entryRisk,
      },
      {
        user: auth?.user?.email || reviewerName,
        entityId: updatedEntry.reference,
      },
    );
    processOperationQueue();
    setReviewNotes("");
    setRiskScoreError(false);
    closeModal();
    setDecisionFeedback({
      visible: true,
      message:
        actionType === "approve"
          ? "Certificado validado correctamente."
          : actionType === "reject"
            ? "Certificado rechazado."
            : "Certificado marcado para revision.",
      tone:
        actionType === "approve"
          ? "bg-emerald-600 text-white"
          : actionType === "reject"
            ? "bg-rose-600 text-white"
            : "bg-amber-500 text-slate-900",
    });
  };

  const openModal = (row) => {
    setSelectedCertificate(row);
    setActiveModalTab("details");
    const normalizedStatus = (row.status || "").toLowerCase();
    const finalDecision = normalizedStatus === "validado" || normalizedStatus === "rechazado";
    setDecisionLocked(finalDecision);
    setIsEditingDecision(!finalDecision);
    const rawNote =
      row.notes &&
      row.notes !== "Sin comentarios adicionales registrados."
        ? row.notes
        : "";
    setReviewNotes(finalDecision ? rawNote : "");
    const existingScore =
      extractScoreValue(row.riskScoreValue) ??
      extractScoreValue(row.riskScore);
    const riskAssessment = calculateRiskScore({
      absenceType: row.certificateType || row.absenceType,
      detailedReason: row.detailedReason || row.notes,
    });
    const suggestedScore = existingScore ?? riskAssessment.score;
    setRiskScoreInput(suggestedScore);
    setRiskScoreError(false);
    const employeeKey = row.employeeId || row.employee;
    const certificatePlan =
      row.planActions ||
      row.planFollowUps ||
      row.planRecommendations
        ? {
            actions: row.planActions || [],
            followUps: row.planFollowUps || [],
            recommendations: row.planRecommendations || [],
          }
        : null;
    const storedPlan = readEmployeePlan(employeeKey) || certificatePlan;
    const templateDraft = draftForRiskLevel(riskAssessment.level);
    setPlanTemplateDraft({ ...templateDraft });
    setPlanDraft(
      storedPlan ? planToDraftText(storedPlan) : templateDraft,
    );
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedCertificate(null);
    setReviewNotes("");
    setRiskScoreInput(null);
    setRiskScoreError(false);
    setDecisionLocked(false);
    setIsEditingDecision(true);
    setPlanDraft(createEmptyPlanDraft());
    setPlanTemplateDraft(draftForRiskLevel("Media"));
  };

  const openHistoryModal = (row) => {
    const employeeKey = row.employeeId || row.employee;
    const records = readEmployeeHistory(employeeKey);
    setHistoryModal({
      isOpen: true,
      employee: row.employee,
      employeeId: row.employeeId || "Sin ID",
      records,
    });
  };

  const closeHistoryModal = () =>
    setHistoryModal({ isOpen: false, employee: "", employeeId: "", records: [] });
  const closeHistoryManager = () => {
    setHistoryManagerOpen(false);
    setHistoryImportText("");
    setHistoryImportFeedback("");
  };

  const handleHistoryTextImport = () => {
    try {
      if (!historyImportText.trim()) {
        throw new Error("Ingresa un JSON valido para importar.");
      }
      const result = importHistoryFromJSON(historyImportText);
      setHistoryImportFeedback(
        `Importacion exitosa: ${result.records} registros / ${result.employees} empleados.`
      );
      setHistoryImportText("");
    } catch (error) {
      setHistoryImportFeedback(error.message || "No se pudo importar el historial.");
    }
  };

  const handleHistoryFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const result = isCsv
        ? importHistoryFromCSV(content)
        : importHistoryFromJSON(content);
      setHistoryImportFeedback(
        `Archivo procesado: ${result.records} registros agregados.`
      );
    } catch (error) {
      setHistoryImportFeedback(error.message || "No se pudo procesar el archivo.");
    } finally {
      event.target.value = "";
    }
  };

  const handleHistoryExport = () => {
    try {
      const data = exportHistoryAsJSON();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "historial_medico.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setHistoryImportFeedback(
        error.message || "No se pudo exportar el historial."
      );
    }
  };

  const modalStartDateRaw =
    selectedCertificate?.issueDate || selectedCertificate?.startDate || "";
  const modalEndDateRaw =
    selectedCertificate?.validityDate || selectedCertificate?.endDate || "";
  const modalAbsenceDays =
    selectedCertificate?.absenceDays ??
    getDaysBetween(modalStartDateRaw, modalEndDateRaw);
  const modalStartDate = formatDateValue(modalStartDateRaw);
  const modalEndDate = formatDateValue(modalEndDateRaw);
  const modalReason =
    selectedCertificate?.detailedReason ||
    selectedCertificate?.reason ||
    "Sin diagnostico informado.";
  const modalNotes =
    selectedCertificate?.notes ||
    "Sin comentarios adicionales registrados.";
  const modalInstitution =
    selectedCertificate?.institution ||
    selectedCertificate?.certificateInstitution ||
    "No indicado";
  const modalTimelineSteps = selectedCertificate
    ? buildTimelineSteps(selectedCertificate.status, selectedCertificate.submitted)
    : modalSteps;
  const modalPosition = selectedCertificate?.position || "No indicado";
  const modalBadgeTone =
    selectedCertificate?.badgeTone ||
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  const timelineStateStyles = {
    done: "bg-emerald-500 text-white",
    current: "bg-amber-500 text-white",
    pending:
      "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  const modalDocumentMeta = selectedCertificate?.certificateFileMeta || null;
  const modalDocumentName =
    modalDocumentMeta?.name || "Documento no disponible";
  const modalDocumentSize =
    modalDocumentMeta?.size || "Sin tamaño registrado";
  const modalDocumentUploaded =
    modalDocumentMeta?.uploadedAt ||
    selectedCertificate?.submitted ||
    "Sin fecha registrada";
  const modalDocumentUrl = modalDocumentMeta?.previewUrl || "";
  const modalDocumentType = modalDocumentMeta?.type || "";
  const modalDocumentIsImage = modalDocumentType.startsWith("image/");
  const modalDocumentIsPdf = modalDocumentType === "application/pdf";
  const hasDocumentPreview = Boolean(modalDocumentUrl);
  const statusBadgeMap = {
    revision: "bg-amber-100 text-amber-700",
    reject: "bg-rose-100 text-rose-700",
    approve: "bg-emerald-100 text-emerald-700",
  };
  const validationActions = {
    review: { status: "En Revision", badgeTone: statusBadgeMap.revision },
    reject: { status: "Rechazado", badgeTone: statusBadgeMap.reject },
    approve: { status: "Validado", badgeTone: statusBadgeMap.approve },
  };
  const actionRequiresNotes = (type) => type === "reject" || type === "approve";
  const isDecisionDisabled = !reviewNotes.trim();
  const isApproveDisabled =
    !isEditingDecision ||
    isDecisionDisabled ||
    riskScoreInput == null ||
    Number.isNaN(riskScoreInput);
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredValidations.length / PAGE_SIZE),
  );
  const paginatedValidations = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredValidations.slice(start, start + PAGE_SIZE);
  }, [filteredValidations, currentPage]);
  const handlePageChange = (direction) => {
    setCurrentPage((prev) => {
      if (direction === "prev") {
        return Math.max(1, prev - 1);
      }
      if (direction === "next") {
        return Math.min(totalPages, prev + 1);
      }
      return prev;
    });
  };

  useEffect(() => {
    if (!decisionFeedback.visible) return undefined;
    const timeout = setTimeout(
      () => setDecisionFeedback((prev) => ({ ...prev, visible: false })),
      3500,
    );
    return () => clearTimeout(timeout);
  }, [decisionFeedback.visible]);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-blue-100 to-slate-200 transition dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {decisionFeedback.visible ? (
        <div className="fixed left-1/2 top-6 z-50 w-full max-w-md -translate-x-1/2 px-4">
          <div
            className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg shadow-black/20 ${decisionFeedback.tone}`}
          >
            <span>{decisionFeedback.message}</span>
            <button
              type="button"
              onClick={() =>
                setDecisionFeedback((prev) => ({ ...prev, visible: false }))
              }
              className="rounded-full border border-white/40 px-2 py-0.5 text-xs text-white/80 hover:text-white"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}
      <AppHeader
        active="Validacion Medica"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="flex w-full flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-10 lg:gap-8">
        <section className="rounded-3xl bg-white/80 px-6 py-6 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
                <StethoscopeIcon className="h-5 w-5 text-slate-900 dark:text-slate-300" />
                Validacion Medica
              </h1>
              <p className="text-sm text-slate-900 dark:text-slate-200">
                Panel de validacion profesional de certificados medicos
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 dark:border-slate-700">
                <StethoscopeIcon className="h-3 w-3 text-slate-900 dark:text-slate-300" />
              </span>
              {reviewerName}
            </div>
          </header>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {computedStats.map((card) => (
              <article
                key={card.title}
                className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-slate-600 shadow-inner dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300"
              >
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-300">
                  {card.title}
                  <card.icon />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {card.value}
                  </p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${card.badgeTone}`}
                  >
                    {card.badge}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-900 dark:text-slate-200">
                  {card.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white/90 px-6 py-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/40">
          <header className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <FilterIcon />
            Filtros y Busqueda
          </header>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-200">
                Buscar
              </label>
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleInputChange}
                placeholder="Empleado o numero de referencia..."
                className={inputClasses}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-200">
                Estado
              </label>
              <DropdownSelect
                name="status"
                value={filters.status}
                onChange={handleSelectChange("status")}
                options={statusOptions}
                placeholder="Todos los estados"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-200">
                Prioridad
              </label>
              <DropdownSelect
                name="priority"
                value={filters.priority}
                onChange={handleSelectChange("priority")}
                options={priorityOptions}
                placeholder="Todas las prioridades"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
            >
              Limpiar filtros
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white/90 px-6 py-6 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Certificados en proceso
              </h2>
              <p className="text-sm text-slate-900 dark:text-slate-200">
                Lista de certificados asignados al equipo medico
              </p>
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-800 dark:text-slate-300 sm:flex-row sm:items-center sm:gap-3">
              <p>Actualizado: {tableUpdatedAt}</p>
              <button
                type="button"
                onClick={() => setHistoryManagerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
              >
                <HistoryIcon className="h-3.5 w-3.5" />
                Gestionar historicos
              </button>
            </div>
          </header>

          <div className="mt-5 w-full overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
            <table className="min-w-[820px] lg:min-w-full divide-y divide-slate-100 text-left text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-800 dark:bg-slate-900/40 dark:text-slate-100">
                <tr>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3">Empleado</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 hidden md:table-cell">Prioridad</th>
                  <th className="px-4 py-3 hidden sm:table-cell">
                    <button
                      type="button"
                      onClick={toggleDateSort}
                      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-800 transition hover:text-slate-900 dark:text-slate-100 dark:hover:text-white"
                      aria-label="Ordenar por fecha de recepcion"
                    >
                      Recibido
                      <SortIndicator
                        active={sortConfig.key === "receivedTimestamp"}
                        direction={sortConfig.direction}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-xs text-slate-900 dark:divide-slate-800 dark:bg-transparent dark:text-slate-200">
                {paginatedValidations.length ? (
                  paginatedValidations.map((row) => (
                      <tr key={row.reference}>
                    <td className="px-4 py-4 font-semibold text-slate-900 dark:text-white">
                      {row.reference}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {row.employee}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 sm:hidden">
                        {row.priority && (
                          <span className="mr-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                            {row.priority}
                          </span>
                        )}
                        <span>{row.submitted}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${row.badgeTone}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">{row.priority}</td>
                    <td className="px-4 py-4 hidden sm:table-cell">{row.submitted}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openModal(row)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                        >
                          <EyeIcon className="h-3.5 w-3.5" />
                          Revisar
                        </button>
                        <button
                          type="button"
                          onClick={() => openHistoryModal(row)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                        >
                          <HistoryIcon className="h-3.5 w-3.5" />
                          Historial
                        </button>
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
                      Aun no hay certificados en proceso. Carga una ausencia o ejecuta{" "}
                      <code>window.runDemoSeed()</code> para ver datos de demostracion.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col items-start justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:flex-row sm:items-center">
            <p>
              Pagina {currentPage} de {totalPages} ·{" "}
              {filteredValidations.length} certificados
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePageChange("prev")}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition enabled:hover:border-slate-300 enabled:hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:enabled:hover:border-slate-600"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => handlePageChange("next")}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition enabled:hover:border-slate-300 enabled:hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:enabled:hover:border-slate-600"
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      </main>
      {isModalOpen && selectedCertificate ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-3 py-6 sm:px-6">
          <div className="relative w-full max-w-4xl rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-950 sm:p-6">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-3 top-3 rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 sm:right-4 sm:top-4"
              aria-label="Cerrar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 5.22a.75.75 0 011.06 0L10 8.94l3.72-3.72a.75.75 0 111.06 1.06L11.06 10l3.72 3.72a.75.75 0 11-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 11-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <div className="flex flex-col gap-3 pr-2 sm:flex-row sm:items-start sm:justify-between sm:pr-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Validacion de Certificado Medico
                </p>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">
                  Revision profesional del certificado de{" "}
                  {selectedCertificate.employee}
                </h3>
              </div>
            </div>
            <div className="mt-4 flex rounded-full border border-slate-200 bg-slate-100 p-1 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {["details", "documento", "validacion"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveModalTab(tab)}
                  className={`flex-1 rounded-full px-3 py-1.5 ${
                    activeModalTab === tab
                      ? "bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-white"
                      : ""
                  }`}
                >
                  {tab === "details"
                    ? "Detalles"
                    : tab === "documento"
                      ? "Documento"
                      : "Validacion"}
                </button>
              ))}
            </div>
            {activeModalTab === "details" ? (
              <div className="mt-6 space-y-5">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 px-5 py-6 shadow-inner dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 lg:col-span-2">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Referencia
                        </p>
                        <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                          {selectedCertificate.reference}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Ultima actualizacion:{" "}
                          {selectedCertificate.submitted || "No registrada"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${modalBadgeTone}`}
                        >
                          {selectedCertificate.status || "Sin estado"}
                        </span>
                        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          Prioridad {selectedCertificate.priority || "N/D"}
                        </span>
                      </div>
                    </div>
                    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Tipo de certificado
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {selectedCertificate.certificateType || "No indicado"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Institucion medica
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {modalInstitution}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Empleado
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {selectedCertificate.employee}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Recepcion
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {selectedCertificate.submitted || "No registrada"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      Linea de seguimiento
                    </p>
                    <ol className="mt-5 space-y-4">
                      {modalTimelineSteps.map((step) => (
                        <li key={step.key} className="flex gap-3">
                          <span
                            className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold ${timelineStateStyles[step.state]}`}
                          >
                            {step.state === "done" ? (
                              <CheckIcon className="h-4 w-4 text-white" />
                            ) : step.state === "current" ? (
                              <ClockIcon className="h-4 w-4 text-white" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                            )}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {step.title}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {step.description}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      Resumen del empleado
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-800 dark:text-white">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Nombre completo
                        </p>
                        <p className="font-semibold">{selectedCertificate.employee}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            ID empleado
                          </p>
                          <p className="font-semibold">
                            {selectedCertificate.employeeId || "No indicado"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Departamento
                          </p>
                          <p className="font-semibold">
                            {selectedCertificate.sector || "No indicado"}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Puesto
                        </p>
                        <p className="font-semibold">{modalPosition}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      Periodo y prioridad
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-800 dark:text-white">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Fecha inicio
                          </p>
                          <p className="font-semibold">
                            {modalStartDate || "No indicado"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Fecha fin
                          </p>
                          <p className="font-semibold">
                            {modalEndDate || "No indicado"}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Dias solicitados
                          </p>
                          <p className="font-semibold">
                            {modalAbsenceDays
                              ? `${modalAbsenceDays} ${
                                  modalAbsenceDays === 1 ? "dia" : "dias"
                                }`
                              : "No definido"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Prioridad
                          </p>
                          <p className="font-semibold">
                            {selectedCertificate.priority || "No definida"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      Diagnostico e institucion
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-800 dark:text-white">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Grupo de patologia
                        </p>
                        <p className="font-semibold">
                          {formatPathologyCategory(selectedCertificate.pathologyCategory)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Codigo CIE-10
                        </p>
                        <p className="font-semibold">
                          {selectedCertificate.cieCode || "No indicado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Tipo de certificado
                        </p>
                        <p className="font-semibold">
                          {selectedCertificate.certificateType || "No indicado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Institucion medica
                        </p>
                        <p className="font-semibold">
                          {selectedCertificate.institution || "No indicada"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Diagnostico
                        </p>
                        <p className="font-semibold">{modalReason}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Notas internas
                  </p>
                  <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {modalNotes}
                  </p>
                </div>
              </div>
            ) : activeModalTab === "documento" ? (
              <div className="mt-6 space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                        Documento original
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Archivo:{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {modalDocumentName}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Cargado: {modalDocumentUploaded}
                    </p>
                  </div>
                  <div className="mt-5 rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
                    {hasDocumentPreview ? (
                      modalDocumentIsImage ? (
                        <img
                          src={modalDocumentUrl}
                          alt={`Certificado ${modalDocumentName}`}
                          className="mx-auto max-h-[420px] w-full rounded-2xl object-contain"
                        />
                      ) : modalDocumentIsPdf ? (
                        <iframe
                          src={modalDocumentUrl}
                          title={`Certificado ${modalDocumentName}`}
                          className="mx-auto h-[420px] w-full rounded-2xl bg-white"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                          <DocumentPreviewIcon className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                          <p>
                            El archivo no cuenta con una vista previa compatible, pero puedes descargarlo.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                        <DocumentPreviewIcon className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                        <p>
                          Adjunta un certificado digital para habilitar la vista previa.
                        </p>
                      </div>
                    )}
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                      <a
                        href={hasDocumentPreview ? modalDocumentUrl : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white ${
                          hasDocumentPreview ? "" : "pointer-events-none opacity-50"
                        }`}
                      >
                        <EyeIcon className="h-4 w-4" />
                        Ver completo
                      </a>
                      <a
                        href={hasDocumentPreview ? modalDocumentUrl : undefined}
                        download={
                          modalDocumentMeta?.name ||
                          selectedCertificate?.reference ||
                          "certificado.pdf"
                        }
                        className={`inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white ${
                          hasDocumentPreview ? "" : "pointer-events-none opacity-50"
                        }`}
                      >
                        <DownloadIcon className="h-4 w-4" />
                        Descargar
                      </a>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Peso del archivo
                    </p>
                    <p className="mt-2 text-base text-slate-900 dark:text-white">
                      {modalDocumentSize}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Tipo de certificado
                    </p>
                    <p className="mt-2 text-base text-slate-900 dark:text-white">
                      {selectedCertificate?.certificateType || "No indicado"}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Institucion emisora
                    </p>
                    <p className="mt-2 text-base text-slate-900 dark:text-white">
                      {modalInstitution}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Validacion profesional
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Evaluacion medica del certificado presentado
                    </p>
                  </div>
                  <div className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        Puntaje de riesgo (1-10)
                      </p>
                      {riskScoreDetails ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${riskScoreDetails.badgeTone}`}
                        >
                          Riesgo {riskScoreDetails.level}
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.1"
                      value={riskScoreInput ?? 5}
                      onChange={(event) => {
                        setRiskScoreInput(parseFloat(event.target.value));
                        setRiskScoreError(false);
                      }}
                      disabled={!isEditingDecision}
                      className={`w-full accent-rose-600 ${
                        !isEditingDecision ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    />
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
                      <span>
                        Puntaje seleccionado:{" "}
                        {riskScoreInput != null
                          ? riskScoreInput.toFixed(1)
                          : "--"}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Este valor se reflejara en el panel.
                      </span>
                    </div>
                    {riskScoreError ? (
                      <p className="text-xs text-rose-500">
                        Asigna un puntaje antes de aprobar el certificado.
                      </p>
                    ) : null}
                    {decisionLocked && !isEditingDecision ? (
                      <div className="rounded-2xl bg-slate-100/70 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                        Este certificado ya fue validado. Selecciona "Editar dictamen" para actualizar la evaluacion.
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Diagnostico detallado de la ausencia
                    </p>
                    <p className="mt-3 whitespace-pre-line">
                      {selectedCertificate?.detailedReason ||
                        selectedCertificate?.reason ||
                        "Sin descripcion disponible."}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Plan preventivo sugerido
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Registra las acciones inmediatas, seguimientos y recomendaciones. Una por linea.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={applyPlanTemplate}
                        disabled={!isEditingDecision}
                        className={`rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 ${
                          !isEditingDecision ? "cursor-not-allowed opacity-60" : ""
                        }`}
                      >
                        Usar sugerencia
                      </button>
                      <button
                        type="button"
                        onClick={clearPlanDraft}
                        disabled={!isEditingDecision}
                        className={`rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 ${
                          !isEditingDecision ? "cursor-not-allowed opacity-60" : ""
                        }`}
                      >
                        Limpiar plan
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                          Acciones inmediatas
                        </label>
                        <textarea
                          rows="3"
                          value={planDraft.actions}
                          onChange={(event) =>
                            setPlanDraft((prev) => ({
                              ...prev,
                              actions: event.target.value,
                            }))
                          }
                          disabled={!isEditingDecision}
                          placeholder="Ej: Reposo activo 2 semanas"
                          className={`w-full rounded-2xl border border-slate-300 bg-white/60 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-500 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800 ${
                            !isEditingDecision ? "cursor-not-allowed opacity-60" : ""
                          }`}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                          Seguimientos programados
                        </label>
                        <textarea
                          rows="3"
                          value={planDraft.followUps}
                          onChange={(event) =>
                            setPlanDraft((prev) => ({
                              ...prev,
                              followUps: event.target.value,
                            }))
                          }
                          disabled={!isEditingDecision}
                          placeholder="Ej: Control traumatologico 12/05"
                          className={`w-full rounded-2xl border border-slate-300 bg-white/60 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-500 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800 ${
                            !isEditingDecision ? "cursor-not-allowed opacity-60" : ""
                          }`}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                          Recomendaciones del medico
                        </label>
                        <textarea
                          rows="3"
                          value={planDraft.recommendations}
                          onChange={(event) =>
                            setPlanDraft((prev) => ({
                              ...prev,
                              recommendations: event.target.value,
                            }))
                          }
                          disabled={!isEditingDecision}
                          placeholder="Ej: Pausas activas cada 2 horas"
                          className={`w-full rounded-2xl border border-slate-300 bg-white/60 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-500 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800 ${
                            !isEditingDecision ? "cursor-not-allowed opacity-60" : ""
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      Observaciones medicas
                    </label>
                    <textarea
                      rows="4"
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      placeholder="Ingrese sus observaciones profesionales sobre la validez del certificado, diagnostico, tratamiento recomendado, etc."
                      disabled={!isEditingDecision}
                      className={`w-full rounded-2xl border border-slate-300 bg-white/60 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-500 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800 ${
                        !isEditingDecision ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    />
                  </div>
                  {decisionLocked && !isEditingDecision ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingDecision(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
                    >
                      Habilitar edicion del dictamen
                    </button>
                  ) : null}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleValidationAction("review")}
                      disabled={!isEditingDecision}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
                    >
                      <AlertIcon className="h-4 w-4" />
                      Marcar para revision
                    </button>
                    <button
                      type="button"
                      onClick={() => handleValidationAction("reject")}
                      disabled={!isEditingDecision || isDecisionDisabled}
                      className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-400/30 transition hover:bg-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 text-white">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-3 w-3"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 11-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleValidationAction("approve")}
                      disabled={isApproveDisabled}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 text-white">
                        <CheckIcon className="h-3.5 w-3.5 text-white" />
                      </span>
                      Aprobar
                    </button>
                  </div>
                </div>
              </div>
            )}
         </div>
        </div>
      ) : null}
      {historyModal.isOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-3 py-6 sm:px-6">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-950 sm:p-6">
            <div className="flex items-start justify-between gap-4 pr-2 sm:pr-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Historial medico
                </p>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Certificados previos de {historyModal.employee}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  ID empleado: {historyModal.employeeId || "Sin ID"}
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
                    d="M5.22 5.22a.75.75 0 011.06 0L10 8.94l3.72-3.72a.75.75 0 111.06 1.06L11.06 10l3.72 3.72a.75.75 0 11-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 11-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 010-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {historyModal.records.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
                  Aun no se registran antecedentes para este colaborador.
                </div>
              ) : null}
              {historyModal.records.map((record, index) => {
                const issuedLabel =
                  formatDateValue(record.issued) || record.issued || "No indicado";
                const diagnosis =
                  record.detailedReason ||
                  record.reason ||
                  record.notes ||
                  "Sin diagnostico registrado";
                return (
                  <div
                    key={record.id}
                    className="relative rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {record.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Referencia {record.id} - Documento {record.document}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          historyStatusTone[record.status] ||
                          "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {record.status}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Emision
                        </p>
                        <p>{issuedLabel}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Dias otorgados
                        </p>
                        <p>
                          {record.days} {record.days === "-" ? "" : "dias"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Institucion
                        </p>
                        <p>{record.institution}</p>
                      </div>
                      <div className="sm:col-span-2 md:col-span-3 lg:col-span-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Diagnostico
                        </p>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {diagnosis}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Riesgo asignado
                        </p>
                        {record.riskScore != null ? (
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {Number(record.riskScore).toFixed(1)} / 10
                            </p>
                            {record.riskLevel ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                  riskLevelToneMap[record.riskLevel] ??
                                  "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {record.riskLevel}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-slate-500 dark:text-slate-400">
                            Sin asignar
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                      {record.notes}
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {record.reviewer
                        ? `Evaluado por ${record.reviewer}`
                        : "Evaluador no registrado"}
                    </p>
                    {index < historyModal.records.length - 1 ? (
                      <div className="absolute -bottom-4 left-10 h-8 w-px bg-slate-200 dark:bg-slate-700" />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeHistoryModal}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {historyManagerOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-3 py-6 sm:px-6">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Gestion de historicos
                </p>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Importar o exportar antecedentes
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Usa JSON o CSV para acelerar tus pruebas masivas.
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistoryManager}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300"
                aria-label="Cerrar gestor de historicos"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 5.22a.75.75 0 011.06 0L10 8.94l3.72-3.72a.75.75 0 111.06 1.06L11.06 10l3.72 3.72a.75.75 0 11-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 11-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 010-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Importar desde JSON
                </p>
                <textarea
                  rows={6}
                  value={historyImportText}
                  onChange={(event) => setHistoryImportText(event.target.value)}
                  placeholder='{"EMP-001": [{"id": "...", "title": "..."}]}'
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                />
                <button
                  type="button"
                  onClick={handleHistoryTextImport}
                  className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  Importar JSON
                </button>
              </div>
              <div className="space-y-4 rounded-3xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Importar desde archivo
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Acepta .json o .csv (columnas: employeeId, title, status, etc.)
                  </p>
                  <label className="mt-3 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-300">
                    Seleccionar archivo
                    <input
                      type="file"
                      accept=".json,.csv"
                      onChange={handleHistoryFileImport}
                      className="sr-only"
                    />
                  </label>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                  Exporta lo cargado hasta el momento para compartirlo con tu equipo.
                </div>
                <button
                  type="button"
                  onClick={handleHistoryExport}
                  className="w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
                >
                  Exportar historial (JSON)
                </button>
              </div>
            </div>
            {historyImportFeedback ? (
              <p className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                {historyImportFeedback}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClockIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 1.5" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

function AlertIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16h.01" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.173 4.322a1 1 0 011.654 0l7.036 10.38A1 1 0 0119.036 16H4.964a1 1 0 01-.827-1.298l7.036-10.38z"
      />
    </svg>
  );
}

function CalendarIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 4v3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16" />
      <rect x="4" y="6" width="16" height="14" rx="2" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4 10-10" />
    </svg>
  );
}

function FilterIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16M6 12h12M10 18h4"
      />
    </svg>
  );
}

function StethoscopeIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 4v6a4 4 0 008 0V4"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 14v4a4 4 0 004 4h1a3 3 0 003-3v-1a3 3 0 00-3-3h-1"
      />
    </svg>
  );
}

function DocumentPreviewIcon({ className = "h-10 w-10 text-slate-500" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3h7l4 4v13a1 1 0 01-1 1H8a2 2 0 01-2-2V5a2 2 0 012-2z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v4h4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6M9 15h6" />
    </svg>
  );
}

function EyeIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6z"
      />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  );
}

function DownloadIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11l4 4 4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16" />
    </svg>
  );
}

function HistoryIcon({ className = "h-4 w-4 text-slate-900" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l2.5 1.5M19.5 12a7.5 7.5 0 11-2.195-5.303"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 5v4h-4" />
    </svg>
  );
}

function SortIndicator({ active, direction }) {
  return (
    <span
      className={`text-[10px] font-bold ${
        active ? "text-slate-900 dark:text-white" : "text-slate-400"
      }`}
    >
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

export default MedicalValidation;
