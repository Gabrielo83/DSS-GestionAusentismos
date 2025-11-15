import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../App.jsx'
import { MOCK_USERS } from '../../data/mockUsers.js'

const renderWithRole = (initialPath, role = 'superAdmin') => {
  const user = MOCK_USERS.find((item) => item.role === role) ?? MOCK_USERS[0]
  localStorage.setItem('sessionRole', role)
  localStorage.setItem('sessionEmail', user.email)
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

const renderDashboard = (role = 'superAdmin') => renderWithRole('/dashboard', role)

describe('Funcionalidad del Dashboard', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('muestra el header con la navegacion y badge solo en Validacion Medica', () => {
    renderDashboard()

    const navItems = ['Panel de Control', 'Registro Ausencia', 'Validacion Medica', 'Legajos Medicos']
    navItems.forEach((label) => expect(screen.getAllByRole('link', { name: new RegExp(label, 'i') }).length).toBeGreaterThan(0))

    expect(screen.queryAllByLabelText(/Validacion Medica badge/i)).toHaveLength(0)
    expect(screen.queryAllByLabelText(/Panel de Control badge/i)).toHaveLength(0)
    expect(screen.queryAllByLabelText(/Registro Ausencia badge/i)).toHaveLength(0)
    expect(screen.queryAllByLabelText(/Legajos Medicos badge/i)).toHaveLength(0)
  })

  it('permite alternar el tema desde el dashboard y persiste la preferencia', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const darkButtons = screen.getAllByRole('button', { name: /modo oscuro/i })
    await user.click(darkButtons[0])

    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    const lightButtons = screen.getAllByRole('button', { name: /modo claro/i })
    await user.click(lightButtons[0])

    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('muestra las tres tarjetas de metricas principales con sus valores', () => {
    renderDashboard()

    expect(screen.getByText('Tasa de Ausentismo General')).toBeInTheDocument()
    expect(screen.getByText('8.7%')).toBeInTheDocument()

    expect(screen.getByText('Riesgo Promedio del Personal')).toBeInTheDocument()
    expect(screen.getByText('4.6')).toBeInTheDocument()

    expect(screen.getByText('Alertas Activas')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  it('renderiza el mapa de calor con sectores y leyenda', () => {
    renderDashboard()

    const heatmapHeading = screen.getByRole('heading', { name: /Mapa de calor por sector/i })
    expect(heatmapHeading).toBeInTheDocument()

    const heatmapSection = heatmapHeading.closest('article')
    expect(heatmapSection).not.toBeNull()

    const scoped = within(heatmapSection)
    ;['Produccion', 'Mantenimiento', 'Atencion al cliente'].forEach((sector) => {
      expect(scoped.getByText(sector)).toBeInTheDocument()
    })
    expect(scoped.getByText(/Alto \(>= 7\): intervencion inmediata/i)).toBeInTheDocument()
  })

  it('muestra la card de tendencia de riesgo con su descripcion', () => {
    renderDashboard()

    expect(screen.getByRole('heading', { name: /Evolucion del riesgo promedio/i })).toBeInTheDocument()
    expect(screen.getByText(/Tendencia del riesgo promedio del personal en los ultimos 12 meses/i)).toBeInTheDocument()
  })

  it('presenta la tabla de riesgo con encabezados y muestra mensaje sin datos', () => {
    renderDashboard()

    ;['Nombre', 'Sector', 'Patologia mas recurrente', 'Puntuacion de riesgo', 'Nivel', 'Acciones'].forEach((header) => {
      expect(screen.getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeInTheDocument()
    })

    expect(
      screen.getByText(/Aun no hay empleados con riesgo individual/i),
    ).toBeInTheDocument()
  })

  it('abre y cierra el menu de navegacion movil', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const toggleButton = screen.getByRole('button', { name: /Abrir menu/i })
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument()

    await user.click(toggleButton)
    const mobileNav = screen.getByTestId('mobile-nav')
    expect(within(mobileNav).getByText(/Registro Ausencia/i)).toBeInTheDocument()

    await user.click(toggleButton)
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument()
  })

  it('limita la navegacion visible para el rol gerente', () => {
    renderDashboard('gerente')

    expect(screen.getByRole('link', { name: /Panel de Control/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Legajos Medicos/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Registro Ausencia/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Certificados Medicos/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Validacion Medica/i })).toBeNull()
  })

  it('bloquea la ruta de validacion medica para un rol administrativo', async () => {
    renderWithRole('/validacion-medica', 'administrativo')

    await screen.findByRole('heading', { name: /Panel de Control/i })
    expect(screen.queryByRole('heading', { name: /Validacion Medica/i })).not.toBeInTheDocument()
  })
})
