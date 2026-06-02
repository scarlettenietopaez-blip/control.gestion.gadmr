# Dashboard Ejecutivo Alcaldía - versión adaptada a matriz de 6 hojas

Esta versión lee 6 archivos CSV en la carpeta `data`:

- `pac_contratacion.csv`
- `ordenanzas.csv`
- `reuniones.csv`
- `redes_institucionales.csv`
- `eventos.csv`
- `apoyo_institucional.csv`

## Matriz esperada

La matriz Excel debe tener estas hojas:

- `1. PAC`
- `2. Ordenanzas`
- `3. Reuniones`
- `4. Redes Institucionales`
- `5. Eventos`
- `6. Apoyo Institucional`

El dashboard está preparado para leer la estructura nueva de PAC:

`Partida Presupuestaria, Código, Nombre del Proyecto, Dirección Responsable, Objeto de contratación, Tipo de Contratación, Tipo de Presupuesto, Monto Presupuestado, Monto Contratado, Monto Devengado, Etapa Actual, Fecha de inicio, Fecha límite, Observaciones, Evidencias`.

También acepta la estructura anterior de PAC con menos columnas.

## Recomendaciones de llenado

- Para varias direcciones en una misma celda, separar con punto y coma `;`.
- Las fechas pueden estar en formato `dd/mm/aaaa` o `aaaa-mm-dd`.
- Los montos pueden escribirse como números; el dashboard también intenta interpretar formatos con `$`, comas o puntos.
- La columna `Etapa Actual` del PAC se convierte a porcentaje así:
  - No empieza el proceso: 0%
  - Preparatoria: 25%
  - Precontractual: 50%
  - Contractual: 75%
  - Finalizado / recibido / cerrado: 100%

