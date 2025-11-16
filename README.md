# DSS Detección de Riesgos de Salud

Sistema web para registrar ausencias, validar certificados médicos, administrar legajos y visualizar indicadores de salud ocupacional en tiempo real.

## Funcionalidades principales

- **Login por roles** (superAdmin, médico, administrativo, gerente, respRRHH).
- **Registro de ausencias** con búsqueda de empleados, cálculo automático de días, borradores, adjuntos con vista previa y envío para revisión.
- **Validación médica** con filtros, modal clínico, asignación de riesgo, planes preventivos, historial y paginación.
- **Legajos médicos digitales**: búsqueda con autocompletado, certificados por periodo, carga masiva de históricos, vista previa de documentos.
- **Dashboard operativo**: métricas de ausentismo, alertas activas, mapa de calor por sector, tabla de riesgo individual y planes preventivos.
- **Demo seed** (`window.runDemoSeed()`) para poblar la app rápidamente con casos de ejemplo en entorno local.

## Stack

- React + Vite + TailwindCSS
- React Router
- Context API para autenticación simulada
- LocalStorage como datastore temporal
- Firebase - BaaS
- Vitest + Testing Library para pruebas unitarias/integrales

## Configuración

1. Clonar el repositorio.
2. `npm install`
3. Copiar `.env.example` en `.env` y completar las variables (Firebase + credenciales demo).
4. `npm run dev -- --host`
5. Abrí [http://localhost:5173](http://localhost:5173) (desde desktop o móvil en la misma red).

## Scripts útiles

```bash
# levantar en modo desarrollo
npm run dev -- --host

# ejecutar pruebas unitarias
npm test

# ejecutar seed de demo (en la consola del navegador)
window.runDemoSeed()
```

## Demo

1. **Login**
2. **Registrar ausencia**: seleccionar un empleado, completar diagnóstico, adjuntar archivo y enviar para revisión.
3. **Validación médica**: abrir el caso recién creado, visualizar el documento, asignar riesgo, aprobar/rechazar.
4. **Legajos médicos**: buscar al empleado, filtrar por periodo y revisar el historial actualizado.
5. **Dashboard**: verificar cómo se actualizan métricas, badges y tablas (ordenar por “Recibido” para ver los últimos casos).

## Login

![Login](./src/assets/gifs/login.gif)

## Dashboard

![Dashboard](./src/assets/gifs/dashboard.gif)

## Legajo Médico

![Legajo Medico](./src/assets/gifs/legajo-medico.gif)

## Próximos pasos

- Integración con Firebase (Auth + Firestore + Storage).
- Estados sincronizados entre áreas (RRHH ↔ Médico ↔ Dashboard).
- CI/CD y despliegue automático del frontend.

---

Si Necesitás regenerar datos de demo ejecutá `window.runDemoSeed()` en la consola del navegador y se precargan ~20 certificados, historiales y planes preventivos para la presentación.\*\*\*
