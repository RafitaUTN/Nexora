import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2 } from 'lucide-react'
import { queryKeys } from '@/lib/query-keys'
import { useToasts } from '@/lib/toasts'

export function DragDropLayer(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')

    const onDragEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setActive(true)
    }
    const onDragOver = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
    }
    const onDragLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current = 0
      setActive(false)

      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      const paths = files
        .map((file) => window.api.files.getPath(file))
        .filter((path): path is string => Boolean(path && path.trim()))
      if (paths.length === 0) {
        push({ kind: 'warning', title: 'No se pudo leer la ruta del archivo' })
        return
      }

      void window.api.system
        .importPaths(paths)
        .then((result) => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
          void queryClient.invalidateQueries({ queryKey: queryKeys.stats })
          void queryClient.invalidateQueries({ queryKey: queryKeys.sources })
          void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
          if (result.errors.length > 0) {
            push({
              kind: 'warning',
              title: 'Importación parcial',
              body: `${result.indexed} document(s) indexados · ${result.errors.length} error(es)`,
            })
          } else if (result.indexed === 0) {
            push({ kind: 'info', title: 'Sin novedades', body: 'No se indexaron archivos nuevos.' })
          } else {
            push({ kind: 'success', title: 'Importación completada', body: `${result.indexed} document(s) indexados` })
          }
        })
        .catch((error: Error) => push({ kind: 'error', title: 'No se pudo importar', body: error.message }))
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [push, queryClient])

  if (!active) return <></>

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
      <div className="pointer-events-auto flex w-full max-w-lg flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary p-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FilePlus2 className="size-6" />
        </div>
        <p className="text-base font-semibold">Suelta para indexar</p>
        <p className="text-sm text-muted-foreground">
          Acepta archivos y carpetas. Las carpetas se añadirán como fuente y se escanearán.
        </p>
      </div>
    </div>
  )
}
