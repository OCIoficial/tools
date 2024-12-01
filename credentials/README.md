# Credentials

TUI para generar PDFs con credenciales a partir de un CSV.

## Instalación

```bash
pip install git+https://github.com/OCIoficial/tools#subdirectory=credentials
```

## Uso básico

Para abrir la TUI

```bash
$ credentials
```

Puedes cargar un CSV desde un archivo o pegando contenido en el terminal. Por ejemplo, puedes copiar
una tabla en Google Sheet y pegarla. Una vez cargado el contenido, puedes eliminar o mover columnas
para ajustarlo al formato esperado.

Si `group by site` está activado se generará un PDF por sede/site.
