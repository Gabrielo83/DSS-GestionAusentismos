import { useState, useMemo } from "react";
import AppHeader from "../components/AppHeader.jsx";
import { mockEmployees } from "../data/mockEmployees.js";
import { pathologyCategories } from "../data/pathologyCategories.js";
import { readEmployeeHistory } from "../utils/historyStorage.js";
import { readValidationQueue } from "../utils/validationStorage.js";

const studyTemplates = [
  {
    type: "Chequeo clinico general",
    professional: "Dra. F. Suarez",
  },
  {
    type: "Evaluacion ergonomica",
    professional: "Lic. R. Molina",
  },
  {
    type: "Control cardiovascular",
    professional: "Dr. H. Martinez",
  },
];

const studyStatuses = ["Apto", "Observado", "Validado", "Pendiente"];

const buildMedicalFiles = (employees) =>
  employees.map((employee, index) => ({
    profile: {
      name: employee.fullName,
      id: employee.employeeId,
      medicalRecordId: employee.medicalRecordId,
      position: employee.position,
      department: employee.sector,
      seniority: employee.seniority,
      bloodType: employee.bloodType,
      phone: employee.phone,
      email: employee.email,
      avatar: employee.avatar,
    },
    studies: studyTemplates.map((template, templateIndex) => ({
      id: `EST-${employee.employeeId}-${templateIndex + 1}`,
      type: template.type,
      professional: template.professional,
      date: new Date(
        2024,
        (index + templateIndex) % 12,
        ((templateIndex + 1) * 3 + index) % 28,
      ).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      status: studyStatuses[(index + templateIndex) % studyStatuses.length],
    })),
  }));

const medicalFiles = buildMedicalFiles(mockEmployees);

const isWithinRange = (dateValue, startDate, endDate) => {
  const parsedDate = Date.parse(dateValue);
  if (Number.isNaN(parsedDate)) return true;
  const start = startDate ? Date.parse(startDate) : null;
  const end = endDate ? Date.parse(endDate) : null;
  if (start && parsedDate < start) return false;
  if (end && parsedDate > end) return false;
  return true;
};

const getDaysBetween = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const difference = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return difference > 0 ? difference : null;
};

