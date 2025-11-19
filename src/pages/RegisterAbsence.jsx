import { useState, useEffect, useContext, useMemo } from "react";
import AppHeader from "../components/AppHeader.jsx";
import DropdownSelect from "../components/DropdownSelect.jsx";
import DatePicker from "../components/DatePicker.jsx";
import { mockEmployees } from "../data/mockEmployees.js";
import {
  readValidationQueue,
  upsertValidationEntry,
} from "../utils/validationStorage.js";
import {
  readDrafts,
  saveDraft,
  removeDraft,
} from "../utils/draftStorage.js";
import {
  ABSENCE_DRAFTS_UPDATED_EVENT,
  MEDICAL_VALIDATIONS_UPDATED_EVENT,
} from "../utils/storageKeys.js";
import {
  enqueueOperation,
  processQueue as processOperationQueue,
} from "../utils/operationQueue.js";
import { readEmployeeHistory } from "../utils/historyStorage.js";
import AuthContext from "../context/AuthContext.jsx";

const employees = mockEmployees;
const sectionIcons = {
  employee: (
    <svg
      className="h-5 w-5 text-slate-700 dark:text-slate-200"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 20.25a8.25 8.25 0 0115 0"
      />
    </svg>
  ),
  period: (
    <svg
      className="h-5 w-5 text-slate-700 dark:text-slate-200"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M4.5 9.75h15"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 6h12a1.5 1.5 0 011.5 1.5v10.5A1.5 1.5 0 0118 19.5H6a1.5 1.5 0 01-1.5-1.5V7.5A1.5 1.5 0 016 6z"
      />
    </svg>
  ),
  reason: (
    <svg
      className="h-5 w-5 text-slate-700 dark:text-slate-200"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6-3h6m-6 6h6M6.75 3h7.5a1.5 1.5 0 011.5 1.5V21L10.5 18l-5.25 3V4.5A1.5 1.5 0 016.75 3z"
      />
    </svg>
  ),
  status: (
    <svg
      className="h-5 w-5 text-slate-700 dark:text-slate-200"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3.75h10.5a1.5 1.5 0 011.5 1.5v14.25L12 17.25l-6.75 2.25V5.25a1.5 1.5 0 011.5-1.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 11.25l2.25 2.25 4.5-4.5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h6" />
    </svg>
  ),
  certificate: (
    <svg
      className="h-5 w-5 text-slate-700 dark:text-slate-200"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4h4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17h6" />
    </svg>
  ),
};

