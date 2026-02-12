# Configuración de CORS para Firebase Storage

El error `blocked by CORS policy` ocurre porque el bucket de Storage no tiene permitidos los orígenes locales (`localhost`) o de producción (`vercel.app`).

## Pasos para aplicar la configuración

1.  **Instalar Google Cloud SDK (si no lo tienes):**
    [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
    
    O usar `gsutil` standalone.

2.  **Autenticarse:**
    ```bash
    gcloud auth login
    ```

3.  **Identificar el nombre del bucket:**
    Ve a la consola de Firebase -> Storage. El nombre suele ser `verax-financial-hub.appspot.com` o similar (sin `gs://` al principio en la consola, pero lo necesitas para el comando).

4.  **Aplicar CORS usando el archivo `cors.json` de la raíz:**
    
    ```powershell
    gsutil cors set cors.json gs://<TU-BUCKET-NAME>
    ```
    
    *Ejemplo real:*
    ```powershell
    gsutil cors set cors.json gs://verax-financial-hub.firebasestorage.app
    # O el que corresponda a tu proyecto
    ```

5.  **Verificar:**
    ```powershell
    gsutil cors get gs://<TU-BUCKET-NAME>
    ```

## Orígenes permitidos (definidos en `cors.json`)
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `https://verax-financial-hub.vercel.app` (y subdominios de preview si se agregan wildcards, aunque Google Storage no soporta wildcards parciales en todos los casos, se recomienda listar explícitamente).

> **Nota:** Los cambios pueden tardar unos minutos en propagarse.
