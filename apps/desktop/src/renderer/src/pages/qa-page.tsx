import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, MessageCircleQuestion, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/lib/toasts'

export function QaPage(): JSX.Element {
  const push = useToasts((s) => s.push)
  const [question, setQuestion] = useState('')

  const qa = useMutation({
    mutationFn: (value: string) => window.api.ai.qa(value),
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo responder', body: error.message }),
  })

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    const value = question.trim()
    if (!value || qa.isPending) return
    qa.mutate(value)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Preguntas y respuestas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La IA responde usando los fragmentos más relevantes de tus documentos (RAG local).
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="¿Cuál es el importe total de las facturas de ACME?"
          rows={3}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!question.trim() || qa.isPending}>
            {qa.isPending ? <Spinner /> : <Send />}
            Preguntar
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-card">
        {qa.isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : qa.data ? (
          <div className="p-4">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Respuesta</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed">{qa.data.answer}</p>
            {qa.data.citations.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Fragmentos consultados ({qa.data.citations.length})
                </p>
                <ul className="mt-2 space-y-1.5">
                  {qa.data.citations.map((citation) => (
                    <li key={citation.documentId}>
                      <Link
                        to={`/documents/${citation.documentId}`}
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <FileText className="size-3.5" />
                        <span className="truncate">{citation.filename}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {citation.score.toFixed(2)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {qa.data.model ? (
              <p className="mt-4 text-xs text-muted-foreground">
                {qa.data.provider} · {qa.data.model}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="p-6 text-center">
            <MessageCircleQuestion className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Pregunta sobre el contenido de tu documentación. Las respuestas citan los documentos utilizados.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