function SectionCard({ title, description, icon, children }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-300/30 ring-1 ring-slate-100 transition dark:bg-slate-950/80 dark:shadow-black/30 dark:ring-slate-900/50">
      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

const absenceTypes = [
  { value: "enfermedad", label: "Certificado Medico - Enfermedad" },
  { value: "accidente", label: "Certificado Medico - Accidente" },
  { value: "licencia-personal", label: "Licencia Personal" },
  { value: "vacaciones", label: "Vacaciones" },
  { value: "permiso-especial", label: "Permiso Especial" },
];

const resolveAbsenceTypeLabel = (value) =>
  absenceTypes.find((item) => item.value === value)?.label || "Ausencia";

const generateDraftId = () =>
  `DRAFT-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

const resolveSortTimestamp = (entry, fallbackIndex = 0) => {
  if (!entry) return fallbackIndex;
  if (typeof entry.receivedTimestamp === "number") return entry.receivedTimestamp;
  if (typeof entry.savedTimestamp === "number") return entry.savedTimestamp;
  const candidates = [
    entry.lastDecisionAt,
    entry.submitted,
    entry.issueDate,
    entry.startDate,
    entry.validityDate,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallbackIndex;
};

const approvalOptions = [
  { value: "si", label: "Si" },
  { value: "no", label: "No" },
];

const ACCEPTED_CERTIFICATE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];
const MAX_CERTIFICATE_FILE_SIZE = 5 * 1024 * 1024;

const inputClasses =
  "w-full rounded-2xl border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-500 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800 dark:disabled:bg-slate-900/80 dark:disabled:text-slate-500";

const textareaClasses =
  "w-full rounded-2xl border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-500 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800";

const generateCertificateReference = () => {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 12);
  const random = Math.floor(Math.random() * 900 + 100);
  return `CM-${timestamp}-${random}`;
};

const createInitialFormValues = () => ({
  employeeId: "",
  employeeName: "",
  sector: "",
  position: "",
  absenceType: "",
  startDate: "",
  endDate: "",
  detailedReason: "",
  requiresApproval: "si",
});

function RegisterAbsence({ isDark, onToggleTheme }) {
  const auth = useContext(AuthContext);
  const currentUserName = auth?.user?.fullName || "Usuario no identificado";
  const [formValues, setFormValues] = useState(createInitialFormValues);
  const [absenceDays, setAbsenceDays] = useState(null);
  const [certificateInstitution, setCertificateInstitution] = useState("");
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificateReference, setCertificateReference] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [submissionFeedback, setSubmissionFeedback] = useState("");
  const [toastState, setToastState] = useState({
    visible: false,
    message: "",
    tone: "bg-slate-900 text-white",
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(
    new Date().toLocaleString("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  );
  const [drafts, setDrafts] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [validationQueue, setValidationQueue] = useState([]);
  const [activeRevisionEntry, setActiveRevisionEntry] = useState(null);
  const [overlapWarnings, setOverlapWarnings] = useState([]);
  const overlapRanges = useMemo(() => {
    if (!formValues.employeeId) return [];
    const ranges = [];
    const currentReference = activeRevisionEntry?.reference || certificateReference;
    const currentDraftId = activeDraftId;
    (validationQueue || []).forEach((item) => {
      if (item.employeeId !== formValues.employeeId) return;
      if (currentReference && item.reference === currentReference) return;
      if (item.startDate && item.endDate) {
        ranges.push({ start: item.startDate, end: item.endDate, source: "validations" });
      }
    });
    (drafts || []).forEach((draft) => {
      if (draft.formValues?.employeeId !== formValues.employeeId) return;
      if (currentDraftId && draft.draftId === currentDraftId) return;
      const dStart = draft.formValues?.startDate;
      const dEnd = draft.formValues?.endDate;
      if (dStart && dEnd) {
        ranges.push({ start: dStart, end: dEnd, source: "drafts" });
      }
    });
    const historyEntries = readEmployeeHistory(formValues.employeeId) || [];
    historyEntries.forEach((record) => {
      if (record.issued) {
        if (currentReference && record.reference === currentReference) return;
        const endDate =
          record.endDate ||
          (record.days
            ? new Date(new Date(record.issued).getTime() + (Number(record.days) - 1) * 86400000)
                .toISOString()
                .slice(0, 10)
            : record.issued);
        ranges.push({ start: record.issued, end: endDate, source: "history" });
      }
    });
    return ranges;
  }, [
    formValues.employeeId,
    validationQueue,
    drafts,
    activeRevisionEntry?.reference,
    activeDraftId,
    certificateReference,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncDrafts = () => {
      setDrafts(readDrafts());
    };
    syncDrafts();
    window.addEventListener(ABSENCE_DRAFTS_UPDATED_EVENT, syncDrafts);
    window.addEventListener("storage", syncDrafts);
    return () => {
      window.removeEventListener(ABSENCE_DRAFTS_UPDATED_EVENT, syncDrafts);
      window.removeEventListener("storage", syncDrafts);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncQueue = () => {
      setValidationQueue(readValidationQueue());
    };
    syncQueue();
    window.addEventListener(MEDICAL_VALIDATIONS_UPDATED_EVENT, syncQueue);
    window.addEventListener("storage", syncQueue);
    return () => {
      window.removeEventListener(MEDICAL_VALIDATIONS_UPDATED_EVENT, syncQueue);
      window.removeEventListener("storage", syncQueue);
    };
  }, []);

  useEffect(() => {
    if (!formValues.employeeId || !formValues.startDate || !formValues.endDate) {
      setOverlapWarnings([]);
      return;
    }
    const employeeKey = formValues.employeeId;
    const conflicts = [];
    const currentReference = activeRevisionEntry?.reference || certificateReference;
    const currentDraftId = activeDraftId;

    (validationQueue || []).forEach((item) => {
      if (item.employeeId !== employeeKey) return;
      if (currentReference && item.reference === currentReference) return;
      if (rangesOverlap(formValues.startDate, formValues.endDate, item.startDate, item.endDate)) {
        const s = formatDateEs(item.startDate);
        const e = formatDateEs(item.endDate);
        conflicts.push(
          `Solicitud existente (${item.reference || "sin ref"}) del ${s} al ${e}.`,
        );
      }
    });

    (drafts || []).forEach((draft) => {
      if (draft.formValues?.employeeId !== employeeKey) return;
      if (currentDraftId && draft.draftId === currentDraftId) return;
      const dStart = draft.formValues?.startDate;
      const dEnd = draft.formValues?.endDate;
      if (rangesOverlap(formValues.startDate, formValues.endDate, dStart, dEnd)) {
        const s = formatDateEs(dStart);
        const e = formatDateEs(dEnd);
        conflicts.push(
          `Borrador registrado del ${s || "sin inicio"} al ${e || "sin fin"}.`,
        );
      }
    });

    const historyEntries = readEmployeeHistory(employeeKey) || [];
    historyEntries.forEach((record) => {
      if (currentReference && record.reference === currentReference) return;
      const endRange =
        record.endDate ||
        (record.days
          ? new Date(new Date(record.issued).getTime() + (Number(record.days) - 1) * 86400000)
              .toISOString()
              .slice(0, 10)
          : record.issued);
      if (rangesOverlap(formValues.startDate, formValues.endDate, record.issued, endRange)) {
        const issued = formatDateEs(record.issued);
        const endFmt = formatDateEs(endRange);
        conflicts.push(
          `Histórico (${record.reference || record.title}) emitido el ${issued}${endFmt ? ` (hasta ${endFmt})` : ""}.`,
        );
      }
    });

    setOverlapWarnings(conflicts);
  }, [
    formValues.employeeId,
    formValues.startDate,
    formValues.endDate,
    validationQueue,
    drafts,
    activeRevisionEntry?.reference,
    activeDraftId,
    certificateReference,
  ]);

  const resetForm = () => {
    setFormValues(createInitialFormValues());
    setAbsenceDays(null);
    setCertificateInstitution("");
    setCertificateFile(null);
    setCertificateReference(null);
    setFormErrors({});
    setActiveDraftId(null);
    setActiveRevisionEntry(null);
  };

  const handleDraftLoad = (draft) => {
    if (!draft) return;
    setFormValues({
      ...createInitialFormValues(),
      ...(draft.formValues || {}),
    });
    setAbsenceDays(draft.absenceDays ?? null);
    setCertificateInstitution(draft.certificateInstitution ?? "");
    setCertificateFile(draft.certificateFile ?? null);
    setCertificateReference(draft.certificateReference ?? null);
    setActiveDraftId(draft.draftId);
    setActiveRevisionEntry(null);
    setSubmissionFeedback(
      `Borrador ${draft.draftId} cargado para continuar con la edicion.`,
    );
    setToastState({
      visible: true,
      message: `Reanudaste el borrador ${draft.draftId}.`,
      tone: "bg-indigo-600 text-white",
    });
    if (draft.savedAt) {
      setLastUpdatedAt(draft.savedAt);
    }
  };

  const handleDraftDelete = (draftId) => {
    if (!draftId) return;
    removeDraft(draftId);
    setDrafts(readDrafts());
    if (activeDraftId === draftId) {
      resetForm();
    }
    setToastState({
      visible: true,
      message: "Borrador eliminado correctamente.",
      tone: "bg-rose-600 text-white",
    });
  };
  const loadReviewEntry = (entry) => {
    if (!entry) return;
    const startDate = entry.startDate || entry.issueDate || "";
    const endDate = entry.endDate || entry.validityDate || "";
    const parsedStart = Date.parse(startDate);
    const parsedEnd = Date.parse(endDate);
    const calculatedDays =
      entry.absenceDays ??
      (!Number.isNaN(parsedStart) &&
      !Number.isNaN(parsedEnd) &&
      parsedEnd >= parsedStart
        ? Math.floor((parsedEnd - parsedStart) / (1000 * 60 * 60 * 24)) + 1
        : null);
    setFormValues({
      ...createInitialFormValues(),
      employeeId: entry.employeeId || "",
      employeeName: entry.employee || "",
      sector: entry.sector || "",
      position: entry.position || "",
      absenceType: entry.absenceType || "",
      startDate,
      endDate,
      detailedReason: entry.detailedReason || "",
      requiresApproval: entry.requiresApproval || "si",
    });
    setAbsenceDays(calculatedDays);
    setCertificateInstitution(entry.institution || "");
    setCertificateFile(null);
    setCertificateReference(entry.reference || null);
    setActiveRevisionEntry(entry);
    setActiveDraftId(null);
    setSubmissionFeedback(
      `Atendiendo revision ${entry.reference}. Ajusta los datos y reenvia para aprobacion.`,
    );
    setToastState({
      visible: true,
      message: `Revisión ${entry.reference} cargada para su correccion.`,
      tone: "bg-amber-600 text-white",
    });
    if (entry.lastDecisionAt) {
      setLastUpdatedAt(entry.lastDecisionAt);
    }
  };

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const confirmCancellation = () => {
    resetForm();
    setSubmissionFeedback("");
    setToastState({
      visible: true,
      message: "Carga descartada. El formulario se limpio.",
      tone: "bg-slate-700 text-white",
    });
    setShowCancelModal(false);
  };

  const closeCancelModal = () => setShowCancelModal(false);

  const clearError = (field) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSelectChange = (field) => (newValue) => {
    clearError(field);
    setSubmissionFeedback("");
    setFormValues((prev) => {
      const next = { ...prev, [field]: newValue };
      if (
        field === "absenceType" &&
        !["enfermedad", "accidente"].includes(newValue)
      ) {
        setCertificateInstitution("");
        setCertificateFile(null);
      }
      return next;
    });
  };

  const handleEmployeeNameChange = (event) => {
    const newName = event.target.value;
    clearError("employeeName");
    setSubmissionFeedback("");
    setFormValues((prev) => ({ ...prev, employeeName: newName }));

    const matchedEmployee = employees.find(
      (employee) =>
        employee.fullName.toLowerCase() === newName.trim().toLowerCase()
    );

    if (matchedEmployee) {
      setFormValues((prev) => ({
        ...prev,
        employeeName: matchedEmployee.fullName,
        employeeId: matchedEmployee.employeeId,
        sector: matchedEmployee.sector,
        position: matchedEmployee.position,
      }));
    } else {
      setFormValues((prev) => ({
        ...prev,
        employeeId: "",
        sector: "",
        position: "",
      }));
    }
  };

const handleEmployeeNameBlur = () => {
    const matchedEmployee = employees.find(
      (employee) =>
        employee.fullName.toLowerCase() ===
        formValues.employeeName.trim().toLowerCase()
    );

    if (!matchedEmployee) {
      setFormValues((prev) => ({
        ...prev,
        employeeId: "",
        sector: "",
        position: "",
      }));
    }
  };

const parseLocalDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  const aS = parseLocalDate(aStart)?.getTime();
  const aE = parseLocalDate(aEnd)?.getTime();
  const bS = parseLocalDate(bStart)?.getTime();
  const bE = parseLocalDate(bEnd)?.getTime();
  if ([aS, aE, bS, bE].some((v) => Number.isNaN(v))) return false;
  return aS <= bE && bS <= aE;
};

const formatDateEs = (value) => {
  if (!value) return "";
  const d = parseLocalDate(value);
  if (!d) return value;
  const day = `${d.getDate()}`.padStart(2, "0");
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
};

const updateAbsenceDays = (start, end) => {
    if (start && end) {
      const aS = parseLocalDate(start)?.getTime();
      const aE = parseLocalDate(end)?.getTime();
      if (!aS || !aE || Number.isNaN(aS) || Number.isNaN(aE) || aE < aS) {
        setAbsenceDays(null);
        return;
      }
      const diffMs = aE - aS;
      if (isNaN(diffMs) || diffMs < 0) {
        setAbsenceDays(null);
        return;
      }
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
      setAbsenceDays(days);
    } else {
      setAbsenceDays(null);
    }
  };

const handleDateSelect = (field, value) => {
  clearError(field);
  setSubmissionFeedback("");
  setFormValues((prev) => {
    const next = { ...prev, [field]: value };
    updateAbsenceDays(next.startDate, next.endDate);
    return next;
  });
};

const handleCertificateUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    clearError("certificateFile");
    setSubmissionFeedback("");

    if (!ACCEPTED_CERTIFICATE_TYPES.includes(file.type)) {
      setFormErrors((prev) => ({
        ...prev,
        certificateFile: "Formato no soportado. Usa PDF o imagen (JPG/PNG).",
      }));
      event.target.value = "";
      return;
    }

    if (file.size > MAX_CERTIFICATE_FILE_SIZE) {
      setFormErrors((prev) => ({
        ...prev,
        certificateFile: "El archivo supera el limite de 5 MB permitido.",
      }));
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCertificateFile({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        uploadedAt: new Date().toLocaleString(),
        type: file.type,
        previewUrl: reader.result,
      });
    };
    reader.onerror = () => {
      setFormErrors((prev) => ({
        ...prev,
        certificateFile: "No se pudo leer el archivo. Intenta nuevamente.",
      }));
      setCertificateFile(null);
    };
    reader.readAsDataURL(file);
  };

const clearCertificateFile = () => {
    clearError("certificateFile");
    clearError("certificateInstitution");
    setCertificateFile(null);
    setCertificateInstitution("");
    setCertificateReference(null);
  };

  const requiresMedicalCertificate = ["enfermedad", "accidente"].includes(
    formValues.absenceType
  );

  useEffect(() => {
    if (requiresMedicalCertificate && certificateFile && !certificateReference) {
      setCertificateReference(generateCertificateReference());
    }
  }, [requiresMedicalCertificate, certificateFile, certificateReference]);

  useEffect(() => {
    if (!requiresMedicalCertificate) {
      setCertificateReference(null);
      setCertificateInstitution("");
      setCertificateFile(null);
    }
  }, [requiresMedicalCertificate]);

  useEffect(() => {
    if (!certificateFile && certificateReference) {
      setCertificateReference(null);
    }
  }, [certificateFile, certificateReference]);

  const handleDetailedReasonChange = (event) => {
    const value = event.target.value;
    clearError("detailedReason");
    setSubmissionFeedback("");
    setFormValues((prev) => ({ ...prev, detailedReason: value }));
  };

  const handleCertificateInstitutionChange = (event) => {
    clearError("certificateInstitution");
    setSubmissionFeedback("");
    setCertificateInstitution(event.target.value);
  };

  const validateForm = (mode = "approve") => {
    const errors = {};
    if (!formValues.employeeName.trim()) {
      errors.employeeName = "Nombre completo obligatorio.";
    }
    if (!formValues.startDate) {
      errors.startDate = "Selecciona la fecha de inicio.";
    }
    if (!formValues.endDate) {
      errors.endDate = "Selecciona la fecha de fin.";
    } else if (
      formValues.startDate &&
      Date.parse(formValues.endDate) < Date.parse(formValues.startDate)
    ) {
      errors.endDate = "La fecha de fin debe ser posterior al inicio.";
    }
    if (!formValues.absenceType) {
      errors.absenceType = "Selecciona un tipo de ausencia.";
    }
    if (!formValues.detailedReason.trim()) {
      errors.detailedReason = "Describe el diagnostico detallado.";
    }
    if (requiresMedicalCertificate && mode !== "draft") {
      if (!certificateInstitution.trim()) {
        errors.certificateInstitution =
          "La institucion medica es obligatoria.";
      }
      const hasCertificateFile =
        Boolean(certificateFile) ||
        Boolean(activeRevisionEntry?.certificateFileMeta);
      if (!hasCertificateFile) {
        errors.certificateFile = "Adjunta el certificado digital.";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const persistValidationEntry = () => {
    if (!requiresMedicalCertificate) return;
    const receivedTimestamp = Date.now();
    const submissionTimestamp = new Date(receivedTimestamp).toLocaleString(
      "es-AR",
    );
    const reference =
      activeRevisionEntry?.reference ||
      certificateReference ||
      generateCertificateReference();
    if (!activeRevisionEntry && !certificateReference) {
      setCertificateReference(reference);
    }
    const previousNotes =
      activeRevisionEntry?.notes &&
      activeRevisionEntry.notes !==
        "Sin comentarios adicionales registrados."
        ? activeRevisionEntry.notes
        : activeRevisionEntry?.notes
          ? activeRevisionEntry.notes
          : "";
    const correctionNote = activeRevisionEntry
      ? `Correccion enviada por ${currentUserName} el ${submissionTimestamp}.`
      : `Carga realizada desde Registro de Ausencias por ${currentUserName} el ${submissionTimestamp}.`;
    const combinedNotes = [previousNotes, correctionNote]
      .filter(Boolean)
      .join(previousNotes ? " | " : "");
    const certificateMeta =
      certificateFile || activeRevisionEntry?.certificateFileMeta || null;
    const entry = {
      ...(activeRevisionEntry || {}),
      reference,
      employee: formValues.employeeName,
      employeeId: formValues.employeeId,
      position: formValues.position,
      status: "Pendiente",
      priority:
        formValues.absenceType === "accidente"
          ? "Alta"
          : formValues.absenceType === "enfermedad"
            ? "Media"
            : "Baja",
      submitted: submissionTimestamp,
      badgeTone:
        formValues.absenceType === "accidente"
          ? "bg-rose-100 text-rose-700"
          : "bg-amber-100 text-amber-700",
      isToday: true,
      receivedTimestamp,
      sector: formValues.sector,
      detailedReason: formValues.detailedReason,
      startDate: formValues.startDate,
      endDate: formValues.endDate,
      absenceDays,
      absenceType: formValues.absenceType,
      certificateType: resolveAbsenceTypeLabel(formValues.absenceType),
      institution: certificateInstitution,
      issueDate: formValues.startDate,
      validityDate: formValues.endDate,
      notes:
        combinedNotes || "Sin comentarios adicionales registrados.",
      certificateFileMeta: certificateMeta,
    };
    upsertValidationEntry(entry);
    setValidationQueue(readValidationQueue());
    return { reference, submissionTimestamp, wasRevision: Boolean(activeRevisionEntry) };
  };

  const handleSubmit = (action) => {
    setSubmissionFeedback("");
    const validationMode = action === "draft" ? "draft" : "approve";
    if (overlapWarnings.length) {
      setToastState({
        visible: true,
        message: "Hay solapamiento con otras solicitudes/certificados de este empleado.",
        tone: "bg-amber-600 text-white",
      });
      return;
    }
    if (!validateForm(validationMode)) {
      setToastState({
        visible: true,
        message: "Completa los campos obligatorios antes de continuar.",
        tone: "bg-rose-600 text-white",
      });
      return;
    }
    const isRevisionFlow = Boolean(activeRevisionEntry);

    if (action === "draft") {
      const savedTimestamp = Date.now();
      const savedAt = new Date(savedTimestamp).toLocaleString("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const draftPayload = {
        draftId: activeDraftId ?? generateDraftId(),
        savedAt,
        savedTimestamp,
        savedBy: currentUserName,
        formValues: { ...formValues },
        certificateInstitution,
        certificateFile,
        certificateReference,
        requiresMedicalCertificate,
        absenceDays,
        absenceLabel: resolveAbsenceTypeLabel(formValues.absenceType),
        periodLabel:
          formValues.startDate && formValues.endDate
            ? `${formValues.startDate} → ${formValues.endDate}`
            : "Fechas pendientes",
      };
      saveDraft(draftPayload);
      setDrafts(readDrafts());
      enqueueOperation(
        "saveDraft",
        {
          draftId: draftPayload.draftId,
          employeeId: draftPayload.formValues.employeeId,
          employeeName: draftPayload.formValues.employeeName,
          absenceType: draftPayload.formValues.absenceType,
          payload: draftPayload,
        },
        { user: auth?.user?.email || currentUserName },
      );
      processOperationQueue();
      setToastState({
        visible: true,
        message: "Borrador guardado para completar mas tarde.",
        tone: "bg-slate-900 text-white",
      });
      setSubmissionFeedback("Borrador guardado correctamente.");
      setLastUpdatedAt(savedAt);
      resetForm();
      return;
    }

    const draftIdToClear = activeDraftId;
    const result = persistValidationEntry();
    if (result?.reference) {
      enqueueOperation(
        "submitCertificate",
        {
          reference: result.reference,
          employeeId: formValues.employeeId,
          employeeName: formValues.employeeName,
          absenceType: formValues.absenceType,
          detailedReason: formValues.detailedReason,
          submittedAt: result.submissionTimestamp,
          wasRevision: isRevisionFlow,
        },
        {
          user: auth?.user?.email || currentUserName,
          entityId: result.reference,
        },
      );
      processOperationQueue();
    }
    if (draftIdToClear) {
      removeDraft(draftIdToClear);
      setDrafts(readDrafts());
    }
    resetForm();
    if (result?.reference) {
      setSubmissionFeedback(
        `Solicitud enviada para aprobacion. Ref: ${result.reference}`,
      );
      setToastState({
        visible: true,
        message: isRevisionFlow
          ? `Correccion del certificado ${result.reference} enviada al equipo medico.`
          : `Certificado ${result.reference} enviado para revision.`,
        tone: "bg-emerald-600 text-white",
      });
      setLastUpdatedAt(result.submissionTimestamp);
      return;
    }
    setToastState({
      visible: true,
      message: "Solicitud enviada para revision.",
      tone: "bg-emerald-600 text-white",
    });
    setLastUpdatedAt(
      new Date().toLocaleString("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
    setSubmissionFeedback("Solicitud enviada para aprobacion.");
  };

  useEffect(() => {
    if (!toastState.visible) return undefined;
    const timeout = setTimeout(
      () => setToastState((prev) => ({ ...prev, visible: false })),
      3500,
    );
    return () => clearTimeout(timeout);
  }, [toastState.visible]);

  const sortedDrafts = useMemo(() => {
    if (!Array.isArray(drafts)) return [];
    return [...drafts].sort(
      (a, b) => (b?.savedTimestamp ?? 0) - (a?.savedTimestamp ?? 0),
    );
  }, [drafts]);

  const reviewEntries = useMemo(() => {
    if (!Array.isArray(validationQueue)) return [];
    const filtered = validationQueue.filter((item) => {
      const normalizedStatus = (item.status || "").toLowerCase();
      return (
        normalizedStatus === "en revision" ||
        normalizedStatus === "en revisión" ||
        normalizedStatus.includes("revision")
      );
    });
    return filtered
      .map((entry, index) => ({
        entry,
        sortStamp: resolveSortTimestamp(entry, filtered.length - index),
      }))
      .sort((a, b) => b.sortStamp - a.sortStamp)
      .map((item) => item.entry);
  }, [validationQueue]);

  const inputWithError = (field) =>
    `${inputClasses} ${
      formErrors[field] ? "border-rose-500 focus:border-rose-600" : ""
    }`;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-blue-100 to-slate-200 transition dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {toastState.visible ? (
        <div className="fixed left-1/2 top-6 z-50 w-full max-w-md -translate-x-1/2 px-4">
          <div
            className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg shadow-black/20 ${toastState.tone}`}
          >
            <span>{toastState.message}</span>
            <button
              type="button"
              onClick={() =>
                setToastState((prev) => ({ ...prev, visible: false }))
              }
              className="rounded-full border border-white/40 px-2 py-0.5 text-xs text-white/80 hover:text-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
      {showCancelModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-hidden="true"
            onClick={closeCancelModal}
          />
          <div className="relative z-50 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/30 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 1.591a1 1 0 0 1 1.198 0l6.5 4.875a1 1 0 0 1 .401.8V17a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V7.266a1 1 0 0 1 .401-.8l6.5-4.875Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  ¿Deseas descartar esta carga?
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Si descartas, perderas toda la informacion cargada en el formulario. Esta accion no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCancelModal}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={confirmCancellation}
                className="inline-flex items-center justify-center rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
              >
                Descartar y limpiar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <AppHeader
        active="Registro Ausencia"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="flex w-full flex-col gap-6 px-4 pb-16 pt-10 sm:px-6 lg:px-10 lg:gap-8">
        <section className="mx-auto w-full max-w-6xl space-y-6 rounded-[36px] bg-white/80 p-6 shadow-2xl shadow-slate-300/60 ring-1 ring-white/80 backdrop-blur-md transition dark:bg-slate-950/70 dark:shadow-black/50 dark:ring-slate-900/60 sm:p-8 lg:p-10">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Formulario para registrar y gestionar ausencias de empleados
              </p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  Registro de Ausencia
                </h1>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                    Ultima edicion: {lastUpdatedAt}
                  </span>
                  <span className="hidden rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700 md:block">
                    Estado: Borrador
                  </span>
                </div>
              </div>
            </div>

            {activeRevisionEntry ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">
                      Atendiendo revision {activeRevisionEntry.reference}
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-200/80">
                      Ajusta los datos solicitados por el equipo medico y vuelve a enviar para validacion.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-400 hover:text-amber-900 dark:border-amber-500/50 dark:bg-transparent dark:text-amber-200 dark:hover:border-amber-400"
                  >
                    Cancelar revision
                  </button>
                </div>
              </div>
            ) : null}

            <SectionCard
              title="Datos del Empleado"
              description="Informacion basica del empleado que registra la ausencia"
              icon={sectionIcons.employee}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                    ID Empleado
                  </label>
                  <input
                    type="text"
                    value={formValues.employeeId}
                    readOnly
                    className={`${inputClasses} bg-slate-50 dark:bg-slate-900/80`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={formValues.employeeName}
                    onChange={handleEmployeeNameChange}
                    onBlur={handleEmployeeNameBlur}
                    list="employee-options"
                    placeholder="Escribe el nombre del empleado..."
                    className={inputWithError("employeeName")}
                  />
                  {formErrors.employeeName ? (
                    <p className="text-xs text-rose-500">
                      {formErrors.employeeName}
                    </p>
                  ) : null}
                  <datalist id="employee-options">
                    {employees.map((employee) => (
                      <option
                        key={employee.employeeId}
                        value={employee.fullName}
                      />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Sector
                  </label>
                  <input
                    type="text"
                    value={formValues.sector}
                    readOnly
                    placeholder="Sector asignado"
                    className={`${inputClasses} bg-slate-50 dark:bg-slate-900/80`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Posicion
                  </label>
                  <input
                    type="text"
                    value={formValues.position}
                    readOnly
                    placeholder="Posicion asignada"
                    className={`${inputClasses} bg-slate-50 dark:bg-slate-900/80`}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Periodo de Ausencia"
              description="Fechas y duracion de la ausencia solicitada"
              icon={sectionIcons.period}
            >
              {overlapWarnings.length ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                  <p className="flex items-start gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.8"
                      stroke="currentColor"
                      className="h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-200"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v4m0 4h.01M12 4.5c-4.142 0-7.5 3.358-7.5 7.5s3.358 7.5 7.5 7.5 7.5-3.358 7.5-7.5-3.358-7.5-7.5-7.5z"
                      />
                    </svg>
                    <span className="space-y-1">
                      <span className="block">Fechas solapadas con otros registros:</span>
                      {overlapWarnings.map((text, idx) => (
                        <span key={idx} className="block text-xs font-normal text-amber-700/80 dark:text-amber-100/80">
                          • {text}
                        </span>
                      ))}
                      <span className="block text-xs font-semibold text-amber-800 dark:text-amber-100">
                        Ajusta el periodo para evitar certificados duplicados.
                      </span>
                    </span>
                  </p>
                </div>
              ) : null}
              <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-slate-900/40 dark:text-slate-200">
                Duracion estimada:{" "}
                {absenceDays
                  ? `${absenceDays} ${absenceDays === 1 ? "dia" : "dias"}`
                  : "Selecciona fechas para calcular"}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <DatePicker
                    id="start-date"
                    label="Fecha de Inicio"
                    value={formValues.startDate}
                    onChange={(v) => handleDateSelect("startDate", v)}
                    error={Boolean(formErrors.startDate)}
                    markedRanges={overlapRanges}
                  />
                  {formErrors.startDate ? (
                    <p className="text-xs text-rose-500">
                      {formErrors.startDate}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <DatePicker
                    id="end-date"
                    label="Fecha de Fin"
                    value={formValues.endDate}
                    onChange={(v) => handleDateSelect("endDate", v)}
                    error={Boolean(formErrors.endDate)}
                    markedRanges={overlapRanges}
                  />
                  {formErrors.endDate ? (
                    <p className="text-xs text-rose-500">
                      {formErrors.endDate}
                    </p>
                  ) : null}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Diagnostico de la Ausencia"
              description="Especifica el tipo y diagnostico de la ausencia"
              icon={sectionIcons.reason}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tipo de Ausencia
                  </label>
                  <DropdownSelect
                    name="absenceType"
                    value={formValues.absenceType}
                    onChange={handleSelectChange("absenceType")}
                    options={absenceTypes}
                    placeholder="Seleccionar tipo de ausencia"
                  />
                  {formErrors.absenceType ? (
                    <p className="text-xs text-rose-500">
                      {formErrors.absenceType}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Diagnostico Detallado
                  </label>
                  <textarea
                    rows="3"
                    placeholder="Describe el diagnostico de la ausencia..."
                    value={formValues.detailedReason}
                    onChange={handleDetailedReasonChange}
                    className={`${textareaClasses} ${
                      formErrors.detailedReason ? "border-rose-500" : ""
                    }`}
                  />
                  {formErrors.detailedReason ? (
                    <p className="text-xs text-rose-500">
                      {formErrors.detailedReason}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Observaciones Adicionales
                  </label>
                  <textarea
                    rows="2"
                    placeholder="Informacion adicional relevante..."
                    className={textareaClasses}
                  />
                </div>
              </div>
            </SectionCard>

            {requiresMedicalCertificate ? (
              <SectionCard
                title="Certificado Medico Digital"
                description="Adjunta el soporte oficial emitido por la institucion medica"
                icon={sectionIcons.certificate}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    {certificateReference ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                        Referencia generada: {certificateReference}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        La referencia se generara automaticamente al adjuntar el
                        certificado.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Institucion medica
                    </label>
                    <input
                      type="text"
                      value={certificateInstitution}
                      onChange={handleCertificateInstitutionChange}
                      placeholder="Hospital / Clinica donde se emitio"
                      className={inputWithError("certificateInstitution")}
                    />
                    {formErrors.certificateInstitution ? (
                      <p className="text-xs text-rose-500">
                        {formErrors.certificateInstitution}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="medical-certificate-upload"
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      Certificado digital
                    </label>
                    <label
                      htmlFor="medical-certificate-upload"
                      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-400 bg-white px-4 py-3 text-sm text-slate-600 transition hover:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-8 w-8 text-slate-500 dark:text-slate-300"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16V4m0 0l-3.5 3.5M12 4l3.5 3.5M4.5 20h15a1.5 1.5 0 001.5-1.5V12a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 12v6.5A1.5 1.5 0 004.5 20z"
                        />
                      </svg>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-200">
                          Seleccionar archivo o arrastrar aqui
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          PDF, JPG o PNG - Max 5 MB
                        </p>
                      </div>
                    </label>
                    <input
                      id="medical-certificate-upload"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleCertificateUpload}
                    />
                    {certificateFile ? (
                      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold break-all">
                            {certificateFile.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Peso: {certificateFile.size} - Subido:{" "}
                            {certificateFile.uploadedAt}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearCertificateFile}
                          className="self-start rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 dark:border-rose-500/50 dark:text-rose-300 dark:hover:border-rose-400"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : null}
                    {formErrors.certificateFile ? (
                      <p className="text-xs text-rose-500">
                        {formErrors.certificateFile}
                      </p>
                    ) : null}
                  </div>
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Certificados en revision"
              description="Solicitudes que el equipo medico marco para ajustes"
              icon={sectionIcons.certificate}
            >
              {reviewEntries.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No hay certificados pendientes de revision por parte del equipo medico.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {reviewEntries.length} certificado(s) requieren seguimiento
                  </p>
                  {reviewEntries.map((item) => {
                    const latestNote = (() => {
                      if (!item.notes) return "Sin observaciones registradas.";
                      const parts = item.notes
                        .split("|")
                        .map((part) => part.trim())
                        .filter(Boolean);
                      return parts.length
                        ? parts[parts.length - 1]
                        : "Sin observaciones registradas.";
                    })();
                    const pendingSince =
                      item.lastDecisionAt || item.submitted || "Sin registro";
                    return (
                      <div
                        key={item.reference}
                        className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm transition dark:border-amber-500/30 dark:bg-amber-500/10"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900 dark:text-white">
                            {item.employee}
                          </p>
                          <span className="rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-200">
                            {item.reference}
                          </span>
                          <span className="rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                            {item.priority || "Prioridad no definida"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-200">
                          {latestNote}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>Revisar desde: {pendingSince}</span>
                          <span>Sector: {item.sector || "No indicado"}</span>
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => loadReviewEntry(item)}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-400 hover:text-amber-900 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200 dark:hover:border-amber-400"
                          >
                            Atender revision
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-4 w-4"
                            >
                              <path
                                fillRule="evenodd"
                                d="M3.25 10a.75.75 0 0 1 .75-.75h9.69L11.22 6.78a.75.75 0 0 1 1.06-1.06l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 0 1-1.06-1.06l2.47-2.47H4a.75.75 0 0 1-.75-.75Z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Estado y Acciones"
              description="Estado actual de la solicitud y acciones disponibles"
              icon={sectionIcons.status}
            >
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Estado actual
                    </label>
                    <input
                      type="text"
                      value="Borrador"
                      disabled
                      className={`${inputClasses} bg-slate-50 dark:bg-slate-900/80`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Requiere aprobacion?
                    </label>
                    <DropdownSelect
                      name="requiresApproval"
                      value={formValues.requiresApproval}
                      onChange={handleSelectChange("requiresApproval")}
                      options={approvalOptions}
                      placeholder="Seleccionar opcion"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleSubmit("draft")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3 w-3"
                      >
                        <path d="M4 3a2 2 0 0 0-2 2v10.5A1.5 1.5 0 0 0 3.5 17h13a1.5 1.5 0 0 0 1.5-1.5V8.414a2 2 0 0 0-.586-1.414l-3.414-3.414A2 2 0 0 0 12.586 3H4Zm6.5 1.5h2.086c.133 0 .26.053.354.146l2.414 2.414a.5.5 0 0 1 .146.354V6.5H10.5V4.5ZM5 9a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 9Zm0 3a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 5 12Z" />
                      </svg>
                    </span>
                    Guardar Borrador
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit("approve")}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-slate-400/30 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-white dark:text-slate-900 dark:shadow-slate-900/30 dark:hover:bg-slate-100"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3 w-3"
                      >
                        <path d="M2.94 2.94a1.5 1.5 0 0 1 1.527-.381l12.5 4.167a1.5 1.5 0 0 1 .125 2.831l-5.185 2.26-2.26 5.185a1.5 1.5 0 0 1-2.83-.125l-4.168-12.5a1.5 1.5 0 0 1 .291-1.437L2.94 2.94Z" />
                      </svg>
                    </span>
                    Enviar para Aprobacion
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3 w-3"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    Cancelar
                  </button>
                </div>
                {submissionFeedback ? (
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {submissionFeedback}
                  </p>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  Nota: Una vez enviada para aprobacion, no podras modificar la
                  solicitud. Asegurate de que toda la informacion sea correcta
                  antes de enviar.
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Borradores guardados"
              description="Solicitudes pendientes de completar o enviar"
              icon={sectionIcons.status}
            >
              {sortedDrafts.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No hay borradores guardados. Utiliza &quot;Guardar borrador&quot; para retomar una carga mas tarde.
                </p>
              ) : (
                <div className="space-y-3">
                  {sortedDrafts.map((draft) => {
                    const periodLabel =
                      draft.periodLabel ||
                      (draft.formValues?.startDate && draft.formValues?.endDate
                        ? `${draft.formValues.startDate} → ${draft.formValues.endDate}`
                        : "Fechas pendientes");
                    return (
                      <div
                        key={draft.draftId}
                        className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-600"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900 dark:text-white">
                            {draft.formValues?.employeeName || "Empleado sin asignar"}
                          </p>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                            {draft.absenceLabel || resolveAbsenceTypeLabel(draft.formValues?.absenceType)}
                          </span>
                          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            {draft.requiresMedicalCertificate ? "Requiere certificado" : "Borrador general"}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-4 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Periodo
                            </p>
                            <p className="font-semibold text-slate-800 dark:text-white">
                              {periodLabel}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Guardado
                            </p>
                            <p className="font-semibold text-slate-800 dark:text-white">
                              {draft.savedAt || "Sin registro"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Actualizado por
                            </p>
                            <p className="font-semibold text-slate-800 dark:text-white">
                              {draft.savedBy || draft.updatedBy || currentUserName}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleDraftLoad(draft)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
                          >
                            Reanudar borrador
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDraftDelete(draft.draftId)}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-400 hover:text-rose-700 dark:border-rose-600/40 dark:text-rose-300 dark:hover:border-rose-500"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        </section>
      </main>
    </div>
  );
}

export default RegisterAbsence;

