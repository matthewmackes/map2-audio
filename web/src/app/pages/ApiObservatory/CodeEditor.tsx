import Editor from '@monaco-editor/react'

export function CodeEditor({
  language,
  value,
  onChange,
  height = 180,
}: {
  language: 'json' | 'javascript' | 'plaintext'
  value: string
  onChange: (value: string) => void
  height?: number
}) {
  return (
    <Editor
      language={language}
      value={value}
      height={height}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
      onChange={(next) => onChange(next ?? '')}
    />
  )
}

export default CodeEditor
