# Verax-financial-hub

Verax Financial: Plataforma de gestión financiera para Estudio Verax. Automatiza la ingesta de facturas ARCA mediante OCR y valida datos en un Staging Area. Centraliza el flujo en una Base Maestra para monitorear estados de pago, calcular días de demora y visualizar KPIs de facturación por emisor y aseguradora en tiempo real.

## Desarrollo Local

1.  Instalar dependencias:
    ```bash
    npm install
    ```
2.  Iniciar servidor de desarrollo:
    ```bash
    npm run dev
    ```

## Despliegue en Vercel

Este proyecto está configurado para desplegarse fácilmente en Vercel.

### Configuración del Proyecto en Vercel
1.  **Framework Preset**: Vite
2.  **Build Command**: `npm run build`
3.  **Output Directory**: `dist`
4.  **Install Command**: `npm install`

### Configuración de Rutas (SPA)
El archivo `vercel.json` incluido en la raíz gestiona las reglas de reescritura para que React Router funcione correctamente (redirige todas las rutas a `index.html`).

## Tecnologías
*   React + Vite
*   TailwindCSS
*   Zustand (State Management)
*   Recharts (KPIs)
*   PDF.js (OCR Local)