const formatDisplayDate = (value) => {
  if (!value) return "Sin fecha";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const pathologyCategoryMap = Object.fromEntries(
  pathologyCategories.map((item) => [item.value, item.label]),
);

const formatPathologyCategory = (value) =>
  pathologyCategoryMap[value] || value || "No indicado";

const statusStyles = {
  Apto:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-400/40",
  Observado:
    "bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/40",
  Validado:
    "bg-sky-50 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-400/40",
  Pendiente:
    "bg-rose-50 text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/20 dark:text-rose-100 dark:ring-rose-400/40",
};

const periodPresets = [
  { value: "year", label: "Año en curso" },
  { value: "last-6", label: "Ultimos 6 meses" },
  { value: "custom", label: "Personalizado" },
];

const normalizeReferenceValue = (value = "") => {
  if (!value) return "";
  const segments = value.split("-");
  if (!segments.length) return value;
  const last = segments[segments.length - 1];
  if (/^\d{7,}$/.test(last)) {
    return segments.slice(0, -1).join("-");
  }
  return value;
};

const statusPriority = (status = "") => {
  const normalized = status.toLowerCase();
  if (normalized === "aprobado" || normalized === "validado") return 3;
  if (normalized === "rechazado") return 2;
  if (normalized === "en revision") return 1;
  return 0;
};


const inputClasses =
  "w-full rounded-2xl border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-500 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800";

function InfoBadge({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function SectionCard({ title, description, icon, children }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-300/30 ring-1 ring-slate-100 transition dark:bg-slate-950/70 dark:shadow-black/30 dark:ring-slate-900/40">
      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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

function EyeIcon({ className = "h-4 w-4 text-slate-700" }) {
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

export default function MedicalRecords({ isDark, onToggleTheme }) {
  const [selectedRecord, setSelectedRecord] = useState(medicalFiles[0]);
  const [employeeQuery, setEmployeeQuery] = useState(
    medicalFiles[0].profile.name
  );
  const now = new Date();
  const [periodPreset, setPeriodPreset] = useState("year");
  const [customRange, setCustomRange] = useState({
    start: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  });
  const [documentViewer, setDocumentViewer] = useState({
    isOpen: false,
    certificate: null,
  });

  const certificates = useMemo(() => {
    const profile = selectedRecord.profile;
    const employeeKey = profile.id || profile.name;
    const history = readEmployeeHistory(employeeKey);
    const queue = readValidationQueue().filter(
      (entry) =>
        entry.employeeId === profile.id || entry.employee === profile.name,
    );
    const normalizedHistory = history.map((item) => {
      const reference =
        normalizeReferenceValue(item.reference) ||
        normalizeReferenceValue(item.id);
      const issuedValue = item.issued || item.issueDate || "";
      return {
        id: item.id || `HIS-${profile.id}-${item.issued || Date.now()}`,
        reference: reference || "--",
        title: item.title || "Certificado medico",
        detail: item.notes || "",
        issued: issuedValue,
        issuedLabel: formatDisplayDate(issuedValue),
        status: item.status || "Validado",
        reviewer: item.reviewer || "Equipo Medico",
        institution: item.institution || "No indicado",
        days: item.days || "-",
        pathologyCategory: formatPathologyCategory(item.pathologyCategory),
        cieCode: item.cieCode || "",
        document: item.document || "Documento no disponible",
        documentMeta: item.documentMeta || null,
      };
    });
    const normalizedQueue = queue.map((item) => {
      const reference = normalizeReferenceValue(item.reference);
      const issuedValue =
        item.issueDate ||
        item.startDate ||
        (item.receivedTimestamp
          ? new Date(item.receivedTimestamp).toISOString()
          : item.submitted || "");
      return {
        id: item.reference,
        reference: reference || item.reference || "--",
        title:
          item.certificateType || item.absenceType || "Certificado pendiente",
        detail: item.detailedReason || "",
        issued: issuedValue,
        issuedLabel: formatDisplayDate(issuedValue),
        status: item.status || "Pendiente",
        reviewer: "Pendiente de evaluacion",
        institution: item.institution || "No indicado",
        days:
          item.absenceDays ??
          getDaysBetween(item.startDate, item.endDate) ??
          "-",
        pathologyCategory: formatPathologyCategory(item.pathologyCategory),
        cieCode: item.cieCode || "",
        document: item.certificateFileMeta?.name || "Documento pendiente",
        documentMeta: item.certificateFileMeta || null,
      };
    });

    let startDate = null;
    let endDate = null;
    if (periodPreset === "year") {
      const currentYear = new Date().getFullYear();
      startDate = new Date(currentYear, 0, 1).toISOString();
      endDate = new Date(currentYear, 11, 31).toISOString();
    } else if (periodPreset === "last-6") {
      const end = new Date();
      const start = new Date();
      start.setMonth(end.getMonth() - 6);
      startDate = start.toISOString();
      endDate = end.toISOString();
    } else if (periodPreset === "custom") {
      startDate = customRange.start
        ? new Date(customRange.start).toISOString()
        : null;
      endDate = customRange.end
        ? new Date(customRange.end).toISOString()
        : null;
    }

    const allRecords = [...normalizedQueue, ...normalizedHistory];
    const recordsByReference = new Map();
    allRecords.forEach((record) => {
      const key = record.reference || record.id;
      const existing = recordsByReference.get(key);
      if (!existing) {
        recordsByReference.set(key, record);
      } else if (statusPriority(record.status) > statusPriority(existing.status)) {
        recordsByReference.set(key, record);
      }
    });

    return Array.from(recordsByReference.values()).filter((record) =>
      isWithinRange(record.issued, startDate, endDate),
    );
  }, [selectedRecord, periodPreset, customRange]);
  const recurrenceCount = certificates.length;
  const remainingForDashboard = Math.max(0, 3 - recurrenceCount);
  const formatDaysLabel = (value) => {
    if (!value || value === "-") return "Dias no registrados";
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return `Dias: ${value}`;
    return `Dias otorgados: ${numeric} ${numeric === 1 ? "dia" : "dias"}`;
  };
  const openDocumentViewer = (certificate) => {
    if (!certificate?.documentMeta?.previewUrl) return;
    setDocumentViewer({ isOpen: true, certificate });
  };
  const closeDocumentViewer = () =>
    setDocumentViewer({ isOpen: false, certificate: null });
  const activeDocument = documentViewer.certificate;
  const activePreview = activeDocument?.documentMeta?.previewUrl || "";
  const activeDocumentType = activeDocument?.documentMeta?.type || "";
  const isImageDocument = activeDocumentType.startsWith("image/");
  const isPdfDocument = activeDocumentType === "application/pdf";
  const modalDaysText = (() => {
    if (!activeDocument?.days || activeDocument.days === "-") return "Sin registro";
    const numeric = Number(activeDocument.days);
    if (Number.isNaN(numeric)) return activeDocument.days;
    return `${numeric} ${numeric === 1 ? "dia" : "dias"}`;
  })();

  const handleEmployeeChange = (event) => {
    const value = event.target.value;
    setEmployeeQuery(value);

    const match = medicalFiles.find(
      (record) =>
        record.profile.name.toLowerCase() === value.trim().toLowerCase()
    );

    if (match) {
      setSelectedRecord(match);
    }
  };

  const handleEmployeeBlur = () => {
    const match = medicalFiles.find(
      (record) =>
        record.profile.name.toLowerCase() === employeeQuery.trim().toLowerCase()
    );

    if (!match) {
      setEmployeeQuery(selectedRecord.profile.name);
    }
  };

  const handlePeriodChange = (event) => {
    const value = event.target.value;
    setPeriodPreset(value);
  };

  const handleCustomRangeChange = (field) => (event) => {
    const value = event.target.value;
    setCustomRange((prev) => ({ ...prev, [field]: value }));
  };

  const { profile, studies } = selectedRecord;
  const currentPresetLabel =
    periodPresets.find((preset) => preset.value === periodPreset)?.label ||
    "Periodo seleccionado";
  const certificateSummary = useMemo(() => {
    return certificates.reduce(
      (acc, record) => {
        const key = record.status || "Otros";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {},
    );
  }, [certificates]);

  return (
    <div className="min-h-screen bg-slate-100/60 dark:bg-slate-950">
      <AppHeader
        active="Legajos Medicos"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="flex w-full flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 lg:px-10">
        <SectionCard
          title="Datos del empleado"
          description="Informacion general y contacto prioritario"
          icon={
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
                d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 20.25a8.25 8.25 0 0115 0"
              />
            </svg>
          }
        >
          <div className="mb-6 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Buscar empleado
            </label>
            <input
              type="text"
              list="medical-records-employees"
              placeholder="Escribe el nombre y selecciona una opcion..."
              className={inputClasses}
              value={employeeQuery}
              onChange={handleEmployeeChange}
              onBlur={handleEmployeeBlur}
            />
            <datalist id="medical-records-employees">
              {medicalFiles.map((record) => (
                <option key={record.profile.id} value={record.profile.name} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="flex items-center gap-5">
              <div className="h-28 w-28 overflow-hidden rounded-3xl border border-slate-100 shadow-inner shadow-slate-200/60 dark:border-slate-800 dark:shadow-black/30">
                <img
                  src={profile.avatar}
                  alt={profile.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Legajo #{profile.id}
                </p>
                <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">
                  {profile.name}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  {profile.position} / {profile.department}
                </p>
              </div>
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfoBadge label="Legajo medico" value={profile.medicalRecordId} />
              <InfoBadge label="Antiguedad" value={profile.seniority} />
              <InfoBadge label="Tipo de sangre" value={profile.bloodType} />
              <InfoBadge label="Telefono" value={profile.phone} />
              <InfoBadge label="Correo" value={profile.email} />
            </div>
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Estudios medicos realizados"
            description="Historial de examenes ocupacionales registrados"
            icon={
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
                  d="M4 5h12l4 4v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5v4h4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 13h6M7 17h3" />
              </svg>
            }
          >
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {studies.map((study) => (
                <article
                  key={study.id}
                  className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {study.type}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {study.professional} / {study.date}
                    </p>
                  </div>
                  <span
                    className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[study.status]}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {study.status}
                  </span>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Certificados medicos presentados"
            description="Documentacion asociada y estado de validacion"
            icon={
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
            }
          >
            <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Periodo actual
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {periodPreset === "custom"
                    ? `${customRange.start || "-"} – ${customRange.end || "-"}`
                    : currentPresetLabel}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {certificates.length} certificados en este periodo
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {recurrenceCount >= 3
                    ? "El colaborador ya se refleja en el Panel por recurrente"
                    : `Faltan ${remainingForDashboard} certificados para visualizarse en el Panel de Control`}
                </span>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {Object.entries(certificateSummary).map(([status, count]) => (
                    <span key={status} className="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700">
                      {status}: {count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Seleccionar periodo
                </label>
                <select
                  value={periodPreset}
                  onChange={handlePeriodChange}
                  className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {periodPresets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              {periodPreset === "custom" ? (
                <div className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:gap-4">
                  <label className="flex flex-col gap-1">
                    Desde
                    <input
                      type="date"
                      value={customRange.start}
                      onChange={handleCustomRangeChange("start")}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Hasta
                    <input
                      type="date"
                      value={customRange.end}
                      onChange={handleCustomRangeChange("end")}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </label>
                </div>
              ) : null}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {certificates.length === 0 ? (
                <p className="py-6 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Aun no hay certificados registrados para este colaborador.
                </p>
              ) : (
                certificates.map((certificate) => (
                  <article
                    key={certificate.id}
                    className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {certificate.title}
                      </p>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Referencia: {certificate.reference || "--"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {certificate.institution} /{" "}
                        {certificate.issuedLabel || formatDisplayDate(certificate.issued)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDaysLabel(certificate.days)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Grupo: {certificate.pathologyCategory || "No indicado"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        CIE-10: {certificate.cieCode || "No informado"}
                      </p>
                      {certificate.detail ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {certificate.detail}
                        </p>
                      ) : null}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {certificate.reviewer}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Documento: {certificate.document}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <span
                        className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[certificate.status] || statusStyles.Pendiente}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {certificate.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => openDocumentViewer(certificate)}
                        disabled={!certificate.documentMeta?.previewUrl}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          certificate.documentMeta?.previewUrl
                            ? "border-slate-300 text-slate-700 hover:border-slate-500 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-400"
                            : "cursor-not-allowed border-slate-200 text-slate-400 opacity-70 dark:border-slate-800 dark:text-slate-600"
                        }`}
                      >
                        <EyeIcon className="h-3.5 w-3.5" />
                        Ver certificado
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </main>
      {documentViewer.isOpen && activeDocument ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Certificado digital
                </p>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {activeDocument.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Referencia {activeDocument.reference}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDocumentViewer}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300"
                aria-label="Cerrar vista de certificado"
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
            <div className="mt-4 grid gap-4 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Institucion
                </p>
                <p className="font-semibold">
                  {activeDocument.institution || "No indicado"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Dias otorgados
                </p>
                <p className="font-semibold">{modalDaysText}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Estado
                </p>
                <p className="font-semibold">{activeDocument.status}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Documento
                </p>
                <p className="font-semibold">
                  {activeDocument.documentMeta?.name || activeDocument.document}
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              {activePreview ? (
                isImageDocument ? (
                  <img
                    src={activePreview}
                    alt={`Certificado de ${activeDocument.title}`}
                    className="h-full max-h-[520px] w-full rounded-2xl object-contain"
                  />
                ) : isPdfDocument ? (
                  <iframe
                    src={activePreview}
                    title="Vista previa de certificado"
                    className="h-[520px] w-full rounded-2xl bg-white"
                  />
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    El archivo adjuntado no cuenta con vista previa compatible.
                  </p>
                )
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Este certificado no cuenta con una imagen digital disponible.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDocumentViewer}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"
              >
                Cerrar
              </button>
              {activePreview ? (
                <a
                  href={activePreview}
                  download={
                    activeDocument.documentMeta?.name ||
                    activeDocument.document ||
                    "certificado.pdf"
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-slate-900/30 transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  Descargar
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



