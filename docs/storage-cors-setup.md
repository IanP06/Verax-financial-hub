# Configuración de CORS para Firebase Storage

El error `blocked by CORS policy` impide la subida de archivos desde `localhost` o Vercel. Sigue estos pasos para solucionarlo.

## 1. Prerrequisitos
Tener instalado **Google Cloud SDK** (gcloud) o **gsutil**.

## 2. Identificar el Bucket
Tu bucket de Storage se encuentra en `src/lib/firebase.js` (campo `storageBucket`) o en Firebase Console -> Storage.
Comúnmente es: `gs://<PROJECT_ID>.firebasestorage.app` o `gs://<PROJECT_ID>.appspot.com`.

**Verifica el nombre exacto.**

## 3. Aplicar CORS
Ejecuta uno de los siguientes comandos en la raíz del proyecto (donde está `firebase/cors.storage.json`):

### Opción A: Usando `gsutil` (Recomendado)
```bash
gsutil cors set firebase/cors.storage.json gs://<NOMBRE_DEL_BUCKET>
```

### Opción B: Usando `gcloud`
```bash
gcloud storage buckets update gs://<NOMBRE_DEL_BUCKET> --cors-file=firebase/cors.storage.json
```

## 4. Verificar
Para confirmar que se aplicó:
```bash
gsutil cors get gs://<NOMBRE_DEL_BUCKET>
```

## Origins permitidos
El archivo JSON incluye:
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `https://verax-financial-hub.vercel.app`
