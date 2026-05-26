# Dashboard Ejecutivo de Gestión Directiva Municipal

Este proyecto es una primera versión del dashboard para seguimiento de directores. Funciona con archivos CSV y puede publicarse en GitHub Pages.

## Estructura del proyecto

```text
/dashboard_alcaldia_github
├── index.html
├── styles.css
├── script.js
└── data
    ├── pac_contratacion.csv
    ├── ordenanzas.csv
    ├── reuniones.csv
    ├── compromisos_alcalde.csv
    └── apoyo_institucional.csv
```

## Cómo actualizar la información

1. Abre los CSV de la carpeta `data`.
2. Reemplaza los datos de ejemplo por la información oficial.
3. Mantén los mismos encabezados de columna.
4. Sube nuevamente los archivos a GitHub.
5. GitHub Pages actualizará el sitio cuando se publiquen los cambios.

## Cómo publicarlo en GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube todos estos archivos a la raíz del repositorio.
3. Entra a `Settings` > `Pages`.
4. En `Build and deployment`, selecciona:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /root
5. Guarda la configuración.
6. Espera unos minutos y abre el enlace que GitHub Pages genere.

## Importante

No subas información sensible si el repositorio o la página serán públicos. Para datos institucionales reales, conviene usar solo información ejecutiva o anonimizada hasta tener un entorno privado.
