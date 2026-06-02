# Dashboard Ejecutivo Alcaldía - versión 3 pestañas

Esta versión mantiene la lectura desde los 6 CSV generados desde la matriz Excel:

- `data/pac_contratacion.csv`
- `data/ordenanzas.csv`
- `data/reuniones.csv`
- `data/redes_institucionales.csv`
- `data/eventos.csv`
- `data/apoyo_institucional.csv`

## Pestañas principales

1. **Resumen general**  
   Indicadores consolidados del municipio, avance por módulo y alertas principales.

2. **Mejores direcciones**  
   Ranking general por Dirección, considerando PAC, ordenanzas, reuniones, redes, eventos, apoyo institucional y actualización.

3. **Buscador por dirección**  
   Selector individual para consultar el resumen de una Dirección: índice, semáforo, desempeño por módulo, alertas y registros asociados.

## Identidad visual

La interfaz usa una imagen más institucional basada en azul y rojo, colores asociados a Riobamba.

## Actualización de datos

La información se actualiza reemplazando los CSV de la carpeta `data`, generados automáticamente desde el archivo Excel institucional mediante el actualizador Node.
