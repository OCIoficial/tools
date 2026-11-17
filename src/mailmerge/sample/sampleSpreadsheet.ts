/**
 * Planilla de ejemplo para probar la interfaz sin Google (solo en desarrollo).
 * Tiene el mismo formato que devuelve la Sheets API: filas de strings, sin celdas vacías al final.
 * Los correos usan dominios reservados (example.com/.org/.net), que nunca llegan a nadie.
 */
export const SAMPLE_SPREADSHEET = {
  title: 'Cobranza marzo 2026 (sample)',
  sheets: {
    // Con encabezado. Casos: mayúsculas/tildes/ñ, RUT en distintos formatos, correo inválido,
    // fila sin correo, HTML y Markdown en una celda, celdas vacías y una fila más ancha que el encabezado.
    Alumnos: [
      ['RUT', 'Nombres', 'Apellido Paterno', 'Apellido Materno', 'Curso', 'Correo Apoderado', 'Monto Pendiente', 'Vencimiento'],
      ['12.345.678-5', 'josé ignacio', 'muñoz', 'pérez', '3° Medio A', 'jimunoz@example.com', '45000', '31-03-2026'],
      ['9876543-3', 'MARÍA PAZ', 'GONZÁLEZ', 'SOTO', '1° Básico B', 'MPAZ.GONZALEZ@EXAMPLE.ORG', '0', '31-03-2026'],
      ['15234567-4', 'Camila', 'Rojas', 'Núñez', '5° Básico A', 'camila.rojas@example', '128500', '15-03-2026'],
      ['20.456.789-1', 'tomás andrés', "o'higgins", 'riquelme', '2° Medio C', '', '32000', '31-03-2026'],
      ['18765432-7', 'Sofía', 'Fernández', 'Araya', '4° Medio B', 'sofia.fernandez@example.net', '75000', '31-03-2026', 'Beca 50%'],
      ['7.654.321-6', 'ÁLVARO', 'DÍAZ', 'CÁCERES', '8° Básico A', ' alvaro.diaz@example.com ', '15000'],
      ['21345678-4', 'Valentina', 'Pérez-Cotapos', 'Ibáñez', 'Kínder', 'vale.perez@example.com; papa.perez@example.com', '90000', '10-03-2026'],
      ['16.987.654-1', 'Benjamín', 'Castro', '', '6° Básico C', 'bcastro@example.org', '<b>60000</b>', '31-03-2026'],
      ['11223344-K', 'josefa', 'silva', 'ñancupil', '1° Medio A', 'josefa.silva@example.com', '*22000*', '31-03-2026'],
      ['19876543-0', 'Matías', 'Vergara', 'Lagos', '7° Básico B', 'matias.vergara@example.net', '54000', '31-03-2026'],
    ],
    // Sin encabezado: para probar las variables por letra (A, B, C...).
    Contactos: [
      ['12345678-5', 'Carolina Muñoz Pérez', 'caro.munoz@example.com', '+56 9 8765 4321'],
      ['9876543-3', 'RODRIGO GONZÁLEZ', 'rgonzalez@example.org', '+56 9 1234 5678'],
      ['15234567-4', 'andrea núñez', 'andrea.nunez@example.net'],
      ['20456789-1', 'Héctor Riquelme', '', '+56 2 2345 6789'],
    ],
  } as Record<string, string[][]>,
}
