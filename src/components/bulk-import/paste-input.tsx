'use client'

import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, RotateCcw } from 'lucide-react'
import { parseText, parseFile, MAX_ROWS } from '@/lib/bulk-import/pipeline'

interface PasteInputProps {
  onParsed: (rows: string[][]) => void
  onError: (error: string) => void
}

export function PasteInput({ onParsed, onError }: PasteInputProps) {
  const [hasData, setHasData] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleTextChange = useCallback(
    (rawText: string) => {
      if (!rawText.trim()) {
        setHasData(false)
        return
      }
      const { rows, error } = parseText(rawText)
      if (error) {
        onError(error)
        setHasData(false)
        return
      }
      setHasData(true)
      onParsed(rows)
    },
    [onParsed, onError]
  )

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const { rows, error } = await parseFile(file)
      if (error) {
        onError(error)
        return
      }
      setHasData(true)
      onParsed(rows)
      e.target.value = ''
    },
    [onParsed, onError]
  )

  const handleReset = () => {
    setHasData(false)
    if (textareaRef.current) textareaRef.current.value = ''
  }

  // When data is loaded, hide the textarea
  if (hasData) {
    return (
      <button
        onClick={handleReset}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <RotateCcw className="h-3 w-3" />
        Re-paste or upload different data
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <textarea
        ref={textareaRef}
        onChange={(e) => handleTextChange(e.target.value)}
        onPaste={(e) => {
          e.preventDefault()
          const pasted = e.clipboardData.getData('text/plain')
          handleTextChange(pasted)
        }}
        placeholder="Paste rows from your spreadsheet here..."
        className="w-full min-h-[200px] rounded-lg border border-border bg-card p-4 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
      />

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv,.tsv,.txt"
          onChange={handleFileUpload}
          className="hidden"
          ref={fileRef}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          Or upload a CSV file
        </Button>
        <span className="text-xs text-muted-foreground">
          Max {MAX_ROWS} rows per import
        </span>
      </div>
    </div>
  )
}
